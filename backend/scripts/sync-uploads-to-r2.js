#!/usr/bin/env node
/**
 * Script di sync assets upload locali -> R2 pubblico.
 * Scansiona la cartella uploads locale (o fallback legacy) e carica i file
 * mantenendo la stessa struttura path sotto /uploads/.
 */
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { isR2Enabled, putUploadObject } = require('../src/services/r2Storage');
const { UPLOADS_DIR } = require('../src/config/storage');
const LEGACY_UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function getContentTypeByExtension(filename) {
    const extension = path.extname(filename).toLowerCase();

    if (extension === '.webp') return 'image/webp';
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
    if (extension === '.png') return 'image/png';
    if (extension === '.gif') return 'image/gif';
    if (extension === '.avif') return 'image/avif';
    if (extension === '.svg') return 'image/svg+xml';

    return 'application/octet-stream';
}

async function collectFiles(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (entry.name === '.DS_Store') continue;

        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...(await collectFiles(fullPath)));
        } else if (entry.isFile()) {
            files.push(fullPath);
        }
    }

    return files;
}

async function main() {
    if (!isR2Enabled()) {
        console.error('R2 non configurato. Imposta R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET.');
        process.exit(1);
    }

    let sourceUploadsDir = UPLOADS_DIR;
    try {
        await fs.access(sourceUploadsDir);
    } catch (error) {
        sourceUploadsDir = LEGACY_UPLOADS_DIR;
    }

    let files = [];
    try {
        files = await collectFiles(sourceUploadsDir);
    } catch (error) {
        console.error('Cartella uploads non trovata o non accessibile:', sourceUploadsDir);
        process.exit(1);
    }

    if (files.length === 0) {
        console.log('Nessun file da sincronizzare.');
        return;
    }

    console.log(`Sincronizzazione su R2 avviata (${files.length} file)...`);

    let uploadedCount = 0;

    for (const fullPath of files) {
        const relativePath = path.relative(sourceUploadsDir, fullPath).replaceAll(path.sep, '/');
        const uploadPath = `/uploads/${relativePath}`;
        const contentType = getContentTypeByExtension(relativePath);
        const buffer = await fs.readFile(fullPath);

        await putUploadObject(uploadPath, buffer, { contentType });
        uploadedCount += 1;

        console.log(`[${uploadedCount}/${files.length}] ${uploadPath}`);
    }

    console.log('Sincronizzazione completata con successo.');
}

main().catch((error) => {
    console.error('Errore durante la sincronizzazione R2:', error);
    process.exit(1);
});
