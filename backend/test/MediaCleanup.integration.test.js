const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
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
    MediaCleanupExecutor
} = require('../src/services/mediaCleanup');
const {
    normalizePostgresConnectionString
} = require('../src/utils/postgresConnectionString');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = String(process.env.TEST_DATABASE_URL || '').trim();
const integrationTest = databaseUrl ? test : test.skip;
const schemaName = `media_cleanup_${process.pid}_${Date.now()}`;
const namespace = 'preview/feature-database';
const generations = Object.freeze([
    '01JGFJJZ00XR5RF7YH2J5PVWBX',
    '01JGFJJZ00XR5RF7YH2J5PVWBY',
    '01JGFJJZ00XR5RF7YH2J5PVWBZ'
]);

let adminPool;
let scopedPool;
let repository;
let deletedPublic;
let deletedPrivate;

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

function photoRecord(id, generation = generations[0], overrides = {}) {
    return {
        id,
        title: `Foto ${id}`,
        description: 'Foto usata dai test del cleanup durevole',
        date: '2026-07-29',
        location: 'Milano',
        lat: 45.4642,
        lng: 9.19,
        camera: 'Test camera',
        lens: 'Test lens',
        resolution: '3000x2000',
        settings: {},
        tags: ['cleanup'],
        sourcePath: `/private/source/photos/${id}/${generation}/source.jpg`,
        sourceContentType: 'image/jpeg',
        mobileImage: true,
        updatedAt: Date.now(),
        derivativesVersion: Date.now(),
        mediaGeneration: generation,
        ...overrides
    };
}

function cleanupJob({
    ownerKey = crypto.randomUUID(),
    photoId = 9_000_001,
    generation = generations[0],
    path: logicalPath = `/uploads/photos/${photoId}/${generation}/photo.webp`,
    scope = 'public',
    jobNamespace = namespace,
    reason = 'integration-cleanup'
} = {}) {
    return {
        namespace: jobNamespace,
        ownerKey,
        scope,
        path: logicalPath,
        reason,
        guardType: 'photo-generation',
        photoId,
        generation
    };
}

function createExecutor({
    executorRepository = repository,
    runtimeNamespace = namespace,
    deletePublicObject,
    deletePrivateObject,
    retryBaseMs = 1,
    leaseTtlMs = 60_000
} = {}) {
    return new MediaCleanupExecutor({
        repository: executorRepository,
        namespace: runtimeNamespace,
        deletePublicObject: deletePublicObject || (async (logicalPath) => {
            deletedPublic.push(logicalPath);
        }),
        deletePrivateObject: deletePrivateObject || (async (logicalPath) => {
            deletedPrivate.push(logicalPath);
        }),
        retryBaseMs,
        retryMaxMs: 10,
        leaseTtlMs
    });
}

async function cleanupRows() {
    return (
        await scopedPool.query(
            'SELECT * FROM media_cleanup_jobs ORDER BY id'
        )
    ).rows;
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
    repository = new PostgresPortfolioRepository(scopedPool, {
        mediaNamespace: namespace,
        mediaCleanupGraceMs: 60_000
    });
});

beforeEach(async () => {
    if (!databaseUrl) return;
    await scopedPool.query(
        `TRUNCATE
            media_cleanup_jobs,
            admin_audit_events,
            series_photos,
            series,
            photos,
            photo_creation_intents
         CASCADE`
    );
    deletedPublic = [];
    deletedPrivate = [];
});

after(async () => {
    if (!adminPool) return;
    await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await adminPool.end();
});

integrationTest('concurrent executors claim a job once and duplicate enqueue is idempotent', async () => {
    const job = cleanupJob({ ownerKey: 'duplicate-owner' });
    await Promise.all([
        repository.mediaCleanup.enqueue([job]),
        repository.mediaCleanup.enqueue([job])
    ]);
    assert.equal((await cleanupRows()).length, 1);

    const [firstRun, secondRun] = await Promise.all([
        createExecutor().runBatch({ limit: 1 }),
        createExecutor().runBatch({ limit: 1 })
    ]);

    assert.equal(firstRun.succeeded + secondRun.succeeded, 1);
    assert.equal(deletedPublic.length, 1);
    const [stored] = await cleanupRows();
    assert.equal(stored.status, 'succeeded');
    assert.equal(stored.attempts, 1);
});

