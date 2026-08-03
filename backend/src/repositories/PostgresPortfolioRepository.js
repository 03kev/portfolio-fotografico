const Series = require('../models/Series');
const {
    createSeriesSlug,
    normalizeSeriesRecord,
    normalizeSeriesTitleKey
} = require('../services/seriesRecord');
const {
    DEFAULT_STALE_WRITER_GRACE_MS,
    PostgresMediaCleanupRepository
} = require('./PostgresMediaCleanupRepository');
const {
    activatePhotoAssets,
    importActivePhotoAssets,
    loadActivePhotoAssets,
    markPhotoAssetsStored,
    registerPlannedPhotoAssets,
    retireAllActivePhotoAssets
} = require('./PostgresPhotoAssetRepository');
const {
    PHOTO_ASSET_REPLACEMENT_GROUPS
} = require('../services/photoAssetLifecycle');
const {
    MediaMutationConflictError,
    ReferenceIntegrityError,
    RepositoryConflictError,
    VersionConflictError
} = require('./errors');

const RETRYABLE_TRANSACTION_CODES = new Set(['40001', '40P01']);
const PHOTO_PATCH_COLUMNS = Object.freeze({
    title: ['title', (value) => String(value)],
    description: ['description', (value) => String(value)],
    date: ['date_taken', (value) => String(value)],
    location: ['location_name', (value) => String(value)],
    lat: ['latitude', Number],
    lng: ['longitude', Number],
    camera: ['camera', (value) => String(value)],
    lens: ['lens', (value) => String(value)],
    resolution: ['resolution', (value) => String(value)],
    settings: ['settings', (value) => JSON.stringify(value || {})],
    tags: ['tags', (value) => Array.isArray(value) ? value : []],
    updatedAt: ['updated_at_ms', Number],
    derivativesVersion: ['derivatives_version', Number],
    mediaGeneration: ['media_generation', (value) => String(value || '') || null]
});

function normalizePositiveId(value, fieldName) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new TypeError(`${fieldName} deve essere un ID numerico positivo.`);
    }
    return parsed;
}

function normalizeExpectedVersion(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new TypeError('expectedVersion deve essere un intero positivo.');
    }
    return parsed;
}

function mapPhotoRow(row, assets = []) {
    if (!row) return null;
    return {
        id: Number(row.id),
        title: row.title,
        description: row.description,
        date: row.date_taken,
        location: row.location_name,
        lat: Number(row.latitude),
        lng: Number(row.longitude),
        camera: row.camera,
        lens: row.lens,
        resolution: row.resolution,
        settings: row.settings || {},
        tags: row.tags || [],
        updatedAt: Number(row.updated_at_ms),
        derivativesVersion: Number(row.derivatives_version),
        mediaGeneration: row.media_generation || '',
        assets,
        createdAt: new Date(row.created_at).toISOString(),
        version: Number(row.version)
    };
}

async function attachActiveAssets(queryable, namespace, photos) {
    const list = (Array.isArray(photos) ? photos : [photos]).filter(Boolean);
    if (!list.length) return Array.isArray(photos) ? [] : null;
    const assetsByPhoto = await loadActivePhotoAssets(
        queryable,
        namespace,
        list.map((photo) => photo.id)
    );
    const attached = list.map((photo) => ({
        ...photo,
        assets: assetsByPhoto.get(Number(photo.id)) || []
    }));
    return Array.isArray(photos) ? attached : attached[0];
}

function activeMediaOperationFromRow(row) {
    if (!row?.media_operation_id) return null;
    const expiresAt = row.media_operation_expires_at
        ? new Date(row.media_operation_expires_at)
        : null;
    if (!expiresAt || expiresAt.getTime() <= Date.now()) return null;
    return {
        id: String(row.media_operation_id),
        kind: row.media_operation_kind,
        generation: row.media_operation_generation,
        expiresAt: expiresAt.toISOString()
    };
}

function assertNoActiveMediaOperation(row, photoId) {
    const active = activeMediaOperationFromRow(row);
    if (active) {
        throw new MediaMutationConflictError(photoId, active.kind, active.expiresAt);
    }
}

function mapSeriesRow(row, photoIds = []) {
    if (!row) return null;
    return {
        id: String(row.id),
        title: row.title,
        slug: row.slug,
        description: row.description,
        coverImage: row.cover_photo_id === null ? null : Number(row.cover_photo_id),
        photos: photoIds.map(Number),
        content: row.content || [],
        published: row.published,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        version: Number(row.version)
    };
}

function mapAuditRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        occurredAt: new Date(row.occurred_at).toISOString(),
        entityType: row.entity_type,
        entityId: String(row.entity_id),
        operation: row.operation,
        fromVersion: row.from_version === null ? null : Number(row.from_version),
        toVersion: row.to_version === null ? null : Number(row.to_version),
        beforeState: row.before_state,
        afterState: row.after_state,
        changes: row.changes || {},
        operationId: row.operation_id ? String(row.operation_id) : null,
        metadata: row.metadata || {}
    };
}

function mapPhotoCreationIntentRow(row) {
    if (!row) return null;
    return {
        id: String(row.id),
        photoId: Number(row.photo_id),
        sourcePath: row.source_path,
        sourceContentType: row.source_content_type,
        payloadHash: row.payload_hash || null,
        status: row.status,
        leaseId: row.lease_id ? String(row.lease_id) : null,
        leaseGeneration: row.lease_generation || null,
        leaseExpiresAt: row.lease_expires_at
            ? new Date(row.lease_expires_at).toISOString()
            : null,
        completedGeneration: row.completed_generation || null,
        expiresAt: new Date(row.expires_at).toISOString(),
        completedAt: row.completed_at
            ? new Date(row.completed_at).toISOString()
            : null,
        createdAt: new Date(row.created_at).toISOString()
    };
}

function buildAuditChanges(beforeState, afterState) {
    const before = beforeState || {};
    const after = afterState || {};
    const changes = {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of keys) {
        if (key === 'version') continue;
        const beforeValue = before[key] === undefined ? null : before[key];
        const afterValue = after[key] === undefined ? null : after[key];
        if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) continue;
        changes[key] = {
            before: beforeValue,
            after: afterValue
        };
    }
    return changes;
}

async function insertAuditEvent(queryable, {
    entityType,
    entityId,
    operation,
    beforeState = null,
    afterState = null,
    operationId = null,
    metadata = {}
}) {
    const result = await queryable.query(
        `INSERT INTO admin_audit_events (
            entity_type, entity_id, operation, from_version, to_version,
            before_state, after_state, changes, operation_id, metadata
         ) VALUES (
            $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::uuid, $10::jsonb
         )
         RETURNING *`,
        [
            entityType,
            entityId,
            operation,
            beforeState?.version ?? null,
            afterState?.version ?? null,
            beforeState ? JSON.stringify(beforeState) : null,
            afterState ? JSON.stringify(afterState) : null,
            JSON.stringify(buildAuditChanges(beforeState, afterState)),
            operationId,
            JSON.stringify(metadata || {})
        ]
    );
    return mapAuditRow(result.rows[0]);
}

function normalizeUuid(value, fieldName) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
        throw new TypeError(`${fieldName} deve essere un UUID valido.`);
    }
    return normalized;
}

function normalizePayloadHash(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalized)) {
        throw new TypeError('payloadHash deve essere un hash SHA-256 valido.');
    }
    return normalized;
}

