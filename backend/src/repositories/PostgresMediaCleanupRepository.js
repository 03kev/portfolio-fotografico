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

function normalizeJobPath(scope, value) {
    const path = String(value || '').trim();
    const expectedPrefix = scope === 'private' ? '/private/' : '/uploads/';
    if (
        !path.startsWith(expectedPrefix)
        || path.includes('\\')
        || path.split('/').includes('..')
        || path.includes('?')
        || path.includes('#')
    ) {
        throw new TypeError(`Path cleanup ${scope} non valido.`);
    }
    return path;
}

function normalizeCleanupJob(job) {
    const scope = String(job?.scope || '').trim();
    if (!['public', 'private'].includes(scope)) {
        throw new TypeError('scope cleanup deve essere "public" oppure "private".');
    }
    const reason = String(job?.reason || '').trim();
    if (!/^[a-z][a-z0-9-]{1,79}$/.test(reason)) {
        throw new TypeError('reason cleanup non valido.');
    }
    const guardType = String(job?.guardType || '').trim();
    if (!['photo-generation', 'creation-staging'].includes(guardType)) {
        throw new TypeError('guardType cleanup non valido.');
    }
    const generation = job?.generation
        ? String(job.generation).trim().toUpperCase()
        : null;
    const photoId = job?.photoId === null || job?.photoId === undefined
        ? null
        : Number(job.photoId);
    const uploadIntentId = job?.uploadIntentId
        ? String(job.uploadIntentId).trim().toLowerCase()
        : null;
    if (guardType === 'photo-generation') {
        if (!Number.isSafeInteger(photoId) || photoId <= 0) {
            throw new TypeError('photoId cleanup non valido.');
        }
        if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(generation || '')) {
            throw new TypeError('generation cleanup non valida.');
        }
    }
    if (
        guardType === 'creation-staging'
        && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uploadIntentId || '')
    ) {
        throw new TypeError('uploadIntentId cleanup non valido.');
    }
    const ownerKey = String(job?.ownerKey || '').trim();
    if (!ownerKey) throw new TypeError('ownerKey cleanup mancante.');
    const namespace = normalizeNamespace(job?.namespace);
    const path = normalizeJobPath(scope, job?.path);
    const dedupeKey = crypto
        .createHash('sha256')
        .update(JSON.stringify([ownerKey, namespace, scope, path]))
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
        namespace,
        scope,
        path,
        reason,
        guardType,
        photoId: guardType === 'photo-generation' ? photoId : null,
        generation: guardType === 'photo-generation' ? generation : null,
        uploadIntentId: guardType === 'creation-staging' ? uploadIntentId : null,
        mediaOperationId: job?.mediaOperationId
            ? String(job.mediaOperationId).trim().toLowerCase()
            : null,
        availableAt: availableAt.toISOString(),
        maxAttempts
    };
}

function mapCleanupJob(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        dedupeKey: row.dedupe_key,
        namespace: row.object_namespace,
        scope: row.storage_scope,
        path: row.logical_path,
        reason: row.reason,
        guardType: row.guard_type,
        photoId: row.photo_id === null ? null : Number(row.photo_id),
        generation: row.generation || null,
        uploadIntentId: row.upload_intent_id
            ? String(row.upload_intent_id)
            : null,
        mediaOperationId: row.media_operation_id
            ? String(row.media_operation_id)
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

async function enqueueMediaCleanupJobs(queryable, jobs) {
    const normalizedJobs = (Array.isArray(jobs) ? jobs : [])
        .filter(Boolean)
        .map(normalizeCleanupJob);
    const inserted = [];
    for (const job of normalizedJobs) {
        const result = await queryable.query(
            `INSERT INTO media_cleanup_jobs (
                dedupe_key, object_namespace, storage_scope, logical_path,
                reason, guard_type, photo_id, generation, upload_intent_id,
                media_operation_id, available_at, max_attempts
             ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9::uuid,
                $10::uuid, $11::timestamptz, $12
             )
             ON CONFLICT (dedupe_key) DO NOTHING
             RETURNING *`,
            [
                job.dedupeKey,
                job.namespace,
                job.scope,
                job.path,
                job.reason,
                job.guardType,
                job.photoId,
                job.generation,
                job.uploadIntentId,
                job.mediaOperationId,
                job.availableAt,
                job.maxAttempts
            ]
        );
        if (result.rows[0]) inserted.push(mapCleanupJob(result.rows[0]));
    }
    return inserted;
}

async function cancelMediaOperationCleanupJobs(queryable, operationId, message) {
    await queryable.query(
        `UPDATE media_cleanup_jobs
         SET status = 'cancelled',
             lease_id = NULL,
             lease_expires_at = NULL,
             last_error_code = 'ACTIVE_GENERATION_PROTECTED',
             last_error_message = $2,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE media_operation_id = $1::uuid
           AND status IN ('pending', 'processing')`,
        [operationId, message]
    );
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

async function cancelClaimedJob(client, jobId, message) {
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
        job: mapCleanupJob(result.rows[0])
    };
}

async function rescheduleClaimedJob(client, jobId, protectedUntil, graceMs) {
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
        job: mapCleanupJob(result.rows[0])
    };
}

