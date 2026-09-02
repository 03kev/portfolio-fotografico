import cropContract from '@portfolio/photo-crop-contract';
import {
  CROP_MAX_SCALE,
  CROP_PRESETS,
  DEFAULT_CROP_PROFILE,
  getPresetRatioValue,
  normalizeCropProfile,
  normalizeCropProfiles
} from '../utils/cropEditor';

describe('shared photo crop contract', () => {
  test('frontend exports the exact shared catalog and constraints used by the backend', () => {
    expect(CROP_PRESETS).toBe(cropContract.PHOTO_CROP_PRESETS);
    expect(DEFAULT_CROP_PROFILE).toBe(cropContract.DEFAULT_CROP_PROFILE);
    expect(CROP_MAX_SCALE).toBe(cropContract.CROP_PROFILE_LIMITS.scale.max);
    expect(CROP_PRESETS.length).toBeGreaterThan(0);
    expect(new Set(CROP_PRESETS.map(({ key }) => key)).size).toBe(CROP_PRESETS.length);
    CROP_PRESETS.forEach((preset) => {
      expect(preset).toEqual(expect.objectContaining({
        key: expect.any(String),
        label: expect.any(String),
        shortLabel: expect.any(String),
        width: expect.any(Number),
        height: expect.any(Number),
        ratio: `${preset.width} / ${preset.height}`,
        ratioValue: preset.width / preset.height
      }));
      expect(preset.label).not.toHaveLength(0);
      expect(preset.shortLabel).not.toHaveLength(0);
      expect(normalizeCropProfiles({})).toHaveProperty(
        preset.key,
        DEFAULT_CROP_PROFILE
      );
    });
  });

  test('a newly supplied preset automatically participates in editor normalization and ratios', () => {
    const presets = cropContract.createPhotoCropPresetCatalog([
      ...CROP_PRESETS,
      {
        key: 'panorama',
        label: 'Panorama 2:1',
        shortLabel: '2:1',
        width: 2,
        height: 1
      }
    ]);
    const normalized = normalizeCropProfiles({
      panorama: { x: 0.25, y: 0.75, scale: 1.5 }
    }, presets);

    expect(normalized.panorama).toEqual({ x: 0.25, y: 0.75, scale: 1.5 });
    expect(getPresetRatioValue('panorama', presets)).toBe(2);
  });

  test('valid saved profiles round-trip without losing retired preset data', () => {
    const saved = {
      r43: { x: 0.2, y: 0.7, scale: 1.25 },
      r11: { x: 0.8, y: 0.3, scale: 2 },
      social: { x: 0.4, y: 0.6, scale: 1 },
      retiredPreset: { x: 0.123456, y: 0.654321, scale: 3.75, note: 'legacy' }
    };

    expect(normalizeCropProfiles(saved)).toEqual(saved);
  });

  test('missing or invalid known profiles use the shared default', () => {
    expect(normalizeCropProfile(null)).toEqual(DEFAULT_CROP_PROFILE);
    expect(normalizeCropProfile({ x: 'invalid', y: 0.5, scale: 1 }))
      .toEqual(DEFAULT_CROP_PROFILE);
    expect(normalizeCropProfiles({}).r43).toEqual(DEFAULT_CROP_PROFILE);
  });
});
