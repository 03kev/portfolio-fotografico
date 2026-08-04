const DEFAULT_CROP_PROFILE = Object.freeze({
    x: 0.5,
    y: 0.5,
    scale: 1
});

const CROP_PROFILE_LIMITS = Object.freeze({
    x: Object.freeze({ min: 0, max: 1 }),
    y: Object.freeze({ min: 0, max: 1 }),
    scale: Object.freeze({ min: 1, max: 5 })
});

function normalizePresetKey(value) {
    const key = String(value || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(key)) {
        throw new TypeError('Chiave preset crop non valida.');
    }
    return key;
}

function normalizePositiveDimension(value, fieldName) {
    const dimension = Number(value);
    if (!Number.isSafeInteger(dimension) || dimension <= 0) {
        throw new TypeError(`${fieldName} del preset crop non valida.`);
    }
    return dimension;
}

function definePhotoCropPreset(definition) {
    const key = normalizePresetKey(definition?.key);
    const label = String(definition?.label || '').trim();
    const shortLabel = String(definition?.shortLabel || '').trim();
    const width = normalizePositiveDimension(definition?.width, 'Larghezza');
    const height = normalizePositiveDimension(definition?.height, 'Altezza');
    if (!label || !shortLabel) {
        throw new TypeError('Label del preset crop mancante.');
    }
    return Object.freeze({
        key,
        label,
        shortLabel,
        width,
        height,
        ratio: `${width} / ${height}`,
        ratioValue: width / height
    });
}

function createPhotoCropPresetCatalog(definitions) {
    if (!Array.isArray(definitions) || definitions.length === 0) {
        throw new TypeError('Il catalogo preset crop non può essere vuoto.');
    }
    const presets = definitions.map(definePhotoCropPreset);
    const keys = new Set();
    for (const preset of presets) {
        if (keys.has(preset.key)) {
            throw new TypeError(`Preset crop duplicato: ${preset.key}.`);
        }
        keys.add(preset.key);
    }
    return Object.freeze(presets);
}

const PHOTO_CROP_PRESETS = createPhotoCropPresetCatalog([
    { key: 'r43', label: 'Archivio 4:3', shortLabel: '4:3', width: 4, height: 3 },
    { key: 'r11', label: 'Home 1:1', shortLabel: '1:1', width: 1, height: 1 },
    {
        key: 'social',
        label: 'Social 1200x630',
        shortLabel: '1200×630',
        width: 1200,
        height: 630
    }
]);

function findPhotoCropPreset(key, presets = PHOTO_CROP_PRESETS) {
    const normalizedKey = String(key || '').trim().toLowerCase();
    return presets.find((preset) => preset.key === normalizedKey) || null;
}

function clamp(value, { min, max }) {
    return Math.max(min, Math.min(max, value));
}

function parseCropProfile(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const scale = Number(value.scale);
    if (![x, y, scale].every(Number.isFinite)) return null;
    return {
        x: clamp(x, CROP_PROFILE_LIMITS.x),
        y: clamp(y, CROP_PROFILE_LIMITS.y),
        scale: clamp(scale, CROP_PROFILE_LIMITS.scale)
    };
}

function normalizeCropProfile(value) {
    return parseCropProfile(value) || { ...DEFAULT_CROP_PROFILE };
}

function normalizeCropProfiles(value, {
    presets = PHOTO_CROP_PRESETS,
    includeDefaults = true,
    preserveUnknown = true
} = {}) {
    const raw = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    const knownKeys = new Set(presets.map((preset) => preset.key));
    const normalized = {};

    if (preserveUnknown) {
        for (const [key, profile] of Object.entries(raw)) {
            if (
                !knownKeys.has(key)
                && !['__proto__', 'prototype', 'constructor'].includes(key)
            ) {
                normalized[key] = profile;
            }
        }
    }

    for (const preset of presets) {
        const profile = parseCropProfile(raw[preset.key]);
        if (profile) {
            normalized[preset.key] = profile;
        } else if (includeDefaults) {
            normalized[preset.key] = { ...DEFAULT_CROP_PROFILE };
        }
    }
    return normalized;
}

function buildDefaultCropProfiles(presets = PHOTO_CROP_PRESETS) {
    return normalizeCropProfiles(null, {
        presets,
        includeDefaults: true,
        preserveUnknown: false
    });
}

module.exports = {
    CROP_PROFILE_LIMITS,
    DEFAULT_CROP_PROFILE,
    PHOTO_CROP_PRESETS,
    buildDefaultCropProfiles,
    createPhotoCropPresetCatalog,
    definePhotoCropPreset,
    findPhotoCropPreset,
    normalizeCropProfile,
    normalizeCropProfiles,
    parseCropProfile
};
