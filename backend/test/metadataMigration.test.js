const assert = require('node:assert/strict');
const { test } = require('node:test');
const { analyzeMetadataSnapshot } = require('../src/services/metadataMigration');
const { toStoragePhoto } = require('../src/services/photoRecord');

const MEDIA_GENERATION = '01JGFJJZ00XR5RF7YH2J5PVWBX';

function photo(id) {
    const full = {
        role: 'full',
        replacementGroup: 'derivatives',
        scope: 'public',
        path: `/uploads/photos/${id}/${MEDIA_GENERATION}/full.webp`,
        contentType: 'image/webp',
        generation: MEDIA_GENERATION
    };
    const source = {
        role: 'source',
        replacementGroup: 'source',
        scope: 'private',
        path: `/private/source/photos/${id}/${MEDIA_GENERATION}/source.jpg`,
        contentType: 'image/jpeg',
        generation: MEDIA_GENERATION
    };
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
        mediaGeneration: MEDIA_GENERATION,
        assets: [full, source],
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

test('rejects an unreconciled historical snapshot instead of materializing the current catalog', () => {
    const report = analyzeMetadataSnapshot({
        photos: [{
            ...photo(303),
            assets: undefined,
            mobileImage: true
        }],
        series: []
    });

    assert.equal(
        report.errors.some((entry) => entry.code === 'MISSING_EXPLICIT_ASSET_INVENTORY'),
        true
    );
    assert.deepEqual(report.normalized.photos, []);
    assert.equal(report.counts.assets, 0);
});

test('keeps only explicitly inventoried historical assets when the current catalog has more roles', () => {
    const full = {
        role: 'full',
        replacementGroup: 'derivatives',
        scope: 'public',
        path: `/uploads/photos/404/${MEDIA_GENERATION}/full.webp`,
        contentType: 'image/webp',
        generation: MEDIA_GENERATION
    };
    const source = {
        role: 'source',
        replacementGroup: 'source',
        scope: 'private',
        path: `/private/source/photos/404/${MEDIA_GENERATION}/source.jpg`,
        contentType: 'image/jpeg',
        generation: MEDIA_GENERATION
    };
    const report = analyzeMetadataSnapshot({
        photos: [{
            ...photo(404),
            source: undefined,
            mediaGeneration: MEDIA_GENERATION,
            assets: [full, source]
        }],
        series: []
    });

    assert.deepEqual(report.errors, []);
    assert.deepEqual(
        report.normalized.photos[0].assets.map((asset) => asset.role),
        ['full', 'source']
    );
    assert.equal(
        report.normalized.photos[0].assets.some((asset) => asset.role === 'mobile'),
        false
    );
    assert.deepEqual(
        toStoragePhoto(report.normalized.photos[0]).assets,
        [full, source]
    );
});

test('rejects an invalid explicit asset inventory instead of silently guessing paths', () => {
    const report = analyzeMetadataSnapshot({
        photos: [{
            ...photo(505),
            assets: [{
                role: 'full',
                replacementGroup: 'derivatives',
                scope: 'public',
                path: '/uploads/photos/505/missing-generation/full.webp',
                contentType: 'image/webp',
                generation: 'missing-generation'
            }]
        }],
        series: []
    });

    assert.equal(
        report.errors.some((entry) => entry.code === 'INVALID_PHOTO_ASSET_INVENTORY'),
        true
    );

    const retiredReport = analyzeMetadataSnapshot({
        photos: [{
            ...photo(506),
            assets: [{
                role: 'full',
                replacementGroup: 'derivatives',
                scope: 'public',
                path: `/uploads/photos/506/${MEDIA_GENERATION}/full.webp`,
                contentType: 'image/webp',
                generation: MEDIA_GENERATION,
                state: 'retired'
            }]
        }],
        series: []
    });
    assert.equal(
        retiredReport.errors.some((entry) => (
            entry.code === 'INVALID_PHOTO_ASSET_INVENTORY'
        )),
        true
    );
});

test('snapshot inventory preserves a source from an older replacement generation', () => {
    const newerGeneration = '01JGFJJZ00XR5RF7YH2J5PVWBY';
    const stored = toStoragePhoto({
        id: 606,
        title: 'Regenerated derivatives',
        location: 'Roma',
        mediaGeneration: newerGeneration,
        assets: [{
            role: 'full',
            replacementGroup: 'derivatives',
            scope: 'public',
            path: `/uploads/photos/606/${newerGeneration}/full.webp`,
            contentType: 'image/webp',
            generation: newerGeneration
        }, {
            role: 'source',
            replacementGroup: 'source',
            scope: 'private',
            path: `/private/source/photos/606/${MEDIA_GENERATION}/source.jpg`,
            contentType: 'image/jpeg',
            generation: MEDIA_GENERATION
        }]
    });

    assert.equal(stored.assets[0].generation, newerGeneration);
    assert.equal(stored.assets[1].generation, MEDIA_GENERATION);
    assert.equal(stored.assets[1].role, 'source');
});

test('rejects an asset path owned by another photo', () => {
    const record = photo(701);
    record.assets[0].path = `/uploads/photos/702/${MEDIA_GENERATION}/full.webp`;
    const report = analyzeMetadataSnapshot({ photos: [record], series: [] });

    assert.equal(
        report.errors.some((entry) => (
            entry.code === 'INVALID_PHOTO_ASSET_INVENTORY'
            && entry.message.includes('foto diversa')
        )),
        true
    );
});

test('rejects a declared generation that differs from the asset path', () => {
    const pathGeneration = '01JGFJJZ00XR5RF7YH2J5PVWBY';
    const record = photo(702);
    record.assets[0].path = `/uploads/photos/702/${pathGeneration}/full.webp`;
    const report = analyzeMetadataSnapshot({ photos: [record], series: [] });

    assert.equal(
        report.errors.some((entry) => entry.message.includes('generazione dichiarata')),
        true
    );
});

test('rejects derivatives from different generations or outside mediaGeneration', () => {
    const otherGeneration = '01JGFJJZ00XR5RF7YH2J5PVWBY';
    const record = photo(703);
    record.assets.push({
        role: 'mobile',
        replacementGroup: 'derivatives',
        scope: 'public',
        path: `/uploads/photos/703/${otherGeneration}/mobile.webp`,
        contentType: 'image/webp',
        generation: otherGeneration
    });
    const report = analyzeMetadataSnapshot({ photos: [record], series: [] });

    assert.equal(
        report.errors.some((entry) => entry.message.includes('mediaGeneration pubblicata')),
        true
    );
});

test('rejects incompatible role, scope and replacement group combinations', () => {
    const record = photo(704);
    record.assets[0] = {
        ...record.assets[0],
        replacementGroup: 'source'
    };
    const report = analyzeMetadataSnapshot({ photos: [record], series: [] });

    assert.equal(
        report.errors.some((entry) => entry.message.includes('source non sono coerenti')),
        true
    );

    const operationOwned = photo(707);
    operationOwned.assets[0].mediaOperationId = '123e4567-e89b-42d3-a456-426614174000';
    const ownedReport = analyzeMetadataSnapshot({ photos: [operationOwned], series: [] });
    assert.equal(
        ownedReport.errors.some((entry) => entry.message.includes('ownership')),
        true
    );
});

test('rejects snapshots without full and active staging inventory entries', () => {
    const withoutFull = photo(705);
    withoutFull.assets = withoutFull.assets.filter((asset) => asset.role !== 'full');
    const missingFullReport = analyzeMetadataSnapshot({
        photos: [withoutFull],
        series: []
    });
    assert.equal(
        missingFullReport.errors.some((entry) => entry.code === 'MISSING_CANONICAL_FULL_ASSET'),
        true
    );

    const withStaging = photo(706);
    withStaging.assets.push({
        role: 'creation-source',
        replacementGroup: 'creation-staging',
        scope: 'private',
        path: '/private/source/photo-creation-intents/123e4567-e89b-42d3-a456-426614174000/source.jpg',
        contentType: 'image/jpeg',
        generation: null
    });
    const stagingReport = analyzeMetadataSnapshot({ photos: [withStaging], series: [] });
    assert.equal(
        stagingReport.errors.some((entry) => entry.message.includes('staging')),
        true
    );
});
