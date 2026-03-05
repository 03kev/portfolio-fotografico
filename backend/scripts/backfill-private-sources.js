#!/usr/bin/env node
/**
 * Script di manutenzione: backfill delle source full-res private.
 * Legge photos.json e, dove manca sourcePath, copia l'asset pubblico esistente
 * nel path privato (/private/source/...) aggiornando i metadati.
 *
 * Opzioni:
 * - --dry-run: non scrive su storage né su photos.json.
 * - --force: rigenera sourcePath anche se già presente.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { readMetadataFile, writeMetadataFile } = require('../src/services/metadataStorage');
const { getUploadObject, isR2Enabled, putPrivateObject } = require('../src/services/r2Storage');
const { normalizeUploadsPath } = require('../src/services/photoDerivatives');
const { readStreamToBuffer } = require('../src/utils/streams');

function getExtensionFromContentType(contentType) {
    const type = String(contentType || '').toLowerCase();
    if (type.includes('image/jpeg')) return 'jpg';
    if (type.includes('image/png')) return 'png';
    if (type.includes('image/webp')) return 'webp';
    if (type.includes('image/avif')) return 'avif';
    if (type.includes('image/gif')) return 'gif';
    return '';
}

function buildSourcePath(photoId, sourcePath, contentType) {
    const extFromPath = path.extname(String(sourcePath || '')).replace(/^\./, '').toLowerCase();
    const extension = extFromPath || getExtensionFromContentType(contentType) || 'bin';
    return `/private/source/photo_${photoId}.${extension}`;
}

async function main() {
    if (!isR2Enabled()) {
        console.error('R2 non configurato. Imposta R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET.');
        process.exit(1);
    }

    const dryRun = process.argv.includes('--dry-run');
    const force = process.argv.includes('--force');
    const photos = await readMetadataFile('photos.json', []);

    let copied = 0;
    let updated = 0;
    let skippedAlreadyPresent = 0;
    let skippedMissingImage = 0;
    let skippedMissingObject = 0;

    for (const photo of photos) {
        const photoId = String(photo?.id || '').trim();
        if (!photoId) continue;

        if (photo.sourcePath && !force) {
            skippedAlreadyPresent += 1;
            continue;
        }

        const publicImagePath = normalizeUploadsPath(photo.image);
        if (!publicImagePath) {
            skippedMissingImage += 1;
            continue;
        }

        const object = await getUploadObject(publicImagePath);
        if (!object || !object.stream) {
            skippedMissingObject += 1;
            continue;
        }

        const sourcePath = buildSourcePath(photoId, publicImagePath, object.contentType);

        if (!dryRun) {
            const buffer = await readStreamToBuffer(object.stream);
            await putPrivateObject(sourcePath, buffer, {
                contentType: object.contentType || 'application/octet-stream',
                cacheControl: 'private, no-store'
            });
            copied += 1;
        }

        photo.sourcePath = sourcePath;
        photo.sourceContentType = object.contentType || photo.sourceContentType || '';
        updated += 1;
    }

    if (!dryRun && updated > 0) {
        await writeMetadataFile('photos.json', photos);
    }

    console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
    console.log(`Photos total: ${photos.length}`);
    console.log(`Updated metadata: ${updated}`);
    console.log(`Copied private sources: ${copied}`);
    console.log(`Skipped (already sourcePath): ${skippedAlreadyPresent}`);
    console.log(`Skipped (missing image path): ${skippedMissingImage}`);
    console.log(`Skipped (missing public object): ${skippedMissingObject}`);
}

main().catch((error) => {
    console.error('Errore durante il backfill source private:', error);
    process.exit(1);
});
