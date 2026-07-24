const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
    after,
    before,
    beforeEach,
    test
} = require('node:test');
const {
    PostgresPortfolioRepository,
    extractContentPhotoIds
} = require('./PostgresPortfolioRepository');

const databaseUrl = String(process.env.TEST_DATABASE_URL || '').trim();
const integrationTest = databaseUrl ? test : test.skip;
const schemaName = `portfolio_repository_${process.pid}_${Date.now()}`;

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
    adminPool = new Pool({ connectionString: databaseUrl, max: 8 });
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    scopedPool = new SchemaScopedPool(adminPool, schemaName);
    const migration = await fs.readFile(
        path.resolve(__dirname, '../../db/migrations/001_portfolio_metadata.sql'),
        'utf8'
    );
    await scopedPool.query(migration);
    repository = new PostgresPortfolioRepository(scopedPool);
});

beforeEach(async () => {
    if (!databaseUrl) return;
    await scopedPool.query('TRUNCATE series_photos, series, photos CASCADE');
});

after(async () => {
    if (!adminPool) return;
    await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await adminPool.end();
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
