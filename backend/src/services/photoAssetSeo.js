const {
    PHOTO_DERIVATIVE_VARIANTS
} = require('./photoDerivatives');

const PHOTO_ASSET_INDEXING = Object.freeze({
    CANONICAL: 'canonical',
    SECONDARY: 'secondary'
});

function normalizePublicPathname(value) {
    const raw = String(value || '').trim();
    if (!raw) return '/';
    try {
        return new URL(raw, 'https://assets.invalid').pathname;
    } catch {
        return raw.split(/[?#]/, 1)[0] || '/';
    }
}

function listCanonicalPhotoAssetFileNames(variants = PHOTO_DERIVATIVE_VARIANTS) {
    return new Set(
        (Array.isArray(variants) ? variants : [])
            .filter((variant) => (
                variant?.scope === 'public'
                && variant?.searchIndexing === PHOTO_ASSET_INDEXING.CANONICAL
            ))
            .map((variant) => String(variant.fileName || '').trim())
            .filter(Boolean)
    );
}

function classifyPublicPhotoAssetPath(pathname, variants = PHOTO_DERIVATIVE_VARIANTS) {
    const normalized = normalizePublicPathname(pathname);
    const generatedAsset = normalized.match(
        /(?:^|\/)photos\/[1-9][0-9]*\/[0-9A-HJKMNP-TV-Z]{26}\/([^/]+)$/
    );
    if (!generatedAsset) return PHOTO_ASSET_INDEXING.SECONDARY;

    const canonicalFileNames = listCanonicalPhotoAssetFileNames(variants);
    return canonicalFileNames.has(generatedAsset[1])
        ? PHOTO_ASSET_INDEXING.CANONICAL
        : PHOTO_ASSET_INDEXING.SECONDARY;
}

function shouldNoIndexPublicPhotoAssetPath(pathname, variants) {
    return classifyPublicPhotoAssetPath(pathname, variants)
        !== PHOTO_ASSET_INDEXING.CANONICAL;
}

module.exports = {
    PHOTO_ASSET_INDEXING,
    classifyPublicPhotoAssetPath,
    shouldNoIndexPublicPhotoAssetPath
};
