const { parseNumericIdOrThrow } = require('./ids');
const {
    PHOTO_READ_ONLY_FIELD_KEYS,
    definePhotoMetadataConsumer,
    getPhotoMetadataField,
    normalizePhotoCoordinate,
    normalizePhotoSettings,
    normalizePhotoTags
} = require('@portfolio/photo-metadata-contract');
const {
    SERIES_CONTENT_MAX_BLOCKS,
    SERIES_PHOTO_GROUP_MAX_ITEMS,
    SERIES_TEXT_ALIGNMENTS,
    SERIES_TEXT_FONTS,
    SERIES_TEXT_SIZES,
    assertSeriesBlockTypeCoverage,
    normalizeBlockType,
    normalizeSeriesBlockLayout,
    normalizeSeriesGroupItemLayout,
    normalizeSeriesTextOption
} = require('@portfolio/series-content-contract');

assertSeriesBlockTypeCoverage(
    ['text', 'photo', 'photos'],
    'Backend series content sanitizer'
);

const PHOTO_METADATA_VALIDATION_COVERAGE = definePhotoMetadataConsumer({
    id: 'backend.validation',
    consumer: 'Backend photo metadata validation',
    handled: [
        'title', 'description', 'date', 'location', 'lat', 'lng',
        'camera', 'lens', 'settings', 'tags'
    ],
    excluded: {
        id: 'Identità validata dal database o dall’intent di creazione.',
        resolution: 'Campo derivato validato dal lifecycle Sharp.',
        createdAt: 'Timestamp assegnato e validato dal database.',
        updatedAt: 'Timestamp assegnato dal service.',
        version: 'Versione gestita dal repository Postgres.',
        derivativesVersion: 'Versione gestita dal lifecycle media.',
        mediaGeneration: 'Generazione validata dal lifecycle media.',
        assets: 'Inventario validato dal registro asset.'
    }
});

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validationError(message, field, details = undefined) {
    const error = new Error(message);
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = {
        ...(field ? { field } : {}),
        ...(details || {})
    };
    return error;
}

function sanitizeString(value, {
    minLength,
    maxLength,
    fallback = '',
    fieldName = 'field'
} = {}) {
    if (value === undefined || value === null) return fallback;
    const normalized = String(value).trim();
    if (!normalized) return fallback;
    if (minLength && normalized.length < minLength) {
        throw validationError(
            `${fieldName} troppo corto (min ${minLength})`,
            fieldName,
            { minimumLength: minLength }
        );
    }
    if (maxLength && normalized.length > maxLength) {
        throw validationError(
            `${fieldName} troppo lungo (max ${maxLength})`,
            fieldName,
            { maximumLength: maxLength }
        );
    }
    return normalized;
}

function sanitizeOptionalString(value, {
    minLength,
    maxLength,
    fieldName = 'field'
} = {}) {
    if (value === undefined || value === null) return undefined;
    const normalized = String(value).trim();
    if (!normalized) return '';
    if (minLength && normalized.length < minLength) {
        throw validationError(
            `${fieldName} troppo corto (min ${minLength})`,
            fieldName,
            { minimumLength: minLength }
        );
    }
    if (maxLength && normalized.length > maxLength) {
        throw validationError(
            `${fieldName} troppo lungo (max ${maxLength})`,
            fieldName,
            { maximumLength: maxLength }
        );
    }
    return normalized;
}

function sanitizePhotoString(value, options = {}) {
    if (value !== undefined && typeof value !== 'string') {
        const fieldName = options.fieldName || 'field';
        throw validationError(
            `${fieldName} deve essere una stringa.`,
            fieldName,
            { reason: 'INVALID_STRING_TYPE' }
        );
    }
    return sanitizeOptionalString(value, options);
}

function parseBooleanLike(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return Boolean(value);
}

function normalizePhotoId(value) {
    try {
        return parseNumericIdOrThrow(value, 'photoId');
    } catch {
        return null;
    }
}

