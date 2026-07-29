const normalizeTitle = (title) => String(title || '').trim();

export const getPhotoUploadStepBlocker = ({
  targetStep,
  isEditMode,
  selectedFile,
  title
}) => {
  if (targetStep > 1 && !isEditMode && !selectedFile) {
    return {
      step: 1,
      message: 'Seleziona un’immagine prima di continuare'
    };
  }

  if (targetStep > 2) {
    const normalizedTitle = normalizeTitle(title);
    if (!normalizedTitle) {
      return {
        step: 2,
        message: 'Il campo Titolo è obbligatorio'
      };
    }
    if (normalizedTitle.length < 3) {
      return {
        step: 2,
        message: 'Il titolo deve contenere almeno 3 caratteri'
      };
    }
  }

  return null;
};

export const canAccessPhotoUploadStep = (options) => (
  getPhotoUploadStepBlocker(options) === null
);