integrationTest('a crashed executor lease is reclaimed while attempts remain and an absent object succeeds', async () => {
    await repository.mediaCleanup.enqueue([
        cleanupJob({ ownerKey: 'crash-recovery' })
    ]);
    const abandonedLease = crypto.randomUUID();
    const claimed = await repository.mediaCleanup.claimNext({
        leaseId: abandonedLease,
        leaseTtlMs: 10_000
    });
    assert.equal(claimed.action, 'claimed');
    await scopedPool.query(
        `UPDATE media_cleanup_jobs
         SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
         WHERE id = $1`,
        [claimed.job.id]
    );

    const executor = createExecutor({
        deletePublicObject: async () => {
            // DeleteObject is successful even when the key is already absent.
        }
    });
    const result = await executor.runBatch({ limit: 1 });

    assert.equal(result.succeeded, 1);
    const [stored] = await cleanupRows();
    assert.equal(stored.status, 'succeeded');
    assert.equal(stored.attempts, 2);
});

integrationTest('an expired lease at maxAttempts becomes an observable terminal failure', async () => {
    await repository.mediaCleanup.enqueue([
        cleanupJob({ ownerKey: 'crash-exhausted' })
    ]);
    const claimed = await repository.mediaCleanup.claimNext({
        leaseId: crypto.randomUUID(),
        leaseTtlMs: 10_000
    });
    await scopedPool.query(
        `UPDATE media_cleanup_jobs
         SET attempts = max_attempts,
             lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
         WHERE id = $1`,
        [claimed.job.id]
    );

    const result = await createExecutor().runBatch({ limit: 1 });
    const [stored] = await cleanupRows();

    assert.equal(result.failed, 1);
    assert.equal(deletedPublic.length, 0);
    assert.equal(stored.status, 'failed');
    assert.equal(stored.attempts, stored.max_attempts);
    assert.equal(stored.last_error_code, 'CLEANUP_LEASE_EXPIRED');
});

integrationTest('transient failures retry with backoff while permanent failures remain observable', async () => {
    let transientAttempts = 0;
    await repository.mediaCleanup.enqueue([
        cleanupJob({ ownerKey: 'transient' })
    ]);
    const transientExecutor = createExecutor({
        deletePublicObject: async () => {
            transientAttempts += 1;
            if (transientAttempts === 1) {
                const error = new Error('R2 temporaneamente non disponibile');
                error.statusCode = 503;
                error.code = 'ServiceUnavailable';
                throw error;
            }
        }
    });
    const first = await transientExecutor.runBatch({ limit: 1 });
    assert.equal(first.retried, 1);
    await scopedPool.query(
        `UPDATE media_cleanup_jobs
         SET available_at = CURRENT_TIMESTAMP
         WHERE status = 'pending'`
    );
    const second = await transientExecutor.runBatch({ limit: 1 });
    assert.equal(second.succeeded, 1);

    await repository.mediaCleanup.enqueue([
        cleanupJob({ ownerKey: 'permanent', generation: generations[1] })
    ]);
    const permanentExecutor = createExecutor({
        deletePublicObject: async () => {
            const error = new Error('Credenziali R2 prive del permesso DeleteObject');
            error.statusCode = 403;
            error.code = 'AccessDenied';
            throw error;
        }
    });
    const permanent = await permanentExecutor.runBatch({ limit: 1 });
    const status = await repository.mediaCleanup.getStatus();

    assert.equal(permanent.failed, 1);
    assert.equal(status.counts.failed, 1);
    assert.equal(status.failed[0].lastErrorCode, 'AccessDenied');
    assert.match(status.failed[0].lastErrorMessage, /permesso DeleteObject/);
});

integrationTest('the executor refuses jobs from another production or preview namespace', async () => {
    await repository.mediaCleanup.enqueue([
        cleanupJob({
            ownerKey: 'namespace-fence',
            jobNamespace: namespace
        })
    ]);
    const result = await createExecutor({
        runtimeNamespace: 'production'
    }).runBatch({ limit: 1 });
    const [stored] = await cleanupRows();

    assert.equal(result.failed, 1);
    assert.equal(deletedPublic.length, 0);
    assert.equal(stored.status, 'failed');
    assert.equal(stored.last_error_code, 'CLEANUP_NAMESPACE_MISMATCH');
});

