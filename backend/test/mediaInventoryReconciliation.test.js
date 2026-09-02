const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
    assertMetadataCutoverReady,
    analyzeMetadataSnapshot
} = require('../src/services/metadataMigration');
const {
    reconcileMediaInventories: reconcileMediaInventoriesWithProvenance
} = require('../src/services/mediaInventoryReconciliation');
const {
    writeOutputs
} = require('../scripts/reconcile-media-inventory');

const GENERATION_A = '01KYMPAMCGZG34TT5JX1BCBB9K';
const GENERATION_B = '01KYMPAVWHF68W0AKY2HN8X6KA';
const TEST_PROVENANCE = Object.freeze({
    publicBucket: 'portfolio-public-test',
    privateBucket: 'portfolio-private-test',
    objectNamespace: 'test/reconciliation'
});

function reconcileMediaInventories(snapshot, objects, provenance = {}) {
    return reconcileMediaInventoriesWithProvenance(snapshot, objects, {
        ...TEST_PROVENANCE,
        ...provenance
    });
}

function photo(id, overrides = {}) {
    return {
        id,
        title: `Photo ${id}`,
        description: '',
        date: '2026-01-01',
        location: { name: 'Roma', lat: 41.9, lng: 12.5 },
        camera: '',
        lens: '',
        resolution: '1200x800',
        settings: {},
        tags: [],
        derivativesVersion: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: 1,
        ...overrides
    };
}

function object(scope, relativeKey, contentType, overrides = {}) {
    return {
        scope,
        key: relativeKey,
        relativeKey,
        size: 1024,
        etag: `etag-${relativeKey}`,
        lastModified: '2026-08-11T00:00:00.000Z',
        contentType,
        ...overrides
    };
}

function generationObjects(id, generation = GENERATION_A) {
    return [
        object('public', `photos/${id}/${generation}/full.webp`, 'image/webp'),
        object('public', `photos/${id}/${generation}/mobile.webp`, 'image/webp'),
        object('public', `photos/${id}/${generation}/thumbnail-4x3.webp`, 'image/webp'),
        object('public', `photos/${id}/${generation}/thumbnail-1x1.webp`, 'image/webp'),
        object('public', `photos/${id}/${generation}/social.jpg`, 'image/jpeg'),
        object('private', `source/photos/${id}/${generation}/source.jpg`, 'image/jpeg')
    ];
}

test('reconstructs one inventory only from one observed canonical generation', () => {
    const source = {
        photos: [photo(101, {
            source: { path: '/private/source/photo_101.jpeg', contentType: 'image/jpeg' },
            mobileImage: true
        })],
        series: []
    };
    const before = structuredClone(source);
    const result = reconcileMediaInventories(source, [
        ...generationObjects(101),
        object('public', 'photo_101.webp', 'image/webp'),
        object('private', 'source/photo_101.jpeg', 'image/jpeg'),
        object('public', 'data/photos.json', 'application/json')
    ]);

    assert.equal(result.ready, true);
    assert.deepEqual(source, before, 'lo snapshot sorgente non deve essere mutato');
    assert.equal(result.proposal.photos[0].mediaGeneration, GENERATION_A);
    assert.deepEqual(
        result.proposal.photos[0].assets.map((asset) => asset.role),
        ['full', 'mobile', 'thumbnail-4x3', 'thumbnail-1x1', 'social', 'source']
    );
    assert.equal(Object.hasOwn(result.proposal.photos[0], 'source'), false);
    assert.equal(Object.hasOwn(result.proposal.photos[0], 'mobileImage'), false);
    assert.equal(result.report.summary.confirmedAssets, 6);
    assert.equal(result.report.summary.orphanObjects, 2);
    assert.equal(result.report.summary.ignoredObjects, 1);
    assert.equal(result.report.summary.cutoverPreflightReady, true);

    assert.throws(
        () => assertMetadataCutoverReady(analyzeMetadataSnapshot(source)),
        (error) => error.code === 'MISSING_ASSET_INVENTORIES_PREFLIGHT'
    );
    assert.doesNotThrow(() => (
        assertMetadataCutoverReady(analyzeMetadataSnapshot(result.proposal))
    ));
});

