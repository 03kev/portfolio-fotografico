const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const sharp = require('sharp');
const { after, before, beforeEach, test } = require('node:test');
const {
    PostgresPortfolioRepository
} = require('../src/repositories/PostgresPortfolioRepository');
const {
    materializePhotoAssets,
    PHOTO_ASSET_REPLACEMENT_GROUPS
} = require('../src/services/photoDerivatives');
const {
    PhotoSourceReplacementService
} = require('../src/services/photoSourceReplacement');
const {
    PHOTO_UPLOAD_MAX_BYTES
} = require('@portfolio/photo-upload-contract');
const {
    normalizePostgresConnectionString
} = require('../src/utils/postgresConnectionString');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = String(process.env.TEST_DATABASE_URL || '').trim();
const integrationTest = databaseUrl ? test : test.skip;
const schemaName = `photo_source_replacement_${process.pid}_${Date.now()}`;
const namespace = 'preview/phase-3-source-replacement';
const generations = Object.freeze({
    initial: '01JGFJJZ00XR5RF7YH2J5PVWBX',
    valid: '01JGFJJZ00XR5RF7YH2J5PVWBY',
    mismatch: '01JGFJJZ00XR5RF7YH2J5PVWBZ',
    oversized: '01JGFJJZ00XR5RF7YH2J5PVWC0'
});

let adminPool;
let scopedPool;
let repository;
let r2Objects;
let publicWrites;

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

function activePhotoRecord(id) {
    return {
        id,
        title: `Foto ${id}`,
        description: 'Foto usata dal test di orchestrazione replace-source',
        date: '2026-08-04',
        location: 'Roma',
        lat: 41.9028,
        lng: 12.4964,
        camera: 'Test camera',
        lens: 'Test lens',
        resolution: '32x24',
        settings: {},
        tags: ['phase-3'],
        updatedAt: Date.now(),
        derivativesVersion: Date.now(),
        mediaGeneration: generations.initial,
        assets: materializePhotoAssets(id, generations.initial, [
            {
                role: 'source',
                replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.SOURCE,
                scope: 'private',
                fileName: 'source.jpg',
                contentType: 'image/jpeg'
            },
            {
                role: 'full',
                replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES,
                scope: 'public',
                fileName: 'photo.webp',
                contentType: 'image/webp'
            }
        ])
    };
}

async function jpegBuffer() {
    return sharp({
        create: {
            width: 32,
            height: 24,
            channels: 3,
            background: { r: 110, g: 75, b: 35 }
        }
    }).jpeg().toBuffer();
}

function createService(generation) {
    return new PhotoSourceReplacementService({
        repository,
        createGeneration: () => generation,
        createSignedUploadUrl: async (logicalPath, options) => ({
            uploadUrl: `r2-simulated://${logicalPath}`,
            uploadPath: logicalPath,
            expiresInSeconds: options.expiresInSeconds
        }),
        readSourceObject: async (logicalPath) => r2Objects.get(logicalPath) || null,
        writeAssets: async (assets) => {
            publicWrites.push(...assets);
            for (const asset of assets) {
                r2Objects.set(asset.path, {
                    buffer: asset.buffer,
                    contentType: asset.contentType,
                    contentLength: asset.buffer.length
                });
            }
        },
        runCleanup: async () => ({ claimed: 0, succeeded: 0, failed: 0 })
    });
}

async function uploadSimulated(prepared, {
    buffer,
    contentType = prepared.contentType,
    contentLength = buffer.length
}) {
    r2Objects.set(prepared.sourcePath, { buffer, contentType, contentLength });
}

async function assertRejectedSourceIsDurable(prepared) {
    const assetResult = await scopedPool.query(
        `SELECT id, state, logical_path
         FROM photo_assets
         WHERE object_namespace = $1
           AND storage_scope = 'private'
           AND logical_path = $2`,
        [namespace, prepared.sourcePath]
    );
    assert.equal(assetResult.rows.length, 1);
    assert.equal(assetResult.rows[0].logical_path, prepared.sourcePath);
    const cleanupResult = await scopedPool.query(
        `SELECT status
         FROM media_cleanup_jobs
         WHERE asset_id = $1`,
        [assetResult.rows[0].id]
    );
    assert.equal(cleanupResult.rows.length, 1);
    assert.equal(cleanupResult.rows[0].status, 'pending');

    const rejectedDerivatives = await scopedPool.query(
        `SELECT COUNT(*)::integer AS count
         FROM photo_assets
         WHERE object_namespace = $1
           AND generation = $2
           AND replacement_group = $3`,
        [namespace, prepared.mediaGeneration, PHOTO_ASSET_REPLACEMENT_GROUPS.DERIVATIVES]
    );
    assert.equal(rejectedDerivatives.rows[0].count, 0);
}

