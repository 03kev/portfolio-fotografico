import React from 'react';
import { PencilLine, Upload, X } from 'lucide-react';

const PhotoUploadShell = ({
  isEditMode,
  currentStepIndex,
  steps,
  currentStep,
  currentStepLabel,
  currentStepDescription,
  loading,
  isClosing,
  onInitClose,
  onStepSelect,
  children,
  footer,
  onBackdropClick
}) => (
  <div className="photo-upload-modal" onClick={onBackdropClick}>
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
        <button
          className="close-btn"
          onClick={() => !loading && onInitClose()}
          title="Chiudi"
          aria-label="Chiudi modal"
        >
          <X size={20} strokeWidth={2.2} />
        </button>
      </div>

      <nav className="step-navbar">
        {steps.map((step, index) => (
          <button
            key={step.id}
            className={`${currentStep === step.id ? 'active' : ''}${currentStep > step.id ? ' completed' : ''}`}
            onClick={() => onStepSelect(step.id)}
            disabled={loading}
            aria-current={currentStep === step.id ? 'step' : undefined}
          >
            <span className="step-index">{index + 1}</span>
            <span className="step-text">{step.label}</span>
          </button>
        ))}
      </nav>

      {children}
      {footer}
    </div>
  </div>
);

export default PhotoUploadShell;
