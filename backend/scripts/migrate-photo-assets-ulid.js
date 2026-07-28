const crypto = require('node:crypto');
const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = require('pg');
const DEFAULTS = require('../src/config/defaults');
const {
    PostgresPortfolioRepository
} = require('../src/repositories/PostgresPortfolioRepository');
const {
    buildPhotoAssetPaths
} = require('../src/services/photoDerivatives');
const {
    deletePrivateObject,
    deleteUploadObject,
    getPrivateObject,
    getUploadObject,
    headPrivateObject,
    headUploadObject,
    putPrivateObject,
    putUploadObject
} = require('../src/services/r2Storage');
const {
    createMediaGeneration,
    normalizeMediaGeneration
} = require('../src/utils/mediaGeneration');
const {
    normalizePostgresConnectionString
} = require('../src/utils/postgresConnectionString');
const { readStreamToBuffer } = require('../src/utils/streams');

function parseArguments(argv) {
    const options = {
        execute: false,
        cleanupOldAssets: false,
        confirmCutover: false,
        recoverInterrupted: false,
        limit: null,
        photoId: null
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--execute') options.execute = true;
        else if (argument === '--cleanup-old-assets') options.cleanupOldAssets = true;
        else if (argument === '--confirm-cutover') options.confirmCutover = true;
        else if (argument === '--recover-interrupted') options.recoverInterrupted = true;
        else if (argument === '--limit') options.limit = Number(argv[++index]);
        else if (argument === '--photo') options.photoId = Number(argv[++index]);
        else throw new Error(`Argomento non riconosciuto: ${argument}`);
    }
    if (options.limit !== null && (!Number.isSafeInteger(options.limit) || options.limit <= 0)) {
        throw new Error('--limit richiede un intero positivo.');
    }
    if (options.photoId !== null && (!Number.isSafeInteger(options.photoId) || options.photoId <= 0)) {
        throw new Error('--photo richiede un ID positivo.');
    }
    if (options.cleanupOldAssets && options.execute && !options.confirmCutover) {
        throw new Error(
            'La cancellazione richiede anche --confirm-cutover: gli asset canonici servono finché production usa JSON.'
        );
    }
    if (options.recoverInterrupted && !options.execute) {
        throw new Error('--recover-interrupted richiede --execute.');
    }
    return options;
}

function sourceExtension(sourcePath, sourceContentType = '') {
    const match = String(sourcePath || '').match(/\.([a-z0-9]+)$/i);
    if (match) return match[1].toLowerCase();
    const mimeSubtype = String(sourceContentType || '').split('/')[1]?.split(';')[0];
    if (mimeSubtype === 'jpeg') return 'jpg';
    return String(mimeSubtype || 'bin').replace(/[^a-z0-9]/gi, '') || 'bin';
}

function buildCanonicalAssetPaths(photo) {
    const id = String(photo.id);
    return {
        sourcePath: `/private/source/photo_${id}.${sourceExtension(
            photo.sourcePath,
            photo.sourceContentType
        )}`,
        imagePath: `/uploads/photo_${id}.webp`,
        mobileImagePath: `/uploads/mobile/photo_${id}.webp`,
        thumbnail43Path: `/uploads/thumbnails/4x3/photo_${id}.webp`,
        thumbnail11Path: `/uploads/thumbnails/1x1/photo_${id}.webp`,
        socialImagePath: `/uploads/social/photo_${id}.jpg`
    };
}

function publicEntries(paths, photo) {
    return [
        ['imagePath', paths.imagePath, true],
        ['mobileImagePath', paths.mobileImagePath, Boolean(photo.mobileImage)],
        ['thumbnail43Path', paths.thumbnail43Path, true],
        ['thumbnail11Path', paths.thumbnail11Path, true],
        ['socialImagePath', paths.socialImagePath, true]
    ];
}

async function inspectPhotoAssets(photo, sourcePaths) {
    const publicResults = await Promise.all(
        publicEntries(sourcePaths, photo).map(async ([field, assetPath, required]) => ({
            field,
            path: assetPath,
            required,
            head: await headUploadObject(assetPath)
        }))
    );
    const sourceHead = await headPrivateObject(sourcePaths.sourcePath);
    const missing = publicResults
        .filter((entry) => entry.required && !entry.head)
        .map((entry) => entry.path);
    if (!sourceHead) missing.push(sourcePaths.sourcePath);
    return {
        valid: missing.length === 0,
        missing,
        sourceHead,
        publicResults
    };
}

async function copyPublicObject(source, target, expectedHead) {
    const object = await getUploadObject(source);
    if (!object?.stream) throw new Error(`Oggetto pubblico non leggibile: ${source}`);
    const buffer = await readStreamToBuffer(object.stream);
    if (
        expectedHead?.contentLength !== undefined
        && Number(expectedHead.contentLength) !== buffer.length
    ) {
        throw new Error(`Dimensione pubblica incoerente durante la lettura: ${source}`);
    }
    await putUploadObject(target, buffer, {
        contentType: object.contentType || expectedHead?.contentType,
        cacheControl: DEFAULTS.publicAssetCacheControl
    });
}

