const crypto = require('node:crypto');

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_TTL_MS = 60_000;
const DEFAULT_RETRY_BASE_MS = 30_000;
const DEFAULT_RETRY_MAX_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIME_BUDGET_MS = 10_000;
const DEFAULT_DELETE_TIMEOUT_MS = 8_000;
const MIN_COMPLETION_RESERVE_MS = 250;

function describeCleanupError(error) {
    const status = Number(
        error?.$metadata?.httpStatusCode
        || error?.statusCode
        || error?.status
        || 0
    );
    const code = String(
        error?.code
        || error?.Code
        || error?.name
        || 'R2_DELETE_FAILED'
    );
    const permanent = (
        status >= 400
        && status < 500
        && ![408, 409, 425, 429].includes(status)
    ) || [
        'InvalidAccessKeyId',
        'AccessDenied',
        'InvalidBucketName',
        'InvalidArgument'
    ].includes(code);
    return {
        code,
        message: String(error?.message || 'Eliminazione R2 non riuscita.'),
        permanent
    };
}

function computeBackoffMs(attempt, {
    baseMs = DEFAULT_RETRY_BASE_MS,
    maxMs = DEFAULT_RETRY_MAX_MS
} = {}) {
    const exponent = Math.max(0, Number(attempt || 1) - 1);
    return Math.min(
        Math.max(1, Number(maxMs) || DEFAULT_RETRY_MAX_MS),
        Math.max(1, Number(baseMs) || DEFAULT_RETRY_BASE_MS) * (2 ** exponent)
    );
}

class MediaCleanupExecutor {
    constructor({
        repository,
        namespace = '',
        deletePublicObject,
        deletePrivateObject,
        createLeaseId = () => crypto.randomUUID(),
        now = () => Date.now(),
        leaseTtlMs = DEFAULT_LEASE_TTL_MS,
        retryBaseMs = DEFAULT_RETRY_BASE_MS,
        retryMaxMs = DEFAULT_RETRY_MAX_MS,
        deleteTimeoutMs = DEFAULT_DELETE_TIMEOUT_MS
    }) {
        if (!repository?.mediaCleanup) {
            throw new TypeError('MediaCleanupExecutor richiede un repository cleanup durevole.');
        }
        if (
            typeof deletePublicObject !== 'function'
            || typeof deletePrivateObject !== 'function'
        ) {
            throw new TypeError('Le funzioni di eliminazione R2 sono obbligatorie.');
        }
        this.repository = repository;
        this.namespace = String(namespace || '').trim().replace(/^\/+|\/+$/g, '');
        this.deletePublicObject = deletePublicObject;
        this.deletePrivateObject = deletePrivateObject;
        this.createLeaseId = createLeaseId;
        this.now = now;
        this.leaseTtlMs = leaseTtlMs;
        this.retryBaseMs = retryBaseMs;
        this.retryMaxMs = retryMaxMs;
        this.deleteTimeoutMs = Math.max(
            250,
            Number(deleteTimeoutMs) || DEFAULT_DELETE_TIMEOUT_MS
        );
    }

