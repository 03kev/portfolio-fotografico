import { useCallback, useEffect, useMemo, useState } from 'react';

const DEFAULT_STEP_DESCRIPTIONS = {
  1: 'Seleziona il file iniziale da cui generare tutte le derivate pubbliche.',
  2: 'Compila i dati descrittivi e posiziona correttamente lo scatto.',
  3: 'Completa metadati tecnici e organizzazione dei tag.'
};

export const usePhotoUploadWizard = ({
  steps,
  initialStep,
  loading,
  isEditMode,
  selectedFile,
  title,
  tagInput,
  tagInputRef,
  addTag,
  onSubmit,
  setError,
  stepDescriptions = DEFAULT_STEP_DESCRIPTIONS
}) => {
  const [currentStep, setCurrentStep] = useState(initialStep);

  useEffect(() => {
    setCurrentStep(initialStep);
  }, [initialStep]);

  const firstStep = steps[0].id;
  const lastStep = steps[steps.length - 1].id;

  const nextStep = useCallback(() => {
    if (loading) return;

    if (!isEditMode && currentStep === 1 && !selectedFile) {
      setError('Seleziona un\'immagine prima di continuare');
      return;
    }

    if (currentStep === 2 && !title.trim()) {
      setError('Il campo Titolo è obbligatorio');
      return;
    }

    const index = steps.findIndex((step) => step.id === currentStep);
    if (index >= 0 && index < steps.length - 1) {
      setError('');
      setCurrentStep(steps[index + 1].id);
    }
  }, [loading, isEditMode, currentStep, selectedFile, title, steps, setError]);

  const prevStep = useCallback(() => {
    if (loading) return;
    const index = steps.findIndex((step) => step.id === currentStep);
    if (index > 0) {
      setError('');
      setCurrentStep(steps[index - 1].id);
    }
  }, [loading, currentStep, steps, setError]);

  const selectStep = useCallback((stepId) => {
    if (loading) return;
    setError('');
    setCurrentStep(stepId);
  }, [loading, setError]);

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
          selectStep(targetStep);
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
          (currentStep === 2 && !title.trim());
        if (!disabledNext) nextStep();
        return;
      }

      if ((selectedFile || isEditMode) && title.trim() && !loading) {
        onSubmit();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    addTag,
    currentStep,
    isEditMode,
    lastStep,
    loading,
    nextStep,
    onSubmit,
    selectStep,
    selectedFile,
    steps,
    tagInput,
    tagInputRef,
    title
  ]);

  return useMemo(() => {
    const currentStepIndex = Math.max(0, steps.findIndex((step) => step.id === currentStep));
    const currentStepLabel = steps[currentStepIndex]?.label || '';
    const currentStepDescription = stepDescriptions[currentStep] || '';
    const isFirstStep = currentStep === firstStep;
    const isLastStep = currentStep === lastStep;
    const actionsLayoutClass = isLastStep ? ' final-step' : (isFirstStep ? ' single-action' : ' dual-action');
    const isNextDisabled =
      loading ||
      (!isEditMode && currentStep === 1 && !selectedFile) ||
      (currentStep === 2 && !title.trim());

    return {
      currentStep,
      setCurrentStep,
      selectStep,
      nextStep,
      prevStep,
      firstStep,
      lastStep,
      currentStepIndex,
      currentStepLabel,
      currentStepDescription,
      isFirstStep,
      isLastStep,
      actionsLayoutClass,
      isNextDisabled
    };
  }, [
    currentStep,
    selectStep,
    nextStep,
    prevStep,
    firstStep,
    lastStep,
    steps,
    stepDescriptions,
    loading,
    isEditMode,
    selectedFile,
    title
  ]);
};
