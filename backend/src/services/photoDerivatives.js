const sharp = require('sharp');
const {
    DEFAULT_CROP_PROFILE,
    PHOTO_CROP_PRESETS,
    buildDefaultCropProfiles,
    findPhotoCropPreset,
    normalizeCropProfiles,
    parseCropProfile
} = require('@portfolio/photo-crop-contract');
const {
    PRIVATE_PREFIX,
    PRIVATE_SOURCE_PREFIX,
    PUBLIC_UPLOADS_PREFIX
} = require('../config/assetPaths');
const {
    normalizeMediaGeneration
} = require('../utils/mediaGeneration');
const {
    PHOTO_ASSET_REPLACEMENT_GROUPS,
    normalizePhotoAssetReplacementGroup
} = require('./photoAssetLifecycle');

function normalizeUploadsPath(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    if (raw.startsWith(`${PUBLIC_UPLOADS_PREFIX}/`)) {
        return raw;
    }

    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            const pathname = String(parsed.pathname || '').replace(/^\/+/, '');
            const publicPrefix = PUBLIC_UPLOADS_PREFIX.replace(/^\/+/, '');
            const key = pathname.startsWith(`${publicPrefix}/`)
                ? pathname.slice(publicPrefix.length + 1)
                : pathname;
            return key ? `${PUBLIC_UPLOADS_PREFIX}/${key}` : '';
        } catch {
            return '';
        }
    }

    const normalized = raw.replace(/^\/+/, '');
    const publicPrefix = PUBLIC_UPLOADS_PREFIX.replace(/^\/+/, '');
    const key = normalized.startsWith(`${publicPrefix}/`)
        ? normalized.slice(publicPrefix.length + 1)
        : normalized;
    return key ? `${PUBLIC_UPLOADS_PREFIX}/${key}` : '';
}

function normalizePrivatePath(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    if (raw.startsWith(`${PRIVATE_PREFIX}/`)) {
        return raw;
    }

    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            const pathname = String(parsed.pathname || '').replace(/^\/+/, '');
            const privatePrefix = PRIVATE_PREFIX.replace(/^\/+/, '');
            const key = pathname.startsWith(`${privatePrefix}/`)
                ? pathname.slice(privatePrefix.length + 1)
                : pathname;
            return key ? `${PRIVATE_PREFIX}/${key}` : '';
        } catch {
            return '';
        }
    }

    const normalized = raw.replace(/^\/+/, '');
    const privatePrefix = PRIVATE_PREFIX.replace(/^\/+/, '');
    const key = normalized.startsWith(`${privatePrefix}/`)
        ? normalized.slice(privatePrefix.length + 1)
        : normalized;
    return key ? `${PRIVATE_PREFIX}/${key}` : '';
}

function normalizePrivateSourcePath(value) {
    const normalized = normalizePrivatePath(value);
    if (!normalized.startsWith(`${PRIVATE_SOURCE_PREFIX}/`)) return '';

    const relativePath = normalized.slice(`${PRIVATE_SOURCE_PREFIX}/`.length);
    const isGeneratedPath = /^photos\/[1-9][0-9]*\/[0-9A-HJKMNP-TV-Z]{26}\/source\.[a-z0-9]+$/.test(relativePath);
    if (!isGeneratedPath) return '';
    return normalized;
}

function normalizePrivateSourcePathForPhotoId(value, photoId) {
    const normalized = normalizePrivateSourcePath(value);
    if (!normalized) return '';

    const generatedPrefix = `${PRIVATE_SOURCE_PREFIX}/photos/${photoId}/`;
    if (!normalized.startsWith(generatedPrefix)) return '';
    return normalized;
}

function normalizeAssetFileName(value) {
    const fileName = String(value || '').trim();
    if (
        !/^[a-z0-9][a-z0-9._-]{0,119}$/i.test(fileName)
        || fileName.includes('..')
    ) {
        throw new TypeError('Nome file asset non valido.');
    }
    return fileName;
}

