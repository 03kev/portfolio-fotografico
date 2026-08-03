const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const express = require('express');
const {
    after,
    before,
    beforeEach,
    test
} = require('node:test');
const {
    PostgresPortfolioRepository
} = require('../src/repositories/PostgresPortfolioRepository');
const {
    PhotoCreationService,
    buildPhotoCreationPayloadHash
} = require('../src/services/photoCreation');
const {
    createPhotoCreationRouter
} = require('../src/routes/photoCreationRoutes');
const {
    normalizePostgresConnectionString
} = require('../src/utils/postgresConnectionString');
const {
    PHOTO_ASSET_REPLACEMENT_GROUPS
} = require('../src/services/photoAssetLifecycle');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = String(process.env.TEST_DATABASE_URL || '').trim();
const integrationTest = databaseUrl ? test : test.skip;
const schemaName = `photo_creation_${process.pid}_${Date.now()}`;
const INTENT_ID = '10000000-0000-4000-8000-000000000001';
const SECOND_INTENT_ID = '10000000-0000-4000-8000-000000000002';
const GENERATIONS = Object.freeze([
    '01JGFJJZ00XR5RF7YH2J5PVWBX',
    '01JGFJJZ00XR5RF7YH2J5PVWBY',
    '01JGFJJZ00XR5RF7YH2J5PVWBZ',
    '01JGFJJZ00XR5RF7YH2J5PVWC0',
    '01JGFJJZ00XR5RF7YH2J5PVWC1'
]);
const LEASE_IDS = Object.freeze([
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000005'
]);

let adminPool;
let scopedPool;
let repository;
let sources;
let finalizedSources;
let derivatives;
let derivativeRuns;
let writeRuns;
let leaseIndex;
let generationIndex;
let failNextWrite;
let processingGate;
let signingRuns;

class SchemaScopedPool {
    constructor(pool, schema) {
        this.pool = pool;
        this.schema = schema;
    }

    async connect() {
        const client = await this.pool.connect();
        try {
            await client.query(`SET search_path TO "${this.schema}"`);
            return client;
        } catch (error) {
            client.release();
            throw error;
        }
    }

    async query(text, values) {
        const client = await this.connect();
        try {
            return await client.query(text, values);
        } finally {
            client.release();
        }
    }
}

