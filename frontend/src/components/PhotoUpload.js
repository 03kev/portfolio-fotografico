import React, { useState, useRef, useCallback, useEffect } from 'react';import { usePhotos } from '../contexts/PhotoContext';
import { uploadUtils } from '../utils/api';
import MapSelector from './MapSelector';
import exifr from 'exifr';  // Libreria per leggere metadati EXIF [oai_citation:1‡stackoverflow.com](https://stackoverflow.com/questions/59580568/read-exif-data-in-react#:~:text=there%27s%20a%20simple%20library%20for,that%20called%20exifr)
import './PhotoUpload.css';

const PhotoUpload = ({ onUploadSuccess, onUploadError, onClose }) => {
    const { actions } = usePhotos();
    
    // Stato iniziale dei campi del form
    const [formData, setFormData] = useState({
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
    const [selectedFile, setSelectedFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [tagInput, setTagInput] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [showMapSelector, setShowMapSelector] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [isClosing, setIsClosing] = useState(false);
    const totalSteps = 3;
    
    const fileInputRef = useRef(null);
    
    // Disabilita lo scroll della pagina dietro il modal
    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);
    
    // Gestione selezione file (Step 1)
    const handleFileSelect = useCallback((event) => {
        const file = event.target.files[0];
        if (!file) return;
        try {
            uploadUtils.validateImageFile(file);
            setSelectedFile(file);
            setError('');
            
            // Creazione preview immagine selezionata
            const reader = new FileReader();
            reader.onload = e => setPreview(e.target.result);
            reader.readAsDataURL(file);
            
            // Estrazione metadati EXIF (asincrona)
            extractImageMetadata(file);
        } catch (err) {
            setSelectedFile(null);
            setPreview(null);
            setError(err.message || 'File non valido');
        }
    }, []);
    
    // Estrai metadati EXIF dall'immagine selezionata (GPS, camera, obiettivo, ecc.)
    const extractImageMetadata = async (file) => {
        try {
            const exifData = await exifr.parse(file, [
                'Model', 'Make', 'LensModel', 'FNumber', 'ExposureTime', 'ISO', 'FocalLength', 'DateTimeOriginal',
                'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef'
            ]);
            if (!exifData) return;
            // Fotocamera (marca + modello)
            const cameraModel = exifData.Make && exifData.Model 
            ? `${exifData.Make} ${exifData.Model}`.trim() 
            : exifData.Model || '';
            // Obiettivo
            const lensModel = exifData.LensModel || '';
            // Data di scatto
            let photoDate = formData.date;
            if (exifData.DateTimeOriginal) {
                const d = new Date(exifData.DateTimeOriginal);
                if (!isNaN(d.getTime())) {
                    // Format ISO date string (YYYY-MM-DD) dal Date
                    photoDate = d.toISOString().split('T')[0];
                }
            }
            // Impostazioni di scatto
            const aperture = exifData.FNumber ? `f/${exifData.FNumber}` : '';
            let shutter = '';
            if (exifData.ExposureTime) {
                shutter = exifData.ExposureTime.toString();
                // Se ExposureTime è frazione (e.g. 0.008s), convertirla in formato 1/125s se possibile
                if (exifData.ExposureTime < 1 && exifData.ExposureTime > 0) {
                    const inv = Math.round(1 / exifData.ExposureTime);
                    shutter = `1/${inv}s`;
                } else if (exifData.ExposureTime >= 1) {
                    shutter = `${exifData.ExposureTime}s`;
                }
            }
            const iso = exifData.ISO ? exifData.ISO.toString() : '';
            const focal = exifData.FocalLength ? `${exifData.FocalLength}mm` : '';
            
            // Aggiorna stato con i dati estratti
            setFormData(prev => ({
                ...prev,
                date: photoDate,
                camera: cameraModel,
                lens: lensModel,
                settings: { aperture, shutter, iso, focal }
            }));
            
            // Estrazione coordinate GPS (lat, lng in decimali)
            const gps = await exifr.gps(file);  // restituisce { latitude, longitude } se presenti [oai_citation:2‡stackoverflow.com](https://stackoverflow.com/questions/59580568/read-exif-data-in-react#:~:text=there%27s%20a%20simple%20library%20for,that%20called%20exifr)
            if (gps && gps.latitude && gps.longitude) {
                // Reverse geocoding delle coordinate per ottenere nome località
                try {
                    const res = await fetch(
                        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${gps.latitude}&longitude=${gps.longitude}&localityLanguage=it`
                    );
                    const data = await res.json();
                    setFormData(prev => ({
                        ...prev,
                        lat: gps.latitude.toFixed(6).toString(),
                        lng: gps.longitude.toFixed(6).toString(),
                        location: data.locality || data.city || data.principalSubdivision || data.countryName ||
                        `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}`
                    }));
                } catch {
                    // In caso di fallimento del reverse geocode, usare solo coordinate
                    setFormData(prev => ({
                        ...prev,
                        lat: gps.latitude.toFixed(6).toString(),
                        lng: gps.longitude.toFixed(6).toString(),
                        location: `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}`
                    }));
                }
            }
        } catch (err) {
            console.warn('Estrazione metadati EXIF fallita:', err);
            // Non impostiamo error globale perché la mancanza di metadati non è critica per l'utente
        }
    };
    
    // Ottenere posizione corrente via geolocalizzazione (Step 3)
    const getCurrentLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setError('Geolocalizzazione non supportata dal browser');
            return;
        }
        setError('');
        setLocationLoading(true);
        navigator.geolocation.getCurrentPosition(
            async position => {
                const { latitude, longitude } = position.coords;
                try {
                    // Reverse geocoding per ottenere un indirizzo/località leggibile
                    const res = await fetch(
                        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=it`
                    );
                    const data = await res.json();
                    setFormData(prev => ({
                        ...prev,
                        lat: latitude.toFixed(6).toString(),
                        lng: longitude.toFixed(6).toString(),
                        location: data.locality || data.city || data.principalSubdivision || data.countryName ||
                        `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                    }));
                } catch {
                    // In caso di errore, impostiamo comunque lat/long grezzi
                    setFormData(prev => ({
                        ...prev,
                        lat: latitude.toFixed(6).toString(),
                        lng: longitude.toFixed(6).toString(),
                        location: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                    }));
                }
                setLocationLoading(false);
            },
            error => {
                setError('Impossibile ottenere la posizione corrente');
                setLocationLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }, []);
    
    // Callback al ritorno dalla selezione su mappa (MapSelector)
    const handleMapLocationSelect = useCallback((locationData) => {
        if (!locationData) return;
        setFormData(prev => ({
            ...prev,
            lat: locationData.lat.toFixed(6).toString(),
            lng: locationData.lng.toFixed(6).toString(),
            location: locationData.address || `${locationData.lat}, ${locationData.lng}`
        }));
        setShowMapSelector(false);
        setError('');  // cancella eventuali errori precedenti
    }, []);
    
    // Gestione campi input (aggiornamento stato formData)
    const handleInputChange = (field, value) => {
        setFormData(prev => {
            if (field.includes('.')) {
                // per campi annidati come settings.aperture
                const [parent, child] = field.split('.');
                return { ...prev, [parent]: { ...prev[parent], [child]: value } };
            } else {
                return { ...prev, [field]: value };
            }
        });
        // Se l'utente modifica manualmente certi campi, possiamo rimuovere eventuali errori residui
        if (error) setError('');
    };
    
    // Aggiunta e rimozione tag (Step 4)
    const addTag = (tag) => {
        const newTag = tag.trim();
        if (newTag && !formData.tags.includes(newTag)) {
            setFormData(prev => ({ ...prev, tags: [...prev.tags, newTag] }));
        }
        setTagInput('');
    };
    const removeTag = (tagToRemove) => {
        setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tagToRemove) }));
    };
    const handleTagKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (tagInput.trim()) {
                addTag(tagInput);
            }
        }
    };
    
    const initClose = () => {
        if (loading) return;
        setIsClosing(true);
        // durata dell’animazione di chiusura (300ms) + piccola tolleranza
        setTimeout(() => onClose?.(), 75);
    };
    
    // Navigazione Wizard: step successivo
    const nextStep = useCallback(() => {
        if (loading) return;
        // Validazioni prima di avanzare
        if (currentStep === 1 && !selectedFile) {
            setError('Seleziona un\'immagine prima di continuare');
            return;
        }
        if (currentStep === 2 && !formData.title.trim()) {
            setError('Il campo Titolo è obbligatorio');
            return;
        }
        setError('');  // pulisci eventuale messaggio errore precedente
        setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    }, [currentStep, selectedFile, formData.title, loading]);
    
    // Navigazione Wizard: step precedente
    const prevStep = useCallback(() => {
        if (loading) return;
        setError('');
        setCurrentStep(prev => Math.max(prev - 1, 1));
    }, [loading]);
    
    // Upload finale della foto (Step 4 - ultimo step)
    const handleUpload = async () => {
        if (!selectedFile) {
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
            // Prepara FormData per invio (includendo file, campi e convertendo oggetti in JSON string)
            const uploadData = uploadUtils.createFormData({
                ...formData,
                image: selectedFile,
                settings: JSON.stringify(formData.settings),
                tags: JSON.stringify(formData.tags)
            });
            const result = await actions.addPhoto(uploadData);
            // Se upload ha successo, callback esterno
            if (onUploadSuccess) onUploadSuccess(result.data);
            // Reset form e chiudi modal
            setFormData({
                title: '', description: '', date: new Date().toISOString().split('T')[0],
                location: '', lat: '', lng: '', camera: '', lens: '',
                settings: { aperture: '', shutter: '', iso: '', focal: '' },
                tags: []
            });
            setSelectedFile(null);
            setPreview(null);
            setTagInput('');
            setCurrentStep(1);
            if (onClose) onClose();
        } catch (err) {
            console.error('Errore upload foto:', err);
            const errorMessage = err.message || 'Errore durante il caricamento';
            setError(errorMessage);
            if (onUploadError) onUploadError(err);
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div
        className="photo-upload-modal"
        onClick={() => !loading && initClose()}
        >
        <div
        className={`photo-upload-container${isClosing ? ' closing' : ''}`}
        onClick={e => e.stopPropagation()}
        >
        {/* Header Modal */}
        <div className="upload-header">
        <h2>📸 Carica Nuova Foto</h2>
        {onClose && (
            <button
            className="close-btn"
            onClick={() => !loading && initClose()}
            title="Chiudi"
            >
            ×
            </button>
        )}
        </div>
        
        {/* Navbar di navigazione tra gli step */}
        <nav className="step-navbar">
        {['Upload','Info & Posizione','Dettagli'].map((label, idx) => (
            <button
            key={idx}
            className={currentStep === idx+1 ? 'active' : ''}
            onClick={() => {
                if (!loading) {
                    setError('');
                    setCurrentStep(idx+1);
                }
            }}
            disabled={loading}
            >
            {label}
            </button>
        ))}
        </nav>
        
        {/* Contenuto del Wizard */}
        <div className="steps-container">
        {/* Step 1: Selezione immagine */}
        {currentStep === 1 && (
            <div className="step-content">
            <div 
            className={`upload-area ${selectedFile ? 'has-file' : ''}`}
            onClick={() => !loading && fileInputRef.current?.click()}
            >
            {preview ? (
                <div className="preview-container">
                <img src={preview} alt="Preview" className="preview-image" />
                <div className="preview-overlay">
                <button className="change-image-btn">
                Cambia immagine
                </button>
                </div>
                </div>
            ) : (
                <div className="upload-placeholder">
                <div className="upload-icon">📁</div>
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
        
        {/* STEP 2: INFO + POSIZIONE */}
        {currentStep === 2 && (
            <div className="step-content">
            {/* --- Info Foto --- */}
            <div className="form-group">
            <label>Titolo *</label>
            <input
            type="text"
            value={formData.title}
            onChange={e => handleInputChange('title', e.target.value)}
            placeholder="Es: Tramonto in Toscana"
            />
            </div>
            <div className="form-group">
            <label>Descrizione</label>
            <textarea
            rows="3"
            value={formData.description}
            onChange={e => handleInputChange('description', e.target.value)}
            placeholder="Racconta la storia..."
            />
            </div>
            
            {/* --- Posizione Foto --- */}
            <div className="location-section">
            <label>Posizione</label>
            <div className="location-input-group">
            <input
            type="text"
            value={formData.location}
            onChange={e => handleInputChange('location', e.target.value)}
            placeholder="Es: Val d'Orcia, Toscana"
            />
            <button
            className="location-btn gps-btn"
            onClick={getCurrentLocation}
            disabled={locationLoading || loading}
            title="Usa GPS"
            >
            {locationLoading ? '⏳' : '📍'}
            </button>
            <button
            className="location-btn map-btn"
            onClick={() => setShowMapSelector(true)}
            disabled={loading}
            title="Mappa"
            >
            🌍
            </button>
            </div>
            <div className="coordinates-group">
            <div className="form-group">
            <label>Latitudine</label>
            <input
            type="number" step="any"
            value={formData.lat}
            onChange={e => handleInputChange('lat', e.target.value)}
            />
            </div>
            <div className="form-group">
            <label>Longitudine</label>
            <input
            type="number" step="any"
            value={formData.lng}
            onChange={e => handleInputChange('lng', e.target.value)}
            />
            </div>
            </div>
            </div>
            </div>
        )}
        
        {/* Step 3: Dettagli tecnici e Tag */}
        {currentStep === 3 && (
            <div className="step-content">
            <div className="tech-details">
            <h3>Dettagli Tecnici</h3>
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
            type="text"
            value={tagInput}
            placeholder="Aggiungi tag e premi Invio"
            onChange={(e) => setTagInput(e.target.value)}
            onKeyPress={handleTagKeyPress}
            />
            <button 
            type="button"
            onClick={() => addTag(tagInput)}
            disabled={!tagInput.trim()}
            >
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
        
        {/* Messaggio di errore (se presente) */}
        {error && (
            <div className="error-message">
            ⚠️ {error}
            </div>
        )}
        
        {/* Navigazione Wizard / Azioni Upload */}
        <div className="upload-actions">
        {/* Pulsante Indietro */}
        {currentStep > 1 && (
            <button 
            type="button"
            className="cancel-btn" 
            onClick={prevStep} 
            disabled={loading}
            >
            Indietro
            </button>
        )}
        {/* Pulsante Avanti o Carica */}
        {currentStep < totalSteps ? (
            <button 
            type="button"
            className="upload-btn"
            onClick={nextStep}
            disabled={
                loading || 
                (currentStep === 1 && !selectedFile) || 
                (currentStep === 2 && !formData.title.trim())
            }
            >
            Avanti
            </button>
        ) : (
            <>
            <button 
            type="button"
            className="upload-btn"
            onClick={handleUpload}
            disabled={loading || !selectedFile}
            >
            {loading ? '📤 Caricamento...' : '📸 Carica Foto'}
            </button>
            {onClose && (
                <button 
                type="button"
                className="cancel-btn" 
                onClick={onClose} 
                disabled={loading}
                >
                Annulla
                </button>
            )}
            </>
        )}
        </div>
        </div>
        
        {/* Modal Mappa per selezione posizione */}
        {showMapSelector && (
            <MapSelector
            isOpen={showMapSelector}
            onClose={() => setShowMapSelector(false)}
            onLocationSelect={handleMapLocationSelect}
            initialLocation={
                formData.lat && formData.lng 
                ? { lat: parseFloat(formData.lat), lng: parseFloat(formData.lng) } 
                : null
            }
            />
        )}
        </div>
        </div>
    );
};

export default PhotoUpload;