before(async () => {
    if (!databaseUrl) return;
    const { Pool } = require('pg');
    adminPool = new Pool({
        connectionString: normalizePostgresConnectionString(databaseUrl),
        max: 6
    });
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    scopedPool = new SchemaScopedPool(adminPool, schemaName);
    const migrationsDirectory = path.resolve(__dirname, '../db/migrations');
    const migrationNames = (await fs.readdir(migrationsDirectory))
        .filter((name) => name.endsWith('.sql'))
        .sort();
    for (const migrationName of migrationNames) {
        const migration = await fs.readFile(path.join(migrationsDirectory, migrationName), 'utf8');
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
            photo_assets,
            media_cleanup_jobs,
            admin_audit_events,
            series_photos,
            series,
            photos,
            photo_creation_intents
         CASCADE`
    );
    r2Objects = new Map();
    publicWrites = [];
});

after(async () => {
    if (!adminPool) return;
    await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await adminPool.end();
});

integrationTest('source-upload-url -> simulated R2 -> replace-source publishes a valid source', async () => {
    const photoId = 9_300_001;
    const current = await repository.photos.create(activePhotoRecord(photoId));
    const service = createService(generations.valid);
    const source = await jpegBuffer();
    const prepared = await service.prepare({
        photoId,
        expectedVersion: current.version,
        contentType: 'image/jpg',
        fileSize: source.length
    });

    assert.equal(prepared.contentType, 'image/jpeg');
    await uploadSimulated(prepared, { buffer: source });
    const updated = await service.finalize({
        photoId,
        expectedVersion: current.version,
        operationId: prepared.operationId,
        mediaGeneration: prepared.mediaGeneration,
        sourcePath: prepared.sourcePath
    });

    assert.equal(updated.mediaGeneration, generations.valid);
    assert.equal(publicWrites.length > 0, true);
    assert.equal(
        updated.assets.some((asset) => (
            asset.role === 'source'
            && asset.path === prepared.sourcePath
            && asset.generation === generations.valid
        )),
        true
    );
    assert.equal(
        updated.assets.filter((asset) => asset.replacementGroup === 'derivatives')
            .every((asset) => asset.generation === generations.valid),
        true
    );
});

integrationTest('declared MIME different from the real bytes cannot replace the active generation', async () => {
    const photoId = 9_300_002;
    const current = await repository.photos.create(activePhotoRecord(photoId));
    const service = createService(generations.mismatch);
    const source = await jpegBuffer();
    const prepared = await service.prepare({
        photoId,
        expectedVersion: current.version,
        contentType: 'image/png',
        fileSize: source.length
    });
    await uploadSimulated(prepared, {
        buffer: source,
        contentType: 'image/png'
    });

    await assert.rejects(
        service.finalize({
            photoId,
            expectedVersion: current.version,
            operationId: prepared.operationId,
            mediaGeneration: prepared.mediaGeneration,
            sourcePath: prepared.sourcePath
        }),
        (error) => error.code === 'PHOTO_SOURCE_FORMAT_MISMATCH'
    );

    assert.equal(publicWrites.length, 0);
    assert.equal((await repository.photos.findById(photoId)).mediaGeneration, generations.initial);
    await assertRejectedSourceIsDurable(prepared);
});

integrationTest('the real R2 object size is enforced before derivatives are published', async () => {
    const photoId = 9_300_003;
    const current = await repository.photos.create(activePhotoRecord(photoId));
    const service = createService(generations.oversized);
    const source = await jpegBuffer();
    const prepared = await service.prepare({
        photoId,
        expectedVersion: current.version,
        contentType: 'image/jpeg',
        fileSize: source.length
    });
    await uploadSimulated(prepared, {
        buffer: source,
        contentLength: PHOTO_UPLOAD_MAX_BYTES + 1
    });

    await assert.rejects(
        service.finalize({
            photoId,
            expectedVersion: current.version,
            operationId: prepared.operationId,
            mediaGeneration: prepared.mediaGeneration,
            sourcePath: prepared.sourcePath
        }),
        (error) => error.code === 'PHOTO_SOURCE_TOO_LARGE' && error.status === 413
    );

    assert.equal(publicWrites.length, 0);
    assert.equal((await repository.photos.findById(photoId)).mediaGeneration, generations.initial);
    await assertRejectedSourceIsDurable(prepared);
});