function sanitizePhotoPayload(body = {}, { partial = false } = {}) {
    const output = {};

    for (const field of PHOTO_READ_ONLY_FIELD_KEYS) {
        if (Object.hasOwn(body, field)) {
            throw validationError(
                `${field} è un campo read-only e non può essere modificato direttamente.`,
                field,
                { reason: 'READ_ONLY_PHOTO_METADATA_FIELD' }
            );
        }
    }

    if (!partial || body.title !== undefined) {
        const limits = getPhotoMetadataField('title').limits;
        const value = sanitizePhotoString(body.title, {
            ...limits,
            fieldName: 'title'
        });
        if (value === undefined || value === '') {
            throw validationError('title è obbligatorio.', 'title', {
                minimumLength: limits.minLength
            });
        }
        output.title = value;
    }

    if (!partial || body.location !== undefined) {
        const value = sanitizePhotoString(body.location, {
            ...getPhotoMetadataField('location').limits,
            fieldName: 'location'
        });
        output.location = value ?? '';
    }

    if (!partial || body.description !== undefined) {
        const value = sanitizePhotoString(body.description, {
            ...getPhotoMetadataField('description').limits,
            fieldName: 'description'
        });
        output.description = value ?? '';
    }

    if (!partial || body.camera !== undefined) {
        const value = sanitizePhotoString(body.camera, {
            ...getPhotoMetadataField('camera').limits,
            fieldName: 'camera'
        });
        output.camera = value ?? '';
    }

    if (!partial || body.lens !== undefined) {
        const value = sanitizePhotoString(body.lens, {
            ...getPhotoMetadataField('lens').limits,
            fieldName: 'lens'
        });
        output.lens = value ?? '';
    }

    if (!partial || body.date !== undefined) {
        const value = sanitizePhotoString(body.date, {
            ...getPhotoMetadataField('date').limits,
            fieldName: 'date'
        });
        output.date = value ?? '';
    }

    if (!partial || body.tags !== undefined) {
        output.tags = normalizePhotoTags(
            body.tags === undefined && !partial ? [] : body.tags
        );
    }

    if (!partial || body.settings !== undefined) {
        output.settings = normalizePhotoSettings(
            body.settings === undefined && !partial ? {} : body.settings
        );
    }

    const hasLat = Object.hasOwn(body, 'lat');
    const hasLng = Object.hasOwn(body, 'lng');
    if (!partial || hasLat || hasLng) {
        if (partial && hasLat !== hasLng) {
            throw validationError(
                'Latitudine e longitudine devono essere modificate insieme.',
                hasLat ? 'lng' : 'lat',
                { reason: 'INCOMPLETE_COORDINATE_PAIR' }
            );
        }
        const lat = normalizePhotoCoordinate(hasLat ? body.lat : null, 'lat');
        const lng = normalizePhotoCoordinate(hasLng ? body.lng : null, 'lng');
        if ((lat === null) !== (lng === null)) {
            throw validationError(
                'Latitudine e longitudine devono essere entrambe valorizzate o entrambe mancanti.',
                'coordinates',
                { reason: 'INCOMPLETE_COORDINATE_PAIR' }
            );
        }
        output.lat = lat;
        output.lng = lng;
    }

    return output;
}

function rejectLegacySeriesContentFields(block, fieldPrefix) {
    if (Object.hasOwn(block, 'order')) {
        throw validationError(
            'Il campo legacy order non è ammesso nel formato canonico.',
            `${fieldPrefix}.order`,
            { reason: 'LEGACY_SERIES_CONTENT_NOT_ALLOWED' }
        );
    }
    if (isPlainObject(block.layout) && Object.hasOwn(block.layout, 'gridVersion')) {
        throw validationError(
            'Il campo legacy gridVersion non è ammesso nel formato canonico.',
            `${fieldPrefix}.layout.gridVersion`,
            { reason: 'LEGACY_SERIES_CONTENT_NOT_ALLOWED' }
        );
    }
}

