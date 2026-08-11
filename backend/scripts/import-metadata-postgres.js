const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const {
    analyzeMetadataSnapshot,
    assertMetadataCutoverReady,
    importMetadataSnapshot,
    verifyImportedSnapshot
} = require('../src/services/metadataMigration');
const {
    normalizePostgresConnectionString
} = require('../src/utils/postgresConnectionString');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function parseArguments(argv) {
    const options = {
        dryRun: false,
        verifyOnly: false,
        cutoverPreflight: false,
        fromR2: false
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--dry-run') options.dryRun = true;
        else if (argument === '--verify-only') options.verifyOnly = true;
        else if (argument === '--cutover-preflight') options.cutoverPreflight = true;
        else if (argument === '--from-r2') options.fromR2 = true;
        else if (argument === '--photos') options.photosPath = argv[++index];
        else if (argument === '--series') options.seriesPath = argv[++index];
        else throw new Error(`Argomento non riconosciuto: ${argument}`);
    }
    const hasFilePair = Boolean(options.photosPath && options.seriesPath);
    if (!options.fromR2 && !hasFilePair) {
        throw new Error(
            'Uso: (--from-r2 | --photos <photos.json> --series <series.json>) '
            + '[--dry-run | --verify-only | --cutover-preflight]'
        );
    }
    if (options.fromR2 && (options.photosPath || options.seriesPath)) {
        throw new Error('--from-r2 non può essere combinato con --photos o --series.');
    }
    if (!options.fromR2 && !hasFilePair) {
        throw new Error('--photos e --series devono essere specificati insieme.');
    }
    const executionModes = [
        options.dryRun,
        options.verifyOnly,
        options.cutoverPreflight
    ].filter(Boolean).length;
    if (executionModes > 1) {
        throw new Error(
            '--dry-run, --verify-only e --cutover-preflight sono modalità alternative.'
        );
    }
    return options;
}

async function readJson(filename) {
    return JSON.parse(await fs.readFile(path.resolve(filename), 'utf8'));
}

async function readSnapshot(options) {
    if (!options.fromR2) {
        return {
            photos: await readJson(options.photosPath),
            series: await readJson(options.seriesPath)
        };
    }

    const { readMetadataFile } = require('../src/services/metadataStorage');
    const [photos, series] = await Promise.all([
        readMetadataFile('photos.json', []),
        readMetadataFile('series.json', [])
    ]);
    return { photos, series };
}

function printReport(report) {
    console.log(JSON.stringify({
        counts: report.counts,
        checksum: report.checksum,
        errors: report.errors,
        warnings: report.warnings,
        info: report.info
    }, null, 2));
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const snapshot = await readSnapshot(options);
    const report = analyzeMetadataSnapshot(snapshot);
    printReport(report);
    if (options.cutoverPreflight) {
        assertMetadataCutoverReady(report);
        console.log('[cutover-preflight] pronto: missingAssetInventories=0, errors=0');
        return;
    }
    if (report.errors.length > 0) {
        process.exitCode = 1;
        return;
    }
    if (options.dryRun) return;

    let Pool;
    try {
        ({ Pool } = require('pg'));
    } catch {
        throw new Error('Dipendenza "pg" mancante. Esegui npm install nel backend.');
    }
    const databaseUrl = String(
        process.env.DATABASE_URL_UNPOOLED
        || process.env.DATABASE_URL
        || ''
    ).trim();
    if (!databaseUrl) {
        throw new Error('DATABASE_URL_UNPOOLED o DATABASE_URL non impostata.');
    }
    const pool = new Pool({
        connectionString: normalizePostgresConnectionString(databaseUrl),
        max: 1
    });
    try {
        const objectNamespace = process.env.R2_OBJECT_PREFIX || '';
        if (!options.verifyOnly) {
            const result = await importMetadataSnapshot(pool, snapshot, {
                objectNamespace
            });
            console.log(`[import] completato: ${result.report.checksum}`);
        }
        const verification = await verifyImportedSnapshot(pool, snapshot, {
            objectNamespace
        });
        console.log(JSON.stringify({ verification }, null, 2));
        if (!verification.valid) process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error('[metadata-import] errore:', error.message);
    process.exitCode = 1;
});