async function insertPhotoRow(queryable, photo, {
    creationIntentId = null,
    createdAt = null
} = {}) {
    const photoId = normalizePositiveId(photo?.id, 'photoId');
    const result = await queryable.query(
        `INSERT INTO photos (
            id, title, description, date_taken, location_name,
            latitude, longitude, camera, lens, resolution, settings,
            tags, updated_at_ms, derivatives_version, created_at, media_generation,
            creation_intent_id
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb,
            $12, $13, $14,
            COALESCE(
                $15::timestamptz,
                (
                    SELECT created_at
                    FROM photo_creation_intents
                    WHERE id = $17::uuid
                ),
                CURRENT_TIMESTAMP
            ),
            $16, $17::uuid
         )
         RETURNING *`,
        [
            photoId,
            photo.title,
            photo.description || '',
            photo.date || '',
            photo.location,
            Number(photo.lat),
            Number(photo.lng),
            photo.camera || '',
            photo.lens || '',
            photo.resolution || '',
            JSON.stringify(photo.settings || {}),
            photo.tags || [],
            Number(photo.updatedAt) || 0,
            Number(photo.derivativesVersion) || photoId,
            createdAt || photo.createdAt || null,
            photo.mediaGeneration || null,
            creationIntentId
        ]
    );
    return mapPhotoRow(result.rows[0]);
}

function extractContentPhotoIds(content) {
    const ids = [];
    if (!Array.isArray(content)) return ids;

    for (const block of content) {
        if (block?.type === 'photo') {
            const id = Number(block.content);
            if (Number.isSafeInteger(id) && id > 0) ids.push(id);
        } else if (block?.type === 'photos' && Array.isArray(block.content)) {
            for (const item of block.content) {
                const id = Number(
                    item && typeof item === 'object'
                        ? item.id ?? item.photoId ?? item.content
                        : item
                );
                if (Number.isSafeInteger(id) && id > 0) ids.push(id);
            }
        }
    }

    return [...new Set(ids)];
}

function assertContentReferencesMembership(series) {
    const membership = new Set(series.photos);
    const invalidIds = extractContentPhotoIds(series.content)
        .filter((photoId) => !membership.has(photoId));
    if (invalidIds.length > 0) {
        throw new ReferenceIntegrityError(
            'Il contenuto della serie riferisce foto che non appartengono alla serie.',
            { photoIds: invalidIds }
        );
    }
}

function removePhotoReferences(series, photoId) {
    const nextPhotos = series.photos.filter((id) => id !== photoId);
    const nextContent = series.content
        .map((block) => {
            if (block?.type === 'photo' && Number(block.content) === photoId) {
                return null;
            }
            if (block?.type !== 'photos' || !Array.isArray(block.content)) {
                return block;
            }
            const items = block.content.filter((item) => {
                const itemId = Number(
                    item && typeof item === 'object'
                        ? item.id ?? item.photoId ?? item.content
                        : item
                );
                return itemId !== photoId;
            });
            return items.length > 0 ? { ...block, content: items } : null;
        })
        .filter(Boolean);

    return normalizeSeriesRecord({
        ...series,
        photos: nextPhotos,
        coverImage: Number(series.coverImage) === photoId
            ? (nextPhotos[0] ?? null)
            : series.coverImage,
        content: nextContent,
        updatedAt: new Date().toISOString()
    });
}

function translatePostgresError(error) {
    if (
        error instanceof RepositoryConflictError
        || error instanceof TypeError
    ) {
        return error;
    }

    if (error?.code === '23505') {
        const codes = {
            photos_pkey: 'PHOTO_ID_CONFLICT',
            series_pkey: 'SERIES_ID_CONFLICT',
            series_title_key_unique: 'SERIES_TITLE_CONFLICT',
            series_slug_unique: 'SERIES_SLUG_CONFLICT',
            series_photos_pkey: 'SERIES_PHOTO_CONFLICT',
            photo_creation_intents_pkey: 'PHOTO_UPLOAD_INTENT_CONFLICT',
            photo_creation_intents_photo_id_unique: 'PHOTO_ID_CONFLICT',
            photo_creation_intents_source_path_unique: 'PHOTO_SOURCE_PATH_CONFLICT',
            photos_creation_intent_unique: 'PHOTO_UPLOAD_INTENT_CONFLICT'
        };
        return new RepositoryConflictError(
            'Una risorsa con la stessa identità esiste già.',
            codes[error.constraint] || 'UNIQUE_CONFLICT',
            { constraint: error.constraint }
        );
    }

    if (error?.code === '23503') {
        return new ReferenceIntegrityError(
            'L’operazione contiene un riferimento a una risorsa inesistente o ancora utilizzata.',
            { constraint: error.constraint }
        );
    }

    if (error?.code === '23514') {
        const checkConstraints = {
            photos_id_check: {
                message: 'L’identificativo della foto deve essere un numero positivo.',
                field: 'id',
                rule: 'positive'
            },
            photos_title_check: {
                message: 'Il titolo della foto deve contenere almeno 3 caratteri.',
                field: 'title',
                minimumLength: 3
            },
            photos_location_name_check: {
                message: 'Il luogo della foto non può essere vuoto.',
                field: 'location'
            },
            photos_latitude_check: {
                message: 'La latitudine deve essere compresa tra -90 e 90.',
                field: 'lat',
                minimum: -90,
                maximum: 90
            },
            photos_longitude_check: {
                message: 'La longitudine deve essere compresa tra -180 e 180.',
                field: 'lng',
                minimum: -180,
                maximum: 180
            },
            photos_settings_check: {
                message: 'Le impostazioni della foto devono essere un oggetto valido.',
                field: 'settings',
                rule: 'object'
            },
            photos_tags_check: {
                message: 'Una foto può avere al massimo 20 tag.',
                field: 'tags',
                maximumItems: 20
            },
            photos_updated_at_ms_check: {
                message: 'La data di aggiornamento della foto non è valida.',
                field: 'updatedAt'
            },
            photos_derivatives_version_check: {
                message: 'La versione delle varianti della foto non è valida.',
                field: 'derivativesVersion'
            },
            photos_version_check: {
                message: 'La versione della foto non è valida.',
                field: 'version'
            },
            series_id_check: {
                message: 'L’identificativo della serie deve essere un numero positivo.',
                field: 'id',
                rule: 'positive'
            },
            series_title_check: {
                message: 'Il titolo della serie non può essere vuoto.',
                field: 'title'
            },
            series_title_key_check: {
                message: 'Il titolo normalizzato della serie non può essere vuoto.',
                field: 'title'
            },
            series_slug_check: {
                message: 'L’indirizzo della serie può contenere solo lettere minuscole, numeri e trattini.',
                field: 'slug',
                rule: 'slug'
            },
            series_description_check: {
                message: 'La descrizione della serie non può essere vuota.',
                field: 'description'
            },
            series_content_check: {
                message: 'Il contenuto della serie deve essere una lista valida.',
                field: 'content',
                rule: 'array'
            },
            series_version_check: {
                message: 'La versione della serie non è valida.',
                field: 'version'
            },
            series_photos_position_check: {
                message: 'La posizione della foto nella serie non può essere negativa.',
                field: 'photos',
                minimum: 0
            },
            photos_media_generation_ulid: {
                message: 'L’identificativo della generazione dei file non è valido. Ripeti il caricamento.',
                field: 'mediaGeneration',
                rule: 'ulid'
            },
            photos_media_operation_complete: {
                message: 'Lo stato dell’operazione sui file è incompleto. Ripeti l’operazione.',
                field: 'mediaOperation',
                rule: 'complete'
            },
            photos_media_operation_kind_format: {
                message: 'Il tipo di operazione sui file non è valido. Ripeti l’operazione.',
                field: 'mediaOperation',
                rule: 'format'
            },
            photos_media_operation_generation_ulid: {
                message: 'La generazione dell’operazione sui file non è valida. Ripeti l’operazione.',
                field: 'mediaGeneration',
                rule: 'ulid'
            },
            photo_creation_intents_photo_id_check: {
                message: 'L’identificativo della foto prenotata deve essere un numero positivo.',
                field: 'photoId',
                rule: 'positive'
            },
            photo_creation_intents_source_content_type_check: {
                message: 'Il tipo del file sorgente non può essere vuoto.',
                field: 'sourceContentType'
            },
            photo_creation_intents_lease_generation_ulid: {
                message: 'La generazione della lease di upload non è un ULID valido.',
                field: 'mediaGeneration',
                rule: 'ulid'
            },
            photo_creation_intents_completed_generation_ulid: {
                message: 'La generazione completata dell’upload non è un ULID valido.',
                field: 'mediaGeneration',
                rule: 'ulid'
            },
            photo_creation_intents_payload_hash_format: {
                message: 'L’impronta della richiesta di upload non è valida.',
                field: 'payloadHash',
                rule: 'sha256'
            },
            photo_creation_intents_status_check: {
                message: 'Lo stato della prenotazione di upload non è valido.',
                field: 'uploadIntent',
                rule: 'status'
            },
            photo_creation_intents_lifecycle_check: {
                message: 'Lo stato della prenotazione di upload è incompleto.',
                field: 'uploadIntent',
                rule: 'lifecycle'
            }
        };
        const constraint = String(error.constraint || '');
        const violation = checkConstraints[constraint];
        const invalid = new Error(
            violation?.message || 'Uno dei dati inviati non rispetta i vincoli richiesti.'
        );
        invalid.status = 400;
        invalid.code = 'CHECK_CONSTRAINT_VIOLATION';
        invalid.details = {
            constraint,
            ...(violation || {})
        };
        delete invalid.details.message;
        return invalid;
    }

    return error;
}