integrationTest('a production repository cannot claim preview jobs from a shared database', async () => {
    await repository.mediaCleanup.enqueue([
        cleanupJob({ ownerKey: 'shared-database-namespace' })
    ]);
    const productionRepository = new PostgresPortfolioRepository(scopedPool, {
        mediaNamespace: 'production'
    });
    const productionRun = await createExecutor({
        executorRepository: productionRepository,
        runtimeNamespace: 'production'
    }).runBatch({ limit: 1 });

    assert.equal(productionRun.claimed, 0);
    assert.equal((await cleanupRows())[0].status, 'pending');
    assert.deepEqual(
        await productionRepository.mediaCleanup.getStatus(),
        {
            counts: {
                pending: 0,
                processing: 0,
                succeeded: 0,
                failed: 0,
                cancelled: 0
            },
            failed: []
        }
    );

    const previewRun = await createExecutor().runBatch({ limit: 1 });
    assert.equal(previewRun.succeeded, 1);
});

integrationTest('the active photo generation is cancelled rather than deleted', async () => {
    const photoId = 9_000_002;
    await repository.photos.create(photoRecord(photoId));
    await repository.mediaCleanup.enqueue([
        cleanupJob({
            ownerKey: 'active-generation',
            photoId,
            generation: generations[0]
        })
    ]);

    const result = await createExecutor().runBatch({ limit: 1 });
    const [stored] = await cleanupRows();

    assert.equal(result.cancelled, 1);
    assert.equal(deletedPublic.length, 0);
    assert.equal(stored.status, 'cancelled');
    assert.equal(stored.last_error_code, 'ACTIVE_GENERATION_PROTECTED');
});

integrationTest('an active winner remains protected even after an exhausted worker lease', async () => {
    const photoId = 9_000_009;
    await repository.photos.create(photoRecord(photoId));
    await repository.mediaCleanup.enqueue([
        cleanupJob({
            ownerKey: 'active-generation-exhausted',
            photoId,
            generation: generations[0]
        })
    ]);
    await scopedPool.query(
        `UPDATE media_cleanup_jobs
         SET status = 'processing',
             attempts = max_attempts,
             lease_id = $1::uuid,
             lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
         WHERE photo_id = $2`,
        [crypto.randomUUID(), photoId]
    );

    const result = await createExecutor().runBatch({ limit: 1 });
    const [stored] = await cleanupRows();

    assert.equal(result.cancelled, 1);
    assert.equal(result.failed, 0);
    assert.equal(deletedPublic.length, 0);
    assert.equal(stored.status, 'cancelled');
    assert.equal(stored.last_error_code, 'ACTIVE_GENERATION_PROTECTED');
});

integrationTest('photo deletion and its six cleanup jobs commit or roll back together', async () => {
    const photoId = 9_000_003;
    const photo = await repository.photos.create(photoRecord(photoId));
    const deletion = await repository.deletePhotoWithReferences(photoId, {
        expectedVersion: photo.version
    });
    assert.equal(deletion.photo.id, photoId);
    assert.equal(await repository.photos.findById(photoId), null);
    assert.equal((await cleanupRows()).length, 6);

    const cleanup = await createExecutor().runBatch({ limit: 10 });
    assert.equal(cleanup.succeeded, 6);
    assert.equal(deletedPublic.length, 5);
    assert.equal(deletedPrivate.length, 1);

    await scopedPool.query(
        `CREATE FUNCTION reject_cleanup_test_delete()
         RETURNS trigger
         LANGUAGE plpgsql
         AS $$
         BEGIN
             RAISE EXCEPTION 'simulated delete rollback';
         END;
         $$`
    );
    await scopedPool.query(
        `CREATE TRIGGER reject_cleanup_test_delete
         BEFORE DELETE ON photos
         FOR EACH ROW
         EXECUTE FUNCTION reject_cleanup_test_delete()`
    );
    const rollbackId = 9_000_004;
    const rollbackPhoto = await repository.photos.create(
        photoRecord(rollbackId, generations[1])
    );
    try {
        await assert.rejects(
            repository.deletePhotoWithReferences(rollbackId, {
                expectedVersion: rollbackPhoto.version
            }),
            /simulated delete rollback/
        );
        assert.equal((await repository.photos.findById(rollbackId)).id, rollbackId);
        const rolledBackJobs = await scopedPool.query(
            'SELECT count(*)::int AS count FROM media_cleanup_jobs WHERE photo_id = $1',
            [rollbackId]
        );
        assert.equal(rolledBackJobs.rows[0].count, 0);
    } finally {
        await scopedPool.query(
            'DROP TRIGGER reject_cleanup_test_delete ON photos'
        );
        await scopedPool.query('DROP FUNCTION reject_cleanup_test_delete()');
    }
});

