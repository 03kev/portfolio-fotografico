const {
    ensureR2Configured,
    getPrivateObject,
    getUploadObject,
    putUploadObject
} = require('../src/services/r2Storage');
const DEFAULTS = require('../src/config/defaults');
const {
    buildPhotoAssetPaths,
    generateMobileImageDerivative,
    normalizePrivateSourcePathForPhotoId
} = require('../src/services/photoDerivatives');
const { readPhotosDB, writePhotosDB } = require('../src/routes/photos.db');
const { readStreamToBuffer } = require('../src/utils/streams');

const args = new Set(process.argv.slice(2));
const applyChanges = args.has('--apply');
const force = args.has('--force');
const verifyAssets = args.has('--verify');
const limitArgument = [...args].find((argument) => argument.startsWith('--limit='));
const limit = limitArgument ? Number.parseInt(limitArgument.slice('--limit='.length), 10) : null;

if (limitArgument && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error('Usa --limit con un intero positivo, ad esempio --limit=10.');
}

async function main() {
    ensureR2Configured();

    const photos = await readPhotosDB();
    const candidates = [];
    for (const photo of photos) {
        const shouldVerifyAsset = verifyAssets && photo.mobileImage;
        let assetIsMissing = false;

        if (shouldVerifyAsset) {
            const photoId = String(photo?.id || '').trim();
            const assetPath = photoId ? buildPhotoAssetPaths(photoId).mobileImagePath : '';
            const asset = assetPath ? await getUploadObject(assetPath) : null;
            asset?.stream?.destroy();
            assetIsMissing = !asset;
        }

        if (force || !photo.mobileImage || assetIsMissing) {
            candidates.push(photo);
        }
    }
    const selected = Number.isFinite(limit) ? candidates.slice(0, limit) : candidates;
    const summary = {
        mode: applyChanges ? 'apply' : 'dry-run',
        verifiedAssets: verifyAssets,
        totalPhotos: photos.length,
        candidates: selected.length,
        generated: 0,
        skipped: photos.length - candidates.length,
        missingSource: 0,
        failed: 0
    };

    if (!applyChanges) {
        console.log(JSON.stringify(summary, null, 2));
        console.log('Dry-run completato. Per scrivere su R2 usa: npm run backfill:mobile -- --apply');
        return;
    }

    for (const photo of selected) {
        const photoId = String(photo?.id || '').trim();
        const sourcePath = normalizePrivateSourcePathForPhotoId(photo?.sourcePath, photoId);

        if (!photoId || !sourcePath) {
            summary.missingSource += 1;
            console.warn(`[skip] photo ${photoId || 'sconosciuta'}: source privata non valida o assente`);
            continue;
        }

        try {
            const source = await getPrivateObject(sourcePath);
            if (!source?.stream) {
                summary.missingSource += 1;
                console.warn(`[skip] photo ${photoId}: source privata non trovata`);
                continue;
            }

            const sourceBuffer = await readStreamToBuffer(source.stream);
            const mobileImage = await generateMobileImageDerivative(sourceBuffer);
            const assetPath = buildPhotoAssetPaths(photoId).mobileImagePath;

            await putUploadObject(assetPath, mobileImage, {
                contentType: 'image/webp',
                cacheControl: DEFAULTS.publicAssetCacheControl
            });

            photo.mobileImage = true;
            // Persist each successful item so an interrupted maintenance run
            // resumes from the next photo instead of reprocessing the catalog.
            await writePhotosDB(photos);
            summary.generated += 1;
            console.log(`[ok] photo ${photoId}`);
        } catch (error) {
            summary.failed += 1;
            console.error(`[error] photo ${photoId}: ${error?.message || error}`);
        }
    }

    console.log(JSON.stringify(summary, null, 2));
    if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
