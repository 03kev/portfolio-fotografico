const PHOTO_ASSET_REPLACEMENT_GROUPS = Object.freeze({
    DERIVATIVES: 'derivatives',
    SOURCE: 'source',
    CREATION_STAGING: 'creation-staging',
    HISTORICAL: 'historical'
});

function normalizePhotoAssetReplacementGroup(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,79}$/.test(normalized)) {
        throw new TypeError('Gruppo di sostituzione asset non valido.');
    }
    return normalized;
}

module.exports = {
    PHOTO_ASSET_REPLACEMENT_GROUPS,
    normalizePhotoAssetReplacementGroup
};