test('is deterministic and produces stable source, R2, proposal and report checksums', () => {
    const snapshot = { photos: [photo(102)], series: [] };
    const inventory = generationObjects(102);
    const first = reconcileMediaInventories(snapshot, inventory);
    const second = reconcileMediaInventories(
        structuredClone(snapshot),
        [...inventory].reverse()
    );

    assert.equal(first.report.sourceSnapshotChecksum, second.report.sourceSnapshotChecksum);
    assert.equal(first.report.r2InventoryChecksum, second.report.r2InventoryChecksum);
    assert.equal(first.report.proposalChecksum, second.report.proposalChecksum);
    assert.equal(first.report.reportChecksum, second.report.reportChecksum);
    assert.deepEqual(first.proposal, second.proposal);
});

test('binds inventory and report checksums to explicit non-secret R2 provenance', () => {
    const snapshot = { photos: [photo(110)], series: [] };
    const inventory = generationObjects(110);
    const original = reconcileMediaInventories(snapshot, inventory, {
        r2AccessKeyId: 'must-not-be-serialized',
        r2SecretAccessKey: 'must-not-be-serialized-either',
        signedUrl: 'https://signed.example/secret'
    });
    const otherBucket = reconcileMediaInventories(snapshot, inventory, {
        publicBucket: 'different-public-bucket'
    });
    const otherNamespace = reconcileMediaInventories(snapshot, inventory, {
        objectNamespace: 'different/namespace'
    });

    assert.deepEqual(original.report.provenance, {
        ...TEST_PROVENANCE,
        sharedBucket: false
    });
    assert.notEqual(original.report.r2InventoryChecksum, otherBucket.report.r2InventoryChecksum);
    assert.notEqual(original.report.reportChecksum, otherBucket.report.reportChecksum);
    assert.notEqual(original.report.r2InventoryChecksum, otherNamespace.report.r2InventoryChecksum);
    assert.notEqual(original.report.reportChecksum, otherNamespace.report.reportChecksum);
    assert.equal(original.report.proposalChecksum, otherBucket.report.proposalChecksum);
    assert.equal(original.report.proposalChecksum, otherNamespace.report.proposalChecksum);
    const serialized = JSON.stringify(original.report);
    assert.equal(serialized.includes('must-not-be-serialized'), false);
    assert.equal(serialized.includes('signed.example'), false);
});

test('does not guess between two generations containing a valid full', () => {
    const result = reconcileMediaInventories(
        { photos: [photo(103)], series: [] },
        [...generationObjects(103, GENERATION_A), ...generationObjects(103, GENERATION_B)]
    );

    assert.equal(result.ready, false);
    assert.equal(result.report.summary.ambiguousCases > 0, true);
    assert.equal(
        result.report.ambiguousCases.some((entry) => (
            entry.code === 'MULTIPLE_PUBLISHED_GENERATION_CANDIDATES'
        )),
        true
    );
    assert.equal(Array.isArray(result.proposal.photos[0].assets), false);
});

test('does not treat a current or future unknown filename as a known historical role', () => {
    const result = reconcileMediaInventories(
        { photos: [photo(104)], series: [] },
        [
            ...generationObjects(104),
            object(
                'public',
                `photos/104/${GENERATION_A}/panorama-preview.avif`,
                'image/avif'
            )
        ]
    );

    assert.equal(result.ready, false);
    assert.equal(
        result.report.ambiguousCases.some((entry) => (
            entry.code === 'UNKNOWN_ASSET_ROLE_IN_SELECTED_GENERATION'
        )),
        true
    );
    assert.equal(Array.isArray(result.proposal.photos[0].assets), false);
});

test('reports a missing full as non publishable without inventing an asset', () => {
    const objects = generationObjects(105).filter((entry) => !entry.relativeKey.endsWith('/full.webp'));
    const result = reconcileMediaInventories(
        { photos: [photo(105)], series: [] },
        objects
    );

    assert.equal(result.ready, false);
    assert.deepEqual(result.report.unpublishablePhotos, [105]);
    assert.equal(
        result.report.missingAssets.some((entry) => (
            entry.code === 'CANONICAL_FULL_MISSING'
            && entry.requiredForPublication
        )),
        true
    );
    assert.equal(result.report.preflight.ready, false);
});

