import {
  buildPhotoOperationStatus,
  getPhotoOperationProgress
} from '../utils/photoOperationStatus';

describe('photoOperationStatus', () => {
  test('builds consistent status milestones while allowing measured progress', () => {
    const status = buildPhotoOperationStatus('replaceSource', 'upload', { percent: 52 });

    expect(status).toEqual({
      percent: 52,
      label: 'Caricamento nuovo originale',
      step: 'upload'
    });
  });

  test('clamps progress and exposes an accessible description', () => {
    const presentation = getPhotoOperationProgress({
      type: 'crop',
      label: 'Rigenerazione varianti',
      percent: 140
    });

    expect(presentation.percent).toBe(100);
    expect(presentation.progressLabel).toBe('Completata');
    expect(presentation.ariaValueText).toContain('Ritaglio foto');
  });
});