integrationTest('abort cleans only the losing media-operation generation', async () => {
    const photoId = 9_000_005;
    const photo = await repository.photos.create(photoRecord(photoId));
    const operationId = crypto.randomUUID();
    await repository.photos.beginMediaMutation(photoId, {
        operationId,
        kind: 'crop',
        generation: generations[1],
        expectedVersion: photo.version,
        ttlMs: 10_000
    });
    await repository.photos.abortMediaMutation(photoId, operationId);
    await scopedPool.query(
        `UPDATE media_cleanup_jobs
         SET available_at = CURRENT_TIMESTAMP
         WHERE media_operation_id = $1::uuid`,
        [operationId]
    );
    const cleanup = await createExecutor().runBatch({ limit: 10 });

    assert.equal(cleanup.succeeded, 5);
    assert.equal(deletedPublic.length, 5);
    assert.equal(
        deletedPublic.every((logicalPath) => logicalPath.includes(`/${generations[1]}/`)),
        true
    );
    assert.equal(
        (await repository.photos.findById(photoId)).mediaGeneration,
        generations[0]
    );
});

integrationTest('an expired media operation is cleaned and can no longer publish its generation', async () => {
    const photoId = 9_000_007;
    const photo = await repository.photos.create(photoRecord(photoId));
    const operationId = crypto.randomUUID();
    await repository.photos.beginMediaMutation(photoId, {
        operationId,
        kind: 'regenerate',
        generation: generations[1],
        expectedVersion: photo.version,
        ttlMs: 10_000
    });
    await scopedPool.query(
        `UPDATE photos
         SET media_operation_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
         WHERE id = $1`,
        [photoId]
    );
    await scopedPool.query(
        `UPDATE media_cleanup_jobs
         SET available_at = CURRENT_TIMESTAMP
         WHERE media_operation_id = $1::uuid`,
        [operationId]
    );

    const cleanup = await createExecutor().runBatch({ limit: 10 });
    assert.equal(cleanup.succeeded, 5);
    await assert.rejects(
        repository.photos.completeMediaMutation(
            photoId,
            operationId,
            {
                mediaGeneration: generations[1],
                updatedAt: Date.now(),
                derivativesVersion: Date.now()
            },
            { expectedVersion: photo.version }
        ),
        (error) => error.code === 'MEDIA_OPERATION_STALE'
    );
    assert.equal(
        (await repository.photos.findById(photoId)).mediaGeneration,
        generations[0]
    );
});

integrationTest('a media operation cannot complete without publishing its reserved generation', async () => {
    const photoId = 9_000_008;
    const photo = await repository.photos.create(photoRecord(photoId));
    const operationId = crypto.randomUUID();
    await repository.photos.beginMediaMutation(photoId, {
        operationId,
        kind: 'regenerate',
        generation: generations[1],
        expectedVersion: photo.version,
        ttlMs: 10_000
    });

    await assert.rejects(
        repository.photos.completeMediaMutation(
            photoId,
            operationId,
            {
                updatedAt: Date.now(),
                derivativesVersion: Date.now()
            },
            { expectedVersion: photo.version }
        ),
        (error) => error.code === 'MEDIA_GENERATION_MISMATCH'
    );
    const stored = await repository.photos.getMediaMutation(photoId);
    assert.equal(stored.operation.id, operationId);
    assert.equal(
        (await cleanupRows()).every((row) => row.status === 'pending'),
        true
    );
});

