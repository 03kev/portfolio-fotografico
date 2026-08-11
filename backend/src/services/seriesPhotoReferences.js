const {
    assertSeriesBlockTypeCoverage,
    normalizeBlockType
} = require('@portfolio/series-content-contract');

assertSeriesBlockTypeCoverage(
    ['text', 'photo', 'photos'],
    'Series photo references'
);

function removePhotoFromNumericIdArray(values, photoId) {
    if (!Array.isArray(values)) {
        return { values, changed: false };
    }

    const nextValues = values.filter((value) => Number(value) !== photoId);
    return {
        values: nextValues,
        changed: nextValues.length !== values.length
    };
}

function getContentPhotoId(value) {
    return Number(
        value && typeof value === 'object'
            ? value.id ?? value.photoId ?? value.content
            : value
    );
}

function extractSeriesContentPhotoIds(content) {
    const ids = [];
    if (!Array.isArray(content)) return ids;

    content.forEach((block, blockIndex) => {
        const type = normalizeBlockType(block?.type, {
            field: `content[${blockIndex}].type`
        });
        if (type === 'text') return;
        if (type === 'photo') {
            const id = getContentPhotoId(block?.content);
            if (Number.isSafeInteger(id) && id > 0) ids.push(id);
            return;
        }
        if (type !== 'photos') {
            throw new TypeError(`Riferimenti non implementati per il blocco "${type}".`);
        }
        if (!Array.isArray(block.content)) return;
        block.content.forEach((item) => {
            const id = getContentPhotoId(item);
            if (Number.isSafeInteger(id) && id > 0) ids.push(id);
        });
    });

    return [...new Set(ids)];
}

function findSeriesContentPhotoIdsOutsideMembership(series) {
    const membership = new Set(Array.isArray(series?.photos) ? series.photos.map(Number) : []);
    return extractSeriesContentPhotoIds(series?.content)
        .filter((photoId) => !membership.has(photoId));
}

function removePhotoReferencesFromSeriesRecord(seriesRecord, photoId) {
    let changed = false;
    const nextSeries = { ...seriesRecord };

    const photosResult = removePhotoFromNumericIdArray(nextSeries.photos, photoId);
    if (photosResult.changed) {
        changed = true;
        nextSeries.photos = photosResult.values;
    }

    if (Number(nextSeries.coverImage) === photoId) {
        changed = true;
        nextSeries.coverImage = Array.isArray(nextSeries.photos) && nextSeries.photos.length > 0
            ? nextSeries.photos[0]
            : null;
    }

    if (Array.isArray(nextSeries.content)) {
        const nextContent = nextSeries.content.map((block) => {
            const type = normalizeBlockType(block?.type);
            if (type === 'photo' && Number(block.content) === photoId) {
                changed = true;
                return null;
            }
            if (type !== 'photos' || !Array.isArray(block.content)) {
                return block;
            }

            const nextItems = block.content.filter((item) => getContentPhotoId(item) !== photoId);
            if (nextItems.length !== block.content.length) {
                changed = true;
                return nextItems.length > 0 ? {
                    ...block,
                    content: nextItems
                } : null;
            }

            return block;
        }).filter(Boolean);

        if (changed) {
            nextSeries.content = nextContent;
        }
    }

    return {
        changed,
        series: nextSeries
    };
}

module.exports = {
    extractSeriesContentPhotoIds,
    findSeriesContentPhotoIdsOutsideMembership,
    removePhotoReferencesFromSeriesRecord
};
