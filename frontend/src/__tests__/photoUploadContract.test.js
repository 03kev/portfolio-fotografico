import {
  PHOTO_UPLOAD_ACCEPT,
  PHOTO_UPLOAD_FORMATS,
  PHOTO_UPLOAD_HINT,
  PHOTO_UPLOAD_MAX_BYTES,
  PHOTO_UPLOAD_MAX_SIZE_LABEL
} from '@portfolio/photo-upload-contract';
import { validateImageFile } from '../utils/photoUploadPolicy';

test('frontend upload validation consumes the shared policy without a local format list', () => {
  const declaration = validateImageFile({
    type: 'image/jpg',
    size: 2048
  });

  expect(declaration.contentType).toBe('image/jpeg');
  expect(declaration.extension).toBe('jpg');
  expect(PHOTO_UPLOAD_ACCEPT).toContain('.webp');
  expect(PHOTO_UPLOAD_HINT).toContain(`Max ${PHOTO_UPLOAD_MAX_SIZE_LABEL}`);
  expect(PHOTO_UPLOAD_FORMATS.every((format) => (
    PHOTO_UPLOAD_ACCEPT.includes(format.canonicalMimeType)
    && PHOTO_UPLOAD_ACCEPT.includes(`.${format.preferredExtension}`)
    && PHOTO_UPLOAD_HINT.includes(format.label)
  ))).toBe(true);
});

test('frontend rejects the same unsupported and oversized files as the backend contract', () => {
  expect(() => validateImageFile({
    type: 'application/pdf',
    size: 100
  })).toThrow('Tipo di file non supportato');

  expect(() => validateImageFile({
    type: 'image/png',
    size: PHOTO_UPLOAD_MAX_BYTES + 1
  })).toThrow(`Massimo ${PHOTO_UPLOAD_MAX_SIZE_LABEL}`);
});
