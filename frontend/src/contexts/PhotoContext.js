import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { photoService } from '../utils/api';

const PhotoContext = createContext();

// Actions
const ACTIONS = {
    SET_LOADING: 'SET_LOADING',
    SET_PHOTOS: 'SET_PHOTOS',
    SET_ERROR: 'SET_ERROR',
    SET_SELECTED_PHOTO: 'SET_SELECTED_PHOTO',
    SET_MODAL_OPEN: 'SET_MODAL_OPEN',
    SET_NAVIGATING_TO_MAP: 'SET_NAVIGATING_TO_MAP',
    SET_GALLERY_PHOTOS: 'SET_GALLERY_PHOTOS',
    SET_GALLERY_MODAL_OPEN: 'SET_GALLERY_MODAL_OPEN',
    ADD_PHOTO: 'ADD_PHOTO',
    UPDATE_PHOTO: 'UPDATE_PHOTO',
    DELETE_PHOTO: 'DELETE_PHOTO',
    SET_MAP_CENTER: 'SET_MAP_CENTER',
    SET_FILTER: 'SET_FILTER',
    SET_PENDING_MAP_FOCUS: 'SET_PENDING_MAP_FOCUS',
    SET_PHOTO_OP_STATUS: 'SET_PHOTO_OP_STATUS',
    CLEAR_PHOTO_OP_STATUS: 'CLEAR_PHOTO_OP_STATUS',
    ADD_PENDING_UPLOAD: 'ADD_PENDING_UPLOAD',
    UPDATE_PENDING_UPLOAD: 'UPDATE_PENDING_UPLOAD',
    REMOVE_PENDING_UPLOAD: 'REMOVE_PENDING_UPLOAD'
};

// Initial State
const initialState = {
    photos: [],
    loading: true,
    error: null,
    selectedPhoto: null,
    modalOpen: false,
    navigatingToMap: false,
    galleryPhotos: [],
    galleryModalOpen: false,
    mapCenter: [20, 0],
    mapZoom: 2,
    filters: {
        search: '',
        tags: [],
        location: ''
    },
    pendingMapFocus: null,
    photoOpsByPhotoId: {},
    pendingUploads: []
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
        
        case ACTIONS.SET_NAVIGATING_TO_MAP:
        return {
            ...state,
            navigatingToMap: action.payload
        };
        
        case ACTIONS.SET_GALLERY_PHOTOS:
        return {
            ...state,
            galleryPhotos: action.payload
        };
        
        case ACTIONS.SET_GALLERY_MODAL_OPEN:
        return {
            ...state,
            galleryModalOpen: action.payload,
            galleryPhotos: action.payload ? state.galleryPhotos : []
        };
        
        case ACTIONS.ADD_PHOTO:
        {
        const newPhoto = action.payload;
        const isSameId = (photo) => String(photo?.id) === String(newPhoto?.id);
        return {
            ...state,
            photos: [newPhoto, ...state.photos.filter((photo) => !isSameId(photo))],
            selectedPhoto: isSameId(state.selectedPhoto) ? newPhoto : state.selectedPhoto,
            galleryPhotos: [newPhoto, ...state.galleryPhotos.filter((photo) => !isSameId(photo))],
            pendingMapFocus: isSameId(state.pendingMapFocus) ? newPhoto : state.pendingMapFocus
        };
        }
        
        case ACTIONS.UPDATE_PHOTO:
        {
        const updatedPhoto = action.payload;
        const sameId = (photo) => String(photo?.id) === String(updatedPhoto?.id);
        return {
            ...state,
            photos: state.photos.map(photo => 
                sameId(photo) ? updatedPhoto : photo
            ),
            selectedPhoto: sameId(state.selectedPhoto) ? updatedPhoto : state.selectedPhoto,
            galleryPhotos: state.galleryPhotos.map(photo =>
                sameId(photo) ? updatedPhoto : photo
            ),
            pendingMapFocus: sameId(state.pendingMapFocus) ? updatedPhoto : state.pendingMapFocus
        };
        }
        
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
        
        case ACTIONS.SET_PENDING_MAP_FOCUS:
        return {
            ...state,
            pendingMapFocus: action.payload
        };

        case ACTIONS.SET_PHOTO_OP_STATUS:
        {
        const { photoId, patch } = action.payload || {};
        const key = String(photoId || '').trim();
        if (!key) return state;

        return {
            ...state,
            photoOpsByPhotoId: {
                ...state.photoOpsByPhotoId,
                [key]: {
                    ...(state.photoOpsByPhotoId[key] || {}),
                    ...(patch || {})
                }
            }
        };
        }

        case ACTIONS.CLEAR_PHOTO_OP_STATUS:
        {
        const key = String(action.payload || '').trim();
        if (!key || !state.photoOpsByPhotoId[key]) return state;
        const nextPhotoOpsByPhotoId = { ...state.photoOpsByPhotoId };
        delete nextPhotoOpsByPhotoId[key];
        return {
            ...state,
            photoOpsByPhotoId: nextPhotoOpsByPhotoId
        };
        }

        case ACTIONS.ADD_PENDING_UPLOAD:
        {
        const payload = action.payload || {};
        const key = String(payload.id || '').trim();
        if (!key) return state;
        const nextPending = [
            payload,
            ...state.pendingUploads.filter((entry) => String(entry?.id || '') !== key)
        ];
        return {
            ...state,
            pendingUploads: nextPending
        };
        }

        case ACTIONS.UPDATE_PENDING_UPLOAD:
        {
        const payload = action.payload || {};
        const key = String(payload.id || '').trim();
        if (!key) return state;
        const hasExisting = state.pendingUploads.some((entry) => String(entry?.id || '') === key);
        if (!hasExisting) return state;
        return {
            ...state,
            pendingUploads: state.pendingUploads.map((entry) => (
                String(entry?.id || '') === key
                    ? { ...entry, ...(payload.patch || {}) }
                    : entry
            ))
        };
        }

        case ACTIONS.REMOVE_PENDING_UPLOAD:
        {
        const key = String(action.payload || '').trim();
        if (!key) return state;
        return {
            ...state,
            pendingUploads: state.pendingUploads.filter((entry) => String(entry?.id || '') !== key)
        };
        }
        
        default:
        return state;
    }
}

