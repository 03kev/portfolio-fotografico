const express = require('express');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const {
    createPrivateUploadPresignedPutUrl,
    getUploadObject
} = require('../services/r2Storage');
const {
    buildPhotoAssetPaths,
    buildDefaultCropProfiles,
    generatePhotoDerivatives,
    getCropProfilesFromSettings,
    normalizeMediaGeneration,
    normalizePrivateSourcePathForPhotoId
} = require('../services/photoDerivatives');
const DEFAULTS = require('../config/defaults');
const { parseNumericIdOrThrow } = require('../utils/ids');
const { getExpectedVersion } = require('../utils/expectedVersion');
const { sanitizePhotoPayload } = require('../utils/inputSanitizers');
const { protectWriteMethods } = require('../middleware/auth');
const {
    createRequireDurableMediaLifecycle
} = require('../middleware/repositoryCapabilities');
const { portfolioRepository } = require('../repositories');
const { createMediaGeneration } = require('../utils/mediaGeneration');
const { PhotoCreationService } = require('../services/photoCreation');
const {
    runMediaCleanupBestEffort
} = require('../services/mediaCleanupRuntime');
const { createPhotoCreationRouter } = require('./photoCreationRoutes');
const {
    getImageExtensionFromMimeType,
    isAllowedMimeType,
    normalizePhotoForApiList,
    parseAllowedUploadTypes,
    parseCoordinate,
    parseUploadSize,
    presentPhoto,
    readPrivateSourceBuffer,
    readPrivateSourceObject,
    sendRouteError,
    withDefaultPhotoVariants,
    writePrivateObject,
    writePublicObject
} = require('./photos.helpers');

const router = express.Router();
router.use(protectWriteMethods);
const requireDurableMediaLifecycle = createRequireDurableMediaLifecycle(
    portfolioRepository
);

function createMediaIdentity() {
    return {
        operationId: crypto.randomUUID(),
        generation: createMediaGeneration()
    };
}

function normalizeUuidInput(value, { fieldName, errorCode }) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
        const error = new Error(`${fieldName} non valido.`);
        error.status = 400;
        error.code = errorCode;
        throw error;
    }
    return normalized;
}

function normalizeMediaOperationId(value) {
    return normalizeUuidInput(value, {
        fieldName: 'operationId',
        errorCode: 'INVALID_MEDIA_OPERATION_ID'
    });
}

function requireExpectedVersion(req) {
    const expectedVersion = getExpectedVersion(req);
    if (
        expectedVersion === null
        && portfolioRepository.capabilities.optimisticConcurrency
    ) {
        const error = new Error('Questa operazione richiede X-Expected-Version con la versione corrente.');
        error.status = 428;
        error.code = 'EXPECTED_VERSION_REQUIRED';
        throw error;
    }
    return expectedVersion;
}

async function writeDerivativeSet(assets, derivatives) {
    const writes = await Promise.allSettled([
        writePublicObject(assets.imagePath, derivatives.image, 'image/webp'),
        writePublicObject(assets.mobileImagePath, derivatives.mobileImage, 'image/webp'),
        writePublicObject(assets.thumbnail43Path, derivatives.thumbnail43, 'image/webp'),
        writePublicObject(assets.thumbnail11Path, derivatives.thumbnail11, 'image/webp'),
        writePublicObject(assets.socialImagePath, derivatives.socialImage, 'image/jpeg')
    ]);
    const failed = writes.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
}

const photoCreationService = portfolioRepository.capabilities.distributedPhotoCreations
    ? new PhotoCreationService({
        repository: portfolioRepository,
        createSignedUploadUrl: createPrivateUploadPresignedPutUrl,
        readSourceObject: readPrivateSourceObject,
        writeSourceObject: writePrivateObject,
        generateDerivatives: generatePhotoDerivatives,
        writeDerivatives: writeDerivativeSet,
        createMediaGeneration,
        runCleanup: runMediaCleanupBestEffort
    })
    : null;

