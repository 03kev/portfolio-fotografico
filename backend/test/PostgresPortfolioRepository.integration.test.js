const assert = require('node:assert/strict');
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
    PostgresPortfolioRepository,
    extractContentPhotoIds,
    translatePostgresError
} = require('../src/repositories/PostgresPortfolioRepository');
const {
    normalizePostgresConnectionString
} = require('../src/utils/postgresConnectionString');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = String(process.env.TEST_DATABASE_URL || '').trim();
const integrationTest = databaseUrl ? test : test.skip;
const schemaName = `portfolio_repository_${process.pid}_${Date.now()}`;
const MEDIA_GENERATIONS = Object.freeze({
    a: '01JGFJJZ00XR5RF7YH2J5PVWBX',
    b: '01JGFJJZ00XR5RF7YH2J5PVWBY',
    c: '01JGFJJZ00XR5RF7YH2J5PVWBZ',
    d: '01JGFJJZ00XR5RF7YH2J5PVWC0',
    e: '01JGFJJZ00XR5RF7YH2J5PVWC1',
    f: '01JGFJJZ00XR5RF7YH2J5PVWC2',
    g: '01JGFJJZ00XR5RF7YH2J5PVWC3',
    h: '01JGFJJZ00XR5RF7YH2J5PVWC4',
    i: '01JGFJJZ00XR5RF7YH2J5PVWC5'
});

let adminPool;
let scopedPool;
let repository;

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
        sourcePath: `sources/photo_${id}.jpg`,
        sourceContentType: 'image/jpeg',
        mobileImage: true,
        updatedAt: id,
        derivativesVersion: id,
        ...overrides
    };
}

function buildSeries(id, photoIds = [], overrides = {}) {
    const createdAt = new Date(Number(id)).toISOString();
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
            layout: { x: 0, y: index * 23, w: 16, h: 22, unit: 'grid' },
            showTitle: true,
            showLightbox: true
        })),
        published: true,
        createdAt,
        updatedAt: createdAt,
        ...overrides
    };
}

