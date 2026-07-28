const crypto = require('crypto');
const {
    getPrivateObject,
    putPrivateObject,
    putUploadObject
} = require('../services/r2Storage');
const {
    normalizeUploadPathToAbsoluteUrl,
    purgeUrls
} = require('../services/cloudflareCache');
const {
    buildPhotoAssetPaths,
    normalizeUploadsPath
} = require('../services/photoDerivatives');
const { buildPublicAssetUrl } = require('../services/publicAssetUrl');
const DEFAULTS = require('../config/defaults');
const { readStreamToBuffer } = require('../utils/streams');

const PUBLIC_ASSET_CACHE_CONTROL = DEFAULTS.publicAssetCacheControl;

function withDefaultPhotoVariants(photo) {
    const photoId = String(photo?.id || '').trim();
    const assets = photoId
        ? buildPhotoAssetPaths(photoId, 'bin', photo?.mediaGeneration)
        : null;
    const imagePath = assets ? normalizeUploadsPath(assets.imagePath) : '';
    const mobileImagePath = photo?.mobileImage && assets
        ? normalizeUploadsPath(assets.mobileImagePath)
        : '';
    const thumbnail43Path = assets ? normalizeUploadsPath(assets.thumbnail43Path) : '';
    const thumbnail11Path = assets ? normalizeUploadsPath(assets.thumbnail11Path) : '';
    const socialImagePath = assets ? normalizeUploadsPath(assets.socialImagePath) : '';

    return {
        ...photo,
        image: imagePath,
        mobileImage: mobileImagePath,
        thumbnail43: thumbnail43Path,
        thumbnail11: thumbnail11Path,
        socialImage: socialImagePath,
        url: imagePath
    };
}

function presentPhoto(photo) {
    const normalized = withDefaultPhotoVariants(photo);
    const image = buildPublicAssetUrl(normalized.image, { preferRelativeInDevelopment: true });
    const mobileImage = buildPublicAssetUrl(normalized.mobileImage, { preferRelativeInDevelopment: true });
    const thumbnail43 = buildPublicAssetUrl(normalized.thumbnail43, { preferRelativeInDevelopment: true });
    const thumbnail11 = buildPublicAssetUrl(normalized.thumbnail11, { preferRelativeInDevelopment: true });
    const socialImage = buildPublicAssetUrl(normalized.socialImage, { preferRelativeInDevelopment: true });
    const { sourcePath, sourceContentType, ...publicPhoto } = normalized;

    return {
        ...publicPhoto,
        image,
        mobileImage,
        thumbnail43,
        thumbnail11,
        socialImage,
        url: buildPublicAssetUrl(normalized.url, { preferRelativeInDevelopment: true })
    };
}

function normalizePhotoForApiList(photo) {
    let settings = {};
    if (typeof photo.settings === 'string') {
        try {
            settings = JSON.parse(photo.settings);
        } catch {
            settings = {};
        }
    } else {
        settings = photo.settings || {};
    }

    let tags = [];
    if (typeof photo.tags === 'string') {
        try {
            tags = JSON.parse(photo.tags);
        } catch {
            tags = [];
        }
    } else {
        tags = Array.isArray(photo.tags) ? photo.tags : [];
    }

    const derivativesVersion = Number.isFinite(Number(photo.derivativesVersion))
        ? Number(photo.derivativesVersion)
        : (Number.isFinite(Number(photo.id)) ? Number(photo.id) : 0);

    return {
        ...photo,
        title: photo.title || 'Foto senza titolo',
        location: photo.location || 'Posizione sconosciuta',
        description: photo.description || '',
        camera: photo.camera || '',
        lens: photo.lens || '',
        lat: photo.lat || 0,
        lng: photo.lng || 0,
        derivativesVersion,
        settings,
        tags
    };
}

function parseAllowedUploadTypes() {
    return DEFAULTS.uploadAllowedTypes;
}

function isAllowedMimeType(mimetype, allowedTypes) {
    return allowedTypes.some((allowedType) => {
        if (allowedType.endsWith('/*')) {
            const prefix = allowedType.slice(0, -1);
            return mimetype.startsWith(prefix);
        }
        return mimetype === allowedType;
    });
}

function parseCoordinate(value, fieldName) {
    if (value === undefined || value === null || value === '') return null;

    const parsed = Number.parseFloat(String(value));
    if (!Number.isFinite(parsed)) {
        const error = new Error(`${fieldName} non valido`);
        error.status = 400;
        error.code = 'INVALID_COORDINATE';
        throw error;
    }
    return parsed;
}

