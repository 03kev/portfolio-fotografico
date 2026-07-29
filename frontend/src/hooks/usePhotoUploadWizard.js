import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  canAccessPhotoUploadStep,
  getPhotoUploadStepBlocker
} from '../utils/photoUploadSteps';

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

  const selectStep = useCallback((stepId) => {
    if (loading) return;

    const blocker = getPhotoUploadStepBlocker({
      targetStep: stepId,
      isEditMode,
      selectedFile,
      title
    });
    if (blocker) {
      setError(blocker.message);
      setCurrentStep(blocker.step);
      return;
    }

    setError('');
    setCurrentStep(stepId);
  }, [isEditMode, loading, selectedFile, setError, title]);

  const nextStep = useCallback(() => {
    if (loading) return;
    const index = steps.findIndex((step) => step.id === currentStep);
    if (index >= 0 && index < steps.length - 1) {
      selectStep(steps[index + 1].id);
    }
  }, [currentStep, loading, selectStep, steps]);

  const prevStep = useCallback(() => {
    if (loading) return;
    const index = steps.findIndex((step) => step.id === currentStep);
    if (index > 0) {
      setError('');
      setCurrentStep(steps[index - 1].id);
    }
  }, [loading, currentStep, steps, setError]);

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
        const targetStep = steps[Number(e.key) - 1]?.id;
        if (targetStep && targetStep !== currentStep) {
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
        nextStep();
        return;
      }

      if ((selectedFile || isEditMode) && title.trim().length >= 3 && !loading) {
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
      !canAccessPhotoUploadStep({
        targetStep: steps[currentStepIndex + 1]?.id ?? currentStep,
        isEditMode,
        selectedFile,
        title
      });
    const isStepDisabled = (stepId) => (
      loading
      || !canAccessPhotoUploadStep({
        targetStep: stepId,
        isEditMode,
        selectedFile,
        title
      })
    );

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
      isNextDisabled,
      isStepDisabled
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
