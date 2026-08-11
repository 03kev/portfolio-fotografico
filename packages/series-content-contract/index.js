const SERIES_GRID_COLUMNS = 24;
const SERIES_GRID_MAX_ROWS = 5500;
const SERIES_CONTENT_MAX_BLOCKS = 200;
const SERIES_PHOTO_GROUP_MAX_ITEMS = 300;

const SERIES_TEXT_ALIGNMENTS = Object.freeze([
    'left',
    'center',
    'right',
    'justify',
    'justify-center',
    'justify-right'
]);
const SERIES_TEXT_SIZES = Object.freeze(['sm', 'base', 'lg', 'xl']);
const SERIES_TEXT_FONTS = Object.freeze(['inter', 'manrope', 'playfair', 'source']);

function defineBlockType(definition) {
    return Object.freeze({
        ...definition,
        defaultLayout: Object.freeze({ ...definition.defaultLayout }),
        canvasDefaultLayout: Object.freeze({ ...definition.canvasDefaultLayout }),
        minimumLayout: Object.freeze({ ...definition.minimumLayout }),
        editorMinimumLayout: Object.freeze({ ...definition.editorMinimumLayout })
    });
}

const SERIES_BLOCK_DEFINITIONS = Object.freeze([
    defineBlockType({
        type: 'text',
        label: 'Testo',
        editorLabel: 'Testo',
        contentKind: 'text',
        defaultLayout: { x: 0, w: 14, h: 5 },
        canvasDefaultLayout: { x: 0, w: 15, h: 9 },
        minimumLayout: { w: 2, h: 2 },
        editorMinimumLayout: { w: 5, h: 2 }
    }),
    defineBlockType({
        type: 'photo',
        label: 'Foto singola',
        editorLabel: 'Foto',
        contentKind: 'photo-id',
        defaultLayout: { x: 0, w: 16, h: 22 },
        canvasDefaultLayout: { x: 0, w: 15, h: 22 },
        minimumLayout: { w: 1, h: 1 },
        editorMinimumLayout: { w: 5, h: 6 }
    }),
    defineBlockType({
        type: 'photos',
        label: 'Gruppo di foto',
        editorLabel: 'Gruppo',
        contentKind: 'photo-group',
        defaultLayout: { x: 0, w: SERIES_GRID_COLUMNS, h: 24 },
        canvasDefaultLayout: { x: 0, w: 16, h: 18 },
        minimumLayout: { w: 1, h: 1 },
        editorMinimumLayout: { w: 5, h: 6 }
    })
]);

const SERIES_BLOCK_TYPES = Object.freeze(
    SERIES_BLOCK_DEFINITIONS.map((definition) => definition.type)
);
const BLOCK_DEFINITION_BY_TYPE = new Map(
    SERIES_BLOCK_DEFINITIONS.map((definition) => [definition.type, definition])
);
class SeriesContentContractError extends TypeError {
    constructor(message, reason, details = {}) {
        super(message);
        this.name = 'SeriesContentContractError';
        this.status = 400;
        this.code = 'VALIDATION_ERROR';
        this.details = { reason, ...details };
    }
}

function contractError(message, reason, details) {
    return new SeriesContentContractError(message, reason, details);
}

function normalizeBlockType(value, { field = 'content.type' } = {}) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!BLOCK_DEFINITION_BY_TYPE.has(raw)) {
        throw contractError(
            raw
                ? `Tipo di blocco serie non supportato: "${raw}".`
                : 'Il tipo del blocco serie è obbligatorio.',
            'UNKNOWN_SERIES_BLOCK_TYPE',
            { field, value: value ?? null, supportedTypes: SERIES_BLOCK_TYPES }
        );
    }
    return raw;
}

function getSeriesBlockDefinition(type, options) {
    return BLOCK_DEFINITION_BY_TYPE.get(normalizeBlockType(type, options));
}