test('rejects zero-sized objects and mismatching content types', () => {
    const objects = generationObjects(106).map((entry) => (
        entry.relativeKey.endsWith('/full.webp')
            ? { ...entry, contentType: 'image/jpeg', size: 0 }
            : entry
    ));
    const result = reconcileMediaInventories(
        { photos: [photo(106)], series: [] },
        objects
    );

    assert.equal(result.ready, false);
    assert.equal(result.report.summary.confirmedInventories, 0);
    assert.equal(
        result.report.ambiguousCases.some((entry) => (
            entry.code === 'INVALID_FULL_OBJECT_METADATA'
            && entry.contentType === 'image/jpeg'
        )),
        true
    );
    assert.equal(Array.isArray(result.proposal.photos[0].assets), false);
});

test('preserves an explicitly inventoried source from an older generation', () => {
    const assets = [
        {
            role: 'full',
            replacementGroup: 'derivatives',
            scope: 'public',
            path: `/uploads/photos/107/${GENERATION_A}/full.webp`,
            contentType: 'image/webp',
            generation: GENERATION_A
        },
        {
            role: 'source',
            replacementGroup: 'source',
            scope: 'private',
            path: `/private/source/photos/107/${GENERATION_B}/source.jpg`,
            contentType: 'image/jpeg',
            generation: GENERATION_B
        }
    ];
    const result = reconcileMediaInventories(
        {
            photos: [photo(107, { mediaGeneration: GENERATION_A, assets })],
            series: []
        },
        [
            object('public', `photos/107/${GENERATION_A}/full.webp`, 'image/webp'),
            object('private', `source/photos/107/${GENERATION_B}/source.jpg`, 'image/jpeg')
        ]
    );

    assert.equal(result.ready, true);
    assert.deepEqual(result.proposal.photos[0].assets, assets);
    assert.equal(result.report.summary.proposedPhotoChanges, 0);
});

test('classifies canonical and legacy objects without a metadata owner as orphans', () => {
    const result = reconcileMediaInventories(
        { photos: [photo(108)], series: [] },
        [
            ...generationObjects(108),
            object('public', `photos/999/${GENERATION_A}/full.webp`, 'image/webp'),
            object('private', 'source/photo_998.jpeg', 'image/jpeg')
        ]
    );

    assert.equal(result.ready, true);
    assert.deepEqual(
        new Set(result.report.orphanObjects.map((entry) => entry.reason)),
        new Set([
            'canonical-object-without-photo-owner',
            'legacy-object-without-photo-owner'
        ])
    );
});

test('writes review artifacts idempotently and requires the reviewed checksum for final files', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-reconciliation-'));
    try {
        const snapshot = { photos: [photo(109)], series: [] };
        const result = reconcileMediaInventories(snapshot, generationObjects(109), {
            r2AccessKeyId: 'must-not-be-serialized',
            r2SecretAccessKey: 'must-not-be-serialized-either'
        });
        const options = { fromR2: true, outputDir };

        const first = await writeOutputs(options, snapshot, result);
        const second = await writeOutputs(options, snapshot, result);
        assert.equal(first.manifest.reportChecksum, second.manifest.reportChecksum);
        assert.deepEqual(first.manifest.provenance, result.report.provenance);
        assert.equal(first.manifest.reportChecksumKind, 'logical-canonical-json');
        assert.equal(
            JSON.stringify(first.manifest).includes('must-not-be-serialized'),
            false
        );
        assert.equal(
            JSON.parse(await fs.readFile(first.files.manifest, 'utf8')).ready,
            true
        );
        assert.equal(
            await fs.readFile(first.files.proposedPhotos, 'utf8'),
            await fs.readFile(second.files.proposedPhotos, 'utf8')
        );

        const approvedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-reconciliation-approved-'));
        try {
            const checksumFromAnotherProvenance = reconcileMediaInventories(
                snapshot,
                generationObjects(109),
                { privateBucket: 'another-private-bucket' }
            ).report.reportChecksum;
            await assert.rejects(
                () => writeOutputs({
                    ...options,
                    outputDir: approvedDir,
                    approvedReportChecksum: checksumFromAnotherProvenance
                }, snapshot, result),
                /reportChecksum logico approvato non coincide/
            );
            const approved = await writeOutputs({
                ...options,
                outputDir: approvedDir,
                approvedReportChecksum: result.report.reportChecksum
            }, snapshot, result);
            assert.equal(
                await fs.readFile(approved.files.finalPhotos, 'utf8'),
                await fs.readFile(approved.files.proposedPhotos, 'utf8')
            );
        } finally {
            await fs.rm(approvedDir, { recursive: true, force: true });
        }
    } finally {
        await fs.rm(outputDir, { recursive: true, force: true });
    }
});
