const { parseNumericIdOrThrow } = require('./ids');

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonIfString(value, fallback) {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function sanitizeString(value, { maxLength, fallback = '', fieldName = 'field' } = {}) {
    if (value === undefined || value === null) return fallback;
    const normalized = String(value).trim();
    if (!normalized) return fallback;
    if (maxLength && normalized.length > maxLength) {
        const error = new Error(`${fieldName} troppo lungo (max ${maxLength})`);
        error.status = 400;
        throw error;
    }
    return normalized;
}

function sanitizeOptionalString(value, { maxLength, fieldName = 'field' } = {}) {
    if (value === undefined || value === null) return undefined;
    const normalized = String(value).trim();
    if (!normalized) return '';
    if (maxLength && normalized.length > maxLength) {
        const error = new Error(`${fieldName} troppo lungo (max ${maxLength})`);
        error.status = 400;
        throw error;
    }
    return normalized;
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

function sanitizeTags(value) {
    const parsed = parseJsonIfString(value, []);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set();
    const tags = [];

    for (const item of parsed) {
        const tag = sanitizeString(item, { maxLength: 40, fallback: '', fieldName: 'Tag' });
        if (!tag) continue;
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tags.push(tag);
        if (tags.length >= 20) break;
    }

    return tags;
}

function sanitizeSettings(value) {
    const parsed = parseJsonIfString(value, {});
    if (!isPlainObject(parsed)) return {};
    return parsed;
}

function sanitizePhotoPayload(body = {}, { partial = false } = {}) {
    const output = {};

    if (!partial || body.title !== undefined) {
        let value = partial
            ? sanitizeOptionalString(body.title, { maxLength: 120, fieldName: 'title' })
            : sanitizeString(body.title, { maxLength: 120, fallback: 'Foto senza titolo', fieldName: 'title' });
        if (partial && value === '') value = undefined;
        if (value !== undefined) output.title = value;
    }

    if (!partial || body.location !== undefined) {
        let value = partial
            ? sanitizeOptionalString(body.location, { maxLength: 160, fieldName: 'location' })
            : sanitizeString(body.location, { maxLength: 160, fallback: 'Posizione sconosciuta', fieldName: 'location' });
        if (partial && value === '') value = undefined;
        if (value !== undefined) output.location = value;
    }

    if (!partial || body.description !== undefined) {
        const value = partial
            ? sanitizeOptionalString(body.description, { maxLength: 4000, fieldName: 'description' })
            : sanitizeString(body.description, { maxLength: 4000, fallback: '', fieldName: 'description' });
        if (value !== undefined) output.description = value;
    }

    if (!partial || body.camera !== undefined) {
        const value = partial
            ? sanitizeOptionalString(body.camera, { maxLength: 120, fieldName: 'camera' })
            : sanitizeString(body.camera, { maxLength: 120, fallback: '', fieldName: 'camera' });
        if (value !== undefined) output.camera = value;
    }

    if (!partial || body.lens !== undefined) {
        const value = partial
            ? sanitizeOptionalString(body.lens, { maxLength: 120, fieldName: 'lens' })
            : sanitizeString(body.lens, { maxLength: 120, fallback: '', fieldName: 'lens' });
        if (value !== undefined) output.lens = value;
    }

    if (!partial || body.date !== undefined) {
        const value = partial
            ? sanitizeOptionalString(body.date, { maxLength: 40, fieldName: 'date' })
            : sanitizeString(body.date, { maxLength: 40, fallback: new Date().toISOString(), fieldName: 'date' });
        if (value !== undefined) output.date = value;
    }

    if (!partial || body.tags !== undefined) {
        output.tags = sanitizeTags(body.tags);
    }

    if (!partial || body.settings !== undefined) {
        output.settings = sanitizeSettings(body.settings);
    }

    return output;
}

function sanitizeSeriesContent(value) {
    if (!Array.isArray(value)) return [];
    const maxBlocks = 200;
    return value.slice(0, maxBlocks).map((block, index) => {
        if (!isPlainObject(block)) return { type: 'text', content: '', order: index };

        const type = sanitizeString(block.type, { maxLength: 24, fallback: 'text', fieldName: 'content.type' });
        const order = Number.isFinite(Number(block.order)) ? Number(block.order) : index;

        if (type === 'photos') {
            const arr = Array.isArray(block.content) ? block.content : [];
            return {
                type,
                order,
                content: arr.slice(0, 200).map((id) => parseNumericIdOrThrow(id, 'content photo id'))
            };
        }

        if (type === 'image') {
            const imageId = parseNumericIdOrThrow(block.content, 'content image id');
            return { type, order, content: imageId };
        }

        return {
            type: 'text',
            order,
            content: sanitizeString(block.content, { maxLength: 8000, fallback: '', fieldName: 'content.text' })
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
            const error = new Error('title non puo` essere vuoto');
            error.status = 400;
            throw error;
        }
        if (title !== undefined) output.title = title;
    }

    if (!partial || body.description !== undefined) {
        const description = partial
            ? sanitizeOptionalString(body.description, { maxLength: 8000, fieldName: 'description' })
            : sanitizeString(body.description, { maxLength: 8000, fieldName: 'description' });
        if (partial && description === '') {
            const error = new Error('description non puo` essere vuota');
            error.status = 400;
            throw error;
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
            const error = new Error('photos deve essere un array di ID numerici');
            error.status = 400;
            throw error;
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
            const error = new Error('Il titolo deve essere di almeno 3 caratteri');
            error.status = 400;
            throw error;
        }
        if (!output.description) {
            const error = new Error('description e` obbligatoria');
            error.status = 400;
            throw error;
        }
    }

    return output;
}

module.exports = {
    sanitizePhotoPayload,
    sanitizeSeriesPayload
};