function parseUploadSize(value) {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

const CLIENT_ERROR_CODES = new Set([
    'INVALID_ID',
    'INVALID_COORDINATE',
    'INVALID_FILE_TYPE',
    'LIMIT_FILE_SIZE'
]);

function compactErrorMessage(value, maxLength = 240) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 3)}...`;
}

function resolveErrorStatus(error, fallbackStatus = 500) {
    const explicitStatus = Number(error?.status || error?.statusCode || 0);
    if (Number.isFinite(explicitStatus) && explicitStatus >= 400 && explicitStatus < 600) {
        return explicitStatus;
    }

    if (CLIENT_ERROR_CODES.has(String(error?.code || ''))) {
        return 400;
    }

    return fallbackStatus;
}

function toRouteErrorResponse(error, {
    fallbackMessage = 'Errore interno del server',
    fallbackStatus = 500,
    includeServerDetails = true
} = {}) {
    const status = resolveErrorStatus(error, fallbackStatus);
    const isServerError = status >= 500;
    const rawMessage = compactErrorMessage(error?.message || '');
    const code = String(error?.code || '').trim();

    const payload = {
        success: false,
        message: isServerError
            ? fallbackMessage
            : (rawMessage || fallbackMessage)
    };

    if (code) {
        payload.code = code;
    }

    if (isServerError && includeServerDetails) {
        const details = {};
        if (rawMessage && rawMessage !== fallbackMessage) details.reason = rawMessage;
        if (code) details.code = code;
        const statusCode = Number(error?.status || error?.statusCode || 0);
        if (Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 600) {
            details.statusCode = statusCode;
        }
        if (Object.keys(details).length > 0) {
            payload.details = details;
        }
    }

    return { status, payload };
}

function sendRouteError(res, error, options = {}) {
    const { status, payload } = toRouteErrorResponse(error, options);
    return res.status(status).json(payload);
}

function describeDeleteError(error) {
    return {
        message: error?.message || 'Errore sconosciuto',
        code: error?.code || error?.name || 'UNKNOWN_ERROR',
        statusCode: error?.$metadata?.httpStatusCode || null
    };
}

function normalizeUploadId(value) {
    const normalized = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 48);
    return normalized || null;
}

function buildUploadFilename(mimetype, uploadId) {
    const safeUploadId = normalizeUploadId(uploadId) || `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const mimeExt = mimetype && mimetype.includes('/') ? `.${mimetype.split('/')[1]}` : '.bin';
    const extension = mimeExt.toLowerCase();
    return `photo_${safeUploadId}${extension}`;
}

function getImageExtensionFromMimeType(mimetype) {
    const subtype = String(mimetype || '')
        .split('/')
        .slice(1)
        .join('/')
        .split(';')[0]
        .trim()
        .toLowerCase();

    if (!subtype) return 'bin';
    if (subtype === 'jpeg') return 'jpg';
    return subtype.replace(/[^a-z0-9]/g, '') || 'bin';
}

async function writePublicObject(uploadPath, buffer, contentType, cacheControl = PUBLIC_ASSET_CACHE_CONTROL) {
    await putUploadObject(uploadPath, buffer, {
        contentType,
        cacheControl
    });
}

async function writePrivateObject(privatePath, buffer, contentType) {
    await putPrivateObject(privatePath, buffer, {
        contentType,
        cacheControl: 'private, no-store'
    });
}

async function readPrivateSourceBuffer(privatePath) {
    const sourceObject = await readPrivateSourceObject(privatePath);
    return sourceObject ? sourceObject.buffer : null;
}

async function readPrivateSourceObject(privatePath) {
    const object = await getPrivateObject(privatePath);
    if (!object || !object.stream) {
        return null;
    }
    const buffer = await readStreamToBuffer(object.stream);
    return {
        buffer,
        contentType: String(object.contentType || '').trim()
    };
}

async function purgePublicAssetsBestEffort(uploadPaths = [], reason = 'photos_update') {
    const urls = uploadPaths
        .map((uploadPath) => normalizeUploadPathToAbsoluteUrl(uploadPath))
        .filter(Boolean);

    if (!urls.length) return;

    try {
        await purgeUrls(urls, { reason });
    } catch (error) {
        console.warn(`[cache] purge fallita (${reason}):`, error.message);
    }
}

module.exports = {
    buildUploadFilename,
    describeDeleteError,
    getImageExtensionFromMimeType,
    isAllowedMimeType,
    normalizePhotoForApiList,
    parseAllowedUploadTypes,
    parseCoordinate,
    parseUploadSize,
    presentPhoto,
    purgePublicAssetsBestEffort,
    readPrivateSourceBuffer,
    readPrivateSourceObject,
    sendRouteError,
    withDefaultPhotoVariants,
    writePrivateObject,
    writePublicObject
};