function requirePhotoCreationService() {
    if (photoCreationService) return photoCreationService;
    const error = new Error(
        'La creazione di nuove foto richiede METADATA_BACKEND=postgres.'
    );
    error.status = 503;
    error.code = 'TRANSACTIONAL_PHOTO_CREATION_REQUIRED';
    throw error;
}

async function abortMediaMutationBestEffort(photoId, operationId) {
    if (!photoId || !operationId) return;
    try {
        await portfolioRepository.photos.abortMediaMutation(photoId, operationId);
        await runMediaCleanupBestEffort({ limit: 10 });
    } catch (error) {
        console.warn('[photo_media_abort_failed]', {
            photoId,
            operationId,
            message: error?.message
        });
    }
}

async function regeneratePhotoMedia({
    photoId,
    expectedVersion,
    kind,
    settings
}) {
    const { operationId, generation } = createMediaIdentity();
    const reservation = await portfolioRepository.photos.beginMediaMutation(photoId, {
        operationId,
        kind,
        generation,
        expectedVersion,
        ttlMs: DEFAULTS.photoMediaMutationTtlMs
    });
    if (!reservation) return null;

    const currentPhoto = reservation.photo;
    const nextAssets = buildPhotoAssetPaths(photoId, 'bin', generation);
    let finalized = false;
    try {
        const sourcePath = normalizePrivateSourcePathForPhotoId(currentPhoto.sourcePath, photoId);
        if (!sourcePath) {
            const error = new Error('Source full-res non disponibile o non conforme al formato atteso.');
            error.status = 400;
            error.code = 'PHOTO_SOURCE_UNAVAILABLE';
            throw error;
        }
        const sourceBuffer = await readPrivateSourceBuffer(sourcePath);
        if (!sourceBuffer) {
            const error = new Error('Source full-res non trovata nello storage.');
            error.status = 404;
            error.code = 'PHOTO_SOURCE_NOT_FOUND';
            throw error;
        }

        const effectiveSettings = settings ?? currentPhoto.settings;
        const cropProfiles = getCropProfilesFromSettings(effectiveSettings);
        const derivatives = await generatePhotoDerivatives(sourceBuffer, cropProfiles);
        await writeDerivativeSet(nextAssets, derivatives);

        const updatedPhoto = await portfolioRepository.photos.completeMediaMutation(
            photoId,
            operationId,
            {
                ...(settings === undefined ? {} : { settings }),
                resolution: derivatives.resolution,
                mobileImage: true,
                mediaGeneration: generation,
                updatedAt: Date.now(),
                derivativesVersion: Date.now()
            },
            { expectedVersion }
        );
        finalized = true;

        await runMediaCleanupBestEffort({ limit: 10 });
        return updatedPhoto;
    } finally {
        if (!finalized) {
            await abortMediaMutationBestEffort(photoId, operationId);
        }
    }
}

function createPhotoOperationTimer(operation, photoId) {
    const startNs = process.hrtime.bigint();
    let prevNs = startNs;
    const stages = [];

    const toMs = (nsDelta) => Number(nsDelta) / 1_000_000;

    return {
        mark(stage) {
            const nowNs = process.hrtime.bigint();
            stages.push({
                stage,
                ms: Number(toMs(nowNs - prevNs).toFixed(2))
            });
            prevNs = nowNs;
        },
        flush(status, extra = {}) {
            const totalMs = Number(toMs(process.hrtime.bigint() - startNs).toFixed(2));
            console.info('[photo_operation_timing]', {
                operation,
                photoId,
                status,
                totalMs,
                stages,
                ...extra
            });
        }
    };
}

function getDownloadExtension(contentType) {
    const subtype = String(contentType || '')
        .split('/')[1]
        ?.split(';')[0]
        ?.trim()
        .toLowerCase();
    if (subtype === 'jpeg') return 'jpg';
    return String(subtype || 'webp').replace(/[^a-z0-9]/g, '') || 'webp';
}

