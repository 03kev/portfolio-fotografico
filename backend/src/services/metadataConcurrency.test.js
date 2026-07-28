const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const {
    after,
    before,
    beforeEach,
    test
} = require('node:test');

// These are characterization tests: they intentionally assert the unsafe
// behavior of the current read-modify-write storage model. When metadata
// becomes transactional, these expectations must be inverted.
process.env.NODE_ENV = 'test';
process.env.API_WRITE_TOKEN = '';
process.env.API_WRITE_TOKEN_HASH = '';
process.env.API_SESSION_SECRET = '';
process.env.R2_ACCOUNT_ID = 'test-account';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
process.env.R2_BUCKET = 'test-bucket';
process.env.R2_PRIVATE_BUCKET = 'test-private-bucket';

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function withTimeout(promise, label, timeoutMs = 2000) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Timeout waiting for ${label}`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function normalizeObjectKey(value) {
    return String(value || '').replace(/^\/+/, '');
}

function createControlledObjectStore() {
    const objects = new Map();
    const readBarriers = new Map();
    const putHolds = new Map();

    function reset() {
        objects.clear();
        readBarriers.clear();
        putHolds.clear();
    }

    function seedJson(key, value) {
        objects.set(normalizeObjectKey(key), Buffer.from(JSON.stringify(value, null, 2), 'utf8'));
    }

    function readJson(key) {
        const value = objects.get(normalizeObjectKey(key));
        return value ? JSON.parse(value.toString('utf8')) : null;
    }

    function armReadBarrier(key, expectedReads) {
        const normalizedKey = normalizeObjectKey(key);
        const gate = createDeferred();
        readBarriers.set(normalizedKey, {
            arrived: 0,
            expectedReads,
            gate
        });
    }

    function holdNextPuts(key, expectedPuts) {
        const normalizedKey = normalizeObjectKey(key);
        const arrivals = createDeferred();
        putHolds.set(normalizedKey, {
            expectedPuts,
            pending: [],
            arrivals
        });
    }

    async function waitForHeldPuts(key) {
        const normalizedKey = normalizeObjectKey(key);
        const hold = putHolds.get(normalizedKey);
        if (!hold) {
            throw new Error(`No held PUT configured for ${normalizedKey}`);
        }
        if (hold.pending.length >= hold.expectedPuts) {
            return hold.pending;
        }
        return withTimeout(hold.arrivals.promise, `${hold.expectedPuts} PUTs on ${normalizedKey}`);
    }

    async function getUploadObject(objectPath) {
        const key = normalizeObjectKey(objectPath);
        const storedValue = objects.get(key);
        const snapshot = storedValue ? Buffer.from(storedValue) : null;
        const barrier = readBarriers.get(key);

        if (barrier) {
            barrier.arrived += 1;
            const barrierPromise = barrier.gate.promise;
            if (barrier.arrived >= barrier.expectedReads) {
                readBarriers.delete(key);
                barrier.gate.resolve();
            }
            await barrierPromise;
        }

        if (!snapshot) return null;
        return {
            key,
            stream: Readable.from([snapshot]),
            contentType: 'application/json; charset=utf-8',
            contentLength: snapshot.length
        };
    }

    async function putUploadObject(objectPath, body, options = {}) {
        const key = normalizeObjectKey(objectPath);
        const value = Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(body);
        const hold = putHolds.get(key);

        if (hold && hold.pending.length < hold.expectedPuts) {
            const completion = createDeferred();
            const pendingPut = {
                key,
                value: Buffer.from(value),
                json: JSON.parse(value.toString('utf8')),
                commit() {
                    if (pendingPut.committed) return;
                    pendingPut.committed = true;
                    objects.set(key, Buffer.from(value));
                    completion.resolve();
                },
                committed: false
            };
            hold.pending.push(pendingPut);

            if (hold.pending.length >= hold.expectedPuts) {
                hold.arrivals.resolve(hold.pending);
            }

            await completion.promise;
        } else {
            objects.set(key, Buffer.from(value));
        }

        return {
            key,
            uploadPath: `/${key}`,
            contentType: options.contentType
        };
    }

    return {
        armReadBarrier,
        getUploadObject,
        holdNextPuts,
        putUploadObject,
        readJson,
        reset,
        seedJson,
        waitForHeldPuts
    };
}

const objectStore = createControlledObjectStore();
const r2StoragePath = require.resolve('./r2Storage');
require.cache[r2StoragePath] = {
    id: r2StoragePath,
    filename: r2StoragePath,
    loaded: true,
    exports: {
        createPrivateUploadPresignedPutUrl: async () => {
            throw new Error('Not used by metadata concurrency tests');
        },
        deletePrivateObject: async () => {},
        deleteUploadObject: async () => {},
        getPrivateObject: async () => null,
        getUploadObject: objectStore.getUploadObject,
        isR2Enabled: () => true,
        putPrivateObject: async () => {},
        putUploadObject: objectStore.putUploadObject
    }
};

const express = require('express');
const photoRoutes = require('../routes/photos');
const seriesRoutes = require('../routes/series');
const { portfolioRepository } = require('../repositories');
const { toStoragePhoto } = require('./photoRecord');
const { readMetadataFile, writeMetadataFile } = require('./metadataStorage');

const PHOTOS_KEY = 'data/photos.json';
const SERIES_KEY = 'data/series.json';
const PHOTO_ID = 101;
const TEST_MEDIA_GENERATION = '01JGFJJZ00XR5RF7YH2J5PVWBX';

let server;
let baseUrl;

function buildPhoto(id, overrides = {}) {
    return {
        id,
        title: `Photo ${id}`,
        description: `Description ${id}`,
        date: '2026-01-01',
        location: 'Roma',
        lat: 41.9028,
        lng: 12.4964,
        camera: 'Camera',
        lens: 'Lens',
        resolution: '3000x2000',
        settings: {},
        tags: ['test'],
        sourcePath: `/private/source/photos/${id}/${TEST_MEDIA_GENERATION}/source.jpg`,
        sourceContentType: 'image/jpeg',
        mobileImage: true,
        updatedAt: 1,
        derivativesVersion: 1,
        mediaGeneration: TEST_MEDIA_GENERATION,
        ...overrides
    };
}

function buildSeries(id, photoIds = [], overrides = {}) {
    const createdAt = '2026-01-01T00:00:00.000Z';
    return {
        id: String(id),
        title: `Series ${id}`,
        slug: `series-${id}`,
        description: `Series description ${id}`,
        coverImage: photoIds[0] ?? null,
        photos: photoIds,
        content: photoIds.map((photoId, index) => ({
            id: `photo-${photoId}`,
            type: 'photo',
            content: photoId,
            layout: {
                x: 0,
                y: index * 23,
                w: 16,
                h: 22,
                unit: 'grid'
            },
            showTitle: true,
            showLightbox: true
        })),
        published: true,
        createdAt,
        updatedAt: createdAt,
        ...overrides
    };
}

async function request(method, path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : {
            'content-type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json();
    return { response, payload };
}

async function seedState({ photos = [], series = [] } = {}) {
    objectStore.reset();
    await writeMetadataFile('photos.json', photos.map((photo) => toStoragePhoto(photo)));
    await writeMetadataFile('series.json', series);
}

function assertSuccessfulMutation(result) {
    assert.equal(result.response.status >= 200 && result.response.status < 300, true);
    assert.equal(result.payload.success, true);
}

before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/photos', photoRoutes);
    app.use('/api/series', seriesRoutes);

    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    if (!server) return;
    await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
});

beforeEach(async () => {
    await seedState();
});

test('[known race] concurrent updates to the same photo lose one disjoint field change', async () => {
    await seedState({
        photos: [buildPhoto(PHOTO_ID, {
            title: 'Original title',
            description: 'Original description'
        })]
    });
    objectStore.armReadBarrier(PHOTOS_KEY, 2);

    const [titleUpdate, descriptionUpdate] = await Promise.all([
        request('PUT', `/api/photos/${PHOTO_ID}`, { title: 'Concurrent title' }),
        request('PUT', `/api/photos/${PHOTO_ID}`, { description: 'Concurrent description' })
    ]);

    assertSuccessfulMutation(titleUpdate);
    assertSuccessfulMutation(descriptionUpdate);

    const [storedPhoto] = await portfolioRepository.photos.list();
    const persistedChanges = [
        storedPhoto.title === 'Concurrent title',
        storedPhoto.description === 'Concurrent description'
    ].filter(Boolean).length;

    assert.equal(persistedChanges, 1, 'current last-write-wins behavior persists only one update');
});

test('[known race] concurrent updates to different photos still overwrite the whole collection', async () => {
    await seedState({
        photos: [
            buildPhoto(101, { title: 'First original' }),
            buildPhoto(202, { description: 'Second original' })
        ]
    });
    objectStore.armReadBarrier(PHOTOS_KEY, 2);

    const [firstUpdate, secondUpdate] = await Promise.all([
        request('PUT', '/api/photos/101', { title: 'First updated' }),
        request('PUT', '/api/photos/202', { description: 'Second updated' })
    ]);

    assertSuccessfulMutation(firstUpdate);
    assertSuccessfulMutation(secondUpdate);

    const storedPhotos = await portfolioRepository.photos.list();
    const first = storedPhotos.find((photo) => photo.id === 101);
    const second = storedPhotos.find((photo) => photo.id === 202);
    const persistedChanges = [
        first.title === 'First updated',
        second.description === 'Second updated'
    ].filter(Boolean).length;

    assert.equal(persistedChanges, 1, 'disjoint records conflict because photos.json is replaced as a whole');
});

test('[known race] concurrent updates to different series lose one successful update', async () => {
    await seedState({
        series: [
            buildSeries('one', [101], { id: '1', slug: 'series-one' }),
            buildSeries('two', [202], { id: '2', slug: 'series-two' })
        ]
    });
    objectStore.armReadBarrier(SERIES_KEY, 2);

    const [firstUpdate, secondUpdate] = await Promise.all([
        request('PUT', '/api/series/1', { description: 'First updated' }),
        request('PUT', '/api/series/2', { description: 'Second updated' })
    ]);

    assertSuccessfulMutation(firstUpdate);
    assertSuccessfulMutation(secondUpdate);

    const storedSeries = await readMetadataFile('series.json', []);
    const first = storedSeries.find((item) => item.id === '1');
    const second = storedSeries.find((item) => item.id === '2');
    const persistedChanges = [
        first.description === 'First updated',
        second.description === 'Second updated'
    ].filter(Boolean).length;

    assert.equal(persistedChanges, 1, 'series.json also has whole-document last-write-wins behavior');
});

test('[known race] photo update can resurrect a concurrently deleted photo', async () => {
    await seedState({
        photos: [buildPhoto(PHOTO_ID)]
    });
    objectStore.armReadBarrier(PHOTOS_KEY, 2);
    objectStore.holdNextPuts(PHOTOS_KEY, 2);

    const updatePromise = request('PUT', `/api/photos/${PHOTO_ID}`, {
        title: 'Updated during delete'
    });
    const deletePromise = request('DELETE', `/api/photos/${PHOTO_ID}`);
    const pendingPuts = await objectStore.waitForHeldPuts(PHOTOS_KEY);
    const deletePut = pendingPuts.find((pending) => pending.json.length === 0);
    const updatePut = pendingPuts.find((pending) => pending.json.length === 1);

    assert.ok(deletePut);
    assert.ok(updatePut);
    deletePut.commit();
    updatePut.commit();

    const [updateResult, deleteResult] = await Promise.all([updatePromise, deletePromise]);
    assertSuccessfulMutation(updateResult);
    assertSuccessfulMutation(deleteResult);

    const storedPhotos = await portfolioRepository.photos.list();
    assert.equal(storedPhotos.length, 1);
    assert.equal(storedPhotos[0].id, PHOTO_ID);
    assert.equal(storedPhotos[0].title, 'Updated during delete');
});

test('[known race] series update after cleanup can restore a dangling reference to a deleted photo', async () => {
    await seedState({
        photos: [buildPhoto(PHOTO_ID)],
        series: [buildSeries('1', [PHOTO_ID], {
            id: '1',
            title: 'Referenced series',
            slug: 'referenced-series',
            description: 'Original description'
        })]
    });
    objectStore.armReadBarrier(SERIES_KEY, 2);
    objectStore.holdNextPuts(SERIES_KEY, 2);

    const seriesUpdatePromise = request('PUT', '/api/series/1', {
        description: 'Concurrent edit'
    });
    const photoDeletePromise = request('DELETE', `/api/photos/${PHOTO_ID}`);
    const pendingPuts = await objectStore.waitForHeldPuts(SERIES_KEY);
    const cleanupPut = pendingPuts.find((pending) => !pending.json[0].photos.includes(PHOTO_ID));
    const updatePut = pendingPuts.find((pending) => pending.json[0].photos.includes(PHOTO_ID));

    assert.ok(cleanupPut);
    assert.ok(updatePut);
    cleanupPut.commit();
    updatePut.commit();

    const [seriesUpdate, photoDelete] = await Promise.all([
        seriesUpdatePromise,
        photoDeletePromise
    ]);
    assertSuccessfulMutation(seriesUpdate);
    assertSuccessfulMutation(photoDelete);

    const storedPhotos = await portfolioRepository.photos.list();
    const [storedSeries] = await readMetadataFile('series.json', []);
    assert.equal(storedPhotos.some((photo) => photo.id === PHOTO_ID), false);
    assert.equal(storedSeries.photos.includes(PHOTO_ID), true);
    assert.equal(storedSeries.description, 'Concurrent edit');
});

test('[known race] cleanup after a series update removes the photo but loses the successful edit', async () => {
    await seedState({
        photos: [buildPhoto(PHOTO_ID)],
        series: [buildSeries('1', [PHOTO_ID], {
            id: '1',
            title: 'Referenced series',
            slug: 'referenced-series',
            description: 'Original description'
        })]
    });
    objectStore.armReadBarrier(SERIES_KEY, 2);
    objectStore.holdNextPuts(SERIES_KEY, 2);

    const seriesUpdatePromise = request('PUT', '/api/series/1', {
        description: 'Concurrent edit'
    });
    const photoDeletePromise = request('DELETE', `/api/photos/${PHOTO_ID}`);
    const pendingPuts = await objectStore.waitForHeldPuts(SERIES_KEY);
    const cleanupPut = pendingPuts.find((pending) => !pending.json[0].photos.includes(PHOTO_ID));
    const updatePut = pendingPuts.find((pending) => pending.json[0].photos.includes(PHOTO_ID));

    assert.ok(cleanupPut);
    assert.ok(updatePut);
    updatePut.commit();
    cleanupPut.commit();

    const [seriesUpdate, photoDelete] = await Promise.all([
        seriesUpdatePromise,
        photoDeletePromise
    ]);
    assertSuccessfulMutation(seriesUpdate);
    assertSuccessfulMutation(photoDelete);

    const [storedSeries] = await readMetadataFile('series.json', []);
    assert.equal(storedSeries.photos.includes(PHOTO_ID), false);
    assert.equal(storedSeries.description, 'Original description');
});

test('[known race] photo cleanup can resurrect a concurrently deleted series', async () => {
    await seedState({
        photos: [buildPhoto(PHOTO_ID)],
        series: [buildSeries('1', [PHOTO_ID], {
            id: '1',
            title: 'Series being deleted',
            slug: 'series-being-deleted'
        })]
    });
    objectStore.armReadBarrier(SERIES_KEY, 2);
    objectStore.holdNextPuts(SERIES_KEY, 2);

    const seriesDeletePromise = request('DELETE', '/api/series/1');
    const photoDeletePromise = request('DELETE', `/api/photos/${PHOTO_ID}`);
    const pendingPuts = await objectStore.waitForHeldPuts(SERIES_KEY);
    const seriesDeletePut = pendingPuts.find((pending) => pending.json.length === 0);
    const cleanupPut = pendingPuts.find((pending) => (
        pending.json.length === 1
        && !pending.json[0].photos.includes(PHOTO_ID)
    ));

    assert.ok(seriesDeletePut);
    assert.ok(cleanupPut);
    seriesDeletePut.commit();
    cleanupPut.commit();

    const [seriesDelete, photoDelete] = await Promise.all([
        seriesDeletePromise,
        photoDeletePromise
    ]);
    assertSuccessfulMutation(seriesDelete);
    assertSuccessfulMutation(photoDelete);

    const storedSeries = await readMetadataFile('series.json', []);
    assert.equal(storedSeries.length, 1);
    assert.equal(storedSeries[0].id, '1');
    assert.deepEqual(storedSeries[0].photos, []);
});

test('[known dangling references] cleanup does not remove canonical photo and photo-group blocks', async () => {
    await seedState({
        series: [buildSeries('1', [101, 202], {
            id: '1',
            title: 'Nested references',
            slug: 'nested-references',
            coverImage: 101,
            content: [
                {
                    id: 'single-photo',
                    type: 'photo',
                    content: 101,
                    layout: { x: 0, y: 0, w: 12, h: 12, unit: 'grid' },
                    showTitle: true,
                    showLightbox: true
                },
                {
                    id: 'photo-group',
                    type: 'photos',
                    content: [
                        {
                            id: 101,
                            layout: { x: 0, y: 0, w: 6, h: 8, unit: 'grid' }
                        },
                        {
                            id: 202,
                            layout: { x: 6, y: 0, w: 6, h: 8, unit: 'grid' }
                        }
                    ],
                    layout: { x: 0, y: 14, w: 12, h: 10, unit: 'grid' }
                }
            ]
        })]
    });

    const cleanupResult = await portfolioRepository.series.removePhotoReferences(101);
    const [storedSeries] = objectStore.readJson(SERIES_KEY);
    const singlePhotoBlock = storedSeries.content.find((block) => block.type === 'photo');
    const groupBlock = storedSeries.content.find((block) => block.type === 'photos');

    assert.equal(cleanupResult.modified, true);
    assert.deepEqual(storedSeries.photos, [202]);
    assert.equal(storedSeries.coverImage, 202);
    assert.equal(singlePhotoBlock.content, 101);
    assert.deepEqual(groupBlock.content.map((item) => item.id), [101, 202]);
});
