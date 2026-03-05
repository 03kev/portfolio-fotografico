const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const {
    createPrivateUploadPresignedPutUrl,
    createUploadPresignedPutUrl,
    deletePrivateObject,
    deleteUploadObject,
    getPrivateObject,
    putPrivateObject,
    putUploadObject
} = require('../services/r2Storage');
const { readMetadataFile, writeMetadataFile } = require('../services/metadataStorage');
const {
    buildPhotoAssetPaths,
    generatePhotoDerivatives,
    getCropProfilesFromSettings,
    normalizePrivatePath,
    normalizeUploadsPath
} = require('../services/photoDerivatives');
const {
    normalizeUploadPathToAbsoluteUrl,
    purgeUrls
} = require('../services/cloudflareCache');
const { toRuntimePhoto, toStoragePhoto } = require('../services/photoRecord');
const {
    PRIVATE_SOURCE_PREFIX,
    PUBLIC_UPLOADS_PREFIX
} = require('../config/assetPaths');
const { env } = require('../config/env');
const DEFAULTS = require('../config/defaults');
const { readStreamToBuffer } = require('../utils/streams');
const { parseNumericIdOrThrow } = require('../utils/ids');
const { sanitizePhotoPayload } = require('../utils/inputSanitizers');
const { protectWriteMethods } = require('../middleware/auth');

const router = express.Router();
router.use(protectWriteMethods);
const PUBLIC_ASSET_CACHE_CONTROL = DEFAULTS.publicAssetCacheControl;

function normalizePublicBaseUrl() {
    // In sviluppo manteniamo path relative (/uploads/...) per compatibilità
    // con il frontend locale che usa base URL locale/proxy.
    return env.isProduction ? env.r2PublicUrl : '';
}

