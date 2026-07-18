const {
    ensureR2Configured,
    getUploadObject,
    headUploadObject,
    putUploadObject
} = require('../src/services/r2Storage');
const { normalizeUploadPathToAbsoluteUrl, purgeUrls } = require('../src/services/cloudflareCache');
const DEFAULTS = require('../src/config/defaults');
const { buildPhotoAssetPaths } = require('../src/services/photoDerivatives');
const { readPhotosDB } = require('../src/routes/photos.db');
const { readStreamToBuffer } = require('../src/utils/streams');

const args = new Set(process.argv.slice(2));
const applyChanges = args.has('--apply');
const verifyCacheControl = args.has('--verify');
const limitArgument = [...args].find((argument) => argument.startsWith('--limit='));
const limit = limitArgument ? Number.parseInt(limitArgument.slice('--limit='.length), 10) : null;
const concurrencyArgument = [...args].find((argument) => argument.startsWith('--concurrency='));
const concurrency = concurrencyArgument ? Number.parseInt(concurrencyArgument.slice('--concurrency='.length), 10) : 8;

if (limitArgument && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error('Usa --limit con un intero positivo, ad esempio --limit=10.');
}

if (!Number.isFinite(concurrency) || concurrency <= 0 || concurrency > 12) {
    throw new Error('Usa --concurrency con un intero tra 1 e 12, ad esempio --concurrency=8.');
}

function getPublicAssets(photo) {
    const photoId = String(photo?.id || '').trim();
    if (!photoId) return [];

    const paths = buildPhotoAssetPaths(photoId);
    return [
        { path: paths.imagePath, contentType: 'image/webp' },
        ...(photo.mobileImage ? [{ path: paths.mobileImagePath, contentType: 'image/webp' }] : []),
        { path: paths.thumbnail43Path, contentType: 'image/webp' },
        { path: paths.thumbnail11Path, contentType: 'image/webp' },
        { path: paths.socialImagePath, contentType: 'image/jpeg' }
    ];
}

async function forEachWithConcurrency(items, worker) {
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (nextIndex < items.length) {
            const item = items[nextIndex];
            nextIndex += 1;
            await worker(item);
        }
    });
    await Promise.all(workers);
}

async function main() {
    ensureR2Configured();

    const photos = await readPhotosDB();
    const selectedPhotos = Number.isFinite(limit) ? photos.slice(0, limit) : photos;
    const assets = selectedPhotos.flatMap(getPublicAssets);
    const summary = {
        mode: applyChanges ? 'apply' : 'dry-run',
        verifyCacheControl,
        totalPhotos: photos.length,
        selectedPhotos: selectedPhotos.length,
        assets: assets.length,
        concurrency,
        refreshed: 0,
        missing: 0,
        failed: 0,
        outdated: 0,
        cacheControl: DEFAULTS.publicAssetCacheControl
    };

    if (!applyChanges) {
        if (verifyCacheControl) {
            await forEachWithConcurrency(assets, async (asset) => {
                try {
                    const existing = await headUploadObject(asset.path);
                    if (!existing) {
                        summary.missing += 1;
                    } else if (String(existing.cacheControl || '').trim() !== DEFAULTS.publicAssetCacheControl) {
                        summary.outdated += 1;
                        console.warn(`[stale] cache ${asset.path}: ${existing.cacheControl || 'assente'}`);
                    }
                } catch (error) {
                    summary.failed += 1;
                    console.error(`[error] ${asset.path}: ${error?.message || error}`);
                }
            });
        }
        console.log(JSON.stringify(summary, null, 2));
        if (!verifyCacheControl) {
            console.log('Dry-run completato. Per scrivere su R2 usa: npm run refresh:asset-cache -- --apply');
        }
        if (summary.failed > 0 || summary.missing > 0 || summary.outdated > 0) process.exitCode = 1;
        return;
    }

    const refreshedPaths = [];
    await forEachWithConcurrency(assets, async (asset) => {
        try {
            const existing = await getUploadObject(asset.path);
            if (!existing?.stream) {
                summary.missing += 1;
                console.warn(`[skip] asset non trovato: ${asset.path}`);
                return;
            }

            const buffer = await readStreamToBuffer(existing.stream);
            await putUploadObject(asset.path, buffer, {
                contentType: existing.contentType || asset.contentType,
                cacheControl: DEFAULTS.publicAssetCacheControl
            });
            refreshedPaths.push(asset.path);
            summary.refreshed += 1;
            if (summary.refreshed % 25 === 0 || summary.refreshed === assets.length) {
                console.log(`[progress] ${summary.refreshed}/${assets.length}`);
            }
        } catch (error) {
            summary.failed += 1;
            console.error(`[error] ${asset.path}: ${error?.message || error}`);
        }
    });

    const urls = refreshedPaths.map(normalizeUploadPathToAbsoluteUrl).filter(Boolean);
    try {
        summary.purge = await purgeUrls(urls, { reason: 'refresh_public_asset_cache' });
    } catch (error) {
        summary.purge = { success: false, error: error?.message || String(error) };
        console.error(`[warn] purge CDN fallita: ${summary.purge.error}`);
    }

    console.log(JSON.stringify(summary, null, 2));
    if (summary.failed > 0 || summary.missing > 0) process.exitCode = 1;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