// Provider Component
export function PhotoProvider({ children }) {
    const [state, dispatch] = useReducer(photoReducer, initialState);
    const focusHandlerRef = useRef(null);
    const lastFetchTimeRef = useRef(0);
    
    // Actions
    const actions = {
        // Fetch photos from API with debouncing
        fetchPhotos: async ({ force = false } = {}) => {
            // Evita fetch multipli troppo ravvicinati
            const now = Date.now();
            if (!force && now - lastFetchTimeRef.current < 500) {
                console.log('Fetch troppo ravvicinato, ignorato');
                return;
            }
            
            lastFetchTimeRef.current = now;
            
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
        closePhotoModal: (navigatingToMap = false) => {
            if (navigatingToMap) {
                dispatch({ type: ACTIONS.SET_NAVIGATING_TO_MAP, payload: true });
            }
            dispatch({ type: ACTIONS.SET_MODAL_OPEN, payload: false });
        },
        
        // Open gallery modal for clusters
        openGalleryModal: (photos) => {
            dispatch({ type: ACTIONS.SET_GALLERY_PHOTOS, payload: photos });
            dispatch({ type: ACTIONS.SET_GALLERY_MODAL_OPEN, payload: true });
        },
        
        // Close gallery modal
        closeGalleryModal: () => {
            dispatch({ type: ACTIONS.SET_GALLERY_MODAL_OPEN, payload: false });
        },
        
        // Set map center
        setMapCenter: (lat, lng, zoom = 10) => {
            dispatch({ 
                type: ACTIONS.SET_MAP_CENTER, 
                payload: { center: [lat, lng], zoom } 
            });
        },
        
        // permetti di registrare il focus handler
        registerFocusHandler: handler => { focusHandlerRef.current = handler },
        // e di richiamarlo
        focusOnPhoto: photo => {
            if (typeof focusHandlerRef.current === 'function')
                focusHandlerRef.current(photo);
        },
        
        // Add new photo
        addPhoto: async (photoData) => {
            try {
                dispatch({ type: ACTIONS.SET_LOADING, payload: true });
                const isFormData = typeof FormData !== 'undefined' && photoData instanceof FormData;
                const response = isFormData
                    ? await photoService.upload(photoData)
                    : await photoService.create(photoData);
                const newPhoto = response.data?.data || response.data;

                dispatch({ type: ACTIONS.ADD_PHOTO, payload: newPhoto });
                dispatch({ type: ACTIONS.SET_LOADING, payload: false });
                
                // Emetti evento per notificare altri contesti
                window.dispatchEvent(new CustomEvent('photoAdded', { detail: { photo: newPhoto } }));
                
                return newPhoto;
            } catch (error) {
                console.error('Error adding photo:', error);
                dispatch({ type: ACTIONS.SET_ERROR, payload: 'Errore durante il caricamento della foto' });
                throw error;
            }
        },

        // Create a photo without toggling global loading (for background flows)
        createPhotoInBackground: async (photoData) => {
            try {
                const isFormData = typeof FormData !== 'undefined' && photoData instanceof FormData;
                const response = isFormData
                    ? await photoService.upload(photoData)
                    : await photoService.create(photoData);
                const newPhoto = response.data?.data || response.data;

                dispatch({ type: ACTIONS.ADD_PHOTO, payload: newPhoto });
                window.dispatchEvent(new CustomEvent('photoAdded', { detail: { photo: newPhoto } }));

                return newPhoto;
            } catch (error) {
                console.error('Error creating photo in background:', error);
                throw error;
            }
        },
        
        // Update photo
        updatePhoto: async (photoId, photoData) => {
            try {
                dispatch({ type: ACTIONS.SET_LOADING, payload: true });
                const response = await photoService.update(photoId, photoData);
                const updatedPhoto = response.data?.data || response.data;
                
                dispatch({ type: ACTIONS.UPDATE_PHOTO, payload: updatedPhoto });
                dispatch({ type: ACTIONS.SET_LOADING, payload: false });
                
                return updatedPhoto;
            } catch (error) {
                console.error('Error updating photo:', error);
                dispatch({ type: ACTIONS.SET_ERROR, payload: 'Errore durante l\'aggiornamento della foto' });
                throw error;
            }
        },

        // Apply a photo update already returned by an API call
        applyPhotoUpdate: (updatedPhoto) => {
            if (!updatedPhoto || updatedPhoto.id === undefined || updatedPhoto.id === null) return;
            dispatch({ type: ACTIONS.UPDATE_PHOTO, payload: updatedPhoto });
        },
        
        // Delete photo
        deletePhoto: async (photoId) => {
            try {
                await photoService.delete(photoId);
                dispatch({ type: ACTIONS.DELETE_PHOTO, payload: photoId });
                
                // Emetti evento per notificare altri contesti
                window.dispatchEvent(new CustomEvent('photoDeleted', { detail: { photoId } }));
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
        },
        
        // Reset navigating to map flag
        resetNavigatingToMap: () => {
            dispatch({ type: ACTIONS.SET_NAVIGATING_TO_MAP, payload: false });
        },
        
        // Set pending map focus photo
        setPendingMapFocus: (photo) => {
            dispatch({ type: ACTIONS.SET_PENDING_MAP_FOCUS, payload: photo });
        },
        
        // Clear pending map focus
        clearPendingMapFocus: () => {
            dispatch({ type: ACTIONS.SET_PENDING_MAP_FOCUS, payload: null });
        },

        // Track long-running card operations (source reupload, crop regenerate) globally
        setPhotoOpStatus: (photoId, patch) => {
            if (photoId === undefined || photoId === null) return;
            dispatch({
                type: ACTIONS.SET_PHOTO_OP_STATUS,
                payload: { photoId, patch }
            });
        },

        clearPhotoOpStatus: (photoId) => {
            if (photoId === undefined || photoId === null) return;
            dispatch({
                type: ACTIONS.CLEAR_PHOTO_OP_STATUS,
                payload: photoId
            });
        },

        addPendingUpload: (payload) => {
            dispatch({
                type: ACTIONS.ADD_PENDING_UPLOAD,
                payload
            });
        },

        updatePendingUpload: (id, patch) => {
            dispatch({
                type: ACTIONS.UPDATE_PENDING_UPLOAD,
                payload: { id, patch }
            });
        },

        removePendingUpload: (id) => {
            dispatch({
                type: ACTIONS.REMOVE_PENDING_UPLOAD,
                payload: id
            });
        }
    };
    
    // Load photos on mount
    useEffect(() => {
        actions.fetchPhotos({ force: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    // Filtered photos based on current filters
    const filteredPhotos = state.photos.filter(photo => {
        const { search, tags, location } = state.filters;
        
        // Assicurati che photo abbia le proprietà essenziali (ma description può essere vuota)
        if (!photo.title || !photo.location) {
            return false;
        }
        
        // Search filter - gestisci description vuota
        if (search && !photo.title.toLowerCase().includes(search.toLowerCase()) &&
        !(photo.description || '').toLowerCase().includes(search.toLowerCase()) &&
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
