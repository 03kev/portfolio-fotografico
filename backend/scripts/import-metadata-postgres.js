const fs = require('node:fs/promises');
const path = require('node:path');
const {
    analyzeMetadataSnapshot,
    importMetadataSnapshot,
    verifyImportedSnapshot
} = require('../src/services/metadataMigration');

function parseArguments(argv) {
    const options = {
        dryRun: false,
        verifyOnly: false
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--dry-run') options.dryRun = true;
        else if (argument === '--verify-only') options.verifyOnly = true;
        else if (argument === '--photos') options.photosPath = argv[++index];
        else if (argument === '--series') options.seriesPath = argv[++index];
        else throw new Error(`Argomento non riconosciuto: ${argument}`);
    }
    if (!options.photosPath || !options.seriesPath) {
        throw new Error(
            'Uso: --photos <photos.json> --series <series.json> [--dry-run | --verify-only]'
        );
    }
    return options;
}

async function readJson(filename) {
    return JSON.parse(await fs.readFile(path.resolve(filename), 'utf8'));
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
    const snapshot = {
        photos: await readJson(options.photosPath),
        series: await readJson(options.seriesPath)
    };
    const report = analyzeMetadataSnapshot(snapshot);
    printReport(report);
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
        process.env.DATABASE_DIRECT_URL
        || process.env.DATABASE_URL
        || ''
    ).trim();
    if (!databaseUrl) {
        throw new Error('DATABASE_DIRECT_URL o DATABASE_URL non impostata.');
    }
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    try {
        if (!options.verifyOnly) {
            const result = await importMetadataSnapshot(pool, snapshot);
            console.log(`[import] completato: ${result.report.checksum}`);
        }
        const verification = await verifyImportedSnapshot(pool, snapshot);
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
