import React, { useState, useRef, useCallback } from 'react';
import { usePhotos } from '../contexts/PhotoContext';
import { uploadUtils } from '../utils/api';
import './PhotoUpload.css';

const PhotoUpload = ({ onUploadSuccess, onClose }) => {
  const { actions } = usePhotos();
  
  const [formData, setFormData] = useState({
    title: '',
    location: '',
    lat: '',
    lng: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    camera: '',
    lens: '',
    settings: {
      aperture: '',
      shutter: '',
      iso: '',
      focal: ''
    },
    tags: []
  });

  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [tagInput, setTagInput] = useState('');
  
  const fileInputRef = useRef(null);
  const mapRef = useRef(null);

  // Gestione selezione file
  const handleFileSelect = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      uploadUtils.validateImageFile(file);
      setSelectedFile(file);
      setError('');

      // Crea preview
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);

      // Prova ad estrarre metadati EXIF per la posizione
      extractImageMetadata(file);

    } catch (err) {
      setError(err.message);
      setSelectedFile(null);
      setPreview(null);
    }
  }, []);

  // Estrai metadati dall'immagine (GPS, camera info)
  const extractImageMetadata = (file) => {
    // Placeholder per estrazione EXIF
    // In un'implementazione reale useresti una libreria come exif-js
    console.log('Estrazione metadati da:', file.name);
  };

  // Ottieni posizione corrente
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocalizzazione non supportata dal browser');
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Reverse geocoding per ottenere l'indirizzo
          const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=it`
          );
          const data = await response.json();

          setFormData(prev => ({
            ...prev,
            lat: latitude.toString(),
            lng: longitude.toString(),
            location: data.locality || data.city || data.countryName || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
          }));
        } catch (err) {
          // Se fallisce il reverse geocoding, usa solo le coordinate
          setFormData(prev => ({
            ...prev,
            lat: latitude.toString(),
            lng: longitude.toString(),
            location: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
          }));
        }
        
        setLocationLoading(false);
      },
      (error) => {
        setError('Impossibile ottenere la posizione corrente');
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Gestione input form
  const handleInputChange = (field, value) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  // Gestione tag
  const addTag = (tag) => {
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
    }
    setTagInput('');
  };

  const removeTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleTagInputKeyPress = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      addTag(tagInput.trim());
    }
  };

  // Upload foto
  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Seleziona un\'immagine');
      return;
    }

    if (!formData.title.trim()) {
      setError('Inserisci un titolo');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const uploadData = uploadUtils.createFormData({
        ...formData,
        image: selectedFile,
        settings: JSON.stringify(formData.settings),
        tags: JSON.stringify(formData.tags)
      });

      const result = await actions.addPhoto(uploadData);

      if (onUploadSuccess) {
        onUploadSuccess(result.data);
      }

      // Reset form
      setFormData({
        title: '',
        location: '',
        lat: '',
        lng: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        camera: '',
        lens: '',
        settings: { aperture: '', shutter: '', iso: '', focal: '' },
        tags: []
      });
      setSelectedFile(null);
      setPreview(null);
      setTagInput('');

      if (onClose) {
        onClose();
      }

    } catch (err) {
      setError(err.message || 'Errore durante l\'upload');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="photo-upload-modal">
      <div className="photo-upload-container">
        <div className="upload-header">
          <h2>📸 Carica Nuova Foto</h2>
          {onClose && (
            <button className="close-btn" onClick={onClose}>×</button>
          )}
        </div>

        <div className="upload-content">
          {/* Sezione Upload File */}
          <div className="upload-section">
            <div 
              className={`upload-area ${selectedFile ? 'has-file' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {preview ? (
                <div className="preview-container">
                  <img src={preview} alt="Preview" className="preview-image" />
                  <div className="preview-overlay">
                    <button className="change-image-btn">
                      Cambia Immagine
                    </button>
                  </div>
                </div>
              ) : (
                <div className="upload-placeholder">
                  <div className="upload-icon">📁</div>
                  <p>Clicca per selezionare un'immagine</p>
                  <p className="upload-hint">JPG, PNG, WebP - Max 10MB</p>
                </div>
              )}
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {/* Form Dettagli */}
          <div className="details-section">
            <div className="form-group">
              <label>Titolo *</label>
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
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Racconta la storia di questa foto..."
                rows="3"
              />
            </div>

            {/* Posizione */}
            <div className="location-section">
              <div className="form-group">
                <label>Posizione</label>
                <div className="location-input-group">
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    placeholder="Es: Val d'Orcia, Toscana, Italia"
                  />
                  <button 
                    type="button"
                    className="location-btn"
                    onClick={getCurrentLocation}
                    disabled={locationLoading}
                  >
                    {locationLoading ? '📍' : '🎯'}
                  </button>
                </div>
              </div>

              <div className="coordinates-group">
                <div className="form-group">
                  <label>Latitudine</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.lat}
                    onChange={(e) => handleInputChange('lat', e.target.value)}
                    placeholder="43.0759"
                  />
                </div>
                <div className="form-group">
                  <label>Longitudine</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.lng}
                    onChange={(e) => handleInputChange('lng', e.target.value)}
                    placeholder="11.6776"
                  />
                </div>
              </div>
            </div>

            {/* Dettagli Tecnici */}
            <div className="tech-details">
              <h3>Dettagli Tecnici</h3>
              
              <div className="form-row">
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
                    onChange={(e) => handleInputChange('camera', e.target.value)}
                    placeholder="Es: Canon EOS R5"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Obiettivo</label>
                <input
                  type="text"
                  value={formData.lens}
                  onChange={(e) => handleInputChange('lens', e.target.value)}
                  placeholder="Es: RF 24-70mm f/2.8L IS USM"
                />
              </div>

              <div className="settings-row">
                <div className="form-group">
                  <label>Apertura</label>
                  <input
                    type="text"
                    value={formData.settings.aperture}
                    onChange={(e) => handleInputChange('settings.aperture', e.target.value)}
                    placeholder="f/8"
                  />
                </div>
                <div className="form-group">
                  <label>Tempo</label>
                  <input
                    type="text"
                    value={formData.settings.shutter}
                    onChange={(e) => handleInputChange('settings.shutter', e.target.value)}
                    placeholder="1/125s"
                  />
                </div>
                <div className="form-group">
                  <label>ISO</label>
                  <input
                    type="text"
                    value={formData.settings.iso}
                    onChange={(e) => handleInputChange('settings.iso', e.target.value)}
                    placeholder="100"
                  />
                </div>
                <div className="form-group">
                  <label>Focale</label>
                  <input
                    type="text"
                    value={formData.settings.focal}
                    onChange={(e) => handleInputChange('settings.focal', e.target.value)}
                    placeholder="35mm"
                  />
                </div>
              </div>
            </div>

            {/* Tag */}
            <div className="tags-section">
              <label>Tag</label>
              <div className="tags-input-group">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={handleTagInputKeyPress}
                  placeholder="Aggiungi tag (premi Invio)"
                />
                <button 
                  type="button"
                  onClick={() => addTag(tagInput.trim())}
                  disabled={!tagInput.trim()}
                >
                  +
                </button>
              </div>
              
              {formData.tags.length > 0 && (
                <div className="tags-list">
                  {formData.tags.map((tag, index) => (
                    <span key={index} className="tag">
                      {tag}
                      <button onClick={() => removeTag(tag)}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Errori */}
            {error && (
              <div className="error-message">
                ⚠️ {error}
              </div>
            )}

            {/* Pulsanti */}
            <div className="upload-actions">
              <button 
                className="upload-btn"
                onClick={handleUpload}
                disabled={loading || !selectedFile}
              >
                {loading ? '📤 Caricamento...' : '📸 Carica Foto'}
              </button>
              
              {onClose && (
                <button 
                  className="cancel-btn"
                  onClick={onClose}
                  disabled={loading}
                >
                  Annulla
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoUpload;