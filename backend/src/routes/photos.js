const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs').promises;
const {
    THUMBNAILS_DIR,
    UPLOADS_DIR,
    ensureUploadsDirectories,
    resolvePublicFilePath
} = require('../config/storage');
const {
    canUseLocalFallback,
    createUploadPresignedPutUrl,
    deleteUploadObject,
    isR2Enabled,
    putUploadObject
} = require('../services/r2Storage');
const { readMetadataFile, writeMetadataFile } = require('../services/metadataStorage');
const { parsePositiveInt } = require('../utils/env');
const { parseNumericIdOrThrow } = require('../utils/ids');
const { protectWriteMethods } = require('../middleware/auth');

const router = express.Router();
router.use(protectWriteMethods);

function parseAllowedUploadTypes() {
    const defaultValue = 'image/*';
    return String(process.env.UPLOAD_ALLOWED_TYPES || defaultValue)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
}

function isAllowedMimeType(mimetype, allowedTypes) {
    return allowedTypes.some((allowedType) => {
        if (allowedType.endsWith('/*')) {
            const prefix = allowedType.slice(0, -1);
            return mimetype.startsWith(prefix);
        }
        return mimetype === allowedType;
    });
}

function parseCoordinate(value, fieldName) {
    if (value === undefined || value === null || value === '') return null;

    const parsed = Number.parseFloat(String(value));
    if (!Number.isFinite(parsed)) {
        const error = new Error(`${fieldName} non valido`);
        error.status = 400;
        error.code = 'INVALID_COORDINATE';
        throw error;
    }
    return parsed;
}

function parseUploadSize(value) {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

function buildUploadFilename(originalName, mimetype) {
    const base = path.basename(String(originalName || ''), path.extname(String(originalName || '')));
    const sanitizedBase = base.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 40) || 'photo';
    const randomId = crypto.randomBytes(6).toString('hex');
    const extFromName = path.extname(String(originalName || '')).toLowerCase();
    const mimeExt = mimetype && mimetype.includes('/') ? `.${mimetype.split('/')[1]}` : '';
    const extension = /^[.][a-z0-9]+$/.test(extFromName) ? extFromName : (mimeExt || '.bin');
    return `${sanitizedBase}-${Date.now()}-${randomId}${extension}`;
}

// Utility per leggere/scrivere il database JSON
const readPhotosDB = async () => {
    return readMetadataFile('photos.json', []);
};

const writePhotosDB = async (photos) => {
    try {
        await writeMetadataFile('photos.json', photos);
    } catch (error) {
        console.error('Errore nella scrittura del database foto:', error);
        throw error;
    }
};

const readSeriesDB = async () => {
    return readMetadataFile('series.json', []);
};

const writeSeriesDB = async (series) => {
    try {
        await writeMetadataFile('series.json', series);
    } catch (error) {
        console.error('Errore nella scrittura del database serie:', error);
        throw error;
    }
};

