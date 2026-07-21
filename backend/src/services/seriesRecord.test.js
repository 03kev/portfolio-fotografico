const assert = require('node:assert/strict');
const test = require('node:test');

const {
    assertUniqueSeriesIdentity,
    normalizeSeriesRecord
} = require('./seriesRecord');

test('normalizeSeriesRecord produces canonical grid content', () => {
    const normalized = normalizeSeriesRecord({
        id: '1767314051494',
        title: '  Serie   Prova  ',
        slug: 'Serie Prova',
        description: 'Descrizione',
        coverImage: 99,
        photos: [10, '10', 20, 30],
        content: [
            {
                id: 'later-photo',
                type: 'photo',
                order: 9,
                content: 20,
                layout: { x: 3.4, y: 10.2, w: 8.2, h: 12.1, unit: 'grid' }
            },
            {
                id: 'intro',
                type: 'text',
                order: 3,
                content: 'Introduzione',
                layout: { x: 0, y: 0, w: 12, h: 4, unit: 'grid' },
                textAlign: 'justify-center'
            },
            {
                id: 'invalid-photo',
                type: 'photo',
                content: 999,
                layout: { x: 0, y: 30, w: 12, h: 12 }
            }
        ],
        published: false,
        createdAt: '2026-01-02T00:34:11.494Z',
        updatedAt: '2026-07-21T21:39:00.491Z'
    });

    assert.equal(normalized.title, 'Serie Prova');
    assert.equal(normalized.slug, 'serie-prova');
    assert.deepEqual(normalized.photos, [10, 20, 30]);
    assert.equal(normalized.coverImage, null);
    assert.deepEqual(normalized.content.map((block) => block.id), ['intro', 'later-photo']);
    assert.equal(normalized.content[0].textAlign, 'justify-center');
    assert.equal(normalized.content[1].layout.unit, 'grid');
    assert.equal('order' in normalized.content[1], false);
});

test('normalizeSeriesRecord materializes default blocks for empty content', () => {
    const normalized = normalizeSeriesRecord({
        id: '1784670020874',
        title: 'Praga',
        description: 'Prova',
        photos: [101, 102],
        content: []
    });

    assert.deepEqual(normalized.content.map((block) => block.content), [101, 102]);
    assert.deepEqual(normalized.content.map((block) => block.layout.y), [0, 23]);
    assert.ok(normalized.content.every((block) => block.layout.unit === 'grid'));
});

test('assertUniqueSeriesIdentity rejects titles regardless of case and spacing', () => {
    const records = [{ id: '1', title: 'Frammenti di Varsavia', slug: 'frammenti-di-varsavia' }];

    assert.throws(
        () => assertUniqueSeriesIdentity(records, {
            id: '2',
            title: '  FRAMMENTI   DI VARSAVIA ',
            slug: 'altro-slug'
        }),
        (error) => error.status === 409 && error.code === 'SERIES_TITLE_CONFLICT'
    );
});

test('assertUniqueSeriesIdentity allows the current series during updates', () => {
    const records = [{ id: '1', title: 'Praga', slug: 'praga' }];

    assert.doesNotThrow(() => assertUniqueSeriesIdentity(
        records,
        { id: '1', title: 'Praga', slug: 'praga' },
        '1'
    ));
});