before(async () => {
    if (!databaseUrl) return;
    let Pool;
    try {
        ({ Pool } = require('pg'));
    } catch {
        throw new Error('TEST_DATABASE_URL è impostata ma la dipendenza "pg" non è installata.');
    }
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
            media_cleanup_jobs,
            admin_audit_events,
            series_photos,
            series,
            photos,
            photo_creation_intents
         CASCADE`
    );
});

after(async () => {
    if (!adminPool) return;
    await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await adminPool.end();
});

integrationTest('every domain check constraint has an actionable error message', async () => {
    const result = await scopedPool.query(
        `SELECT model_constraint.conname AS constraint_name
         FROM pg_constraint AS model_constraint
         JOIN pg_class AS relation
           ON relation.oid = model_constraint.conrelid
         JOIN pg_namespace AS namespace
           ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = $1
           AND model_constraint.contype = 'c'
           AND relation.relname = ANY($2::text[])
         ORDER BY model_constraint.conname`,
        [schemaName, ['photos', 'series', 'series_photos', 'photo_creation_intents']]
    );
    const fallbackMessage = 'Uno dei dati inviati non rispetta i vincoli richiesti.';
    const missingMessages = result.rows
        .map((row) => row.constraint_name)
        .filter((constraint) => {
            const translated = translatePostgresError({
                code: '23514',
                constraint
            });
            return (
                translated.message === fallbackMessage
                || !translated.details?.field
            );
        });

    assert.deepEqual(
        missingMessages,
        [],
        `Aggiungi un messaggio in translatePostgresError per: ${missingMessages.join(', ')}`
    );
});

integrationTest('atomic patches preserve concurrent disjoint updates to one photo', async () => {
    await repository.photos.create(buildPhoto(101, {
        title: 'Original',
        description: 'Original description'
    }));

    await Promise.all([
        repository.photos.updateById(101, { title: 'New title' }),
        repository.photos.updateById(101, { description: 'New description' })
    ]);

    const stored = await repository.photos.findById(101);
    assert.equal(stored.title, 'New title');
    assert.equal(stored.description, 'New description');
    assert.equal(stored.version, 3);
});

integrationTest('only one distributed media mutation can reserve the same photo', async () => {
    await repository.photos.create(buildPhoto(111));
    const attempts = await Promise.allSettled([
        repository.photos.beginMediaMutation(111, {
            operationId: '11111111-1111-4111-8111-111111111111',
            kind: 'crop',
            generation: MEDIA_GENERATIONS.a,
            expectedVersion: 1,
            ttlMs: 60_000
        }),
        repository.photos.beginMediaMutation(111, {
            operationId: '22222222-2222-4222-8222-222222222222',
            kind: 'replace-source',
            generation: MEDIA_GENERATIONS.b,
            expectedVersion: 1,
            ttlMs: 60_000
        })
    ]);

    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    const rejected = attempts.find((attempt) => attempt.status === 'rejected');
    assert.equal(rejected.reason.code, 'PHOTO_MUTATION_IN_PROGRESS');
});

integrationTest('metadata update and delete cannot cross an active media mutation', async () => {
    await repository.photos.create(buildPhoto(112));
    await repository.photos.beginMediaMutation(112, {
        operationId: '33333333-3333-4333-8333-333333333333',
        kind: 'regenerate',
        generation: MEDIA_GENERATIONS.c,
        expectedVersion: 1,
        ttlMs: 60_000
    });

    await assert.rejects(
        () => repository.photos.updateById(
            112,
            { title: 'Must not win' },
            { expectedVersion: 1 }
        ),
        { code: 'PHOTO_MUTATION_IN_PROGRESS' }
    );
    await assert.rejects(
        () => repository.deletePhotoWithReferences(112, { expectedVersion: 1 }),
        { code: 'PHOTO_MUTATION_IN_PROGRESS' }
    );
});

integrationTest('media finalization atomically switches generation and increments version', async () => {
    await repository.photos.create(buildPhoto(113));
    const operationId = '44444444-4444-4444-8444-444444444444';
    await repository.photos.beginMediaMutation(113, {
        operationId,
        kind: 'crop',
        generation: MEDIA_GENERATIONS.d,
        expectedVersion: 1,
        ttlMs: 60_000
    });

    const updated = await repository.photos.completeMediaMutation(
        113,
        operationId,
        {
            settings: { cropProfiles: { r43: { x: 0.4, y: 0.5, scale: 1 } } },
            mediaGeneration: MEDIA_GENERATIONS.d,
            derivativesVersion: 999
        },
        { expectedVersion: 1 }
    );

    assert.equal(updated.version, 2);
    assert.equal(updated.mediaGeneration, MEDIA_GENERATIONS.d);
    assert.equal(updated.derivativesVersion, 999);
    assert.equal((await repository.photos.getMediaMutation(113)).operation, null);
});

integrationTest('stale media operation cannot finalize after it was replaced', async () => {
    await repository.photos.create(buildPhoto(114));
    const staleId = '55555555-5555-4555-8555-555555555555';
    await repository.photos.beginMediaMutation(114, {
        operationId: staleId,
        kind: 'crop',
        generation: MEDIA_GENERATIONS.e,
        expectedVersion: 1,
        ttlMs: 60_000
    });
    await repository.photos.abortMediaMutation(114, staleId);
    await repository.photos.beginMediaMutation(114, {
        operationId: '66666666-6666-4666-8666-666666666666',
        kind: 'crop',
        generation: MEDIA_GENERATIONS.f,
        expectedVersion: 1,
        ttlMs: 60_000
    });

    await assert.rejects(
        () => repository.photos.completeMediaMutation(
            114,
            staleId,
            { mediaGeneration: MEDIA_GENERATIONS.e },
            { expectedVersion: 1 }
        ),
        { code: 'MEDIA_OPERATION_STALE' }
    );
});

integrationTest('an expired media reservation can be reclaimed without changing entity version', async () => {
    await repository.photos.create(buildPhoto(115));
    await repository.photos.beginMediaMutation(115, {
        operationId: '77777777-7777-4777-8777-777777777777',
        kind: 'crop',
        generation: MEDIA_GENERATIONS.g,
        expectedVersion: 1,
        ttlMs: 10_000
    });
    await scopedPool.query(
        `UPDATE photos
         SET media_operation_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
         WHERE id = 115`
    );

    const replacement = await repository.photos.beginMediaMutation(115, {
        operationId: '88888888-8888-4888-8888-888888888888',
        kind: 'replace-source',
        generation: MEDIA_GENERATIONS.h,
        expectedVersion: 1,
        ttlMs: 60_000
    });
    assert.equal(replacement.photo.version, 1);
    assert.equal(replacement.operation.generation, MEDIA_GENERATIONS.h);
});

integrationTest('a normal update invalidates an expired media operation', async () => {
    await repository.photos.create(buildPhoto(116));
    const expiredOperationId = '99999999-9999-4999-8999-999999999999';
    await repository.photos.beginMediaMutation(116, {
        operationId: expiredOperationId,
        kind: 'crop',
        generation: MEDIA_GENERATIONS.i,
        expectedVersion: 1,
        ttlMs: 10_000
    });
    await scopedPool.query(
        `UPDATE photos
         SET media_operation_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
         WHERE id = 116`
    );

    const updated = await repository.photos.updateById(
        116,
        { title: 'Updated after expiry' },
        { expectedVersion: 1 }
    );
    assert.equal(updated.version, 2);
    await assert.rejects(
        () => repository.photos.completeMediaMutation(
            116,
            expiredOperationId,
            { mediaGeneration: MEDIA_GENERATIONS.i },
            { expectedVersion: 2 }
        ),
        { code: 'MEDIA_OPERATION_STALE' }
    );
});

integrationTest('independent records do not contend through a shared document', async () => {
    await repository.photos.create(buildPhoto(101));
    await repository.photos.create(buildPhoto(202));

    await Promise.all([
        repository.photos.updateById(101, { title: 'First updated' }),
        repository.photos.updateById(202, { description: 'Second updated' })
    ]);

    assert.equal((await repository.photos.findById(101)).title, 'First updated');
    assert.equal((await repository.photos.findById(202)).description, 'Second updated');
});

integrationTest('same expected version permits one writer and returns 409 for the stale writer', async () => {
    await repository.photos.create(buildPhoto(101));

    const results = await Promise.allSettled([
        repository.photos.updateById(101, { title: 'Writer A' }, { expectedVersion: 1 }),
        repository.photos.updateById(101, { title: 'Writer B' }, { expectedVersion: 1 })
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.status, 409);
    assert.equal(rejected[0].reason.code, 'VERSION_CONFLICT');
});

integrationTest('hard delete is monotone and a stale update cannot resurrect the photo', async () => {
    await repository.photos.create(buildPhoto(101));
    await repository.deletePhotoWithReferences(101, { expectedVersion: 1 });

    const updated = await repository.photos.updateById(101, {
        title: 'Stale resurrection'
    }, {
        expectedVersion: 1
    });

    assert.equal(updated, null);
    assert.equal(await repository.photos.findById(101), null);
});

integrationTest('photo delete removes membership, cover and both content reference shapes atomically', async () => {
    await repository.photos.create(buildPhoto(101));
    await repository.photos.create(buildPhoto(202));
    await repository.series.create(buildSeries(1001, [101, 202], {
        coverImage: 101,
        content: [
            {
                id: 'single',
                type: 'photo',
                content: 101,
                layout: { x: 0, y: 0, w: 10, h: 10, unit: 'grid' },
                showTitle: true,
                showLightbox: true
            },
            {
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
                layout: { x: 0, y: 12, w: 10, h: 5, unit: 'grid' }
            }
        ]
    }));

    const deletion = await repository.deletePhotoWithReferences(101);
    const storedSeries = await repository.series.findByIdentifier('1001');

    assert.equal(deletion.referenceCleanup.modifiedCount, 1);
    assert.deepEqual(storedSeries.photos, [202]);
    assert.equal(storedSeries.coverImage, 202);
    assert.equal(extractContentPhotoIds(storedSeries.content).includes(101), false);
    assert.equal(extractContentPhotoIds(storedSeries.content).includes(202), true);
});

integrationTest('foreign keys reject a series membership to a missing photo', async () => {
    await assert.rejects(
        () => repository.series.create(buildSeries(1001, [999])),
        (error) => error.status === 409 && error.code === 'REFERENCE_INTEGRITY_CONFLICT'
    );
});

integrationTest('an error after reference cleanup rolls the whole photo deletion back', async () => {
    await repository.photos.create(buildPhoto(101));
    await repository.series.create(buildSeries(1001, [101]));
    await scopedPool.query(
        `CREATE FUNCTION fail_photo_delete() RETURNS trigger AS $$
         BEGIN
             RAISE EXCEPTION 'forced delete failure';
         END;
         $$ LANGUAGE plpgsql`
    );
    await scopedPool.query(
        `CREATE TRIGGER fail_photo_delete_trigger
         BEFORE DELETE ON photos
         FOR EACH ROW EXECUTE FUNCTION fail_photo_delete()`
    );

    try {
        await assert.rejects(
            () => repository.deletePhotoWithReferences(101),
            /forced delete failure/
        );
        assert.notEqual(await repository.photos.findById(101), null);
        const storedSeries = await repository.series.findByIdentifier('1001');
        assert.deepEqual(storedSeries.photos, [101]);
        assert.equal(storedSeries.coverImage, 101);
    } finally {
        await scopedPool.query('DROP TRIGGER fail_photo_delete_trigger ON photos');
        await scopedPool.query('DROP FUNCTION fail_photo_delete()');
    }
});

integrationTest('whole-series writes detect a stale expected version', async () => {
    await repository.photos.create(buildPhoto(101));
    await repository.series.create(buildSeries(1001, [101]));

    const results = await Promise.allSettled([
        repository.series.updateById(
            1001,
            { description: 'Writer A' },
            { expectedVersion: 1 }
        ),
        repository.series.updateById(
            1001,
            { description: 'Writer B' },
            { expectedVersion: 1 }
        )
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.code, 'VERSION_CONFLICT');
});

integrationTest('database contains no dangling membership after transactional operations', async () => {
    await repository.photos.create(buildPhoto(101));
    await repository.series.create(buildSeries(1001, [101]));
    await repository.deletePhotoWithReferences(101);

    const result = await scopedPool.query(
        `SELECT count(*)::int AS count
         FROM series_photos sp
         LEFT JOIN photos p ON p.id = sp.photo_id
         WHERE p.id IS NULL`
    );
    assert.equal(result.rows[0].count, 0);
});

integrationTest('audit records photo version transitions and changed fields', async () => {
    await repository.photos.create(buildPhoto(301, {
        title: 'Before title',
        description: 'Before description'
    }));
    await repository.photos.updateById(
        301,
        {
            title: 'After title',
            tags: ['audit', 'updated']
        },
        {
            expectedVersion: 1,
            auditOperation: 'photo.metadata-update'
        }
    );

    const events = await repository.audit.list({
        entityType: 'photo',
        entityId: 301
    });

    assert.equal(events.length, 2);
    assert.equal(events[0].operation, 'photo.metadata-update');
    assert.equal(events[0].fromVersion, 1);
    assert.equal(events[0].toVersion, 2);
    assert.equal(events[0].beforeState.title, 'Before title');
    assert.equal(events[0].afterState.title, 'After title');
    assert.deepEqual(events[0].changes.title, {
        before: 'Before title',
        after: 'After title'
    });
    assert.deepEqual(events[0].changes.tags, {
        before: ['test'],
        after: ['audit', 'updated']
    });
    assert.equal(events[0].changes.description, undefined);

    assert.equal(events[1].operation, 'photo.create');
    assert.equal(events[1].fromVersion, null);
    assert.equal(events[1].toVersion, 1);
    assert.equal(events[1].beforeState, null);
});

integrationTest('stale writes roll back without producing an audit event', async () => {
    await repository.photos.create(buildPhoto(302));
    await repository.photos.updateById(
        302,
        { title: 'Winning write' },
        { expectedVersion: 1 }
    );

    await assert.rejects(
        () => repository.photos.updateById(
            302,
            { title: 'Stale write' },
            { expectedVersion: 1 }
        ),
        { code: 'VERSION_CONFLICT' }
    );

    const events = await repository.audit.list({
        entityType: 'photo',
        entityId: 302
    });
    assert.equal(events.length, 2);
    assert.deepEqual(
        events.map((event) => event.operation),
        ['photo.update', 'photo.create']
    );
    assert.equal(events[0].afterState.title, 'Winning write');
});

integrationTest('photo deletion audits every automatic series cleanup in the same transaction', async () => {
    await repository.photos.create(buildPhoto(303));
    await repository.photos.create(buildPhoto(304));
    await repository.series.create(buildSeries(3001, [303, 304]));

    await repository.deletePhotoWithReferences(303, {
        expectedVersion: 1,
        operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    });

    const cleanupEvents = await repository.audit.list({
        entityType: 'series',
        entityId: 3001,
        operation: 'series.photo-delete-cleanup'
    });
    assert.equal(cleanupEvents.length, 1);
    assert.equal(cleanupEvents[0].fromVersion, 1);
    assert.equal(cleanupEvents[0].toVersion, 2);
    assert.deepEqual(cleanupEvents[0].beforeState.photos, [303, 304]);
    assert.deepEqual(cleanupEvents[0].afterState.photos, [304]);
    assert.equal(cleanupEvents[0].metadata.triggerPhotoId, '303');
    assert.equal(
        cleanupEvents[0].operationId,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );

    const photoEvents = await repository.audit.list({
        entityType: 'photo',
        entityId: 303
    });
    assert.equal(photoEvents[0].operation, 'photo.delete');
    assert.equal(photoEvents[0].fromVersion, 1);
    assert.equal(photoEvents[0].toVersion, null);
    assert.equal(photoEvents[0].afterState, null);
});

integrationTest('failed aggregate deletion rolls back its audit events too', async () => {
    await repository.photos.create(buildPhoto(305));
    await repository.series.create(buildSeries(3002, [305]));
    await scopedPool.query(
        `CREATE FUNCTION fail_audited_photo_delete() RETURNS trigger AS $$
         BEGIN
             RAISE EXCEPTION 'forced audited delete failure';
         END;
         $$ LANGUAGE plpgsql`
    );
    await scopedPool.query(
        `CREATE TRIGGER fail_audited_photo_delete_trigger
         BEFORE DELETE ON photos
         FOR EACH ROW EXECUTE FUNCTION fail_audited_photo_delete()`
    );

    try {
        await assert.rejects(
            () => repository.deletePhotoWithReferences(305, { expectedVersion: 1 }),
            /forced audited delete failure/
        );
        const cleanupEvents = await repository.audit.list({
            entityType: 'series',
            entityId: 3002,
            operation: 'series.photo-delete-cleanup'
        });
        assert.equal(cleanupEvents.length, 0);
        assert.deepEqual(
            (await repository.series.findByIdentifier('3002')).photos,
            [305]
        );
    } finally {
        await scopedPool.query(
            'DROP TRIGGER fail_audited_photo_delete_trigger ON photos'
        );
        await scopedPool.query('DROP FUNCTION fail_audited_photo_delete()');
    }
});

integrationTest('audit rows are append-only at database level', async () => {
    await repository.photos.create(buildPhoto(306));
    const [event] = await repository.audit.list({
        entityType: 'photo',
        entityId: 306
    });

    await assert.rejects(
        () => scopedPool.query(
            'UPDATE admin_audit_events SET operation = $1 WHERE id = $2',
            ['photo.tampered', event.id]
        ),
        /append-only/
    );
    await assert.rejects(
        () => scopedPool.query(
            'DELETE FROM admin_audit_events WHERE id = $1',
            [event.id]
        ),
        /append-only/
    );
    assert.notEqual(await repository.audit.findById(event.id), null);
});
