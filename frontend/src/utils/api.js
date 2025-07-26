import axios from 'axios';

// Configurazione base axios
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor per le richieste
api.interceptors.request.use(
  (config) => {
    // Aggiungi token di autenticazione se presente
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor per le risposte
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Error:', error);
    
    // Gestione errori specifici
    if (error.response?.status === 401) {
      // Token scaduto, rimuovi e redirect al login
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    
    return Promise.reject(error.response?.data || error.message);
  }
);

// Servizi per le foto
export const photoService = {
  // Ottieni tutte le foto
  getAll: () => api.get('/photos'),
  
  // Ottieni foto per ID
  getById: (id) => api.get(`/photos/${id}`),
  
  // Upload nuova foto
  upload: (formData) => {
    return api.post('/photos', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  // Aggiorna foto
  update: (id, data) => api.put(`/photos/${id}`, data),
  
  // Elimina foto
  delete: (id) => api.delete(`/photos/${id}`),
  
  // Cerca foto
  search: (query) => api.get(`/photos/search?q=${encodeURIComponent(query)}`),
  
  // Filtra per tag
  filterByTag: (tag) => api.get(`/photos/tag/${encodeURIComponent(tag)}`),
  
  // Filtra per posizione
  filterByLocation: (location) => api.get(`/photos/location/${encodeURIComponent(location)}`),
};

// Servizi per le statistiche (future implementazioni)
export const statsService = {
  getDashboard: () => api.get('/stats/dashboard'),
  getPhotoStats: () => api.get('/stats/photos'),
  getLocationStats: () => api.get('/stats/locations'),
};

// Utility functions
export const uploadUtils = {
  // Valida file immagine
  validateImageFile: (file) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Tipo di file non supportato. Usa JPG, PNG o WebP.');
    }
    
    if (file.size > maxSize) {
      throw new Error('File troppo grande. Massimo 10MB.');
    }
    
    return true;
  },
  
  // Crea FormData per upload
  createFormData: (photoData) => {
    const formData = new FormData();
    
    Object.keys(photoData).forEach(key => {
      if (photoData[key] !== undefined && photoData[key] !== null) {
        if (key === 'settings' || key === 'tags') {
          formData.append(key, JSON.stringify(photoData[key]));
        } else {
          formData.append(key, photoData[key]);
        }
      }
    });
    
    return formData;
  },
  
  // Comprimi immagine lato client (opzionale)
  compressImage: (file, quality = 0.8) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        const maxWidth = 1920;
        const maxHeight = 1080;
        
        let { width, height } = img;
        
        // Calcola nuove dimensioni mantenendo aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      
      img.src = URL.createObjectURL(file);
    });
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
    return !error?.response && error?.request;
  },
  
  isServerError: (error) => {
    return error?.response?.status >= 500;
  },
  
  isClientError: (error) => {
    return error?.response?.status >= 400 && error?.response?.status < 500;
  }
};

export default api;
