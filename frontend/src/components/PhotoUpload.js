import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, FolderOpen, Globe, Loader2, MapPin, PencilLine, Save, Upload, X } from 'lucide-react';
import { usePhotos } from '../contexts/PhotoContext';
import { signSourceUpload, uploadSourceToSignedUrl, uploadUtils } from '../utils/api';
import {
    buildOperationErrorMessage
} from '../utils/operationErrors';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import MapSelector from './MapSelector';
import { AnimatePresence } from 'framer-motion';
import exifr from 'exifr';
import './PhotoUpload.css';

const METADATA_FILE_ACCEPT = 'image/*,.nef,.nrw,.cr2,.cr3,.arw,.dng,.rw2,.orf,.raf,.pef,.srw,.raw,.tif,.tiff';

const CREATE_UPLOAD_STEP_LABELS = {
    sign: 'firma URL upload',
    upload: 'upload file su R2',
    create: 'creazione foto'
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

const STEP_DESCRIPTIONS = {
    1: 'Seleziona il file iniziale da cui generare tutte le derivate pubbliche.',
    2: 'Compila i dati descrittivi e posiziona correttamente lo scatto.',
    3: 'Completa metadati tecnici e organizzazione dei tag.'
};

const COORDINATE_STEP = 0.0001;

const PhotoUpload = ({ onUploadSuccess, onUploadError, onClose, photoToEdit }) => {
    const { actions, photoOpsByPhotoId } = usePhotos();
    const isEditMode = Boolean(photoToEdit);
    const steps = useMemo(() => getSteps(isEditMode), [isEditMode]);
    const firstStep = steps[0].id;
    const lastStep = steps[steps.length - 1].id;

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
    const [currentStep, setCurrentStep] = useState(firstStep);
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

    useEffect(() => {
        setCurrentStep(firstStep);
    }, [photoToEdit, firstStep]);

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

    const handleInputChange = (field, value) => {
        setFormData((prev) => {
            if (field.includes('.')) {
                const [parent, child] = field.split('.');
                return { ...prev, [parent]: { ...prev[parent], [child]: value } };
            }
            return { ...prev, [field]: value };
        });
        if (error) setError('');
    };

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

    const removeTag = (tagToRemove) => {
        setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tagToRemove) }));
    };

    const handleTagKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (tagInput.trim()) addTag(tagInput);
        }
    };

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

    const nextStep = useCallback(() => {
        if (loading) return;

        if (!isEditMode && currentStep === 1 && !selectedFile) {
            setError('Seleziona un\'immagine prima di continuare');
            return;
        }
        if (currentStep === 2 && !formData.title.trim()) {
            setError('Il campo Titolo è obbligatorio');
            return;
        }

        const index = steps.findIndex((step) => step.id === currentStep);
        if (index >= 0 && index < steps.length - 1) {
            setError('');
            setCurrentStep(steps[index + 1].id);
        }
    }, [loading, isEditMode, currentStep, selectedFile, formData.title, steps]);

    const prevStep = useCallback(() => {
        if (loading) return;
        const index = steps.findIndex((step) => step.id === currentStep);
        if (index > 0) {
            setError('');
            setCurrentStep(steps[index - 1].id);
        }
    }, [loading, currentStep, steps]);

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
                if (onUploadError) onUploadError({ message: errorMessage });
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
                if (onUploadError) onUploadError({ ...err, message: errorMessage });
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

        let currentStep = 'sign';
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
            currentStep = 'sign';
            actions.setPhotoOpStatus(pendingId, {
                percent: 8,
                label: 'Firma URL upload',
                step: 'sign'
            });
            const signedData = await signSourceUpload({
                uploadId: String(photoId),
                file: selectedFileSnapshot
            });

            currentStep = 'upload';
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
                    const mapped = Math.round(12 + normalized * 66); // 12% -> 78%
                    actions.setPhotoOpStatus(pendingId, { percent: mapped });
                }
            });

            currentStep = 'create';
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
            const errorMessage = buildCreateUploadErrorMessage(err, currentStep);
            if (onUploadError) onUploadError({
                ...err,
                message: errorMessage
            });
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

    useEffect(() => {
        const onKeyDown = (e) => {
            if (loading || e.metaKey || e.ctrlKey || e.altKey) return;

            const activeElement = document.activeElement;
            const isTypingTarget = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.tagName === 'SELECT' ||
                activeElement.isContentEditable
            );

            if (!isTypingTarget && ['1', '2', '3'].includes(e.key)) {
                const targetStep = Number(e.key);
                if (steps.some((step) => step.id === targetStep) && targetStep !== currentStep) {
                    e.preventDefault();
                    setError('');
                    setCurrentStep(targetStep);
                }
                return;
            }

            if (e.key !== 'Enter') return;

            if (tagInputRef.current === document.activeElement) {
                e.preventDefault();
                if (tagInput.trim()) addTag(tagInput);
                return;
            }

            if (currentStep !== lastStep) {
                const disabledNext =
                    (!isEditMode && currentStep === 1 && !selectedFile) ||
                    (currentStep === 2 && !formData.title.trim());
                if (!disabledNext) nextStep();
                return;
            }

            if ((selectedFile || isEditMode) && formData.title.trim() && !loading) {
                handleUpload();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [
        currentStep,
        lastStep,
        loading,
        tagInput,
        selectedFile,
        isEditMode,
        formData.title,
        addTag,
        nextStep,
        handleUpload,
        steps,
        initClose,
        onClose
    ]);

    const isFirstStep = currentStep === firstStep;
    const isLastStep = currentStep === lastStep;
    const currentStepIndex = Math.max(0, steps.findIndex((step) => step.id === currentStep));
    const currentStepLabel = steps[currentStepIndex]?.label || '';
    const currentStepDescription = STEP_DESCRIPTIONS[currentStep] || '';
    const actionsLayoutClass = isLastStep ? ' final-step' : (isFirstStep ? ' single-action' : ' dual-action');

    const isNextDisabled =
        loading ||
        (!isEditMode && currentStep === 1 && !selectedFile) ||
        (currentStep === 2 && !formData.title.trim());

    return (
        <div className="photo-upload-modal" onClick={() => !loading && initClose()}>
            <div className={`photo-upload-container${isClosing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className="upload-header">
                    <div className="upload-header-copy">
                        <div className="upload-header-topline">
                            <span className="upload-eyebrow">{isEditMode ? 'Editor foto' : 'Nuovo upload'}</span>
                            <span className="upload-progress-pill">Step {currentStepIndex + 1}/{steps.length}</span>
                        </div>
                        <h2>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                {isEditMode ? <PencilLine size={18} /> : <Upload size={18} />}
                                {isEditMode ? 'Modifica Foto' : 'Carica Nuova Foto'}
                            </span>
                        </h2>
                        <p className="upload-header-subtitle">
                            <strong>{currentStepLabel}</strong>
                            {currentStepDescription ? ` · ${currentStepDescription}` : ''}
                        </p>
                    </div>
                    {onClose && (
                        <button className="close-btn" onClick={() => !loading && initClose()} title="Chiudi" aria-label="Chiudi modal">
                            <X size={20} strokeWidth={2.2} />
                        </button>
                    )}
                </div>

                <nav className="step-navbar">
                    {steps.map((step, index) => (
                        <button
                            key={step.id}
                            className={`${currentStep === step.id ? 'active' : ''}${currentStep > step.id ? ' completed' : ''}`}
                            onClick={() => {
                                if (!loading) {
                                    setError('');
                                    setCurrentStep(step.id);
                                }
                            }}
                            disabled={loading}
                            aria-current={currentStep === step.id ? 'step' : undefined}
                        >
                            <span className="step-index">{index + 1}</span>
                            <span className="step-text">{step.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="steps-container">
                    <input
                        ref={metadataFileInputRef}
                        type="file"
                        accept={METADATA_FILE_ACCEPT}
                        style={{ display: 'none' }}
                        onChange={handleMetadataFileSelect}
                    />

                    {!isEditMode && currentStep === 1 && (
                        <div className="step-content">
                            <div className="upload-stage-card">
                                <div className="step-section-intro">
                                    <span className="step-section-kicker">Source privata</span>
                                    <h3>Carica il file di partenza</h3>
                                    <p>Il file originale resta nel bucket privato. Da qui vengono generate full-res, thumbnail e social image.</p>
                                </div>
                                <div
                                    className={`upload-area ${selectedFile ? 'has-file' : ''}`}
                                    onClick={() => !loading && fileInputRef.current?.click()}
                                >
                                    {preview ? (
                                        <div className="preview-container">
                                            <img src={preview} alt="Preview" className="preview-image" />
                                            <div className="preview-overlay">
                                                <button className="change-image-btn">Cambia immagine</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="upload-placeholder">
                                            <div className="upload-icon">
                                                <FolderOpen size={28} />
                                            </div>
                                            <p>Clicca per selezionare un'immagine</p>
                                            <p className="upload-hint">Formati JPG, PNG, WebP · Max 50MB</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleFileSelect}
                            />
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className="step-content">
                            <div className="step-section-intro">
                                <span className="step-section-kicker">Contesto</span>
                                <h3>Info e posizione</h3>
                            </div>
                            <div className="form-group">
                                <label>Titolo<span style={{ color: '#999', marginLeft: '2px' }}>*</span></label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => handleInputChange('title', e.target.value)}
                                    placeholder="Es: Tramonto in Toscana"
                                />
                            </div>

                            <div className="form-group">
                                <label>Descrizione</label>
                                <textarea
                                    rows="3"
                                    value={formData.description}
                                    onChange={(e) => handleInputChange('description', e.target.value)}
                                    placeholder="Racconta la storia..."
                                />
                            </div>

                            <div className="location-section">
                                <label>Posizione</label>
                                <div className="location-input-group">
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => handleInputChange('location', e.target.value)}
                                        placeholder="Es: Val d'Orcia, Toscana"
                                    />
                                    <button
                                        className="location-btn gps-btn"
                                        onClick={getCurrentLocation}
                                        disabled={locationLoading || loading}
                                        title="Usa GPS"
                                    >
                                        {locationLoading ? <Loader2 size={16} /> : <MapPin size={16} />}
                                    </button>
                                    <button
                                        className="location-btn map-btn"
                                        onClick={() => setShowMapSelector(true)}
                                        disabled={loading}
                                        title="Mappa"
                                    >
                                        <Globe size={16} />
                                    </button>
                                </div>
                                <div className="coordinates-group">
                                    <div className="form-group">
                                        <label>Latitudine</label>
                                        <div className="number-input-wrapper">
                                            <input
                                                type="number"
                                                step="any"
                                                value={formData.lat}
                                                onChange={(e) => handleInputChange('lat', e.target.value)}
                                            />
                                            <div className="number-input-controls">
                                                <button
                                                    type="button"
                                                    className="number-input-btn"
                                                    onClick={() => adjustCoordinate('lat', COORDINATE_STEP)}
                                                    disabled={loading}
                                                    aria-label="Aumenta latitudine"
                                                >
                                                    <ChevronUp size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="number-input-btn"
                                                    onClick={() => adjustCoordinate('lat', -COORDINATE_STEP)}
                                                    disabled={loading}
                                                    aria-label="Diminuisci latitudine"
                                                >
                                                    <ChevronDown size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Longitudine</label>
                                        <div className="number-input-wrapper">
                                            <input
                                                type="number"
                                                step="any"
                                                value={formData.lng}
                                                onChange={(e) => handleInputChange('lng', e.target.value)}
                                            />
                                            <div className="number-input-controls">
                                                <button
                                                    type="button"
                                                    className="number-input-btn"
                                                    onClick={() => adjustCoordinate('lng', COORDINATE_STEP)}
                                                    disabled={loading}
                                                    aria-label="Aumenta longitudine"
                                                >
                                                    <ChevronUp size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="number-input-btn"
                                                    onClick={() => adjustCoordinate('lng', -COORDINATE_STEP)}
                                                    disabled={loading}
                                                    aria-label="Diminuisci longitudine"
                                                >
                                                    <ChevronDown size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className="step-content">
                            <div className="step-section-intro">
                                <span className="step-section-kicker">Metadata</span>
                                <h3>Dati tecnici e tag</h3>
                                <p>Definisci metadati tecnici e organizzazione dell'immagine senza cambiare il file caricato.</p>
                            </div>
                            <div className="metadata-import-row">
                                <div className="metadata-import-copy">
                                    <span className="metadata-import-label">Import opzionale</span>
                                    <p>Se il file finale non contiene EXIF, puoi recuperare i dati da un altro scatto o dal RAW originale.</p>
                                </div>
                                <button
                                    type="button"
                                    className="metadata-btn"
                                    onClick={() => metadataFileInputRef.current?.click()}
                                    disabled={loading || metadataLoading}
                                >
                                    {metadataLoading ? <Loader2 size={16} /> : <FolderOpen size={16} />}
                                    {metadataLoading ? 'Importazione...' : 'Importa metadata'}
                                </button>
                            </div>
                            {metadataStatus.message && (
                                <p className={`metadata-status ${metadataStatus.type}`}>
                                    {metadataStatus.message}
                                </p>
                            )}
                            <div className="form-group">
                                <label>Data</label>
                                <input
                                    type="date"
                                    value={formData.date}
                                    onChange={(e) => handleInputChange('date', e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Fotocamera</label>
                                <input
                                    type="text"
                                    value={formData.camera}
                                    placeholder="Es: Canon EOS R5"
                                    onChange={(e) => handleInputChange('camera', e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Obiettivo</label>
                                <input
                                    type="text"
                                    value={formData.lens}
                                    placeholder="Es: RF 24-70mm f/2.8L IS"
                                    onChange={(e) => handleInputChange('lens', e.target.value)}
                                />
                            </div>
                            <div className="settings-row">
                                <div className="form-group">
                                    <label>Apertura</label>
                                    <input
                                        type="text"
                                        value={formData.settings.aperture}
                                        placeholder="es. f/8"
                                        onChange={(e) => handleInputChange('settings.aperture', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Tempo</label>
                                    <input
                                        type="text"
                                        value={formData.settings.shutter}
                                        placeholder="es. 1/125s"
                                        onChange={(e) => handleInputChange('settings.shutter', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>ISO</label>
                                    <input
                                        type="text"
                                        value={formData.settings.iso}
                                        placeholder="es. 100"
                                        onChange={(e) => handleInputChange('settings.iso', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Focale</label>
                                    <input
                                        type="text"
                                        value={formData.settings.focal}
                                        placeholder="es. 35mm"
                                        onChange={(e) => handleInputChange('settings.focal', e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="tags-section">
                                <label>Tag</label>
                                <div className="tags-input-group">
                                    <input
                                        ref={tagInputRef}
                                        type="text"
                                        value={tagInput}
                                        placeholder="Aggiungi tag e premi Invio"
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyPress={handleTagKeyPress}
                                    />
                                    <button type="button" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()}>
                                        +
                                    </button>
                                </div>
                                {formData.tags.length > 0 && (
                                    <div className="tags-list">
                                        {formData.tags.map((tag, idx) => (
                                            <span key={idx} className="tag">
                                                {tag}
                                                <button type="button" onClick={() => removeTag(tag)}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="error-message">
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={16} /> {error}
                            </span>
                        </div>
                    )}

                </div>

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
            </div>
        </div>
    );
};

export default PhotoUpload;
