import cropContract from '@portfolio/photo-crop-contract';

const {
  CROP_PROFILE_LIMITS,
  DEFAULT_CROP_PROFILE: SHARED_DEFAULT_CROP_PROFILE,
  PHOTO_CROP_PRESETS,
  normalizeCropProfile: normalizeSharedCropProfile,
  normalizeCropProfiles: normalizeSharedCropProfiles
} = cropContract;

export const CROP_PRESETS = PHOTO_CROP_PRESETS;
export const DEFAULT_CROP_PROFILE = SHARED_DEFAULT_CROP_PROFILE;
export const CROP_MAX_SCALE = CROP_PROFILE_LIMITS.scale.max;
export const CROP_MIN_SIZE_PX = 56;
export const CROP_HANDLES = ['nw', 'ne', 'sw', 'se'];

export const clamp01 = (value) => Math.max(0, Math.min(1, value));
export const clampScale = (value) => Math.max(1, Math.min(CROP_MAX_SCALE, value));
export const clampBetween = (value, min, max) => Math.max(min, Math.min(max, value));

export const parseAspectRatio = (ratio) => {
  if (typeof ratio !== 'string') return 4 / 3;
  const [rawWidth, rawHeight] = ratio.split('/');
  const width = Number(rawWidth?.trim());
  const height = Number(rawHeight?.trim());
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return 4 / 3;
  return width / height;
};

export const getPresetRatioValue = (presetKey, presets = CROP_PRESETS) => {
  const preset = presets.find((item) => item.key === presetKey);
  return parseAspectRatio(preset?.ratio || '4 / 3');
};

export const normalizeCropProfile = (value) => normalizeSharedCropProfile(value);

export const normalizeCropProfiles = (
  value,
  presets = CROP_PRESETS
) => normalizeSharedCropProfiles(value, {
  presets,
  includeDefaults: true,
  preserveUnknown: true
});

export const getBaseCropSize = (sourceWidth, sourceHeight, targetRatio) => {
  const srcW = Math.max(1, Number(sourceWidth) || 1);
  const srcH = Math.max(1, Number(sourceHeight) || 1);
  const ratio = Number.isFinite(targetRatio) && targetRatio > 0 ? targetRatio : 4 / 3;
  const sourceRatio = srcW / srcH;

  if (sourceRatio > ratio) {
    return {
      width: Math.max(1, Math.round(srcH * ratio)),
      height: srcH
    };
  }

  return {
    width: srcW,
    height: Math.max(1, Math.round(srcW / ratio))
  };
};

export const profileToSourceRect = (profile, sourceWidth, sourceHeight, targetRatio) => {
  const srcW = Math.max(1, Number(sourceWidth) || 1);
  const srcH = Math.max(1, Number(sourceHeight) || 1);
  const base = getBaseCropSize(srcW, srcH, targetRatio);
  const normalized = normalizeCropProfile(profile);

  const cropWidth = Math.max(1, Math.min(srcW, Math.round(base.width / normalized.scale)));
  const cropHeight = Math.max(1, Math.min(srcH, Math.round(base.height / normalized.scale)));
  const centerX = clamp01(normalized.x) * srcW;
  const centerY = clamp01(normalized.y) * srcH;
  const maxLeft = srcW - cropWidth;
  const maxTop = srcH - cropHeight;

  const left = Math.max(0, Math.min(maxLeft, Math.round(centerX - cropWidth / 2)));
  const top = Math.max(0, Math.min(maxTop, Math.round(centerY - cropHeight / 2)));

  return { left, top, width: cropWidth, height: cropHeight };
};

export const sourceRectToProfile = (rect, sourceWidth, sourceHeight, targetRatio) => {
  const srcW = Math.max(1, Number(sourceWidth) || 1);
  const srcH = Math.max(1, Number(sourceHeight) || 1);
  const base = getBaseCropSize(srcW, srcH, targetRatio);
  const width = Math.max(1, Math.min(srcW, Number(rect?.width) || 1));
  const height = Math.max(1, Math.min(srcH, Number(rect?.height) || 1));
  const left = Math.max(0, Math.min(srcW - width, Number(rect?.left) || 0));
  const top = Math.max(0, Math.min(srcH - height, Number(rect?.top) || 0));
  const centerX = left + width / 2;
  const centerY = top + height / 2;

  return normalizeCropProfile({
    x: centerX / srcW,
    y: centerY / srcH,
    scale: clampScale(base.width / width)
  });
};

