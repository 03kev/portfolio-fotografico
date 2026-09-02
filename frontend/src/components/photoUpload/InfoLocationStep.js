import React from 'react';
import { ChevronDown, ChevronUp, Globe, Loader2, MapPin } from 'lucide-react';
import { getPhotoFieldLimits } from '../../utils/photoMetadataModel';

const COORDINATE_STEP = 0.0001;
const titleLimits = getPhotoFieldLimits('title');
const descriptionLimits = getPhotoFieldLimits('description');
const locationLimits = getPhotoFieldLimits('location');
const latitudeLimits = getPhotoFieldLimits('lat');
const longitudeLimits = getPhotoFieldLimits('lng');

const InfoLocationStep = ({
  formData,
  loading,
  locationLoading,
  handleInputChange,
  getCurrentLocation,
  setShowMapSelector,
  adjustCoordinate
}) => (
  <div className="step-content">
    <div className="step-section-intro">
      <span className="step-section-kicker">Contesto</span>
      <h3>Info e posizione</h3>
    </div>
    <div className="form-group">
      <label>Titolo<span style={{ color: '#999', marginLeft: '2px' }}>*</span></label>
      <input
        type="text"
        required
        minLength={titleLimits.minLength}
        maxLength={titleLimits.maxLength}
        value={formData.title}
        onChange={(e) => handleInputChange('title', e.target.value)}
        placeholder="Es: Tramonto in Toscana"
      />
    </div>

    <div className="form-group">
      <label>Descrizione</label>
      <textarea
        rows="3"
        maxLength={descriptionLimits.maxLength}
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
          maxLength={locationLimits.maxLength}
          value={formData.location}
          onChange={(e) => handleInputChange('location', e.target.value)}
          placeholder="Es: Val d'Orcia, Toscana"
        />
        <button
          type="button"
          className="location-btn gps-btn"
          onClick={getCurrentLocation}
          disabled={locationLoading || loading}
          title="Usa GPS"
        >
          {locationLoading ? <Loader2 size={16} /> : <MapPin size={16} />}
        </button>
        <button
          type="button"
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
              min={latitudeLimits.minimum}
              max={latitudeLimits.maximum}
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
              min={longitudeLimits.minimum}
              max={longitudeLimits.maximum}
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
);

export default InfoLocationStep;