async function withTransaction(pool, operation, {
    isolation = 'READ COMMITTED',
    maxAttempts = 3
} = {}) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const client = await pool.connect();
        try {
            await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
            const result = await operation(client);
            await client.query('COMMIT');
            client.release();
            return result;
        } catch (error) {
            lastError = error;
            try {
                await client.query('ROLLBACK');
            } finally {
                client.release();
            }
            if (!RETRYABLE_TRANSACTION_CODES.has(error?.code) || attempt === maxAttempts) {
                throw translatePostgresError(error);
            }
        }
    }
    throw lastError;
}

async function loadMemberships(queryable, seriesIds) {
    if (seriesIds.length === 0) return new Map();
    const result = await queryable.query(
        `SELECT series_id, photo_id
         FROM series_photos
         WHERE series_id = ANY($1::bigint[])
         ORDER BY series_id, position`,
        [seriesIds]
    );
    const memberships = new Map(seriesIds.map((id) => [String(id), []]));
    for (const row of result.rows) {
        memberships.get(String(row.series_id))?.push(Number(row.photo_id));
    }
    return memberships;
}

async function loadSeriesById(queryable, id, { forUpdate = false } = {}) {
    const result = await queryable.query(
        `SELECT *
         FROM series
         WHERE id = $1
         ${forUpdate ? 'FOR UPDATE' : ''}`,
        [id]
    );
    if (!result.rows[0]) return null;
    const memberships = await loadMemberships(queryable, [id]);
    return mapSeriesRow(result.rows[0], memberships.get(String(id)) || []);
}

async function assertPhotosExist(queryable, photoIds) {
    const ids = [...new Set(photoIds.map((id) => normalizePositiveId(id, 'photoId')))];
    if (ids.length === 0) return;
    const result = await queryable.query(
        `SELECT id
         FROM photos
         WHERE id = ANY($1::bigint[])
         FOR KEY SHARE`,
        [ids]
    );
    const existing = new Set(result.rows.map((row) => Number(row.id)));
    const missing = ids.filter((id) => !existing.has(id));
    if (missing.length > 0) {
        throw new ReferenceIntegrityError(
            'La serie contiene foto inesistenti.',
            { photoIds: missing }
        );
    }
}

async function replaceMemberships(queryable, seriesId, photoIds) {
    await queryable.query('DELETE FROM series_photos WHERE series_id = $1', [seriesId]);
    for (let position = 0; position < photoIds.length; position += 1) {
        await queryable.query(
            `INSERT INTO series_photos (series_id, photo_id, position)
             VALUES ($1, $2, $3)`,
            [seriesId, photoIds[position], position]
        );
    }
}

async function persistSeriesAggregate(queryable, series, nextVersion) {
    assertContentReferencesMembership(series);
    await assertPhotosExist(queryable, series.photos);
    await queryable.query(
        `UPDATE series
         SET title = $2,
             title_key = $3,
             slug = $4,
             description = $5,
             cover_photo_id = NULL,
             content = $6::jsonb,
             published = $7,
             updated_at = $8,
             version = $9
         WHERE id = $1`,
        [
            series.id,
            series.title,
            normalizeSeriesTitleKey(series.title),
            series.slug,
            series.description,
            JSON.stringify(series.content),
            series.published,
            series.updatedAt,
            nextVersion
        ]
    );
    await replaceMemberships(queryable, series.id, series.photos);
    if (series.coverImage !== null) {
        await queryable.query(
            'UPDATE series SET cover_photo_id = $2 WHERE id = $1',
            [series.id, series.coverImage]
        );
    }
}

class PostgresPhotoRepository {
    constructor(pool, {
        cleanupNamespace = '',
        cleanupGraceMs = DEFAULT_STALE_WRITER_GRACE_MS
    } = {}) {
        this.pool = pool;
        this.cleanupNamespace = cleanupNamespace;
        this.cleanupGraceMs = cleanupGraceMs;
    }

    async list() {
        const result = await this.pool.query(
            'SELECT * FROM photos ORDER BY created_at DESC, id DESC'
        );
        return attachActiveAssets(
            this.pool,
            this.cleanupNamespace,
            result.rows.map(mapPhotoRow)
        );
    }

    async findById(id) {
        const photoId = normalizePositiveId(id, 'photoId');
        const result = await this.pool.query('SELECT * FROM photos WHERE id = $1', [photoId]);
        return attachActiveAssets(
            this.pool,
            this.cleanupNamespace,
            mapPhotoRow(result.rows[0])
        );
    }

    async create(photo, options = {}) {
        const photoId = normalizePositiveId(photo?.id, 'photoId');
        try {
            return await withTransaction(this.pool, async (client) => {
                const created = await insertPhotoRow(client, photo);
                await importActivePhotoAssets(client, {
                    namespace: this.cleanupNamespace,
                    photoId,
                    generation: photo.mediaGeneration || null,
                    assets: photo.assets
                });
                const createdWithAssets = await attachActiveAssets(
                    client,
                    this.cleanupNamespace,
                    created
                );
                await insertAuditEvent(client, {
                    entityType: 'photo',
                    entityId: photoId,
                    operation: options.auditOperation || 'photo.create',
                    afterState: createdWithAssets,
                    operationId: options.operationId || null,
                    metadata: options.auditMetadata
                });
                return createdWithAssets;
            });
        } catch (error) {
            if (error?.constraint === 'photos_pkey') return null;
            throw translatePostgresError(error);
        }
    }

