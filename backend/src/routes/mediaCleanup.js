const crypto = require('node:crypto');
const express = require('express');
const { env } = require('../config/env');
const {
    requireConcealedAdminAuth,
    requireMetadataWritesEnabled
} = require('../middleware/auth');
const {
    requireMediaCleanupExecutor
} = require('../services/mediaCleanupRuntime');
const { portfolioRepository } = require('../repositories');

const router = express.Router();
const ROUTE_CLEANUP_TIME_BUDGET_MS = 8_000;

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    return (
        leftBuffer.length === rightBuffer.length
        && crypto.timingSafeEqual(leftBuffer, rightBuffer)
    );
}

function requireCronAuth(req, res, next) {
    const expected = String(env.cronSecret || '');
    const authorization = String(req.headers.authorization || '');
    const supplied = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : '';
    if (!expected || !safeEqual(supplied, expected)) {
        return res.status(404).json({
            success: false,
            message: 'Endpoint non trovato'
        });
    }
    return next();
}

async function runCleanup(req, res) {
    try {
        const executor = requireMediaCleanupExecutor();
        const summary = await executor.runBatch({
            limit: Number(req.query?.limit || req.body?.limit) || 25,
            timeBudgetMs: ROUTE_CLEANUP_TIME_BUDGET_MS
        });
        return res.json({
            success: true,
            message: 'Batch cleanup media completato.',
            data: summary
        });
    } catch (error) {
        console.error('[media_cleanup_route_failed]', {
            code: error?.code || null,
            message: error?.message
        });
        return res.status(error?.status || 500).json({
            success: false,
            code: error?.code || 'MEDIA_CLEANUP_FAILED',
            message: error?.message || 'Cleanup media non riuscito.'
        });
    }
}

router.get('/run', requireCronAuth, requireMetadataWritesEnabled, runCleanup);
router.post(
    '/run',
    requireConcealedAdminAuth,
    requireMetadataWritesEnabled,
    runCleanup
);

router.get('/status', requireConcealedAdminAuth, async (req, res) => {
    if (!portfolioRepository.capabilities.durableMediaCleanup) {
        return res.status(503).json({
            success: false,
            code: 'DURABLE_MEDIA_CLEANUP_REQUIRED',
            message: 'Lo stato cleanup media richiede METADATA_BACKEND=postgres.'
        });
    }
    try {
        const status = await portfolioRepository.mediaCleanup.getStatus({
            failedLimit: req.query?.failedLimit
        });
        return res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('[media_cleanup_status_failed]', {
            code: error?.code || null,
            message: error?.message
        });
        return res.status(500).json({
            success: false,
            code: 'MEDIA_CLEANUP_STATUS_FAILED',
            message: 'Impossibile recuperare lo stato del cleanup media.'
        });
    }
});

module.exports = router;
