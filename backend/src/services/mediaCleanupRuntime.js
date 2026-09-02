const { env } = require('../config/env');
const { portfolioRepository } = require('../repositories');
const {
    deletePrivateObject,
    deleteUploadObject
} = require('./r2Storage');
const { MediaCleanupExecutor } = require('./mediaCleanup');

const OPPORTUNISTIC_CLEANUP_TIME_BUDGET_MS = 1_500;

function getMediaCleanupExecutionBlock({
    capabilities = portfolioRepository.capabilities,
    metadataWritesEnabled = env.metadataWritesEnabled,
    vercelEnv = env.vercelEnv,
    namespace = env.r2ObjectPrefix
} = {}) {
    if (!capabilities?.durableMediaCleanup) {
        return {
            status: 503,
            code: 'DURABLE_MEDIA_CLEANUP_REQUIRED',
            message: 'Il cleanup media durevole richiede METADATA_BACKEND=postgres.'
        };
    }
    if (!metadataWritesEnabled) {
        return {
            status: 503,
            code: 'METADATA_READ_ONLY',
            message: 'Le modifiche ai contenuti sono temporaneamente disabilitate.'
        };
    }
    if (String(vercelEnv || '').toLowerCase() === 'preview' && !String(namespace || '').trim()) {
        return {
            status: 503,
            code: 'MEDIA_CLEANUP_NAMESPACE_REQUIRED',
            message: 'Il cleanup media di una Preview richiede R2_OBJECT_PREFIX.'
        };
    }
    return null;
}

const mediaCleanupExecutionBlock = getMediaCleanupExecutionBlock();
const mediaCleanupExecutor = !mediaCleanupExecutionBlock
    ? new MediaCleanupExecutor({
        repository: portfolioRepository,
        namespace: env.r2ObjectPrefix,
        deletePublicObject: deleteUploadObject,
        deletePrivateObject
    })
    : null;

function requireMediaCleanupExecutor() {
    if (mediaCleanupExecutor) return mediaCleanupExecutor;
    const block = mediaCleanupExecutionBlock || getMediaCleanupExecutionBlock();
    const error = new Error(block.message);
    error.status = block.status;
    error.code = block.code;
    throw error;
}

async function runMediaCleanupBestEffort({
    limit = 10,
    timeBudgetMs = OPPORTUNISTIC_CLEANUP_TIME_BUDGET_MS
} = {}) {
    if (!mediaCleanupExecutor) return null;
    try {
        return await mediaCleanupExecutor.runBatch({ limit, timeBudgetMs });
    } catch (error) {
        console.warn('[media_cleanup_executor_failed]', {
            code: error?.code || null,
            message: error?.message
        });
        return null;
    }
}

module.exports = {
    OPPORTUNISTIC_CLEANUP_TIME_BUDGET_MS,
    getMediaCleanupExecutionBlock,
    mediaCleanupExecutor,
    requireMediaCleanupExecutor,
    runMediaCleanupBestEffort
};
