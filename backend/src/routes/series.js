const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const Series = require('../models/Series');

const SERIES_FILE = path.join(__dirname, '../../data/series.json');

// Helper per leggere le serie
async function readSeries() {
  try {
    const data = await fs.readFile(SERIES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// Helper per scrivere le serie
async function writeSeries(series) {
  await fs.writeFile(SERIES_FILE, JSON.stringify(series, null, 2));
}

// GET tutte le serie
router.get('/', async (req, res) => {
  try {
    const series = await readSeries();
    
    // Filtra solo le serie pubblicate se non specificato diversamente
    const showAll = req.query.all === 'true';
    const filteredSeries = showAll ? series : series.filter(s => s.published);
    
    res.json(filteredSeries);
  } catch (error) {
    console.error('Errore nel recupero delle serie:', error);
    res.status(500).json({ error: 'Errore nel recupero delle serie' });
  }
});

// GET serie singola per slug o ID
router.get('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const allSeries = await readSeries();
    
    const series = allSeries.find(s => 
      s.id === identifier || s.slug === identifier
    );
    
    if (!series) {
      return res.status(404).json({ error: 'Serie non trovata' });
    }
    
    res.json(series);
  } catch (error) {
    console.error('Errore nel recupero della serie:', error);
    res.status(500).json({ error: 'Errore nel recupero della serie' });
  }
});

// POST crea nuova serie
router.post('/', async (req, res) => {
  try {
    const seriesData = req.body;
    
    // Validazione
    Series.validate(seriesData);
    
    const allSeries = await readSeries();
    
    // Genera ID univoco
    const id = Date.now().toString();
    
    // Crea nuova serie
    const newSeries = new Series({
      ...seriesData,
      id
    });
    
    allSeries.push(newSeries.toJSON());
    await writeSeries(allSeries);
    
    res.status(201).json(newSeries.toJSON());
  } catch (error) {
    console.error('Errore nella creazione della serie:', error);
    res.status(400).json({ error: error.message });
  }
});

// PUT aggiorna serie esistente
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const allSeries = await readSeries();
    const index = allSeries.findIndex(s => s.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Serie non trovata' });
    }
    
    // Mantieni ID e date di creazione
    const updatedSeries = new Series({
      ...allSeries[index],
      ...updateData,
      id: allSeries[index].id,
      createdAt: allSeries[index].createdAt,
      updatedAt: new Date().toISOString()
    });
    
    allSeries[index] = updatedSeries.toJSON();
    await writeSeries(allSeries);
    
    res.json(updatedSeries.toJSON());
  } catch (error) {
    console.error('Errore nell\'aggiornamento della serie:', error);
    res.status(400).json({ error: error.message });
  }
});

// DELETE elimina serie
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const allSeries = await readSeries();
    const index = allSeries.findIndex(s => s.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Serie non trovata' });
    }
    
    const deletedSeries = allSeries.splice(index, 1)[0];
    await writeSeries(allSeries);
    
    res.json({ message: 'Serie eliminata con successo', series: deletedSeries });
  } catch (error) {
    console.error('Errore nell\'eliminazione della serie:', error);
    res.status(500).json({ error: 'Errore nell\'eliminazione della serie' });
  }
});

// POST aggiungi foto a serie
router.post('/:id/photos/:photoId', async (req, res) => {
  try {
    const { id, photoId } = req.params;
    
    const allSeries = await readSeries();
    const series = allSeries.find(s => s.id === id);
    
    if (!series) {
      return res.status(404).json({ error: 'Serie non trovata' });
    }
    
    const seriesInstance = new Series(series);
    seriesInstance.addPhoto(photoId);
    
    const index = allSeries.findIndex(s => s.id === id);
    allSeries[index] = seriesInstance.toJSON();
    await writeSeries(allSeries);
    
    res.json(seriesInstance.toJSON());
  } catch (error) {
    console.error('Errore nell\'aggiunta della foto:', error);
    res.status(500).json({ error: 'Errore nell\'aggiunta della foto' });
  }
});

// DELETE rimuovi foto da serie
router.delete('/:id/photos/:photoId', async (req, res) => {
  try {
    const { id, photoId } = req.params;
    
    const allSeries = await readSeries();
    const series = allSeries.find(s => s.id === id);
    
    if (!series) {
      return res.status(404).json({ error: 'Serie non trovata' });
    }
    
    const seriesInstance = new Series(series);
    seriesInstance.removePhoto(photoId);
    
    const index = allSeries.findIndex(s => s.id === id);
    allSeries[index] = seriesInstance.toJSON();
    await writeSeries(allSeries);
    
    res.json(seriesInstance.toJSON());
  } catch (error) {
    console.error('Errore nella rimozione della foto:', error);
    res.status(500).json({ error: 'Errore nella rimozione della foto' });
  }
});

module.exports = router;
