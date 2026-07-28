import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AlertTriangle, Loader2, Save, Upload } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import exifr from 'exifr';
import { usePhotos } from '../contexts/PhotoContext';
import { signSourceUpload, uploadSourceToSignedUrl, uploadUtils } from '../utils/api';
import {
    buildOperationErrorMessage,
    isAmbiguousMutationError
} from '../utils/operationErrors';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { usePhotoUploadWizard } from '../hooks/usePhotoUploadWizard';
import MapSelector from './MapSelector';
import PhotoUploadShell from './photoUpload/PhotoUploadShell';
import UploadStep from './photoUpload/UploadStep';
import InfoLocationStep from './photoUpload/InfoLocationStep';
import DetailsStep from './photoUpload/DetailsStep';
import './PhotoUpload.css';

const METADATA_FILE_ACCEPT = 'image/*,.nef,.nrw,.cr2,.cr3,.arw,.dng,.rw2,.orf,.raf,.pef,.srw,.raw,.tif,.tiff';

const CREATE_UPLOAD_STEP_LABELS = {
    sign: 'firma URL upload',
    upload: 'upload file su R2',
    create: 'creazione foto'
};

const STEP_DESCRIPTIONS = {
    1: 'Seleziona il file iniziale da cui generare tutte le derivate pubbliche.',
    2: 'Compila i dati descrittivi e posiziona correttamente lo scatto.',
    3: 'Completa metadati tecnici e organizzazione dei tag.'
};

const getCreateUploadStepLabel = (step = 'create') => CREATE_UPLOAD_STEP_LABELS[step] || 'creazione foto';

const buildCreateUploadErrorMessage = (error, step = 'create') => {
    const stepLabel = getCreateUploadStepLabel(step);
    return buildOperationErrorMessage(error, stepLabel);
};