    async updateById(id, changes, options = {}) {
        const photoId = normalizePositiveId(id, 'photoId');
        const expectedVersion = normalizeExpectedVersion(options.expectedVersion);
        const assignments = [];
        const values = [photoId];

        for (const [field, [column, convert]] of Object.entries(PHOTO_PATCH_COLUMNS)) {
            if (changes[field] === undefined) continue;
            values.push(convert(changes[field]));
            assignments.push(`${column} = $${values.length}`);
        }
        if (assignments.length === 0) return this.findById(photoId);

        assignments.push('version = version + 1');
        return withTransaction(this.pool, async (client) => {
            const locked = await client.query(
                'SELECT * FROM photos WHERE id = $1 FOR UPDATE',
                [photoId]
            );
            const row = locked.rows[0];
            if (!row) return null;
            assertNoActiveMediaOperation(row, photoId);
            const current = mapPhotoRow(row);
            if (expectedVersion !== null && current.version !== expectedVersion) {
                throw new VersionConflictError('photo', photoId, expectedVersion, current.version);
            }
            if (row.media_operation_id) {
                assignments.push(
                    'media_operation_id = NULL',
                    'media_operation_kind = NULL',
                    'media_operation_generation = NULL',
                    'media_operation_expires_at = NULL'
                );
            }
            const result = await client.query(
                `UPDATE photos
                 SET ${assignments.join(', ')}
                 WHERE id = $1
                 RETURNING *`,
                values
            );
            const updated = await attachActiveAssets(
                client,
                this.cleanupNamespace,
                mapPhotoRow(result.rows[0])
            );
            await insertAuditEvent(client, {
                entityType: 'photo',
                entityId: photoId,
                operation: options.auditOperation || 'photo.update',
                beforeState: current,
                afterState: updated,
                operationId: options.operationId || null,
                metadata: options.auditMetadata
            });
            return updated;
        });
    }

    async deleteById(id, options = {}) {
        const photoId = normalizePositiveId(id, 'photoId');
        const expectedVersion = normalizeExpectedVersion(options.expectedVersion);
        return withTransaction(this.pool, async (client) => {
            const locked = await client.query(
                'SELECT * FROM photos WHERE id = $1 FOR UPDATE',
                [photoId]
            );
            const row = locked.rows[0];
            if (!row) return null;
            assertNoActiveMediaOperation(row, photoId);
            const current = mapPhotoRow(row);
            if (expectedVersion !== null && current.version !== expectedVersion) {
                throw new VersionConflictError('photo', photoId, expectedVersion, current.version);
            }
            await retireAllActivePhotoAssets(client, {
                namespace: this.cleanupNamespace,
                photoId,
                reason: 'photo-delete'
            });
            await client.query('DELETE FROM photos WHERE id = $1', [photoId]);
            await insertAuditEvent(client, {
                entityType: 'photo',
                entityId: photoId,
                operation: options.auditOperation || 'photo.delete',
                beforeState: current,
                operationId: options.operationId || null,
                metadata: options.auditMetadata
            });
            return current;
        });
    }

    async beginMediaMutation(id, {
        operationId,
        kind,
        generation,
        expectedVersion,
        ttlMs
    }) {
        const photoId = normalizePositiveId(id, 'photoId');
        const normalizedExpectedVersion = normalizeExpectedVersion(expectedVersion);
        const normalizedTtlMs = Math.max(10_000, Math.min(Number(ttlMs) || 1_200_000, 3_600_000));
        return withTransaction(this.pool, async (client) => {
            const result = await client.query(
                `SELECT *,
                        media_operation_expires_at <= CURRENT_TIMESTAMP
                            AS media_operation_expired
                 FROM photos
                 WHERE id = $1
                 FOR UPDATE`,
                [photoId]
            );
            const row = result.rows[0];
            if (!row) return null;
            assertNoActiveMediaOperation(row, photoId);
            const current = mapPhotoRow(row);
            if (normalizedExpectedVersion !== null && current.version !== normalizedExpectedVersion) {
                throw new VersionConflictError(
                    'photo',
                    photoId,
                    normalizedExpectedVersion,
                    current.version
                );
            }
            const updated = await client.query(
                `UPDATE photos
                 SET media_operation_id = $2::uuid,
                     media_operation_kind = $3,
                     media_operation_generation = $4,
                     media_operation_expires_at = CURRENT_TIMESTAMP + ($5::bigint * INTERVAL '1 millisecond')
                 WHERE id = $1
                 RETURNING *`,
                [photoId, operationId, kind, generation, normalizedTtlMs]
            );
            return {
                photo: await attachActiveAssets(
                    client,
                    this.cleanupNamespace,
                    mapPhotoRow(updated.rows[0])
                ),
                operation: {
                    id: String(updated.rows[0].media_operation_id),
                    kind: updated.rows[0].media_operation_kind,
                    generation: updated.rows[0].media_operation_generation,
                    expiresAt: new Date(updated.rows[0].media_operation_expires_at).toISOString()
                }
            };
        });
    }

    async completeMediaMutation(id, operationId, changes, options = {}) {
        const photoId = normalizePositiveId(id, 'photoId');
        const expectedVersion = normalizeExpectedVersion(options.expectedVersion);
        return withTransaction(this.pool, async (client) => {
            const result = await client.query(
                `SELECT *,
                        media_operation_expires_at <= CURRENT_TIMESTAMP
                            AS media_operation_expired
                 FROM photos
                 WHERE id = $1
                 FOR UPDATE`,
                [photoId]
            );
            const row = result.rows[0];
            if (!row) return null;
            if (String(row.media_operation_id || '') !== String(operationId || '')) {
                throw new RepositoryConflictError(
                    'L’operazione media non è più attiva.',
                    'MEDIA_OPERATION_STALE',
                    { entity: 'photo', id: String(photoId) }
                );
            }
            if (
                !row.media_operation_expires_at
                || row.media_operation_expired
            ) {
                throw new RepositoryConflictError(
                    'L’operazione media è scaduta e non può più pubblicare la generazione.',
                    'MEDIA_OPERATION_STALE',
                    { entity: 'photo', id: String(photoId) }
                );
            }
            if (
                String(changes.mediaGeneration || '')
                !== String(row.media_operation_generation || '')
            ) {
                throw new RepositoryConflictError(
                    'La generazione media non corrisponde alla prenotazione attiva.',
                    'MEDIA_GENERATION_MISMATCH',
                    { entity: 'photo', id: String(photoId) }
                );
            }
            const current = mapPhotoRow(row);
            if (expectedVersion !== null && current.version !== expectedVersion) {
                throw new VersionConflictError('photo', photoId, expectedVersion, current.version);
            }

            const assignments = [];
            const values = [photoId];
            for (const [field, [column, convert]] of Object.entries(PHOTO_PATCH_COLUMNS)) {
                if (changes[field] === undefined) continue;
                values.push(convert(changes[field]));
                assignments.push(`${column} = $${values.length}`);
            }
            assignments.push(
                'media_operation_id = NULL',
                'media_operation_kind = NULL',
                'media_operation_generation = NULL',
                'media_operation_expires_at = NULL',
                'version = version + 1'
            );
            const updated = await client.query(
                `UPDATE photos
                 SET ${assignments.join(', ')}
                 WHERE id = $1
                 RETURNING *`,
                values
            );
            await activatePhotoAssets(client, {
                namespace: this.cleanupNamespace,
                photoId,
                generation: row.media_operation_generation,
                mediaOperationId: operationId,
                replacedReason: `${row.media_operation_kind}-previous-generation`
            });
            const nextPhoto = await attachActiveAssets(
                client,
                this.cleanupNamespace,
                mapPhotoRow(updated.rows[0])
            );
            await insertAuditEvent(client, {
                entityType: 'photo',
                entityId: photoId,
                operation: options.auditOperation
                    || `photo.media.${row.media_operation_kind}`,
                beforeState: current,
                afterState: nextPhoto,
                operationId,
                metadata: {
                    generation: row.media_operation_generation,
                    ...(options.auditMetadata || {})
                }
            });
            return nextPhoto;
        });
    }

    async abortMediaMutation(id, operationId) {
        const photoId = normalizePositiveId(id, 'photoId');
        return withTransaction(this.pool, async (client) => {
            const result = await client.query(
                `UPDATE photos
                 SET media_operation_id = NULL,
                     media_operation_kind = NULL,
                     media_operation_generation = NULL,
                     media_operation_expires_at = NULL
                 WHERE id = $1 AND media_operation_id = $2::uuid
                 RETURNING *`,
                [photoId, operationId]
            );
            if (!result.rows[0]) return null;
            return mapPhotoRow(result.rows[0]);
        });
    }

