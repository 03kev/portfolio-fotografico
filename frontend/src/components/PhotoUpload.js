import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AlertTriangle, FolderOpen, Globe, Loader2, MapPin, PencilLine, Save, Upload } from 'lucide-react';
import { usePhotos } from '../contexts/PhotoContext';
import { signSourceUpload, uploadSourceToSignedUrl, uploadUtils } from '../utils/api';
import MapSelector from './MapSelector';
import { AnimatePresence } from 'framer-motion';
import exifr from 'exifr';
import './PhotoUpload.css';

const METADATA_FILE_ACCEPT = 'image/*,.nef,.nrw,.cr2,.cr3,.arw,.dng,.rw2,.orf,.raf,.pef,.srw,.raw,.tif,.tiff';

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
    const { actions } = usePhotos();
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

    const initClose = () => {
        if (loading) return;
        setIsClosing(true);
        setTimeout(() => onClose?.(), 75);
    };

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

        setLoading(true);
        setError('');

        try {
            const nextSettings = { ...(formData.settings || {}) };
            delete nextSettings.cropFocus;

            if (isEditMode) {
                const updateData = {
                    ...formData,
                    settings: JSON.stringify(nextSettings),
                    tags: formData.tags
                };

                const result = await actions.updatePhoto(photoToEdit.id, updateData);
                if (onUploadSuccess) onUploadSuccess(result);
            } else {
                const photoId = Date.now();
                const signedData = await signSourceUpload({
                    uploadId: String(photoId),
                    file: selectedFile
                });
                await uploadSourceToSignedUrl({
                    uploadUrl: signedData.uploadUrl,
                    file: selectedFile
                });

                const uploadData = {
                    ...formData,
                    photoId,
                    sourcePath: signedData.sourcePath,
                    sourceContentType: selectedFile.type,
                    settings: nextSettings,
                    tags: formData.tags
                };
                const result = await actions.addPhoto(uploadData);

                if (onUploadSuccess) onUploadSuccess(result);
            }

            setFormData({
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
            });
            setSelectedFile(null);
            setPreview(null);
            setTagInput('');
            setCurrentStep(firstStep);
            if (onClose) onClose();
        } catch (err) {
            console.error('Errore upload foto:', err);
            const statusCode = err?.status || err?.code || err?.response?.status || err?.error?.code;
            const isPayloadTooLarge = String(statusCode) === '413';
            const errorMessage = isPayloadTooLarge
                ? 'File troppo grande per l\'upload. Usa upload diretto R2 o riduci la dimensione.'
                : (err?.message || err?.error?.message || 'Errore durante il caricamento');
            setError(errorMessage);
            if (onUploadError) onUploadError(err);
        } finally {
            setLoading(false);
        }
    }, [
        isEditMode,
        selectedFile,
        formData,
        actions,
        photoToEdit,
        onUploadSuccess,
        onUploadError,
        firstStep,
        onClose
    ]);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key !== 'Enter' || loading) return;

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
        handleUpload
    ]);

    const isFirstStep = currentStep === firstStep;
    const isLastStep = currentStep === lastStep;

    const isNextDisabled =
        loading ||
        (!isEditMode && currentStep === 1 && !selectedFile) ||
        (currentStep === 2 && !formData.title.trim());

    return (
        <div className="photo-upload-modal" onClick={() => !loading && initClose()}>
            <div className={`photo-upload-container${isClosing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className="upload-header">
                    <h2>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {isEditMode ? <PencilLine size={18} /> : <Upload size={18} />}
                            {isEditMode ? 'Modifica Foto' : 'Carica Nuova Foto'}
                        </span>
                    </h2>
                    {onClose && (
                        <button className="close-btn" onClick={() => !loading && initClose()} title="Chiudi">
                            ×
                        </button>
                    )}
                </div>

                <nav className="step-navbar">
                    {steps.map((step) => (
                        <button
                            key={step.id}
                            className={currentStep === step.id ? 'active' : ''}
                            onClick={() => {
                                if (!loading) {
                                    setError('');
                                    setCurrentStep(step.id);
                                }
                            }}
                            disabled={loading}
                        >
                            {step.label}
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
                                        <p className="upload-hint">Formati JPG, PNG, WebP - Max 50MB</p>
                                    </div>
                                )}
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
                                        <input
                                            type="number"
                                            step="any"
                                            value={formData.lat}
                                            onChange={(e) => handleInputChange('lat', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Longitudine</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={formData.lng}
                                            onChange={(e) => handleInputChange('lng', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className="step-content">
                            <div className="tech-details">
                                <div className="tech-header-actions">
                                    <h3>Dettagli Tecnici</h3>
                                    <button
                                        type="button"
                                        className="metadata-btn"
                                        onClick={() => metadataFileInputRef.current?.click()}
                                        disabled={loading || metadataLoading}
                                    >
                                        {metadataLoading ? <Loader2 size={16} /> : <FolderOpen size={16} />}
                                        {metadataLoading ? 'Importing...' : 'Import metadata'}
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

                    <div className="upload-actions">
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
