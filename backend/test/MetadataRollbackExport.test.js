const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const { after, before, test } = require('node:test');
const { Pool } = require('pg');
const { JsonPortfolioRepository } = require('../src/repositories/JsonPortfolioRepository');
const { PostgresPortfolioRepository } = require('../src/repositories/PostgresPortfolioRepository');
const { presentPhoto } = require('../src/routes/photos.helpers');
const {
    buildContents,
    exportToDirectory,
    parseArguments,
    writeIdempotentFiles
} = require('../scripts/export-metadata-postgres');
const {
    importMetadataSnapshot,
    verifyImportedSnapshot
} = require('../src/services/metadataMigration');
const {
    MetadataRollbackExportError,
    assertExpectedDatabaseIdentity,
    assertOperationalStateSafe,
    buildCanonicalSnapshot,
    exportMetadataRollbackSnapshot
} = require('../src/services/metadataRollbackExport');
const { toStoragePhoto } = require('../src/services/photoRecord');
const {
    normalizePostgresConnectionString
} = require('../src/utils/postgresConnectionString');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = String(process.env.TEST_DATABASE_URL || '').trim();
const integrationTest = databaseUrl ? test : test.skip;
const schemaName = `metadata_rollback_export_${process.pid}_${Date.now()}`;
const reimportSchemaName = `${schemaName}_reimport`;
const DERIVATIVE_GENERATION = '01JGFJJZ00XR5RF7YH2J5PVWBX';
const SOURCE_GENERATION = '01JGFJJZ00XR5RF7YH2J5PVWBY';

class SchemaScopedPool {
    constructor(pool, schema) {
        this.pool = pool;
        this.schema = schema;
    }

