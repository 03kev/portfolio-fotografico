const assert = require('node:assert/strict');
const test = require('node:test');

const {
    SERIES_BLOCK_TYPES,
    SERIES_GRID_COLUMNS,
    SERIES_GRID_MAX_ROWS,
    normalizeSeriesBlockLayout
} = require('@portfolio/series-content-contract');
const { sanitizeSeriesContent } = require('../src/utils/inputSanitizers');
const { migrateLegacySeriesContent } = require('../src/services/metadataMigration');
const {
    extractSeriesContentPhotoIds,
    removePhotoReferencesFromSeriesRecord
} = require('../src/services/seriesPhotoReferences');

const REAL_SERIES_CONTENT_SAMPLE = [
    {
        id: 'intro',
        type: 'text',
        content: 'Tutto inizia dal basso.',
        layout: { x: 1, y: 0, w: 15, h: 6, unit: 'grid' },
        textAlign: 'left',
        textSize: 'xl',
        textBold: false,
        textItalic: true,
        textUnderline: false,
        textMono: true,
        textFont: 'inter'
    },
    {
        id: 'single',
        type: 'photo',
        content: 1767351827175,
        layout: { x: 1, y: 7, w: 14, h: 31, unit: 'grid' },
        showTitle: true,
        showLightbox: true
    },
    {
        id: 'group',
        type: 'photos',
        content: [
            {
                id: 1767482804791,
                layout: { x: 13, y: 0, w: 7, h: 15, unit: 'grid' }
            },
            {
                id: 1767482686888,
                layout: { x: 4, y: 0, w: 7, h: 15, unit: 'grid' }
            }
        ],
        layout: { x: 0, y: 182, w: 24, h: 35, unit: 'grid' }
    }
];

test('backend accepts every canonical block type and preserves real series content', () => {
    const normalized = sanitizeSeriesContent(REAL_SERIES_CONTENT_SAMPLE);

    assert.deepEqual(SERIES_BLOCK_TYPES, ['text', 'photo', 'photos']);
    assert.deepEqual(normalized, REAL_SERIES_CONTENT_SAMPLE);
});

test('canonical layout rules clamp every block to the shared grid boundaries', () => {
    const layout = normalizeSeriesBlockLayout({
        x: 99,
        y: 99999,
        w: 99,
        h: 0
    }, 'text');

    assert.deepEqual(layout, {
        x: 0,
        y: SERIES_GRID_MAX_ROWS - 2,
        w: SERIES_GRID_COLUMNS,
        h: 2,
        unit: 'grid'
    });
});

test('photo and photos structural errors are explicit and never silently dropped', () => {
    assert.throws(
        () => sanitizeSeriesContent([{ type: 'photo', content: null }]),
        (error) => error.code === 'VALIDATION_ERROR'
            && error.details?.field === 'content[0].content'
    );
    assert.throws(
        () => sanitizeSeriesContent([{
            type: 'photos',
            content: [123]
        }]),
        (error) => error.code === 'VALIDATION_ERROR'
            && error.details?.field === 'content[0].content[0]'
    );
    assert.throws(
        () => sanitizeSeriesContent([{
            type: 'text',
            content: { richText: 'Non deve diventare [object Object]' }
        }]),
        (error) => error.code === 'VALIDATION_ERROR'
            && error.details?.field === 'content[0].content'
    );
});

test('legacy shapes are rejected at runtime and converted only by the import migration', () => {
    const legacy = [{
        id: 'legacy',
        type: 'image',
        content: 101,
        order: 1,
        layout: { x: 0, y: 0, w: 16, h: 22, gridVersion: 2 }
    }];

    assert.throws(
        () => sanitizeSeriesContent(legacy),
        (error) => error.details?.reason === 'UNKNOWN_SERIES_BLOCK_TYPE'
    );
    assert.deepEqual(sanitizeSeriesContent(migrateLegacySeriesContent(legacy)), [{
        id: 'legacy',
        type: 'photo',
        content: 101,
        layout: { x: 0, y: 0, w: 16, h: 22, unit: 'grid' },
        showTitle: true,
        showLightbox: true
    }]);
});

test('canonical types with legacy fields are rejected instead of rewritten', () => {
    assert.throws(
        () => sanitizeSeriesContent([{
            id: 'legacy-order',
            type: 'text',
            order: 2,
            content: 'Testo',
            layout: { x: 0, y: 0, w: 5, h: 2 }
        }]),
        (error) => error.details?.reason === 'LEGACY_SERIES_CONTENT_NOT_ALLOWED'
    );
    assert.throws(
        () => sanitizeSeriesContent([{
            id: 'legacy-grid',
            type: 'photo',
            content: 101,
            layout: { x: 0, y: 0, w: 16, h: 22, gridVersion: 2 }
        }]),
        (error) => error.details?.reason === 'LEGACY_SERIES_CONTENT_NOT_ALLOWED'
    );
});

test('reference handling covers every canonical type and rejects aliases or unknown types', () => {
    assert.deepEqual(
        extractSeriesContentPhotoIds(REAL_SERIES_CONTENT_SAMPLE),
        [1767351827175, 1767482804791, 1767482686888]
    );

    const removed = removePhotoReferencesFromSeriesRecord({
        photos: [1767351827175, 1767482804791, 1767482686888],
        coverImage: 1767351827175,
        content: REAL_SERIES_CONTENT_SAMPLE
    }, 1767351827175);
    assert.equal(removed.changed, true);
    assert.equal(removed.series.content.some((block) => block.type === 'photo'), false);

    for (const type of ['image', 'video']) {
        assert.throws(
            () => extractSeriesContentPhotoIds([{ type, content: 101 }]),
            (error) => error.details?.reason === 'UNKNOWN_SERIES_BLOCK_TYPE'
        );
        assert.throws(
            () => removePhotoReferencesFromSeriesRecord({
                photos: [101],
                content: [{ type, content: 101 }]
            }, 101),
            (error) => error.details?.reason === 'UNKNOWN_SERIES_BLOCK_TYPE'
        );
    }
});
