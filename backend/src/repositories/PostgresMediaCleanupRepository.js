const crypto = require('node:crypto');
const {
    isValidR2ObjectPrefix,
    normalizeR2ObjectPrefix
} = require('../utils/r2ObjectNamespace');

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_LEASE_TTL_MS = 60_000;
const DEFAULT_STALE_WRITER_GRACE_MS = 60 * 60 * 1000;

function normalizeNamespace(value) {
    const normalized = normalizeR2ObjectPrefix(value);
    if (!isValidR2ObjectPrefix(normalized)) {
        throw new TypeError('Namespace cleanup R2 non valido.');
    }
    return normalized;
}

function normalizeCleanupJob(job) {
    const assetId = Number(job?.assetId);
    if (!Number.isSafeInteger(assetId) || assetId <= 0) {
        throw new TypeError('assetId cleanup non valido.');
    }
    const reason = String(job?.reason || '').trim();
    if (!/^[a-z][a-z0-9-]{1,79}$/.test(reason)) {
        throw new TypeError('reason cleanup non valido.');
    }
    const ownerKey = String(job?.ownerKey || '').trim();
    if (!ownerKey) throw new TypeError('ownerKey cleanup mancante.');
    const namespace = normalizeNamespace(job?.namespace);
    const dedupeKey = crypto
        .createHash('sha256')
        .update(JSON.stringify([ownerKey, namespace, assetId]))
        .digest('hex');
    const availableAt = job?.availableAt
        ? new Date(job.availableAt)
        : new Date();
    if (Number.isNaN(availableAt.getTime())) {
        throw new TypeError('availableAt cleanup non valido.');
    }
    const maxAttempts = Number(job?.maxAttempts || DEFAULT_MAX_ATTEMPTS);
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
        throw new TypeError('maxAttempts cleanup non valido.');
    }

    return {
        dedupeKey,
        assetId,
        namespace,
        reason,
        availableAt: availableAt.toISOString(),
        maxAttempts
    };
}

function mapCleanupJob(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        assetId: Number(row.asset_id),
        dedupeKey: row.dedupe_key,
        namespace: row.object_namespace,
        scope: row.asset_storage_scope,
        path: row.asset_logical_path,
        role: row.asset_role || null,
        assetState: row.asset_state || null,
        reason: row.reason,
        guardType: row.asset_role === 'creation-source' && !row.asset_generation
            ? 'creation-staging'
            : 'photo-generation',
        photoId: row.asset_photo_id === null
            ? null
            : Number(row.asset_photo_id),
        generation: row.asset_generation || null,
        uploadIntentId: row.asset_upload_intent_id
            ? String(row.asset_upload_intent_id)
            : null,
        mediaOperationId: row.asset_media_operation_id
            ? String(row.asset_media_operation_id)
            : null,
        status: row.status,
        attempts: Number(row.attempts),
        maxAttempts: Number(row.max_attempts),
        availableAt: new Date(row.available_at).toISOString(),
        leaseId: row.lease_id ? String(row.lease_id) : null,
        leaseExpiresAt: row.lease_expires_at
            ? new Date(row.lease_expires_at).toISOString()
            : null,
        lastErrorCode: row.last_error_code || null,
        lastErrorMessage: row.last_error_message || null,
        completedAt: row.completed_at
            ? new Date(row.completed_at).toISOString()
            : null,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString()
    };
}

function withAssetFields(row, asset) {
    if (!row || !asset) return row;
    return {
        ...row,
        asset_storage_scope: asset.storage_scope,
        asset_logical_path: asset.logical_path,
        asset_role: asset.role,
        asset_state: asset.state,
        asset_photo_id: asset.photo_id,
        asset_generation: asset.generation,
        asset_upload_intent_id: asset.owner_upload_intent_id,
        asset_media_operation_id: asset.owner_media_operation_id
    };
}