function buildDownloadFilename(photo, contentType) {
    const extension = getDownloadExtension(contentType);
    const title = String(photo?.title || `photo-${photo?.id || 'download'}`)
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N} _-]/gu, '')
        .trim()
        .replace(/\s+/g, '-');
    const filename = `${(title || `photo-${photo?.id || 'download'}`).slice(0, 96)}.${extension}`;
    return {
        fallback: `photo-${photo?.id || 'download'}.${extension}`,
        filename
    };
}

const uploadMaxSize = DEFAULTS.uploadMaxSize;
const allowedUploadTypes = parseAllowedUploadTypes();

router.use(createPhotoCreationRouter({
    getPhotoCreationService: requirePhotoCreationService
}));

// GET - Ottieni tutte le foto
router.get('/', async (req, res) => {
    try {
        const rawPhotos = await portfolioRepository.photos.list();
        const photos = rawPhotos
            .map((photo) => normalizePhotoForApiList(photo))
            .map((photo) => presentPhoto(photo));
        
        res.json({
            success: true,
            data: photos,
            total: photos.length
        });
    } catch (error) {
        console.error('Errore nel recupero foto:', error);
        return sendRouteError(res, error, {
            fallbackMessage: 'Errore nel recupero delle foto',
            fallbackCode: 'PHOTO_LIST_FAILED'
        });
    }
});

// GET - Scarica la variante full senza aprire l'URL raw dell'immagine.
router.get('/:id/download', async (req, res) => {
    try {
        const photoId = parseNumericIdOrThrow(req.params.id, 'ID foto');
        const photo = await portfolioRepository.photos.findById(photoId);
        if (!photo) {
            return res.status(404).json({
                success: false,
                code: 'PHOTO_NOT_FOUND',
                message: 'Foto non trovata'
            });
        }

        const publicPhoto = withDefaultPhotoVariants(photo);
        const object = await getUploadObject(publicPhoto.image);
        if (!object?.stream) {
            return res.status(404).json({
                success: false,
                code: 'PHOTO_ASSET_NOT_FOUND',
                message: 'File immagine non trovato'
            });
        }

        const { fallback, filename } = buildDownloadFilename(photo, object.contentType);
        res.setHeader('Content-Type', object.contentType || 'application/octet-stream');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        );
        res.setHeader('Cache-Control', 'private, no-store');
        if (object.contentLength != null) res.setHeader('Content-Length', String(object.contentLength));

        await pipeline(object.stream, res);
    } catch (error) {
        console.error('Errore download foto:', error);
        return sendRouteError(res, error, {
            fallbackMessage: 'Errore durante il download della foto',
            fallbackCode: 'PHOTO_DOWNLOAD_FAILED'
        });
    }
});

// GET - Ottieni foto per ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const photoId = parseNumericIdOrThrow(id, 'ID foto');
        const photo = await portfolioRepository.photos.findById(photoId);
        
        if (!photo) {
            return res.status(404).json({
                success: false,
                code: 'PHOTO_NOT_FOUND',
                message: 'Foto non trovata'
            });
        }
        
        res.json({
            success: true,
            data: presentPhoto(photo)
        });
    } catch (error) {
        console.error('Errore nel recupero foto:', error);
        return sendRouteError(res, error, {
            fallbackMessage: 'Errore nel recupero della foto',
            fallbackCode: 'PHOTO_READ_FAILED'
        });
    }
});

