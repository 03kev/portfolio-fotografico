const express = require('express');
const router = express.Router();
const Series = require('../models/Series');
const { portfolioRepository } = require('../repositories');
const { parseNumericIdOrThrow } = require('../utils/ids');
const { getExpectedVersion } = require('../utils/expectedVersion');
const { sanitizeSeriesPayload } = require('../utils/inputSanitizers');
const { createApiError, sendApiError } = require('../utils/apiErrors');
const { canAccessAdminData, protectWriteMethods } = require('../middleware/auth');
const {
    normalizeSeriesRecord
} = require('../services/seriesRecord');

router.use(protectWriteMethods);

function concurrencyOptions(req) {
    const expectedVersion = getExpectedVersion(req);
    if (
        expectedVersion === null
        && portfolioRepository.capabilities.optimisticConcurrency
    ) {
        const error = new Error('Questa operazione richiede X-Expected-Version con la versione corrente.');
        error.status = 428;
        error.code = 'EXPECTED_VERSION_REQUIRED';
        throw error;
    }
    return expectedVersion === null ? {} : { expectedVersion };
}

function sendSuccess(res, data, extra = {}, status = 200) {
    return res.status(status).json({
        success: true,
        data,
        ...extra
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
        return sendApiError(res, error, {
            fallbackMessage: 'Errore nel recupero delle serie',
            fallbackCode: 'SERIES_LIST_FAILED'
        });
    }
});

// GET serie singola per slug o ID
router.get('/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;
        const canReadDrafts = canAccessAdminData(req);
        const series = await portfolioRepository.series.findByIdentifier(identifier);

        if (!series || (!series.published && !canReadDrafts)) {
            return sendApiError(
                res,
                createApiError('Serie non trovata', 404, 'SERIES_NOT_FOUND')
            );
        }

        return sendSuccess(res, series);
    } catch (error) {
        console.error('Errore nel recupero della serie:', error);
        return sendApiError(res, error, {
            fallbackMessage: 'Errore nel recupero della serie',
            fallbackCode: 'SERIES_READ_FAILED'
        });
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
            { message: 'Serie creata.' },
            201
        );
    } catch (error) {
        console.error('Errore nella creazione della serie:', error);
        return sendApiError(res, error, {
            fallbackMessage: 'Errore nella creazione della serie',
            fallbackCode: 'SERIES_CREATE_FAILED'
        });
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
            concurrencyOptions(req)
        );
        if (!persistedUpdatedSeries) {
            return sendApiError(
                res,
                createApiError('Serie non trovata', 404, 'SERIES_NOT_FOUND')
            );
        }

        return sendSuccess(res, persistedUpdatedSeries, { message: 'Serie aggiornata.' });
    } catch (error) {
        console.error('Errore nell\'aggiornamento della serie:', error);
        return sendApiError(res, error, {
            fallbackMessage: 'Errore nell’aggiornamento della serie',
            fallbackCode: 'SERIES_UPDATE_FAILED'
        });
    }
});

// DELETE elimina serie
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const deletedSeries = await portfolioRepository.series.deleteById(
            id,
            concurrencyOptions(req)
        );
        if (!deletedSeries) {
            return sendApiError(
                res,
                createApiError('Serie non trovata', 404, 'SERIES_NOT_FOUND')
            );
        }

        return sendSuccess(res, deletedSeries, { message: 'Serie eliminata.' });
    } catch (error) {
        console.error('Errore nell\'eliminazione della serie:', error);
        return sendApiError(res, error, {
            fallbackMessage: 'Errore nell’eliminazione della serie',
            fallbackCode: 'SERIES_DELETE_FAILED'
        });
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
            concurrencyOptions(req)
        );
        if (!updatedSeries) {
            return sendApiError(
                res,
                createApiError('Serie non trovata', 404, 'SERIES_NOT_FOUND')
            );
        }
        return sendSuccess(res, updatedSeries, { message: 'Foto aggiunta alla serie.' });
    } catch (error) {
        console.error('Errore nell\'aggiunta della foto:', error);
        return sendApiError(res, error, {
            fallbackMessage: 'Errore nell’aggiunta della foto alla serie',
            fallbackCode: 'SERIES_ADD_PHOTO_FAILED'
        });
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
            concurrencyOptions(req)
        );
        if (!updatedSeries) {
            return sendApiError(
                res,
                createApiError('Serie non trovata', 404, 'SERIES_NOT_FOUND')
            );
        }
        return sendSuccess(res, updatedSeries, { message: 'Foto rimossa dalla serie.' });
    } catch (error) {
        console.error('Errore nella rimozione della foto:', error);
        return sendApiError(res, error, {
            fallbackMessage: 'Errore nella rimozione della foto dalla serie',
            fallbackCode: 'SERIES_REMOVE_PHOTO_FAILED'
        });
    }
});

module.exports = router;
