const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const { env } = require('../src/config/env');
const { readMetadataFile } = require('../src/services/metadataStorage');
const {
    checksum,
    checksumBytes,
    isPhotoInventoryObjectKey,
    normalizeReconciliationProvenance,
    reconcileMediaInventories,
    renderReconciliationMarkdown,
    stableStringify
} = require('../src/services/mediaInventoryReconciliation');
const { readR2ObjectInventory } = require('../src/services/r2InventoryReader');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function parseArguments(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--from-r2') options.fromR2 = true;
        else if (argument === '--photos') options.photosPath = argv[++index];
        else if (argument === '--series') options.seriesPath = argv[++index];
        else if (argument === '--output-dir') options.outputDir = argv[++index];
        else if (argument === '--approve-report-checksum') {
            options.approvedReportChecksum = String(argv[++index] || '').trim().toLowerCase();
        } else {
            throw new Error(`Argomento non riconosciuto: ${argument}`);
        }
    }
    const hasFilePair = Boolean(options.photosPath && options.seriesPath);
    if (options.fromR2 === hasFilePair) {
        throw new Error(
            'Specificare esattamente una sorgente: --from-r2 oppure '
            + '--photos <photos.json> --series <series.json>.'
        );
    }
    if (!options.outputDir) {
        throw new Error('--output-dir è obbligatorio e deve essere diverso dalla sorgente.');
    }
    if (
        options.approvedReportChecksum
        && !/^[a-f0-9]{64}$/.test(options.approvedReportChecksum)
    ) {
        throw new Error(
            '--approve-report-checksum deve contenere il reportChecksum logico '
            + 'a 64 caratteri mostrato dal report/CLI.'
        );
    }
    return options;
}

function getConfiguredInventoryProvenance() {
    return normalizeReconciliationProvenance({
        publicBucket: env.r2Bucket,
        privateBucket: env.r2PrivateBucket,
        objectNamespace: env.r2ObjectPrefix
    });
}

async function readJson(filename) {
    return JSON.parse(await fs.readFile(path.resolve(filename), 'utf8'));
}

async function readSnapshot(options) {
    if (options.fromR2) {
        const [photos, series] = await Promise.all([
            readMetadataFile('photos.json', []),
            readMetadataFile('series.json', [])
        ]);
        return { photos, series };
    }
    return {
        photos: await readJson(options.photosPath),
        series: await readJson(options.seriesPath)
    };
}

async function assertOutputDoesNotReplaceSource(options, outputFiles) {
    if (options.fromR2) return;
    const sourceFiles = new Set([
        path.resolve(options.photosPath),
        path.resolve(options.seriesPath)
    ]);
    for (const filename of outputFiles) {
        if (sourceFiles.has(path.resolve(filename))) {
            throw new Error(`Il file di output sostituirebbe lo snapshot sorgente: ${filename}`);
        }
    }
}

