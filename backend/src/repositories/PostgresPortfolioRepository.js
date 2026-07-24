const Series = require('../models/Series');
const {
    createSeriesSlug,
    normalizeSeriesRecord,
    normalizeSeriesTitleKey
} = require('../services/seriesRecord');
const {
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
    sourcePath: ['source_path', (value) => String(value)],
    sourceContentType: ['source_content_type', (value) => String(value)],
    mobileImage: ['mobile_image', Boolean],
    updatedAt: ['updated_at_ms', Number],
    derivativesVersion: ['derivatives_version', Number]
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

function mapPhotoRow(row) {
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
        sourcePath: row.source_path,
        sourceContentType: row.source_content_type,
        mobileImage: row.mobile_image,
        updatedAt: Number(row.updated_at_ms),
        derivativesVersion: Number(row.derivatives_version),
        version: Number(row.version)
    };
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

function createdAtFromId(id) {
    const date = new Date(Number(id));
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
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
            photos_source_path_unique: 'PHOTO_SOURCE_PATH_CONFLICT',
            series_pkey: 'SERIES_ID_CONFLICT',
            series_title_key_unique: 'SERIES_TITLE_CONFLICT',
            series_slug_unique: 'SERIES_SLUG_CONFLICT',
            series_photos_pkey: 'SERIES_PHOTO_CONFLICT'
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
        const invalid = new Error('I dati non rispettano i vincoli del modello.');
        invalid.status = 400;
        invalid.code = 'CHECK_CONSTRAINT_VIOLATION';
        invalid.details = { constraint: error.constraint };
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
    constructor(pool) {
        this.pool = pool;
    }

    async list() {
        const result = await this.pool.query(
            'SELECT * FROM photos ORDER BY created_at DESC, id DESC'
        );
        return result.rows.map(mapPhotoRow);
    }

    async findById(id) {
        const photoId = normalizePositiveId(id, 'photoId');
        const result = await this.pool.query('SELECT * FROM photos WHERE id = $1', [photoId]);
        return mapPhotoRow(result.rows[0]);
    }

    async create(photo, _options = {}) {
        const photoId = normalizePositiveId(photo?.id, 'photoId');
        try {
            const result = await this.pool.query(
                `INSERT INTO photos (
                    id, title, description, date_taken, location_name,
                    latitude, longitude, camera, lens, resolution, settings,
                    tags, source_path, source_content_type, mobile_image,
                    updated_at_ms, derivatives_version, created_at
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb,
                    $12, $13, $14, $15, $16, $17, $18
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
                    photo.sourcePath || '',
                    photo.sourceContentType || '',
                    Boolean(photo.mobileImage),
                    Number(photo.updatedAt) || 0,
                    Number(photo.derivativesVersion) || photoId,
                    createdAtFromId(photoId)
                ]
            );
            return mapPhotoRow(result.rows[0]);
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
        if (expectedVersion !== null) values.push(expectedVersion);
        let result;
        try {
            result = await this.pool.query(
                `UPDATE photos
                 SET ${assignments.join(', ')}
                 WHERE id = $1
                 ${expectedVersion === null ? '' : `AND version = $${values.length}`}
                 RETURNING *`,
                values
            );
        } catch (error) {
            throw translatePostgresError(error);
        }
        if (result.rows[0]) return mapPhotoRow(result.rows[0]);

        const current = await this.findById(photoId);
        if (!current) return null;
        throw new VersionConflictError('photo', photoId, expectedVersion, current.version);
    }

    async deleteById(id, options = {}) {
        const photoId = normalizePositiveId(id, 'photoId');
        const expectedVersion = normalizeExpectedVersion(options.expectedVersion);
        const values = [photoId];
        if (expectedVersion !== null) values.push(expectedVersion);
        const result = await this.pool.query(
            `DELETE FROM photos
             WHERE id = $1
             ${expectedVersion === null ? '' : 'AND version = $2'}
             RETURNING *`,
            values
        );
        if (result.rows[0]) return mapPhotoRow(result.rows[0]);
        const current = await this.findById(photoId);
        if (!current) return null;
        throw new VersionConflictError('photo', photoId, expectedVersion, current.version);
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

    async create(seriesRecord, _options = {}) {
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
            return loadSeriesById(client, series.id);
        });
    }

    async updateById(id, changes, options = {}) {
        return this.#mutate(id, options, (current) => {
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
            return current;
        });
    }

    async addPhoto(id, photoId, options = {}) {
        const normalizedPhotoId = normalizePositiveId(photoId, 'photoId');
        return this.#mutate(id, options, (current) => normalizeSeriesRecord({
            ...current,
            photos: current.photos.includes(normalizedPhotoId)
                ? current.photos
                : [...current.photos, normalizedPhotoId],
            updatedAt: new Date().toISOString()
        }));
    }

    async removePhoto(id, photoId, options = {}) {
        const normalizedPhotoId = normalizePositiveId(photoId, 'photoId');
        return this.#mutate(id, options, (current) => (
            removePhotoReferences(current, normalizedPhotoId)
        ));
    }

    async reorderPhotos(id, photoIds, options = {}) {
        const normalizedIds = photoIds.map((photoId) => normalizePositiveId(photoId, 'photoId'));
        return this.#mutate(id, options, (current) => normalizeSeriesRecord({
            ...current,
            photos: normalizedIds,
            updatedAt: new Date().toISOString()
        }));
    }

    async #mutate(id, options, transform) {
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
            return loadSeriesById(client, seriesId);
        });
    }
}

class PostgresPortfolioRepository {
    constructor(pool) {
        if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
            throw new TypeError('PostgresPortfolioRepository richiede un pool PostgreSQL.');
        }
        this.pool = pool;
        this.capabilities = Object.freeze({
            transactions: true,
            optimisticConcurrency: true,
            referentialIntegrity: true,
            perEntityWrites: true
        });
        this.photos = new PostgresPhotoRepository(pool);
        this.series = new PostgresSeriesRepository(pool);
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
            }

            await client.query('DELETE FROM photos WHERE id = $1', [id]);
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
    withTransaction
};