    async registerMediaMutationAssets(id, operationId, assets) {
        const photoId = normalizePositiveId(id, 'photoId');
        return withTransaction(this.pool, async (client) => {
            const result = await client.query(
                `SELECT *,
                        media_operation_expires_at <= CURRENT_TIMESTAMP
                            AS media_operation_expired
                 FROM photos
                 WHERE id = $1
                 FOR UPDATE`,
                [photoId]
            );
            const row = result.rows[0];
            if (
                !row
                || String(row.media_operation_id || '') !== String(operationId || '')
                || !row.media_operation_expires_at
                || row.media_operation_expired
            ) {
                throw new RepositoryConflictError(
                    'L’operazione media non è più attiva.',
                    'MEDIA_OPERATION_STALE',
                    { entity: 'photo', id: String(photoId) }
                );
            }
            const registered = await registerPlannedPhotoAssets(client, {
                namespace: this.cleanupNamespace,
                photoId,
                generation: row.media_operation_generation,
                assets,
                mediaOperationId: operationId,
                cleanupReason: `${row.media_operation_kind}-abandoned`,
                availableAt: new Date(
                    new Date(row.media_operation_expires_at).getTime()
                    + this.cleanupGraceMs
                )
            });
            return {
                photo: mapPhotoRow(row),
                operation: activeMediaOperationFromRow(row),
                assets: registered
            };
        });
    }

    async markMediaMutationAssetsStored(id, operationId, assetIds) {
        const photoId = normalizePositiveId(id, 'photoId');
        return withTransaction(this.pool, async (client) => {
            const locked = await client.query(
                `SELECT media_operation_id
                 FROM photos
                 WHERE id = $1
                 FOR UPDATE`,
                [photoId]
            );
            if (String(locked.rows[0]?.media_operation_id || '') !== String(operationId || '')) {
                throw new RepositoryConflictError(
                    'L’operazione media non è più attiva.',
                    'MEDIA_OPERATION_STALE',
                    { entity: 'photo', id: String(photoId) }
                );
            }
            let ids = Array.isArray(assetIds) ? assetIds : [];
            if (!ids.length) {
                const owned = await client.query(
                    `SELECT id
                     FROM photo_assets
                     WHERE object_namespace = $1
                       AND photo_id = $2
                       AND owner_media_operation_id = $3::uuid
                       AND state = 'planned'`,
                    [this.cleanupNamespace, photoId, operationId]
                );
                ids = owned.rows.map((asset) => Number(asset.id));
            }
            return markPhotoAssetsStored(client, ids);
        });
    }

    async getMediaMutation(id) {
        const photoId = normalizePositiveId(id, 'photoId');
        const result = await this.pool.query(
            'SELECT * FROM photos WHERE id = $1',
            [photoId]
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
            photo: await attachActiveAssets(
                this.pool,
                this.cleanupNamespace,
                mapPhotoRow(row)
            ),
            operation: activeMediaOperationFromRow(row)
        };
    }
}

class PostgresPhotoCreationRepository {
    constructor(pool, {
        cleanupNamespace = '',
        cleanupGraceMs = DEFAULT_STALE_WRITER_GRACE_MS
    } = {}) {
        this.pool = pool;
        this.cleanupNamespace = cleanupNamespace;
        this.cleanupGraceMs = cleanupGraceMs;
    }

    async createOrGet({
        id,
        sourcePath,
        sourceContentType,
        ttlMs
    }) {
        const intentId = normalizeUuid(id, 'uploadIntentId');
        const normalizedTtlMs = Math.max(
            60_000,
            Math.min(Number(ttlMs) || 86_400_000, 7 * 86_400_000)
        );
        try {
            return await withTransaction(this.pool, async (client) => {
                const ensureStagingCleanup = async (intentRow) => {
                    const availableAt = intentRow.status === 'completed'
                        ? new Date()
                        : new Date(
                            new Date(intentRow.expires_at).getTime()
                            + this.cleanupGraceMs
                        );
                    await registerPlannedPhotoAssets(client, {
                        namespace: this.cleanupNamespace,
                        photoId: Number(intentRow.photo_id),
                        assets: [{
                            role: 'creation-source',
                            replacementGroup: PHOTO_ASSET_REPLACEMENT_GROUPS.CREATION_STAGING,
                            scope: 'private',
                            path: intentRow.source_path,
                            contentType: intentRow.source_content_type
                        }],
                        uploadIntentId: intentId,
                        cleanupReason: 'photo-creation-staging',
                        availableAt
                    });
                };
                const validatePreparationReplay = async (existingIntent) => {
                    if (existingIntent.source_content_type !== sourceContentType) {
                        throw new RepositoryConflictError(
                            'La chiave di idempotenza è già associata a un altro upload.',
                            'PHOTO_UPLOAD_INTENT_MISMATCH',
                            { uploadIntentId: intentId }
                        );
                    }
                    if (
                        existingIntent.status !== 'completed'
                        && existingIntent.intent_expired
                    ) {
                        const expired = new Error('La prenotazione dell’upload è scaduta.');
                        expired.status = 410;
                        expired.code = 'PHOTO_UPLOAD_INTENT_EXPIRED';
                        expired.details = { uploadIntentId: intentId };
                        throw expired;
                    }
                    if (existingIntent.status === 'completed') {
                        const completedPhoto = await client.query(
                            'SELECT id FROM photos WHERE creation_intent_id = $1::uuid',
                            [intentId]
                        );
                        if (!completedPhoto.rows[0]) {
                            const deleted = new Error(
                                'La foto creata da questa prenotazione è stata eliminata.'
                            );
                            deleted.status = 410;
                            deleted.code = 'PHOTO_UPLOAD_RESULT_GONE';
                            deleted.details = { uploadIntentId: intentId };
                            throw deleted;
                        }
                        throw new RepositoryConflictError(
                            'Questa prenotazione ha già completato la creazione della foto.',
                            'PHOTO_UPLOAD_ALREADY_COMPLETED',
                            {
                                uploadIntentId: intentId,
                                photoId: String(existingIntent.photo_id)
                            }
                        );
                    }
                    if (existingIntent.lease_active) {
                        throw new RepositoryConflictError(
                            'La foto è già in fase di elaborazione. Riprova tra poco.',
                            'PHOTO_CREATE_IN_PROGRESS',
                            { uploadIntentId: intentId }
                        );
                    }
                    return mapPhotoCreationIntentRow(existingIntent);
                };
                const replay = await client.query(
                    `SELECT *,
                            expires_at <= CURRENT_TIMESTAMP AS intent_expired,
                            (
                                status = 'processing'
                                AND lease_expires_at > CURRENT_TIMESTAMP
                            ) AS lease_active
                     FROM photo_creation_intents
                     WHERE id = $1::uuid
                     FOR UPDATE`,
                    [intentId]
                );
                if (replay.rows[0]) {
                    await ensureStagingCleanup(replay.rows[0]);
                    return validatePreparationReplay(replay.rows[0]);
                }

                const inserted = await client.query(
                    `INSERT INTO photo_creation_intents (
                        id, source_path, source_content_type, expires_at
                     ) VALUES (
                        $1::uuid, $2, $3,
                        CURRENT_TIMESTAMP + ($4::bigint * INTERVAL '1 millisecond')
                     )
                     ON CONFLICT (id) DO NOTHING
                     RETURNING *`,
                    [
                        intentId,
                        sourcePath,
                        sourceContentType,
                        normalizedTtlMs
                    ]
                );
                if (inserted.rows[0]) {
                    await ensureStagingCleanup(inserted.rows[0]);
                    return mapPhotoCreationIntentRow(inserted.rows[0]);
                }
                const row = (
                    await client.query(
                        `SELECT *,
                                expires_at <= CURRENT_TIMESTAMP AS intent_expired,
                                (
                                    status = 'processing'
                                    AND lease_expires_at > CURRENT_TIMESTAMP
                                ) AS lease_active
                         FROM photo_creation_intents
                         WHERE id = $1::uuid
                         FOR UPDATE`,
                        [intentId]
                    )
                ).rows[0];
                if (!row) {
                    throw new RepositoryConflictError(
                        'Impossibile recuperare la prenotazione dell’upload.',
                        'PHOTO_UPLOAD_INTENT_CONFLICT'
                    );
                }

                await ensureStagingCleanup(row);
                return validatePreparationReplay(row);
            });
        } catch (error) {
            throw translatePostgresError(error);
        }
    }

