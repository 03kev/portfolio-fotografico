const { sanitizeSeriesContent } = require('../utils/inputSanitizers');

const DEFAULT_PHOTO_BLOCK_WIDTH = 16;
const DEFAULT_PHOTO_BLOCK_HEIGHT = 22;
const DEFAULT_PHOTO_BLOCK_GAP = 1;

function compactWhitespace(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function trimString(value) {
    return String(value ?? '').trim();
}

function normalizeSeriesTitleKey(value) {
    return compactWhitespace(value).normalize('NFKC').toLocaleLowerCase('it-IT');
}

function createSeriesSlug(value) {
    return compactWhitespace(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function normalizePhotoId(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizePhotoIds(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const normalized = [];

    values.forEach((value) => {
        const id = normalizePhotoId(value);
        if (!id || seen.has(id)) return;
        seen.add(id);
        normalized.push(id);
    });

    return normalized;
}

function compareByVisualPosition(a, b) {
    const yDelta = Number(a?.layout?.y || 0) - Number(b?.layout?.y || 0);
    if (yDelta !== 0) return yDelta;
    const xDelta = Number(a?.layout?.x || 0) - Number(b?.layout?.x || 0);
    if (xDelta !== 0) return xDelta;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function buildDefaultSeriesContent(photoIds) {
    return photoIds.map((photoId, index) => ({
        id: `photo-${photoId}`,
        type: 'photo',
        content: photoId,
        layout: {
            x: 0,
            y: index * (DEFAULT_PHOTO_BLOCK_HEIGHT + DEFAULT_PHOTO_BLOCK_GAP),
            w: DEFAULT_PHOTO_BLOCK_WIDTH,
            h: DEFAULT_PHOTO_BLOCK_HEIGHT,
            unit: 'grid'
        },
        showTitle: true,
        showLightbox: true
    }));
}

function normalizeSeriesContent(value, photoIds) {
    const allowedPhotoIds = new Set(photoIds);
    const content = sanitizeSeriesContent(value)
        .map((block) => {
            if (block.type === 'photo') {
                return allowedPhotoIds.has(block.content) ? block : null;
            }

            if (block.type === 'photos') {
                const seen = new Set();
                const items = block.content
                    .filter((item) => allowedPhotoIds.has(item.id) && !seen.has(item.id))
                    .map((item) => {
                        seen.add(item.id);
                        return item;
                    })
                    .sort(compareByVisualPosition);
                return items.length > 0 ? { ...block, content: items } : null;
            }

            if (block.type === 'text') {
                return compactWhitespace(block.content) ? block : null;
            }

            return null;
        })
        .filter(Boolean)
        .sort(compareByVisualPosition);

    return content.length > 0 ? content : buildDefaultSeriesContent(photoIds);
}

function normalizeIsoDate(value, fallback) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function normalizeSeriesRecord(record = {}) {
    const id = compactWhitespace(record.id);
    const title = compactWhitespace(record.title);
    const photos = normalizePhotoIds(record.photos);
    const photoSet = new Set(photos);
    const coverImage = normalizePhotoId(record.coverImage);
    const createdFallback = Number.isFinite(Number(id))
        ? new Date(Number(id)).toISOString()
        : new Date(0).toISOString();
    const createdAt = normalizeIsoDate(record.createdAt, createdFallback);

    return {
        id,
        title,
        slug: createSeriesSlug(record.slug || title),
        description: trimString(record.description),
        coverImage: coverImage && photoSet.has(coverImage) ? coverImage : null,
        photos,
        content: normalizeSeriesContent(record.content, photos),
        published: record.published === true || record.published === 'true',
        createdAt,
        updatedAt: normalizeIsoDate(record.updatedAt, createdAt)
    };
}

function normalizeSeriesCollection(records) {
    return Array.isArray(records) ? records.map(normalizeSeriesRecord) : [];
}

function assertUniqueSeriesIdentity(records, candidate, excludedId = null) {
    const candidateId = String(excludedId ?? candidate?.id ?? '');
    const titleKey = normalizeSeriesTitleKey(candidate?.title);
    const slug = createSeriesSlug(candidate?.slug || candidate?.title);
    const conflict = records.find((record) => {
        if (String(record?.id ?? '') === candidateId) return false;
        return normalizeSeriesTitleKey(record?.title) === titleKey;
    });

    if (conflict) {
        const error = new Error(`Esiste già una serie con il titolo "${candidate.title}".`);
        error.status = 409;
        error.code = 'SERIES_TITLE_CONFLICT';
        throw error;
    }

    const slugConflict = records.find((record) => {
        if (String(record?.id ?? '') === candidateId) return false;
        return createSeriesSlug(record?.slug || record?.title) === slug;
    });

    if (slugConflict) {
        const error = new Error(`Lo slug "${slug}" è già utilizzato da un'altra serie.`);
        error.status = 409;
        error.code = 'SERIES_SLUG_CONFLICT';
        throw error;
    }
}

module.exports = {
    assertUniqueSeriesIdentity,
    buildDefaultSeriesContent,
    createSeriesSlug,
    normalizeSeriesCollection,
    normalizeSeriesRecord,
    normalizeSeriesTitleKey
};