async function failExhaustedLease(client, jobId) {
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
        job: mapCleanupJob(result.rows[0])
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
                `SELECT *
                 FROM media_cleanup_jobs
                 WHERE object_namespace = $1
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
                 ORDER BY available_at, id
                 LIMIT 1`,
                [this.namespace]
            );
            const candidateRow = candidate.rows[0];
            if (!candidateRow) return null;

            let photo = null;
            let creation = null;
            let intent = null;
            if (candidateRow.guard_type === 'photo-generation') {
                const creationResult = await client.query(
                    `SELECT lease_generation, lease_expires_at,
                            lease_expires_at > CURRENT_TIMESTAMP AS lease_active
                     FROM photo_creation_intents
                     WHERE photo_id = $1
                       AND status = 'processing'
                     FOR UPDATE`,
                    [candidateRow.photo_id]
                );
                creation = creationResult.rows[0] || null;
                const photoResult = await client.query(
                    `SELECT media_generation, media_operation_generation,
                            media_operation_expires_at,
                            media_operation_expires_at > CURRENT_TIMESTAMP
                                AS media_operation_active
                     FROM photos
                     WHERE id = $1
                     FOR UPDATE`,
                    [candidateRow.photo_id]
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
                    [candidateRow.upload_intent_id]
                );
                intent = intentResult.rows[0] || null;
            }

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

            if (row.guard_type === 'photo-generation') {
                if (photo?.media_generation === row.generation) {
                    return cancelClaimedJob(
                        client,
                        row.id,
                        'La generazione è attualmente pubblicata dalla foto.'
                    );
                }
                if (
                    photo?.media_operation_generation === row.generation
                    && photo?.media_operation_active
                ) {
                    return rescheduleClaimedJob(
                        client,
                        row.id,
                        photo.media_operation_expires_at,
                        this.staleWriterGraceMs
                    );
                }
                if (
                    creation?.lease_generation === row.generation
                    && creation?.lease_active
                ) {
                    return rescheduleClaimedJob(
                        client,
                        row.id,
                        creation.lease_expires_at,
                        this.staleWriterGraceMs
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
                            this.staleWriterGraceMs
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
                return failExhaustedLease(client, row.id);
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
                job: mapCleanupJob(claimed.rows[0])
            };
        });
    }

    async complete(jobId, leaseId) {
        const result = await this.pool.query(
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
        return mapCleanupJob(result.rows[0]);
    }

    async fail(jobId, leaseId, {
        code,
        message,
        permanent = false,
        retryAt
    }) {
        return runTransaction(this.pool, async (client) => {
            const locked = await client.query(
                `SELECT *
                 FROM media_cleanup_jobs
                 WHERE id = $1
                 FOR UPDATE`,
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
            return mapCleanupJob(result.rows[0]);
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
                `SELECT *
                 FROM media_cleanup_jobs
                 WHERE status = 'failed'
                   AND object_namespace = $2
                 ORDER BY updated_at DESC, id DESC
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
    cancelMediaOperationCleanupJobs,
    enqueueMediaCleanupJobs
};
