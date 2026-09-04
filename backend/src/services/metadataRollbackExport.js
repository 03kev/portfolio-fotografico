const { isDeepStrictEqual } = require('node:util');
const { PostgresPortfolioRepository } = require('../repositories/PostgresPortfolioRepository');
const { analyzeMetadataSnapshot, assertMetadataCutoverReady } = require('./metadataMigration');
const { toStoragePhoto } = require('./photoRecord');
const { normalizeSeriesRecord } = require('./seriesRecord');
const {
    checksum,
    stableStringify
} = require('./mediaInventoryReconciliation');
const { normalizeR2ObjectPrefix } = require('../utils/r2ObjectNamespace');

const EXPORT_SCHEMA_VERSION = 1;
const BLOCKING_CLEANUP_STATUSES = Object.freeze(['pending', 'processing', 'failed']);

class MetadataRollbackExportError extends Error {
    constructor(code, message, details = null) {
        super(message);
        this.name = 'MetadataRollbackExportError';
        this.code = code;
        this.details = details;
    }
}

function assertWritesDisabled(value) {
    if (value !== false) {
        throw new MetadataRollbackExportError(
            'METADATA_WRITES_MUST_BE_DISABLED',
            'Export rifiutato: METADATA_WRITES_ENABLED deve essere esplicitamente false.'
        );
    }
}

function normalizeExpectedDatabaseIdentity({
    expectedDatabaseName,
    expectedNeonBranchId
} = {}) {
    const database = String(expectedDatabaseName || '').trim();
    const neonBranchId = String(expectedNeonBranchId || '').trim();
    if (!database || !neonBranchId) {
        throw new MetadataRollbackExportError(
            'EXPECTED_DATABASE_IDENTITY_REQUIRED',
            'Export rifiutato: database e branch Neon attesi devono essere dichiarati esplicitamente.'
        );
    }
    return { database, neonBranchId };
}

async function readDatabaseIdentity(client) {
    const result = await client.query(
        `SELECT current_database() AS database_name,
                current_setting('neon.branch_id', true) AS branch_id`
    );
    return {
        database: String(result.rows[0]?.database_name || '').trim(),
        neonBranchId: String(result.rows[0]?.branch_id || '').trim() || null
    };
}

function assertExpectedDatabaseIdentity(actual, expected) {
    if (!actual.neonBranchId) {
        throw new MetadataRollbackExportError(
            'NEON_BRANCH_ID_UNAVAILABLE',
            'Export rifiutato: la connessione non espone un’identità Neon verificabile.'
        );
    }
    if (actual.database !== expected.database) {
        throw new MetadataRollbackExportError(
            'DATABASE_NAME_MISMATCH',
            'Export rifiutato: il database connesso non coincide con quello atteso.',
            { expected: expected.database, actual: actual.database }
        );
    }
    if (actual.neonBranchId !== expected.neonBranchId) {
        throw new MetadataRollbackExportError(
            'NEON_BRANCH_ID_MISMATCH',
            'Export rifiutato: il branch Neon connesso non coincide con quello atteso.',
            { expected: expected.neonBranchId, actual: actual.neonBranchId }
        );
    }
}

function createTransactionPool(client) {
    return {
        query: client.query.bind(client),
        connect: async () => {
            throw new Error('L’export non può aprire connessioni fuori dalla transazione read-only.');
        }
    };
}

