function requireEnv(name) {
  if (process.env[name] === undefined) {
    throw new Error(`[config] Missing environment variable: ${name}`);
  }
  return String(process.env[name]).trim();
}

// API/Assets Configuration
export const API_BASE_URL = requireEnv('REACT_APP_API_BASE_URL');
export const IMAGES_BASE_URL = requireEnv('REACT_APP_IMAGES_BASE_URL');

// Network/timeout configuration (ms)
export const NETWORK_TIMEOUTS = Object.freeze({
  apiDefaultMs: 30000, // 30s
  signedUploadMs: 60000,
  replaceSourceMs: 120000,
  regenerateDerivativesMs: 60000
});

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

// Z-index values
export const Z_INDEX = {
  dropdown: 1000,
  modal: 1001,
  toast: 1002,
  tooltip: 1003
};