async function copyPrivateObject(source, target, expectedHead) {
    const object = await getPrivateObject(source);
    if (!object?.stream) throw new Error(`Source privata non leggibile: ${source}`);
    const buffer = await readStreamToBuffer(object.stream);
    if (
        expectedHead?.contentLength !== undefined
        && Number(expectedHead.contentLength) !== buffer.length
    ) {
        throw new Error(`Dimensione source incoerente durante la lettura: ${source}`);
    }
    await putPrivateObject(target, buffer, {
        contentType: object.contentType || expectedHead?.contentType,
        cacheControl: 'private, no-store'
    });
}

async function verifyCopiedAssets(photo, sourceInspection, targetPaths) {
    const targetInspection = await inspectPhotoAssets(photo, targetPaths);
    if (!targetInspection.valid) {
        throw new Error(`Verifica target fallita: ${targetInspection.missing.join(', ')}`);
    }
    if (
        Number(targetInspection.sourceHead.contentLength)
        !== Number(sourceInspection.sourceHead.contentLength)
    ) {
        throw new Error('La source target ha una dimensione diversa dall’originale.');
    }
    for (const sourceEntry of sourceInspection.publicResults) {
        if (!sourceEntry.head) continue;
        const targetEntry = targetInspection.publicResults.find(
            (entry) => entry.field === sourceEntry.field
        );
        if (
            !targetEntry?.head
            || Number(targetEntry.head.contentLength) !== Number(sourceEntry.head.contentLength)
        ) {
            throw new Error(`La derivata target non coincide: ${sourceEntry.field}`);
        }
    }
}

async function deleteAssetSet(photo, paths) {
    await Promise.all(
        publicEntries(paths, photo).map(([, assetPath]) => deleteUploadObject(assetPath))
    );
    await deletePrivateObject(paths.sourcePath);
}

async function migratePhoto(repository, photo, sourcePaths, inspection) {
    const generation = createMediaGeneration();
    const operationId = crypto.randomUUID();
    const targetPaths = buildPhotoAssetPaths(
        photo.id,
        sourceExtension(photo.sourcePath, photo.sourceContentType),
        generation
    );
    let reserved = false;
    let finalized = false;
    try {
        const reservation = await repository.photos.beginMediaMutation(photo.id, {
            operationId,
            kind: 'path-migration',
            generation,
            expectedVersion: photo.version,
            ttlMs: DEFAULTS.photoMediaMutationTtlMs
        });
        if (!reservation) throw new Error(`Foto ${photo.id} non più disponibile.`);
        reserved = true;

        await copyPrivateObject(
            sourcePaths.sourcePath,
            targetPaths.sourcePath,
            inspection.sourceHead
        );
        for (const sourceEntry of inspection.publicResults) {
            if (!sourceEntry.head) continue;
            await copyPublicObject(
                sourceEntry.path,
                targetPaths[sourceEntry.field],
                sourceEntry.head
            );
        }
        await verifyCopiedAssets(photo, inspection, targetPaths);

        const updated = await repository.photos.completeMediaMutation(
            photo.id,
            operationId,
            {
                sourcePath: targetPaths.sourcePath,
                mediaGeneration: generation
            },
            {
                expectedVersion: photo.version,
                auditOperation: 'photo.media.path-migration',
                auditMetadata: {
                    previousSourcePath: sourcePaths.sourcePath
                }
            }
        );
        finalized = true;
        return updated;
    } finally {
        if (!finalized) {
            await deleteAssetSet(photo, targetPaths).catch(() => null);
            if (reserved) {
                await repository.photos.abortMediaMutation(photo.id, operationId).catch(() => null);
            }
        }
    }
}

