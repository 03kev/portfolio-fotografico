#!/usr/bin/env node
/**
 * Migrazione esplicita path immagini pubbliche.
 *
 * Obiettivo:
 * - Uniformare image/url su /uploads/photo_<id>.webp
 * - Rigenerare l'immagine pubblica dal source private nello stesso standard
 * - Aggiornare photos.json
 *
 * Opzioni:
 * - --dry-run: simula la migrazione senza scrivere su storage/metadati
 * - --delete-legacy: elimina il vecchio file pubblico image quando il path cambia
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { readMetadataFile, writeMetadataFile } = require('../src/services/metadataStorage');
const {
    deleteUploadObject,
    getPrivateObject,
    getUploadObject,
    isR2Enabled,
    putUploadObject
} = require('../src/services/r2Storage');
const DEFAULTS = require('../src/config/defaults');
const {
    buildPhotoAssetPaths,
    generatePhotoDerivatives,
    normalizePrivatePath,
    normalizeUploadsPath
} = require('../src/services/photoDerivatives');
const { readStreamToBuffer } = require('../src/utils/streams');

const PUBLIC_ASSET_CACHE_CONTROL = DEFAULTS.publicAssetCacheControl;

function extensionFromPrivatePath(privatePath) {
    return path.extname(String(privatePath || '')).replace(/^\./, '').toLowerCase() || 'bin';
}

async function objectExists(uploadPath) {
    const object = await getUploadObject(uploadPath);
    if (!object) return false;
    if (object.stream && typeof object.stream.destroy === 'function') {
        object.stream.destroy();
    }
    return true;
}

async function main() {
    if (!isR2Enabled()) {
        console.error('R2 non configurato. Imposta R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET.');
        process.exit(1);
    }

    const dryRun = process.argv.includes('--dry-run');
    const deleteLegacy = process.argv.includes('--delete-legacy');
    const photos = await readMetadataFile('photos.json', []);

    let migrated = 0;
    let metadataUpdated = 0;
    let skippedAlreadyNormalized = 0;
    let skippedMissingSourcePath = 0;
    let skippedMissingSourceObject = 0;
    let deletedLegacy = 0;
    let wouldDeleteLegacy = 0;
    let metadataChanged = false;

    for (let i = 0; i < photos.length; i += 1) {
        const photo = photos[i];
        const photoId = String(photo?.id || '').trim();
        if (!photoId) continue;

        const sourcePath = normalizePrivatePath(photo.sourcePath);
        const currentImagePath = normalizeUploadsPath(photo.image || photo.url);
        const defaultAssets = buildPhotoAssetPaths(photoId, extensionFromPrivatePath(sourcePath));
        const targetImagePath = defaultAssets.imagePath;

        const needsMetadataUpdate = photo.image !== targetImagePath || photo.url !== targetImagePath;
        const targetExists = await objectExists(targetImagePath);
        const needsImageWrite = currentImagePath !== targetImagePath || !targetExists;

        if (!needsMetadataUpdate && !needsImageWrite) {
            skippedAlreadyNormalized += 1;
            continue;
        }

        if (!sourcePath) {
            skippedMissingSourcePath += 1;
            continue;
        }

        const sourceObject = await getPrivateObject(sourcePath);
        if (!sourceObject || !sourceObject.stream) {
            skippedMissingSourceObject += 1;
            continue;
        }

        if (!dryRun) {
            const sourceBuffer = await readStreamToBuffer(sourceObject.stream);
            const derivatives = await generatePhotoDerivatives(sourceBuffer, null);

            await putUploadObject(targetImagePath, derivatives.image, {
                contentType: 'image/webp',
                cacheControl: PUBLIC_ASSET_CACHE_CONTROL
            });

            if (deleteLegacy && currentImagePath && currentImagePath !== targetImagePath) {
                await deleteUploadObject(currentImagePath);
                deletedLegacy += 1;
            }
        } else {
            if (sourceObject.stream && typeof sourceObject.stream.destroy === 'function') {
                sourceObject.stream.destroy();
            }
            if (deleteLegacy && currentImagePath && currentImagePath !== targetImagePath) {
                wouldDeleteLegacy += 1;
            }
        }

        photos[i] = {
            ...photo,
            image: targetImagePath,
            url: targetImagePath,
            derivativesVersion: Date.now()
        };
        migrated += 1;
        metadataUpdated += 1;
        metadataChanged = true;
    }

    if (!dryRun && metadataChanged) {
        await writeMetadataFile('photos.json', photos);
    }

    console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
    console.log(`Photos total: ${photos.length}`);
    console.log(`Migrated public image paths: ${migrated}`);
    console.log(`Metadata updated: ${metadataUpdated}`);
    console.log(`Skipped (already normalized): ${skippedAlreadyNormalized}`);
    console.log(`Skipped (missing sourcePath): ${skippedMissingSourcePath}`);
    console.log(`Skipped (missing source object): ${skippedMissingSourceObject}`);
    console.log(`Legacy deleted: ${deletedLegacy}`);
    console.log(`Legacy would delete (dry-run): ${wouldDeleteLegacy}`);
}

main().catch((error) => {
    console.error('Errore durante la migrazione path immagini pubbliche:', error);
    process.exit(1);
});

