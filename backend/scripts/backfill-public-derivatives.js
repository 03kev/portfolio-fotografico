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

function clamp01(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(1, numeric));
}

function clampScale(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(1, Math.min(5, numeric));
}

function normalizeCropProfile(rawProfile) {
    if (!rawProfile || typeof rawProfile !== 'object') return null;
    const x = clamp01(rawProfile.x);
    const y = clamp01(rawProfile.y);
    const scale = clampScale(rawProfile.scale);
    if (x === null || y === null || scale === null) return null;
    return { x, y, scale };
}

function getCropProfilesFromSettings(settings) {
    if (typeof settings === 'string') {
        try {
            return getCropProfilesFromSettings(JSON.parse(settings));
        } catch {
            return null;
        }
    }
    if (!settings || typeof settings !== 'object') return null;
    const rawProfiles = settings.cropProfiles;
    if (!rawProfiles || typeof rawProfiles !== 'object') return null;

    const profiles = {};
    const r43 = normalizeCropProfile(rawProfiles.r43);
    const r11 = normalizeCropProfile(rawProfiles.r11);
    const social = normalizeCropProfile(rawProfiles.social);

    if (r43) profiles.r43 = r43;
    if (r11) profiles.r11 = r11;
    if (social) profiles.social = social;

    return Object.keys(profiles).length > 0 ? profiles : null;
}

function computeCoverCropRegion(sourceWidth, sourceHeight, targetWidth, targetHeight, cropProfile = null) {
    const srcW = Number(sourceWidth);
    const srcH = Number(sourceHeight);
    const dstW = Number(targetWidth);
    const dstH = Number(targetHeight);

    if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW <= 0 || srcH <= 0) {
        return null;
    }
    if (!Number.isFinite(dstW) || !Number.isFinite(dstH) || dstW <= 0 || dstH <= 0) {
        return null;
    }

    const targetRatio = dstW / dstH;
    const sourceRatio = srcW / srcH;

    let cropWidth = srcW;
    let cropHeight = srcH;

    if (sourceRatio > targetRatio) {
        cropWidth = Math.round(srcH * targetRatio);
    } else if (sourceRatio < targetRatio) {
        cropHeight = Math.round(srcW / targetRatio);
    }

    cropWidth = Math.max(1, Math.min(srcW, cropWidth));
    cropHeight = Math.max(1, Math.min(srcH, cropHeight));

    const normalizedProfile = normalizeCropProfile(cropProfile);
    const scale = normalizedProfile?.scale || 1;
    if (scale > 1) {
        cropWidth = Math.max(1, Math.min(srcW, Math.round(cropWidth / scale)));
        cropHeight = Math.max(1, Math.min(srcH, Math.round(cropHeight / scale)));
    }

    const focusX = (normalizedProfile?.x ?? 0.5) * srcW;
    const focusY = (normalizedProfile?.y ?? 0.5) * srcH;
    const maxLeft = srcW - cropWidth;
    const maxTop = srcH - cropHeight;

    let left = Math.round(focusX - cropWidth / 2);
    let top = Math.round(focusY - cropHeight / 2);
    left = Math.max(0, Math.min(maxLeft, left));
    top = Math.max(0, Math.min(maxTop, top));

    return {
        left,
        top,
        width: cropWidth,
        height: cropHeight
    };
}

async function readStreamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

async function generatePhotoDerivatives(sourceBuffer, cropProfiles = null) {
    const base = sharp(sourceBuffer).rotate();
    const metadata = await base.metadata();

    const orientation = Number(metadata.orientation || 1);
    const rawWidth = Number(metadata.width || 0);
    const rawHeight = Number(metadata.height || 0);
    const sourceWidth = [5, 6, 7, 8].includes(orientation) ? rawHeight : rawWidth;
    const sourceHeight = [5, 6, 7, 8].includes(orientation) ? rawWidth : rawHeight;
    const normalizedProfiles = cropProfiles && typeof cropProfiles === 'object' ? cropProfiles : null;

    const image = await base
        .clone()
        .resize(3840, 2160, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 92, effort: 6 })
        .toBuffer();

    const createCoverDerivative = async (targetWidth, targetHeight, profile, outputBuilder) => {
        if (!profile) {
            return outputBuilder(
                base.clone().resize(targetWidth, targetHeight, { fit: 'cover', position: sharp.strategy.attention })
            );
        }

        const cropRegion = computeCoverCropRegion(
            sourceWidth,
            sourceHeight,
            targetWidth,
            targetHeight,
            profile
        );
        if (!cropRegion) {
            return outputBuilder(
                base.clone().resize(targetWidth, targetHeight, { fit: 'cover', position: sharp.strategy.attention })
            );
        }

        return outputBuilder(
            base
                .clone()
                .extract(cropRegion)
                .resize(targetWidth, targetHeight, { fit: 'fill' })
        );
    };

    const thumbnail43 = await createCoverDerivative(400, 300, normalizeCropProfile(normalizedProfiles?.r43), (pipeline) => (
        pipeline.webp({ quality: 84, effort: 5 }).toBuffer()
    ));

    const thumbnail11 = await createCoverDerivative(400, 400, normalizeCropProfile(normalizedProfiles?.r11), (pipeline) => (
        pipeline.webp({ quality: 84, effort: 5 }).toBuffer()
    ));

    const socialImage = await createCoverDerivative(1200, 630, normalizeCropProfile(normalizedProfiles?.social), (pipeline) => (
        pipeline.jpeg({ quality: 84, mozjpeg: true, progressive: true }).toBuffer()
    ));

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
