const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const {
    checksumBytes,
    stableStringify
} = require('../src/services/mediaInventoryReconciliation');
const {
    exportMetadataRollbackSnapshot,
    renderMetadataRollbackReport
} = require('../src/services/metadataRollbackExport');
const {
    normalizePostgresConnectionString
} = require('../src/utils/postgresConnectionString');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const OUTPUT_FILENAMES = Object.freeze({
    photos: 'photos.json',
    series: 'series.json',
    reportJson: 'metadata-rollback-export.report.json',
    reportMarkdown: 'metadata-rollback-export.report.md',
    manifest: 'metadata-rollback-export.manifest.json'
});

function parseBoolean(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    return null;
}

function parseArguments(argv) {
    const options = {
        outputDir: '',
        objectNamespace: null,
        expectedDatabaseName: '',
        expectedNeonBranchId: ''
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--output-dir') options.outputDir = argv[++index] || '';
        else if (argument === '--object-namespace') options.objectNamespace = argv[++index];
        else if (argument === '--expected-database-name') options.expectedDatabaseName = argv[++index] || '';
        else if (argument === '--expected-neon-branch-id') options.expectedNeonBranchId = argv[++index] || '';
        else throw new Error(`Argomento non riconosciuto: ${argument}`);
    }
    if (!String(options.outputDir || '').trim()) {
        throw new Error('--output-dir è obbligatorio e deve indicare una directory locale esplicita.');
    }
    if (options.objectNamespace === null || options.objectNamespace === undefined) {
        throw new Error('--object-namespace è obbligatorio; usare "root" per il namespace vuoto.');
    }
    if (!String(options.expectedDatabaseName || '').trim()) {
        throw new Error('--expected-database-name è obbligatorio.');
    }
    if (!String(options.expectedNeonBranchId || '').trim()) {
        throw new Error('--expected-neon-branch-id è obbligatorio.');
    }
    return {
        outputDir: path.resolve(options.outputDir),
        objectNamespace: options.objectNamespace === 'root' ? '' : options.objectNamespace,
        expectedDatabaseName: String(options.expectedDatabaseName).trim(),
        expectedNeonBranchId: String(options.expectedNeonBranchId).trim()
    };
}

async function writeIdempotentFiles(entries) {
    const pending = [];
    for (const [filename, content] of entries) {
        try {
            const existing = await fs.readFile(filename, 'utf8');
            if (existing !== content) {
                throw new Error(
                    `Output già presente con contenuto diverso: ${filename}. `
                    + 'Usare una directory nuova per non sovrascrivere un export revisionato.'
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
        await Promise.all(pending.map((entry) => fs.unlink(entry.temporary).catch(() => {})));
        throw error;
    }
}

function buildContents(result) {
    const photos = `${stableStringify(result.snapshot.photos, 2)}\n`;
    const series = `${stableStringify(result.snapshot.series, 2)}\n`;
    const reportJson = `${stableStringify(result.report, 2)}\n`;
    const reportMarkdown = renderMetadataRollbackReport(result.report);
    const dataFiles = { photos, series, reportJson, reportMarkdown };
    const manifest = {
        schemaVersion: 1,
        kind: 'postgres-metadata-rollback-export',
        snapshotChecksum: result.report.snapshotChecksum,
        reportChecksum: result.report.reportChecksum,
        checksumKind: 'sha256-canonical-json',
        provenance: result.report.provenance,
        safety: result.report.safety,
        files: Object.fromEntries(
            Object.entries(dataFiles).map(([key, content]) => [key, {
                filename: OUTPUT_FILENAMES[key],
                sha256: checksumBytes(content)
            }])
        )
    };
    return {
        ...dataFiles,
        manifest: `${stableStringify(manifest, 2)}\n`
    };
}

async function exportToDirectory(pool, options, metadataWritesEnabled) {
    const result = await exportMetadataRollbackSnapshot(pool, {
        metadataWritesEnabled,
        objectNamespace: options.objectNamespace,
        expectedDatabaseName: options.expectedDatabaseName,
        expectedNeonBranchId: options.expectedNeonBranchId
    });
    const contents = buildContents(result);
    const filenames = Object.fromEntries(
        Object.entries(OUTPUT_FILENAMES).map(([key, filename]) => (
            [key, path.join(options.outputDir, filename)]
        ))
    );
    // Deliberately create the directory only after every database-side gate,
    // including identity, has passed.
    await fs.mkdir(options.outputDir, { recursive: true });
    await writeIdempotentFiles(
        Object.entries(contents).map(([key, content]) => [filenames[key], content])
    );
    return { result, filenames };
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const writesEnabled = parseBoolean(process.env.METADATA_WRITES_ENABLED);
    const databaseUrl = String(
        process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || ''
    ).trim();
    if (!databaseUrl) {
        throw new Error('DATABASE_URL_UNPOOLED o DATABASE_URL non impostata.');
    }
    if (writesEnabled === null) {
        throw new Error('METADATA_WRITES_ENABLED deve essere impostato esplicitamente a false.');
    }

    const pool = new Pool({
        connectionString: normalizePostgresConnectionString(databaseUrl),
        max: 1,
        application_name: 'portfolio-metadata-rollback-export'
    });
    try {
        const { result } = await exportToDirectory(pool, options, writesEnabled);
        console.log(JSON.stringify({
            outputDir: options.outputDir,
            provenance: result.report.provenance,
            counts: result.report.counts,
            snapshotChecksum: result.report.snapshotChecksum,
            reportChecksum: result.report.reportChecksum
        }, null, 2));
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`[metadata-export] ${error.code || 'FAILED'}: ${error.message}`);
        if (error.details) console.error(JSON.stringify(error.details, null, 2));
        process.exitCode = 1;
    });
}

module.exports = {
    buildContents,
    exportToDirectory,
    main,
    parseArguments,
    writeIdempotentFiles
};
