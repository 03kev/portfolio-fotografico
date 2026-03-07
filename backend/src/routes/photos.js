const express = require('express');
const multer = require('multer');
const {
    createPrivateUploadPresignedPutUrl,
    createUploadPresignedPutUrl,
    deletePrivateObject,
    deleteUploadObject
} = require('../services/r2Storage');
const {
    buildPhotoAssetPaths,
    extractSourceResolution,
    generatePhotoDerivatives,
    getCropProfilesFromSettings,
    normalizePrivateSourcePathForPhotoId
} = require('../services/photoDerivatives');
const {
    PRIVATE_SOURCE_PREFIX,
    PUBLIC_UPLOADS_PREFIX
} = require('../config/assetPaths');
const DEFAULTS = require('../config/defaults');
const { parseNumericIdOrThrow } = require('../utils/ids');
const { sanitizePhotoPayload } = require('../utils/inputSanitizers');
const { protectWriteMethods } = require('../middleware/auth');
const { readPhotosDB, writePhotosDB } = require('./photos.db');
const { cleanupPhotoReferencesInSeries } = require('../services/seriesPhotoCleanup');
const {
    buildUploadFilename,
    describeDeleteError,
    getImageExtensionFromMimeType,
    isAllowedMimeType,
    normalizePhotoForApiList,
    parseAllowedUploadTypes,
    parseCoordinate,
    parseUploadSize,
    presentPhoto,
    purgePublicAssetsBestEffort,
    readPrivateSourceBuffer,
    readPrivateSourceObject,
    withDefaultPhotoVariants,
    writePrivateObject,
    writePublicObject
} = require('./photos.helpers');

const router = express.Router();
router.use(protectWriteMethods);
const PUBLIC_ASSET_CACHE_CONTROL = DEFAULTS.publicAssetCacheControl;

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
        const photos = rawPhotos
            .map((photo) => normalizePhotoForApiList(photo))
            .map((photo) => presentPhoto(photo));
        
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
        if (error.status === 400 || error.code === 'INVALID_ID') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
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
        let sourceBuffer = null;
        if (req.file) {
            sourcePath = assets.sourcePath;
            sourceBuffer = req.file.buffer;
            await writePrivateObject(sourcePath, req.file.buffer, sourceContentType || 'application/octet-stream');
        } else {
            const providedSourcePath = normalizePrivateSourcePathForPhotoId(req.body?.sourcePath, photoId);
            if (!providedSourcePath) {
                return res.status(400).json({
                    success: false,
                    message: `sourcePath non valido: atteso ${PRIVATE_SOURCE_PREFIX}/photo_${photoId}.[ext]`
                });
            }

            sourcePath = providedSourcePath;
            const sourceObject = await readPrivateSourceObject(sourcePath);
            if (!sourceObject) {
                return res.status(400).json({
                    success: false,
                    message: 'sourcePath non trovato: carica prima il file originale su /api/photos/upload-url'
                });
            }
            sourceBuffer = sourceObject.buffer;
            if (!sourceContentType && sourceObject.contentType) {
                sourceContentType = sourceObject.contentType;
            }

        }

        const derivatives = await generatePhotoDerivatives(sourceBuffer, cropProfiles);
        const sourceResolution = await extractSourceResolution(sourceBuffer);
        await writePublicObject(assets.imagePath, derivatives.image, 'image/webp');
        await writePublicObject(assets.thumbnail43Path, derivatives.thumbnail43, 'image/webp');
        await writePublicObject(assets.thumbnail11Path, derivatives.thumbnail11, 'image/webp');
        await writePublicObject(assets.socialImagePath, derivatives.socialImage, 'image/jpeg');

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
            resolution: sourceResolution.resolution,
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

// POST - Reupload source privata esistente e rigenera derivate pubbliche (stessi path canonici)
router.post('/:id/replace-source', async (req, res) => {
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

        const nextSourcePath = normalizePrivateSourcePathForPhotoId(req.body?.sourcePath, photoId);
        if (!nextSourcePath) {
            return res.status(400).json({
                success: false,
                message: `sourcePath non valido: atteso ${PRIVATE_SOURCE_PREFIX}/photo_${photoId}.[ext]`
            });
        }

        const sourceObject = await readPrivateSourceObject(nextSourcePath);
        if (!sourceObject) {
            return res.status(404).json({
                success: false,
                message: 'Source privata non trovata nello storage.'
            });
        }

        const currentPhoto = photos[photoIndex];
        const publicAssets = withDefaultPhotoVariants(currentPhoto);
        const cropProfiles = getCropProfilesFromSettings(currentPhoto.settings);

        const derivatives = await generatePhotoDerivatives(sourceObject.buffer, cropProfiles);
        const sourceResolution = await extractSourceResolution(sourceObject.buffer);

        await writePublicObject(publicAssets.image, derivatives.image, 'image/webp');
        await writePublicObject(publicAssets.thumbnail43, derivatives.thumbnail43, 'image/webp');
        await writePublicObject(publicAssets.thumbnail11, derivatives.thumbnail11, 'image/webp');
        await writePublicObject(publicAssets.socialImage, derivatives.socialImage, 'image/jpeg');

        const bodySourceContentType = String(req.body?.sourceContentType || '').trim();
        const nextSourceContentType = sourceObject.contentType || bodySourceContentType || currentPhoto.sourceContentType || '';
        const previousSourcePath = normalizePrivateSourcePathForPhotoId(currentPhoto.sourcePath, photoId);

        const updatedPhoto = {
            ...currentPhoto,
            sourcePath: nextSourcePath,
            sourceContentType: nextSourceContentType,
            resolution: sourceResolution.resolution,
            derivativesVersion: Date.now()
        };

        photos[photoIndex] = updatedPhoto;
        await writePhotosDB(photos);

        if (previousSourcePath && previousSourcePath !== nextSourcePath) {
            try {
                await deletePrivateObject(previousSourcePath);
            } catch (error) {
                console.warn('[photo_replace_source_cleanup_failed]', {
                    photoId,
                    path: previousSourcePath,
                    message: error?.message || 'Errore sconosciuto'
                });
            }
        }

        await purgePublicAssetsBestEffort(
            [publicAssets.image, publicAssets.thumbnail43, publicAssets.thumbnail11, publicAssets.socialImage],
            'photo_replace_source'
        );

        return res.json({
            success: true,
            message: 'Source privata aggiornata e derivate rigenerate con successo',
            data: presentPhoto(updatedPhoto)
        });
    } catch (error) {
        console.error('Errore replace source privata:', error);
        if (error.status === 400 || error.code === 'INVALID_ID') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Errore durante il reupload della source privata'
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
        const sourcePath = normalizePrivateSourcePathForPhotoId(photo.sourcePath, photoId);
        if (!sourcePath) {
            return res.status(400).json({
                success: false,
                message: 'Source full-res non disponibile o non conforme al formato atteso.'
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
        const sourceResolution = await extractSourceResolution(sourceBuffer);
        await writePublicObject(publicAssets.image, derivatives.image, 'image/webp');
        await writePublicObject(publicAssets.thumbnail43, derivatives.thumbnail43, 'image/webp');
        await writePublicObject(publicAssets.thumbnail11, derivatives.thumbnail11, 'image/webp');
        await writePublicObject(publicAssets.socialImage, derivatives.socialImage, 'image/jpeg');

        const updatedPhoto = {
            ...photo,
            resolution: sourceResolution.resolution,
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
            await cleanupPhotoReferencesInSeries(photoId);
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

        const privateSourcePath = normalizePrivateSourcePathForPhotoId(deletedPhoto.sourcePath, photoId);
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
