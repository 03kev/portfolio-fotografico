import { lazy } from 'react';

// Keep each admin-only import in one module so every entry point reuses the
// same async chunk instead of producing a separate copy of the upload flow.
export const LazyPhotoUpload = lazy(() => import('./PhotoUpload'));
export const LazyPhotoCropModal = lazy(() => import('./PhotoCropModal'));
export const LazyAdminTokenModal = lazy(() => import('./AdminTokenModal'));