function serializePhoto(photo) {
    const snapshotPhoto = {
        id: photo.id,
        title: photo.title,
        description: photo.description,
        date: photo.date,
        location: photo.location,
        lat: photo.lat,
        lng: photo.lng,
        camera: photo.camera,
        lens: photo.lens,
        resolution: photo.resolution,
        settings: photo.settings,
        tags: photo.tags,
        updatedAt: photo.updatedAt,
        derivativesVersion: photo.derivativesVersion,
        mediaGeneration: photo.mediaGeneration,
        assets: photo.assets.map((asset) => ({
            role: asset.role,
            replacementGroup: asset.replacementGroup,
            scope: asset.scope,
            path: asset.path,
            contentType: asset.contentType,
            generation: asset.generation
        })),
        createdAt: photo.createdAt,
        version: photo.version
    };
    const normalized = toStoragePhoto(snapshotPhoto);
    if (!isDeepStrictEqual(normalized, snapshotPhoto)) {
        throw new MetadataRollbackExportError(
            'NON_CANONICAL_PHOTO_RECORD',
            `La foto ${photo.id} richiederebbe una normalizzazione durante l’export.`
        );
    }
    return snapshotPhoto;
}

function serializeSeries(series) {
    const snapshotSeries = {
        id: String(series.id),
        title: series.title,
        slug: series.slug,
        description: series.description,
        coverImage: series.coverImage,
        photos: [...series.photos],
        content: structuredClone(series.content),
        published: series.published,
        createdAt: series.createdAt,
        updatedAt: series.updatedAt,
        version: series.version
    };
    if (!Number.isSafeInteger(snapshotSeries.version) || snapshotSeries.version <= 0) {
        throw new MetadataRollbackExportError(
            'SERIES_VERSION_MISSING',
            `La serie ${snapshotSeries.id} non ha una versione canonica esportabile.`
        );
    }
    const normalized = normalizeSeriesRecord(snapshotSeries);
    if (!isDeepStrictEqual(normalized, snapshotSeries)) {
        throw new MetadataRollbackExportError(
            'NON_CANONICAL_SERIES_RECORD',
            `La serie ${snapshotSeries.id} richiederebbe una normalizzazione durante l’export.`
        );
    }
    return snapshotSeries;
}

function buildCanonicalSnapshot(photos, series) {
    return {
        photos: photos.map(serializePhoto),
        series: series.map(serializeSeries)
    };
}

function rowsToStatusCounts(rows) {
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
}

async function inspectOperationalState(client, objectNamespace, identity) {
    // A pg Client serializes queries internally. Keep this flow explicitly
    // sequential so every read is visibly bound to the one export transaction.
    const audit = await client.query(
        'SELECT count(*)::int AS count FROM admin_audit_events'
    );
    const intents = await client.query(
        `SELECT status, count(*)::int AS count
         FROM photo_creation_intents
         GROUP BY status
         ORDER BY status`
    );
    const mediaOperations = await client.query(
        `SELECT count(*)::int AS count
         FROM photos
         WHERE media_operation_id IS NOT NULL`
    );
    const cleanup = await client.query(
        `SELECT status, count(*)::int AS count
         FROM media_cleanup_jobs
         GROUP BY status
         ORDER BY status`
    );
    const assets = await client.query(
        `SELECT state, object_namespace, count(*)::int AS count
         FROM photo_assets
         GROUP BY state, object_namespace
         ORDER BY object_namespace, state`
    );

    const assetRows = assets.rows.map((row) => ({
        state: row.state,
        objectNamespace: row.object_namespace,
        count: Number(row.count)
    }));
    const targetAssets = assetRows.filter((row) => row.objectNamespace === objectNamespace);
    return {
        provenance: {
            database: identity.database,
            neonBranchId: identity.neonBranchId,
            objectNamespace
        },
        auditEvents: Number(audit.rows[0]?.count || 0),
        creationIntents: rowsToStatusCounts(intents.rows),
        activeMediaOperations: Number(mediaOperations.rows[0]?.count || 0),
        cleanupJobs: rowsToStatusCounts(cleanup.rows),
        assets: {
            targetNamespace: Object.fromEntries(targetAssets.map((row) => [row.state, row.count])),
            allNamespaces: assetRows
        }
    };
}

