#!/usr/bin/env node
/**
 * Script di manutenzione: verifica/rigenera derivate pubbliche da source private.
 * Per ogni foto con sourcePath genera image + thumbnail43 + thumbnail11 + social,
 * sovrascrive gli stessi path e aggiorna photos.json.
 *
 * Opzioni:
 * - --verify-only: solo controllo presenza oggetti pubblici, nessuna generazione.
 * - --dry-run: simula la rigenerazione senza scrivere storage/metadati.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { readMetadataFile, writeMetadataFile } = require('../src/services/metadataStorage');
const { getPrivateObject, getUploadObject, isR2Enabled, putUploadObject } = require('../src/services/r2Storage');
const {
    buildPhotoAssetPaths,
    generatePhotoDerivatives,
    getCropProfilesFromSettings,
    normalizePrivatePath,
    normalizeUploadsPath
} = require('../src/services/photoDerivatives');
const { readStreamToBuffer } = require('../src/utils/streams');

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
    const verifyOnly = process.argv.includes('--verify-only');
    const photos = await readMetadataFile('photos.json', []);

    let withSource = 0;
    let missingSourcePath = 0;
    let missingSourceObject = 0;
    let generated = 0;
    let skippedVerifyOnly = 0;
    let metadataUpdated = 0;
    let missingPublic43 = 0;
    let missingPublic11 = 0;
    let missingPublicSocial = 0;
    let missingPublicImage = 0;

    let metadataChanged = false;

    for (let i = 0; i < photos.length; i += 1) {
        const photo = photos[i];
        const photoId = String(photo?.id || '').trim();
        if (!photoId) continue;

        const sourcePath = normalizePrivatePath(photo.sourcePath);
        if (!sourcePath) {
            missingSourcePath += 1;
            continue;
        }
        withSource += 1;

        const defaultAssets = buildPhotoAssetPaths(photoId, path.extname(sourcePath).replace(/^\./, '') || 'bin');
        const imagePath = normalizeUploadsPath(photo.image) || defaultAssets.imagePath;
        const thumbnail43Path = normalizeUploadsPath(photo.thumbnail43 || photo.thumbnail) || defaultAssets.thumbnail43Path;
        const thumbnail11Path = normalizeUploadsPath(photo.thumbnail11) || defaultAssets.thumbnail11Path;
        const socialImagePath = normalizeUploadsPath(photo.socialImage) || defaultAssets.socialImagePath;

        const hasImage = await objectExists(imagePath);
        const has43 = await objectExists(thumbnail43Path);
        const has11 = await objectExists(thumbnail11Path);
        const hasSocial = await objectExists(socialImagePath);

        if (!hasImage) missingPublicImage += 1;
        if (!has43) missingPublic43 += 1;
        if (!has11) missingPublic11 += 1;
        if (!hasSocial) missingPublicSocial += 1;

        if (verifyOnly) {
            skippedVerifyOnly += 1;
            continue;
        }

        const sourceObject = await getPrivateObject(sourcePath);
        if (!sourceObject || !sourceObject.stream) {
            missingSourceObject += 1;
            continue;
        }

        if (!dryRun) {
            const sourceBuffer = await readStreamToBuffer(sourceObject.stream);
            const cropProfiles = getCropProfilesFromSettings(photo.settings);
            const derivatives = await generatePhotoDerivatives(sourceBuffer, cropProfiles);

            await putUploadObject(imagePath, derivatives.image, {
                contentType: 'image/webp',
                cacheControl: 'public, max-age=31536000, immutable'
            });
            await putUploadObject(thumbnail43Path, derivatives.thumbnail43, {
                contentType: 'image/webp',
                cacheControl: 'public, max-age=31536000, immutable'
            });
            await putUploadObject(thumbnail11Path, derivatives.thumbnail11, {
                contentType: 'image/webp',
                cacheControl: 'public, max-age=31536000, immutable'
            });
            await putUploadObject(socialImagePath, derivatives.socialImage, {
                contentType: 'image/jpeg',
                cacheControl: 'public, max-age=31536000, immutable'
            });
        } else if (sourceObject.stream && typeof sourceObject.stream.destroy === 'function') {
            sourceObject.stream.destroy();
        }

        const nextPhoto = {
            ...photo,
            image: imagePath,
            thumbnail: thumbnail43Path,
            thumbnail43: thumbnail43Path,
            thumbnail11: thumbnail11Path,
            socialImage: socialImagePath,
            url: imagePath,
            derivativesVersion: Date.now()
        };

        if (!verifyOnly) {
            photos[i] = nextPhoto;
            metadataChanged = true;
            metadataUpdated += 1;
        }

        generated += 1;
    }

    if (!dryRun && !verifyOnly && metadataChanged) {
        await writeMetadataFile('photos.json', photos);
    }

    console.log(`Mode: ${verifyOnly ? 'verify-only' : dryRun ? 'dry-run' : 'apply'}`);
    console.log(`Photos total: ${photos.length}`);
    console.log(`Photos with sourcePath: ${withSource}`);
    console.log(`Missing sourcePath: ${missingSourcePath}`);
    console.log(`Missing source object: ${missingSourceObject}`);
    console.log(`Processed for generation: ${generated}`);
    console.log(`Metadata updated: ${metadataUpdated}`);
    console.log(`Public missing image: ${missingPublicImage}`);
    console.log(`Public missing thumbnail 4x3: ${missingPublic43}`);
    console.log(`Public missing thumbnail 1x1: ${missingPublic11}`);
    console.log(`Public missing social: ${missingPublicSocial}`);
    console.log(`Verify-only skipped generation: ${skippedVerifyOnly}`);
}

main().catch((error) => {
    console.error('Errore durante la rigenerazione derivate pubbliche:', error);
    process.exit(1);
});
