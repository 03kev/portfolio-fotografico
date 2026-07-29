const assert = require('node:assert/strict');
const { test } = require('node:test');
const { analyzeMetadataSnapshot } = require('../src/services/metadataMigration');

function photo(id) {
    return {
        id,
        title: `Photo ${id}`,
        description: '',
        date: '2026-01-01',
        location: {
            name: 'Roma',
            lat: 41.9,
            lng: 12.5
        },
        source: {
            path: `sources/photo_${id}.jpg`,
            contentType: 'image/jpeg'
        },
        derivativesVersion: id
    };
}

function series(id, photoIds, overrides = {}) {
    return {
        id: String(id),
        title: `Series ${id}`,
        slug: `series-${id}`,
        description: 'Description',
        coverImage: photoIds[0] ?? null,
        photos: photoIds,
        content: photoIds.map((photoId, index) => ({
            id: `photo-${photoId}`,
            type: 'photo',
            content: photoId,
            layout: { x: 0, y: index * 23, w: 16, h: 22, unit: 'grid' },
            showTitle: true,
            showLightbox: true
        })),
        published: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides
    };
}

test('validates object-shaped photo group items without treating them as dangling', () => {
    const report = analyzeMetadataSnapshot({
        photos: [photo(101), photo(202)],
        series: [series(1, [101, 202], {
            content: [{
                id: 'group',
                type: 'photos',
                content: [
                    {
                        id: 101,
                        layout: { x: 0, y: 0, w: 5, h: 5, unit: 'grid' }
                    },
                    {
                        id: 202,
                        layout: { x: 5, y: 0, w: 5, h: 5, unit: 'grid' }
                    }
                ],
                layout: { x: 0, y: 0, w: 10, h: 5, unit: 'grid' }
            }]
        })]
    });

    assert.deepEqual(report.errors, []);
    assert.equal(report.counts.photos, 2);
    assert.equal(report.counts.memberships, 2);
    assert.equal(report.counts.contentPhotoReferences, 2);
});

test('reports duplicate identities, invalid covers and dangling references before import', () => {
    const report = analyzeMetadataSnapshot({
        photos: [photo(101)],
        series: [
            series(1, [101], { title: 'Praga', slug: 'praga' }),
            series(2, [999], {
                title: ' PRAGA ',
                slug: 'praga',
                coverImage: 888,
                content: [{
                    id: 'dangling',
                    type: 'photo',
                    content: 777,
                    layout: { x: 0, y: 0, w: 10, h: 10, unit: 'grid' }
                }]
            })
        ]
    });

    const codes = new Set(report.errors.map((entry) => entry.code));
    assert.equal(codes.has('DUPLICATE_SERIES_TITLE'), true);
    assert.equal(codes.has('DUPLICATE_SERIES_SLUG'), true);
    assert.equal(codes.has('DANGLING_MEMBERSHIP'), true);
    assert.equal(codes.has('DANGLING_COVER'), true);
    assert.equal(codes.has('DANGLING_CONTENT_REFERENCE'), true);
    assert.equal(codes.has('CONTENT_OUTSIDE_MEMBERSHIP'), true);
});

test('identifies legacy block forms but produces deterministic normalized output', () => {
    const snapshot = {
        photos: [photo(101)],
        series: [series(1, [101], {
            content: [{
                id: 'legacy-group',
                type: 'photos',
                order: 4,
                content: [101],
                layout: {
                    x: 0,
                    y: 0,
                    w: 10,
                    h: 10,
                    unit: 'grid',
                    gridVersion: 2
                }
            }]
        })]
    };

    const first = analyzeMetadataSnapshot(snapshot);
    const second = analyzeMetadataSnapshot(structuredClone(snapshot));
    const warningCodes = new Set(first.warnings.map((entry) => entry.code));

    assert.deepEqual(first.errors, []);
    assert.equal(warningCodes.has('LEGACY_SCALAR_GROUP_ITEM'), true);
    assert.equal(warningCodes.has('LEGACY_BLOCK_ORDER'), true);
    assert.equal(warningCodes.has('LEGACY_GRID_VERSION'), true);
    assert.equal(first.checksum, second.checksum);
    assert.deepEqual(first.normalized, second.normalized);
});