async function cleanupCanonicalAssets(photo) {
    const generation = normalizeMediaGeneration(photo.mediaGeneration, { required: true });
    const targetPaths = buildPhotoAssetPaths(
        photo.id,
        sourceExtension(photo.sourcePath, photo.sourceContentType),
        generation
    );
    targetPaths.sourcePath = photo.sourcePath;
    const inspection = await inspectPhotoAssets(photo, targetPaths);
    if (!inspection.valid) {
        throw new Error(
            `Cleanup rifiutato per foto ${photo.id}: target incompleto (${inspection.missing.join(', ')})`
        );
    }
    await deleteAssetSet(photo, buildCanonicalAssetPaths(photo));
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const databaseUrl = String(
        process.env.DATABASE_URL_UNPOOLED
        || process.env.DATABASE_URL
        || ''
    ).trim();
    if (!databaseUrl) {
        throw new Error('DATABASE_URL_UNPOOLED o DATABASE_URL non impostata.');
    }

    const pool = new Pool({
        connectionString: normalizePostgresConnectionString(databaseUrl),
        max: 3
    });
    const repository = new PostgresPortfolioRepository(pool);

    try {
        let photos = await repository.photos.list();
        if (options.photoId !== null) {
            photos = photos.filter((photo) => Number(photo.id) === options.photoId);
        }
        if (options.cleanupOldAssets) {
            photos = photos.filter((photo) => photo.mediaGeneration);
        } else {
            photos = photos.filter((photo) => !photo.mediaGeneration);
        }
        if (options.limit !== null) photos = photos.slice(0, options.limit);

        const mode = options.cleanupOldAssets ? 'cleanup' : 'migration';
        console.log(JSON.stringify({
            mode,
            execute: options.execute,
            selectedPhotos: photos.length
        }, null, 2));

        if (options.cleanupOldAssets) {
            const invalidTargets = [];
            for (const photo of photos) {
                const targetPaths = buildPhotoAssetPaths(
                    photo.id,
                    sourceExtension(photo.sourcePath, photo.sourceContentType),
                    photo.mediaGeneration
                );
                targetPaths.sourcePath = photo.sourcePath;
                const inspection = await inspectPhotoAssets(photo, targetPaths);
                if (!inspection.valid) {
                    invalidTargets.push({
                        photoId: photo.id,
                        missing: inspection.missing
                    });
                }
            }
            console.log(JSON.stringify({
                verifiedTargets: photos.length - invalidTargets.length,
                invalidTargets
            }, null, 2));
            if (invalidTargets.length > 0) {
                throw new Error('Cleanup rifiutato: uno o più set ULID sono incompleti.');
            }
            if (!options.execute) {
                console.log(
                    '[media-paths] verifica cleanup completata: nessun oggetto canonico è stato cancellato.'
                );
                return;
            }
            for (const photo of photos) {
                await cleanupCanonicalAssets(photo);
                console.log(`[media-paths] rimossi asset canonici foto ${photo.id}`);
            }
            return;
        }

        for (const photo of photos) {
            const state = await repository.photos.getMediaMutation(photo.id);
            if (!state?.operation) continue;
            if (!options.recoverInterrupted || state.operation.kind !== 'path-migration') {
                throw new Error(
                    `Foto ${photo.id}: operazione ${state.operation.kind} già attiva fino a ${state.operation.expiresAt}.`
                );
            }
            const interruptedPaths = buildPhotoAssetPaths(
                photo.id,
                sourceExtension(photo.sourcePath, photo.sourceContentType),
                state.operation.generation
            );
            await deleteAssetSet(photo, interruptedPaths);
            await repository.photos.abortMediaMutation(photo.id, state.operation.id);
            console.log(`[media-paths] recuperata migrazione interrotta foto ${photo.id}`);
        }

        const preflight = [];
        for (const photo of photos) {
            const sourcePaths = buildCanonicalAssetPaths(photo);
            if (photo.sourcePath !== sourcePaths.sourcePath) {
                preflight.push({
                    photo,
                    sourcePaths,
                    inspection: {
                        valid: false,
                        missing: [],
                        reason: `Source inattesa: ${photo.sourcePath}`
                    }
                });
                continue;
            }
            const inspection = await inspectPhotoAssets(photo, sourcePaths);
            preflight.push({ photo, sourcePaths, inspection });
            console.log(
                `[media-paths] preflight foto ${photo.id}: ${inspection.valid ? 'ok' : 'incompleto'}`
            );
        }

        const invalid = preflight.filter((entry) => !entry.inspection.valid);
        if (invalid.length > 0) {
            console.log(JSON.stringify({
                invalid: invalid.map((entry) => ({
                    photoId: entry.photo.id,
                    reason: entry.inspection.reason || null,
                    missing: entry.inspection.missing
                }))
            }, null, 2));
            throw new Error('Preflight fallito: nessuna foto è stata migrata.');
        }
        if (!options.execute) {
            console.log('[media-paths] dry-run completato: nessuna scrittura effettuata.');
            return;
        }

        for (const entry of preflight) {
            const updated = await migratePhoto(
                repository,
                entry.photo,
                entry.sourcePaths,
                entry.inspection
            );
            console.log(
                `[media-paths] migrata foto ${updated.id} -> ${updated.mediaGeneration}`
            );
        }

        const remaining = await pool.query(
            'SELECT count(*)::int AS count FROM photos WHERE media_generation IS NULL'
        );
        console.log(JSON.stringify({
            migrated: preflight.length,
            remainingWithoutGeneration: remaining.rows[0].count
        }, null, 2));
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error('[media-paths] errore:', error.message);
    process.exitCode = 1;
});
