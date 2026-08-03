const sharp = require('sharp');
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

function clamp01(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(1, numeric));
}

function clampScale(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(1, Math.min(5, numeric));
}

function normalizeCropProfile(rawProfile) {
    if (!rawProfile || typeof rawProfile !== 'object') return null;
    const x = clamp01(rawProfile.x);
    const y = clamp01(rawProfile.y);
    const scale = clampScale(rawProfile.scale);
    if (x === null || y === null || scale === null) return null;
    return { x, y, scale };
}

const DEFAULT_CROP_PROFILE = Object.freeze({
    x: 0.5,
    y: 0.5,
    scale: 1
});

function buildDefaultCropProfiles() {
    return {
        r43: { ...DEFAULT_CROP_PROFILE },
        r11: { ...DEFAULT_CROP_PROFILE },
        social: { ...DEFAULT_CROP_PROFILE }
    };
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

    const profiles = {};
    const r43 = normalizeCropProfile(rawProfiles.r43);
    const r11 = normalizeCropProfile(rawProfiles.r11);
    const social = normalizeCropProfile(rawProfiles.social);

    if (r43) profiles.r43 = r43;
    if (r11) profiles.r11 = r11;
    if (social) profiles.social = social;

    return Object.keys(profiles).length > 0 ? profiles : null;
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

    const normalizedProfile = normalizeCropProfile(cropProfile);
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

// This catalog is the only place that defines generated photo variants. A new
// variant supplies its storage metadata and producer here; writing, registry,
// API projection and cleanup all consume the resulting asset descriptors.
function definePhotoDerivativeVariant(definition) {
    return Object.freeze({
        ...definition,
        replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES
    });
}

const PHOTO_DERIVATIVE_VARIANTS = Object.freeze([
    definePhotoDerivativeVariant({
        role: 'full',
        scope: 'public',
        fileName: 'full.webp',
        contentType: 'image/webp',
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
        produce: ({ createCoverDerivative, cropProfiles }) => createCoverDerivative(
            400,
            300,
            normalizeCropProfile(cropProfiles?.r43) || DEFAULT_CROP_PROFILE,
            (pipeline) => pipeline.webp({ quality: 84, effort: 5 }).toBuffer()
        )
    }),
    definePhotoDerivativeVariant({
        role: 'thumbnail-1x1',
        scope: 'public',
        fileName: 'thumbnail-1x1.webp',
        contentType: 'image/webp',
        produce: ({ createCoverDerivative, cropProfiles }) => createCoverDerivative(
            400,
            400,
            normalizeCropProfile(cropProfiles?.r11) || DEFAULT_CROP_PROFILE,
            (pipeline) => pipeline.webp({ quality: 84, effort: 5 }).toBuffer()
        )
    }),
    definePhotoDerivativeVariant({
        role: 'social',
        scope: 'public',
        fileName: 'social.jpg',
        contentType: 'image/jpeg',
        produce: ({ createCoverDerivative, cropProfiles }) => createCoverDerivative(
            1200,
            630,
            normalizeCropProfile(cropProfiles?.social) || DEFAULT_CROP_PROFILE,
            (pipeline) => pipeline
                .jpeg({ quality: 84, mozjpeg: true, progressive: true })
                .toBuffer()
        )
    })
]);

function listPhotoDerivativeAssetDescriptors() {
    return PHOTO_DERIVATIVE_VARIANTS.map(({
        role,
        scope,
        fileName,
        contentType,
        replacementGroup
    }) => ({ role, scope, fileName, contentType, replacementGroup }));
}

async function generatePhotoDerivatives(
    sourceBuffer,
    cropProfiles = null,
    variants = PHOTO_DERIVATIVE_VARIANTS
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
    const normalizedProfiles = cropProfiles && typeof cropProfiles === 'object' ? cropProfiles : null;

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

    const assets = await Promise.all(variants.map(async (variant) => ({
        role: variant.role,
        scope: variant.scope,
        fileName: variant.fileName,
        contentType: variant.contentType,
        replacementGroup: normalizePhotoAssetReplacementGroup(
            variant.replacementGroup
        ),
        buffer: await variant.produce({
            base,
            sourceBuffer,
            cropProfiles: normalizedProfiles,
            createCoverDerivative
        })
    })));

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
    PHOTO_DERIVATIVE_VARIANTS,
    PHOTO_ASSET_REPLACEMENT_GROUPS,
    listPhotoDerivativeAssetDescriptors,
    materializePhotoAsset,
    materializePhotoAssets,
    normalizeMediaGeneration,
    buildDefaultCropProfiles,
    generateMobileImageDerivative,
    generatePhotoDerivatives,
    getCropProfilesFromSettings,
    normalizePrivateSourcePath,
    normalizePrivateSourcePathForPhotoId,
    normalizePrivatePath,
    normalizeUploadsPath
};