    async findById(id) {
        const intentId = normalizeUuid(id, 'uploadIntentId');
        const result = await this.pool.query(
            'SELECT * FROM photo_creation_intents WHERE id = $1::uuid',
            [intentId]
        );
        return mapPhotoCreationIntentRow(result.rows[0]);
    }

    async claim(id, {
        leaseId,
        photoId,
        generation,
        sourcePath,
        payloadHash,
        leaseTtlMs
    }) {
        const intentId = normalizeUuid(id, 'uploadIntentId');
        const normalizedLeaseId = normalizeUuid(leaseId, 'leaseId');
        const normalizedPhotoId = normalizePositiveId(photoId, 'photoId');
        const normalizedPayloadHash = normalizePayloadHash(payloadHash);
        const normalizedLeaseTtlMs = Math.max(
            10_000,
            Math.min(Number(leaseTtlMs) || 1_200_000, 3_600_000)
        );

        return withTransaction(this.pool, async (client) => {
            const result = await client.query(
                `SELECT *,
                        expires_at <= CURRENT_TIMESTAMP AS intent_expired,
                        (
                            status = 'processing'
                            AND lease_id IS NOT NULL
                            AND lease_expires_at > CURRENT_TIMESTAMP
                        ) AS lease_active,
                        GREATEST(
                            1,
                            CEIL(EXTRACT(EPOCH FROM (
                                lease_expires_at - CURRENT_TIMESTAMP
                            )))
                        )::int AS lease_retry_after_seconds
                 FROM photo_creation_intents
                 WHERE id = $1::uuid
                 FOR UPDATE`,
                [intentId]
            );
            const row = result.rows[0];
            if (!row) return null;
            const intent = mapPhotoCreationIntentRow(row);

            if (
                intent.photoId !== normalizedPhotoId
                || intent.sourcePath !== sourcePath
            ) {
                throw new RepositoryConflictError(
                    'La richiesta non corrisponde alla prenotazione dell’upload.',
                    'PHOTO_UPLOAD_INTENT_MISMATCH',
                    { uploadIntentId: intentId }
                );
            }
            if (intent.payloadHash && intent.payloadHash !== normalizedPayloadHash) {
                throw new RepositoryConflictError(
                    'La stessa chiave di idempotenza è stata riutilizzata con dati differenti.',
                    'PHOTO_UPLOAD_REPLAY_MISMATCH',
                    { uploadIntentId: intentId }
                );
            }

            if (intent.status === 'completed') {
                const photoResult = await client.query(
                    'SELECT * FROM photos WHERE creation_intent_id = $1::uuid',
                    [intentId]
                );
                if (!photoResult.rows[0]) {
                    const deleted = new Error(
                        'La foto creata da questa prenotazione è stata eliminata.'
                    );
                    deleted.status = 410;
                    deleted.code = 'PHOTO_UPLOAD_RESULT_GONE';
                    deleted.details = { uploadIntentId: intentId };
                    throw deleted;
                }
                return {
                    status: 'completed',
                    intent,
                    photo: await attachActiveAssets(
                        client,
                        this.cleanupNamespace,
                        mapPhotoRow(photoResult.rows[0])
                    )
                };
            }

            if (row.intent_expired) {
                const expired = new Error('La prenotazione dell’upload è scaduta.');
                expired.status = 410;
                expired.code = 'PHOTO_UPLOAD_INTENT_EXPIRED';
                expired.details = { uploadIntentId: intentId };
                throw expired;
            }

            if (row.lease_active) {
                throw new RepositoryConflictError(
                    'La foto è già in fase di elaborazione. Riprova tra poco.',
                    'PHOTO_CREATE_IN_PROGRESS',
                    {
                        uploadIntentId: intentId,
                        retryAfter: Number(row.lease_retry_after_seconds) || 1
                    }
                );
            }

            const claimed = await client.query(
                `UPDATE photo_creation_intents
                 SET status = 'processing',
                     payload_hash = COALESCE(payload_hash, $2),
                     lease_id = $3::uuid,
                     lease_generation = $4,
                     lease_expires_at = CURRENT_TIMESTAMP
                         + ($5::bigint * INTERVAL '1 millisecond'),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1::uuid
                 RETURNING *`,
                [
                    intentId,
                    normalizedPayloadHash,
                    normalizedLeaseId,
                    generation,
                    normalizedLeaseTtlMs
                ]
            );
            return {
                status: 'claimed',
                intent: mapPhotoCreationIntentRow(claimed.rows[0])
            };
        });
    }

    async registerOutputAssets(id, leaseId, assets) {
        const intentId = normalizeUuid(id, 'uploadIntentId');
        const normalizedLeaseId = normalizeUuid(leaseId, 'leaseId');
        return withTransaction(this.pool, async (client) => {
            const result = await client.query(
                `SELECT *
                 FROM photo_creation_intents
                 WHERE id = $1::uuid
                 FOR UPDATE`,
                [intentId]
            );
            const row = result.rows[0];
            if (
                !row
                || row.status !== 'processing'
                || String(row.lease_id || '') !== normalizedLeaseId
                || !row.lease_expires_at
                || new Date(row.lease_expires_at).getTime() <= Date.now()
            ) {
                throw new RepositoryConflictError(
                    'La finalizzazione non possiede più la lease dell’upload.',
                    'PHOTO_UPLOAD_LEASE_LOST',
                    { uploadIntentId: intentId }
                );
            }
            return registerPlannedPhotoAssets(client, {
                namespace: this.cleanupNamespace,
                photoId: Number(row.photo_id),
                generation: row.lease_generation,
                assets,
                uploadIntentId: intentId,
                mediaOperationId: normalizedLeaseId,
                cleanupReason: 'photo-creation-abandoned',
                availableAt: new Date(
                    new Date(row.lease_expires_at).getTime() + this.cleanupGraceMs
                )
            });
        });
    }

    async markOutputAssetsStored(id, leaseId, assetIds) {
        const intentId = normalizeUuid(id, 'uploadIntentId');
        const normalizedLeaseId = normalizeUuid(leaseId, 'leaseId');
        return withTransaction(this.pool, async (client) => {
            const result = await client.query(
                `SELECT lease_id
                 FROM photo_creation_intents
                 WHERE id = $1::uuid
                 FOR UPDATE`,
                [intentId]
            );
            if (String(result.rows[0]?.lease_id || '') !== normalizedLeaseId) {
                throw new RepositoryConflictError(
                    'La finalizzazione non possiede più la lease dell’upload.',
                    'PHOTO_UPLOAD_LEASE_LOST',
                    { uploadIntentId: intentId }
                );
            }
            return markPhotoAssetsStored(client, assetIds);
        });
    }