function materializePhotoAsset(photoId, mediaGeneration, producedAsset) {
    const normalizedPhotoId = String(photoId || '').trim();
    if (!/^[1-9][0-9]*$/.test(normalizedPhotoId)) {
        throw new TypeError('ID foto non valido per il path media.');
    }
    const generation = normalizeMediaGeneration(mediaGeneration, { required: true });
    const role = String(producedAsset?.role || '').trim().toLowerCase();
    const scope = String(producedAsset?.scope || '').trim().toLowerCase();
    const contentType = String(producedAsset?.contentType || '').trim().toLowerCase();
    const replacementGroup = normalizePhotoAssetReplacementGroup(
        producedAsset?.replacementGroup
    );
    if (!/^[a-z][a-z0-9-]{1,79}$/.test(role)) {
        throw new TypeError('Ruolo asset non valido.');
    }
    if (!['public', 'private'].includes(scope)) {
        throw new TypeError('Scope asset non valido.');
    }
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(contentType)) {
        throw new TypeError('Content-Type asset non valido.');
    }
    const fileName = normalizeAssetFileName(producedAsset?.fileName);
    const base = scope === 'public'
        ? `${PUBLIC_UPLOADS_PREFIX}/photos/${normalizedPhotoId}/${generation}`
        : `${PRIVATE_SOURCE_PREFIX}/photos/${normalizedPhotoId}/${generation}`;
    return {
        ...producedAsset,
        role,
        scope,
        contentType,
        replacementGroup,
        fileName,
        path: `${base}/${fileName}`,
        photoId: Number(normalizedPhotoId),
        generation
    };
}

function materializePhotoAssets(photoId, mediaGeneration, producedAssets) {
    const assets = (Array.isArray(producedAssets) ? producedAssets : [])
        .map((asset) => materializePhotoAsset(photoId, mediaGeneration, asset));
    const roles = new Set();
    for (const asset of assets) {
        if (roles.has(asset.role)) {
            throw new TypeError(`Ruolo asset duplicato: ${asset.role}.`);
        }
        roles.add(asset.role);
    }
    return assets;
}

function buildPhotoCreationSourcePath(uploadIntentId, sourceExtension = 'bin') {
    const normalizedIntentId = String(uploadIntentId || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalizedIntentId)) {
        throw new TypeError('uploadIntentId non valido per il path source.');
    }
    const cleanSourceExtension = String(sourceExtension || 'bin')
        .replace(/[^a-z0-9]/gi, '')
        || 'bin';
    return `${PRIVATE_SOURCE_PREFIX}/photo-creation-intents/${normalizedIntentId}/source.${cleanSourceExtension}`;
}

function getCropProfilesFromSettings(settings) {
    if (typeof settings === 'string') {
        try {
            return getCropProfilesFromSettings(JSON.parse(settings));
        } catch {
            return null;
        }
    }
    if (!settings || typeof settings !== 'object') return null;
    const rawProfiles = settings.cropProfiles;
    if (!rawProfiles || typeof rawProfiles !== 'object') return null;
    const profiles = normalizeCropProfiles(rawProfiles, {
        includeDefaults: false,
        preserveUnknown: false
    });
    return Object.keys(profiles).length > 0 ? profiles : null;
}

function normalizeCropProfilesForStorage(settings) {
    const rawProfiles = settings && typeof settings === 'object'
        ? settings.cropProfiles
        : null;
    return normalizeCropProfiles(rawProfiles, {
        includeDefaults: true,
        preserveUnknown: true
    });
}

function mergePhotoSettingsForStorage(currentSettings, settingsPatch) {
    const current = currentSettings && typeof currentSettings === 'object'
        && !Array.isArray(currentSettings)
        ? currentSettings
        : {};
    const patch = settingsPatch && typeof settingsPatch === 'object'
        && !Array.isArray(settingsPatch)
        ? settingsPatch
        : {};
    const merged = {
        ...current,
        ...patch
    };

    if (!Object.prototype.hasOwnProperty.call(patch, 'cropProfiles')) {
        return merged;
    }

    const currentProfiles = current.cropProfiles
        && typeof current.cropProfiles === 'object'
        && !Array.isArray(current.cropProfiles)
        ? current.cropProfiles
        : {};
    const incomingProfiles = patch.cropProfiles
        && typeof patch.cropProfiles === 'object'
        && !Array.isArray(patch.cropProfiles)
        ? patch.cropProfiles
        : {};
    const currentPresetKeys = new Set(PHOTO_CROP_PRESETS.map((preset) => preset.key));
    const historicalProfiles = Object.fromEntries(
        Object.entries(currentProfiles).filter(([key]) => !currentPresetKeys.has(key))
    );

    merged.cropProfiles = normalizeCropProfiles({
        ...historicalProfiles,
        ...incomingProfiles
    }, {
        includeDefaults: true,
        preserveUnknown: true
    });
    return merged;
}

