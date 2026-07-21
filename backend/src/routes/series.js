const express = require('express');
const router = express.Router();
const Series = require('../models/Series');
const { readMetadataFile, writeMetadataFile } = require('../services/metadataStorage');
const { parseNumericIdOrThrow } = require('../utils/ids');
const { sanitizeSeriesPayload } = require('../utils/inputSanitizers');
const { canAccessAdminData, protectWriteMethods } = require('../middleware/auth');
const {
    assertUniqueSeriesIdentity,
    createSeriesSlug,
    normalizeSeriesCollection,
    normalizeSeriesRecord,
    normalizeSeriesTitleKey
} = require('../services/seriesRecord');

router.use(protectWriteMethods);

// Helper per leggere le serie
async function readSeries() {
    const records = await readMetadataFile('series.json', []);
    return normalizeSeriesCollection(records);
}

// Helper per scrivere le serie
async function writeSeries(series) {
    const normalized = normalizeSeriesCollection(series);
    await writeMetadataFile('series.json', normalized);
    return normalized;
}

function sendSuccess(res, data, extra = {}, status = 200) {
    return res.status(status).json({
        success: true,
        data,
        ...extra
    });
}

function sendError(res, message, status = 500) {
    return res.status(status).json({
        success: false,
        message
    });
}

// GET tutte le serie
router.get('/', async (req, res) => {
    try {
        const series = await readSeries();

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
        const allSeries = await readSeries();

        const canReadDrafts = canAccessAdminData(req);
        const series = allSeries.find(s =>
            (String(s.id) === identifier || s.slug === identifier)
            && (s.published || canReadDrafts)
        );

        if (!series) {
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

        const allSeries = await readSeries();

        // Genera ID univoco
        const id = Date.now().toString();

        // Crea nuova serie
        const newSeries = normalizeSeriesRecord(new Series({
            ...seriesData,
            id
        }).toJSON());

        assertUniqueSeriesIdentity(allSeries, newSeries);

        allSeries.push(newSeries);
        const persistedSeries = await writeSeries(allSeries);
        const persistedNewSeries = persistedSeries.find((item) => String(item.id) === id);

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

        const allSeries = await readSeries();
        const index = allSeries.findIndex(s => String(s.id) === id);

        if (index === -1) {
            return sendError(res, 'Serie non trovata', 404);
        }

        // Mantieni ID e date di creazione
        const existingSeries = allSeries[index];
        const titleChanged = updateData.title !== undefined
            && normalizeSeriesTitleKey(updateData.title) !== normalizeSeriesTitleKey(existingSeries.title);
        const nextSlug = updateData.slug !== undefined
            ? updateData.slug
            : titleChanged
                ? createSeriesSlug(updateData.title)
                : existingSeries.slug;
        const updatedSeries = normalizeSeriesRecord(new Series({
            ...allSeries[index],
            ...updateData,
            slug: nextSlug,
            id: allSeries[index].id,
            createdAt: allSeries[index].createdAt,
            updatedAt: new Date().toISOString()
        }).toJSON());

        assertUniqueSeriesIdentity(allSeries, updatedSeries, id);

        allSeries[index] = updatedSeries;
        const persistedSeries = await writeSeries(allSeries);
        const persistedUpdatedSeries = persistedSeries[index];

        return sendSuccess(res, persistedUpdatedSeries, { message: 'Serie aggiornata con successo' });
    } catch (error) {
        console.error('Errore nell\'aggiornamento della serie:', error);
        const status = error.status || 400;
        return sendError(res, error.message || 'Errore nell\'aggiornamento della serie', status);
    }
});

// DELETE elimina serie
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const allSeries = await readSeries();
        const index = allSeries.findIndex(s => String(s.id) === id);

        if (index === -1) {
            return sendError(res, 'Serie non trovata', 404);
        }

        const deletedSeries = allSeries.splice(index, 1)[0];
        await writeSeries(allSeries);

        return sendSuccess(res, deletedSeries, { message: 'Serie eliminata con successo' });
    } catch (error) {
        console.error('Errore nell\'eliminazione della serie:', error);
        return sendError(res, 'Errore nell\'eliminazione della serie');
    }
});

// POST aggiungi foto a serie
router.post('/:id/photos/:photoId', async (req, res) => {
    try {
        const { id, photoId } = req.params;
        const normalizedPhotoId = parseNumericIdOrThrow(photoId, 'photoId');

        const allSeries = await readSeries();
        const series = allSeries.find(s => String(s.id) === id);

        if (!series) {
            return sendError(res, 'Serie non trovata', 404);
        }

        const seriesInstance = new Series(series);
        seriesInstance.addPhoto(normalizedPhotoId);

        const index = allSeries.findIndex(s => String(s.id) === id);
        allSeries[index] = seriesInstance.toJSON();
        const persistedSeries = await writeSeries(allSeries);
        const persistedUpdatedSeries = persistedSeries[index];

        return sendSuccess(res, persistedUpdatedSeries, { message: 'Foto aggiunta alla serie' });
    } catch (error) {
        console.error('Errore nell\'aggiunta della foto:', error);
        return sendError(res, error.message || 'Errore nell\'aggiunta della foto', error.status || 500);
    }
});

// DELETE rimuovi foto da serie
router.delete('/:id/photos/:photoId', async (req, res) => {
    try {
        const { id, photoId } = req.params;
        const normalizedPhotoId = parseNumericIdOrThrow(photoId, 'photoId');

        const allSeries = await readSeries();
        const series = allSeries.find(s => String(s.id) === id);

        if (!series) {
            return sendError(res, 'Serie non trovata', 404);
        }

        const seriesInstance = new Series(series);
        seriesInstance.removePhoto(normalizedPhotoId);

        const index = allSeries.findIndex(s => String(s.id) === id);
        allSeries[index] = seriesInstance.toJSON();
        const persistedSeries = await writeSeries(allSeries);
        const persistedUpdatedSeries = persistedSeries[index];

        return sendSuccess(res, persistedUpdatedSeries, { message: 'Foto rimossa dalla serie' });
    } catch (error) {
        console.error('Errore nella rimozione della foto:', error);
        return sendError(res, error.message || 'Errore nella rimozione della foto', error.status || 500);
    }
});

module.exports = router;