// Prenota un reupload in modo distribuito prima di esporre una URL R2 firmata.
router.post('/:id/source-upload-url', requireDurableMediaLifecycle, async (req, res) => {
    let photoId = null;
    let operationId = null;
    try {
        photoId = parseNumericIdOrThrow(req.params.id, 'ID foto');
        const expectedVersion = requireExpectedVersion(req);
        const effectiveMimeType = String(req.body?.mimetype || req.body?.contentType || '').trim();
        if (!effectiveMimeType || !isAllowedMimeType(effectiveMimeType, allowedUploadTypes)) {
            const error = new Error(`Tipo file non consentito. Tipi ammessi: ${allowedUploadTypes.join(', ')}`);
            error.status = 415;
            error.code = 'INVALID_FILE_TYPE';
            throw error;
        }
        const parsedSize = parseUploadSize(req.body?.fileSize);
        if (parsedSize && parsedSize > uploadMaxSize) {
            const error = new Error(`File troppo grande. Massimo ${uploadMaxSize} byte.`);
            error.status = 413;
            error.code = 'LIMIT_FILE_SIZE';
            throw error;
        }

        const identity = createMediaIdentity();
        operationId = identity.operationId;
        const reservation = await portfolioRepository.photos.beginMediaMutation(photoId, {
            ...identity,
            kind: 'replace-source',
            expectedVersion,
            ttlMs: DEFAULTS.photoMediaMutationTtlMs
        });
        if (!reservation) {
            return res.status(404).json({
                success: false,
                code: 'PHOTO_NOT_FOUND',
                message: 'Foto non trovata'
            });
        }

        const sourceExtension = getImageExtensionFromMimeType(effectiveMimeType);
        const sourcePath = buildPhotoAssetPaths(
            photoId,
            sourceExtension,
            identity.generation
        ).sourcePath;
        const signed = await createPrivateUploadPresignedPutUrl(sourcePath, {
            contentType: effectiveMimeType,
            cacheControl: 'private, no-store',
            expiresInSeconds: DEFAULTS.r2SignedUploadUrlExpiresSeconds
        });
        await portfolioRepository.photos.registerMediaMutationCleanupAssets(
            photoId,
            operationId,
            [{
                scope: 'private',
                path: signed.uploadPath
            }]
        );
        return res.json({
            success: true,
            data: {
                uploadUrl: signed.uploadUrl,
                sourcePath: signed.uploadPath,
                operationId,
                mediaGeneration: identity.generation,
                expectedVersion,
                expiresInSeconds: signed.expiresInSeconds
            }
        });
    } catch (error) {
        await abortMediaMutationBestEffort(photoId, operationId);
        return sendRouteError(res, error, {
            fallbackMessage: 'Errore nella preparazione del reupload',
            fallbackCode: 'PHOTO_REUPLOAD_PREPARE_FAILED'
        });
    }
});

router.delete(
    '/:id/media-operations/:operationId',
    requireDurableMediaLifecycle,
    async (req, res) => {
        try {
            const photoId = parseNumericIdOrThrow(req.params.id, 'ID foto');
            const operationId = normalizeMediaOperationId(req.params.operationId);
            await portfolioRepository.photos.abortMediaMutation(photoId, operationId);
            const cleanup = await runMediaCleanupBestEffort({ limit: 10 });
            return res.json({
                success: true,
                data: { cleanup }
            });
        } catch (error) {
            return sendRouteError(res, error, {
                fallbackMessage: 'Errore nell’annullamento dell’operazione media',
                fallbackCode: 'PHOTO_MEDIA_ABORT_FAILED'
            });
        }
    }
);

