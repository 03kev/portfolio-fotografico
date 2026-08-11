const assert = require('node:assert/strict');
const { beforeEach, test } = require('node:test');
const { JsonPortfolioRepository } = require('../src/repositories/JsonPortfolioRepository');

function createMemoryMetadataStorage() {
    const files = new Map();

    return {
        async readMetadataFile(filename, fallbackValue = []) {
            if (!files.has(filename)) return structuredClone(fallbackValue);
            return structuredClone(files.get(filename));
        },
        async writeMetadataFile(filename, value) {
            files.set(filename, structuredClone(value));
        },
        seed(filename, value) {
            files.set(filename, structuredClone(value));
        },
        snapshot(filename) {
            return structuredClone(files.get(filename));
        }
    };
}

function buildPhoto(id, overrides = {}) {
    return {
        id,
        title: `Photo ${id}`,
        description: '',
        date: '',
        location: 'Roma',
        lat: 41.9,
        lng: 12.5,
        settings: {},
        tags: [],
        mobileImage: true,
        updatedAt: 1,
        derivativesVersion: 1,
        ...overrides
    };
}

function buildSeries(id, overrides = {}) {
    const timestamp = '2026-01-01T00:00:00.000Z';
    return {
        id: String(id),
        title: `Series ${id}`,
        slug: `series-${id}`,
        description: 'Description',
        coverImage: null,
        photos: [],
        content: [],
        published: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...overrides
    };
}

let metadataStorage;
let repository;

beforeEach(() => {
    metadataStorage = createMemoryMetadataStorage();
    repository = new JsonPortfolioRepository(metadataStorage);
});

test('exposes domain operations while declaring the JSON consistency limitations', () => {
    assert.deepEqual(repository.capabilities, {
        transactions: false,
        optimisticConcurrency: false,
        referentialIntegrity: false,
        perEntityWrites: false,
        distributedMediaMutations: false,
        distributedPhotoCreations: false,
        durableMediaCleanup: false,
        auditHistory: false
    });
    assert.equal(typeof repository.photos.list, 'function');
    assert.equal(typeof repository.photos.findById, 'function');
    assert.equal(typeof repository.photos.create, 'function');
    assert.equal(typeof repository.photos.updateById, 'function');
    assert.equal(typeof repository.series.addPhoto, 'function');
    assert.equal(typeof repository.deletePhotoWithReferences, 'function');
    assert.equal(repository.photos.writeAll, undefined);
    assert.equal(repository.series.writeAll, undefined);
});

test('photo operations address one domain entity and preserve unrelated records sequentially', async () => {
    await repository.photos.create(buildPhoto(101));
    await repository.photos.create(buildPhoto(202));

    const updated = await repository.photos.updateById(101, {
        title: 'Updated'
    }, {
        expectedVersion: 'accepted-by-contract-but-unsupported-by-json'
    });

    assert.equal(updated.title, 'Updated');
    assert.equal((await repository.photos.findById(202)).title, 'Photo 202');
    assert.equal((await repository.photos.list()).length, 2);
});

test('series identity uniqueness includes drafts in the temporary adapter', async () => {
    await repository.series.create(buildSeries(1, {
        title: 'Praga',
        slug: 'praga',
        published: false
    }));

    await assert.rejects(
        () => repository.series.create(buildSeries(2, {
            title: '  PRAGA ',
            slug: 'praga-2',
            published: false
        })),
        (error) => error.code === 'SERIES_TITLE_CONFLICT' && error.status === 409
    );
});

test('series content outside membership is rejected instead of silently removed', async () => {
    await assert.rejects(
        () => repository.series.create(buildSeries(1, {
            photos: [101],
            content: [{
                id: 'outside-membership',
                type: 'photo',
                content: 202,
                layout: { x: 0, y: 0, w: 16, h: 22, unit: 'grid' }
            }]
        })),
        (error) => (
            error.code === 'REFERENCE_INTEGRITY_CONFLICT'
            && error.details?.photoIds?.[0] === 202
        )
    );
    assert.deepEqual(await repository.series.list(), []);
});

test('ordinary JSON reads and writes reject legacy content without migrating the snapshot', async () => {
    const canonical = buildSeries(1, {
        title: 'Canonica',
        slug: 'canonica',
        photos: [101],
        content: [{
            id: 'canonical-photo',
            type: 'photo',
            content: 101,
            layout: { x: 0, y: 0, w: 16, h: 22, unit: 'grid' }
        }]
    });
    const legacy = buildSeries(2, {
        title: 'Legacy',
        slug: 'legacy',
        photos: [202],
        content: [{
            id: 'legacy-image',
            type: 'image',
            content: 202,
            layout: { x: 0, y: 0, w: 16, h: 22, gridVersion: 2 }
        }]
    });
    const original = [canonical, legacy];
    metadataStorage.seed('series.json', original);

    await assert.rejects(
        () => repository.series.list(),
        (error) => error.details?.reason === 'UNKNOWN_SERIES_BLOCK_TYPE'
    );
    await assert.rejects(
        () => repository.series.updateById(1, { description: 'Non deve essere scritto' }),
        (error) => error.details?.reason === 'UNKNOWN_SERIES_BLOCK_TYPE'
    );
    await assert.rejects(
        () => repository.series.removePhotoReferences(101),
        (error) => error.details?.reason === 'UNKNOWN_SERIES_BLOCK_TYPE'
    );
    await repository.photos.create(buildPhoto(101));
    await assert.rejects(
        () => repository.deletePhotoWithReferences(101),
        (error) => error.details?.reason === 'UNKNOWN_SERIES_BLOCK_TYPE'
    );
    assert.equal((await repository.photos.findById(101)).id, 101);
    assert.deepEqual(metadataStorage.snapshot('series.json'), original);
});

test('deletePhotoWithReferences represents the future atomic domain operation', async () => {
    await repository.photos.create(buildPhoto(101));
    await repository.series.create(buildSeries(1, {
        coverImage: 101,
        photos: [101]
    }));

    const result = await repository.deletePhotoWithReferences(101);

    assert.equal(result.photo.id, 101);
    assert.equal(result.referenceCleanup.modifiedCount, 1);
    assert.equal(result.referenceCleanupError, null);
    assert.equal(await repository.photos.findById(101), null);
    assert.deepEqual((await repository.series.findByIdentifier('1')).photos, []);
});

test('the JSON aggregate preserves best-effort cleanup semantics until SQL migration', async () => {
    await repository.photos.create(buildPhoto(101));
    const expectedError = new Error('series write failed');
    repository.series.removePhotoReferences = async () => {
        throw expectedError;
    };

    const result = await repository.deletePhotoWithReferences(101);

    assert.equal(result.photo.id, 101);
    assert.equal(result.referenceCleanup, null);
    assert.equal(result.referenceCleanupError, expectedError);
    assert.equal(await repository.photos.findById(101), null);
});