function createDeferred() {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

function photoDraft(overrides = {}) {
    return {
        title: 'Foto idempotente',
        description: 'Test del flusso reale di finalizzazione',
        date: '2026-07-29',
        location: 'Milano',
        lat: 45.4642,
        lng: 9.19,
        camera: 'Test camera',
        lens: 'Test lens',
        settings: {
            cropProfiles: {
                r43: { x: 0.5, y: 0.5, scale: 1 },
                r11: { x: 0.5, y: 0.5, scale: 1 },
                social: { x: 0.5, y: 0.5, scale: 1 }
            }
        },
        tags: ['integration'],
        ...overrides
    };
}

function publishedFullAsset(photoId, generation) {
    return [{
        role: 'full',
        replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES,
        scope: 'public',
        path: `/uploads/photos/${photoId}/${generation}/full.webp`,
        contentType: 'image/webp',
        generation
    }];
}

function createService({ derivativeGate = null, marker = 'default' } = {}) {
    return new PhotoCreationService({
        repository,
        createSignedUploadUrl: async (sourcePath) => {
            signingRuns += 1;
            return {
                uploadUrl: `https://r2.test/${sourcePath}`,
                uploadPath: sourcePath,
                expiresInSeconds: 600
            };
        },
        readSourceObject: async (sourcePath) => (
            sources.has(sourcePath)
                ? { buffer: sources.get(sourcePath), contentType: 'image/jpeg' }
                : null
        ),
        generateDerivatives: async () => {
            derivativeRuns += 1;
            const activeGate = derivativeGate || processingGate;
            if (activeGate) await activeGate.promise;
            return {
                assets: [
                    { role: 'full', replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES, scope: 'public', fileName: 'full.webp', contentType: 'image/webp', buffer: Buffer.from(`full-${marker}`) },
                    { role: 'mobile', replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES, scope: 'public', fileName: 'mobile.webp', contentType: 'image/webp', buffer: Buffer.from(`mobile-${marker}`) },
                    { role: 'thumbnail-4x3', replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES, scope: 'public', fileName: 'thumbnail-4x3.webp', contentType: 'image/webp', buffer: Buffer.from(`43-${marker}`) },
                    { role: 'thumbnail-1x1', replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES, scope: 'public', fileName: 'thumbnail-1x1.webp', contentType: 'image/webp', buffer: Buffer.from(`11-${marker}`) },
                    { role: 'social', replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES, scope: 'public', fileName: 'social.jpg', contentType: 'image/jpeg', buffer: Buffer.from(`social-${marker}`) }
                ],
                resolution: '3000x2000'
            };
        },
        writeAssets: async (assets) => {
            writeRuns += 1;
            for (const asset of assets) {
                if (asset.scope === 'private') {
                    finalizedSources.set(asset.path, asset.buffer);
                } else {
                    derivatives.set(asset.path, asset.buffer);
                }
                if (failNextWrite) {
                    failNextWrite = false;
                    throw new Error('simulated partial R2 failure');
                }
            }
        },
        createMediaGeneration: () => GENERATIONS[generationIndex++],
        createOperationId: () => LEASE_IDS[leaseIndex++],
        intentTtlMs: 60_000,
        leaseTtlMs: 60_000
    });
}

async function prepareSource(service, uploadIntentId = INTENT_ID) {
    const prepared = await service.prepareUpload({
        uploadIntentId,
        sourceContentType: 'image/jpeg',
        sourceExtension: 'jpg',
        signedUrlOptions: {
            contentType: 'image/jpeg',
            expiresInSeconds: 600
        }
    });
    sources.set(prepared.sourcePath, Buffer.from('source'));
    return prepared;
}

function finalize(service, prepared, draft = photoDraft()) {
    return service.finalize({
        uploadIntentId: prepared.uploadIntentId,
        photoId: prepared.photoId,
        sourcePath: prepared.sourcePath,
        photoDraft: draft
    });
}

async function withPhotoCreationServer(service, callback) {
    const app = express();
    app.use(express.json());
    app.use('/photos', createPhotoCreationRouter({
        getPhotoCreationService: () => service
    }));
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
        const { port } = server.address();
        await callback(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
}

async function postJson(baseUrl, route, body) {
    const response = await fetch(`${baseUrl}${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return {
        status: response.status,
        body: await response.json()
    };
}

before(async () => {
    if (!databaseUrl) return;
    const { Pool } = require('pg');
    adminPool = new Pool({
        connectionString: normalizePostgresConnectionString(databaseUrl),
        max: 8
    });
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    scopedPool = new SchemaScopedPool(adminPool, schemaName);
    const migrationsDirectory = path.resolve(__dirname, '../db/migrations');
    const migrationNames = (await fs.readdir(migrationsDirectory))
        .filter((name) => name.endsWith('.sql'))
        .sort();
    for (const migrationName of migrationNames) {
        const migration = await fs.readFile(
            path.join(migrationsDirectory, migrationName),
            'utf8'
        );
        await scopedPool.query(migration);
    }
    repository = new PostgresPortfolioRepository(scopedPool);
});

beforeEach(async () => {
    if (!databaseUrl) return;
    await scopedPool.query(
        `TRUNCATE
            photo_assets,
            media_cleanup_jobs,
            admin_audit_events,
            series_photos,
            series,
            photos,
            photo_creation_intents
         CASCADE`
    );
    sources = new Map();
    finalizedSources = new Map();
    derivatives = new Map();
    derivativeRuns = 0;
    writeRuns = 0;
    leaseIndex = 0;
    generationIndex = 0;
    failNextWrite = false;
    processingGate = null;
    signingRuns = 0;
});

after(async () => {
    if (!adminPool) return;
    await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await adminPool.end();
});

integrationTest('Postgres allocates distinct photo IDs for concurrent intents', async () => {
    const service = createService();
    const [first, second] = await Promise.all([
        prepareSource(service, INTENT_ID),
        prepareSource(service, SECOND_INTENT_ID)
    ]);

    assert.notEqual(first.photoId, second.photoId);
    assert.equal(Number.isSafeInteger(first.photoId), true);
    assert.equal(Number.isSafeInteger(second.photoId), true);
    assert.equal(
        (await repository.photoCreations.findById(INTENT_ID)).photoId,
        first.photoId
    );
    assert.equal(
        (await repository.photoCreations.findById(SECOND_INTENT_ID)).photoId,
        second.photoId
    );
});

integrationTest('the allocator skips explicit imported IDs and preserves them unchanged', async () => {
    const importedId = 4_000_000_000_000_000;
    const mediaGeneration = '01JGFJJZ00XR5RF7YH2J5PVWC4';
    await repository.photos.create({
        ...photoDraft(),
        id: importedId,
        sourcePath: `/private/source/photos/${importedId}/${mediaGeneration}/source.jpg`,
        sourceContentType: 'image/jpeg',
        mobileImage: true,
        updatedAt: 1,
        derivativesVersion: 1,
        mediaGeneration,
        assets: publishedFullAsset(importedId, mediaGeneration)
    });
    await scopedPool.query(
        `SELECT setval('portfolio_photo_id_seq', $1, FALSE)`,
        [importedId]
    );

    const prepared = await prepareSource(createService());
    assert.equal((await repository.photos.findById(importedId)).id, importedId);
    assert.equal(prepared.photoId > importedId, true);
});

integrationTest('replaying signing and finalization returns the same photo without reprocessing', async () => {
    const service = createService();
    const prepared = await prepareSource(service);
    const signingReplay = await service.prepareUpload({
        uploadIntentId: INTENT_ID,
        sourceContentType: 'image/jpeg',
        sourceExtension: 'jpg'
    });
    assert.equal(signingReplay.sourcePath, prepared.sourcePath);
    assert.equal(signingReplay.photoId, prepared.photoId);

    const first = await finalize(service, prepared);
    const replay = await finalize(service, prepared);

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(replay.photo.id, first.photo.id);
    assert.equal(derivativeRuns, 1);
    assert.equal(writeRuns, 1);
    const count = await scopedPool.query('SELECT count(*)::int AS count FROM photos');
    assert.equal(count.rows[0].count, 1);
});

integrationTest('photo paths, final record and created_at use the allocated intent identity', async () => {
    const service = createService();
    const prepared = await prepareSource(service);
    const intentBeforeFinalize = await repository.photoCreations.findById(INTENT_ID);
    const result = await finalize(service, prepared);
    const stored = await scopedPool.query(
        `SELECT p.id, p.created_at, a.logical_path AS source_path
         FROM photos p
         JOIN photo_assets a
           ON a.photo_id = p.id
          AND a.object_namespace = $2
          AND a.role = 'source'
          AND a.state = 'active'
         WHERE p.creation_intent_id = $1::uuid`,
        [INTENT_ID, '']
    );

    assert.equal(result.photo.id, prepared.photoId);
    assert.equal(Number(stored.rows[0].id), prepared.photoId);
    assert.match(
        stored.rows[0].source_path,
        new RegExp(`/photos/${prepared.photoId}/${result.photo.mediaGeneration}/source\\.jpg$`)
    );
    assert.equal(
        new Date(stored.rows[0].created_at).toISOString(),
        intentBeforeFinalize.createdAt
    );
    assert.notEqual(
        new Date(stored.rows[0].created_at).getTime(),
        prepared.photoId
    );
});

integrationTest('HTTP prepare and finalize expose one backend-allocated identity and replay contract', async () => {
    const service = createService();
    await withPhotoCreationServer(service, async (baseUrl) => {
        const preparedResponse = await postJson(baseUrl, '/photos/upload-url', {
            uploadIntentId: INTENT_ID,
            variant: 'source',
            mimetype: 'image/jpeg',
            fileSize: 1024
        });
        assert.equal(preparedResponse.status, 200);
        assert.equal(preparedResponse.body.success, true);
        assert.equal(preparedResponse.body.data.uploadIntentId, INTENT_ID);
        assert.equal(Number.isSafeInteger(preparedResponse.body.data.photoId), true);
        sources.set(preparedResponse.body.data.sourcePath, Buffer.from('source'));

        const finalizationBody = {
            ...photoDraft(),
            photoId: preparedResponse.body.data.photoId,
            uploadIntentId: INTENT_ID,
            sourcePath: preparedResponse.body.data.sourcePath
        };
        const createdResponse = await postJson(baseUrl, '/photos', finalizationBody);
        const replayResponse = await postJson(baseUrl, '/photos', finalizationBody);

        assert.equal(createdResponse.status, 201);
        assert.equal(createdResponse.body.data.id, preparedResponse.body.data.photoId);
        assert.equal(createdResponse.body.replayed, false);
        assert.equal(replayResponse.status, 200);
        assert.equal(replayResponse.body.data.id, preparedResponse.body.data.photoId);
        assert.equal(replayResponse.body.replayed, true);
        assert.equal(derivativeRuns, 1);

        const completedPreparation = await postJson(
            baseUrl,
            '/photos/upload-url',
            {
                uploadIntentId: INTENT_ID,
                variant: 'source',
                mimetype: 'image/jpeg',
                fileSize: 1024
            }
        );
        assert.equal(completedPreparation.status, 409);
        assert.equal(
            completedPreparation.body.code,
            'PHOTO_UPLOAD_ALREADY_COMPLETED'
        );
        assert.equal(signingRuns, 1);

        await repository.photos.deleteById(preparedResponse.body.data.photoId, {
            expectedVersion: createdResponse.body.data.version
        });
        const deletedPreparation = await postJson(
            baseUrl,
            '/photos/upload-url',
            {
                uploadIntentId: INTENT_ID,
                variant: 'source',
                mimetype: 'image/jpeg',
                fileSize: 1024
            }
        );
        const deletedFinalization = await postJson(
            baseUrl,
            '/photos',
            finalizationBody
        );
        assert.equal(deletedPreparation.status, 410);
        assert.equal(deletedPreparation.body.code, 'PHOTO_UPLOAD_RESULT_GONE');
        assert.equal(deletedFinalization.status, 410);
        assert.equal(deletedFinalization.body.code, 'PHOTO_UPLOAD_RESULT_GONE');
        assert.equal(signingRuns, 1);
    });
});

integrationTest('concurrent finalizations allow one worker and a later replay reconciles safely', async () => {
    const service = createService();
    const prepared = await prepareSource(service);
    processingGate = createDeferred();

    const winnerPromise = finalize(service, prepared);
    while (derivativeRuns === 0) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    await assert.rejects(
        finalize(service, prepared),
        (error) => error.code === 'PHOTO_CREATE_IN_PROGRESS'
    );

    processingGate.resolve();
    processingGate = null;
    const winner = await winnerPromise;
    const reconciled = await finalize(service, prepared);

    assert.equal(winner.replayed, false);
    assert.equal(reconciled.replayed, true);
    assert.equal(reconciled.photo.id, winner.photo.id);
    assert.equal(derivativeRuns, 1);
});

integrationTest('partial derivative failure releases the lease and a retry overwrites the owned paths', async () => {
    const service = createService();
    const prepared = await prepareSource(service);
    failNextWrite = true;

    await assert.rejects(
        finalize(service, prepared),
        /simulated partial R2 failure/
    );
    assert.equal(sources.has(prepared.sourcePath), true);
    assert.equal(derivatives.size, 0);
    assert.equal(await repository.photos.findById(prepared.photoId), null);
    const released = await repository.photoCreations.findById(INTENT_ID);
    assert.equal(released.status, 'pending');
    assert.equal(released.leaseId, null);

    const retried = await finalize(service, prepared);
    assert.equal(retried.replayed, false);
    assert.equal(retried.photo.id, prepared.photoId);
    assert.equal(derivativeRuns, 2);
    assert.equal(writeRuns, 2);
    assert.equal(derivatives.size, 5);
    assert.equal(finalizedSources.size, 2);
});

integrationTest('a database conflict after media writes preserves the existing photo and leaves intent-owned output untouched', async () => {
    const service = createService();
    const prepared = await prepareSource(service);
    const mediaGeneration = '01JGFJJZ00XR5RF7YH2J5PVWC4';
    await repository.photos.create({
        id: prepared.photoId,
        title: 'Foto già presente',
        description: '',
        date: '2026-07-29',
        location: 'Roma',
        lat: 41.9,
        lng: 12.5,
        camera: '',
        lens: '',
        resolution: '100x100',
        settings: {},
        tags: [],
        sourcePath: `/private/source/photos/${prepared.photoId}/${mediaGeneration}/source.jpg`,
        sourceContentType: 'image/jpeg',
        mobileImage: true,
        updatedAt: prepared.photoId,
        derivativesVersion: prepared.photoId,
        mediaGeneration,
        assets: publishedFullAsset(prepared.photoId, mediaGeneration)
    });

    await assert.rejects(
        finalize(service, prepared),
        (error) => error.code === 'PHOTO_ID_CONFLICT'
    );

    const stored = await repository.photos.findById(prepared.photoId);
    const intent = await repository.photoCreations.findById(INTENT_ID);
    assert.equal(stored.title, 'Foto già presente');
    assert.equal(intent.status, 'pending');
    assert.equal(derivatives.size, 5);
    assert.equal(finalizedSources.size, 1);
});

integrationTest('an ambiguous response can be replayed after commit without touching R2 again', async () => {
    const service = createService();
    const prepared = await prepareSource(service);

    await finalize(service, prepared); // Simula commit riuscito e risposta persa.
    const afterLostResponse = await finalize(service, prepared);

    assert.equal(afterLostResponse.replayed, true);
    assert.equal(afterLostResponse.photo.id, prepared.photoId);
    assert.equal(derivativeRuns, 1);
    assert.equal(writeRuns, 1);
});

integrationTest('intent expiry applies to unfinished work while completed intents remain replay tombstones', async () => {
    const service = createService();
    const prepared = await prepareSource(service);
    const pending = await repository.photoCreations.findById(INTENT_ID);
    const pendingLifetimeMs = (
        new Date(pending.expiresAt).getTime()
        - new Date(pending.createdAt).getTime()
    );
    assert.equal(pending.status, 'pending');
    assert.equal(pendingLifetimeMs, 60_000);

    const created = await finalize(service, prepared);
    await scopedPool.query(
        `UPDATE photo_creation_intents
         SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
         WHERE id = $1::uuid`,
        [INTENT_ID]
    );
    const replay = await finalize(service, prepared);
    const completed = await repository.photoCreations.findById(INTENT_ID);

    assert.equal(completed.status, 'completed');
    assert.equal(completed.completedAt !== null, true);
    assert.equal(replay.replayed, true);
    assert.equal(replay.photo.id, created.photo.id);
    assert.equal(derivativeRuns, 1);
});

integrationTest('an expired worker lease can be reclaimed after an interrupted finalization', async () => {
    const service = createService();
    const prepared = await prepareSource(service);
    const draft = photoDraft();
    const payloadHash = buildPhotoCreationPayloadHash({
        uploadIntentId: INTENT_ID,
        photoId: prepared.photoId,
        sourcePath: prepared.sourcePath,
        photo: draft
    });
    await repository.photoCreations.claim(INTENT_ID, {
        leaseId: LEASE_IDS[0],
        photoId: prepared.photoId,
        generation: GENERATIONS[0],
        sourcePath: prepared.sourcePath,
        payloadHash,
        leaseTtlMs: 60_000
    });
    leaseIndex = 1;
    generationIndex = 1;
    await scopedPool.query(
        `UPDATE photo_creation_intents
         SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
         WHERE id = $1::uuid`,
        [INTENT_ID]
    );

    const recovered = await finalize(service, prepared, draft);
    assert.equal(recovered.photo.id, prepared.photoId);
    assert.equal(recovered.replayed, false);
});

integrationTest('a stale worker cannot release the successor lease', async () => {
    const service = createService();
    const prepared = await prepareSource(service);
    const draft = photoDraft();
    const payloadHash = buildPhotoCreationPayloadHash({
        uploadIntentId: INTENT_ID,
        photoId: prepared.photoId,
        sourcePath: prepared.sourcePath,
        photo: draft
    });
    await repository.photoCreations.claim(INTENT_ID, {
        leaseId: LEASE_IDS[0],
        photoId: prepared.photoId,
        generation: GENERATIONS[0],
        sourcePath: prepared.sourcePath,
        payloadHash,
        leaseTtlMs: 60_000
    });
    await scopedPool.query(
        `UPDATE photo_creation_intents
         SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
         WHERE id = $1::uuid`,
        [INTENT_ID]
    );
    await repository.photoCreations.claim(INTENT_ID, {
        leaseId: LEASE_IDS[1],
        photoId: prepared.photoId,
        generation: GENERATIONS[1],
        sourcePath: prepared.sourcePath,
        payloadHash,
        leaseTtlMs: 60_000
    });

    const staleRelease = await repository.photoCreations.release(
        INTENT_ID,
        LEASE_IDS[0]
    );
    const active = await repository.photoCreations.findById(INTENT_ID);

    assert.equal(staleRelease, null);
    assert.equal(active.status, 'processing');
    assert.equal(active.leaseId, LEASE_IDS[1]);
    assert.equal(active.leaseGeneration, GENERATIONS[1]);
});

integrationTest('an active processing lease cannot issue another source upload URL', async () => {
    const service = createService();
    const prepared = await prepareSource(service);
    const draft = photoDraft();
    const payloadHash = buildPhotoCreationPayloadHash({
        uploadIntentId: INTENT_ID,
        photoId: prepared.photoId,
        sourcePath: prepared.sourcePath,
        photo: draft
    });
    await repository.photoCreations.claim(INTENT_ID, {
        leaseId: LEASE_IDS[0],
        photoId: prepared.photoId,
        generation: GENERATIONS[0],
        sourcePath: prepared.sourcePath,
        payloadHash,
        leaseTtlMs: 60_000
    });

    await assert.rejects(
        service.prepareUpload({
            uploadIntentId: INTENT_ID,
            sourceContentType: 'image/jpeg',
            sourceExtension: 'jpg'
        }),
        (error) => error.code === 'PHOTO_CREATE_IN_PROGRESS'
    );
    assert.equal(signingRuns, 1);
});

integrationTest('an expired worker can never overwrite the generation committed by its successor', async () => {
    const staleGate = createDeferred();
    const staleService = createService({ derivativeGate: staleGate, marker: 'stale' });
    const winningService = createService({ marker: 'winner' });
    const prepared = await prepareSource(staleService);

    const stalePromise = finalize(staleService, prepared);
    while (derivativeRuns === 0) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    await scopedPool.query(
        `UPDATE photo_creation_intents
         SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
         WHERE id = $1::uuid`,
        [INTENT_ID]
    );

    const winner = await finalize(winningService, prepared);
    staleGate.resolve();
    await assert.rejects(
        stalePromise,
        (error) => error.code === 'PHOTO_UPLOAD_LEASE_LOST'
    );
    const stored = await repository.photos.findById(prepared.photoId);

    assert.equal(winner.replayed, false);
    assert.equal(stored.mediaGeneration, winner.photo.mediaGeneration);
    assert.notEqual(stored.mediaGeneration, GENERATIONS[0]);
    const winningFullPath = `/uploads/photos/${prepared.photoId}/${stored.mediaGeneration}/full.webp`;
    assert.equal(derivatives.get(winningFullPath).toString(), 'full-winner');
});

integrationTest('reusing one intent with different metadata is rejected before media processing', async () => {
    const service = createService();
    const prepared = await prepareSource(service);
    await finalize(service, prepared);

    await assert.rejects(
        finalize(service, prepared, photoDraft({ title: 'Titolo differente' })),
        (error) => error.code === 'PHOTO_UPLOAD_REPLAY_MISMATCH'
    );
    assert.equal(derivativeRuns, 1);
});

integrationTest('replay after deletion cannot resurrect a completed photo', async () => {
    const service = createService();
    const prepared = await prepareSource(service);
    const created = await finalize(service, prepared);

    await assert.rejects(
        service.prepareUpload({
            uploadIntentId: INTENT_ID,
            sourceContentType: 'image/jpeg',
            sourceExtension: 'jpg'
        }),
        (error) => (
            error.code === 'PHOTO_UPLOAD_ALREADY_COMPLETED'
            && error.status === 409
        )
    );
    assert.equal(signingRuns, 1);

    await repository.photos.deleteById(prepared.photoId, {
        expectedVersion: created.photo.version
    });

    await assert.rejects(
        finalize(service, prepared),
        (error) => error.code === 'PHOTO_UPLOAD_RESULT_GONE' && error.status === 410
    );
    await assert.rejects(
        service.prepareUpload({
            uploadIntentId: INTENT_ID,
            sourceContentType: 'image/jpeg',
            sourceExtension: 'jpg'
        }),
        (error) => error.code === 'PHOTO_UPLOAD_RESULT_GONE' && error.status === 410
    );
    assert.equal(await repository.photos.findById(prepared.photoId), null);
    assert.equal(derivativeRuns, 1);
    assert.equal(signingRuns, 1);
});
