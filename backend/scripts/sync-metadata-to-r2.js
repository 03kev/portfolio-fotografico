#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { isR2Enabled } = require('../src/services/r2Storage');
const { writeMetadataFile } = require('../src/services/metadataStorage');

const DATA_DIR = path.join(__dirname, '..', 'data');
const METADATA_FILES = ['photos.json', 'series.json'];

async function main() {
  if (!isR2Enabled()) {
    console.error('R2 non configurato. Imposta R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET.');
    process.exit(1);
  }

  for (const file of METADATA_FILES) {
    const fullPath = path.join(DATA_DIR, file);
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
