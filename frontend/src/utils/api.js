import axios from 'axios';
import { API_BASE_URL, NETWORK_TIMEOUTS } from './constants';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: NETWORK_TIMEOUTS.apiDefaultMs,
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
  const baseError = base?.error && typeof base.error === 'object' ? base.error : {};
  const fallbackMessage = compactText(
    typeof responseData === 'string' ? responseData : (error?.message || '')
  );
  const message = compactText(
    base?.message
    || base?.detail
    || baseError?.message
    || baseError?.detail
    || (typeof base?.error === 'string' ? base.error : '')
    || fallbackMessage
    || 'Si è verificato un errore imprevisto'
  );
  const details = base?.details || baseError?.details || null;

  return {
    ...base,
    status,
    code: base?.code || baseError?.code || error?.code || null,
    details,
    message,
    isAxiosError: Boolean(error?.isAxiosError)
  };
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
  regenerateDerivatives: (id) => api.post(
    `/photos/${id}/regenerate-derivatives`,
    {},
    { timeout: NETWORK_TIMEOUTS.regenerateDerivativesMs }
  ),

  // Sostituisce la source privata e rigenera tutte le derivate pubbliche
  replaceSource: (id, data) => api.post(
    `/photos/${id}/replace-source`,
    data,
    { timeout: NETWORK_TIMEOUTS.replaceSourceMs }
  ),
  
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
  timeoutMs = NETWORK_TIMEOUTS.signedUploadMs,
  onProgress,
  signal
}) {
  const probeNetworkReachability = async (urlToProbe) => {
    if (typeof fetch === 'undefined') return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

    const probeController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = probeController
      ? setTimeout(() => probeController.abort(), 2500)
      : null;

    try {
      // no-cors probe: resolves if endpoint is reachable at network level.
      await fetch(urlToProbe, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: probeController?.signal
      });
      return true;
    } catch {
      return false;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let abortListener = null;

    const cleanup = () => {
      if (signal && abortListener) {
        signal.removeEventListener('abort', abortListener);
      }
    };

    const safeResolve = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    xhr.open('PUT', uploadUrl, true);
    xhr.timeout = timeoutMs;

    try {
      xhr.setRequestHeader('Content-Type', file?.type || 'application/octet-stream');
      xhr.setRequestHeader('Cache-Control', 'private, no-store');
    } catch {
      // Non blocchiamo l'upload se il browser rifiuta un header non essenziale.
    }

    xhr.upload.onprogress = (event) => {
      if (typeof onProgress !== 'function' || !event.lengthComputable || event.total <= 0) return;
      const ratio = Math.max(0, Math.min(1, event.loaded / event.total));
      onProgress({
        loaded: event.loaded,
        total: event.total,
        ratio
      });
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (typeof onProgress === 'function') {
          onProgress({ loaded: file?.size || 1, total: file?.size || 1, ratio: 1 });
        }
        safeResolve();
        return;
      }

      const detail = compactText(String(xhr.responseText || '').replace(/<[^>]+>/g, ' '));
      const error = new Error(
        detail
          ? `Upload source fallito (${xhr.status}): ${detail}`
          : `Upload source fallito (${xhr.status}).`
      );
      error.status = xhr.status;
      error.code = 'SIGNED_UPLOAD_FAILED';
      safeReject(error);
    };

    xhr.onerror = async () => {
      const error = new Error('NetworkError durante upload source.');
      error.code = 'UPLOAD_NETWORK_ERROR';
      error.offline = typeof navigator !== 'undefined' && navigator.onLine === false;

      // Best-effort classification: if browser is online and endpoint is reachable,
      // this upload failure is likely caused by CORS/policy/preflight.
      if (!error.offline) {
        const reachable = await probeNetworkReachability(uploadUrl);
        error.endpointReachable = reachable;
        error.likelyCors = reachable === true;
      } else {
        error.endpointReachable = false;
        error.likelyCors = false;
      }
      safeReject(error);
    };

    xhr.ontimeout = () => {
      const timeoutError = new Error(`Timeout upload source dopo ${Math.round(timeoutMs / 1000)}s.`);
      timeoutError.code = 'UPLOAD_TIMEOUT';
      safeReject(timeoutError);
    };

    xhr.onabort = () => {
      const abortError = new Error('Upload source annullato.');
      abortError.code = 'UPLOAD_ABORTED';
      safeReject(abortError);
    };

    if (signal) {
      if (signal.aborted) {
        const abortError = new Error('Upload source annullato.');
        abortError.code = 'UPLOAD_ABORTED';
        safeReject(abortError);
        return;
      }
      abortListener = () => xhr.abort();
      signal.addEventListener('abort', abortListener, { once: true });
    }

    xhr.send(file);
  });
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
