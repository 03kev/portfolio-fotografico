import React from 'react';
import { FolderOpen } from 'lucide-react';
import {
  PHOTO_UPLOAD_ACCEPT,
  PHOTO_UPLOAD_HINT
} from '@portfolio/photo-upload-contract';

const UploadStep = ({
  loading,
  selectedFile,
  preview,
  fileInputRef,
  handleFileSelect
}) => (
  <div className="step-content">
    <div className="upload-stage-card">
      <div className="step-section-intro">
        <span className="step-section-kicker">Source privata</span>
        <h3>Carica il file di partenza</h3>
        <p>Il file originale resta nel bucket privato. Da qui vengono generate full-res, thumbnail e social image.</p>
      </div>
      <div
        className={`upload-area ${selectedFile ? 'has-file' : ''}`}
        role="button"
        tabIndex={loading ? -1 : 0}
        aria-label={selectedFile ? 'Cambia immagine selezionata' : "Seleziona un'immagine"}
        aria-disabled={loading}
        onClick={() => !loading && fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (loading || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          fileInputRef.current?.click();
        }}
      >
        {preview ? (
          <div className="preview-container">
            <img src={preview} alt="Preview" className="preview-image" />
            <div className="preview-overlay">
              <button type="button" className="change-image-btn">Cambia immagine</button>
            </div>
          </div>
        ) : (
          <div className="upload-placeholder">
            <div className="upload-icon">
              <FolderOpen size={28} />
            </div>
            <p>Clicca per selezionare un'immagine</p>
            <p className="upload-hint">{PHOTO_UPLOAD_HINT}</p>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={PHOTO_UPLOAD_ACCEPT}
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </div>
  </div>
);

export default UploadStep;