function buildPublicAssetUrl(uploadPath) {
    const value = String(uploadPath || '').trim();
    if (!value) return value;
    if (/^https?:\/\//i.test(value)) return value;

    const publicBaseUrl = normalizePublicBaseUrl();
    if (!publicBaseUrl) return value;
    if (!value.startsWith(`${PUBLIC_UPLOADS_PREFIX}/`)) return value;

    const publicPrefix = PUBLIC_UPLOADS_PREFIX.replace(/^\/+/, '');
    const objectKey = value
        .replace(/^\/+/, '')
        .replace(new RegExp(`^${publicPrefix}/+`), '');
    return `${publicBaseUrl}/${objectKey}`;
}

async function purgePublicAssetsBestEffort(uploadPaths = [], reason = 'photos_update') {
    const urls = uploadPaths
        .map((uploadPath) => normalizeUploadPathToAbsoluteUrl(uploadPath))
        .filter(Boolean);

    if (!urls.length) return;

    try {
        await purgeUrls(urls, { reason });
    } catch (error) {
        console.warn(`[cache] purge fallita (${reason}):`, error.message);
    }
}

function withDefaultPhotoVariants(photo) {
    const photoId = String(photo?.id || '').trim();
    const assets = photoId ? buildPhotoAssetPaths(photoId) : null;
    const imagePath = assets ? normalizeUploadsPath(assets.imagePath) : '';
    const thumbnail43Path = assets ? normalizeUploadsPath(assets.thumbnail43Path) : '';
    const thumbnail11Path = assets ? normalizeUploadsPath(assets.thumbnail11Path) : '';
    const socialImagePath = assets ? normalizeUploadsPath(assets.socialImagePath) : '';

    return {
        ...photo,
        image: imagePath,
        thumbnail43: thumbnail43Path,
        thumbnail11: thumbnail11Path,
        socialImage: socialImagePath,
        url: imagePath
    };
}

function presentPhoto(photo) {
    const normalized = withDefaultPhotoVariants(photo);
    const image = buildPublicAssetUrl(normalized.image);
    const thumbnail43 = buildPublicAssetUrl(normalized.thumbnail43);
    const thumbnail11 = buildPublicAssetUrl(normalized.thumbnail11);
    const socialImage = buildPublicAssetUrl(normalized.socialImage);
    const { sourcePath, sourceContentType, ...publicPhoto } = normalized;

    return {
        ...publicPhoto,
        image,
        thumbnail43,
        thumbnail11,
        socialImage,
        url: buildPublicAssetUrl(normalized.url)
    };
}

function parseAllowedUploadTypes() {
    return DEFAULTS.uploadAllowedTypes;
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

function describeDeleteError(error) {
    return {
        message: error?.message || 'Errore sconosciuto',
        code: error?.code || error?.name || 'UNKNOWN_ERROR',
        statusCode: error?.$metadata?.httpStatusCode || null
    };
}

function normalizeUploadId(value) {
    const normalized = String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 48);
    return normalized || null;
}

function buildUploadFilename(mimetype, uploadId) {
    const safeUploadId = normalizeUploadId(uploadId) || `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const mimeExt = mimetype && mimetype.includes('/') ? `.${mimetype.split('/')[1]}` : '.bin';
    const extension = mimeExt.toLowerCase();
    return `photo_${safeUploadId}${extension}`;
}

function getImageExtensionFromMimeType(mimetype) {
    const subtype = String(mimetype || '')
        .split('/')
        .slice(1)
        .join('/')
        .split(';')[0]
        .trim()
        .toLowerCase();

    if (!subtype) return 'bin';
    if (subtype === 'jpeg') return 'jpg';
    return subtype.replace(/[^a-z0-9]/g, '') || 'bin';
}

async function writePublicObject(uploadPath, buffer, contentType) {
    await putUploadObject(uploadPath, buffer, {
        contentType,
        cacheControl: PUBLIC_ASSET_CACHE_CONTROL
    });
}

async function writePrivateObject(privatePath, buffer, contentType) {
    await putPrivateObject(privatePath, buffer, {
        contentType,
        cacheControl: 'private, no-store'
    });
}

async function readPrivateSourceBuffer(privatePath) {
    const object = await getPrivateObject(privatePath);
    if (!object || !object.stream) {
        return null;
    }
    return readStreamToBuffer(object.stream);
}

// Utility per leggere/scrivere il database JSON
const readPhotosDB = async () => {
    const rawPhotos = await readMetadataFile('photos.json', []);
    return Array.isArray(rawPhotos)
        ? rawPhotos.map((photo) => toRuntimePhoto(photo))
        : [];
};

const writePhotosDB = async (photos) => {
    try {
        const normalizedPhotos = Array.isArray(photos)
            ? photos.map((photo) => toStoragePhoto(photo))
            : [];
        await writeMetadataFile('photos.json', normalizedPhotos);
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
const uploadMaxSize = DEFAULTS.uploadMaxSize;
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
                derivativesVersion: photo.derivativesVersion || photo.updatedAt || photo.id || Date.now(),
                settings,
                tags
            };
        }).map(presentPhoto);
        
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
        const photo = photos.find((p) => Number(p.id) === photoId);
        
        if (!photo) {
            return res.status(404).json({
                success: false,
                message: 'Foto non trovata'
            });
        }
        
        res.json({
            success: true,
            data: presentPhoto(photo)
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
        const { uploadId, mimetype, contentType, fileSize, variant } = req.body || {};
        const rawVariant = String(variant || 'source').trim().toLowerCase();
        const uploadVariant = ['source', 'image'].includes(rawVariant) ? rawVariant : 'source';
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

        const uploadFilename = buildUploadFilename(effectiveMimeType, uploadId);
        const uploadPath = uploadVariant === 'source'
            ? `${PRIVATE_SOURCE_PREFIX}/${uploadFilename}`
            : `${PUBLIC_UPLOADS_PREFIX}/${uploadFilename}`;

        const signed = uploadVariant === 'source'
            ? await createPrivateUploadPresignedPutUrl(uploadPath, {
                contentType: effectiveMimeType,
                cacheControl: 'private, no-store',
                expiresInSeconds: 300
            })
            : await createUploadPresignedPutUrl(uploadPath, {
                contentType: effectiveMimeType,
                cacheControl: PUBLIC_ASSET_CACHE_CONTROL,
                expiresInSeconds: 300
            });

        return res.json({
            success: true,
            data: {
                uploadUrl: signed.uploadUrl,
                imagePath: signed.uploadPath,
                sourcePath: uploadVariant === 'source' ? signed.uploadPath : '',
                variant: uploadVariant,
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
        const { lat, lng } = req.body;
        const sanitized = sanitizePhotoPayload(req.body, { partial: false });
        const parsedLat = parseCoordinate(lat, 'Latitudine');
        const parsedLng = parseCoordinate(lng, 'Longitudine');
        const requestedPhotoId = Number.parseInt(String(req.body?.photoId || ''), 10);
        const photoId = Number.isFinite(requestedPhotoId) && requestedPhotoId > 0
            ? requestedPhotoId
            : Date.now();
        const sourceExtension = getImageExtensionFromMimeType(req.file?.mimetype || req.body?.sourceContentType);
        const cropProfiles = getCropProfilesFromSettings(sanitized.settings);
        const assets = buildPhotoAssetPaths(photoId, sourceExtension);
        const photos = await readPhotosDB();

        if (photos.some((item) => Number(item.id) === photoId)) {
            return res.status(409).json({
                success: false,
                message: 'photoId già esistente, riprova con un nuovo upload.'
            });
        }

        let sourcePath = '';
        let sourceContentType = String(req.file?.mimetype || req.body?.sourceContentType || '').trim();
        if (req.file) {
            sourcePath = assets.sourcePath;
            await writePrivateObject(sourcePath, req.file.buffer, sourceContentType || 'application/octet-stream');

            const derivatives = await generatePhotoDerivatives(req.file.buffer, cropProfiles);
            await writePublicObject(assets.imagePath, derivatives.image, 'image/webp');
            await writePublicObject(assets.thumbnail43Path, derivatives.thumbnail43, 'image/webp');
            await writePublicObject(assets.thumbnail11Path, derivatives.thumbnail11, 'image/webp');
            await writePublicObject(assets.socialImagePath, derivatives.socialImage, 'image/jpeg');
        } else {
            const providedSourcePath = normalizePrivatePath(req.body?.sourcePath);
            if (!providedSourcePath) {
                return res.status(400).json({
                    success: false,
                    message: 'sourcePath non valido: usa /private/... ottenuto da /api/photos/upload-url'
                });
            }

            sourcePath = providedSourcePath;
            const sourceBuffer = await readPrivateSourceBuffer(sourcePath);
            if (!sourceBuffer) {
                return res.status(400).json({
                    success: false,
                    message: 'sourcePath non trovato: carica prima il file originale su /api/photos/upload-url'
                });
            }

            const derivatives = await generatePhotoDerivatives(sourceBuffer, cropProfiles);
            await writePublicObject(assets.imagePath, derivatives.image, 'image/webp');
            await writePublicObject(assets.thumbnail43Path, derivatives.thumbnail43, 'image/webp');
            await writePublicObject(assets.thumbnail11Path, derivatives.thumbnail11, 'image/webp');
            await writePublicObject(assets.socialImagePath, derivatives.socialImage, 'image/jpeg');
        }

        // Crea oggetto foto con valori di default
        const newPhoto = {
            id: photoId,
            title: sanitized.title,
            location: sanitized.location,
            lat: parsedLat ?? 0,
            lng: parsedLng ?? 0,
            sourcePath,
            sourceContentType: sourceContentType || '',
            derivativesVersion: Date.now(),
            description: sanitized.description,
            date: sanitized.date,
            camera: sanitized.camera,
            lens: sanitized.lens,
            settings: sanitized.settings,
            tags: sanitized.tags
        };
        
        // Salva nel database JSON
        photos.unshift(newPhoto); // Aggiungi all'inizio dell'array
        await writePhotosDB(photos);

        await purgePublicAssetsBestEffort(
            [assets.imagePath, assets.thumbnail43Path, assets.thumbnail11Path, assets.socialImagePath],
            'photo_create'
        );
        
        res.status(201).json({
            success: true,
            message: 'Foto caricata con successo',
            data: presentPhoto(newPhoto)
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

// POST - Rigenera derivate da source full-res (stessi path, overwrite su R2)
router.post('/:id/regenerate-derivatives', async (req, res) => {
    try {
        const { id } = req.params;
        const photoId = parseNumericIdOrThrow(id, 'ID foto');
        const photos = await readPhotosDB();
        const photoIndex = photos.findIndex((p) => Number(p.id) === photoId);

        if (photoIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Foto non trovata'
            });
        }

        const photo = photos[photoIndex];
        const sourcePath = normalizePrivatePath(photo.sourcePath);
        if (!sourcePath) {
            return res.status(400).json({
                success: false,
                message: 'Source full-res non disponibile per questa foto.'
            });
        }

        const sourceBuffer = await readPrivateSourceBuffer(sourcePath);
        if (!sourceBuffer) {
            return res.status(404).json({
                success: false,
                message: 'Source full-res non trovata nello storage.'
            });
        }

        const publicAssets = withDefaultPhotoVariants(photo);

        const cropProfiles = getCropProfilesFromSettings(photo.settings);
        const derivatives = await generatePhotoDerivatives(sourceBuffer, cropProfiles);
        await writePublicObject(publicAssets.image, derivatives.image, 'image/webp');
        await writePublicObject(publicAssets.thumbnail43, derivatives.thumbnail43, 'image/webp');
        await writePublicObject(publicAssets.thumbnail11, derivatives.thumbnail11, 'image/webp');
        await writePublicObject(publicAssets.socialImage, derivatives.socialImage, 'image/jpeg');

        const updatedPhoto = {
            ...photo,
            derivativesVersion: Date.now()
        };

        photos[photoIndex] = updatedPhoto;
        await writePhotosDB(photos);

        await purgePublicAssetsBestEffort(
            [publicAssets.image, publicAssets.thumbnail43, publicAssets.thumbnail11, publicAssets.socialImage],
            'photo_regenerate_derivatives'
        );

        return res.json({
            success: true,
            message: 'Derivate rigenerate con successo',
            data: presentPhoto(updatedPhoto)
        });
    } catch (error) {
        console.error('Errore rigenerazione derivate:', error);
        if (error.status === 400 || error.code === 'INVALID_ID') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Errore durante la rigenerazione derivate'
        });
    }
});

// PUT - Aggiorna foto esistente
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const photoId = parseNumericIdOrThrow(id, 'ID foto');
        const { lat, lng } = req.body;
        const sanitized = sanitizePhotoPayload(req.body, { partial: true });
        
        const photos = await readPhotosDB();
        const photoIndex = photos.findIndex((p) => Number(p.id) === photoId);
        
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
            ...sanitized,
            lat: nextLat ?? photos[photoIndex].lat,
            lng: nextLng ?? photos[photoIndex].lng,
        };
        
        photos[photoIndex] = updatedPhoto;
        await writePhotosDB(photos);
        
        res.json({
            success: true,
            data: presentPhoto(updatedPhoto),
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
        const photoIndex = photos.findIndex((p) => Number(p.id) === photoId);
        
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
                    if (Number(serie.coverImage) === photoId) {
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
        
        const publicAssets = withDefaultPhotoVariants(deletedPhoto);
        const publicPathsToDelete = [
            publicAssets.image,
            publicAssets.thumbnail43,
            publicAssets.thumbnail11,
            publicAssets.socialImage
        ].filter(Boolean);
        const uniquePublicPaths = [...new Set(publicPathsToDelete)];

        const deletedAssets = [];
        const failedAssets = [];

        for (const publicPath of uniquePublicPaths) {
            try {
                await deleteUploadObject(publicPath);
                deletedAssets.push({ scope: 'public', path: publicPath });
            } catch (error) {
                const errorInfo = describeDeleteError(error);
                failedAssets.push({ scope: 'public', path: publicPath, ...errorInfo });
                console.warn('[photo_delete_asset_failed]', {
                    photoId,
                    scope: 'public',
                    path: publicPath,
                    ...errorInfo
                });
            }
        }

        const privateSourcePath = normalizePrivatePath(deletedPhoto.sourcePath);
        if (privateSourcePath) {
            try {
                await deletePrivateObject(privateSourcePath);
                deletedAssets.push({ scope: 'private', path: privateSourcePath });
            } catch (error) {
                const errorInfo = describeDeleteError(error);
                failedAssets.push({ scope: 'private', path: privateSourcePath, ...errorInfo });
                console.warn('[photo_delete_asset_failed]', {
                    photoId,
                    scope: 'private',
                    path: privateSourcePath,
                    ...errorInfo
                });
            }
        }

        const deletedPublicPaths = deletedAssets
            .filter((asset) => asset.scope === 'public')
            .map((asset) => asset.path);

        await purgePublicAssetsBestEffort(deletedPublicPaths, 'photo_delete');

        if (failedAssets.length) {
            console.warn('[photo_delete_partial_cleanup]', {
                photoId,
                failedCount: failedAssets.length,
                failedAssets
            });
        }
        
        res.json({
            success: true,
            message: failedAssets.length
                ? 'Foto eliminata con successo (cleanup asset parziale)'
                : 'Foto eliminata con successo',
            data: {
                deletedAssets,
                failedAssets
            }
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
