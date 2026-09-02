const PHOTO_ASSET_REPLACEMENT_GROUPS = Object.freeze({
    DERIVATIVES: 'derivatives',
    SOURCE: 'source',
    CREATION_STAGING: 'creation-staging',
    HISTORICAL: 'historical'
});

const MEDIA_GENERATION_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const PHOTO_PUBLIC_PATH_PATTERN = /^\/uploads\/photos\/([1-9][0-9]*)\/([0-9A-HJKMNP-TV-Z]{26})\/([^/]+)$/;
const PHOTO_SOURCE_PATH_PATTERN = /^\/private\/source\/photos\/([1-9][0-9]*)\/([0-9A-HJKMNP-TV-Z]{26})\/([^/]+)$/;
const CREATION_SOURCE_PATH_PATTERN = /^\/private\/source\/photo-creation-intents\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([^/]+)$/;

function normalizePhotoAssetReplacementGroup(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,79}$/.test(normalized)) {
        throw new TypeError('Gruppo di sostituzione asset non valido.');
    }
    return normalized;
}

function normalizePhotoAssetDescriptor(asset, {
    defaultGeneration = null,
    photoId = null
} = {}) {
    const role = String(asset?.role || '').trim().toLowerCase();
    const scope = String(asset?.scope || '').trim().toLowerCase();
    const path = String(asset?.path || '').trim();
    const contentType = String(asset?.contentType || '').trim().toLowerCase();
    const replacementGroup = normalizePhotoAssetReplacementGroup(
        asset?.replacementGroup
    );
    const explicitGeneration = asset?.generation === null || asset?.generation === undefined
        || String(asset.generation).trim() === ''
        ? null
        : String(asset.generation).trim().toUpperCase();
    const normalizedDefaultGeneration = defaultGeneration === null
        || defaultGeneration === undefined
        || String(defaultGeneration).trim() === ''
        ? null
        : String(defaultGeneration).trim().toUpperCase();
    const generationValue = explicitGeneration ?? normalizedDefaultGeneration;
    const generation = generationValue === null || generationValue === undefined
        || String(generationValue).trim() === ''
        ? null
        : String(generationValue).trim().toUpperCase();

    if (!/^[a-z][a-z0-9-]{1,79}$/.test(role)) {
        throw new TypeError('Ruolo asset non valido.');
    }
    if (!['public', 'private'].includes(scope)) {
        throw new TypeError('Scope asset non valido.');
    }
    const expectedPrefix = scope === 'public' ? '/uploads/' : '/private/';
    if (
        !path.startsWith(expectedPrefix)
        || path.includes('..')
        || path.includes('\\')
        || path.includes('?')
        || path.includes('#')
    ) {
        throw new TypeError('Path asset non valido.');
    }
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(contentType)) {
        throw new TypeError('Content-Type asset non valido.');
    }
    if (generation !== null && !MEDIA_GENERATION_PATTERN.test(generation)) {
        throw new TypeError('Generazione asset non valida.');
    }
    if (
        replacementGroup === PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES
        && generation === null
    ) {
        throw new TypeError('Una derivata deve dichiarare la propria generazione.');
    }

    const normalizedPhotoId = photoId === null || photoId === undefined
        ? null
        : Number(photoId);
    if (
        normalizedPhotoId !== null
        && (!Number.isSafeInteger(normalizedPhotoId) || normalizedPhotoId <= 0)
    ) {
        throw new TypeError('ID foto asset non valido.');
    }
    if (
        normalizedPhotoId !== null
        && asset?.photoId !== undefined
        && asset?.photoId !== null
        && Number(asset.photoId) !== normalizedPhotoId
    ) {
        throw new TypeError('L’asset appartiene a una foto diversa.');
    }

    return {
        role,
        replacementGroup,
        scope,
        path,
        contentType,
        generation,
        ...(normalizedPhotoId === null ? {} : { photoId: normalizedPhotoId })
    };
}

function parseOwnedPhotoAssetPath(path) {
    const normalizedPath = String(path || '').trim();
    const publicMatch = PHOTO_PUBLIC_PATH_PATTERN.exec(normalizedPath);
    if (publicMatch) {
        return {
            kind: 'derivative',
            photoId: Number(publicMatch[1]),
            generation: publicMatch[2],
            fileName: publicMatch[3]
        };
    }
    const sourceMatch = PHOTO_SOURCE_PATH_PATTERN.exec(normalizedPath);
    if (sourceMatch) {
        return {
            kind: 'source',
            photoId: Number(sourceMatch[1]),
            generation: sourceMatch[2],
            fileName: sourceMatch[3]
        };
    }
    const creationMatch = CREATION_SOURCE_PATH_PATTERN.exec(normalizedPath);
    if (creationMatch) {
        return {
            kind: 'creation-source',
            uploadIntentId: creationMatch[1].toLowerCase(),
            fileName: creationMatch[2]
        };
    }
    return null;
}

function assertOwnedAssetPath(asset, photoId) {
    const parsedPath = parseOwnedPhotoAssetPath(asset.path);
    if (!parsedPath || !Number.isSafeInteger(parsedPath.photoId)) {
        throw new TypeError('Il path asset non identifica una foto proprietaria valida.');
    }
    if (parsedPath.photoId !== Number(photoId)) {
        throw new TypeError('Il path asset appartiene a una foto diversa.');
    }
    if (parsedPath.generation !== asset.generation) {
        throw new TypeError('La generazione dichiarata non coincide con quella del path asset.');
    }
    return parsedPath;
}

