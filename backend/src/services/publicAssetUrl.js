const { env } = require('../config/env');
const { PUBLIC_UPLOADS_PREFIX } = require('../config/assetPaths');

function getPublicAssetBaseUrl(options = {}) {
    const { preferRelativeInDevelopment = false } = options;
    if (preferRelativeInDevelopment && env.isDevelopment) {
        return '';
    }
    return env.r2PublicUrl;
}

function buildPublicAssetUrl(uploadPath, options = {}) {
    const value = String(uploadPath || '').trim();
    if (!value) return value;
    if (/^https?:\/\//i.test(value)) return value;

    const publicBaseUrl = getPublicAssetBaseUrl(options);
    if (!publicBaseUrl) return value;
    if (!value.startsWith(`${PUBLIC_UPLOADS_PREFIX}/`)) return value;

    const publicPrefix = PUBLIC_UPLOADS_PREFIX.replace(/^\/+/, '');
    const objectKey = value
        .replace(/^\/+/, '')
        .replace(new RegExp(`^${publicPrefix}/+`), '');

    return `${publicBaseUrl}/${objectKey}`;
}

module.exports = {
    buildPublicAssetUrl,
    getPublicAssetBaseUrl
};