    async executeJob(job, leaseId, { timeoutMs = this.deleteTimeoutMs } = {}) {
        if (job.namespace !== this.namespace) {
            const mismatch = new Error(
                `Namespace job "${job.namespace}" diverso dal runtime "${this.namespace}".`
            );
            mismatch.code = 'CLEANUP_NAMESPACE_MISMATCH';
            mismatch.permanent = true;
            throw mismatch;
        }
        const abortController = new AbortController();
        const timeout = setTimeout(
            () => abortController.abort(),
            Math.max(1, Number(timeoutMs) || this.deleteTimeoutMs)
        );
        try {
            const deleteOptions = { abortSignal: abortController.signal };
            if (job.scope === 'private') {
                await this.deletePrivateObject(job.path, deleteOptions);
            } else {
                await this.deletePublicObject(job.path, deleteOptions);
            }
        } catch (error) {
            if (abortController.signal.aborted) {
                const timeoutError = new Error(
                    'Eliminazione R2 interrotta per rispettare il budget serverless.'
                );
                timeoutError.code = 'CLEANUP_DELETE_TIMEOUT';
                timeoutError.cause = error;
                throw timeoutError;
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
        const completed = await this.repository.mediaCleanup.complete(job.id, leaseId);
        if (!completed) {
            const error = new Error(
                'La lease del cleanup è scaduta o è stata acquisita da un altro executor.'
            );
            error.code = 'CLEANUP_LEASE_LOST';
            throw error;
        }
        return completed;
    }

    async runBatch({
        limit = DEFAULT_BATCH_SIZE,
        timeBudgetMs = DEFAULT_TIME_BUDGET_MS
    } = {}) {
        const normalizedLimit = Math.max(
            1,
            Math.min(Number(limit) || DEFAULT_BATCH_SIZE, 100)
        );
        const normalizedTimeBudgetMs = Math.max(
            500,
            Math.min(Number(timeBudgetMs) || DEFAULT_TIME_BUDGET_MS, 5 * 60_000)
        );
        const deadline = this.now() + normalizedTimeBudgetMs;
        const summary = {
            claimed: 0,
            succeeded: 0,
            retried: 0,
            failed: 0,
            cancelled: 0,
            deferred: 0,
            timeBudgetReached: false
        };

        for (let index = 0; index < normalizedLimit; index += 1) {
            if (deadline - this.now() <= MIN_COMPLETION_RESERVE_MS) {
                summary.timeBudgetReached = true;
                break;
            }
            const leaseId = this.createLeaseId();
            const claim = await this.repository.mediaCleanup.claimNext({
                leaseId,
                leaseTtlMs: this.leaseTtlMs
            });
            if (!claim) break;
            if (claim.action === 'cancelled') {
                summary.cancelled += 1;
                continue;
            }
            if (claim.action === 'deferred') {
                summary.deferred += 1;
                continue;
            }
            if (claim.action === 'failed') {
                summary.failed += 1;
                console.error('[media_cleanup_job_failed]', {
                    jobId: claim.job.id,
                    namespace: claim.job.namespace,
                    scope: claim.job.scope,
                    path: claim.job.path,
                    attempts: claim.job.attempts,
                    maxAttempts: claim.job.maxAttempts,
                    code: claim.job.lastErrorCode,
                    message: claim.job.lastErrorMessage
                });
                continue;
            }

            summary.claimed += 1;
            try {
                const remainingMs = deadline - this.now();
                await this.executeJob(claim.job, leaseId, {
                    timeoutMs: Math.min(
                        this.deleteTimeoutMs,
                        Math.max(1, remainingMs - MIN_COMPLETION_RESERVE_MS)
                    )
                });
                summary.succeeded += 1;
            } catch (error) {
                const described = describeCleanupError(error);
                const permanent = Boolean(error?.permanent || described.permanent);
                const retryAt = new Date(
                    this.now() + computeBackoffMs(claim.job.attempts, {
                        baseMs: this.retryBaseMs,
                        maxMs: this.retryMaxMs
                    })
                ).toISOString();
                const failed = await this.repository.mediaCleanup.fail(
                    claim.job.id,
                    leaseId,
                    {
                        ...described,
                        permanent,
                        retryAt
                    }
                );
                if (failed?.status === 'failed') {
                    summary.failed += 1;
                    console.error('[media_cleanup_job_failed]', {
                        jobId: failed.id,
                        namespace: failed.namespace,
                        scope: failed.scope,
                        path: failed.path,
                        attempts: failed.attempts,
                        maxAttempts: failed.maxAttempts,
                        code: failed.lastErrorCode,
                        message: failed.lastErrorMessage
                    });
                } else {
                    summary.retried += 1;
                }
            }
        }
        return summary;
    }
}

module.exports = {
    MediaCleanupExecutor,
    computeBackoffMs,
    describeCleanupError
};
