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

function toRuntimePhoto(record) {
    if (!isPlainObject(record)) return record;

    const locationObject = isPlainObject(record.location) ? record.location : {};
    const exifObject = isPlainObject(record.exif) ? record.exif : {};
    const sourceObject = isPlainObject(record.source) ? record.source : {};
    const compositionObject = isPlainObject(record.composition) ? record.composition : {};
    const cropProfiles = isPlainObject(compositionObject.cropProfiles) ? compositionObject.cropProfiles : null;

    const runtimePhoto = {
        id: Number.isFinite(Number(record.id)) ? Number(record.id) : record.id,
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
        sourcePath: pickFirstNonEmpty(sourceObject.path),
        sourceContentType: pickFirstNonEmpty(sourceObject.contentType),
        mobileImage: Boolean(record.mobileImage),
        updatedAt: Number.isFinite(Number(record.updatedAt))
            ? Number(record.updatedAt)
            : 0,
        derivativesVersion: Number.isFinite(Number(record.derivativesVersion))
            ? Number(record.derivativesVersion)
            : Date.now()
    };

    return runtimePhoto;
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

function toStoragePhoto(runtimePhoto) {
    if (!isPlainObject(runtimePhoto)) return runtimePhoto;

    const settings = isPlainObject(parseJsonIfString(runtimePhoto.settings, {}))
        ? parseJsonIfString(runtimePhoto.settings, {})
        : {};
    const photo = {
        id: Number.isFinite(Number(runtimePhoto.id)) ? Number(runtimePhoto.id) : runtimePhoto.id,
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
        sourcePath: toTrimmedString(runtimePhoto.sourcePath),
        sourceContentType: toTrimmedString(runtimePhoto.sourceContentType),
        mobileImage: Boolean(runtimePhoto.mobileImage),
        updatedAt: Number.isFinite(Number(runtimePhoto.updatedAt))
            ? Number(runtimePhoto.updatedAt)
            : 0,
        derivativesVersion: Number.isFinite(Number(runtimePhoto.derivativesVersion))
            ? Number(runtimePhoto.derivativesVersion)
            : Date.now()
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

    const source = compactObject({
        path: toTrimmedString(photo.sourcePath),
        contentType: toTrimmedString(photo.sourceContentType)
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
        ...(Object.keys(source).length ? { source } : {}),
        ...(photo.mobileImage ? { mobileImage: true } : {}),
        ...(photo.updatedAt > 0 ? { updatedAt: photo.updatedAt } : {}),
        derivativesVersion: Number.isFinite(Number(photo.derivativesVersion))
            ? Number(photo.derivativesVersion)
            : Date.now()
    };
}

module.exports = {
    toRuntimePhoto,
    toStoragePhoto
};
