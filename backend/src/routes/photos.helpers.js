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
    PHOTO_UPLOAD_MAX_BYTES
} = require('@portfolio/photo-upload-contract');
const {
    assertPhotoUploadSize
} = require('../services/photoUploadPolicy');
const {
    sendApiError,
    toApiErrorResponse
} = require('../utils/apiErrors');
const {
    assertPhotoPublicProjection,
    definePhotoMetadataConsumer,
    normalizePhotoSettings,
    normalizePhotoTags,
    projectPublicPhotoMetadata
} = require('@portfolio/photo-metadata-contract');

const PUBLIC_ASSET_CACHE_CONTROL = DEFAULTS.publicAssetCacheControl;
const PHOTO_API_PUBLIC_FIELDS = Object.freeze([
    'id', 'title', 'description', 'date', 'location', 'lat', 'lng',
    'camera', 'lens', 'resolution', 'settings', 'tags', 'createdAt',
    'updatedAt', 'version', 'derivativesVersion', 'mediaGeneration', 'assets'
]);

assertPhotoPublicProjection(PHOTO_API_PUBLIC_FIELDS, {
    projectionName: 'Photo API response'
});

const PHOTO_METADATA_API_COVERAGE = definePhotoMetadataConsumer({
    id: 'backend.api-serialization',
    consumer: 'Backend photo API serialization',
    handled: PHOTO_API_PUBLIC_FIELDS,
    excluded: {}
});

function getPhotoAsset(photo, role, scope = null) {
    return (Array.isArray(photo?.assets) ? photo.assets : []).find((asset) => (
        asset?.role === role && (!scope || asset?.scope === scope)
    )) || null;
}

function presentPhoto(photo) {
    const normalizedPhoto = normalizePhotoForApiList(photo);
    const publicAssets = Object.fromEntries(
        (Array.isArray(normalizedPhoto?.assets) ? normalizedPhoto.assets : [])
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
    const publicPhoto = projectPublicPhotoMetadata(
        normalizedPhoto,
        PHOTO_API_PUBLIC_FIELDS,
        { projectionName: 'Photo API response' }
    );

    return {
        ...publicPhoto,
        assets: publicAssets
    };
}

function normalizePhotoForApiList(photo) {
    const derivativesVersion = Number.isFinite(Number(photo.derivativesVersion))
        ? Number(photo.derivativesVersion)
        : (Number.isFinite(Number(photo.id)) ? Number(photo.id) : 0);

    return {
        ...photo,
        lat: photo.lat ?? null,
        lng: photo.lng ?? null,
        derivativesVersion,
        settings: normalizePhotoSettings(photo.settings ?? {}),
        tags: normalizePhotoTags(photo.tags ?? [])
    };
}

const toRouteErrorResponse = toApiErrorResponse;

function sendRouteError(res, error, options = {}) {
    return sendApiError(res, error, options);
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
    return readPrivateSourceObjectWithOptions(privatePath);
}

async function readPrivateSourceObjectWithOptions(privatePath, {
    maxBytes = null
} = {}) {
    const object = await getPrivateObject(privatePath);
    if (!object || !object.stream) {
        return null;
    }
    if (maxBytes !== null && object.contentLength !== undefined && object.contentLength !== null) {
        assertPhotoUploadSize(Number(object.contentLength), maxBytes);
    }
    let buffer;
    try {
        buffer = await readStreamToBuffer(object.stream, { maxBytes });
    } catch (error) {
        if (error?.code === 'STREAM_MAX_BYTES_EXCEEDED') {
            assertPhotoUploadSize(error.actualBytes, maxBytes);
        }
        throw error;
    }
    return {
        buffer,
        contentType: String(object.contentType || '').trim(),
        contentLength: object.contentLength === undefined || object.contentLength === null
            ? buffer.length
            : Number(object.contentLength)
    };
}

async function readPrivatePhotoUploadSourceObject(privatePath) {
    return readPrivateSourceObjectWithOptions(privatePath, {
        maxBytes: PHOTO_UPLOAD_MAX_BYTES
    });
}

module.exports = {
    PHOTO_API_PUBLIC_FIELDS,
    PHOTO_METADATA_API_COVERAGE,
    normalizePhotoForApiList,
    presentPhoto,
    readPrivatePhotoUploadSourceObject,
    readPrivateSourceBuffer,
    readPrivateSourceObject,
    sendRouteError,
    getPhotoAsset,
    writePrivateObject,
    writePublicObject
};
