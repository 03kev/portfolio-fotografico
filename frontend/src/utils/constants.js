// API Configuration
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
export const IMAGES_BASE_URL = process.env.REACT_APP_IMAGES_URL || 'http://localhost:5000';

// App Configuration
export const APP_NAME = process.env.REACT_APP_NAME || 'Portfolio Fotografico';
export const APP_VERSION = process.env.REACT_APP_VERSION || '1.0.0';

// Image settings
export const IMAGE_SETTINGS = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  defaultQuality: 0.85,
  thumbnailSize: { width: 400, height: 300 },
  maxImageSize: { width: 1920, height: 1080 }
};

// Map settings
export const MAP_SETTINGS = {
  defaultCenter: [20, 0],
  defaultZoom: 2,
  maxZoom: 18,
  minZoom: 2
};

// Animation settings
export const ANIMATION_SETTINGS = {
  duration: {
    fast: 0.2,
    normal: 0.3,
    slow: 0.5
  },
  easing: 'ease-out'
};

// Breakpoints for responsive design
export const BREAKPOINTS = {
  mobile: '480px',
  tablet: '768px',
  desktop: '1024px',
  wide: '1200px'
};

// Z-index values
export const Z_INDEX = {
  dropdown: 1000,
  modal: 1001,
  toast: 1002,
  tooltip: 1003
};

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Errore di connessione. Verifica la tua connessione internet.',
  FILE_TOO_LARGE: 'Il file è troppo grande. Massimo 10MB.',
  INVALID_FILE_TYPE: 'Tipo di file non supportato. Usa JPG, PNG o WebP.',
  UPLOAD_FAILED: 'Errore durante il caricamento. Riprova.',
  GENERIC_ERROR: 'Si è verificato un errore imprevisto.'
};

// Success messages
export const SUCCESS_MESSAGES = {
  UPLOAD_SUCCESS: 'Foto caricata con successo!',
  DELETE_SUCCESS: 'Foto eliminata con successo!',
  UPDATE_SUCCESS: 'Foto aggiornata con successo!'
};