const getPhotoSettings = (photo) => {
    if (!photo) return {};
    if (typeof photo.settings === 'string') {
        try {
            const parsed = JSON.parse(photo.settings);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    return photo.settings && typeof photo.settings === 'object' ? photo.settings : {};
};

const getSteps = (isEditMode) => (
    isEditMode
        ? [
            { id: 2, label: 'Info & Posizione' },
            { id: 3, label: 'Dettagli' }
        ]
        : [
            { id: 1, label: 'Upload' },
            { id: 2, label: 'Info & Posizione' },
            { id: 3, label: 'Dettagli' }
        ]
);

const PhotoUpload = ({ onUploadSuccess, onUploadError, onClose, photoToEdit }) => {
    const { actions, photoOpsByPhotoId } = usePhotos();
    const isEditMode = Boolean(photoToEdit);
    const steps = useMemo(() => getSteps(isEditMode), [isEditMode]);
    const initialStep = steps[0].id;

    const [formData, setFormData] = useState(() => {
        if (isEditMode) {
            const settings = {
                aperture: '',
                shutter: '',
                iso: '',
                focal: '',
                ...getPhotoSettings(photoToEdit)
            };

            return {
                title: photoToEdit.title || '',
                description: photoToEdit.description || '',
                date: photoToEdit.date || new Date().toISOString().split('T')[0],
                location: photoToEdit.location || '',
                lat: photoToEdit.lat || '',
                lng: photoToEdit.lng || '',
                camera: photoToEdit.camera || '',
                lens: photoToEdit.lens || '',
                settings,
                tags: Array.isArray(photoToEdit.tags) ? photoToEdit.tags : []
            };
        }

        return {
            title: '',
            description: '',
            date: new Date().toISOString().split('T')[0],
            location: '',
            lat: '',
            lng: '',
            camera: '',
            lens: '',
            settings: { aperture: '', shutter: '', iso: '', focal: '' },
            tags: []
        };
    });
    const [selectedFile, setSelectedFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [tagInput, setTagInput] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [showMapSelector, setShowMapSelector] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [metadataLoading, setMetadataLoading] = useState(false);
    const [metadataStatus, setMetadataStatus] = useState({ type: '', message: '' });

    const fileInputRef = useRef(null);
    const metadataFileInputRef = useRef(null);
    const tagInputRef = useRef(null);
    const hasActivePhotoOp = useMemo(
        () => Object.values(photoOpsByPhotoId || {}).some((entry) => Boolean(entry?.active)),
        [photoOpsByPhotoId]
    );

    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);

    const extractImageMetadata = useCallback(async (file, sourceLabel = 'file selezionato') => {
        try {
            const exifData = await exifr.parse(file, [
                'Model',
                'Make',
                'LensModel',
                'FNumber',
                'ExposureTime',
                'ISO',
                'FocalLength',
                'DateTimeOriginal',
                'GPSLatitude',
                'GPSLongitude',
                'GPSLatitudeRef',
                'GPSLongitudeRef'
            ]);
            if (!exifData || Object.keys(exifData).length === 0) {
                setMetadataStatus({
                    type: 'warning',
                    message: `Nessun metadato rilevato in ${sourceLabel}.`
                });
                return false;
            }

            const cameraModel = exifData.Make && exifData.Model
                ? `${exifData.Make} ${exifData.Model}`.trim()
                : exifData.Model || '';
            const lensModel = exifData.LensModel || '';

            let photoDate = '';
            if (exifData.DateTimeOriginal) {
                const d = new Date(exifData.DateTimeOriginal);
                if (!Number.isNaN(d.getTime())) {
                    photoDate = d.toISOString().split('T')[0];
                }
            }

            const aperture = exifData.FNumber ? `f/${exifData.FNumber}` : '';
            let shutter = '';
            if (exifData.ExposureTime) {
                shutter = exifData.ExposureTime.toString();
                if (exifData.ExposureTime < 1 && exifData.ExposureTime > 0) {
                    const inv = Math.round(1 / exifData.ExposureTime);
                    shutter = `1/${inv}s`;
                } else if (exifData.ExposureTime >= 1) {
                    shutter = `${exifData.ExposureTime}s`;
                }
            }
            const iso = exifData.ISO ? exifData.ISO.toString() : '';
            const focal = exifData.FocalLength ? `${exifData.FocalLength}mm` : '';

            setFormData((prev) => ({
                ...prev,
                date: photoDate || prev.date,
                camera: cameraModel,
                lens: lensModel,
                settings: {
                    ...(prev.settings || {}),
                    aperture,
                    shutter,
                    iso,
                    focal
                }
            }));

            const gps = await exifr.gps(file);
            if (gps && gps.latitude && gps.longitude) {
                try {
                    const res = await fetch(
                        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${gps.latitude}&longitude=${gps.longitude}&localityLanguage=it`
                    );
                    const data = await res.json();
                    setFormData((prev) => ({
                        ...prev,
                        lat: gps.latitude.toFixed(6).toString(),
                        lng: gps.longitude.toFixed(6).toString(),
                        location:
                            data.locality ||
                            data.city ||
                            data.principalSubdivision ||
                            data.countryName ||
                            `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}`
                    }));
                } catch {
                    setFormData((prev) => ({
                        ...prev,
                        lat: gps.latitude.toFixed(6).toString(),
                        lng: gps.longitude.toFixed(6).toString(),
                        location: `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}`
                    }));
                }
            }

            setMetadataStatus({
                type: 'success',
                message: `Metadati estratti da ${sourceLabel}.`
            });
            return true;
        } catch (err) {
            console.warn('Estrazione metadati EXIF fallita:', err);
            setMetadataStatus({
                type: 'warning',
                message: `Impossibile estrarre metadati da ${sourceLabel}.`
            });
            return false;
        }
    }, []);

    const handleFileSelect = useCallback((event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            uploadUtils.validateImageFile(file);
            setSelectedFile(file);
            setError('');

            const reader = new FileReader();
            reader.onload = (e) => setPreview(e.target.result);
            reader.readAsDataURL(file);

            void extractImageMetadata(file, file.name || 'file selezionato');
        } catch (err) {
            setSelectedFile(null);
            setPreview(null);
            setError(err.message || 'File non valido');
        }
    }, [extractImageMetadata]);

    const handleMetadataFileSelect = useCallback(async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setMetadataLoading(true);
        setError('');
        await extractImageMetadata(file, file.name || 'file metadati');
        setMetadataLoading(false);
    }, [extractImageMetadata]);

    const getCurrentLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setError('Geolocalizzazione non supportata dal browser');
            return;
        }

        setError('');
        setLocationLoading(true);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    const res = await fetch(
                        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=it`
                    );
                    const data = await res.json();
                    setFormData((prev) => ({
                        ...prev,
                        lat: latitude.toFixed(6).toString(),
                        lng: longitude.toFixed(6).toString(),
                        location:
                            data.locality ||
                            data.city ||
                            data.principalSubdivision ||
                            data.countryName ||
                            `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                    }));
                } catch {
                    setFormData((prev) => ({
                        ...prev,
                        lat: latitude.toFixed(6).toString(),
                        lng: longitude.toFixed(6).toString(),
                        location: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                    }));
                }
                setLocationLoading(false);
            },
            () => {
                setError('Impossibile ottenere la posizione corrente');
                setLocationLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }, []);

    const handleMapLocationSelect = useCallback((locationData) => {
        if (!locationData) return;
        setFormData((prev) => ({
            ...prev,
            lat: locationData.lat.toFixed(6).toString(),
            lng: locationData.lng.toFixed(6).toString(),
            location: locationData.address || `${locationData.lat}, ${locationData.lng}`
        }));
        setShowMapSelector(false);
        setError('');
    }, []);

    const handleInputChange = useCallback((field, value) => {
        setFormData((prev) => {
            if (field.includes('.')) {
                const [parent, child] = field.split('.');
                return { ...prev, [parent]: { ...prev[parent], [child]: value } };
            }
            return { ...prev, [field]: value };
        });
        if (error) setError('');
    }, [error]);

    const adjustCoordinate = useCallback((field, delta) => {
        setFormData((prev) => {
            const currentValue = Number.parseFloat(prev[field]);
            const safeCurrent = Number.isFinite(currentValue) ? currentValue : 0;
            const nextValue = (safeCurrent + delta).toFixed(6);
            return { ...prev, [field]: nextValue };
        });
        if (error) setError('');
    }, [error]);

    const addTag = useCallback((tag) => {
        const newTag = tag.trim();
        if (newTag) {
            setFormData((prev) => (
                prev.tags.includes(newTag)
                    ? prev
                    : { ...prev, tags: [...prev.tags, newTag] }
            ));
        }
        setTagInput('');
    }, []);

    const removeTag = useCallback((tagToRemove) => {
        setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tagToRemove) }));
    }, []);

    const handleTagKeyPress = useCallback((e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (tagInput.trim()) addTag(tagInput);
        }
    }, [addTag, tagInput]);

    const initClose = useCallback(() => {
        if (loading) return;
        setIsClosing(true);
        setTimeout(() => onClose?.(), 75);
    }, [loading, onClose]);

    useEscapeToClose({
        enabled: Boolean(onClose),
        onClose: initClose,
        canClose: !loading
    });

    const handleUpload = useCallback(async () => {
        if (!isEditMode && !selectedFile) {
            setError('Nessuna immagine selezionata');
            return;
        }
        if (!formData.title.trim()) {
            setError('Il Titolo è obbligatorio');
            return;
        }

        const nextSettings = { ...(formData.settings || {}) };
        delete nextSettings.cropFocus;

        if (isEditMode) {
            setError('');
            const targetPhotoId = photoToEdit?.id;

            if (!targetPhotoId) {
                const errorMessage = 'ID foto non valido per aggiornamento.';
                if (onUploadError) onUploadError({ userMessage: errorMessage });
                return;
            }

            actions.setPhotoOpStatus(targetPhotoId, {
                active: true,
                type: 'edit',
                percent: 18,
                label: 'Salvataggio dettagli',
                step: 'update'
            });

            if (onClose) {
                onClose();
            }

            try {
                const updateData = {
                    ...formData,
                    settings: JSON.stringify(nextSettings),
                    tags: formData.tags
                };

                const result = await actions.updatePhotoInBackground(photoToEdit.id, updateData);
                actions.setPhotoOpStatus(targetPhotoId, {
                    percent: 100,
                    label: 'Dettagli aggiornati',
                    step: 'done'
                });
                if (onUploadSuccess) onUploadSuccess(result);

                setTimeout(() => {
                    actions.clearPhotoOpStatus(targetPhotoId);
                }, 300);
            } catch (err) {
                console.error('Errore upload foto:', err);
                const errorMessage = buildOperationErrorMessage(err, 'aggiornamento foto');
                actions.clearPhotoOpStatus(targetPhotoId);
                if (onUploadError) onUploadError({ ...err, userMessage: errorMessage });
            }
            return;
        }

        if (hasActivePhotoOp) {
            setError('È già in corso un\'altra operazione. Attendi il completamento.');
            return;
        }

        setError('');

        const selectedFileSnapshot = selectedFile;
        const formDataSnapshot = {
            ...formData,
            tags: Array.isArray(formData.tags) ? [...formData.tags] : []
        };
        const pendingPreviewUrl = preview || '';
        const photoId = Date.now();
        const pendingId = photoId;

        actions.addPendingUpload({
            id: pendingId,
            title: formDataSnapshot.title || 'Nuova foto',
            location: formDataSnapshot.location || 'Caricamento in corso',
            description: formDataSnapshot.description || '',
            tags: formDataSnapshot.tags,
            previewUrl: pendingPreviewUrl
        });
        actions.setPhotoOpStatus(pendingId, {
            active: true,
            type: 'new-upload',
            percent: 3,
            label: 'Preparazione upload',
            step: 'sign'
        });

        setLoading(true);
        if (onClose) {
            onClose();
        } else {
            setLoading(false);
        }

        let currentUploadStep = 'sign';
        let softTimer = null;
        const startSoftProgress = (from = 84, to = 95, intervalMs = 260) => {
            let current = Math.max(0, Math.min(100, from));
            actions.setPhotoOpStatus(pendingId, { percent: current });
            softTimer = setInterval(() => {
                current = Math.min(to, current + 1);
                actions.setPhotoOpStatus(pendingId, { percent: current });
                if (current >= to && softTimer) {
                    clearInterval(softTimer);
                    softTimer = null;
                }
            }, intervalMs);
        };
        const stopSoftProgress = () => {
            if (!softTimer) return;
            clearInterval(softTimer);
            softTimer = null;
        };

        try {
            currentUploadStep = 'sign';
            actions.setPhotoOpStatus(pendingId, {
                percent: 8,
                label: 'Firma URL upload',
                step: 'sign'
            });
            const signedData = await signSourceUpload({
                uploadId: String(photoId),
                file: selectedFileSnapshot
            });

            currentUploadStep = 'upload';
            actions.setPhotoOpStatus(pendingId, {
                percent: 12,
                label: 'Upload file su R2',
                step: 'upload'
            });
            await uploadSourceToSignedUrl({
                uploadUrl: signedData.uploadUrl,
                file: selectedFileSnapshot,
                onProgress: ({ ratio }) => {
                    const normalized = Math.max(0, Math.min(1, Number(ratio) || 0));
                    const mapped = Math.round(12 + normalized * 66);
                    actions.setPhotoOpStatus(pendingId, { percent: mapped });
                }
            });

            currentUploadStep = 'create';
            actions.setPhotoOpStatus(pendingId, {
                percent: 84,
                label: 'Creazione foto',
                step: 'create'
            });
            startSoftProgress(84, 95);

            const uploadData = {
                ...formDataSnapshot,
                photoId,
                sourcePath: signedData.sourcePath,
                mediaGeneration: signedData.mediaGeneration,
                sourceContentType: selectedFileSnapshot.type,
                settings: nextSettings,
                tags: formDataSnapshot.tags
            };
            const result = await actions.createPhotoInBackground(uploadData);
            stopSoftProgress();

            actions.setPhotoOpStatus(pendingId, {
                percent: 100,
                label: 'Foto caricata',
                step: 'done'
            });
            actions.removePendingUpload(pendingId);
            setTimeout(() => {
                actions.clearPhotoOpStatus(pendingId);
            }, 250);
            if (onUploadSuccess) onUploadSuccess(result);
        } catch (err) {
            stopSoftProgress();
            console.error('Errore upload foto:', err);
            actions.removePendingUpload(pendingId);
            actions.clearPhotoOpStatus(pendingId);
            if (isAmbiguousMutationError(err)) {
                const refreshedPhotos = await actions.fetchPhotos({ force: true });
                const createdPhoto = Array.isArray(refreshedPhotos)
                    ? refreshedPhotos.find((photo) => String(photo.id) === String(photoId))
                    : null;
                if (createdPhoto) {
                    if (onUploadSuccess) onUploadSuccess(createdPhoto);
                    return;
                }
                if (!Array.isArray(refreshedPhotos)) {
                    err.outcomeUnknown = true;
                }
            }
            const errorMessage = buildCreateUploadErrorMessage(err, currentUploadStep);
            if (onUploadError) {
                onUploadError({
                    ...err,
                    userMessage: errorMessage
                });
            }
        }
    }, [
        isEditMode,
        selectedFile,
        preview,
        formData,
        actions,
        photoToEdit,
        hasActivePhotoOp,
        onUploadSuccess,
        onUploadError,
        onClose
    ]);

    const {
        currentStep,
        selectStep,
        nextStep,
        prevStep,
        currentStepIndex,
        currentStepLabel,
        currentStepDescription,
        isFirstStep,
        isLastStep,
        actionsLayoutClass,
        isNextDisabled
    } = usePhotoUploadWizard({
        steps,
        initialStep,
        loading,
        isEditMode,
        selectedFile,
        title: formData.title,
        tagInput,
        tagInputRef,
        addTag,
        onSubmit: handleUpload,
        setError,
        stepDescriptions: STEP_DESCRIPTIONS
    });

    const footer = (
        <div className="upload-actions">
            <div className="upload-actions-meta">
                <span className="upload-actions-step">Step {currentStepIndex + 1} / {steps.length}</span>
                <span className="upload-actions-caption">{currentStepLabel}</span>
            </div>
            <div className={`upload-actions-buttons${actionsLayoutClass}`}>
                {!isFirstStep && (
                    <button type="button" className="cancel-btn" onClick={prevStep} disabled={loading}>
                        Indietro
                    </button>
                )}

                {!isLastStep ? (
                    <button type="button" className="upload-btn" onClick={nextStep} disabled={isNextDisabled}>
                        Avanti
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            className="upload-btn"
                            onClick={handleUpload}
                            disabled={loading || (!selectedFile && !isEditMode)}
                        >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                {loading ? <Loader2 size={16} /> : isEditMode ? <Save size={16} /> : <Upload size={16} />}
                                {loading
                                    ? (isEditMode ? 'Salvataggio...' : 'Caricamento...')
                                    : (isEditMode ? 'Salva Modifiche' : 'Carica Foto')}
                            </span>
                        </button>
                        {onClose && (
                            <button type="button" className="cancel-btn" onClick={onClose} disabled={loading}>
                                Annulla
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );

    return (
        <PhotoUploadShell
            isEditMode={isEditMode}
            currentStepIndex={currentStepIndex}
            steps={steps}
            currentStep={currentStep}
            currentStepLabel={currentStepLabel}
            currentStepDescription={currentStepDescription}
            loading={loading}
            isClosing={isClosing}
            onInitClose={initClose}
            onStepSelect={selectStep}
            onBackdropClick={() => !loading && initClose()}
            footer={footer}
        >
            <div className="steps-container">
                <input
                    ref={metadataFileInputRef}
                    type="file"
                    accept={METADATA_FILE_ACCEPT}
                    style={{ display: 'none' }}
                    onChange={handleMetadataFileSelect}
                />

                {!isEditMode && currentStep === 1 && (
                    <UploadStep
                        loading={loading}
                        selectedFile={selectedFile}
                        preview={preview}
                        fileInputRef={fileInputRef}
                        handleFileSelect={handleFileSelect}
                    />
                )}

                {currentStep === 2 && (
                    <InfoLocationStep
                        formData={formData}
                        loading={loading}
                        locationLoading={locationLoading}
                        handleInputChange={handleInputChange}
                        getCurrentLocation={getCurrentLocation}
                        setShowMapSelector={setShowMapSelector}
                        adjustCoordinate={adjustCoordinate}
                    />
                )}

                {currentStep === 3 && (
                    <DetailsStep
                        formData={formData}
                        loading={loading}
                        metadataLoading={metadataLoading}
                        metadataStatus={metadataStatus}
                        metadataFileInputRef={metadataFileInputRef}
                        handleInputChange={handleInputChange}
                        tagInput={tagInput}
                        setTagInput={setTagInput}
                        tagInputRef={tagInputRef}
                        handleTagKeyPress={handleTagKeyPress}
                        addTag={addTag}
                        removeTag={removeTag}
                    />
                )}

                {error && (
                    <div className="error-message">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={16} /> {error}
                        </span>
                    </div>
                )}
            </div>

            <AnimatePresence initial={false} mode="wait">
                {showMapSelector && (
                    <MapSelector
                        key="map-selector"
                        isOpen={showMapSelector}
                        onClose={() => setShowMapSelector(false)}
                        onLocationSelect={handleMapLocationSelect}
                        initialLocation={
                            formData.lat && formData.lng
                                ? { lat: parseFloat(formData.lat), lng: parseFloat(formData.lng) }
                                : null
                        }
                        initialFullAddress={formData.location ? formData.location : ''}
                    />
                )}
            </AnimatePresence>
        </PhotoUploadShell>
    );
};

export default PhotoUpload;
