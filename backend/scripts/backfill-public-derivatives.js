#!/usr/bin/env node
const path = require('path');
const sharp = require('sharp');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { readMetadataFile, writeMetadataFile } = require('../src/services/metadataStorage');
const { getPrivateObject, getUploadObject, isR2Enabled, putUploadObject } = require('../src/services/r2Storage');

function normalizeUploadsPath(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    if (raw.startsWith('/uploads/')) return raw;

    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            const pathname = String(parsed.pathname || '').replace(/^\/+/, '');
            const key = pathname.replace(/^uploads\/+/, '');
            return key ? `/uploads/${key}` : '';
        } catch {
            return '';
        }
    }

    const normalized = raw.replace(/^\/+/, '').replace(/^uploads\/+/, '');
    return normalized ? `/uploads/${normalized}` : '';
}

function normalizePrivatePath(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    if (raw.startsWith('/private/')) return raw;

    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            const pathname = String(parsed.pathname || '').replace(/^\/+/, '');
            const key = pathname.replace(/^private\/+/, '');
            return key ? `/private/${key}` : '';
        } catch {
            return '';
        }
    }

    const normalized = raw.replace(/^\/+/, '').replace(/^private\/+/, '');
    return normalized ? `/private/${normalized}` : '';
}

function buildPhotoAssetPaths(photoId, sourceExtension = 'bin') {
    const baseName = `photo_${photoId}`;
    const cleanSourceExtension = String(sourceExtension || 'bin').replace(/[^a-z0-9]/gi, '') || 'bin';

    return {
        sourcePath: `/private/source/${baseName}.${cleanSourceExtension}`,
        imagePath: `/uploads/${baseName}.webp`,
        thumbnail43Path: `/uploads/thumbnails/4x3/${baseName}.webp`,
        thumbnail11Path: `/uploads/thumbnails/1x1/${baseName}.webp`,
        socialImagePath: `/uploads/social/${baseName}.jpg`
    };
}

async function readStreamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

async function generatePhotoDerivatives(sourceBuffer) {
    const base = sharp(sourceBuffer).rotate();

    const image = await base
        .clone()
        .resize(3840, 2160, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 92, effort: 6 })
        .toBuffer();

    const thumbnail43 = await base
        .clone()
        .resize(400, 300, { fit: 'cover', position: sharp.strategy.attention })
        .webp({ quality: 84, effort: 5 })
        .toBuffer();

    const thumbnail11 = await base
        .clone()
        .resize(400, 400, { fit: 'cover', position: sharp.strategy.attention })
        .webp({ quality: 84, effort: 5 })
        .toBuffer();

    const socialImage = await base
        .clone()
        .resize(1200, 630, { fit: 'cover', position: sharp.strategy.attention })
        .jpeg({ quality: 84, mozjpeg: true, progressive: true })
        .toBuffer();

    return { image, thumbnail43, thumbnail11, socialImage };
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
            const derivatives = await generatePhotoDerivatives(sourceBuffer);

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