function computeCoverCropRegion(sourceWidth, sourceHeight, targetWidth, targetHeight, cropProfile = null) {
    const srcW = Number(sourceWidth);
    const srcH = Number(sourceHeight);
    const dstW = Number(targetWidth);
    const dstH = Number(targetHeight);

    if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW <= 0 || srcH <= 0) {
        return null;
    }
    if (!Number.isFinite(dstW) || !Number.isFinite(dstH) || dstW <= 0 || dstH <= 0) {
        return null;
    }

    const targetRatio = dstW / dstH;
    const sourceRatio = srcW / srcH;

    let cropWidth = srcW;
    let cropHeight = srcH;

    if (sourceRatio > targetRatio) {
        cropWidth = Math.round(srcH * targetRatio);
    } else if (sourceRatio < targetRatio) {
        cropHeight = Math.round(srcW / targetRatio);
    }

    cropWidth = Math.max(1, Math.min(srcW, cropWidth));
    cropHeight = Math.max(1, Math.min(srcH, cropHeight));

    const normalizedProfile = parseCropProfile(cropProfile);
    const scale = normalizedProfile?.scale || 1;
    if (scale > 1) {
        cropWidth = Math.max(1, Math.min(srcW, Math.round(cropWidth / scale)));
        cropHeight = Math.max(1, Math.min(srcH, Math.round(cropHeight / scale)));
    }

    const focusX = (normalizedProfile?.x ?? 0.5) * srcW;
    const focusY = (normalizedProfile?.y ?? 0.5) * srcH;
    const maxLeft = srcW - cropWidth;
    const maxTop = srcH - cropHeight;

    let left = Math.round(focusX - cropWidth / 2);
    let top = Math.round(focusY - cropHeight / 2);
    left = Math.max(0, Math.min(maxLeft, left));
    top = Math.max(0, Math.min(maxTop, top));

    return {
        left,
        top,
        width: cropWidth,
        height: cropHeight
    };
}

// Keep this standalone so maintenance jobs can create only the mobile asset
// without regenerating the desktop image, thumbnails and social card.
function generateMobileImageDerivative(sourceBuffer) {
    return sharp(sourceBuffer)
        .rotate()
        .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 5 })
        .toBuffer();
}

// This catalog is the only place that defines generated photo variants. Crop
// preset definitions live in the shared contract; cropPresetKey is the explicit
// relation between the two catalogs. Writing, registry, API projection and
// cleanup all consume the resulting asset descriptors.
function definePhotoDerivativeVariant(definition, {
    cropPresets = PHOTO_CROP_PRESETS
} = {}) {
    const cropPresetKey = definition?.cropPresetKey === undefined
        || definition?.cropPresetKey === null
        || String(definition.cropPresetKey).trim() === ''
        ? null
        : String(definition.cropPresetKey).trim().toLowerCase();
    const variant = {
        searchIndexing: 'secondary',
        ...definition,
        cropPresetKey,
        replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES
    };

    if (cropPresetKey) {
        const preset = findPhotoCropPreset(cropPresetKey, cropPresets);
        if (!preset) {
            throw new TypeError(
                `La variante ${variant.role || '(senza ruolo)'} usa un preset crop inesistente: ${cropPresetKey}.`
            );
        }
        const outputWidth = Number(variant.outputWidth);
        const outputHeight = Number(variant.outputHeight);
        if (
            !Number.isSafeInteger(outputWidth)
            || !Number.isSafeInteger(outputHeight)
            || outputWidth <= 0
            || outputHeight <= 0
        ) {
            throw new TypeError(`Dimensioni crop non valide per la variante ${variant.role}.`);
        }
        if (Math.abs((outputWidth / outputHeight) - preset.ratioValue) > 1e-9) {
            throw new TypeError(
                `Il rapporto della variante ${variant.role} non coincide con il preset ${cropPresetKey}.`
            );
        }
        if (typeof variant.encode !== 'function') {
            throw new TypeError(`Encoder crop mancante per la variante ${variant.role}.`);
        }
        if (typeof variant.produce === 'function') {
            throw new TypeError(
                `La variante ${variant.role} non può definire sia cropPresetKey sia produce.`
            );
        }
    } else if (typeof variant.produce !== 'function') {
        throw new TypeError(`Producer mancante per la variante ${variant.role}.`);
    }

    return Object.freeze(variant);
}