    async connect() {
        const client = await this.pool.connect();
        await client.query(`SET search_path TO "${this.schema}"`);
        return client;
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

function canonicalPhoto(id = 101) {
    return {
        id,
        title: 'Foto rollback',
        description: 'Descrizione',
        date: '2026-08-11',
        location: 'Roma',
        lat: 0,
        lng: 0,
        camera: 'Camera',
        lens: '',
        resolution: '4000x3000',
        settings: { aperture: 'f/8', exif: { preserved: true } },
        tags: ['rollback'],
        createdAt: '2026-08-11T10:00:00.000Z',
        updatedAt: 1770000000000,
        version: 5,
        derivativesVersion: 1770000000001,
        mediaGeneration: DERIVATIVE_GENERATION,
        assets: [{
            role: 'full',
            replacementGroup: 'derivatives',
            scope: 'public',
            path: `/uploads/photos/${id}/${DERIVATIVE_GENERATION}/full.webp`,
            contentType: 'image/webp',
            generation: DERIVATIVE_GENERATION
        }, {
            role: 'source',
            replacementGroup: 'source',
            scope: 'private',
            path: `/private/source/photos/${id}/${SOURCE_GENERATION}/source.jpg`,
            contentType: 'image/jpeg',
            generation: SOURCE_GENERATION
        }]
    };
}

function canonicalSeries(photoId = 101) {
    return {
        id: '201',
        title: 'Serie rollback',
        slug: 'serie-rollback',
        description: 'Descrizione serie',
        coverImage: photoId,
        photos: [photoId],
        content: [{
            id: 'photo-101',
            type: 'photo',
            content: photoId,
            layout: { x: 0, y: 0, w: 16, h: 22, unit: 'grid' },
            showTitle: true,
            showLightbox: true
        }],
        published: true,
        createdAt: '2026-08-11T11:00:00.000Z',
        updatedAt: '2026-08-12T11:00:00.000Z',
        version: 7
    };
}

function memoryStorage(snapshot) {
    return {
        async readMetadataFile(filename, fallback) {
            if (filename === 'photos.json') return structuredClone(snapshot.photos);
            if (filename === 'series.json') return structuredClone(snapshot.series);
            return fallback;
        },
        async writeMetadataFile() {
            throw new Error('Il test read-only non deve scrivere lo snapshot.');
        }
    };
}

async function migrateSchema(pool, schema) {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const client = await pool.connect();
    try {
        await client.query(`SET search_path TO "${schema}"`);
        const directory = path.resolve(__dirname, '../db/migrations');
        const migrations = (await fs.readdir(directory))
            .filter((filename) => /^\d+.*\.sql$/.test(filename))
            .sort();
        for (const filename of migrations) {
            await client.query(await fs.readFile(path.join(directory, filename), 'utf8'));
        }
    } finally {
        client.release();
    }
}

function canonicalRepositoryState(repositoryState) {
    return {
        photos: repositoryState.photos.map(toStoragePhoto),
        series: repositoryState.series
    };
}

test('rejects export unless metadata writes are explicitly disabled', async () => {
    const pool = {
        async connect() {
            assert.fail('La connessione non deve essere aperta con write abilitate.');
        }
    };
    await assert.rejects(
        exportMetadataRollbackSnapshot(pool, { metadataWritesEnabled: true }),
        (error) => (
            error instanceof MetadataRollbackExportError
            && error.code === 'METADATA_WRITES_MUST_BE_DISABLED'
        )
    );
});

test('quiescence check rejects unfinished intent, media, cleanup and asset states', () => {
    assert.throws(
        () => assertOperationalStateSafe({
            creationIntents: { pending: 1 },
            activeMediaOperations: 1,
            cleanupJobs: { failed: 1 },
            assets: {
                targetNamespace: {},
                allNamespaces: [{ state: 'planned', objectNamespace: 'preview/test', count: 1 }]
            }
        }),
        (error) => (
            error.code === 'ROLLBACK_STATE_NOT_QUIESCENT'
            && error.details.unfinishedCreationIntents === 1
            && error.details.activeMediaOperations === 1
            && error.details.unfinishedCleanupJobs === 1
            && error.details.unstableAssets === 1
        )
    );
});

test('database identity gate accepts only the exact Neon branch and database', () => {
    const expected = {
        database: 'portfolio_staging_cutover',
        neonBranchId: 'br-staging'
    };
    assert.doesNotThrow(() => assertExpectedDatabaseIdentity(expected, expected));
    assert.throws(
        () => assertExpectedDatabaseIdentity(
            { ...expected, database: 'portfolio_production' },
            expected
        ),
        (error) => error.code === 'DATABASE_NAME_MISMATCH'
    );
    assert.throws(
        () => assertExpectedDatabaseIdentity(
            { ...expected, neonBranchId: 'br-production' },
            expected
        ),
        (error) => error.code === 'NEON_BRANCH_ID_MISMATCH'
    );
    assert.throws(
        () => assertExpectedDatabaseIdentity(
            { database: expected.database, neonBranchId: null },
            expected
        ),
        (error) => error.code === 'NEON_BRANCH_ID_UNAVAILABLE'
    );
});

test('canonical snapshot preserves versions, nullability, order and independent source generation', () => {
    const photo = canonicalPhoto();
    const series = canonicalSeries();
    const snapshot = buildCanonicalSnapshot([photo], [series]);

    assert.equal(snapshot.photos[0].lat, 0);
    assert.equal(snapshot.photos[0].lng, 0);
    assert.equal(snapshot.photos[0].version, 5);
    assert.equal(snapshot.photos[0].assets[1].generation, SOURCE_GENERATION);
    assert.equal(snapshot.series[0].version, 7);
    assert.deepEqual(snapshot.series[0].photos, [101]);
    assert.deepEqual(snapshot.series[0].content, series.content);
});

test('CLI requires output, namespace and expected database identity', async () => {
    assert.throws(() => parseArguments([]), /--output-dir/);
    assert.throws(
        () => parseArguments(['--output-dir', '.local/export']),
        /--object-namespace/
    );
    assert.throws(
        () => parseArguments([
            '--output-dir', '.local/export',
            '--object-namespace', 'root'
        ]),
        /--expected-database-name/
    );
    assert.throws(
        () => parseArguments([
            '--output-dir', '.local/export',
            '--object-namespace', 'root',
            '--expected-database-name', 'portfolio_staging_cutover'
        ]),
        /--expected-neon-branch-id/
    );
    const output = parseArguments([
        '--object-namespace', 'root',
        '--output-dir', '.local/export',
        '--expected-database-name', 'portfolio_staging_cutover',
        '--expected-neon-branch-id', 'br-staging'
    ]);
    assert.equal(output.objectNamespace, '');
    assert.equal(output.expectedDatabaseName, 'portfolio_staging_cutover');
    assert.equal(output.expectedNeonBranchId, 'br-staging');
});

test('CLI output is deterministic, checksummed and carries honest safety evidence', async () => {

    const result = {
        snapshot: { photos: [canonicalPhoto()], series: [canonicalSeries()] },
        report: {
            provenance: {
                database: 'safe_database',
                neonBranchId: 'safe_branch',
                objectNamespace: ''
            },
            counts: { photos: 1, series: 1, memberships: 1, assets: 2 },
            operationalState: {
                auditEvents: 0,
                activeMediaOperations: 0,
                creationIntents: {},
                cleanupJobs: {}
            },
            safety: {
                databaseIdentity: {
                    expected: {
                        database: 'safe_database',
                        neonBranchId: 'safe_branch'
                    },
                    matched: true,
                    verifiedInsideSnapshotTransaction: true
                },
                localExecutionGate: {
                    metadataWritesEnabled: false,
                    scope: 'offline-export-process-only'
                },
                remoteApplicationFreeze: {
                    verifiedByExporter: false,
                    required: true
                },
                consistencyBoundary: 'transaction snapshot only',
                rollbackActivation: 'initially-read-only'
            },
            excludedPostgresData: [],
            snapshotChecksum: 'snapshot-checksum',
            reportChecksum: 'report-checksum'
        }
    };
    const first = buildContents(result);
    const second = buildContents(structuredClone(result));
    assert.deepEqual(second, first);
    assert.equal(JSON.stringify(first).includes('postgresql://'), false);
    const manifest = JSON.parse(first.manifest);
    assert.equal(manifest.safety.remoteApplicationFreeze.verifiedByExporter, false);
    assert.equal(manifest.safety.rollbackActivation, 'initially-read-only');

    const temporaryDirectory = await fs.mkdtemp(path.join('/tmp', 'metadata-export-test-'));
    const filename = path.join(temporaryDirectory, 'photos.json');
    try {
        await assert.doesNotReject(() => writeIdempotentFiles([[filename, first.photos]]));
        await assert.doesNotReject(() => writeIdempotentFiles([[filename, first.photos]]));
        await assert.rejects(
            writeIdempotentFiles([[filename, `${first.photos} `]]),
            /contenuto diverso/
        );
    } finally {
        await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
});

test('unavailable Neon identity is rejected before creating output', async () => {
    const parent = await fs.mkdtemp(path.join('/tmp', 'metadata-export-no-identity-'));
    const outputDir = path.join(parent, 'must-not-exist');
    const client = {
        async query(sql) {
            if (String(sql).startsWith('SELECT current_database()')) {
                return { rows: [{ database_name: 'expected_database', branch_id: null }] };
            }
            return { rows: [] };
        },
        release() {}
    };
    const pool = { async connect() { return client; } };
    try {
        await assert.rejects(
            exportToDirectory(pool, {
                outputDir,
                objectNamespace: '',
                expectedDatabaseName: 'expected_database',
                expectedNeonBranchId: 'br-expected'
            }, false),
            (error) => error.code === 'NEON_BRANCH_ID_UNAVAILABLE'
        );
        await assert.rejects(fs.stat(outputDir), { code: 'ENOENT' });
    } finally {
        await fs.rm(parent, { recursive: true, force: true });
    }
});

let adminPool;
let sourcePool;
let reimportPool;
let expectedIdentity;

before(async () => {
    if (!databaseUrl) return;
    adminPool = new Pool({
        connectionString: normalizePostgresConnectionString(databaseUrl),
        max: 3
    });
    await migrateSchema(adminPool, schemaName);
    await migrateSchema(adminPool, reimportSchemaName);
    sourcePool = new SchemaScopedPool(adminPool, schemaName);
    reimportPool = new SchemaScopedPool(adminPool, reimportSchemaName);
    const identity = await adminPool.query(
        `SELECT current_database() AS database_name,
                current_setting('neon.branch_id', true) AS branch_id`
    );
    expectedIdentity = {
        expectedDatabaseName: identity.rows[0].database_name,
        expectedNeonBranchId: identity.rows[0].branch_id
    };
});

after(async () => {
    if (!adminPool) return;
    await adminPool.query(`DROP SCHEMA IF EXISTS "${reimportSchemaName}" CASCADE`);
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await adminPool.end();
});

integrationTest('exports one real consistent transaction and round-trips Postgres, JSON and Postgres', async () => {
    const input = { photos: [canonicalPhoto()], series: [canonicalSeries()] };
    await importMetadataSnapshot(sourcePool, input, { objectNamespace: '' });

    const first = await exportMetadataRollbackSnapshot(sourcePool, {
        metadataWritesEnabled: false,
        objectNamespace: '',
        ...expectedIdentity
    });
    const second = await exportMetadataRollbackSnapshot(sourcePool, {
        metadataWritesEnabled: false,
        objectNamespace: '',
        ...expectedIdentity
    });
    assert.deepEqual(second, first);
    assert.deepEqual(first.report.counts, {
        photos: 1,
        series: 1,
        memberships: 1,
        assets: 2
    });

    const jsonRepository = new JsonPortfolioRepository(memoryStorage(first.snapshot));
    const jsonState = {
        photos: await jsonRepository.photos.list(),
        series: await jsonRepository.series.list()
    };
    assert.deepEqual(canonicalRepositoryState(jsonState), first.snapshot);
    assert.equal(jsonState.photos[0].version, input.photos[0].version);
    assert.deepEqual(
        jsonState.photos[0].assets.map(({ photoId, ...asset }) => asset),
        input.photos[0].assets
    );
    assert.ok(jsonState.photos[0].assets.every((asset) => asset.photoId === input.photos[0].id));
    assert.equal(jsonState.series[0].version, input.series[0].version);
    const sourceRepository = new PostgresPortfolioRepository(sourcePool);
    const sourceState = {
        photos: await sourceRepository.photos.list(),
        series: await sourceRepository.series.list()
    };
    assert.deepEqual(
        canonicalRepositoryState(jsonState),
        canonicalRepositoryState(sourceState)
    );
    assert.deepEqual(
        jsonState.photos.map(presentPhoto),
        sourceState.photos.map(presentPhoto)
    );

    await importMetadataSnapshot(reimportPool, first.snapshot, { objectNamespace: '' });
    const verification = await verifyImportedSnapshot(reimportPool, first.snapshot, {
        objectNamespace: ''
    });
    assert.equal(verification.valid, true, JSON.stringify(verification.errors));
    const reimportRepository = new PostgresPortfolioRepository(reimportPool);
    const reimportState = {
        photos: await reimportRepository.photos.list(),
        series: await reimportRepository.series.list()
    };
    assert.deepEqual(
        canonicalRepositoryState(reimportState),
        canonicalRepositoryState(sourceState)
    );
    assert.deepEqual(
        reimportState.photos.map(presentPhoto),
        sourceState.photos.map(presentPhoto)
    );
});

integrationTest('identity mismatch creates no output directory', async () => {
    const parent = await fs.mkdtemp(path.join('/tmp', 'metadata-export-identity-'));
    const wrongDatabaseOutput = path.join(parent, 'wrong-database');
    const wrongBranchOutput = path.join(parent, 'wrong-branch');
    try {
        await assert.rejects(
            exportToDirectory(sourcePool, {
                outputDir: wrongDatabaseOutput,
                objectNamespace: '',
                expectedDatabaseName: `${expectedIdentity.expectedDatabaseName}_wrong`,
                expectedNeonBranchId: expectedIdentity.expectedNeonBranchId
            }, false),
            (error) => error.code === 'DATABASE_NAME_MISMATCH'
        );
        await assert.rejects(fs.stat(wrongDatabaseOutput), { code: 'ENOENT' });

        await assert.rejects(
            exportToDirectory(sourcePool, {
                outputDir: wrongBranchOutput,
                objectNamespace: '',
                expectedDatabaseName: expectedIdentity.expectedDatabaseName,
                expectedNeonBranchId: `${expectedIdentity.expectedNeonBranchId}-wrong`
            }, false),
            (error) => error.code === 'NEON_BRANCH_ID_MISMATCH'
        );
        await assert.rejects(fs.stat(wrongBranchOutput), { code: 'ENOENT' });
    } finally {
        await fs.rm(parent, { recursive: true, force: true });
    }
});

integrationTest('rejects a non-terminal cleanup job instead of exporting an incoherent rollback', async () => {
    const asset = await sourcePool.query(
        `SELECT id, photo_id, generation
         FROM photo_assets
         WHERE state = 'active'
         ORDER BY id
         LIMIT 1`
    );
    const row = asset.rows[0];
    await sourcePool.query(
        `INSERT INTO media_cleanup_jobs (
            dedupe_key, object_namespace, reason, status, asset_id
         ) SELECT $1, object_namespace, 'rollback-test', 'pending', id
           FROM photo_assets
          WHERE id = $2`,
        [`rollback-test:${row.id}`, row.id]
    );
    await assert.rejects(
        exportMetadataRollbackSnapshot(sourcePool, {
            metadataWritesEnabled: false,
            objectNamespace: '',
            ...expectedIdentity
        }),
        (error) => (
            error.code === 'ROLLBACK_STATE_NOT_QUIESCENT'
            && error.details.unfinishedCleanupJobs === 1
        )
    );
    await sourcePool.query(
        `UPDATE media_cleanup_jobs
         SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
         WHERE dedupe_key = $1`,
        [`rollback-test:${row.id}`]
    );
});