    async finalize(id, leaseId, photo, { payloadHash } = {}) {
        const intentId = normalizeUuid(id, 'uploadIntentId');
        const normalizedLeaseId = normalizeUuid(leaseId, 'leaseId');
        const normalizedPayloadHash = normalizePayloadHash(payloadHash);

        return withTransaction(this.pool, async (client) => {
            const result = await client.query(
                `SELECT *,
                        (
                            status = 'processing'
                            AND lease_expires_at > CURRENT_TIMESTAMP
                        ) AS lease_active
                 FROM photo_creation_intents
                 WHERE id = $1::uuid
                 FOR UPDATE`,
                [intentId]
            );
            const row = result.rows[0];
            if (!row) return null;
            const intent = mapPhotoCreationIntentRow(row);

            if (intent.payloadHash !== normalizedPayloadHash) {
                throw new RepositoryConflictError(
                    'I dati della finalizzazione non corrispondono alla prenotazione.',
                    'PHOTO_UPLOAD_REPLAY_MISMATCH',
                    { uploadIntentId: intentId }
                );
            }
            if (intent.status === 'completed') {
                const existing = await client.query(
                    'SELECT * FROM photos WHERE creation_intent_id = $1::uuid',
                    [intentId]
                );
                if (!existing.rows[0]) {
                    const deleted = new Error(
                        'La foto creata da questa prenotazione è stata eliminata.'
                    );
                    deleted.status = 410;
                    deleted.code = 'PHOTO_UPLOAD_RESULT_GONE';
                    deleted.details = { uploadIntentId: intentId };
                    throw deleted;
                }
                return {
                    photo: await attachActiveAssets(
                        client,
                        this.cleanupNamespace,
                        mapPhotoRow(existing.rows[0])
                    ),
                    replayed: true
                };
            }
            if (
                intent.status !== 'processing'
                || intent.leaseId !== normalizedLeaseId
                || !row.lease_active
            ) {
                throw new RepositoryConflictError(
                    'La finalizzazione non possiede più la lease dell’upload.',
                    'PHOTO_UPLOAD_LEASE_LOST',
                    { uploadIntentId: intentId }
                );
            }
            if (String(photo.mediaGeneration || '') !== intent.leaseGeneration) {
                throw new RepositoryConflictError(
                    'La generazione finale non appartiene alla lease attiva.',
                    'MEDIA_GENERATION_MISMATCH',
                    { uploadIntentId: intentId }
                );
            }

            const created = await insertPhotoRow(client, photo, {
                creationIntentId: intentId
            });
            await activatePhotoAssets(client, {
                namespace: this.cleanupNamespace,
                photoId: intent.photoId,
                generation: intent.leaseGeneration,
                uploadIntentId: intentId,
                replacedReason: 'photo-creation-replaced'
            });
            await client.query(
                `UPDATE photo_creation_intents
                 SET status = 'completed',
                     lease_id = NULL,
                     lease_generation = NULL,
                     lease_expires_at = NULL,
                     completed_generation = $2,
                     completed_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1::uuid`,
                [intentId, intent.leaseGeneration]
            );
            const createdWithAssets = await attachActiveAssets(
                client,
                this.cleanupNamespace,
                created
            );
            await insertAuditEvent(client, {
                entityType: 'photo',
                entityId: created.id,
                operation: 'photo.create',
                afterState: createdWithAssets,
                operationId: intentId,
                metadata: {
                    uploadIntentId: intentId,
                    mediaGeneration: intent.leaseGeneration
                }
            });
            return {
                photo: createdWithAssets,
                replayed: false
            };
        }, {
            isolation: 'SERIALIZABLE'
        });
    }

    async release(id, leaseId) {
        const intentId = normalizeUuid(id, 'uploadIntentId');
        const normalizedLeaseId = normalizeUuid(leaseId, 'leaseId');
        return withTransaction(this.pool, async (client) => {
            const result = await client.query(
                `UPDATE photo_creation_intents
                 SET status = 'pending',
                     lease_id = NULL,
                     lease_generation = NULL,
                     lease_expires_at = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1::uuid
                   AND status = 'processing'
                   AND lease_id = $2::uuid
                 RETURNING *`,
                [intentId, normalizedLeaseId]
            );
            if (!result.rows[0]) return null;
            return mapPhotoCreationIntentRow(result.rows[0]);
        });
    }
}

class PostgresSeriesRepository {
    constructor(pool) {
        this.pool = pool;
    }

    async list() {
        const result = await this.pool.query(
            'SELECT * FROM series ORDER BY created_at, id'
        );
        const memberships = await loadMemberships(
            this.pool,
            result.rows.map((row) => String(row.id))
        );
        return result.rows.map((row) => (
            mapSeriesRow(row, memberships.get(String(row.id)) || [])
        ));
    }

    async findByIdentifier(identifier) {
        const normalized = String(identifier ?? '').trim();
        if (!normalized) return null;
        const numericIdentifier = Number(normalized);
        const hasSafeNumericIdentifier = Number.isSafeInteger(numericIdentifier)
            && numericIdentifier > 0;
        const result = hasSafeNumericIdentifier
            ? await this.pool.query(
                'SELECT * FROM series WHERE id = $1 OR slug = $2 LIMIT 1',
                [numericIdentifier, normalized]
            )
            : await this.pool.query(
                'SELECT * FROM series WHERE slug = $1 LIMIT 1',
                [normalized]
            );
        if (!result.rows[0]) return null;
        const id = String(result.rows[0].id);
        const memberships = await loadMemberships(this.pool, [id]);
        return mapSeriesRow(result.rows[0], memberships.get(id) || []);
    }

    async create(seriesRecord, options = {}) {
        const series = normalizeSeriesRecord(seriesRecord);
        normalizePositiveId(series.id, 'seriesId');
        assertContentReferencesMembership(series);
        return withTransaction(this.pool, async (client) => {
            await assertPhotosExist(client, series.photos);
            await client.query(
                `INSERT INTO series (
                    id, title, title_key, slug, description, cover_photo_id,
                    content, published, created_at, updated_at
                 ) VALUES ($1, $2, $3, $4, $5, NULL, $6::jsonb, $7, $8, $9)`,
                [
                    series.id,
                    series.title,
                    normalizeSeriesTitleKey(series.title),
                    series.slug,
                    series.description,
                    JSON.stringify(series.content),
                    series.published,
                    series.createdAt,
                    series.updatedAt
                ]
            );
            await replaceMemberships(client, series.id, series.photos);
            if (series.coverImage !== null) {
                await client.query(
                    'UPDATE series SET cover_photo_id = $2 WHERE id = $1',
                    [series.id, series.coverImage]
                );
            }
            const created = await loadSeriesById(client, series.id);
            await insertAuditEvent(client, {
                entityType: 'series',
                entityId: series.id,
                operation: options.auditOperation || 'series.create',
                afterState: created,
                operationId: options.operationId || null,
                metadata: options.auditMetadata
            });
            return created;
        });
    }