// Configurazione multer per upload immagini
const storage = multer.memoryStorage();
const uploadMaxSize = parsePositiveInt(process.env.UPLOAD_MAX_SIZE, 50 * 1024 * 1024);
const allowedUploadTypes = parseAllowedUploadTypes();
const upload = multer({
    storage,
    limits: {
        fileSize: uploadMaxSize
    },
    fileFilter: (req, file, cb) => {
        if (isAllowedMimeType(file.mimetype, allowedUploadTypes)) {
            cb(null, true);
        } else {
            const error = new Error(`Tipo file non consentito. Tipi ammessi: ${allowedUploadTypes.join(', ')}`);
            error.status = 400;
            error.code = 'INVALID_FILE_TYPE';
            cb(error, false);
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
                url: photo.thumbnail || photo.image || '',
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
        const photoId = parseNumericIdOrThrow(id, 'ID foto');
        const photos = await readPhotosDB();
        const photo = photos.find((p) => p.id === photoId);
        
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

// POST - Genera URL firmata per upload diretto su R2 (evita limiti body Vercel)
router.post('/upload-url', async (req, res) => {
    try {
        if (!isR2Enabled()) {
            return res.status(400).json({
                success: false,
                message: 'Upload diretto disponibile solo con R2 configurato'
            });
        }

        const { filename, mimetype, contentType, fileSize } = req.body || {};
        const effectiveMimeType = String(mimetype || contentType || '').trim();
        if (!effectiveMimeType || !isAllowedMimeType(effectiveMimeType, allowedUploadTypes)) {
            return res.status(400).json({
                success: false,
                message: `Tipo file non consentito. Tipi ammessi: ${allowedUploadTypes.join(', ')}`
            });
        }

        const parsedSize = parseUploadSize(fileSize);
        if (parsedSize && parsedSize > uploadMaxSize) {
            return res.status(400).json({
                success: false,
                message: `File troppo grande. Massimo ${uploadMaxSize} byte.`,
                code: 'LIMIT_FILE_SIZE'
            });
        }

        const uploadFilename = buildUploadFilename(filename, effectiveMimeType);
        const uploadPath = `/uploads/${uploadFilename}`;

        const signed = await createUploadPresignedPutUrl(uploadPath, {
            contentType: effectiveMimeType,
            cacheControl: 'public, max-age=31536000, immutable',
            expiresInSeconds: 300
        });

        return res.json({
            success: true,
            data: {
                uploadUrl: signed.uploadUrl,
                imagePath: signed.uploadPath,
                publicUrl: signed.publicUrl,
                expiresInSeconds: signed.expiresInSeconds
            }
        });
    } catch (error) {
        console.error('Errore generazione URL upload diretto:', error);
        return res.status(500).json({
            success: false,
            message: 'Errore nella generazione URL upload'
        });
    }
});

// POST - Upload nuova foto
router.post('/', upload.single('image'), async (req, res) => {
    try {
        const { title, location, lat, lng, description, date, camera, lens, settings, tags } = req.body;
        const parsedLat = parseCoordinate(lat, 'Latitudine');
        const parsedLng = parseCoordinate(lng, 'Longitudine');
        const timestamp = Date.now();

        let imagePath;
        let thumbnailPath;

        if (req.file) {
            // Flusso legacy multipart (locale o fallback)
            const filename = `photo_${timestamp}.webp`;
            const thumbnailFilename = `photo_${timestamp}_thumb.webp`;
            imagePath = `/uploads/${filename}`;
            thumbnailPath = `/uploads/thumbnails/${thumbnailFilename}`;

            const processedImage = await sharp(req.file.buffer)
                .rotate()
                .resize(3840, 2160, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 95, effort: 6 })
                .toBuffer();

            const thumbnail = await sharp(req.file.buffer)
                .rotate()
                .resize(400, 300, { fit: 'cover' })
                .webp({ quality: 85 })
                .toBuffer();

            if (isR2Enabled()) {
                await putUploadObject(imagePath, processedImage, { contentType: 'image/webp' });
                await putUploadObject(thumbnailPath, thumbnail, { contentType: 'image/webp' });
            } else if (canUseLocalFallback()) {
                await ensureUploadsDirectories();
                await fs.writeFile(`${UPLOADS_DIR}/${filename}`, processedImage);
                await fs.writeFile(`${THUMBNAILS_DIR}/${thumbnailFilename}`, thumbnail);
            } else {
                throw new Error('Configurazione R2 mancante: upload immagini consentito solo su R2 in produzione.');
            }
        } else {
            // Flusso consigliato: upload diretto Browser -> R2 e qui solo metadata
            const providedImagePath = String(req.body?.imagePath || req.body?.image || '').trim();
            const providedThumbPath = String(req.body?.thumbnailPath || req.body?.thumbnail || '').trim();

            if (!providedImagePath || !providedImagePath.startsWith('/uploads/')) {
                return res.status(400).json({
                    success: false,
                    message: 'imagePath non valido: usa /uploads/... ottenuto da /api/photos/upload-url'
                });
            }

            imagePath = providedImagePath;
            thumbnailPath = (providedThumbPath && providedThumbPath.startsWith('/uploads/'))
                ? providedThumbPath
                : providedImagePath;
        }
        
        // Crea oggetto foto con valori di default
        const newPhoto = {
            id: timestamp, // Usa timestamp come ID temporaneo
            title: title || 'Foto senza titolo',
            location: location || 'Posizione sconosciuta',
            lat: parsedLat ?? 0,
            lng: parsedLng ?? 0,
            image: imagePath,
            thumbnail: thumbnailPath,
            url: thumbnailPath, // Aggiungi campo url
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

        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: `File troppo grande. Massimo ${uploadMaxSize} byte.`,
                code: 'LIMIT_FILE_SIZE'
            });
        }

        if (error.code === 'INVALID_FILE_TYPE' || error.code === 'INVALID_COORDINATE' || error.status === 400) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Errore nell\'upload della foto'
        });
    }
});

