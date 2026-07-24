const express = require('express');
const router = express.Router();
const Series = require('../models/Series');
const { portfolioRepository } = require('../repositories');
const { parseNumericIdOrThrow } = require('../utils/ids');
const { repositoryOptionsFromRequest } = require('../utils/expectedVersion');
const { sanitizeSeriesPayload } = require('../utils/inputSanitizers');
const { canAccessAdminData, protectWriteMethods } = require('../middleware/auth');
const {
    normalizeSeriesRecord
} = require('../services/seriesRecord');

router.use(protectWriteMethods);

function sendSuccess(res, data, extra = {}, status = 200) {
    return res.status(status).json({
        success: true,
        data,
        ...extra
    });
}

function sendError(res, message, status = 500, code = undefined) {
    return res.status(status).json({
        success: false,
        message,
        ...(code ? { code } : {})
    });
}

// GET tutte le serie
router.get('/', async (req, res) => {
    try {
        const series = await portfolioRepository.series.list();

        // Filtra solo le serie pubblicate se non specificato diversamente
        const showAll = req.query.all === 'true' && canAccessAdminData(req);
        const filteredSeries = showAll ? series : series.filter(s => s.published);

        return sendSuccess(res, filteredSeries, { total: filteredSeries.length });
    } catch (error) {
        console.error('Errore nel recupero delle serie:', error);
        return sendError(res, 'Errore nel recupero delle serie');
    }
});

// GET serie singola per slug o ID
router.get('/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;
        const canReadDrafts = canAccessAdminData(req);
        const series = await portfolioRepository.series.findByIdentifier(identifier);

        if (!series || (!series.published && !canReadDrafts)) {
            return sendError(res, 'Serie non trovata', 404);
        }

        return sendSuccess(res, series);
    } catch (error) {
        console.error('Errore nel recupero della serie:', error);
        return sendError(res, 'Errore nel recupero della serie');
    }
});

// POST crea nuova serie
router.post('/', async (req, res) => {
    try {
        const seriesData = sanitizeSeriesPayload(req.body, { partial: false });

        // Validazione
        Series.validate(seriesData);

        // Genera ID univoco
        const id = Date.now().toString();

        // Crea nuova serie
        const newSeries = normalizeSeriesRecord(new Series({
            ...seriesData,
            id
        }).toJSON());

        const persistedNewSeries = await portfolioRepository.series.create(newSeries);

        return sendSuccess(
            res,
            persistedNewSeries,
            { message: 'Serie creata con successo' },
            201
        );
    } catch (error) {
        console.error('Errore nella creazione della serie:', error);
        const status = error.status || 400;
        return sendError(res, error.message || 'Errore nella creazione della serie', status);
    }
});

// PUT aggiorna serie esistente
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = sanitizeSeriesPayload(req.body, { partial: true });

        const persistedUpdatedSeries = await portfolioRepository.series.updateById(
            id,
            updateData,
            repositoryOptionsFromRequest(req)
        );
        if (!persistedUpdatedSeries) {
            return sendError(res, 'Serie non trovata', 404);
        }

        return sendSuccess(res, persistedUpdatedSeries, { message: 'Serie aggiornata con successo' });
    } catch (error) {
        console.error('Errore nell\'aggiornamento della serie:', error);
        const status = error.status || 400;
        return sendError(
            res,
            error.message || 'Errore nell\'aggiornamento della serie',
            status,
            error.code
        );
    }
});

// DELETE elimina serie
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const deletedSeries = await portfolioRepository.series.deleteById(
            id,
            repositoryOptionsFromRequest(req)
        );
        if (!deletedSeries) {
            return sendError(res, 'Serie non trovata', 404);
        }

        return sendSuccess(res, deletedSeries, { message: 'Serie eliminata con successo' });
    } catch (error) {
        console.error('Errore nell\'eliminazione della serie:', error);
        return sendError(
            res,
            error.message || 'Errore nell\'eliminazione della serie',
            error.status || 500,
            error.code
        );
    }
});

// POST aggiungi foto a serie
router.post('/:id/photos/:photoId', async (req, res) => {
    try {
        const { id, photoId } = req.params;
        const normalizedPhotoId = parseNumericIdOrThrow(photoId, 'photoId');

        const updatedSeries = await portfolioRepository.series.addPhoto(
            id,
            normalizedPhotoId,
            repositoryOptionsFromRequest(req)
        );
        if (!updatedSeries) {
            return sendError(res, 'Serie non trovata', 404);
        }
        return sendSuccess(res, updatedSeries, { message: 'Foto aggiunta alla serie' });
    } catch (error) {
        console.error('Errore nell\'aggiunta della foto:', error);
        return sendError(
            res,
            error.message || 'Errore nell\'aggiunta della foto',
            error.status || 500,
            error.code
        );
    }
});

// DELETE rimuovi foto da serie
router.delete('/:id/photos/:photoId', async (req, res) => {
    try {
        const { id, photoId } = req.params;
        const normalizedPhotoId = parseNumericIdOrThrow(photoId, 'photoId');

        const updatedSeries = await portfolioRepository.series.removePhoto(
            id,
            normalizedPhotoId,
            repositoryOptionsFromRequest(req)
        );
        if (!updatedSeries) {
            return sendError(res, 'Serie non trovata', 404);
        }
        return sendSuccess(res, updatedSeries, { message: 'Foto rimossa dalla serie' });
    } catch (error) {
        console.error('Errore nella rimozione della foto:', error);
        return sendError(
            res,
            error.message || 'Errore nella rimozione della foto',
            error.status || 500,
            error.code
        );
    }
});

module.exports = router;
