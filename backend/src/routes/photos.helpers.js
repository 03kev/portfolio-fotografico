const {
    getPrivateObject,
    putPrivateObject,
    putUploadObject
} = require('../services/r2Storage');
const { normalizeUploadsPath } = require('../services/photoDerivatives');
const { buildPublicAssetUrl } = require('../services/publicAssetUrl');
const DEFAULTS = require('../config/defaults');
const { readStreamToBuffer } = require('../utils/streams');
const {
    sendApiError,
    toApiErrorResponse
} = require('../utils/apiErrors');

const PUBLIC_ASSET_CACHE_CONTROL = DEFAULTS.publicAssetCacheControl;

function getPhotoAsset(photo, role, scope = null) {
    return (Array.isArray(photo?.assets) ? photo.assets : []).find((asset) => (
        asset?.role === role && (!scope || asset?.scope === scope)
    )) || null;
}

function presentPhoto(photo) {
    const publicAssets = Object.fromEntries(
        (Array.isArray(photo?.assets) ? photo.assets : [])
            .filter((asset) => asset.scope === 'public')
            .map((asset) => {
                const path = normalizeUploadsPath(asset.path);
                return [asset.role, {
                    role: asset.role,
                    contentType: asset.contentType,
                    generation: asset.generation,
                    url: buildPublicAssetUrl(path, { preferRelativeInDevelopment: true })
                }];
            })
    );
    const {
        sourcePath,
        sourceContentType,
        mobileImage,
        assets,
        ...publicPhoto
    } = photo;

    return {
        ...publicPhoto,
        assets: publicAssets
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

const toRouteErrorResponse = toApiErrorResponse;

function sendRouteError(res, error, options = {}) {
    return sendApiError(res, error, options);
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

module.exports = {
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
    getPhotoAsset,
    writePrivateObject,
    writePublicObject
};