    async updateById(id, changes, options = {}) {
        return this.#mutate(id, options, 'series.update', (current) => {
            const titleChanged = changes.title !== undefined
                && normalizeSeriesTitleKey(changes.title) !== normalizeSeriesTitleKey(current.title);
            const slug = changes.slug !== undefined
                ? changes.slug
                : titleChanged
                    ? createSeriesSlug(changes.title)
                    : current.slug;
            return normalizeSeriesRecord(new Series({
                ...current,
                ...changes,
                id: current.id,
                slug,
                createdAt: current.createdAt,
                updatedAt: new Date().toISOString()
            }).toJSON());
        });
    }

    async deleteById(id, options = {}) {
        const seriesId = normalizePositiveId(id, 'seriesId');
        const expectedVersion = normalizeExpectedVersion(options.expectedVersion);
        return withTransaction(this.pool, async (client) => {
            const current = await loadSeriesById(client, seriesId, { forUpdate: true });
            if (!current) return null;
            if (expectedVersion !== null && current.version !== expectedVersion) {
                throw new VersionConflictError(
                    'series',
                    seriesId,
                    expectedVersion,
                    current.version
                );
            }
            await client.query('DELETE FROM series WHERE id = $1', [seriesId]);
            await insertAuditEvent(client, {
                entityType: 'series',
                entityId: seriesId,
                operation: options.auditOperation || 'series.delete',
                beforeState: current,
                operationId: options.operationId || null,
                metadata: options.auditMetadata
            });
            return current;
        });
    }

    async addPhoto(id, photoId, options = {}) {
        const normalizedPhotoId = normalizePositiveId(photoId, 'photoId');
        return this.#mutate(id, options, 'series.add-photo', (current) => normalizeSeriesRecord({
            ...current,
            photos: current.photos.includes(normalizedPhotoId)
                ? current.photos
                : [...current.photos, normalizedPhotoId],
            updatedAt: new Date().toISOString()
        }));
    }

    async removePhoto(id, photoId, options = {}) {
        const normalizedPhotoId = normalizePositiveId(photoId, 'photoId');
        return this.#mutate(id, options, 'series.remove-photo', (current) => (
            removePhotoReferences(current, normalizedPhotoId)
        ));
    }

    async reorderPhotos(id, photoIds, options = {}) {
        const normalizedIds = photoIds.map((photoId) => normalizePositiveId(photoId, 'photoId'));
        return this.#mutate(id, options, 'series.reorder-photos', (current) => normalizeSeriesRecord({
            ...current,
            photos: normalizedIds,
            updatedAt: new Date().toISOString()
        }));
    }

    async #mutate(id, options, defaultOperation, transform) {
        const seriesId = normalizePositiveId(id, 'seriesId');
        const expectedVersion = normalizeExpectedVersion(options.expectedVersion);
        return withTransaction(this.pool, async (client) => {
            const current = await loadSeriesById(client, seriesId, { forUpdate: true });
            if (!current) return null;
            if (expectedVersion !== null && current.version !== expectedVersion) {
                throw new VersionConflictError(
                    'series',
                    seriesId,
                    expectedVersion,
                    current.version
                );
            }
            const next = transform(current);
            await persistSeriesAggregate(client, next, current.version + 1);
            const updated = await loadSeriesById(client, seriesId);
            await insertAuditEvent(client, {
                entityType: 'series',
                entityId: seriesId,
                operation: options.auditOperation || defaultOperation,
                beforeState: current,
                afterState: updated,
                operationId: options.operationId || null,
                metadata: options.auditMetadata
            });
            return updated;
        });
    }
}

class PostgresAuditRepository {
    constructor(pool) {
        this.pool = pool;
    }

    async list({
        limit = 50,
        beforeId = null,
        entityType = '',
        entityId = null,
        operation = ''
    } = {}) {
        const normalizedLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
        const conditions = [];
        const values = [];
        const addCondition = (sql, value) => {
            values.push(value);
            conditions.push(sql.replace('?', `$${values.length}`));
        };

        if (beforeId !== null && beforeId !== undefined && beforeId !== '') {
            addCondition('id < ?', normalizePositiveId(beforeId, 'beforeId'));
        }
        if (entityType) {
            const normalizedEntityType = String(entityType).trim().toLowerCase();
            if (!['photo', 'series'].includes(normalizedEntityType)) {
                throw new TypeError('entityType audit non valido.');
            }
            addCondition('entity_type = ?', normalizedEntityType);
        }
        if (entityId !== null && entityId !== undefined && entityId !== '') {
            addCondition('entity_id = ?', normalizePositiveId(entityId, 'entityId'));
        }
        if (operation) {
            addCondition('operation = ?', String(operation).trim());
        }
        values.push(normalizedLimit);

        const result = await this.pool.query(
            `SELECT *
             FROM admin_audit_events
             ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
             ORDER BY id DESC
             LIMIT $${values.length}`,
            values
        );
        return result.rows.map(mapAuditRow);
    }

    async findById(id) {
        const auditId = normalizePositiveId(id, 'auditId');
        const result = await this.pool.query(
            'SELECT * FROM admin_audit_events WHERE id = $1',
            [auditId]
        );
        return mapAuditRow(result.rows[0]);
    }
}

class PostgresPortfolioRepository {
    constructor(pool, {
        mediaNamespace = '',
        mediaCleanupGraceMs = DEFAULT_STALE_WRITER_GRACE_MS
    } = {}) {
        if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
            throw new TypeError('PostgresPortfolioRepository richiede un pool PostgreSQL.');
        }
        this.pool = pool;
        this.capabilities = Object.freeze({
            transactions: true,
            optimisticConcurrency: true,
            referentialIntegrity: true,
            perEntityWrites: true,
            distributedMediaMutations: true,
            distributedPhotoCreations: true,
            durableMediaCleanup: true,
            auditHistory: true
        });
        const cleanupOptions = {
            cleanupNamespace: mediaNamespace,
            cleanupGraceMs: mediaCleanupGraceMs
        };
        this.photos = new PostgresPhotoRepository(pool, cleanupOptions);
        this.photoCreations = new PostgresPhotoCreationRepository(pool, cleanupOptions);
        this.mediaCleanup = new PostgresMediaCleanupRepository(pool, {
            namespace: mediaNamespace,
            staleWriterGraceMs: mediaCleanupGraceMs
        });
        this.series = new PostgresSeriesRepository(pool);
        this.audit = new PostgresAuditRepository(pool);
    }

    async deletePhotoWithReferences(photoId, options = {}) {
        const id = normalizePositiveId(photoId, 'photoId');
        const expectedVersion = normalizeExpectedVersion(options.expectedVersion);
        return withTransaction(this.pool, async (client) => {
            const photoResult = await client.query(
                'SELECT * FROM photos WHERE id = $1 FOR UPDATE',
                [id]
            );
            const photo = mapPhotoRow(photoResult.rows[0]);
            if (!photo) return null;
            assertNoActiveMediaOperation(photoResult.rows[0], id);
            if (expectedVersion !== null && photo.version !== expectedVersion) {
                throw new VersionConflictError('photo', id, expectedVersion, photo.version);
            }

            const seriesResult = await client.query(
                `SELECT s.*
                 FROM series s
                 JOIN series_photos sp ON sp.series_id = s.id
                 WHERE sp.photo_id = $1
                 ORDER BY s.id
                 FOR UPDATE OF s`,
                [id]
            );

            for (const row of seriesResult.rows) {
                const current = await loadSeriesById(client, row.id);
                const next = removePhotoReferences(current, id);
                await persistSeriesAggregate(client, next, current.version + 1);
                const updatedSeries = await loadSeriesById(client, row.id);
                await insertAuditEvent(client, {
                    entityType: 'series',
                    entityId: row.id,
                    operation: 'series.photo-delete-cleanup',
                    beforeState: current,
                    afterState: updatedSeries,
                    operationId: options.operationId || null,
                    metadata: {
                        triggerPhotoId: String(id),
                        ...(options.auditMetadata || {})
                    }
                });
            }

            await retireAllActivePhotoAssets(client, {
                namespace: this.mediaCleanup.namespace,
                photoId: id,
                reason: 'photo-delete'
            });
            await client.query('DELETE FROM photos WHERE id = $1', [id]);
            await insertAuditEvent(client, {
                entityType: 'photo',
                entityId: id,
                operation: options.auditOperation || 'photo.delete',
                beforeState: photo,
                operationId: options.operationId || null,
                metadata: options.auditMetadata
            });
            return {
                photo,
                referenceCleanup: {
                    modified: seriesResult.rows.length > 0,
                    modifiedCount: seriesResult.rows.length
                },
                referenceCleanupError: null
            };
        }, {
            isolation: 'SERIALIZABLE'
        });
    }
}

module.exports = {
    PostgresPortfolioRepository,
    extractContentPhotoIds,
    mapPhotoRow,
    mapSeriesRow,
    translatePostgresError,
    withTransaction
};