async function enqueueMediaCleanupJobs(queryable, jobs) {
    const normalizedJobs = (Array.isArray(jobs) ? jobs : [])
        .filter(Boolean)
        .map(normalizeCleanupJob);
    const inserted = [];
    for (const job of normalizedJobs) {
        const result = await queryable.query(
            `WITH inserted AS (
                INSERT INTO media_cleanup_jobs (
                    asset_id, dedupe_key, object_namespace, reason,
                    available_at, max_attempts
                )
                SELECT a.id, $2, $3, $4, $5::timestamptz, $6
                FROM photo_assets a
                WHERE a.id = $1
                  AND a.object_namespace = $3
                ON CONFLICT (dedupe_key) DO UPDATE
                SET status = 'pending',
                    reason = EXCLUDED.reason,
                    available_at = EXCLUDED.available_at,
                    attempts = 0,
                    max_attempts = EXCLUDED.max_attempts,
                    lease_id = NULL,
                    lease_expires_at = NULL,
                    last_error_code = NULL,
                    last_error_message = NULL,
                    completed_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE media_cleanup_jobs.status = 'cancelled'
                  AND EXISTS (
                      SELECT 1
                      FROM photo_assets owned_asset
                      WHERE owned_asset.id = EXCLUDED.asset_id
                        AND owned_asset.state IN ('planned', 'retired')
                  )
                RETURNING *
             )
             SELECT inserted.*,
                    a.storage_scope AS asset_storage_scope,
                    a.logical_path AS asset_logical_path,
                    a.role AS asset_role,
                    a.state AS asset_state,
                    a.photo_id AS asset_photo_id,
                    a.generation AS asset_generation,
                    a.owner_upload_intent_id AS asset_upload_intent_id,
                    a.owner_media_operation_id AS asset_media_operation_id
             FROM inserted
             JOIN photo_assets a ON a.id = inserted.asset_id`,
            [
                job.assetId,
                job.dedupeKey,
                job.namespace,
                job.reason,
                job.availableAt,
                job.maxAttempts
            ]
        );
        if (result.rows[0]) inserted.push(mapCleanupJob(result.rows[0]));
    }
    return inserted;
}

