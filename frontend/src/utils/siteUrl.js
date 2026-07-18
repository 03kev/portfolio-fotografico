import { IMAGES_BASE_URL } from './constants';

export function getSiteUrl() {
  if (process.env.REACT_APP_SITE_URL === undefined) {
    throw new Error('[config] Missing environment variable: REACT_APP_SITE_URL');
  }

  const value = String(process.env.REACT_APP_SITE_URL).trim().replace(/\/+$/, '');
  if (!value) {
    throw new Error('[config] REACT_APP_SITE_URL must not be empty');
  }

  return value;
}

export function toAbsoluteSiteUrl(path = '') {
  const value = String(path || '').trim();
  if (!value) return getSiteUrl();
  if (/^https?:\/\//i.test(value)) return value;

  const base = getSiteUrl();
  return `${base}${value.startsWith('/') ? value : `/${value}`}`;
}

export function toAbsoluteImageUrl(value, version = '') {
  const src = String(value || '').trim();
  if (!src) return '';
  const appendVersion = (url) => {
    if (!version) return url;
    return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(version))}`;
  };

  if (/^https?:\/\//i.test(src)) return appendVersion(src);

  const resolved = `${IMAGES_BASE_URL}${src}`;
  if (/^https?:\/\//i.test(resolved)) return appendVersion(resolved);
  return appendVersion(toAbsoluteSiteUrl(resolved));
}
