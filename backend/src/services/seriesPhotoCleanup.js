const { readMetadataFile, writeMetadataFile } = require('./metadataStorage');

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

async function cleanupPhotoReferencesInSeries(photoId) {
    const series = await readMetadataFile('series.json', []);
    if (!Array.isArray(series) || series.length === 0) {
        return {
            modified: false,
            modifiedCount: 0,
            series: []
        };
    }

    let modifiedCount = 0;
    const nextSeries = series.map((record) => {
        const result = removePhotoReferencesFromSeriesRecord(record, photoId);
        if (result.changed) {
            modifiedCount += 1;
        }
        return result.series;
    });

    if (modifiedCount > 0) {
        await writeMetadataFile('series.json', nextSeries);
    }

    return {
        modified: modifiedCount > 0,
        modifiedCount,
        series: nextSeries
    };
}

module.exports = {
    cleanupPhotoReferencesInSeries
};
