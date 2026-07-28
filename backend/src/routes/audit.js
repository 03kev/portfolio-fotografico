const express = require('express');
const { requireWriteAuth } = require('../middleware/auth');
const { portfolioRepository } = require('../repositories');

const router = express.Router();
router.use(requireWriteAuth);

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
        return res.status(error instanceof TypeError ? 400 : 500).json({
            success: false,
            code: error.code || 'AUDIT_READ_FAILED',
            message: error.message || 'Errore nel recupero dello storico admin'
        });
    }
});

router.get('/:id', async (req, res) => {
    if (!ensureAuditAvailable(res)) return;
    try {
        const event = await portfolioRepository.audit.findById(req.params.id);
        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Evento audit non trovato'
            });
        }
        return res.json({ success: true, data: event });
    } catch (error) {
        console.error('Errore nel recupero evento audit:', error);
        return res.status(error instanceof TypeError ? 400 : 500).json({
            success: false,
            code: error.code || 'AUDIT_READ_FAILED',
            message: error.message || 'Errore nel recupero dell’evento audit'
        });
    }
});

module.exports = router;
