const express = require('express');
const DEFAULTS = require('../config/defaults');
const { parseNumericIdOrThrow } = require('../utils/ids');
const { sanitizePhotoPayload } = require('../utils/inputSanitizers');
const {
    normalizeCropProfilesForStorage
} = require('../services/photoDerivatives');
const {
    parseCoordinate,
    presentPhoto,
    sendRouteError
} = require('./photos.helpers');
const {
    validateDeclaredPhotoUpload
} = require('../services/photoUploadPolicy');

function normalizeUploadIntentId(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
        const error = new Error('uploadIntentId non valido.');
        error.status = 400;
        error.code = 'INVALID_UPLOAD_INTENT_ID';
        throw error;
    }
    return normalized;
}

function creationRouteErrorOptions(error, fallbackMessage, fallbackCode) {
    if (error?.code === 'TRANSACTIONAL_PHOTO_CREATION_REQUIRED') {
        return {
            fallbackMessage: error.message,
            fallbackCode: error.code
        };
    }
    return { fallbackMessage, fallbackCode };
}

function logUnexpectedRouteError(label, error) {
    if (error?.code === 'TRANSACTIONAL_PHOTO_CREATION_REQUIRED') return;
    const status = Number(error?.status || error?.statusCode || 0);
    if (status >= 400 && status < 500) return;
    console.error(label, error);
}

function createPhotoCreationRouter({ getPhotoCreationService }) {
    if (typeof getPhotoCreationService !== 'function') {
        throw new TypeError('getPhotoCreationService è obbligatorio.');
    }

    const router = express.Router();
    router.post('/upload-url', async (req, res) => {
        try {
            const {
                uploadIntentId,
                mimetype,
                contentType,
                fileSize,
                variant
            } = req.body || {};
            const rawVariant = String(variant || 'source').trim().toLowerCase();
            if (rawVariant !== 'source') {
                return res.status(400).json({
                    success: false,
                    code: 'INVALID_UPLOAD_VARIANT',
                    message: 'variant non valido: usare solo "source".'
                });
            }
            const effectiveMimeType = String(mimetype || contentType || '').trim();
            const declaration = validateDeclaredPhotoUpload({
                contentType: effectiveMimeType,
                fileSize
            });

            const intentId = normalizeUploadIntentId(uploadIntentId);
            const prepared = await getPhotoCreationService().prepareUpload({
                uploadIntentId: intentId,
                sourceContentType: declaration.contentType,
                sourceExtension: declaration.extension,
                signedUrlOptions: {
                    contentType: declaration.contentType,
                    cacheControl: 'private, no-store',
                    expiresInSeconds: DEFAULTS.r2SignedUploadUrlExpiresSeconds
                }
            });

            return res.json({
                success: true,
                data: prepared
            });
        } catch (error) {
            logUnexpectedRouteError(
                'Errore generazione URL upload diretto:',
                error
            );
            return sendRouteError(
                res,
                error,
                creationRouteErrorOptions(
                    error,
                    'Errore nella generazione URL upload',
                    'PHOTO_UPLOAD_SIGNING_FAILED'
                )
            );
        }
    });

    router.post('/', async (req, res) => {
        try {
            const { lat, lng } = req.body;
            const sanitized = sanitizePhotoPayload(req.body, { partial: false });
            const parsedLat = parseCoordinate(lat, 'Latitudine');
            const parsedLng = parseCoordinate(lng, 'Longitudine');
            const photoId = parseNumericIdOrThrow(req.body?.photoId, 'photoId');
            const uploadIntentId = normalizeUploadIntentId(req.body?.uploadIntentId);
            const normalizedSettings = {
                ...(sanitized.settings && typeof sanitized.settings === 'object'
                    ? sanitized.settings
                    : {}),
                cropProfiles: normalizeCropProfilesForStorage(sanitized.settings)
            };
            const result = await getPhotoCreationService().finalize({
                uploadIntentId,
                photoId,
                sourcePath: req.body?.sourcePath,
                photoDraft: {
                    title: sanitized.title,
                    location: sanitized.location,
                    lat: parsedLat ?? 0,
                    lng: parsedLng ?? 0,
                    description: sanitized.description,
                    date: sanitized.date,
                    camera: sanitized.camera,
                    lens: sanitized.lens,
                    settings: normalizedSettings,
                    tags: sanitized.tags
                }
            });

            return res.status(result.replayed ? 200 : 201).json({
                success: true,
                message: result.replayed
                    ? 'Foto già caricata; richiesta riconciliata.'
                    : 'Foto caricata.',
                replayed: result.replayed,
                data: presentPhoto(result.photo)
            });
        } catch (error) {
            logUnexpectedRouteError("Errore nell'upload:", error);
            return sendRouteError(
                res,
                error,
                creationRouteErrorOptions(
                    error,
                    'Errore nell’upload della foto',
                    'PHOTO_CREATE_FAILED'
                )
            );
        }
    });

    return router;
}

module.exports = {
    createPhotoCreationRouter,
    normalizeUploadIntentId
};
