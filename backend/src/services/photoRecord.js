const {
    normalizeOperationalPhotoAssetDescriptor,
    normalizePublishedPhotoAssetInventory,
    PHOTO_ASSET_REPLACEMENT_GROUPS
} = require('./photoAssetLifecycle');

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonIfString(value, fallback) {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function toTrimmedString(value, fallback = '') {
    if (value === undefined || value === null) return fallback;
    const normalized = String(value).trim();
    return normalized || fallback;
}

function toFiniteNumberOr(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTags(value) {
    const parsed = parseJsonIfString(value, []);
    if (!Array.isArray(parsed)) return [];
    return parsed
        .map((tag) => toTrimmedString(tag))
        .filter(Boolean);
}

function pickFirstNonEmpty(...values) {
    for (const value of values) {
        const normalized = toTrimmedString(value);
        if (normalized) return normalized;
    }
    return '';
}

function normalizeSettings(settingsValue, exif = {}, cropProfiles = null) {
    const settings = isPlainObject(parseJsonIfString(settingsValue, {}))
        ? parseJsonIfString(settingsValue, {})
        : {};

    const nextSettings = {};
    const aperture = pickFirstNonEmpty(exif.aperture, settings.aperture);
    const shutter = pickFirstNonEmpty(exif.shutter, settings.shutter);
    const iso = pickFirstNonEmpty(exif.iso, settings.iso);
    const focal = pickFirstNonEmpty(exif.focal, settings.focal);

    if (aperture) nextSettings.aperture = aperture;
    if (shutter) nextSettings.shutter = shutter;
    if (iso) nextSettings.iso = iso;
    if (focal) nextSettings.focal = focal;
    if (isPlainObject(cropProfiles)) nextSettings.cropProfiles = cropProfiles;

    return nextSettings;
}

function buildLegacyAssetInventory(record, photoId, mediaGeneration) {
    if (Array.isArray(record.assets)) {
        return normalizePublishedPhotoAssetInventory(record.assets, {
            photoId,
            mediaGeneration
        });
    }
    const sourceObject = isPlainObject(record.source) ? record.source : {};
    const sourcePath = pickFirstNonEmpty(sourceObject.path);
    if (sourcePath && sourcePath.startsWith('/private/')) {
        return [normalizeOperationalPhotoAssetDescriptor({
            role: 'source',
            replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.SOURCE,
            scope: 'private',
            path: sourcePath,
            contentType: pickFirstNonEmpty(
                sourceObject.contentType,
                'application/octet-stream'
            ),
            generation: mediaGeneration || null
        }, { photoId })];
    }
    return [];
}

function toRuntimePhotoInternal(record, { legacy = false } = {}) {
    if (!isPlainObject(record)) return record;

    const locationObject = isPlainObject(record.location) ? record.location : {};
    const exifObject = isPlainObject(record.exif) ? record.exif : {};
    const sourceObject = isPlainObject(record.source) ? record.source : {};
    const compositionObject = isPlainObject(record.composition) ? record.composition : {};
    const cropProfiles = isPlainObject(compositionObject.cropProfiles) ? compositionObject.cropProfiles : null;

    const mediaGeneration = toTrimmedString(record.mediaGeneration);
    const photoId = Number.isFinite(Number(record.id)) ? Number(record.id) : record.id;
    const assets = legacy
        ? buildLegacyAssetInventory(record, photoId, mediaGeneration)
        : normalizePublishedPhotoAssetInventory(record.assets, {
            photoId,
            mediaGeneration
        });
    const sourceAsset = assets.find((asset) => asset.role === 'source');
    const sourcePath = sourceAsset?.path
        || (legacy ? pickFirstNonEmpty(sourceObject.path) : '');

    const runtimePhoto = {
        id: photoId,
        title: toTrimmedString(record.title, 'Foto senza titolo'),
        description: toTrimmedString(record.description),
        date: toTrimmedString(record.date),
        location: pickFirstNonEmpty(locationObject.name, locationObject.label, 'Posizione sconosciuta'),
        lat: toFiniteNumberOr(locationObject.lat, 0),
        lng: toFiniteNumberOr(locationObject.lng, 0),
        camera: pickFirstNonEmpty(exifObject.camera),
        lens: pickFirstNonEmpty(exifObject.lens),
        resolution: pickFirstNonEmpty(exifObject.resolution),
        settings: normalizeSettings({}, exifObject, cropProfiles),
        tags: normalizeTags(record.tags),
        sourcePath,
        sourceContentType: sourceAsset?.contentType
            || (legacy ? pickFirstNonEmpty(sourceObject.contentType) : ''),
        mobileImage: assets.some((asset) => asset.role === 'mobile')
            || (legacy && Boolean(record.mobileImage)),
        updatedAt: Number.isFinite(Number(record.updatedAt))
            ? Number(record.updatedAt)
            : 0,
        derivativesVersion: Number.isFinite(Number(record.derivativesVersion))
            ? Number(record.derivativesVersion)
            : (Number.isFinite(Number(record.id)) ? Number(record.id) : 0),
        mediaGeneration,
        assets
    };

    return runtimePhoto;
}

function toRuntimePhoto(record) {
    return toRuntimePhotoInternal(record);
}

// Temporary read-only bridge for the JSON adapter until the Postgres cutover.
// It never invents public derivatives and canonical snapshots never use it.
function toLegacyRuntimePhoto(record) {
    return toRuntimePhotoInternal(record, { legacy: true });
}

function compactObject(input) {
    if (!isPlainObject(input)) return input;
    const entries = Object.entries(input).filter(([, value]) => {
        if (value === undefined || value === null) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        if (isPlainObject(value)) return Object.keys(compactObject(value)).length > 0;
        return true;
    });
    return Object.fromEntries(entries);
}

function toStoragePhotoInternal(runtimePhoto, { legacy = false } = {}) {
    if (!isPlainObject(runtimePhoto)) return runtimePhoto;

    const settings = isPlainObject(parseJsonIfString(runtimePhoto.settings, {}))
        ? parseJsonIfString(runtimePhoto.settings, {})
        : {};
    const photoId = Number.isFinite(Number(runtimePhoto.id))
        ? Number(runtimePhoto.id)
        : runtimePhoto.id;
    const mediaGeneration = toTrimmedString(runtimePhoto.mediaGeneration);
    const hasExplicitInventory = Array.isArray(runtimePhoto.assets)
        && runtimePhoto.assets.length > 0;
    const inventory = legacy && !hasExplicitInventory
        ? []
        : normalizePublishedPhotoAssetInventory(runtimePhoto.assets, {
            photoId,
            mediaGeneration
        });
    const storageAssets = inventory.map(({
        role,
        replacementGroup,
        scope,
        path,
        contentType,
        generation
    }) => ({
        role,
        replacementGroup,
        scope,
        path,
        contentType,
        generation
    }));
    const photo = {
        id: photoId,
        title: toTrimmedString(runtimePhoto.title, 'Foto senza titolo'),
        description: toTrimmedString(runtimePhoto.description),
        date: toTrimmedString(runtimePhoto.date),
        location: toTrimmedString(runtimePhoto.location, 'Posizione sconosciuta'),
        lat: toFiniteNumberOr(runtimePhoto.lat, 0),
        lng: toFiniteNumberOr(runtimePhoto.lng, 0),
        camera: toTrimmedString(runtimePhoto.camera),
        lens: toTrimmedString(runtimePhoto.lens),
        resolution: toTrimmedString(runtimePhoto.resolution),
        settings,
        tags: normalizeTags(runtimePhoto.tags),
        updatedAt: Number.isFinite(Number(runtimePhoto.updatedAt))
            ? Number(runtimePhoto.updatedAt)
            : 0,
        derivativesVersion: Number.isFinite(Number(runtimePhoto.derivativesVersion))
            ? Number(runtimePhoto.derivativesVersion)
            : Date.now(),
        mediaGeneration,
        assets: storageAssets
    };

    const cropProfiles = isPlainObject(photo.settings?.cropProfiles) ? photo.settings.cropProfiles : null;
    const exif = compactObject({
        camera: toTrimmedString(photo.camera),
        lens: toTrimmedString(photo.lens),
        resolution: toTrimmedString(photo.resolution),
        aperture: toTrimmedString(photo.settings?.aperture),
        shutter: toTrimmedString(photo.settings?.shutter),
        iso: toTrimmedString(photo.settings?.iso),
        focal: toTrimmedString(photo.settings?.focal)
    });

    return {
        id: photo.id,
        title: photo.title,
        description: photo.description,
        date: photo.date,
        location: {
            name: photo.location,
            lat: toFiniteNumberOr(photo.lat, 0),
            lng: toFiniteNumberOr(photo.lng, 0)
        },
        ...(Object.keys(exif).length ? { exif } : {}),
        ...(cropProfiles ? { composition: { cropProfiles } } : {}),
        tags: normalizeTags(photo.tags),
        ...(photo.assets.length ? { assets: photo.assets } : {}),
        ...(legacy && !photo.assets.length && toTrimmedString(runtimePhoto.sourcePath)
            ? {
                source: {
                    path: toTrimmedString(runtimePhoto.sourcePath),
                    contentType: toTrimmedString(
                        runtimePhoto.sourceContentType,
                        'application/octet-stream'
                    )
                },
                mobileImage: Boolean(runtimePhoto.mobileImage)
            }
            : {}),
        ...(photo.updatedAt > 0 ? { updatedAt: photo.updatedAt } : {}),
        derivativesVersion: Number.isFinite(Number(photo.derivativesVersion))
            ? Number(photo.derivativesVersion)
            : Date.now(),
        ...(photo.mediaGeneration ? { mediaGeneration: photo.mediaGeneration } : {})
    };
}

function toStoragePhoto(runtimePhoto) {
    return toStoragePhotoInternal(runtimePhoto);
}

function toLegacyStoragePhoto(runtimePhoto) {
    return toStoragePhotoInternal(runtimePhoto, { legacy: true });
}

module.exports = {
    toLegacyRuntimePhoto,
    toLegacyStoragePhoto,
    toRuntimePhoto,
    toStoragePhoto
};
