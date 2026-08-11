import {
  PHOTO_METADATA_ADMIN_COVERAGE,
  PHOTO_METADATA_PUBLIC_DETAILS_COVERAGE,
  PHOTO_METADATA_PUBLIC_MAP_COVERAGE,
  PHOTO_METADATA_PUBLIC_SEO_COVERAGE,
  addPhotoTag,
  buildPhotoMetadataFormState,
  hasPhotoCoordinates
} from '../photoMetadataModel';
import {
  PHOTO_METADATA_FIELD_KEYS,
  PHOTO_TAG_MAX_ITEMS,
  assertPhotoMetadataConsumerCoverage,
  assertPhotoMetadataConsumerSet
} from '@portfolio/photo-metadata-contract';

const frontendConsumers = [
  PHOTO_METADATA_ADMIN_COVERAGE,
  PHOTO_METADATA_PUBLIC_DETAILS_COVERAGE,
  PHOTO_METADATA_PUBLIC_SEO_COVERAGE,
  PHOTO_METADATA_PUBLIC_MAP_COVERAGE
];

test('frontend metadata consumers cover every mandatory area', () => {
  expect(assertPhotoMetadataConsumerSet(frontendConsumers, 'frontend')).toBe(true);
});

test('every real frontend consumer fails coverage for a fictitious added or removed field', () => {
  for (const consumer of frontendConsumers) {
    expect(() => assertPhotoMetadataConsumerCoverage(consumer, {
      contractFields: [...PHOTO_METADATA_FIELD_KEYS, 'futureField']
    })).toThrow('futureField');
    expect(() => assertPhotoMetadataConsumerCoverage(consumer, {
      contractFields: PHOTO_METADATA_FIELD_KEYS.filter((key) => key !== 'lens')
    })).toThrow('lens');
  }
});

test('form state preserves geographic zero and proposes today only for a new photo', () => {
  const editState = buildPhotoMetadataFormState({ lat: 0, lng: 0 });
  expect(Object.keys(editState).sort()).toEqual(
    [...PHOTO_METADATA_ADMIN_COVERAGE.handled].sort()
  );
  expect(editState).toMatchObject({
    title: '',
    date: '',
    location: '',
    lat: '0',
    lng: '0'
  });
  expect(buildPhotoMetadataFormState(null, {
    defaultCreateDate: '2026-08-11'
  })).toMatchObject({
    title: '',
    date: '2026-08-11',
    location: ''
  });
  expect(hasPhotoCoordinates({ lat: 0, lng: 0 })).toBe(true);
  expect(hasPhotoCoordinates({ lat: null, lng: null })).toBe(false);
});

test('tag helper enforces the shared limit without truncating or deduplicating silently', () => {
  const maximumTags = Array.from({ length: PHOTO_TAG_MAX_ITEMS }, (_, index) => `tag-${index}`);
  expect(() => addPhotoTag(maximumTags, 'extra')).toThrow(/massimo/);
  expect(() => addPhotoTag(['Roma'], 'roma')).toThrow(/duplicato/i);
});