function assertOperationalStateSafe(state) {
    const unfinishedIntents = ['pending', 'processing']
        .reduce((count, status) => count + Number(state.creationIntents[status] || 0), 0);
    const unfinishedCleanup = BLOCKING_CLEANUP_STATUSES
        .reduce((count, status) => count + Number(state.cleanupJobs[status] || 0), 0);
    const unstableAssets = state.assets.allNamespaces
        .filter((row) => row.state === 'planned' || row.state === 'deleting')
        .reduce((count, row) => count + Number(row.count), 0);

    const blockers = {
        unfinishedCreationIntents: unfinishedIntents,
        activeMediaOperations: state.activeMediaOperations,
        unfinishedCleanupJobs: unfinishedCleanup,
        unstableAssets
    };
    if (Object.values(blockers).some((count) => count > 0)) {
        throw new MetadataRollbackExportError(
            'ROLLBACK_STATE_NOT_QUIESCENT',
            'Export rifiutato: lo stato operativo non è quiescente per un rollback coerente.',
            blockers
        );
    }
    return blockers;
}

function assertSnapshotMatchesRegistry(snapshot, state) {
    const snapshotAssetCount = snapshot.photos.reduce(
        (count, photo) => count + photo.assets.length,
        0
    );
    const targetActiveCount = Number(state.assets.targetNamespace.active || 0);
    if (snapshotAssetCount !== targetActiveCount) {
        throw new MetadataRollbackExportError(
            'ACTIVE_ASSET_COUNT_MISMATCH',
            'L’inventario esportato non coincide con tutti gli asset attivi del namespace.',
            { snapshotAssetCount, targetActiveCount }
        );
    }

    const activeOutsideTarget = state.assets.allNamespaces
        .filter((row) => row.state === 'active' && row.objectNamespace !== state.provenance.objectNamespace)
        .reduce((count, row) => count + row.count, 0);
    if (activeOutsideTarget > 0) {
        throw new MetadataRollbackExportError(
            'ACTIVE_ASSETS_OUTSIDE_TARGET_NAMESPACE',
            'Esistono asset attivi fuori dal namespace richiesto: il rollback sarebbe ambiguo.',
            { activeOutsideTarget }
        );
    }
}

function buildReport(snapshot, analysis, operationalState, expectedIdentity) {
    const report = {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        kind: 'postgres-metadata-rollback-snapshot',
        scope: 'metadata-only-coordinated-with-r2',
        provenance: operationalState.provenance,
        transaction: {
            isolation: 'serializable',
            readOnly: true,
            deferrable: true
        },
        safety: {
            databaseIdentity: {
                expected: expectedIdentity,
                matched: true,
                verifiedInsideSnapshotTransaction: true
            },
            localExecutionGate: {
                metadataWritesEnabled: false,
                scope: 'offline-export-process-only'
            },
            remoteApplicationFreeze: {
                verifiedByExporter: false,
                required: true,
                requiredEvidence: 'deployed configuration plus a real 503 METADATA_READ_ONLY response'
            },
            consistencyBoundary: (
                'The read-only transaction provides one consistent snapshot; '
                + 'it does not prevent concurrent or subsequent application writes.'
            ),
            rollbackActivation: 'initially-read-only'
        },
        counts: {
            photos: snapshot.photos.length,
            series: snapshot.series.length,
            memberships: snapshot.series.reduce((count, item) => count + item.photos.length, 0),
            assets: snapshot.photos.reduce((count, photo) => count + photo.assets.length, 0)
        },
        operationalState: {
            auditEvents: operationalState.auditEvents,
            creationIntents: operationalState.creationIntents,
            activeMediaOperations: operationalState.activeMediaOperations,
            cleanupJobs: operationalState.cleanupJobs,
            assetStates: operationalState.assets
        },
        excludedPostgresData: [
            'admin_audit_events',
            'photo_creation_intents',
            'photo media operation leases',
            'media_cleanup_jobs',
            'non-active photo_assets lifecycle rows',
            'internal registry IDs, indexes and sequence state'
        ],
        validation: {
            errors: analysis.errors,
            warnings: analysis.warnings,
            info: analysis.info
        },
        photosChecksum: checksum(snapshot.photos),
        seriesChecksum: checksum(snapshot.series),
        snapshotChecksum: checksum(snapshot)
    };
    return {
        ...report,
        reportChecksum: checksum(report)
    };
}