async function writeIdempotentFile(filename, content) {
    const normalizedContent = String(content);
    try {
        const existing = await fs.readFile(filename, 'utf8');
        if (existing === normalizedContent) return 'unchanged';
        throw new Error(
            `Output già presente con contenuto diverso: ${filename}. `
            + 'Usare una nuova directory per non sovrascrivere una review precedente.'
        );
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const temporary = `${filename}.tmp-${process.pid}`;
    await fs.writeFile(temporary, normalizedContent, { flag: 'wx' });
    await fs.rename(temporary, filename);
    return 'written';
}

async function writeIdempotentFiles(entries) {
    const pending = [];
    for (const [filename, content] of entries) {
        try {
            const existing = await fs.readFile(filename, 'utf8');
            if (existing !== content) {
                throw new Error(
                    `Output già presente con contenuto diverso: ${filename}. `
                    + 'Usare una nuova directory per non sovrascrivere una review precedente.'
                );
            }
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            pending.push({
                filename,
                temporary: `${filename}.tmp-${process.pid}`,
                content
            });
        }
    }

    try {
        for (const entry of pending) {
            await fs.writeFile(entry.temporary, entry.content, { flag: 'wx' });
        }
        for (const entry of pending) {
            await fs.rename(entry.temporary, entry.filename);
        }
    } catch (error) {
        await Promise.all(pending.map(async (entry) => {
            try {
                await fs.unlink(entry.temporary);
            } catch (cleanupError) {
                if (cleanupError.code !== 'ENOENT') throw cleanupError;
            }
        }));
        throw error;
    }
}

async function writeOutputs(options, snapshot, result) {
    const outputDir = path.resolve(options.outputDir);
    await fs.mkdir(outputDir, { recursive: true });
    const files = {
        sourcePhotos: path.join(outputDir, 'photos.source.backup.json'),
        sourceSeries: path.join(outputDir, 'series.source.backup.json'),
        proposedPhotos: path.join(outputDir, 'photos.reconciled.proposed.json'),
        proposedSeries: path.join(outputDir, 'series.reconciled.proposed.json'),
        reportJson: path.join(outputDir, 'media-inventory-reconciliation.report.json'),
        reportMarkdown: path.join(outputDir, 'media-inventory-reconciliation.report.md'),
        manifest: path.join(outputDir, 'media-inventory-reconciliation.manifest.json')
    };
    if (options.approvedReportChecksum) {
        files.finalPhotos = path.join(outputDir, 'photos.reconciled.json');
        files.finalSeries = path.join(outputDir, 'series.reconciled.json');
    }
    await assertOutputDoesNotReplaceSource(options, Object.values(files));

    if (options.approvedReportChecksum) {
        if (!result.ready) {
            throw new Error('La riconciliazione non è pronta: impossibile generare lo snapshot finale.');
        }
        if (options.approvedReportChecksum !== result.report.reportChecksum) {
            throw new Error(
                'Il reportChecksum logico approvato non coincide con il report corrente '
                + '(snapshot, inventario o provenienza R2 sono cambiati). '
                + 'Rivedere il nuovo report prima di generare lo snapshot finale.'
            );
        }
    }

    const contents = {
        sourcePhotos: `${stableStringify(snapshot.photos, 2)}\n`,
        sourceSeries: `${stableStringify(snapshot.series, 2)}\n`,
        proposedPhotos: `${stableStringify(result.proposal.photos, 2)}\n`,
        proposedSeries: `${stableStringify(result.proposal.series, 2)}\n`,
        reportJson: `${stableStringify(result.report, 2)}\n`,
        reportMarkdown: renderReconciliationMarkdown(result.report)
    };
    if (files.finalPhotos) contents.finalPhotos = contents.proposedPhotos;
    if (files.finalSeries) contents.finalSeries = contents.proposedSeries;
    const manifest = {
        schemaVersion: 2,
        provenance: result.report.provenance,
        reportChecksum: result.report.reportChecksum,
        reportChecksumKind: 'logical-canonical-json',
        sourceSnapshotChecksum: result.report.sourceSnapshotChecksum,
        r2InventoryChecksum: result.report.r2InventoryChecksum,
        proposalChecksum: result.report.proposalChecksum,
        ready: result.ready,
        approved: Boolean(options.approvedReportChecksum),
        files: Object.fromEntries(
            Object.entries(contents).map(([name, content]) => [name, {
                filename: path.basename(files[name]),
                sha256: checksumBytes(content)
            }])
        )
    };
    contents.manifest = `${stableStringify(manifest, 2)}\n`;

    await writeIdempotentFiles(
        Object.entries(contents).map(([name, content]) => [files[name], content])
    );
    return { outputDir, files, manifest };
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const provenance = getConfiguredInventoryProvenance();
    const snapshot = await readSnapshot(options);
    const observedObjects = await readR2ObjectInventory({
        publicBucket: provenance.publicBucket,
        privateBucket: provenance.privateBucket,
        objectNamespace: provenance.objectNamespace,
        shouldHead: isPhotoInventoryObjectKey
    });
    const result = reconcileMediaInventories(snapshot, observedObjects, provenance);
    const output = await writeOutputs(options, snapshot, result);
    console.log(JSON.stringify({
        provenance,
        outputDir: output.outputDir,
        reportChecksum: result.report.reportChecksum,
        reportChecksumKind: 'logical-canonical-json (non SHA-256 byte-per-byte dei file)',
        proposalChecksum: result.report.proposalChecksum,
        summary: result.report.summary,
        ready: result.ready
    }, null, 2));
    if (!result.ready) process.exitCode = 2;
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[media-inventory-reconciliation] errore:', error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    getConfiguredInventoryProvenance,
    parseArguments,
    writeIdempotentFile,
    writeIdempotentFiles,
    writeOutputs
};