function assertSeriesBlockTypeCoverage(types, consumer) {
    const supplied = new Set(Array.isArray(types) ? types : []);
    const missing = SERIES_BLOCK_TYPES.filter((type) => !supplied.has(type));
    const unknown = [...supplied].filter((type) => !BLOCK_DEFINITION_BY_TYPE.has(type));
    if (missing.length > 0 || unknown.length > 0) {
        throw new Error(
            `${consumer || 'Consumer blocchi serie'} non copre il contratto dei tipi.`
            + ` Mancanti: ${missing.join(', ') || 'nessuno'}.`
            + ` Sconosciuti: ${unknown.join(', ') || 'nessuno'}.`
        );
    }
}

function assertSeriesOptionCoverage(allowed, supplied, consumer) {
    const suppliedSet = new Set(Array.isArray(supplied) ? supplied : []);
    const missing = allowed.filter((value) => !suppliedSet.has(value));
    const unknown = [...suppliedSet].filter((value) => !allowed.includes(value));
    if (missing.length > 0 || unknown.length > 0) {
        throw new Error(
            `${consumer || 'Consumer opzioni serie'} non copre il contratto.`
            + ` Mancanti: ${missing.join(', ') || 'nessuno'}.`
            + ` Sconosciuti: ${unknown.join(', ') || 'nessuno'}.`
        );
    }
}

function finiteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clampInteger(value, min, max, fallback) {
    const parsed = Math.round(finiteNumber(value, fallback));
    return Math.max(min, Math.min(max, parsed));
}

function normalizeGridLayout(layout, {
    columns,
    rows,
    minimum,
    defaults,
    fallbackY = 0
}) {
    const source = layout && typeof layout === 'object' && !Array.isArray(layout)
        ? layout
        : {};
    const w = clampInteger(source.w, minimum.w, columns, defaults.w);
    const h = clampInteger(source.h, minimum.h, rows, defaults.h);
    return {
        x: clampInteger(source.x, 0, Math.max(0, columns - w), defaults.x),
        y: clampInteger(source.y, 0, Math.max(0, rows - h), fallbackY),
        w,
        h,
        unit: 'grid'
    };
}

function normalizeSeriesBlockLayout(layout, type, { fallbackY = 0 } = {}) {
    const definition = getSeriesBlockDefinition(type);
    return normalizeGridLayout(layout, {
        columns: SERIES_GRID_COLUMNS,
        rows: SERIES_GRID_MAX_ROWS,
        minimum: definition.minimumLayout,
        defaults: definition.defaultLayout,
        fallbackY
    });
}

function normalizeSeriesGroupItemLayout(layout, parentLayout) {
    const columns = Math.max(1, Math.min(
        SERIES_GRID_COLUMNS,
        Math.round(finiteNumber(parentLayout?.w, SERIES_GRID_COLUMNS))
    ));
    const rows = Math.max(1, Math.round(finiteNumber(parentLayout?.h, 1)));
    return normalizeGridLayout(layout, {
        columns,
        rows,
        minimum: { w: 1, h: 1 },
        defaults: { x: 0, w: 1, h: 1 },
        fallbackY: 0
    });
}

function normalizeSeriesTextOption(value, allowed, fallback, field) {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (!allowed.includes(normalized)) {
        throw contractError(
            `Valore non supportato per ${field}: "${normalized}".`,
            'INVALID_SERIES_TEXT_OPTION',
            { field, value: normalized, supportedValues: allowed }
        );
    }
    return normalized;
}

module.exports = {
    SERIES_BLOCK_DEFINITIONS,
    SERIES_BLOCK_TYPES,
    SERIES_CONTENT_MAX_BLOCKS,
    SERIES_GRID_COLUMNS,
    SERIES_GRID_MAX_ROWS,
    SERIES_PHOTO_GROUP_MAX_ITEMS,
    SERIES_TEXT_ALIGNMENTS,
    SERIES_TEXT_FONTS,
    SERIES_TEXT_SIZES,
    SeriesContentContractError,
    assertSeriesBlockTypeCoverage,
    assertSeriesOptionCoverage,
    getSeriesBlockDefinition,
    normalizeBlockType,
    normalizeSeriesBlockLayout,
    normalizeSeriesGroupItemLayout,
    normalizeSeriesTextOption
};
