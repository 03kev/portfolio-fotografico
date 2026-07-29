import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AlertTriangle, Loader2, Save, Upload } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { usePhotos } from '../contexts/PhotoContext';
import { signSourceUpload, uploadSourceToSignedUrl, uploadUtils } from '../utils/api';
import {
    buildOperationErrorMessage,
    isAmbiguousMutationError
} from '../utils/operationErrors';
import { buildPhotoOperationStatus } from '../utils/photoOperationStatus';
import {
    readPhotoMetadata,
    reverseGeocodeCoordinates
} from '../utils/photoMetadata';
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
    sign: 'preparazione caricamento',
    upload: 'caricamento originale',
    create: 'creazione foto'
};

const STEP_DESCRIPTIONS = {
    1: 'Seleziona il file iniziale da cui generare tutte le derivate pubbliche.',
    2: 'Compila i dati descrittivi e posiziona correttamente lo scatto.',
    3: 'Completa metadati tecnici e organizzazione dei tag.'
};

const getCreateUploadStepLabel = (step = 'create') => CREATE_UPLOAD_STEP_LABELS[step] || 'creazione foto';

const createUploadIntentId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
        return [
            hex.slice(0, 4).join(''),
            hex.slice(4, 6).join(''),
            hex.slice(6, 8).join(''),
            hex.slice(8, 10).join(''),
            hex.slice(10).join('')
        ].join('-');
    }
    throw new Error('Il browser non supporta la generazione sicura della chiave di upload.');
};

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
    const metadataExtractionRef = useRef({ id: 0, controller: null });
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

    useEffect(() => () => {
        metadataExtractionRef.current.controller?.abort();
        metadataExtractionRef.current.id += 1;
    }, []);

    const extractImageMetadata = useCallback(async (file, sourceLabel = 'file selezionato') => {
        metadataExtractionRef.current.controller?.abort();
        const extractionId = metadataExtractionRef.current.id + 1;
        const controller = new AbortController();
        metadataExtractionRef.current = { id: extractionId, controller };
        const isCurrentExtraction = () => (
            metadataExtractionRef.current.id === extractionId
            && !controller.signal.aborted
        );

        try {
            const metadata = await readPhotoMetadata(file);
            if (!isCurrentExtraction()) return false;
            if (!metadata.hasMetadata) {
                setMetadataStatus({
                    type: 'warning',
                    message: `Nessun metadato rilevato in ${sourceLabel}.`
                });
                return false;
            }

            const extractedLocation = metadata.location || (
                metadata.coordinates
                    ? `${metadata.coordinates.latitude.toFixed(4)}, ${metadata.coordinates.longitude.toFixed(4)}`
                    : ''
            );
            setFormData((prev) => ({
                ...prev,
                date: metadata.date || prev.date,
                camera: metadata.camera || prev.camera,
                lens: metadata.lens || prev.lens,
                location: extractedLocation || prev.location,
                ...(metadata.coordinates ? {
                    lat: metadata.coordinates.latitude.toFixed(6),
                    lng: metadata.coordinates.longitude.toFixed(6)
                } : {}),
                settings: {
                    ...(prev.settings || {}),
                    ...Object.fromEntries(
                        Object.entries(metadata.settings).filter(([, value]) => Boolean(value))
                    )
                }
            }));

            if (metadata.coordinates) {
                try {
                    const location = await reverseGeocodeCoordinates(
                        metadata.coordinates.latitude,
                        metadata.coordinates.longitude,
                        { signal: controller.signal }
                    );
                    if (!isCurrentExtraction()) return false;
                    setFormData((prev) => ({
                        ...prev,
                        location: !prev.location || prev.location === extractedLocation
                            ? location
                            : prev.location
                    }));
                } catch (geocodeError) {
                    if (geocodeError?.name === 'AbortError' || !isCurrentExtraction()) {
                        return false;
                    }
                }
            }

            if (!isCurrentExtraction()) return false;
            setMetadataStatus({
                type: 'success',
                message: `Metadati estratti da ${sourceLabel}.`
            });
            return true;
        } catch (err) {
            if (err?.name === 'AbortError' || !isCurrentExtraction()) return false;
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
                    const location = await reverseGeocodeCoordinates(latitude, longitude);
                    setFormData((prev) => ({
                        ...prev,
                        lat: latitude.toFixed(6).toString(),
                        lng: longitude.toFixed(6).toString(),
                        location
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
        const normalizedTitle = formData.title.trim();
        if (!normalizedTitle) {
            setError('Il Titolo è obbligatorio');
            return;
        }
        if (normalizedTitle.length < 3) {
            setError('Il titolo deve contenere almeno 3 caratteri');
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

            actions.setPhotoOpStatus(
                targetPhotoId,
                buildPhotoOperationStatus('edit', 'save')
            );

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
                actions.setPhotoOpStatus(
                    targetPhotoId,
                    buildPhotoOperationStatus('edit', 'done')
                );
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
        const uploadIntentId = createUploadIntentId();
        const pendingId = `pending:${uploadIntentId}`;

        actions.addPendingUpload({
            id: pendingId,
            title: formDataSnapshot.title || 'Nuova foto',
            location: formDataSnapshot.location || 'Caricamento in corso',
            description: formDataSnapshot.description || '',
            tags: formDataSnapshot.tags,
            previewUrl: pendingPreviewUrl
        });
        actions.setPhotoOpStatus(
            pendingId,
            buildPhotoOperationStatus('create', 'prepare')
        );

        setLoading(true);
        if (onClose) {
            onClose();
        } else {
            setLoading(false);
        }

        let currentUploadStep = 'sign';
        let finalizationPayload = null;
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
            actions.setPhotoOpStatus(
                pendingId,
                buildPhotoOperationStatus('create', 'sign')
            );
            const signedData = await signSourceUpload({
                uploadIntentId,
                file: selectedFileSnapshot
            });

            currentUploadStep = 'upload';
            actions.setPhotoOpStatus(
                pendingId,
                buildPhotoOperationStatus('create', 'upload')
            );
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
            actions.setPhotoOpStatus(
                pendingId,
                buildPhotoOperationStatus('create', 'process')
            );
            startSoftProgress(84, 95);

            finalizationPayload = {
                ...formDataSnapshot,
                photoId: signedData.photoId,
                uploadIntentId: signedData.uploadIntentId,
                sourcePath: signedData.sourcePath,
                settings: nextSettings,
                tags: formDataSnapshot.tags
            };
            const result = await actions.createPhotoInBackground(finalizationPayload);
            stopSoftProgress();

            actions.setPhotoOpStatus(
                pendingId,
                buildPhotoOperationStatus('create', 'done')
            );
            actions.removePendingUpload(pendingId);
            setTimeout(() => {
                actions.clearPhotoOpStatus(pendingId);
            }, 250);
            if (onUploadSuccess) onUploadSuccess(result);
        } catch (caughtError) {
            stopSoftProgress();
            let errorToReport = caughtError;
            console.error('Errore upload foto:', caughtError);
            actions.removePendingUpload(pendingId);
            actions.clearPhotoOpStatus(pendingId);
            if (isAmbiguousMutationError(caughtError)) {
                const refreshedPhotos = await actions.fetchPhotos({ force: true });
                const createdPhoto = Array.isArray(refreshedPhotos)
                    ? refreshedPhotos.find(
                        (photo) => String(photo.id) === String(finalizationPayload?.photoId)
                    )
                    : null;
                if (createdPhoto) {
                    if (onUploadSuccess) onUploadSuccess(createdPhoto);
                    return;
                }
                if (currentUploadStep === 'create' && finalizationPayload) {
                    try {
                        const replayedPhoto = await actions.createPhotoInBackground(
                            finalizationPayload
                        );
                        if (onUploadSuccess) onUploadSuccess(replayedPhoto);
                        return;
                    } catch (replayError) {
                        errorToReport = replayError;
                    }
                }
                if (!Array.isArray(refreshedPhotos)) {
                    errorToReport.outcomeUnknown = true;
                }
            }
            const errorMessage = buildCreateUploadErrorMessage(
                errorToReport,
                currentUploadStep
            );
            if (onUploadError) {
                onUploadError({
                    ...errorToReport,
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
        isNextDisabled,
        isStepDisabled
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
                            disabled={
                                loading
                                || (!selectedFile && !isEditMode)
                                || formData.title.trim().length < 3
                            }
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
            isStepDisabled={isStepDisabled}
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
