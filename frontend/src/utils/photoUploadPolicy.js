import {
  validatePhotoUploadDeclaration
} from '@portfolio/photo-upload-contract';

export function validateImageFile(file) {
  return validatePhotoUploadDeclaration({
    contentType: file?.type,
    fileSize: file?.size
  });
}