function sanitizeSeriesContent(value) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
        throw validationError('content deve essere un array di blocchi.', 'content');
    }
    if (value.length > SERIES_CONTENT_MAX_BLOCKS) {
        throw validationError(
            `La serie può contenere al massimo ${SERIES_CONTENT_MAX_BLOCKS} blocchi.`,
            'content',
            { maximumItems: SERIES_CONTENT_MAX_BLOCKS }
        );
    }

    return value.map((block, index) => {
        const fieldPrefix = `content[${index}]`;
        if (!isPlainObject(block)) {
            throw validationError('Ogni blocco serie deve essere un oggetto.', fieldPrefix);
        }

        const type = normalizeBlockType(block.type, {
            field: `${fieldPrefix}.type`
        });
        rejectLegacySeriesContentFields(block, fieldPrefix);
        const layout = normalizeSeriesBlockLayout(block.layout, type);
        const id = block.id !== undefined && block.id !== null
            ? sanitizeString(block.id, {
                maxLength: 120,
                fallback: `block-${index}`,
                fieldName: `${fieldPrefix}.id`
            })
            : `block-${index}`;

        if (type === 'photo') {
            const photoId = normalizePhotoId(block.content);
            if (!photoId) {
                throw validationError(
                    'Il blocco photo deve contenere un ID foto valido.',
                    `${fieldPrefix}.content`
                );
            }
            return {
                id,
                type,
                content: photoId,
                layout,
                showTitle: block.showTitle === undefined ? true : parseBooleanLike(block.showTitle),
                showLightbox: block.showLightbox === undefined ? true : parseBooleanLike(block.showLightbox)
            };
        }

        if (type === 'photos') {
            if (!Array.isArray(block.content)) {
                throw validationError(
                    'Il blocco photos deve contenere un array.',
                    `${fieldPrefix}.content`
                );
            }
            if (block.content.length > SERIES_PHOTO_GROUP_MAX_ITEMS) {
                throw validationError(
                    `Un gruppo può contenere al massimo ${SERIES_PHOTO_GROUP_MAX_ITEMS} foto.`,
                    `${fieldPrefix}.content`,
                    { maximumItems: SERIES_PHOTO_GROUP_MAX_ITEMS }
                );
            }

            const seen = new Set();
            const content = [];
            block.content.forEach((item, itemIndex) => {
                const itemField = `${fieldPrefix}.content[${itemIndex}]`;
                if (!isPlainObject(item)) {
                    throw validationError(
                        'Ogni elemento di un gruppo photos deve avere la forma { id, layout? }.',
                        itemField
                    );
                }
                const photoId = normalizePhotoId(
                    item.id
                );
                if (!photoId) {
                    throw validationError(
                        'L’elemento del gruppo non contiene un ID foto valido.',
                        `${itemField}.id`
                    );
                }
                if (seen.has(photoId)) {
                    throw validationError(
                        'La stessa foto non può comparire due volte nello stesso gruppo.',
                        `${itemField}.id`,
                        { photoId }
                    );
                }
                seen.add(photoId);
                if (isPlainObject(item.layout) && Object.hasOwn(item.layout, 'gridVersion')) {
                    throw validationError(
                        'Il campo legacy gridVersion non è ammesso nel formato canonico.',
                        `${itemField}.layout.gridVersion`,
                        { reason: 'LEGACY_SERIES_CONTENT_NOT_ALLOWED' }
                    );
                }
                content.push({
                    id: photoId,
                    ...(isPlainObject(item) && item.layout
                        ? { layout: normalizeSeriesGroupItemLayout(item.layout, layout) }
                        : {})
                });
            });

            return { id, type, content, layout };
        }

        if (typeof block.content !== 'string') {
            throw validationError(
                'Il contenuto di un blocco text deve essere una stringa.',
                `${fieldPrefix}.content`
            );
        }

        return {
            id,
            type,
            content: sanitizeString(block.content, {
                maxLength: 8000,
                fallback: '',
                fieldName: `${fieldPrefix}.content`
            }),
            layout,
            textAlign: normalizeSeriesTextOption(
                block.textAlign,
                SERIES_TEXT_ALIGNMENTS,
                'left',
                `${fieldPrefix}.textAlign`
            ),
            textSize: normalizeSeriesTextOption(
                block.textSize,
                SERIES_TEXT_SIZES,
                'base',
                `${fieldPrefix}.textSize`
            ),
            textBold: parseBooleanLike(block.textBold),
            textItalic: parseBooleanLike(block.textItalic),
            textUnderline: parseBooleanLike(block.textUnderline),
            textMono: parseBooleanLike(block.textMono),
            textFont: normalizeSeriesTextOption(
                block.textFont,
                SERIES_TEXT_FONTS,
                'inter',
                `${fieldPrefix}.textFont`
            )
        };
    });
}

function sanitizeSeriesPayload(body = {}, { partial = false } = {}) {
    const output = {};

    if (!partial || body.title !== undefined) {
        const title = partial
            ? sanitizeOptionalString(body.title, { maxLength: 120, fieldName: 'title' })
            : sanitizeString(body.title, { maxLength: 120, fieldName: 'title' });
        if (partial && title === '') {
            throw validationError('Il titolo non può essere vuoto.', 'title');
        }
        if (title !== undefined) output.title = title;
    }

    if (!partial || body.description !== undefined) {
        const description = partial
            ? sanitizeOptionalString(body.description, { maxLength: 8000, fieldName: 'description' })
            : sanitizeString(body.description, { maxLength: 8000, fieldName: 'description' });
        if (partial && description === '') {
            throw validationError('La descrizione non può essere vuota.', 'description');
        }
        if (description !== undefined) output.description = description;
    }

    if (body.slug !== undefined) {
        const rawSlug = sanitizeOptionalString(body.slug, { maxLength: 140, fieldName: 'slug' });
        if (rawSlug !== undefined) {
            output.slug = rawSlug
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }
    }

    if (body.coverImage !== undefined) {
        output.coverImage = body.coverImage === null || body.coverImage === ''
            ? null
            : parseNumericIdOrThrow(body.coverImage, 'coverImage');
    }

    if (body.photos !== undefined) {
        if (!Array.isArray(body.photos)) {
            throw validationError(
                'photos deve essere un array di ID numerici',
                'photos'
            );
        }
        output.photos = body.photos.slice(0, 2000).map((id) => parseNumericIdOrThrow(id, 'photoId'));
    }

    if (body.content !== undefined) {
        output.content = sanitizeSeriesContent(body.content);
    }

    if (body.published !== undefined) {
        output.published = parseBooleanLike(body.published);
    }

    if (!partial) {
        if (!output.title || output.title.length < 3) {
            throw validationError(
                'Il titolo deve essere di almeno 3 caratteri',
                'title',
                { minimumLength: 3 }
            );
        }
        if (!output.description) {
            throw validationError('La descrizione è obbligatoria.', 'description');
        }
    }

    return output;
}

module.exports = {
    PHOTO_METADATA_VALIDATION_COVERAGE,
    sanitizePhotoPayload,
    sanitizeSeriesContent,
    sanitizeSeriesPayload
};
