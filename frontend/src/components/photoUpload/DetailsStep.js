import React from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';
import {
  PHOTO_TAG_MAX_ITEMS,
  getPhotoFieldLimits
} from '../../utils/photoMetadataModel';

const dateLimits = getPhotoFieldLimits('date');
const cameraLimits = getPhotoFieldLimits('camera');
const lensLimits = getPhotoFieldLimits('lens');
const tagLimits = getPhotoFieldLimits('tags');

const DetailsStep = ({
  formData,
  loading,
  metadataLoading,
  metadataStatus,
  metadataFileInputRef,
  handleInputChange,
  tagInput,
  setTagInput,
  tagInputRef,
  handleTagKeyPress,
  addTag,
  removeTag
}) => (
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
        maxLength={dateLimits.maxLength}
        value={formData.date}
        onChange={(e) => handleInputChange('date', e.target.value)}
      />
    </div>
    <div className="form-group">
      <label>Fotocamera</label>
      <input
        type="text"
        maxLength={cameraLimits.maxLength}
        value={formData.camera}
        placeholder="Es: Canon EOS R5"
        onChange={(e) => handleInputChange('camera', e.target.value)}
      />
    </div>
    <div className="form-group">
      <label>Obiettivo</label>
      <input
        type="text"
        maxLength={lensLimits.maxLength}
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
          maxLength={tagLimits.itemMaxLength}
          value={tagInput}
          placeholder="Aggiungi tag e premi Invio"
          onChange={(e) => setTagInput(e.target.value)}
          onKeyPress={handleTagKeyPress}
        />
        <button
          type="button"
          onClick={() => addTag(tagInput)}
          disabled={!tagInput.trim() || formData.tags.length >= PHOTO_TAG_MAX_ITEMS}
        >
          +
        </button>
      </div>
      <small className="tags-limit">
        {formData.tags.length}/{PHOTO_TAG_MAX_ITEMS} tag
      </small>
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
);

export default DetailsStep;
