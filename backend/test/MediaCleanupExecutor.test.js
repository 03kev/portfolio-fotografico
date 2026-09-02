const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    MediaCleanupExecutor
} = require('../src/services/mediaCleanup');

function createJob(id) {
    return {
        id,
        namespace: 'preview/test',
        scope: 'public',
        path: `/uploads/photos/1/generation-${id}/photo.webp`,
        attempts: 1,
        maxAttempts: 8
    };
}

function createMemoryRepository(jobs) {
    const queue = [...jobs];
    const completed = [];
    const failed = [];
    return {
        completed,
        failed,
        mediaCleanup: {
            async claimNext() {
                const job = queue.shift();
                return job ? { action: 'claimed', job } : null;
            },
            async complete(jobId) {
                completed.push(jobId);
                return { id: jobId };
            },
            async fail(jobId, _leaseId, error) {
                failed.push({ jobId, error });
                return { id: jobId, status: 'pending' };
            }
        }
    };
}

test('the executor stops claiming work before its serverless time budget expires', async () => {
    let now = 1_000;
    const repository = createMemoryRepository([createJob(1), createJob(2)]);
    const executor = new MediaCleanupExecutor({
        repository,
        namespace: 'preview/test',
        now: () => now,
        deletePublicObject: async () => {
            now += 300;
        },
        deletePrivateObject: async () => {},
        deleteTimeoutMs: 1_000
    });

    const summary = await executor.runBatch({
        limit: 10,
        timeBudgetMs: 500
    });

    assert.equal(summary.claimed, 1);
    assert.equal(summary.succeeded, 1);
    assert.equal(summary.timeBudgetReached, true);
    assert.deepEqual(repository.completed, [1]);
});

test('the executor aborts an R2 deletion that exceeds the remaining budget', async () => {
    const repository = createMemoryRepository([createJob(1)]);
    let receivedSignal = null;
    const executor = new MediaCleanupExecutor({
        repository,
        namespace: 'preview/test',
        deletePublicObject: (_path, { abortSignal }) => new Promise((resolve, reject) => {
            receivedSignal = abortSignal;
            abortSignal.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            }, { once: true });
        }),
        deletePrivateObject: async () => {},
        deleteTimeoutMs: 250,
        retryBaseMs: 1,
        retryMaxMs: 1
    });

    const summary = await executor.runBatch({
        limit: 1,
        timeBudgetMs: 500
    });

    assert.equal(receivedSignal.aborted, true);
    assert.equal(summary.retried, 1);
    assert.equal(repository.failed[0].error.code, 'CLEANUP_DELETE_TIMEOUT');
});
