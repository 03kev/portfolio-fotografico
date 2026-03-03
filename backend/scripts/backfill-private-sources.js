#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { readMetadataFile, writeMetadataFile } = require('../src/services/metadataStorage');
const { getUploadObject, isR2Enabled, putPrivateObject } = require('../src/services/r2Storage');

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

async function readStreamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
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

        const publicImagePath = normalizeUploadsPath(photo.image || photo.url || photo.thumbnail);
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
