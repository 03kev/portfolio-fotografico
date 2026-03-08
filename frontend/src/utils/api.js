import axios from 'axios';
import { API_BASE_URL } from './constants';

const DEFAULT_SIGNED_UPLOAD_TIMEOUT_MS = 30000;

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

function compactText(value, maxLength = 240) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function normalizeApiError(error) {
  const responseData = error?.response?.data;
  const status = Number(error?.response?.status || 0) || null;
  const base = responseData && typeof responseData === 'object' ? responseData : {};
  const fallbackMessage = compactText(
    typeof responseData === 'string' ? responseData : (error?.message || '')
  );

  return {
    ...base,
    status,
    code: base?.code || error?.code || null,
    message: compactText(base?.message || base?.error || fallbackMessage || 'Si è verificato un errore imprevisto'),
    isAxiosError: Boolean(error?.isAxiosError)
  };
}

async function extractUploadFailureDetail(response) {
  const responseType = String(response?.headers?.get('content-type') || '').toLowerCase();

  try {
    if (responseType.includes('application/json')) {
      const payload = await response.json();
      return compactText(payload?.message || payload?.error || '');
    }
    const text = await response.text();
    return compactText(text.replace(/<[^>]+>/g, ' '));
  } catch {
    return '';
  }
}

// Interceptor per le risposte
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Error:', error);

    return Promise.reject(normalizeApiError(error));
  }
);

// Servizi per le foto
export const photoService = {
  // Ottieni tutte le foto
  getAll: () => api.get('/photos'),
  
  // Ottieni foto per ID
  getById: (id) => api.get(`/photos/${id}`),

  // Genera URL firmata per upload diretto su R2
  getUploadUrl: (payload) => api.post('/photos/upload-url', payload),
  
  // Upload nuova foto
  upload: (formData) => {
    return api.post('/photos', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // Crea foto salvando solo metadata (file gia` caricato su R2)
  create: (data) => api.post('/photos', data),
  
  // Aggiorna foto
  update: (id, data) => api.put(`/photos/${id}`, data),

  // Rigenera derivate pubbliche da source full-res
  regenerateDerivatives: (id) => api.post(`/photos/${id}/regenerate-derivatives`),

  // Sostituisce la source privata e rigenera tutte le derivate pubbliche
  replaceSource: (id, data) => api.post(`/photos/${id}/replace-source`, data),
  
  // Elimina foto
  delete: (id) => api.delete(`/photos/${id}`),
  
  // Cerca foto
  search: (query) => api.get(`/photos/search?q=${encodeURIComponent(query)}`),
  
  // Filtra per tag
  filterByTag: (tag) => api.get(`/photos/tag/${encodeURIComponent(tag)}`),
  
  // Filtra per posizione
  filterByLocation: (location) => api.get(`/photos/location/${encodeURIComponent(location)}`),
};

// Servizi per le serie fotografiche
export const seriesService = {
  // Ottieni tutte le serie
  getAll: (includeUnpublished = false) => api.get(`/series?all=${includeUnpublished}`),
  
  // Ottieni serie per slug o ID
  getBySlug: (slug) => api.get(`/series/${slug}`),
  
  // Crea nuova serie
  create: (data) => api.post('/series', data),
  
  // Aggiorna serie
  update: (id, data) => api.put(`/series/${id}`, data),
  
  // Elimina serie
  delete: (id) => api.delete(`/series/${id}`),
  
  // Aggiungi foto a serie
  addPhoto: (seriesId, photoId) => api.post(`/series/${seriesId}/photos/${photoId}`),
  
  // Rimuovi foto da serie
  removePhoto: (seriesId, photoId) => api.delete(`/series/${seriesId}/photos/${photoId}`),
};

// Servizi per le statistiche (future implementazioni)
export const statsService = {
  getDashboard: () => api.get('/stats/dashboard'),
  getPhotoStats: () => api.get('/stats/photos'),
  getLocationStats: () => api.get('/stats/locations'),
};

export const authService = {
  getSession: () => api.get('/auth/session'),
  login: (token) => api.post('/auth/session', { token }),
  logout: () => api.delete('/auth/session'),
};

export async function signSourceUpload({ uploadId, file }) {
  const response = await photoService.getUploadUrl({
    uploadId: String(uploadId),
    variant: 'source',
    mimetype: file?.type,
    fileSize: file?.size
  });
  const signedData = response?.data?.data || response?.data;

  if (!signedData?.uploadUrl || !signedData?.sourcePath) {
    const error = new Error('URL di upload source non valida ricevuta dal server.');
    error.code = 'UPLOAD_SIGN_INVALID_RESPONSE';
    throw error;
  }

  return signedData;
}

export async function uploadSourceToSignedUrl({
  uploadUrl,
  file,
  timeoutMs = DEFAULT_SIGNED_UPLOAD_TIMEOUT_MS
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file?.type || 'application/octet-stream',
        'Cache-Control': 'private, no-store'
      },
      body: file,
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await extractUploadFailureDetail(response);
      const error = new Error(
        detail
          ? `Upload source fallito (${response.status}): ${detail}`
          : `Upload source fallito (${response.status}).`
      );
      error.status = response.status;
      error.code = 'SIGNED_UPLOAD_FAILED';
      throw error;
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Timeout upload source dopo ${Math.round(timeoutMs / 1000)}s.`);
      timeoutError.code = 'UPLOAD_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Utility functions
export const uploadUtils = {
  // Valida file immagine
  validateImageFile: (file) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 50 * 1024 * 1024; // 50MB
    
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Tipo di file non supportato. Usa JPG, PNG o WebP.');
    }
    
    if (file.size > maxSize) {
      throw new Error('File troppo grande. Massimo 50MB.');
    }
    
    return true;
  }
};

// Error handling utilities
export const errorUtils = {
  getErrorMessage: (error) => {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.data?.message) return error.data.message;
    return 'Si è verificato un errore imprevisto';
  },
  
  isNetworkError: (error) => {
    if (error?.code === 'UPLOAD_TIMEOUT') return true;
    return !error?.status && !error?.response && error?.request;
  },
  
  isServerError: (error) => {
    const status = Number(error?.status || error?.response?.status || 0);
    return status >= 500;
  },
  
  isClientError: (error) => {
    const status = Number(error?.status || error?.response?.status || 0);
    return status >= 400 && status < 500;
  }
};

export default api;
