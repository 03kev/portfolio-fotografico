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

function toSafeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, min, max, fallback = min) {
    const parsed = toSafeNumber(value, fallback);
    return Math.max(min, Math.min(max, parsed));
}

function sanitizeLayout(layout, { maxCols = 24, maxRows = 5500, minW = 1, minH = 1 } = {}) {
    if (!isPlainObject(layout)) {
        return {
            x: 0,
            y: 0,
            w: minW,
            h: minH,
            unit: 'grid'
        };
    }

    const w = Math.round(clampNumber(layout.w, minW, maxCols, minW));
    const h = Math.round(clampNumber(layout.h, minH, maxRows, minH));
    const maxX = Math.max(0, maxCols - w);
    const maxY = Math.max(0, maxRows - h);

    return {
        x: Math.round(clampNumber(layout.x, 0, maxX, 0)),
        y: Math.round(clampNumber(layout.y, 0, maxY, 0)),
        w,
        h,
        unit: 'grid'
    };
}

function normalizePhotoId(value) {
    try {
        return parseNumericIdOrThrow(value, 'photoId');
    } catch {
        return null;
    }
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
        if (!isPlainObject(block)) {
            return { id: `block-${index}`, type: 'text', content: '', layout: sanitizeLayout(null) };
        }

        const rawType = sanitizeString(block.type, {
            maxLength: 24,
            fallback: 'text',
            fieldName: 'content.type'
        }).toLowerCase();
        const type = rawType === 'image' ? 'photo' : rawType;
        const safeType = ['text', 'photo', 'photos'].includes(type) ? type : 'text';
        const safeLayout = sanitizeLayout(block.layout);
        const safeId = block.id !== undefined && block.id !== null
            ? sanitizeString(block.id, { maxLength: 120, fallback: `block-${index}`, fieldName: 'content.id' })
            : `block-${index}`;

        if (safeType === 'photo') {
            const photoId = normalizePhotoId(block.content);
            return {
                id: safeId,
                type: 'photo',
                content: photoId,
                layout: safeLayout,
                showTitle: parseBooleanLike(block.showTitle),
                showLightbox: block.showLightbox === undefined ? true : parseBooleanLike(block.showLightbox)
            };
        }

        if (safeType === 'photos') {
            const arr = Array.isArray(block.content) ? block.content : [];
            const content = arr
                .slice(0, 300)
                .map((item, itemIndex) => {
                    if (isPlainObject(item)) {
                        const id = normalizePhotoId(item.id ?? item.photoId ?? item.content);
                        if (!id) return null;
                        return {
                            id,
                            layout: sanitizeLayout(item.layout, {
                                maxCols: Math.max(4, safeLayout.w),
                                maxRows: Math.max(1, safeLayout.h),
                                minW: 1,
                                minH: 1
                            })
                        };
                    }

                    const id = normalizePhotoId(item);
                    if (!id) return null;
                    return { id };
                })
                .filter(Boolean);

            return {
                id: safeId,
                type: 'photos',
                content,
                layout: safeLayout
            };
        }

        return {
            id: safeId,
            type: 'text',
            content: sanitizeString(block.content, { maxLength: 8000, fallback: '', fieldName: 'content.text' }),
            layout: sanitizeLayout(block.layout, { minW: 2, minH: 2 }),
            textAlign: ['left', 'center', 'right', 'justify', 'justify-center', 'justify-right'].includes(String(block.textAlign || '').toLowerCase())
                ? String(block.textAlign).toLowerCase()
                : 'left',
            textSize: sanitizeOptionalString(block.textSize, { maxLength: 20, fieldName: 'textSize' }) || 'base',
            textBold: parseBooleanLike(block.textBold),
            textItalic: parseBooleanLike(block.textItalic),
            textUnderline: parseBooleanLike(block.textUnderline),
            textMono: parseBooleanLike(block.textMono),
            textFont: sanitizeOptionalString(block.textFont, { maxLength: 40, fieldName: 'textFont' }) || 'inter'
        };
    }).filter((block) => {
        if (block.type === 'photo') return Boolean(block.content);
        return true;
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
    sanitizeSeriesContent,
    sanitizeSeriesPayload
};