async function exportMetadataRollbackSnapshot(pool, {
    metadataWritesEnabled,
    objectNamespace = '',
    expectedDatabaseName,
    expectedNeonBranchId
} = {}) {
    assertWritesDisabled(metadataWritesEnabled);
    const expectedIdentity = normalizeExpectedDatabaseIdentity({
        expectedDatabaseName,
        expectedNeonBranchId
    });
    const namespace = normalizeR2ObjectPrefix(objectNamespace);
    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
        const identity = await readDatabaseIdentity(client);
        assertExpectedDatabaseIdentity(identity, expectedIdentity);
        const operationalState = await inspectOperationalState(client, namespace, identity);
        assertOperationalStateSafe(operationalState);

        const repository = new PostgresPortfolioRepository(
            createTransactionPool(client),
            { mediaNamespace: namespace }
        );
        const photos = await repository.photos.list();
        const series = await repository.series.list();
        const snapshot = buildCanonicalSnapshot(photos, series);
        const analysis = analyzeMetadataSnapshot(snapshot);
        assertMetadataCutoverReady(analysis);
        assertSnapshotMatchesRegistry(snapshot, operationalState);
        const report = buildReport(snapshot, analysis, operationalState, expectedIdentity);
        await client.query('COMMIT');
        return { snapshot, report };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

function renderMetadataRollbackReport(report) {
    const namespace = report.provenance.objectNamespace || '(root)';
    const lines = [
        '# Export metadata Postgres per rollback JSON',
        '',
        '> Snapshot dei soli metadata, da coordinare con gli asset R2. Non è un backup completo.',
        '',
        `- Database: ${report.provenance.database}`,
        `- Neon branch: ${report.provenance.neonBranchId || '(non disponibile)'}`,
        `- Namespace R2: ${namespace}`,
        `- Foto: ${report.counts.photos}`,
        `- Serie: ${report.counts.series}`,
        `- Membership: ${report.counts.memberships}`,
        `- Asset attivi: ${report.counts.assets}`,
        `- Snapshot checksum: ${report.snapshotChecksum}`,
        `- Report checksum: ${report.reportChecksum}`,
        '',
        '## Sicurezza operativa',
        '',
        '- Identità database verificata nella stessa transazione dello snapshot: sì',
        '- METADATA_WRITES_ENABLED=false autorizza soltanto questo processo offline.',
        '- Freeze del deployment remoto verificato dall’exporter: no',
        '- Evidenza esterna richiesta: configurazione deploy e risposta reale 503 METADATA_READ_ONLY.',
        '- La transazione read-only fotografa uno stato consistente, ma non impedisce scritture applicative concorrenti o successive.',
        '- Modalità iniziale del rollback JSON: read-only.',
        '',
        '## Stato operativo',
        '',
        `- Audit event esclusi: ${report.operationalState.auditEvents}`,
        `- Operazioni media attive: ${report.operationalState.activeMediaOperations}`,
        `- Intent: ${stableStringify(report.operationalState.creationIntents)}`,
        `- Cleanup job: ${stableStringify(report.operationalState.cleanupJobs)}`,
        '',
        '## Esclusioni intenzionali',
        '',
        ...report.excludedPostgresData.map((item) => `- ${item}`),
        ''
    ];
    return `${lines.join('\n')}\n`;
}

module.exports = {
    EXPORT_SCHEMA_VERSION,
    MetadataRollbackExportError,
    assertExpectedDatabaseIdentity,
    assertOperationalStateSafe,
    buildCanonicalSnapshot,
    exportMetadataRollbackSnapshot,
    normalizeExpectedDatabaseIdentity,
    readDatabaseIdentity,
    renderMetadataRollbackReport
};
