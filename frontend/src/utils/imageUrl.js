import { IMAGES_BASE_URL } from './constants';

export const LOCAL_IMAGE_FALLBACK = '/photo-fallback.svg';

export function resolveAssetUrl(value, fallback = LOCAL_IMAGE_FALLBACK) {
  const src = String(value || '').trim();
  if (!src) return fallback;
  if (/^https?:\/\//i.test(src)) return src;
  return `${IMAGES_BASE_URL}${src}`;
}

export function getPhotoAsset(photo, role) {
  const asset = photo?.assets?.[role];
  return asset && typeof asset === 'object' ? asset : null;
}

export function hasPhotoAsset(photo, role) {
  return Boolean(getPhotoAsset(photo, role)?.url);
}

export function resolvePhotoAssetUrl(photo, role, fallback = LOCAL_IMAGE_FALLBACK) {
  return resolveAssetUrl(getPhotoAsset(photo, role)?.url, fallback);
}
