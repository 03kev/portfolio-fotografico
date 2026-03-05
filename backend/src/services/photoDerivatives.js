const sharp = require('sharp');
const {
    PRIVATE_PREFIX,
    PRIVATE_SOURCE_PREFIX,
    PUBLIC_UPLOADS_PREFIX,
    SOCIAL_PREFIX,
    THUMBNAIL_11_PREFIX,
    THUMBNAIL_43_PREFIX
} = require('../config/assetPaths');

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

function buildPhotoAssetPaths(photoId, sourceExtension = 'bin') {
    const baseName = `photo_${photoId}`;
    const cleanSourceExtension = String(sourceExtension || 'bin').replace(/[^a-z0-9]/gi, '') || 'bin';

    return {
        sourcePath: `${PRIVATE_SOURCE_PREFIX}/${baseName}.${cleanSourceExtension}`,
        imagePath: `${PUBLIC_UPLOADS_PREFIX}/${baseName}.webp`,
        thumbnail43Path: `${THUMBNAIL_43_PREFIX}/${baseName}.webp`,
        thumbnail11Path: `${THUMBNAIL_11_PREFIX}/${baseName}.webp`,
        socialImagePath: `${SOCIAL_PREFIX}/${baseName}.jpg`
    };
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

async function generatePhotoDerivatives(sourceBuffer, cropProfiles = null) {
    const base = sharp(sourceBuffer).rotate();
    const metadata = await base.metadata();

    const orientation = Number(metadata.orientation || 1);
    const rawWidth = Number(metadata.width || 0);
    const rawHeight = Number(metadata.height || 0);
    const sourceWidth = [5, 6, 7, 8].includes(orientation) ? rawHeight : rawWidth;
    const sourceHeight = [5, 6, 7, 8].includes(orientation) ? rawWidth : rawHeight;
    const normalizedProfiles = cropProfiles && typeof cropProfiles === 'object' ? cropProfiles : null;

    const image = await base
        .clone()
        .resize(3840, 2160, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 92, effort: 6 })
        .toBuffer();

    const createCoverDerivative = async (targetWidth, targetHeight, profile, outputBuilder) => {
        if (!profile) {
            return outputBuilder(
                base.clone().resize(targetWidth, targetHeight, { fit: 'cover', position: sharp.strategy.attention })
            );
        }

        const cropRegion = computeCoverCropRegion(
            sourceWidth,
            sourceHeight,
            targetWidth,
            targetHeight,
            profile
        );
        if (!cropRegion) {
            return outputBuilder(
                base.clone().resize(targetWidth, targetHeight, { fit: 'cover', position: sharp.strategy.attention })
            );
        }

        return outputBuilder(
            base
                .clone()
                .extract(cropRegion)
                .resize(targetWidth, targetHeight, { fit: 'fill' })
        );
    };

    const thumbnail43 = await createCoverDerivative(400, 300, normalizeCropProfile(normalizedProfiles?.r43), (pipeline) => (
        pipeline.webp({ quality: 84, effort: 5 }).toBuffer()
    ));

    const thumbnail11 = await createCoverDerivative(400, 400, normalizeCropProfile(normalizedProfiles?.r11), (pipeline) => (
        pipeline.webp({ quality: 84, effort: 5 }).toBuffer()
    ));

    const socialImage = await createCoverDerivative(1200, 630, normalizeCropProfile(normalizedProfiles?.social), (pipeline) => (
        pipeline.jpeg({ quality: 84, mozjpeg: true, progressive: true }).toBuffer()
    ));

    return { image, thumbnail43, thumbnail11, socialImage };
}

module.exports = {
    buildPhotoAssetPaths,
    generatePhotoDerivatives,
    getCropProfilesFromSettings,
    normalizePrivatePath,
    normalizeUploadsPath
};
