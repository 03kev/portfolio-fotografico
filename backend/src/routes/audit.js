const express = require('express');
const { requireConcealedAdminAuth } = require('../middleware/auth');
const { portfolioRepository } = require('../repositories');
const { createApiError, sendApiError } = require('../utils/apiErrors');

const router = express.Router();
router.use(requireConcealedAdminAuth);

function ensureAuditAvailable(res) {
    if (portfolioRepository.capabilities.auditHistory && portfolioRepository.audit) {
        return true;
    }
    res.status(503).json({
        success: false,
        code: 'AUDIT_HISTORY_UNAVAILABLE',
        message: 'Lo storico admin richiede METADATA_BACKEND=postgres.'
    });
    return false;
}

router.get('/', async (req, res) => {
    if (!ensureAuditAvailable(res)) return;
    try {
        const events = await portfolioRepository.audit.list({
            limit: req.query.limit,
            beforeId: req.query.beforeId,
            entityType: req.query.entityType,
            entityId: req.query.entityId,
            operation: req.query.operation
        });
        return res.json({
            success: true,
            data: events,
            pagination: {
                nextBeforeId: events.length > 0
                    ? events[events.length - 1].id
                    : null
            }
        });
    } catch (error) {
        console.error('Errore nel recupero audit:', error);
        return sendApiError(res, error, {
            fallbackMessage: 'Errore nel recupero dello storico admin',
            fallbackStatus: error instanceof TypeError ? 400 : 500,
            fallbackCode: 'AUDIT_READ_FAILED'
        });
    }
});

router.get('/:id', async (req, res) => {
    if (!ensureAuditAvailable(res)) return;
    try {
        const event = await portfolioRepository.audit.findById(req.params.id);
        if (!event) {
            return sendApiError(
                res,
                createApiError('Evento audit non trovato', 404, 'AUDIT_EVENT_NOT_FOUND')
            );
        }
        return res.json({ success: true, data: event });
    } catch (error) {
        console.error('Errore nel recupero evento audit:', error);
        return sendApiError(res, error, {
            fallbackMessage: 'Errore nel recupero dell’evento audit',
            fallbackStatus: error instanceof TypeError ? 400 : 500,
            fallbackCode: 'AUDIT_READ_FAILED'
        });
    }
});

module.exports = router;