export const sourceRectToViewportRect = (sourceRect, viewport) => ({
  left: viewport.left + (sourceRect.left / viewport.naturalWidth) * viewport.width,
  top: viewport.top + (sourceRect.top / viewport.naturalHeight) * viewport.height,
  width: (sourceRect.width / viewport.naturalWidth) * viewport.width,
  height: (sourceRect.height / viewport.naturalHeight) * viewport.height
});

export const viewportRectToSourceRect = (viewportRect, viewport) => ({
  left: ((viewportRect.left - viewport.left) / viewport.width) * viewport.naturalWidth,
  top: ((viewportRect.top - viewport.top) / viewport.height) * viewport.naturalHeight,
  width: (viewportRect.width / viewport.width) * viewport.naturalWidth,
  height: (viewportRect.height / viewport.height) * viewport.naturalHeight
});

export const buildPreviewStyleFromViewportRect = (cropRect, imageBounds) => {
  if (!cropRect || !imageBounds) {
    return {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    };
  }

  const widthPercent = (imageBounds.width / cropRect.width) * 100;
  const heightPercent = (imageBounds.height / cropRect.height) * 100;
  const leftPercent = -((cropRect.left - imageBounds.left) / cropRect.width) * 100;
  const topPercent = -((cropRect.top - imageBounds.top) / cropRect.height) * 100;

  return {
    position: 'absolute',
    width: `${widthPercent}%`,
    height: `${heightPercent}%`,
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
    maxWidth: 'none',
    maxHeight: 'none',
    objectFit: 'fill'
  };
};

export const resizeRectFromCorner = ({ startRect, handle, dx, dy, viewport, ratio, minWidth, maxWidth }) => {
  const right = viewport.left + viewport.width;
  const bottom = viewport.top + viewport.height;
  const startCornerX = handle.includes('w') ? startRect.left : startRect.left + startRect.width;
  const startCornerY = handle.includes('n') ? startRect.top : startRect.top + startRect.height;

  let anchorX = startRect.left;
  let anchorY = startRect.top;
  if (handle === 'nw') {
    anchorX = startRect.left + startRect.width;
    anchorY = startRect.top + startRect.height;
  } else if (handle === 'ne') {
    anchorX = startRect.left;
    anchorY = startRect.top + startRect.height;
  } else if (handle === 'sw') {
    anchorX = startRect.left + startRect.width;
    anchorY = startRect.top;
  }

  const pointerX = startCornerX + dx;
  const pointerY = startCornerY + dy;
  const widthFromX = Math.abs(anchorX - pointerX);
  const widthFromY = Math.abs(anchorY - pointerY) * ratio;
  const useHorizontal = Math.abs(dx) >= Math.abs(dy) * ratio;

  let width = useHorizontal ? widthFromX : widthFromY;
  if (!Number.isFinite(width) || width <= 0) width = startRect.width;

  let maxWidthByBounds = maxWidth;
  if (handle === 'nw') {
    maxWidthByBounds = Math.min(anchorX - viewport.left, (anchorY - viewport.top) * ratio);
  } else if (handle === 'ne') {
    maxWidthByBounds = Math.min(right - anchorX, (anchorY - viewport.top) * ratio);
  } else if (handle === 'sw') {
    maxWidthByBounds = Math.min(anchorX - viewport.left, (bottom - anchorY) * ratio);
  } else if (handle === 'se') {
    maxWidthByBounds = Math.min(right - anchorX, (bottom - anchorY) * ratio);
  }

  width = clampBetween(width, minWidth, Math.max(minWidth, Math.min(maxWidth, maxWidthByBounds)));
  const height = width / ratio;

  let left = startRect.left;
  let top = startRect.top;
  if (handle === 'nw') {
    left = anchorX - width;
    top = anchorY - height;
  } else if (handle === 'ne') {
    left = anchorX;
    top = anchorY - height;
  } else if (handle === 'sw') {
    left = anchorX - width;
    top = anchorY;
  } else if (handle === 'se') {
    left = anchorX;
    top = anchorY;
  }

  return {
    left: clampBetween(left, viewport.left, right - width),
    top: clampBetween(top, viewport.top, bottom - height),
    width,
    height
  };
};
