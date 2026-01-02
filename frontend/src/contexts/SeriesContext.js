import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { seriesService } from '../utils/api';

const SeriesContext = createContext();

// Actions
const ACTIONS = {
    SET_LOADING: 'SET_LOADING',
    SET_SERIES: 'SET_SERIES',
    SET_ERROR: 'SET_ERROR',
    SET_CURRENT_SERIES: 'SET_CURRENT_SERIES',
    ADD_SERIES: 'ADD_SERIES',
    UPDATE_SERIES: 'UPDATE_SERIES',
    DELETE_SERIES: 'DELETE_SERIES',
    SET_EDIT_MODE: 'SET_EDIT_MODE',
};

// Initial State
const initialState = {
    series: [],
    currentSeries: null,
    loading: true,
    error: null,
    editMode: false,
};

// Reducer
function seriesReducer(state, action) {
    switch (action.type) {
        case ACTIONS.SET_LOADING:
            return {
                ...state,
                loading: action.payload
            };
        
        case ACTIONS.SET_SERIES:
            return {
                ...state,
                series: action.payload,
                loading: false,
                error: null
            };
        
        case ACTIONS.SET_ERROR:
            return {
                ...state,
                error: action.payload,
                loading: false
            };
        
        case ACTIONS.SET_CURRENT_SERIES:
            return {
                ...state,
                currentSeries: action.payload
            };
        
        case ACTIONS.ADD_SERIES:
            return {
                ...state,
                series: [...state.series, action.payload]
            };
        
        case ACTIONS.UPDATE_SERIES:
            return {
                ...state,
                series: state.series.map(s => 
                    s.id === action.payload.id ? action.payload : s
                ),
                currentSeries: state.currentSeries?.id === action.payload.id 
                    ? action.payload 
                    : state.currentSeries
            };
        
        case ACTIONS.DELETE_SERIES:
            return {
                ...state,
                series: state.series.filter(s => s.id !== action.payload),
                currentSeries: state.currentSeries?.id === action.payload 
                    ? null 
                    : state.currentSeries
            };
        
        case ACTIONS.SET_EDIT_MODE:
            return {
                ...state,
                editMode: action.payload
            };
        
        default:
            return state;
    }
}

// Provider Component
export function SeriesProvider({ children }) {
    const [state, dispatch] = useReducer(seriesReducer, initialState);

    const fetchSeries = useCallback(async (includeUnpublished = false) => {
        try {
            dispatch({ type: ACTIONS.SET_LOADING, payload: true });
            const response = await seriesService.getAll(includeUnpublished);
            dispatch({ type: ACTIONS.SET_SERIES, payload: response.data });
        } catch (error) {
            console.error('Errore nel caricamento delle serie:', error);
            dispatch({ type: ACTIONS.SET_ERROR, payload: error.message || 'Errore nel caricamento delle serie' });
        }
    }, []);
    
    // Listen for photo deletion events and refetch series
    useEffect(() => {
        const handlePhotoDeleted = () => {
            fetchSeries();
        };
        
        const handlePhotoAdded = () => {
            fetchSeries();
        };
        
        window.addEventListener('photoDeleted', handlePhotoDeleted);
        window.addEventListener('photoAdded', handlePhotoAdded);
        
        return () => {
            window.removeEventListener('photoDeleted', handlePhotoDeleted);
            window.removeEventListener('photoAdded', handlePhotoAdded);
        };
    }, [fetchSeries]);

    const fetchSeriesBySlug = useCallback(async (slug) => {
        try {
            dispatch({ type: ACTIONS.SET_LOADING, payload: true });
            const response = await seriesService.getBySlug(slug);
            dispatch({ type: ACTIONS.SET_CURRENT_SERIES, payload: response.data });
            dispatch({ type: ACTIONS.SET_LOADING, payload: false });
            return response.data;
        } catch (error) {
            console.error('Errore nel caricamento della serie:', error);
            dispatch({ type: ACTIONS.SET_ERROR, payload: error.message || 'Serie non trovata' });
            throw error;
        }
    }, []);

    // Carica tutte le serie all'avvio
    useEffect(() => {
        fetchSeries();
    }, [fetchSeries]);

    const createSeries = useCallback(async (seriesData) => {
        try {
            const response = await seriesService.create(seriesData);
            dispatch({ type: ACTIONS.ADD_SERIES, payload: response.data });
            return response.data;
        } catch (error) {
            console.error('Errore nella creazione della serie:', error);
            throw error;
        }
    }, []);

    const updateSeries = useCallback(async (id, seriesData) => {
        try {
            const response = await seriesService.update(id, seriesData);
            dispatch({ type: ACTIONS.UPDATE_SERIES, payload: response.data });
            return response.data;
        } catch (error) {
            console.error('Errore nell\'aggiornamento della serie:', error);
            throw error;
        }
    }, []);

    const deleteSeries = useCallback(async (id) => {
        try {
            await seriesService.delete(id);
            dispatch({ type: ACTIONS.DELETE_SERIES, payload: id });
        } catch (error) {
            console.error('Errore nell\'eliminazione della serie:', error);
            throw error;
        }
    }, []);

    const addPhotoToSeries = useCallback(async (seriesId, photoId) => {
        try {
            const response = await seriesService.addPhoto(seriesId, photoId);
            dispatch({ type: ACTIONS.UPDATE_SERIES, payload: response.data });
            return response.data;
        } catch (error) {
            console.error('Errore nell\'aggiunta della foto:', error);
            throw error;
        }
    }, []);

    const removePhotoFromSeries = useCallback(async (seriesId, photoId) => {
        try {
            const response = await seriesService.removePhoto(seriesId, photoId);
            dispatch({ type: ACTIONS.UPDATE_SERIES, payload: response.data });
            return response.data;
        } catch (error) {
            console.error('Errore nella rimozione della foto:', error);
            throw error;
        }
    }, []);

    const setEditMode = useCallback((enabled) => {
        dispatch({ type: ACTIONS.SET_EDIT_MODE, payload: enabled });
    }, []);

    const value = {
        ...state,
        fetchSeries,
        fetchSeriesBySlug,
        createSeries,
        updateSeries,
        deleteSeries,
        addPhotoToSeries,
        removePhotoFromSeries,
        setEditMode,
    };

    return (
        <SeriesContext.Provider value={value}>
            {children}
        </SeriesContext.Provider>
    );
}

// Custom Hook
export function useSeries() {
    const context = useContext(SeriesContext);
    if (!context) {
        throw new Error('useSeries deve essere usato all\'interno di SeriesProvider');
    }
    return context;
}

export default SeriesContext;
