import React from 'react';
import { PencilLine, Upload, X } from 'lucide-react';
import { useAdaptiveHeaderPill } from '../../hooks/useAdaptiveHeaderPill';

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
}) => {
  const stepFullLabel = `Step ${currentStepIndex + 1}/${steps.length}`;
  const stepShortLabel = `${currentStepIndex + 1}/${steps.length}`;
  const {
    mode: progressPillMode,
    cardRef,
    headerRef,
    headerCopyRef,
    toplineRef,
    leadingRef,
    trailingRef,
    fullMeasureRef,
    shortMeasureRef
  } = useAdaptiveHeaderPill({
    enabled: true,
    fullLabel: stepFullLabel,
    shortLabel: stepShortLabel
  });

  return (
  <div className="photo-upload-modal" onClick={onBackdropClick}>
    <div ref={cardRef} className={`photo-upload-container${isClosing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div ref={headerRef} className="upload-header">
        <div ref={headerCopyRef} className="upload-header-copy">
          <div ref={toplineRef} className="upload-header-topline">
            <span ref={leadingRef} className="upload-eyebrow">{isEditMode ? 'Editor foto' : 'Nuovo upload'}</span>
            {progressPillMode !== 'hidden' && (
              <span className="upload-progress-pill">
                {progressPillMode === 'short' ? stepShortLabel : stepFullLabel}
              </span>
            )}
            <span className="upload-progress-pill-measures" aria-hidden="true">
              <span ref={fullMeasureRef} className="upload-progress-pill upload-progress-pill-measure">
                {stepFullLabel}
              </span>
              <span ref={shortMeasureRef} className="upload-progress-pill upload-progress-pill-measure">
                {stepShortLabel}
              </span>
            </span>
          </div>
          <h2 className="upload-header-title">
            <span className="upload-header-title-inner">
              <span className="upload-header-title-icon" aria-hidden="true">
                {isEditMode ? <PencilLine size={18} /> : <Upload size={18} />}
              </span>
              <span className="upload-header-title-text">
                {isEditMode ? 'Modifica Foto' : 'Carica Nuova Foto'}
              </span>
            </span>
          </h2>
          <p className="upload-header-subtitle">
            <strong>{currentStepLabel}</strong>
            {currentStepDescription ? ` · ${currentStepDescription}` : ''}
          </p>
        </div>
        <button
          ref={trailingRef}
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
};

export default PhotoUploadShell;
