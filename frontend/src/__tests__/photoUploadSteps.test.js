import {
  canAccessPhotoUploadStep,
  getPhotoUploadStepBlocker
} from '../utils/photoUploadSteps';

describe('photo upload step access', () => {
  test('requires a source file before opening later create steps', () => {
    expect(getPhotoUploadStepBlocker({
      targetStep: 2,
      isEditMode: false,
      selectedFile: null,
      title: ''
    })).toEqual({
      step: 1,
      message: 'Seleziona un’immagine prima di continuare'
    });

    expect(canAccessPhotoUploadStep({
      targetStep: 3,
      isEditMode: false,
      selectedFile: null,
      title: 'Titolo'
    })).toBe(false);
  });

  test('requires a valid title before opening details', () => {
    expect(getPhotoUploadStepBlocker({
      targetStep: 3,
      isEditMode: false,
      selectedFile: {},
      title: '  '
    })?.step).toBe(2);
    expect(getPhotoUploadStepBlocker({
      targetStep: 3,
      isEditMode: true,
      selectedFile: null,
      title: 'ab'
    })?.step).toBe(2);
  });

  test('allows backward navigation and valid forward navigation', () => {
    expect(canAccessPhotoUploadStep({
      targetStep: 1,
      isEditMode: false,
      selectedFile: null,
      title: ''
    })).toBe(true);
    expect(canAccessPhotoUploadStep({
      targetStep: 3,
      isEditMode: false,
      selectedFile: {},
      title: 'Praga'
    })).toBe(true);
  });
});
