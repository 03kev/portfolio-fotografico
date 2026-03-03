#!/usr/bin/env node
/**
 * Script di sync metadati locali -> R2.
 * Legge photos.json/series.json dal data store locale e li pubblica su R2
 * tramite metadataStorage (scrittura canonicale del backend).
 */
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { isR2Enabled } = require('../src/services/r2Storage');
const { ensureDataFile } = require('../src/config/storage');
const { writeMetadataFile } = require('../src/services/metadataStorage');

const METADATA_FILES = ['photos.json', 'series.json'];

async function main() {
    if (!isR2Enabled()) {
        console.error('R2 non configurato. Imposta R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET.');
        process.exit(1);
    }

    for (const file of METADATA_FILES) {
        const fullPath = await ensureDataFile(file);
        const content = await fs.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(content);
        await writeMetadataFile(file, parsed);
        console.log(`Sincronizzato: ${file}`);
    }

    console.log('Metadati sincronizzati su R2 con successo.');
}

main().catch((error) => {
    console.error('Errore durante la sincronizzazione metadati su R2:', error);
    process.exit(1);
});