function assertPhotoAssetSemantics(asset, {
    photoId,
    uploadIntentId = null,
    allowCreationStaging = false
} = {}) {
    if (asset.replacementGroup === PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES) {
        if (asset.scope !== 'public' || ['source', 'creation-source'].includes(asset.role)) {
            throw new TypeError('Ruolo, scope e gruppo della derivata non sono coerenti.');
        }
        const parsedPath = assertOwnedAssetPath(asset, photoId);
        if (parsedPath.kind !== 'derivative') {
            throw new TypeError('Una derivata deve usare un path pubblico generazionale.');
        }
        return asset;
    }

    if (asset.replacementGroup === PHOTO_ASSET_REPLACEMENT_GROUPS.SOURCE) {
        if (asset.role !== 'source' || asset.scope !== 'private' || asset.generation === null) {
            throw new TypeError('Ruolo, scope e gruppo della source non sono coerenti.');
        }
        const parsedPath = assertOwnedAssetPath(asset, photoId);
        if (parsedPath.kind !== 'source') {
            throw new TypeError('La source deve usare un path privato generazionale.');
        }
        return asset;
    }

    if (asset.replacementGroup === PHOTO_ASSET_REPLACEMENT_GROUPS.CREATION_STAGING) {
        if (
            !allowCreationStaging
            || asset.role !== 'creation-source'
            || asset.scope !== 'private'
            || asset.generation !== null
        ) {
            throw new TypeError('Lo staging di creazione non è valido in questo inventario.');
        }
        const parsedPath = parseOwnedPhotoAssetPath(asset.path);
        const normalizedIntentId = String(uploadIntentId || '').trim().toLowerCase();
        if (
            parsedPath?.kind !== 'creation-source'
            || !normalizedIntentId
            || parsedPath.uploadIntentId !== normalizedIntentId
        ) {
            throw new TypeError('Il path di staging non appartiene all’intent dichiarato.');
        }
        return asset;
    }

    throw new TypeError(
        `Il gruppo asset ${asset.replacementGroup} non è ammesso nel lifecycle operativo.`
    );
}

function normalizeOperationalPhotoAssetDescriptor(asset, options = {}) {
    const normalized = normalizePhotoAssetDescriptor(asset, options);
    return assertPhotoAssetSemantics(normalized, options);
}

function normalizePhotoAssetInventory(assets, options = {}) {
    if (assets === undefined || assets === null) return [];
    if (!Array.isArray(assets)) {
        throw new TypeError('L’inventario asset deve essere un array.');
    }

    const normalized = assets.map((asset) => {
        if (
            asset?.state !== undefined
            && String(asset.state).trim().toLowerCase() !== 'active'
        ) {
            throw new TypeError(
                'Lo snapshot può contenere soltanto l’inventario degli asset attivi.'
            );
        }
        return normalizePhotoAssetDescriptor(asset, options);
    });
    const roles = new Set();
    const paths = new Set();
    for (const asset of normalized) {
        if (roles.has(asset.role)) {
            throw new TypeError(`Ruolo asset duplicato nell’inventario: ${asset.role}.`);
        }
        if (paths.has(`${asset.scope}:${asset.path}`)) {
            throw new TypeError(`Path asset duplicato nell’inventario: ${asset.path}.`);
        }
        roles.add(asset.role);
        paths.add(`${asset.scope}:${asset.path}`);
    }
    return normalized;
}

function normalizePublishedPhotoAssetInventory(assets, {
    photoId,
    mediaGeneration,
    requireFull = true
} = {}) {
    if (!Array.isArray(assets)) {
        throw new TypeError('Lo snapshot canonico deve contenere un inventario asset esplicito.');
    }
    const publishedGeneration = String(mediaGeneration || '').trim().toUpperCase();
    if (!MEDIA_GENERATION_PATTERN.test(publishedGeneration)) {
        throw new TypeError('La foto deve dichiarare una mediaGeneration valida.');
    }
    for (const asset of assets) {
        if ([
            asset?.uploadIntentId,
            asset?.mediaOperationId,
            asset?.ownerUploadIntentId,
            asset?.ownerMediaOperationId
        ].some((value) => value !== undefined && value !== null && String(value).trim())) {
            throw new TypeError(
                'Lo snapshot pubblicato non può contenere ownership di intent o operazioni.'
            );
        }
    }
    const normalized = normalizePhotoAssetInventory(assets, { photoId });
    for (const asset of normalized) {
        if (
            asset.role === 'creation-source'
            || asset.replacementGroup === PHOTO_ASSET_REPLACEMENT_GROUPS.CREATION_STAGING
            || asset.replacementGroup === PHOTO_ASSET_REPLACEMENT_GROUPS.HISTORICAL
        ) {
            throw new TypeError('Lo snapshot pubblicato non può contenere staging o asset infrastrutturali.');
        }
        assertPhotoAssetSemantics(asset, { photoId });
        if (
            asset.replacementGroup === PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES
            && asset.generation !== publishedGeneration
        ) {
            throw new TypeError(
                'Tutte le derivate attive devono appartenere alla mediaGeneration pubblicata.'
            );
        }
    }
    const fullAsset = normalized.find((asset) => asset.role === 'full');
    if (requireFull && !fullAsset) {
        throw new TypeError('Lo snapshot canonico deve contenere la derivata full attiva.');
    }
    return normalized;
}

module.exports = {
    PHOTO_ASSET_REPLACEMENT_GROUPS,
    assertPhotoAssetSemantics,
    normalizePhotoAssetDescriptor,
    normalizePhotoAssetInventory,
    normalizeOperationalPhotoAssetDescriptor,
    normalizePublishedPhotoAssetInventory,
    parseOwnedPhotoAssetPath,
    normalizePhotoAssetReplacementGroup
};
