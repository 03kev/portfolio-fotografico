import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { photoService } from '../utils/api';

const PhotoContext = createContext();

// Actions
const ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_PHOTOS: 'SET_PHOTOS',
  SET_ERROR: 'SET_ERROR',
  SET_SELECTED_PHOTO: 'SET_SELECTED_PHOTO',
  SET_MODAL_OPEN: 'SET_MODAL_OPEN',
  ADD_PHOTO: 'ADD_PHOTO',
  DELETE_PHOTO: 'DELETE_PHOTO',
  SET_MAP_CENTER: 'SET_MAP_CENTER',
  SET_FILTER: 'SET_FILTER'
};

// Initial State
const initialState = {
  photos: [],
  loading: true,
  error: null,
  selectedPhoto: null,
  modalOpen: false,
  mapCenter: [20, 0],
  mapZoom: 2,
  filters: {
    search: '',
    tags: [],
    location: ''
  }
};

// Reducer
function photoReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload
      };
    
    case ACTIONS.SET_PHOTOS:
      return {
        ...state,
        photos: action.payload,
        loading: false,
        error: null
      };
    
    case ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false
      };
    
    case ACTIONS.SET_SELECTED_PHOTO:
      return {
        ...state,
        selectedPhoto: action.payload
      };
    
    case ACTIONS.SET_MODAL_OPEN:
      return {
        ...state,
        modalOpen: action.payload,
        selectedPhoto: action.payload ? state.selectedPhoto : null
      };
    
    case ACTIONS.ADD_PHOTO:
      return {
        ...state,
        photos: [action.payload, ...state.photos]
      };
    
    case ACTIONS.DELETE_PHOTO:
      return {
        ...state,
        photos: state.photos.filter(photo => photo.id !== action.payload)
      };
    
    case ACTIONS.SET_MAP_CENTER:
      return {
        ...state,
        mapCenter: action.payload.center,
        mapZoom: action.payload.zoom || state.mapZoom
      };
    
    case ACTIONS.SET_FILTER:
      return {
        ...state,
        filters: {
          ...state.filters,
          ...action.payload
        }
      };
    
    default:
      return state;
  }
}

// Provider Component
export function PhotoProvider({ children }) {
  const [state, dispatch] = useReducer(photoReducer, initialState);

  // Actions
  const actions = {
    // Fetch photos from API
    fetchPhotos: async () => {
      try {
        dispatch({ type: ACTIONS.SET_LOADING, payload: true });
        const response = await photoService.getAll();
        const photos = response.data?.data || response.data || [];
        dispatch({ type: ACTIONS.SET_PHOTOS, payload: photos });
      } catch (error) {
        console.error('Error fetching photos:', error);
        dispatch({ type: ACTIONS.SET_ERROR, payload: 'Errore nel caricamento delle foto' });
      }
    },

    // Open photo modal
    openPhotoModal: (photo) => {
      dispatch({ type: ACTIONS.SET_SELECTED_PHOTO, payload: photo });
      dispatch({ type: ACTIONS.SET_MODAL_OPEN, payload: true });
    },

    // Close photo modal
    closePhotoModal: () => {
      dispatch({ type: ACTIONS.SET_MODAL_OPEN, payload: false });
    },

    // Set map center
    setMapCenter: (lat, lng, zoom = 10) => {
      dispatch({ 
        type: ACTIONS.SET_MAP_CENTER, 
        payload: { center: [lat, lng], zoom } 
      });
    },

    // Focus on photo location
    focusOnPhoto: (photo) => {
      actions.setMapCenter(photo.lat, photo.lng, 12);
      // Scroll to map section
      const mapSection = document.getElementById('mappa');
      if (mapSection) {
        mapSection.scrollIntoView({ behavior: 'smooth' });
      }
    },

    // Add new photo
    addPhoto: async (photoData) => {
      try {
        dispatch({ type: ACTIONS.SET_LOADING, payload: true });
        const response = await photoService.upload(photoData);
        const newPhoto = response.data?.data || response.data;
        
        // Aggiungi immediatamente la foto allo stato locale
        dispatch({ type: ACTIONS.ADD_PHOTO, payload: newPhoto });
        dispatch({ type: ACTIONS.SET_LOADING, payload: false });
        
        // Poi ricarica tutte le foto in background per sicurezza
        setTimeout(() => {
          actions.fetchPhotos();
        }, 1000);
        
        return newPhoto;
      } catch (error) {
        console.error('Error adding photo:', error);
        dispatch({ type: ACTIONS.SET_ERROR, payload: 'Errore durante il caricamento della foto' });
        throw error;
      }
    },

    // Delete photo
    deletePhoto: async (photoId) => {
      try {
        await photoService.delete(photoId);
        dispatch({ type: ACTIONS.DELETE_PHOTO, payload: photoId });
      } catch (error) {
        console.error('Error deleting photo:', error);
        throw error;
      }
    },

    // Set filters
    setFilter: (filterData) => {
      dispatch({ type: ACTIONS.SET_FILTER, payload: filterData });
    },

    // Clear filters
    clearFilters: () => {
      dispatch({ 
        type: ACTIONS.SET_FILTER, 
        payload: { search: '', tags: [], location: '' } 
      });
    }
  };

  // Load photos on mount
  useEffect(() => {
    actions.fetchPhotos();
  }, []);

  // Filtered photos based on current filters
  const filteredPhotos = state.photos.filter(photo => {
    const { search, tags, location } = state.filters;
    
    // Assicurati che photo abbia tutte le proprietà necessarie
    if (!photo.title || !photo.description || !photo.location) {
      return false;
    }
    
    // Search filter
    if (search && !photo.title.toLowerCase().includes(search.toLowerCase()) &&
        !photo.description.toLowerCase().includes(search.toLowerCase()) &&
        !photo.location.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    
    // Tags filter - assicurati che photo.tags sia un array
    if (tags.length > 0) {
      const photoTags = Array.isArray(photo.tags) ? photo.tags : [];
      if (!tags.some(tag => photoTags.includes(tag))) {
        return false;
      }
    }
    
    // Location filter
    if (location && !photo.location.toLowerCase().includes(location.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  const value = {
    ...state,
    filteredPhotos,
    actions
  };

  return (
    <PhotoContext.Provider value={value}>
      {children}
    </PhotoContext.Provider>
  );
}

// Custom hook to use photo context
export function usePhotos() {
  const context = useContext(PhotoContext);
  if (!context) {
    throw new Error('usePhotos must be used within a PhotoProvider');
  }
  return context;
}

export default PhotoContext;
