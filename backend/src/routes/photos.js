const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const Photo = require('../models/Photo');

const router = express.Router();

// File JSON per persistenza temporanea
const PHOTOS_DB_PATH = path.join(__dirname, '../../data/photos.json');

// Utility per leggere/scrivere il database JSON
const readPhotosDB = async () => {
    try {
        const data = await fs.readFile(PHOTOS_DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Se il file non esiste, restituisci array vuoto
        return [];
    }
};

const writePhotosDB = async (photos) => {
    try {
        // Crea la directory data se non esiste
        const dataDir = path.join(__dirname, '../../data');
        await fs.mkdir(dataDir, { recursive: true });
        
        await fs.writeFile(PHOTOS_DB_PATH, JSON.stringify(photos, null, 2));
    } catch (error) {
        console.error('Errore nella scrittura del database:', error);
        throw error;
    }
};

// Configurazione multer per upload immagini
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo file di immagine sono consentiti'), false);
        }
    }
});

// GET - Ottieni tutte le foto
router.get('/', async (req, res) => {
    try {
        const rawPhotos = await readPhotosDB();
        
        // Normalizza le foto per assicurare che abbiano tutti i campi necessari
        const photos = rawPhotos.map(photo => {
            // Gestisci settings che potrebbero essere stringhe JSON
            let settings = {};
            if (typeof photo.settings === 'string') {
                try {
                    settings = JSON.parse(photo.settings);
                } catch (e) {
                    console.warn('Errore nel parsing settings per foto', photo.id, ':', e);
                    settings = {};
                }
            } else {
                settings = photo.settings || {};
            }
            
            // Gestisci tags che potrebbero essere stringhe JSON
            let tags = [];
            if (typeof photo.tags === 'string') {
                try {
                    tags = JSON.parse(photo.tags);
                } catch (e) {
                    tags = [];
                }
            } else {
                tags = Array.isArray(photo.tags) ? photo.tags : [];
            }
            
            return {
                ...photo,
                title: photo.title || 'Foto senza titolo',
                location: photo.location || 'Posizione sconosciuta',
                description: photo.description || '',
                camera: photo.camera || '',
                lens: photo.lens || '',
                lat: photo.lat || 0,
                lng: photo.lng || 0,
                settings,
                tags
            };
        });
        
        res.json({
            success: true,
            data: photos,
            total: photos.length
        });
    } catch (error) {
        console.error('Errore nel recupero foto:', error);
        res.status(500).json({
            success: false,
            message: 'Errore nel recupero delle foto'
        });
    }
});

// GET - Ottieni foto per ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const photos = await readPhotosDB();
        const photo = photos.find(p => p.id === parseInt(id));
        
        if (!photo) {
            return res.status(404).json({
                success: false,
                message: 'Foto non trovata'
            });
        }
        
        res.json({
            success: true,
            data: photo
        });
    } catch (error) {
        console.error('Errore nel recupero foto:', error);
        res.status(500).json({
            success: false,
            message: 'Errore nel recupero della foto'
        });
    }
});

// POST - Upload nuova foto
router.post('/', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Nessun file caricato'
            });
        }
        
        const { title, location, lat, lng, description, date, camera, lens, settings, tags } = req.body;
        
        // Genera nome file unico
        const timestamp = Date.now();
        const filename = `photo_${timestamp}.webp`;
        const thumbnailFilename = `photo_${timestamp}_thumb.webp`;
        
        // Processa l'immagine principale CON correzione orientamento
        const processedImage = await sharp(req.file.buffer)
        .rotate() // ⭐ AGGIUNGE AUTO-ROTAZIONE BASATA SU EXIF
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
        
        // Crea thumbnail CON correzione orientamento
        const thumbnail = await sharp(req.file.buffer)
        .rotate() // ⭐ AGGIUNGE AUTO-ROTAZIONE BASATA SU EXIF
        .resize(400, 300, { fit: 'cover' })
        .webp({ quality: 70 })
        .toBuffer();
        
        // Salva i file
        const uploadsDir = path.join(__dirname, '../../uploads');
        const thumbnailsDir = path.join(uploadsDir, 'thumbnails');
        
        // Crea directory se non esistono
        await fs.mkdir(uploadsDir, { recursive: true });
        await fs.mkdir(thumbnailsDir, { recursive: true });
        
        await fs.writeFile(path.join(uploadsDir, filename), processedImage);
        await fs.writeFile(path.join(thumbnailsDir, thumbnailFilename), thumbnail);
        
        // Crea oggetto foto con valori di default
        const newPhoto = {
            id: timestamp, // Usa timestamp come ID temporaneo
            title: title || 'Foto senza titolo',
            location: location || 'Posizione sconosciuta',
            lat: lat ? parseFloat(lat) : 0,
            lng: lng ? parseFloat(lng) : 0,
            image: `/uploads/${filename}`,
            thumbnail: `/uploads/thumbnails/${thumbnailFilename}`,
            description: description || '',
            date: date || new Date().toISOString(),
            camera: camera || '',
            lens: lens || '',
            settings: (() => {
                try {
                    if (typeof settings === 'string') {
                        const parsed = JSON.parse(settings);
                        return parsed;
                    }
                    return settings || {};
                } catch (e) {
                    console.warn('Errore nel parsing settings durante il salvataggio:', e);
                    return {};
                }
            })(),
            tags: (() => {
                try {
                    const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
                    return Array.isArray(parsedTags) ? parsedTags : [];
                } catch (e) {
                    return [];
                }
            })()
        };
        
        // Salva nel database JSON
        const photos = await readPhotosDB();
        photos.unshift(newPhoto); // Aggiungi all'inizio dell'array
        await writePhotosDB(photos);
        
        res.status(201).json({
            success: true,
            message: 'Foto caricata con successo',
            data: newPhoto
        });
        
    } catch (error) {
        console.error('Errore nell\'upload:', error);
        res.status(500).json({
            success: false,
            message: 'Errore nell\'upload della foto'
        });
    }
});

// DELETE - Elimina foto
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const photos = await readPhotosDB();
        const photoIndex = photos.findIndex(p => p.id === parseInt(id));
        
        if (photoIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Foto non trovata'
            });
        }
        
        // Rimuovi la foto dall'array
        const deletedPhoto = photos.splice(photoIndex, 1)[0];
        await writePhotosDB(photos);
        
        // Opzionale: elimina i file fisici
        try {
            if (deletedPhoto.image) {
                const imagePath = path.join(__dirname, '../../', deletedPhoto.image);
                await fs.unlink(imagePath);
            }
            if (deletedPhoto.thumbnail) {
                const thumbPath = path.join(__dirname, '../../', deletedPhoto.thumbnail);
                await fs.unlink(thumbPath);
            }
        } catch (fileError) {
            console.warn('Errore nell\'eliminazione file:', fileError);
        }
        
        res.json({
            success: true,
            message: 'Foto eliminata con successo'
        });
    } catch (error) {
        console.error('Errore nell\'eliminazione:', error);
        res.status(500).json({
            success: false,
            message: 'Errore nell\'eliminazione della foto'
        });
    }
});

module.exports = router;
