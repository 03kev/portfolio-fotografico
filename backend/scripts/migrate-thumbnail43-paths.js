#!/usr/bin/env node
/**
 * Migrazione esplicita path thumbnail 4:3.
 *
 * Obiettivo:
 * - Uniformare tutte le thumb 4:3 su /uploads/thumbnails/4x3/photo_<id>.webp
 * - Aggiornare photos.json (campi thumbnail e thumbnail43)
 * - Rigenerare la thumb 4:3 dal source private (crop profile incluso) nel nuovo path
 *
 * Opzioni:
 * - --dry-run: simula la migrazione senza scrivere su storage/metadati
 * - --delete-legacy: elimina la vecchia thumb 4:3 quando il path cambia
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { readMetadataFile, writeMetadataFile } = require('../src/services/metadataStorage');
const { deleteUploadObject, getPrivateObject, getUploadObject, isR2Enabled, putUploadObject } = require('../src/services/r2Storage');
const DEFAULTS = require('../src/config/defaults');
const {
    buildPhotoAssetPaths,
    generatePhotoDerivatives,
    getCropProfilesFromSettings,
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
        const current43Path = normalizeUploadsPath(photo.thumbnail43 || photo.thumbnail);
        const defaultAssets = buildPhotoAssetPaths(photoId, extensionFromPrivatePath(sourcePath));
        const target43Path = defaultAssets.thumbnail43Path;

        const needsMetadataUpdate = photo.thumbnail !== target43Path || photo.thumbnail43 !== target43Path;
        const targetExists = await objectExists(target43Path);
        const needsDerivativeWrite = current43Path !== target43Path || !targetExists;

        if (!needsMetadataUpdate && !needsDerivativeWrite) {
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
            const cropProfiles = getCropProfilesFromSettings(photo.settings);
            const derivatives = await generatePhotoDerivatives(sourceBuffer, cropProfiles);

            await putUploadObject(target43Path, derivatives.thumbnail43, {
                contentType: 'image/webp',
                cacheControl: PUBLIC_ASSET_CACHE_CONTROL
            });

            if (deleteLegacy && current43Path && current43Path !== target43Path) {
                await deleteUploadObject(current43Path);
                deletedLegacy += 1;
            }
        } else {
            if (sourceObject.stream && typeof sourceObject.stream.destroy === 'function') {
                sourceObject.stream.destroy();
            }
            if (deleteLegacy && current43Path && current43Path !== target43Path) {
                wouldDeleteLegacy += 1;
            }
        }

        const updatedPhoto = {
            ...photo,
            thumbnail: target43Path,
            thumbnail43: target43Path,
            derivativesVersion: Date.now()
        };
        photos[i] = updatedPhoto;
        metadataUpdated += 1;
        migrated += 1;
        metadataChanged = true;
    }

    if (!dryRun && metadataChanged) {
        await writeMetadataFile('photos.json', photos);
    }

    console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
    console.log(`Photos total: ${photos.length}`);
    console.log(`Migrated thumbnails 4:3: ${migrated}`);
    console.log(`Metadata updated: ${metadataUpdated}`);
    console.log(`Skipped (already normalized): ${skippedAlreadyNormalized}`);
    console.log(`Skipped (missing sourcePath): ${skippedMissingSourcePath}`);
    console.log(`Skipped (missing source object): ${skippedMissingSourceObject}`);
    console.log(`Legacy deleted: ${deletedLegacy}`);
    console.log(`Legacy would delete (dry-run): ${wouldDeleteLegacy}`);
}

main().catch((error) => {
    console.error('Errore durante la migrazione thumbnail 4:3:', error);
    process.exit(1);
});