// PUT - Aggiorna foto esistente
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const photoId = parseNumericIdOrThrow(id, 'ID foto');
        const { title, location, lat, lng, description, date, camera, lens, settings, tags } = req.body;
        
        const photos = await readPhotosDB();
        const photoIndex = photos.findIndex((p) => p.id === photoId);
        
        if (photoIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Foto non trovata'
            });
        }
        
        // Aggiorna la foto con i nuovi dati
        const nextLat = lat !== undefined ? parseCoordinate(lat, 'Latitudine') : photos[photoIndex].lat;
        const nextLng = lng !== undefined ? parseCoordinate(lng, 'Longitudine') : photos[photoIndex].lng;

        const updatedPhoto = {
            ...photos[photoIndex],
            title: title || photos[photoIndex].title,
            location: location || photos[photoIndex].location,
            lat: nextLat ?? photos[photoIndex].lat,
            lng: nextLng ?? photos[photoIndex].lng,
            description: description !== undefined ? description : photos[photoIndex].description,
            date: date || photos[photoIndex].date,
            camera: camera !== undefined ? camera : photos[photoIndex].camera,
            lens: lens !== undefined ? lens : photos[photoIndex].lens,
            settings: settings || photos[photoIndex].settings,
            tags: tags || photos[photoIndex].tags
        };
        
        photos[photoIndex] = updatedPhoto;
        await writePhotosDB(photos);
        
        res.json({
            success: true,
            data: updatedPhoto,
            message: 'Foto aggiornata con successo'
        });
    } catch (error) {
        console.error('Errore nell\'aggiornamento:', error);
        if (error.status === 400 || error.code === 'INVALID_COORDINATE' || error.code === 'INVALID_ID') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Errore nell\'aggiornamento della foto'
        });
    }
});

// DELETE - Elimina foto
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const photoId = parseNumericIdOrThrow(id, 'ID foto');
        const photos = await readPhotosDB();
        const photoIndex = photos.findIndex(p => p.id === photoId);
        
        if (photoIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Foto non trovata'
            });
        }
        
        // Rimuovi la foto dall'array
        const deletedPhoto = photos.splice(photoIndex, 1)[0];
        await writePhotosDB(photos);
        
        // Rimuovi l'ID della foto da tutte le serie
        try {
            const series = await readSeriesDB();
            let seriesModified = false;
            
            series.forEach(serie => {
                // Rimuovi dall'array principale photos
                if (serie.photos && Array.isArray(serie.photos)) {
                    const originalLength = serie.photos.length;
                    serie.photos = serie.photos.filter((pid) => Number(pid) !== photoId);
                    if (serie.photos.length !== originalLength) {
                        seriesModified = true;
                    }
                    
                    // Se la foto eliminata era la cover image, rimuovila
                    if (serie.coverImage === photoId) {
                        serie.coverImage = serie.photos[0] || null;
                        seriesModified = true;
                    }
                }
                
                // Rimuovi dai content blocks
                if (serie.content && Array.isArray(serie.content)) {
                    serie.content.forEach(block => {
                        if (block.type === 'photos' && Array.isArray(block.content)) {
                            const originalBlockLength = block.content.length;
                            block.content = block.content.filter((pid) => Number(pid) !== photoId);
                            if (block.content.length !== originalBlockLength) {
                                seriesModified = true;
                            }
                        }
                    });
                }
            });
            
            if (seriesModified) {
                await writeSeriesDB(series);
            }
        } catch (seriesError) {
            console.warn('Errore nell\'aggiornamento delle serie:', seriesError);
        }
        
        // Opzionale: elimina i file fisici
        try {
            if (deletedPhoto.image) {
                if (isR2Enabled()) {
                    await deleteUploadObject(deletedPhoto.image);
                } else if (canUseLocalFallback()) {
                    const imagePath = resolvePublicFilePath(deletedPhoto.image);
                    await fs.unlink(imagePath);
                }
            }
            if (deletedPhoto.thumbnail) {
                if (isR2Enabled()) {
                    await deleteUploadObject(deletedPhoto.thumbnail);
                } else if (canUseLocalFallback()) {
                    const thumbPath = resolvePublicFilePath(deletedPhoto.thumbnail);
                    await fs.unlink(thumbPath);
                }
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
        if (error.status === 400 || error.code === 'INVALID_ID') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Errore nell\'eliminazione della foto'
        });
    }
});

module.exports = router;