integrationTest('successful source replacement protects the winner and deletes the previous generation', async () => {
    const photoId = 9_000_006;
    const photo = await repository.photos.create(photoRecord(photoId));
    const operationId = crypto.randomUUID();
    await repository.photos.beginMediaMutation(photoId, {
        operationId,
        kind: 'replace-source',
        generation: generations[1],
        expectedVersion: photo.version,
        ttlMs: 10_000
    });
    const nextSourcePath = `/private/source/photos/${photoId}/${generations[1]}/source.jpg`;
    await repository.photos.registerMediaMutationCleanupAssets(
        photoId,
        operationId,
        [{ scope: 'private', path: nextSourcePath }]
    );
    const updated = await repository.photos.completeMediaMutation(
        photoId,
        operationId,
        {
            sourcePath: nextSourcePath,
            sourceContentType: 'image/jpeg',
            mediaGeneration: generations[1],
            updatedAt: Date.now(),
            derivativesVersion: Date.now()
        },
        { expectedVersion: photo.version }
    );
    const rowsBeforeRun = await cleanupRows();
    assert.equal(
        rowsBeforeRun.filter((row) => row.status === 'cancelled').length,
        6
    );
    assert.equal(
        rowsBeforeRun.filter((row) => row.status === 'pending').length,
        6
    );

    const cleanup = await createExecutor().runBatch({ limit: 20 });
    assert.equal(cleanup.succeeded, 6);
    assert.equal(updated.mediaGeneration, generations[1]);
    assert.equal(
        [...deletedPublic, ...deletedPrivate]
            .every((logicalPath) => logicalPath.includes(`/${generations[0]}/`)),
        true
    );
});

integrationTest('failed photo creation cleans its lease generation but keeps valid staging', async () => {
    const intentId = crypto.randomUUID();
    const leaseId = crypto.randomUUID();
    const sourcePath = `/private/source/photo-creation-intents/${intentId}/source.jpg`;
    const intent = await repository.photoCreations.createOrGet({
        id: intentId,
        sourcePath,
        sourceContentType: 'image/jpeg',
        ttlMs: 60_000
    });
    await repository.photoCreations.claim(intentId, {
        leaseId,
        photoId: intent.photoId,
        generation: generations[2],
        sourcePath,
        payloadHash: 'a'.repeat(64),
        leaseTtlMs: 10_000
    });
    await repository.photoCreations.release(intentId, leaseId);

    assert.equal(deletedPublic.length, 0);
    await scopedPool.query(
        `UPDATE media_cleanup_jobs
         SET available_at = CURRENT_TIMESTAMP
         WHERE media_operation_id = $1::uuid`,
        [leaseId]
    );
    const cleanup = await createExecutor().runBatch({ limit: 10 });
    assert.equal(cleanup.succeeded, 6);
    assert.equal(deletedPublic.length, 5);
    assert.equal(deletedPrivate.length, 1);
    assert.equal(deletedPrivate.includes(sourcePath), false);

    const staging = (
        await scopedPool.query(
            `SELECT *
             FROM media_cleanup_jobs
             WHERE guard_type = 'creation-staging'`
        )
    ).rows[0];
    assert.equal(staging.status, 'pending');
    assert.equal(new Date(staging.available_at).getTime() > Date.now(), true);
});

integrationTest('an expired photo-creation lease generation is reclaimed without deleting staging', async () => {
    const intentId = crypto.randomUUID();
    const leaseId = crypto.randomUUID();
    const sourcePath = `/private/source/photo-creation-intents/${intentId}/source.jpg`;
    const intent = await repository.photoCreations.createOrGet({
        id: intentId,
        sourcePath,
        sourceContentType: 'image/jpeg',
        ttlMs: 60_000
    });
    await repository.photoCreations.claim(intentId, {
        leaseId,
        photoId: intent.photoId,
        generation: generations[2],
        sourcePath,
        payloadHash: 'b'.repeat(64),
        leaseTtlMs: 10_000
    });
    await scopedPool.query(
        `UPDATE photo_creation_intents
         SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
         WHERE id = $1::uuid`,
        [intentId]
    );
    await scopedPool.query(
        `UPDATE media_cleanup_jobs
         SET available_at = CURRENT_TIMESTAMP
         WHERE media_operation_id = $1::uuid`,
        [leaseId]
    );

    const cleanup = await createExecutor().runBatch({ limit: 10 });
    assert.equal(cleanup.succeeded, 6);
    assert.equal(deletedPrivate.includes(sourcePath), false);
    assert.equal(
        (
            await scopedPool.query(
                `SELECT status
                 FROM media_cleanup_jobs
                 WHERE guard_type = 'creation-staging'`
            )
        ).rows[0].status,
        'pending'
    );
});