router.post('/:id/replace-source', requireDurableMediaLifecycle, async (req, res) => {
    let photoId = null;
    let operationId = '';
    let nextSourcePath = '';
    let finalized = false;
    const timer = createPhotoOperationTimer('replace-source', req.params.id);
    try {
        photoId = parseNumericIdOrThrow(req.params.id, 'ID foto');
        const expectedVersion = requireExpectedVersion(req);
        operationId = normalizeMediaOperationId(req.body?.operationId);
        const generation = normalizeMediaGeneration(req.body?.mediaGeneration);
        nextSourcePath = normalizePrivateSourcePathForPhotoId(req.body?.sourcePath, photoId);
        if (!operationId || !generation || !nextSourcePath) {
            const error = new Error('Prenotazione reupload non valida o incompleta.');
            error.status = 400;
            error.code = 'INVALID_MEDIA_OPERATION';
            throw error;
        }

        const active = await portfolioRepository.photos.getMediaMutation(photoId);
        if (
            !active?.operation
            || active.operation.id !== operationId
            || active.operation.generation !== generation
            || active.operation.kind !== 'replace-source'
            || !nextSourcePath.includes(`/${generation}/`)
        ) {
            const error = new Error('La prenotazione del reupload non è più valida.');
            error.status = 409;
            error.code = 'MEDIA_OPERATION_STALE';
            throw error;
        }
        const currentPhoto = active.photo;
        const sourceObject = await readPrivateSourceObject(nextSourcePath);
        timer.mark('read_private_source');
        if (!sourceObject) {
            const error = new Error('Source privata non trovata nello storage.');
            error.status = 404;
            error.code = 'PHOTO_SOURCE_NOT_FOUND';
            throw error;
        }

        const nextAssets = buildPhotoAssetPaths(photoId, 'bin', generation);
        const derivatives = await generatePhotoDerivatives(
            sourceObject.buffer,
            getCropProfilesFromSettings(currentPhoto.settings)
        );
        timer.mark('generate_derivatives');
        await writeDerivativeSet(nextAssets, derivatives);
        timer.mark('write_public_derivatives');

        const updatedPhoto = await portfolioRepository.photos.completeMediaMutation(
            photoId,
            operationId,
            {
                sourcePath: nextSourcePath,
                sourceContentType: sourceObject.contentType
                    || String(req.body?.sourceContentType || '').trim()
                    || currentPhoto.sourceContentType
                    || '',
                resolution: derivatives.resolution,
                mobileImage: true,
                mediaGeneration: generation,
                updatedAt: Date.now(),
                derivativesVersion: Date.now()
            },
            { expectedVersion }
        );
        finalized = true;
        timer.mark('commit_photo_generation');

        await runMediaCleanupBestEffort({ limit: 10 });
        timer.flush('success', { derivativesVersion: updatedPhoto.derivativesVersion });
        return res.json({
            success: true,
            message: 'Originale sostituito e varianti rigenerate.',
            data: presentPhoto(updatedPhoto)
        });
    } catch (error) {
        timer.flush('error', { code: error?.code || null, message: error?.message });
        return sendRouteError(res, error, {
            fallbackMessage: 'Errore durante il reupload della source privata',
            fallbackCode: 'PHOTO_REUPLOAD_FAILED'
        });
    } finally {
        if (!finalized && photoId && operationId) {
            await abortMediaMutationBestEffort(photoId, operationId);
        }
    }
});

router.post(
    '/:id/regenerate-derivatives',
    requireDurableMediaLifecycle,
    async (req, res) => {
        try {
            const photoId = parseNumericIdOrThrow(req.params.id, 'ID foto');
            const expectedVersion = requireExpectedVersion(req);
            const updatedPhoto = await regeneratePhotoMedia({
                photoId,
                expectedVersion,
                kind: 'regenerate'
            });
            if (!updatedPhoto) {
                return res.status(404).json({
                    success: false,
                    code: 'PHOTO_NOT_FOUND',
                    message: 'Foto non trovata'
                });
            }
            return res.json({
                success: true,
                message: 'Varianti rigenerate.',
                data: presentPhoto(updatedPhoto)
            });
        } catch (error) {
            return sendRouteError(res, error, {
                fallbackMessage: 'Errore durante la rigenerazione derivate',
                fallbackCode: 'PHOTO_REGENERATE_FAILED'
            });
        }
    }
);

