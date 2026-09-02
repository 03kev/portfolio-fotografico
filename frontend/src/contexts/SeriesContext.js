import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { seriesService } from '../utils/api';
import {
    buildOperationErrorMessage,
    isAmbiguousMutationError,
    isConcurrencyError
} from '../utils/operationErrors';
import {
    entityMatchesPatch,
    findEntityById,
    includesEntityId
} from '../utils/mutationReconciliation';

const SeriesContext = createContext();

function unwrapApiData(response, fallbackValue = null) {
    if (response?.data?.data !== undefined) return response.data.data;
    if (response?.data !== undefined) return response.data;
    return fallbackValue;
}

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
        {
            const nextSeries = Array.isArray(action.payload) ? action.payload : [];
            const refreshedCurrent = state.currentSeries
                ? nextSeries.find(
                    (item) => String(item.id) === String(state.currentSeries.id)
                ) || state.currentSeries
                : null;
            return {
                ...state,
                series: nextSeries,
                currentSeries: refreshedCurrent,
                loading: false,
                error: null
            };
        }
        
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
    const includeUnpublishedRef = useRef(false);
    const fetchRequestIdRef = useRef(0);
    const stateRef = useRef(state);
    stateRef.current = state;

    const findCurrentSeries = useCallback((id) => (
        stateRef.current.series.find((item) => String(item.id) === String(id))
        || (
            String(stateRef.current.currentSeries?.id) === String(id)
                ? stateRef.current.currentSeries
                : null
        )
    ), []);

    const refreshAfterConflict = useCallback(async () => {
        try {
            const response = await seriesService.getAll(includeUnpublishedRef.current);
            const refreshedSeries = unwrapApiData(response, []);
            dispatch({ type: ACTIONS.SET_SERIES, payload: refreshedSeries });
            return refreshedSeries;
        } catch (refreshError) {
            console.error('Errore nel refresh delle serie dopo un conflitto:', refreshError);
            return null;
        }
    }, []);

    const fetchSeries = useCallback(async (includeUnpublished = includeUnpublishedRef.current) => {
        const requestedScope = Boolean(includeUnpublished);
        const requestId = fetchRequestIdRef.current + 1;
        includeUnpublishedRef.current = requestedScope;
        fetchRequestIdRef.current = requestId;

        try {
            dispatch({ type: ACTIONS.SET_LOADING, payload: true });
            const response = await seriesService.getAll(requestedScope);
            if (requestId !== fetchRequestIdRef.current) return;
            dispatch({ type: ACTIONS.SET_SERIES, payload: unwrapApiData(response, []) });
        } catch (error) {
            if (requestId !== fetchRequestIdRef.current) return;
            console.error('Errore nel caricamento delle serie:', error);
            dispatch({
                type: ACTIONS.SET_ERROR,
                payload: buildOperationErrorMessage(error, 'caricamento serie')
            });
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
            const seriesItem = unwrapApiData(response, null);
            dispatch({ type: ACTIONS.SET_CURRENT_SERIES, payload: seriesItem });
            dispatch({ type: ACTIONS.SET_LOADING, payload: false });
            return seriesItem;
        } catch (error) {
            console.error('Errore nel caricamento della serie:', error);
            dispatch({
                type: ACTIONS.SET_ERROR,
                payload: buildOperationErrorMessage(error, 'caricamento serie')
            });
            throw error;
        }
    }, []);

    // Carica tutte le serie all'avvio
    useEffect(() => {
        fetchSeries(false);
    }, [fetchSeries]);

    const createSeries = useCallback(async (seriesData) => {
        try {
            const response = await seriesService.create(seriesData);
            const createdSeries = unwrapApiData(response, null);
            dispatch({ type: ACTIONS.ADD_SERIES, payload: createdSeries });
            return createdSeries;
        } catch (error) {
            console.error('Errore nella creazione della serie:', error);
            if (isAmbiguousMutationError(error)) {
                const refreshedSeries = await refreshAfterConflict();
                const requestedTitle = String(seriesData?.title || '').trim().toLocaleLowerCase('it');
                const createdSeries = Array.isArray(refreshedSeries)
                    ? refreshedSeries.find((item) => (
                        requestedTitle
                        && String(item?.title || '').trim().toLocaleLowerCase('it') === requestedTitle
                    ))
                    : null;
                if (createdSeries) return createdSeries;
                if (!Array.isArray(refreshedSeries)) error.outcomeUnknown = true;
            }
            throw error;
        }
    }, [refreshAfterConflict]);

    const updateSeries = useCallback(async (id, seriesData, options = {}) => {
        try {
            const current = findCurrentSeries(id);
            const expectedVersion = options.expectedVersion ?? current?.version;
            const response = await seriesService.update(id, seriesData, expectedVersion);
            const updatedSeries = unwrapApiData(response, null);
            dispatch({ type: ACTIONS.UPDATE_SERIES, payload: updatedSeries });
            return updatedSeries;
        } catch (error) {
            console.error('Errore nell\'aggiornamento della serie:', error);
            if (isAmbiguousMutationError(error)) {
                const refreshedSeries = await refreshAfterConflict();
                const refreshed = findEntityById(refreshedSeries, id);
                if (refreshed && entityMatchesPatch(refreshed, seriesData)) {
                    return refreshed;
                }
                if (!Array.isArray(refreshedSeries)) error.outcomeUnknown = true;
            } else if (isConcurrencyError(error)) {
                await refreshAfterConflict();
            }
            throw error;
        }
    }, [findCurrentSeries, refreshAfterConflict]);

    const deleteSeries = useCallback(async (id) => {
        try {
            const current = findCurrentSeries(id);
            await seriesService.delete(id, current?.version);
            dispatch({ type: ACTIONS.DELETE_SERIES, payload: id });
        } catch (error) {
            console.error('Errore nell\'eliminazione della serie:', error);
            if (isAmbiguousMutationError(error)) {
                const refreshedSeries = await refreshAfterConflict();
                const seriesStillExists = Array.isArray(refreshedSeries)
                    && refreshedSeries.some((item) => String(item.id) === String(id));
                if (Array.isArray(refreshedSeries) && !seriesStillExists) {
                    return;
                }
                if (!Array.isArray(refreshedSeries)) {
                    error.outcomeUnknown = true;
                }
            } else if (isConcurrencyError(error)) {
                await refreshAfterConflict();
            }
            throw error;
        }
    }, [findCurrentSeries, refreshAfterConflict]);

    const addPhotoToSeries = useCallback(async (seriesId, photoId) => {
        try {
            const current = findCurrentSeries(seriesId);
            const response = await seriesService.addPhoto(seriesId, photoId, current?.version);
            const updatedSeries = unwrapApiData(response, null);
            dispatch({ type: ACTIONS.UPDATE_SERIES, payload: updatedSeries });
            return updatedSeries;
        } catch (error) {
            console.error('Errore nell\'aggiunta della foto:', error);
            if (isAmbiguousMutationError(error)) {
                const refreshedSeries = await refreshAfterConflict();
                const refreshed = findEntityById(refreshedSeries, seriesId);
                if (refreshed && includesEntityId(refreshed.photos, photoId)) {
                    return refreshed;
                }
                if (!Array.isArray(refreshedSeries)) error.outcomeUnknown = true;
            } else if (isConcurrencyError(error)) {
                await refreshAfterConflict();
            }
            throw error;
        }
    }, [findCurrentSeries, refreshAfterConflict]);

    const removePhotoFromSeries = useCallback(async (seriesId, photoId) => {
        try {
            const current = findCurrentSeries(seriesId);
            const response = await seriesService.removePhoto(seriesId, photoId, current?.version);
            const updatedSeries = unwrapApiData(response, null);
            dispatch({ type: ACTIONS.UPDATE_SERIES, payload: updatedSeries });
            return updatedSeries;
        } catch (error) {
            console.error('Errore nella rimozione della foto:', error);
            if (isAmbiguousMutationError(error)) {
                const refreshedSeries = await refreshAfterConflict();
                const refreshed = findEntityById(refreshedSeries, seriesId);
                if (refreshed && !includesEntityId(refreshed.photos, photoId)) {
                    return refreshed;
                }
                if (!Array.isArray(refreshedSeries)) error.outcomeUnknown = true;
            } else if (isConcurrencyError(error)) {
                await refreshAfterConflict();
            }
            throw error;
        }
    }, [findCurrentSeries, refreshAfterConflict]);

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