const PHOTO_DERIVATIVE_VARIANTS = Object.freeze([
    definePhotoDerivativeVariant({
        role: 'full',
        scope: 'public',
        fileName: 'full.webp',
        contentType: 'image/webp',
        searchIndexing: 'canonical',
        produce: ({ base }) => base
            .clone()
            .resize(3840, 2160, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 92, effort: 6 })
            .toBuffer()
    }),
    definePhotoDerivativeVariant({
        role: 'mobile',
        scope: 'public',
        fileName: 'mobile.webp',
        contentType: 'image/webp',
        produce: ({ sourceBuffer }) => generateMobileImageDerivative(sourceBuffer)
    }),
    definePhotoDerivativeVariant({
        role: 'thumbnail-4x3',
        scope: 'public',
        fileName: 'thumbnail-4x3.webp',
        contentType: 'image/webp',
        cropPresetKey: 'r43',
        outputWidth: 400,
        outputHeight: 300,
        encode: (pipeline) => pipeline.webp({ quality: 84, effort: 5 }).toBuffer()
    }),
    definePhotoDerivativeVariant({
        role: 'thumbnail-1x1',
        scope: 'public',
        fileName: 'thumbnail-1x1.webp',
        contentType: 'image/webp',
        cropPresetKey: 'r11',
        outputWidth: 400,
        outputHeight: 400,
        encode: (pipeline) => pipeline.webp({ quality: 84, effort: 5 }).toBuffer()
    }),
    definePhotoDerivativeVariant({
        role: 'social',
        scope: 'public',
        fileName: 'social.jpg',
        contentType: 'image/jpeg',
        cropPresetKey: 'social',
        outputWidth: 1200,
        outputHeight: 630,
        encode: (pipeline) => pipeline
            .jpeg({ quality: 84, mozjpeg: true, progressive: true })
            .toBuffer()
    })
]);

async function generatePhotoDerivatives(
    sourceBuffer,
    cropProfiles = null,
    variants = PHOTO_DERIVATIVE_VARIANTS,
    { cropPresets = PHOTO_CROP_PRESETS } = {}
) {
    const base = sharp(sourceBuffer).rotate();
    const metadata = await base.metadata();

    const orientation = Number(metadata.orientation || 1);
    const rawWidth = Number(metadata.width || 0);
    const rawHeight = Number(metadata.height || 0);
    const sourceWidth = [5, 6, 7, 8].includes(orientation) ? rawHeight : rawWidth;
    const sourceHeight = [5, 6, 7, 8].includes(orientation) ? rawWidth : rawHeight;
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
        throw new Error('Impossibile estrarre una risoluzione valida dal source originale.');
    }
    const normalizedProfiles = normalizeCropProfiles(cropProfiles, {
        presets: cropPresets,
        includeDefaults: false,
        preserveUnknown: false
    });
    const normalizedVariants = variants.map((variant) => (
        definePhotoDerivativeVariant(variant, { cropPresets })
    ));

    const createCoverDerivative = async (targetWidth, targetHeight, profile, outputBuilder) => {
        const cropRegion = computeCoverCropRegion(
            sourceWidth,
            sourceHeight,
            targetWidth,
            targetHeight,
            profile || DEFAULT_CROP_PROFILE
        );
        if (!cropRegion) {
            return outputBuilder(
                base.clone().resize(targetWidth, targetHeight, { fit: 'cover', position: 'centre' })
            );
        }

        return outputBuilder(
            base
                .clone()
                .extract(cropRegion)
                .resize(targetWidth, targetHeight, { fit: 'fill' })
        );
    };

    const assets = await Promise.all(normalizedVariants.map(async (variant) => {
        const buffer = variant.cropPresetKey
            ? await createCoverDerivative(
                variant.outputWidth,
                variant.outputHeight,
                parseCropProfile(normalizedProfiles[variant.cropPresetKey])
                    || DEFAULT_CROP_PROFILE,
                variant.encode
            )
            : await variant.produce({
                base,
                sourceBuffer,
                cropProfiles: normalizedProfiles,
                createCoverDerivative
            });
        return {
            role: variant.role,
            scope: variant.scope,
            fileName: variant.fileName,
            contentType: variant.contentType,
            replacementGroup: normalizePhotoAssetReplacementGroup(
                variant.replacementGroup
            ),
            buffer
        };
    }));

    const width = Math.round(sourceWidth);
    const height = Math.round(sourceHeight);

    return {
        assets,
        width,
        height,
        resolution: `${width}x${height}`
    };
}

module.exports = {
    buildPhotoCreationSourcePath,
    DEFAULT_CROP_PROFILE,
    PHOTO_CROP_PRESETS,
    PHOTO_DERIVATIVE_VARIANTS,
    PHOTO_ASSET_REPLACEMENT_GROUPS,
    materializePhotoAsset,
    materializePhotoAssets,
    normalizeMediaGeneration,
    buildDefaultCropProfiles,
    definePhotoDerivativeVariant,
    generateMobileImageDerivative,
    generatePhotoDerivatives,
    getCropProfilesFromSettings,
    mergePhotoSettingsForStorage,
    normalizeCropProfilesForStorage,
    normalizePrivateSourcePath,
    normalizePrivateSourcePathForPhotoId,
    normalizePrivatePath,
    normalizeUploadsPath
};