router.post('/:id/crop', requireDurableMediaLifecycle, async (req, res) => {
    try {
        const photoId = parseNumericIdOrThrow(req.params.id, 'ID foto');
        const expectedVersion = requireExpectedVersion(req);
        const sanitized = sanitizePhotoPayload(
            { settings: req.body?.settings },
            { partial: true }
        );
        if (sanitized.settings === undefined) {
            const error = new Error('Impostazioni crop mancanti.');
            error.status = 400;
            error.code = 'CROP_SETTINGS_REQUIRED';
            throw error;
        }
        const updatedPhoto = await regeneratePhotoMedia({
            photoId,
            expectedVersion,
            kind: 'crop',
            settings: sanitized.settings
        });
        if (!updatedPhoto) {
            return res.status(404).json({
                success: false,
                code: 'PHOTO_NOT_FOUND',
                message: 'Foto non trovata'
            });
        }
        return res.json({
            success: true,
            message: 'Ritaglio applicato e varianti rigenerate.',
            data: presentPhoto(updatedPhoto)
        });
    } catch (error) {
        return sendRouteError(res, error, {
            fallbackMessage: 'Errore durante l’applicazione del crop',
            fallbackCode: 'PHOTO_CROP_FAILED'
        });
    }
});

// PUT - Aggiorna foto esistente
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const photoId = parseNumericIdOrThrow(id, 'ID foto');
        const { lat, lng } = req.body;
        const sanitized = sanitizePhotoPayload(req.body, { partial: true });
        
        const changes = {
            ...sanitized,
            updatedAt: Date.now(),
        };
        if (lat !== undefined) {
            const parsedLat = parseCoordinate(lat, 'Latitudine');
            if (parsedLat !== null) changes.lat = parsedLat;
        }
        if (lng !== undefined) {
            const parsedLng = parseCoordinate(lng, 'Longitudine');
            if (parsedLng !== null) changes.lng = parsedLng;
        }

        const updatedPhoto = await portfolioRepository.photos.updateById(
            photoId,
            changes,
            { expectedVersion: requireExpectedVersion(req) }
        );
        if (!updatedPhoto) {
            return res.status(404).json({
                success: false,
                code: 'PHOTO_NOT_FOUND',
                message: 'Foto non trovata'
            });
        }
        
        res.json({
            success: true,
            data: presentPhoto(updatedPhoto),
            message: 'Dettagli della foto aggiornati.'
        });
    } catch (error) {
        console.error('Errore nell\'aggiornamento:', error);
        return sendRouteError(res, error, {
            fallbackMessage: 'Errore nell\'aggiornamento della foto',
            fallbackCode: 'PHOTO_UPDATE_FAILED'
        });
    }
});

// DELETE - Elimina foto
router.delete('/:id', requireDurableMediaLifecycle, async (req, res) => {
    try {
        const { id } = req.params;
        const photoId = parseNumericIdOrThrow(id, 'ID foto');
        const deletion = await portfolioRepository.deletePhotoWithReferences(
            photoId,
            { expectedVersion: requireExpectedVersion(req) }
        );
        if (!deletion) {
            return res.status(404).json({
                success: false,
                code: 'PHOTO_NOT_FOUND',
                message: 'Foto non trovata'
            });
        }
        if (deletion.referenceCleanupError) {
            console.warn('Errore nell\'aggiornamento delle serie:', deletion.referenceCleanupError);
        }
        
        const cleanup = await runMediaCleanupBestEffort({ limit: 10 });
        
        res.json({
            success: true,
            message: 'Foto eliminata; pulizia dei file accodata.',
            data: {
                cleanupQueued: true,
                cleanup
            }
        });
    } catch (error) {
        console.error('Errore nell\'eliminazione:', error);
        return sendRouteError(res, error, {
            fallbackMessage: 'Errore nell\'eliminazione della foto',
            fallbackCode: 'PHOTO_DELETE_FAILED'
        });
    }
});

module.exports = router;