async function runTransaction(pool, callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function cancelClaimedJob(client, jobId, message, asset) {
    const result = await client.query(
        `UPDATE media_cleanup_jobs
         SET status = 'cancelled',
             lease_id = NULL,
             lease_expires_at = NULL,
             last_error_code = 'ACTIVE_GENERATION_PROTECTED',
             last_error_message = $2,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [jobId, message]
    );
    return {
        action: 'cancelled',
        job: mapCleanupJob(withAssetFields(result.rows[0], asset))
    };
}

async function rescheduleClaimedJob(client, jobId, protectedUntil, graceMs, asset) {
    const result = await client.query(
        `UPDATE media_cleanup_jobs
         SET status = 'pending',
             available_at = GREATEST(
                 $2::timestamptz + ($3::bigint * INTERVAL '1 millisecond'),
                 CURRENT_TIMESTAMP + INTERVAL '1 minute'
             ),
             lease_id = NULL,
             lease_expires_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [jobId, protectedUntil, graceMs]
    );
    return {
        action: 'deferred',
        job: mapCleanupJob(withAssetFields(result.rows[0], asset))
    };
}

async function failExhaustedLease(client, jobId, asset) {
    const result = await client.query(
        `UPDATE media_cleanup_jobs
         SET status = 'failed',
             lease_id = NULL,
             lease_expires_at = NULL,
             last_error_code = 'CLEANUP_LEASE_EXPIRED',
             last_error_message =
                 'La lease è scaduta dopo aver raggiunto il numero massimo di tentativi.',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND status = 'processing'
           AND lease_expires_at <= CURRENT_TIMESTAMP
           AND attempts >= max_attempts
         RETURNING *`,
        [jobId]
    );
    return {
        action: 'failed',
        job: mapCleanupJob(withAssetFields(result.rows[0], asset))
    };
}

class PostgresMediaCleanupRepository {
    constructor(pool, {
        namespace = '',
        staleWriterGraceMs = DEFAULT_STALE_WRITER_GRACE_MS
    } = {}) {
        this.pool = pool;
        this.namespace = normalizeNamespace(namespace);
        this.staleWriterGraceMs = Math.max(
            60_000,
            Number(staleWriterGraceMs) || DEFAULT_STALE_WRITER_GRACE_MS
        );
    }

    async enqueue(jobs) {
        return runTransaction(
            this.pool,
            (client) => enqueueMediaCleanupJobs(client, jobs)
        );
    }

    async claimNext({
        leaseId,
        leaseTtlMs = DEFAULT_LEASE_TTL_MS
    }) {
        const normalizedLeaseId = String(leaseId || '').trim().toLowerCase();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalizedLeaseId)) {
            throw new TypeError('leaseId cleanup non valido.');
        }
        const normalizedLeaseTtlMs = Math.max(
            10_000,
            Math.min(Number(leaseTtlMs) || DEFAULT_LEASE_TTL_MS, 10 * 60_000)
        );
        return runTransaction(this.pool, async (client) => {
            const candidate = await client.query(
                `SELECT j.*,
                        a.storage_scope AS asset_storage_scope,
                        a.logical_path AS asset_logical_path,
                        a.role AS asset_role,
                        a.state AS asset_state,
                        a.photo_id AS asset_photo_id,
                        a.generation AS asset_generation,
                        a.owner_upload_intent_id AS asset_upload_intent_id,
                        a.owner_media_operation_id AS asset_media_operation_id
                 FROM media_cleanup_jobs j
                 JOIN photo_assets a ON a.id = j.asset_id
                 WHERE j.object_namespace = $1
                   AND (
                       (
                           j.status = 'pending'
                           AND j.attempts < j.max_attempts
                           AND j.available_at <= CURRENT_TIMESTAMP
                       )
                       OR
                       (
                           j.status = 'processing'
                           AND j.lease_expires_at <= CURRENT_TIMESTAMP
                       )
                   )
                 ORDER BY j.available_at, j.id
                 LIMIT 1`,
                [this.namespace]
            );
            const candidateRow = candidate.rows[0];
            if (!candidateRow) return null;

            let photo = null;
            let creation = null;
            let intent = null;
            if (candidateRow.asset_media_operation_id || candidateRow.asset_generation) {
                const creationResult = await client.query(
                    `SELECT lease_id, lease_generation, lease_expires_at,
                            lease_expires_at > CURRENT_TIMESTAMP AS lease_active
                     FROM photo_creation_intents
                     WHERE photo_id = $1
                       AND status = 'processing'
                     FOR UPDATE`,
                    [candidateRow.asset_photo_id]
                );
                creation = creationResult.rows[0] || null;
                const photoResult = await client.query(
                    `SELECT media_generation, media_operation_id,
                            media_operation_generation,
                            media_operation_expires_at,
                            media_operation_expires_at > CURRENT_TIMESTAMP
                                AS media_operation_active
                     FROM photos
                     WHERE id = $1
                     FOR UPDATE`,
                    [candidateRow.asset_photo_id]
                );
                photo = photoResult.rows[0] || null;
            } else {
                const intentResult = await client.query(
                    `SELECT status, expires_at, lease_expires_at,
                            GREATEST(expires_at, lease_expires_at)
                                > CURRENT_TIMESTAMP AS cleanup_protected
                     FROM photo_creation_intents
                     WHERE id = $1::uuid
                     FOR UPDATE`,
                    [candidateRow.asset_upload_intent_id]
                );
                intent = intentResult.rows[0] || null;
            }

            const assetResult = await client.query(
                `SELECT * FROM photo_assets WHERE id = $1 FOR UPDATE`,
                [candidateRow.asset_id]
            );
            const asset = assetResult.rows[0];
            if (!asset) return null;

            // Domain transactions lock the creation intent (when present)
            // and/or photo before touching cleanup rows. Preserve that order
            // here to avoid deadlocks and re-read the photo after a creation
            // finalization that was in flight.
            const locked = await client.query(
                `SELECT *
                 FROM media_cleanup_jobs
                 WHERE id = $1
                   AND object_namespace = $2
                   AND (
                       (
                           status = 'pending'
                           AND attempts < max_attempts
                           AND available_at <= CURRENT_TIMESTAMP
                       )
                       OR
                       (
                           status = 'processing'
                           AND lease_expires_at <= CURRENT_TIMESTAMP
                       )
                   )
                 FOR UPDATE SKIP LOCKED`,
                [candidateRow.id, this.namespace]
            );
            const row = locked.rows[0];
            if (!row) return null;

            if (asset.state === 'active') {
                return cancelClaimedJob(
                    client,
                    row.id,
                    'L’asset è attualmente attivo e non può essere eliminato.',
                    asset
                );
            }
            if (asset.state === 'deleted') {
                return cancelClaimedJob(
                    client,
                    row.id,
                    'L’asset risulta già eliminato.',
                    asset
                );
            }
            if (asset.generation) {
                if (photo?.media_generation === asset.generation && asset.state !== 'retired') {
                    return cancelClaimedJob(
                        client,
                        row.id,
                        'La generazione è attualmente pubblicata dalla foto.',
                        asset
                    );
                }
                if (
                    photo?.media_operation_generation === asset.generation
                    && String(photo?.media_operation_id || '') === String(asset.owner_media_operation_id || '')
                    && photo?.media_operation_active
                ) {
                    return rescheduleClaimedJob(
                        client,
                        row.id,
                        photo.media_operation_expires_at,
                        this.staleWriterGraceMs,
                        asset
                    );
                }
                if (
                    creation?.lease_generation === asset.generation
                    && String(creation?.lease_id || '') === String(asset.owner_media_operation_id || '')
                    && creation?.lease_active
                ) {
                    return rescheduleClaimedJob(
                        client,
                        row.id,
                        creation.lease_expires_at,
                        this.staleWriterGraceMs,
                        asset
                    );
                }
            } else {
                if (intent && intent.status !== 'completed') {
                    const protectedUntil = [intent.expires_at, intent.lease_expires_at]
                        .filter(Boolean)
                        .map((value) => new Date(value))
                        .sort((a, b) => b.getTime() - a.getTime())[0];
                    if (protectedUntil && intent.cleanup_protected) {
                        return rescheduleClaimedJob(
                            client,
                            row.id,
                            protectedUntil,
                            this.staleWriterGraceMs,
                            asset
                        );
                    }
                }
            }

            // attempts counts executor acquisitions. Ownership guards run
            // first so an active winner is still cancelled/deferred instead
            // of being reported as a cleanup failure.
            if (
                row.status === 'processing'
                && Number(row.attempts) >= Number(row.max_attempts)
            ) {
                return failExhaustedLease(client, row.id, asset);
            }

            // Fence publication before the executor leaves the transaction to
            // perform the R2 delete. Activation only accepts planned assets, so
            // a stale writer cannot publish an object already being removed.
            if (asset.state !== 'deleting') {
                await client.query(
                    `UPDATE photo_assets
                     SET state = 'deleting',
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [asset.id]
                );
                asset.state = 'deleting';
            }

            const claimed = await client.query(
                `UPDATE media_cleanup_jobs
                 SET status = 'processing',
                     attempts = attempts + 1,
                     lease_id = $2::uuid,
                     lease_expires_at = CURRENT_TIMESTAMP
                         + ($3::bigint * INTERVAL '1 millisecond'),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                 RETURNING *`,
                [row.id, normalizedLeaseId, normalizedLeaseTtlMs]
            );
            return {
                action: 'claimed',
                job: mapCleanupJob(withAssetFields(claimed.rows[0], asset))
            };
        });
    }

    async complete(jobId, leaseId) {
        return runTransaction(this.pool, async (client) => {
            const locked = await client.query(
                `SELECT *
                 FROM media_cleanup_jobs
                 WHERE id = $1
                   AND status = 'processing'
                   AND lease_id = $2::uuid
                 FOR UPDATE`,
                [jobId, leaseId]
            );
            const row = locked.rows[0];
            if (!row) return null;
            const deletedAsset = await client.query(
                `UPDATE photo_assets
                 SET state = 'deleted',
                     deleted_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                   AND state = 'deleting'
                 RETURNING *`,
                [row.asset_id]
            );
            if (!deletedAsset.rows[0]) {
                throw new Error('Lo stato dell’asset non consente di completare il cleanup.');
            }
            const result = await client.query(
                `UPDATE media_cleanup_jobs
                 SET status = 'succeeded',
                     lease_id = NULL,
                     lease_expires_at = NULL,
                     last_error_code = NULL,
                     last_error_message = NULL,
                     completed_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                   AND status = 'processing'
                   AND lease_id = $2::uuid
                 RETURNING *`,
                [jobId, leaseId]
            );
            return mapCleanupJob(withAssetFields(result.rows[0], deletedAsset.rows[0]));
        });
    }

    async fail(jobId, leaseId, {
        code,
        message,
        permanent = false,
        retryAt
    }) {
        return runTransaction(this.pool, async (client) => {
            const locked = await client.query(
                `SELECT j.*,
                        a.storage_scope AS asset_storage_scope,
                        a.logical_path AS asset_logical_path,
                        a.role AS asset_role,
                        a.state AS asset_state,
                        a.photo_id AS asset_photo_id,
                        a.generation AS asset_generation,
                        a.owner_upload_intent_id AS asset_upload_intent_id,
                        a.owner_media_operation_id AS asset_media_operation_id
                 FROM media_cleanup_jobs j
                 JOIN photo_assets a ON a.id = j.asset_id
                 WHERE j.id = $1
                 FOR UPDATE OF j`,
                [jobId]
            );
            const row = locked.rows[0];
            if (
                !row
                || row.status !== 'processing'
                || String(row.lease_id || '') !== String(leaseId || '')
            ) {
                return null;
            }
            const terminal = permanent || Number(row.attempts) >= Number(row.max_attempts);
            const result = await client.query(
                `UPDATE media_cleanup_jobs
                 SET status = $3::varchar,
                     available_at = CASE
                         WHEN $3::varchar = 'pending' THEN $4::timestamptz
                         ELSE available_at
                     END,
                     lease_id = NULL,
                     lease_expires_at = NULL,
                     last_error_code = $5,
                     last_error_message = $6,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                   AND lease_id = $2::uuid
                 RETURNING *`,
                [
                    jobId,
                    leaseId,
                    terminal ? 'failed' : 'pending',
                    retryAt,
                    String(code || 'R2_DELETE_FAILED').slice(0, 120),
                    String(message || 'Eliminazione R2 non riuscita.').slice(0, 4000)
                ]
            );
            return mapCleanupJob({ ...row, ...result.rows[0] });
        });
    }

    async getStatus({ failedLimit = 25 } = {}) {
        const [counts, failed] = await Promise.all([
            this.pool.query(
                `SELECT status, COUNT(*)::bigint AS count
                 FROM media_cleanup_jobs
                 WHERE object_namespace = $1
                 GROUP BY status`,
                [this.namespace]
            ),
            this.pool.query(
                `SELECT j.*,
                        a.storage_scope AS asset_storage_scope,
                        a.logical_path AS asset_logical_path,
                        a.role AS asset_role,
                        a.state AS asset_state,
                        a.photo_id AS asset_photo_id,
                        a.generation AS asset_generation,
                        a.owner_upload_intent_id AS asset_upload_intent_id,
                        a.owner_media_operation_id AS asset_media_operation_id
                 FROM media_cleanup_jobs j
                 JOIN photo_assets a ON a.id = j.asset_id
                 WHERE j.status = 'failed'
                   AND j.object_namespace = $2
                 ORDER BY j.updated_at DESC, j.id DESC
                 LIMIT $1`,
                [
                    Math.max(1, Math.min(Number(failedLimit) || 25, 100)),
                    this.namespace
                ]
            )
        ]);
        return {
            counts: {
                pending: 0,
                processing: 0,
                succeeded: 0,
                failed: 0,
                cancelled: 0,
                ...Object.fromEntries(
                    counts.rows.map((row) => [row.status, Number(row.count)])
                )
            },
            failed: failed.rows.map(mapCleanupJob)
        };
    }
}

module.exports = {
    DEFAULT_STALE_WRITER_GRACE_MS,
    PostgresMediaCleanupRepository,
    enqueueMediaCleanupJobs
};
