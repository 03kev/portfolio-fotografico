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
            if (!block || block.type !== 'photos' || !Array.isArray(block.content)) {
                return block;
            }

            const blockResult = removePhotoFromNumericIdArray(block.content, photoId);
            if (blockResult.changed) {
                changed = true;
                return {
                    ...block,
                    content: blockResult.values
                };
            }

            return block;
        });

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
    removePhotoReferencesFromSeriesRecord
};
