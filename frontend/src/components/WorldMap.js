import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Globe2, MapPin, Minus, Pause, Play, Plus } from 'lucide-react';
import { usePhotos } from '../contexts/PhotoContext';
import { 
    createWorldMapNavigation, 
    GLOBE_RADIUS as NAV_GLOBE_RADIUS,
    CAMERA_START_Z as NAV_CAMERA_START_Z,
    NAVIGATION_UPDATE_CAMERA,
    NAVIGATION_UPDATE_ROTATION
} from '../utils/WorldMapNavigation';

import { useInView } from 'react-intersection-observer';

// ────────────────────────────────────────────────────────────────────────────
// Configuration constants
// ────────────────────────────────────────────────────────────────────────────
// Import navigation constants and use local names
const GLOBE_RADIUS = NAV_GLOBE_RADIUS;
const CAMERA_START_Z = NAV_CAMERA_START_Z;

// Local constants specific to WorldMap component
const ATMOSPHERE_RADIUS     = GLOBE_RADIUS * 1.025;
const STAR_FIELD_RADIUS     = 1000;
const STAR_COUNT            = 8000;
const FOCUS_OFFSET_RADIUS   = GLOBE_RADIUS + 1.2;
const RESUME_ROTATE_DELAY   = 10000; // ms
const START_LON_OFFSET_DEG = -105; // rome longitude offset

const createAnimationLifecycleController = () => {
    let active = false;
    let disposed = false;
    let mainLoop = null;
    let mainFrameId = null;
    let nextSecondaryFrameId = 0;
    let pausedAt = performance.now();
    let totalPausedTime = 0;
    const secondaryFrames = new Map();

    const getLifecycleTime = (timestamp = performance.now()) => timestamp - totalPausedTime;

    const scheduleMainLoop = () => {
        if (!active || disposed || !mainLoop || mainFrameId !== null) return;

        mainFrameId = window.requestAnimationFrame((timestamp) => {
            mainFrameId = null;
            if (!active || disposed || !mainLoop) return;

            mainLoop(getLifecycleTime(timestamp));
            scheduleMainLoop();
        });
    };

    const scheduleSecondaryFrame = (token, entry) => {
        if (!active || disposed || entry.frameId !== null || !secondaryFrames.has(token)) return;

        entry.frameId = window.requestAnimationFrame((timestamp) => {
            entry.frameId = null;
            if (!active || disposed || !secondaryFrames.has(token)) return;

            secondaryFrames.delete(token);
            entry.callback(getLifecycleTime(timestamp));
        });
    };

    const pause = () => {
        if (!active || disposed) return;

        active = false;
        pausedAt = performance.now();
        if (mainFrameId !== null) {
            window.cancelAnimationFrame(mainFrameId);
            mainFrameId = null;
        }
        secondaryFrames.forEach((entry) => {
            if (entry.frameId !== null) {
                window.cancelAnimationFrame(entry.frameId);
                entry.frameId = null;
            }
        });
    };

    const resume = () => {
        if (active || disposed) return;

        if (pausedAt !== null) {
            totalPausedTime += performance.now() - pausedAt;
            pausedAt = null;
        }
        active = true;
        scheduleMainLoop();
        secondaryFrames.forEach((entry, token) => scheduleSecondaryFrame(token, entry));
    };

    const cancelAllSecondaryFrames = () => {
        secondaryFrames.forEach((entry) => {
            if (entry.frameId !== null) window.cancelAnimationFrame(entry.frameId);
        });
        secondaryFrames.clear();
    };

    return {
        revive() {
            if (!disposed) return;
            disposed = false;
            active = false;
            pausedAt = performance.now();
            totalPausedTime = 0;
        },
        setMainLoop(callback) {
            if (mainFrameId !== null) {
                window.cancelAnimationFrame(mainFrameId);
                mainFrameId = null;
            }
            mainLoop = callback;
            scheduleMainLoop();
        },
        requestSecondaryFrame(callback) {
            if (disposed) return null;

            const token = ++nextSecondaryFrameId;
            const entry = { callback, frameId: null };
            secondaryFrames.set(token, entry);
            scheduleSecondaryFrame(token, entry);
            return token;
        },
        cancelSecondaryFrame(token) {
            if (token === null || token === undefined) return;
            const entry = secondaryFrames.get(token);
            if (!entry) return;
            if (entry.frameId !== null) window.cancelAnimationFrame(entry.frameId);
            secondaryFrames.delete(token);
        },
        pause,
        resume,
        now: () => getLifecycleTime(),
        dispose() {
            if (mainFrameId !== null) window.cancelAnimationFrame(mainFrameId);
            mainFrameId = null;
            mainLoop = null;
            cancelAllSecondaryFrames();
            active = false;
            disposed = true;
            pausedAt = null;
        }
    };
};

const MapSection = styled(motion.section)`
  padding: var(--spacing-2xl) 0 var(--spacing-4xl);
  background: transparent;
  min-height: 97vh;
  display: flex;
  align-items: center;
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);
  width: 100%;

  @media (max-width: 768px) {
    padding: 0 var(--spacing-lg);
  }
`;

const SectionTitle = styled(motion.h2)`
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: var(--font-weight-black);
  text-align: center;
  margin-bottom: var(--spacing-3xl);
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const GlobeWrapper = styled(motion.div)`
  position: relative;
  height: 650px;
  border-radius: var(--border-radius-2xl);
  overflow: hidden;
  box-shadow: var(--shadow-2xl);
  margin-bottom: var(--spacing-2xl);
  background: radial-gradient(circle at 30% 30%, #0a0a0f, #050506);

  @media (max-width: 768px) {
    height: 400px;
    margin-bottom: var(--spacing-xl);
  }

  canvas {
    width: 100% !important;
    height: 100% !important;
    border-radius: var(--border-radius-2xl);
    cursor: grab;
    
    &:active {
      cursor: grabbing;
    }
  }
`;

const Controls = styled(motion.div)`
  position: absolute;
  top: var(--spacing-lg);
  right: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  z-index: 10;

  @media (max-width: 768px) {
    top: var(--spacing-md);
    right: var(--spacing-md);
    gap: var(--spacing-xs);
  }
`;

const ControlButton = styled.button`
  background: rgba(0, 0, 0, 0.8);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: var(--spacing-md);
  border-radius: var(--border-radius-lg);
  cursor: pointer;
  transition: all var(--transition-normal);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;

  &:hover {
    background: rgba(79, 172, 254, 0.8);
    border-color: var(--color-accent);
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(79, 172, 254, 0.3);
  }

  @media (max-width: 768px) {
    width: 36px;
    height: 36px;
    font-size: var(--font-size-sm);
    padding: var(--spacing-sm);
  }
`;

const CompassButton = styled(ControlButton)`
  position: relative;
  overflow: visible;
  
  &:hover .compass-needle {
    filter: drop-shadow(0 0 8px rgba(79, 172, 254, 0.8));
  }
  
  &.locked {
    background: rgba(79, 172, 254, 0.3);
    border-color: var(--color-accent);
  }
`;

const LockIcon = styled.div`
  position: absolute;
  top: -8px;
  right: -8px;
  width: 20px;
  height: 20px;
  background: rgba(79, 172, 254, 0.9);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  
  @media (max-width: 768px) {
    width: 18px;
    height: 18px;
    font-size: 10px;
    top: -6px;
    right: -6px;
  }
`;

const CompassSVG = styled.svg`
  width: 32px;
  height: 32px;
  transition: transform 0.3s ease;
  
  @media (max-width: 768px) {
    width: 28px;
    height: 28px;
  }
  
  .compass-needle {
    transition: filter var(--transition-normal);
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  border-radius: var(--border-radius-2xl);
  flex-direction: column;
  gap: var(--spacing-lg);
`;

const LoadingSpinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  border-top-color: var(--color-accent);
  animation: spin 1s ease-in-out infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LoadingText = styled.div`
  color: white;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
`;

const StatsContainer = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacing-xl);
  margin-top: var(--spacing-2xl);

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-lg);
  }
`;

const StatCard = styled(motion.div)`
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--border-radius-xl);
  padding: var(--spacing-xl);
  text-align: center;
  transition: all var(--transition-normal);

  &:hover {
    transform: translateY(-5px);
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--color-accent);
    box-shadow: 0 20px 40px rgba(79, 172, 254, 0.2);
  }
`;

const StatNumber = styled.div`
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-black);
  background: var(--accent-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: var(--spacing-sm);
`;

const StatLabel = styled.div`
  color: rgba(255, 255, 255, 0.8);
  font-weight: var(--font-weight-medium);
`;

const InfoPopup = styled(motion.div)`
  position: fixed;
  background: rgba(0, 0, 0, 0.95);
  color: white;
  padding: var(--spacing-lg);
  border-radius: var(--border-radius-lg);
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  pointer-events: none;
  z-index: 1000;
  max-width: 250px;
  
  h4 {
    margin: 0 0 var(--spacing-sm) 0;
    font-size: var(--font-size-lg);
    color: var(--color-accent);
  }
  
  p {
    margin: 0;
    font-size: var(--font-size-sm);
    opacity: 0.8;
  }
`;

const WorldMap = ({ headingLevel = 'h2' }) => {
    const { photos, loading, actions, modalOpen, galleryModalOpen, pendingMapFocus, navigatingToMap } = usePhotos();
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const rendererRef = useRef(null);
    const globeRef = useRef(null);
    const rotationGroupRef = useRef(null);
    const cameraRef = useRef(null);
    const controlsRef = useRef(null);
    const markersRef = useRef([]);
    const markerObjectsRef = useRef([]); // Cache per raycasting
    const hoveredMarkerObjectRef = useRef(null);
    const markerScaleRef = useRef(1);
    const renderRequestedRef = useRef(true);
    const animationLifecycleRef = useRef(null);
    if (animationLifecycleRef.current === null) {
        animationLifecycleRef.current = createAnimationLifecycleController();
    }
    const globeInViewRef = useRef(false);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [hasEnteredView, setHasEnteredView] = useState(false);
    const [autoRotate, setAutoRotate] = useState(true);
    const autoRotateTimerRef = useRef(null);
    const [hoveredMarker, setHoveredMarker] = useState(null);
    const hoveredMarkerDataRef = useRef(null);
    const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
    const [adjustedPosition, setAdjustedPosition] = useState({ x: 0, y: 0 });
    const popupRef = useRef(null);
    const skipUnzoomRef = useRef(false);
    const disablePopupRef = useRef(false);
    const isAnimatingRef = useRef(false); // Blocca interazioni durante animazioni
    const compassSvgRef = useRef(null);
    const compassNorthLabelRef = useRef(null);
    const compassNorthVectorRef = useRef(new THREE.Vector3(0, 1, 0));
    const [northLocked, setNorthLocked] = useState(false); // Modalità blocco nord
    
    useLayoutEffect(() => {
        if (!popupRef.current) return;
        const { offsetWidth: w, offsetHeight: h } = popupRef.current;
        let x = popupPosition.x;
        let y = popupPosition.y;
        const margin = 8;
        const containerRect = mountRef.current?.getBoundingClientRect();
        if (containerRect) {
            const minX = containerRect.left + margin;
            const maxX = containerRect.right - w - margin;
            const minY = containerRect.top + margin;
            const maxY = containerRect.bottom - h - margin;
            if (x > maxX) x = maxX;
            if (x < minX) x = minX;
            if (y > maxY) y = maxY;
            if (y < minY) y = minY;
        } else {
            // fallback to entire window
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            if (x + w > vw) x = vw - w - margin;
            if (x < margin) x = margin;
            if (y + h > vh) y = vh - h - margin;
            if (y < margin) y = margin;
        }
        setAdjustedPosition({ x, y });
    }, [popupPosition]);
    
    const lastMouseMoveTime = useRef(0); // Per throttling
    const { ref, inView } = useInView({
        threshold: 0.1
    });
    const prevRadiusRef = useRef(null);

    useEffect(() => {
        globeInViewRef.current = inView;
        if (inView) setHasEnteredView(true);

        const lifecycle = animationLifecycleRef.current;
        if (inView && !document.hidden) lifecycle.resume();
        else lifecycle.pause();
    }, [inView]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            const lifecycle = animationLifecycleRef.current;
            if (globeInViewRef.current && !document.hidden) lifecycle.resume();
            else lifecycle.pause();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        handleVisibilityChange();
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    const requestSecondaryAnimationFrame = useCallback((callback) => (
        animationLifecycleRef.current.requestSecondaryFrame(callback)
    ), []);

    const cancelSecondaryAnimationFrame = useCallback((token) => {
        animationLifecycleRef.current.cancelSecondaryFrame(token);
    }, []);
    
    // Disattiva l’auto-rotazione e sincronizza lo stato del pulsante
    const disableAutoRotate = useCallback(() => {
        if (controlsRef.current) controlsRef.current.autoRotate = false;
        setAutoRotate(false);
    }, [setAutoRotate]);
    
    // Memoizza le foto valide
    const validPhotos = useMemo(() => 
        photos.filter(p => p && p.location && p.lat && p.lng),
    [photos]
);

// ——————————————————— cursore dinamico ———————————————————

// ——————————————————— cursore dinamico ———————————————————
const isDraggingRef = useRef(false);           // true se stiamo trascinando
const cursorRef     = useRef('grab');          // cursore attuale

const setCanvasCursor = useCallback((value) => {
    if (rendererRef.current && cursorRef.current !== value) {
        rendererRef.current.domElement.style.cursor = value;
        cursorRef.current = value;
    }
}, []);

const clearMarkerHover = useCallback(() => {
    const hoveredObject = hoveredMarkerObjectRef.current;
    if (hoveredObject) {
        hoveredObject.isHovered = false;
        hoveredObject.pulseScale?.(0, markerScaleRef.current);
        hoveredMarkerObjectRef.current = null;
        renderRequestedRef.current = true;
    }
    if (hoveredMarkerDataRef.current !== null) {
        hoveredMarkerDataRef.current = null;
        setHoveredMarker(null);
    }
}, []);
// ————————————————————————————————————————————————

/**
* Converts latitude/longitude to a 3‑D position on the globe.
* @param {number} lat  Latitude  (degrees)
* @param {number} lng  Longitude (degrees)
* @param {number} [radius=GLOBE_RADIUS]
* @returns {THREE.Vector3}
*/
const latLngToVector3 = useCallback((lat, lng, radius = GLOBE_RADIUS) => {    const phi   = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180); // Removed START_LON_OFFSET_DEG - now handled by quaternions
    return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
    );
}, []);

// Creates a 3D marker for a photo or cluster
const createMarker = useCallback((position, photo, isCluster = false) => {
    const markerGroup = new THREE.Group();
    markerGroup.position.copy(position);
    
    markerGroup.userData = photo;
    
    // sphere with different styles for clusters
    const size = isCluster ? 0.045 : 0.035;
    const dotGeometry = new THREE.SphereGeometry(size, 16, 16);
    const dotMaterial = new THREE.MeshLambertMaterial({ 
        color: isCluster ? 0x4facfe : 0xff5050, // blu per cluster, rosso per singole
        transparent: true,
        opacity: 0.95
    });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.userData = photo;
    
    // Move dot slightly outward along the normal
    const normal = position.clone().normalize();
    dot.translateOnAxis(normal, 0.015);
    dot.updateMatrix();
    dot.matrixAutoUpdate = false;
    markerGroup.add(dot);
    
    // states
    markerGroup.isHovered  = false;
    markerGroup.baseScale  = 1;
    markerGroup.dot        = dot;
    markerGroup.isCluster  = isCluster;
    
    // animation – scales dot depending on zoom + hover
    markerGroup.pulseScale = (time, scaleFactor) => {
        const baseScale = isCluster ? 1.1 : 1;
        const targetScale = markerGroup.isHovered
        ? scaleFactor * baseScale * (1.2 + Math.sin(time * 3) * 0.1) // pulsazione leggera
        : scaleFactor * baseScale;
        
        markerGroup.dot.scale.setScalar(targetScale);
        markerGroup.dot.updateMatrix();
        if (markerGroup.ring) {
            markerGroup.ring.scale.setScalar(targetScale * 0.9);
            markerGroup.ring.updateMatrix();
        }
    };

    markerGroup.updateMatrix();
    markerGroup.matrixAutoUpdate = false;
    
    return markerGroup;
}, []);

// —————————————————— CLUSTERING UTILS ——————————————————
// trasforma la distanza camera‑centro in un “livello” (0 = più lontano)
const radiusToLevel = (r) => {
    if (r > 25) return 0;      // continente
    if (r > 15) return 1;      // nazione
    if (r > 9)  return 2;      // macro‑regioni
    return 3;                  // tutti i pin
};

// raggruppa le foto in celle di griglia lat/lng di ampiezza stepDeg
const buildClustersForStep = (photos, stepDeg) => {
    if (stepDeg === 0) {
        // Anche al livello massimo, raggruppa marker con coordinate identiche
        const exactLocationMap = new Map();
        photos.forEach(p => {
            const key = `${p.lat}_${p.lng}`; // Chiave basata su coordinate esatte
            if (!exactLocationMap.has(key)) {
                exactLocationMap.set(key, { center: [p.lat, p.lng], photos: [] });
            }
            exactLocationMap.get(key).photos.push(p);
        });
        return Array.from(exactLocationMap.values());
    }
    const idOf = (lat, lng) =>
        `${Math.floor(lat / stepDeg)}_${Math.floor(lng / stepDeg)}`;
    
    const map = new Map();
    photos.forEach(p => {
        const id = idOf(p.lat, p.lng);
        if (!map.has(id)) map.set(id, { sumLat: 0, sumLng: 0, photos: [] });
        const c = map.get(id);
        c.sumLat += p.lat;
        c.sumLng += p.lng;
        c.photos.push(p);
    });
    
    return Array.from(map.values()).map(c => ({
        center: [c.sumLat / c.photos.length, c.sumLng / c.photos.length],
        photos: c.photos,
    }));
};

// pre‑costruisci i cluster per 4 livelli (step 20°, 8°, 4°, 0°)
const clusterLevels = useMemo(() => {
    const steps = [20, 8, 4, 0.32]; // step finale per cluster precisi: 35 km
    return steps.map(step => buildClustersForStep(validPhotos, step));
}, [validPhotos]);

// livello corrente dei cluster
const currentClusterLevelRef = useRef(-1);

// rimuove i marker vecchi e disegna quelli del livello richiesto
const drawMarkersForLevel = useCallback((level) => {
    const rotationGroup = rotationGroupRef.current;
    if (!rotationGroup) return;

    // Remove and dispose the previous level before replacing it.
    clearMarkerHover();
    markersRef.current.forEach((marker) => {
        rotationGroup.remove(marker);
        marker.traverse((child) => {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
            else child.material?.dispose();
        });
    });
    markersRef.current = [];
    markerObjectsRef.current = [];
    hoveredMarkerObjectRef.current = null;
    
    clusterLevels[level].forEach(cluster => {
        const pos = latLngToVector3(
            cluster.center[0],
            cluster.center[1],
            GLOBE_RADIUS
        );
        const isCluster = cluster.photos.length > 1;
        const marker = createMarker(pos, cluster.photos[0], isCluster); // riusa foto 0
        marker.userData.photos = cluster.photos;             // array completo
        marker.userData.isCluster = isCluster; // indica se è un cluster
        marker.userData.center = cluster.center; // aggiungi il centro del cluster
        rotationGroup.add(marker);
        markersRef.current.push(marker);
        marker.traverse(child => {
            if (child.isMesh) markerObjectsRef.current.push(child);
        });
    });
    
    // Aggiorna immediatamente la scala dei marker appena creati
    if (cameraRef.current) {
        markerScaleRef.current = THREE.MathUtils.clamp(
            cameraRef.current.position.length() / CAMERA_START_Z,
            0.35,
            1
        );
        markersRef.current.forEach((marker) => {
            if (marker.pulseScale) {
                marker.pulseScale(0, markerScaleRef.current);
            }
        });
    }
    renderRequestedRef.current = true;
}, [clusterLevels, latLngToVector3, createMarker, clearMarkerHover]);
// ————————————————————————————————————————————————


// throttle ottimizzato
const throttle = useCallback((func, limit) => {
    return function(...args) {
        const now = Date.now();
        if (now - lastMouseMoveTime.current >= limit) {
            lastMouseMoveTime.current = now;
            func.apply(this, args);
        }
    };
}, []);

const scheduleAutoRotateResume = useCallback((delay = RESUME_ROTATE_DELAY) => {
    if (!controlsRef.current) return;
    if (autoRotateTimerRef.current) {
        clearTimeout(autoRotateTimerRef.current);
    }
    autoRotateTimerRef.current = setTimeout(() => {
        // don't resume auto-rotate if modal is open
        if (controlsRef.current && !modalOpen) {
            // clear any hover state and hide popup
            clearMarkerHover();
            setCanvasCursor('grab');
            // resume auto-rotation
            controlsRef.current.autoRotate = true;
            setAutoRotate(true);
        }
    }, delay);
}, [setAutoRotate, modalOpen, setCanvasCursor, clearMarkerHover]);

// Creates custom controls for the camera with quaternion-based rotation
const createCustomControls = useCallback((camera, domElement) => {
    const refs = {
        globeRef,
        rotationGroupRef
    };
    
    const callbacks = {
        disableAutoRotate,
        scheduleAutoRotateResume,
        setCanvasCursor,
        isDraggingRef
    };
    
    return createWorldMapNavigation(camera, domElement, refs, callbacks);
}, [disableAutoRotate, scheduleAutoRotateResume, setCanvasCursor]);

// Keep the continuously changing compass transform outside React state.
const updateCompassRotation = useCallback(() => {
    const rotationGroup = rotationGroupRef.current;
    if (!rotationGroup) return;

    const rotatedNorth = compassNorthVectorRef.current
        .set(0, 1, 0)
        .applyQuaternion(rotationGroup.quaternion);
    const degrees = Math.atan2(rotatedNorth.x, -rotatedNorth.z) * (180 / Math.PI);

    if (compassSvgRef.current) {
        compassSvgRef.current.style.transform = `rotate(${degrees}deg)`;
    }
    if (compassNorthLabelRef.current) {
        compassNorthLabelRef.current.style.transform = `rotate(${-degrees}deg)`;
    }
}, []);

useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement || !hasEnteredView) return;

    const animationLifecycle = animationLifecycleRef.current;
    animationLifecycle.revive();
    if (globeInViewRef.current && !document.hidden) animationLifecycle.resume();
    else animationLifecycle.pause();

    let disposed = false;
    let textureLoadGeneration = 0;
    
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        50, // FOV
        mountElement.clientWidth / mountElement.clientHeight,
        0.1, 
        1000
    );
    const renderer = new THREE.WebGLRenderer({ 
        antialias: window.devicePixelRatio <= 1,
        alpha: true,
        powerPreference: "high-performance"
    });
    
    renderer.setClearColor(0x060608, 1);
    renderer.setSize(mountElement.clientWidth, mountElement.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.domElement.setAttribute('data-testid', 'worldmap-canvas');
    
    renderer.shadowMap.enabled = false;
    mountElement.appendChild(renderer.domElement);
    
    // store references
    sceneRef.current = scene;
    rendererRef.current = renderer;
    
    cameraRef.current = camera;
    
    // setup camera iniziale
    camera.position.set(0, 0, CAMERA_START_Z);

    // Earth, borders and markers share one transform. Rotating this group is O(1).
    const initialQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, THREE.MathUtils.degToRad(START_LON_OFFSET_DEG), 0)
    );
    const rotationGroup = new THREE.Group();
    rotationGroup.quaternion.copy(initialQuaternion);
    scene.add(rotationGroup);
    rotationGroupRef.current = rotationGroup;
    
    // crea controlli personalizzati
    const controls = createCustomControls(camera, renderer.domElement);
    controls.autoRotate = autoRotate;
    controls.northLocked = northLocked; // Passa lo stato iniziale
    controlsRef.current = controls;

    if (process.env.NODE_ENV !== 'production') {
        window.__worldmapDebug = {
            getQuaternion: () => rotationGroupRef.current
                ? rotationGroupRef.current.quaternion.toArray()
                : null,
            setAutoRotate: (value) => {
                if (controlsRef.current) {
                    controlsRef.current.autoRotate = value;
                }
            }
        };
    }
    
    // crea geometria della Terra ottimizzata
    const earthGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    
    // carica texture ottimizzate
    const textureLoader = new THREE.TextureLoader();
    
    const loadTexture = (path) => new Promise((resolve, reject) => {
        textureLoader.load(path, resolve, undefined, reject);
    });

    const loadTextures = async () => {
        const generation = ++textureLoadGeneration;
        let earthTexture = null;
        let boundaryTexture = null;
        const isStale = () => disposed || generation !== textureLoadGeneration;

        try {
            earthTexture = await loadTexture('/textures/8k_earth_v2.jpg');
            if (isStale()) {
                earthTexture.dispose();
                return;
            }

            boundaryTexture = await loadTexture('/textures/boundaries_8k.png');
            if (isStale()) {
                earthTexture.dispose();
                boundaryTexture.dispose();
                return;
            }
            
            const earthMaterial = new THREE.MeshLambertMaterial({
                map: earthTexture,
                transparent: false
            });
            
            const earth = new THREE.Mesh(earthGeometry, earthMaterial);
            rotationGroup.add(earth);
            
            // BORDERS
            const boundaryMaterial = new THREE.MeshBasicMaterial({
                map: boundaryTexture,
                transparent: true,
                depthTest: true,
                opacity: 0.5, 
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: 1
            });
            const boundaryMesh = new THREE.Mesh(
                new THREE.SphereGeometry(GLOBE_RADIUS + 0.005, 64, 64),
                boundaryMaterial
            );
            rotationGroup.add(boundaryMesh);
            
            globeRef.current = earth;
            
            renderRequestedRef.current = true;
            setMapLoaded(true);
            
        } catch (error) {
            earthTexture?.dispose();
            boundaryTexture?.dispose();
            if (isStale()) return;

            console.log('Usando texture di fallback');
            const fallbackMaterial = new THREE.MeshLambertMaterial({
                color: 0x6B93D6,
                transparent: false
            });
            
            const earth = new THREE.Mesh(earthGeometry, fallbackMaterial);
            rotationGroup.add(earth);
            
            globeRef.current = earth;
            
            renderRequestedRef.current = true;
            if (!disposed) setMapLoaded(true);
        }
    };
    
    loadTextures();
    
    // atmosfera con shader personalizzato che rispetta l'illuminazione
    const atmosphereGeometry = new THREE.SphereGeometry(ATMOSPHERE_RADIUS, 64, 64);
    const atmosphereMaterial = new THREE.ShaderMaterial({
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying vec3 vWorldPosition;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
                vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 lightPosition;
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying vec3 vWorldPosition;
            
            void main() {
                // Direzione della luce in coordinate mondo
                vec3 lightDir = normalize(lightPosition);
                
                // Normale in coordinate mondo
                vec3 worldNormal = normalize(vWorldPosition);
                
                // Calcola quanto la superficie punta verso la luce
                float lightIntensity = dot(worldNormal, lightDir);
                
                // Effetto atmosfera basato sull'angolo di vista
                vec3 viewDirection = normalize(vPosition);
                float atmosphere = pow(1.0 - abs(dot(viewDirection, vNormal)), 2.0);
                
                // Modula l'atmosfera con l'illuminazione
                atmosphere *= clamp(lightIntensity + 0.2, 0.0, 1.0); // Ridotto da 0.3 a 0.15 per ombra più grande
                
                vec3 atmosphereColor = vec3(0.3, 0.6, 1.0);
                gl_FragColor = vec4(atmosphereColor, atmosphere * 0.25);
            }
        `,
        uniforms: {
            lightPosition: { value: new THREE.Vector3(5, 3, 5) }
        },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false
    });
    
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);
    
    // sistema di illuminazione più "daylight" (meno ombre notturne)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.04);
    scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xfff6e5, 1.2);
    sunLight.castShadow = false;
    scene.add(sunLight);

    // The camera keeps a fixed orientation; only its radius changes. Compute the
    // screen-relative sun direction once instead of rebuilding it every frame.
    const lightDirection = new THREE.Vector3();
    camera.getWorldDirection(lightDirection).negate();
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    lightDirection.applyAxisAngle(cameraRight, -THREE.MathUtils.degToRad(32.5));
    lightDirection.applyAxisAngle(cameraUp, -THREE.MathUtils.degToRad(27.5));
    sunLight.position.copy(lightDirection.multiplyScalar(GLOBE_RADIUS * 5));
    atmosphereMaterial.uniforms.lightPosition.value.copy(sunLight.position);
    
    // stelle di sfondo ottimizzate
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = STAR_COUNT;
    const starsPositions = new Float32Array(starsCount * 3);
    
    for (let i = 0; i < starsCount; i++) {
        const radius = STAR_FIELD_RADIUS;
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        
        starsPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        starsPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        starsPositions[i * 3 + 2] = radius * Math.cos(phi);
    }
    
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
    
    const starsMaterial = new THREE.PointsMaterial({
        size: 1.2,
        transparent: true,
        opacity: 0.6,
        color: 0xffffff,
        sizeAttenuation: false
    });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);
    
    // ——— disegna i marker del livello iniziale ———
    markersRef.current = [];
    markerObjectsRef.current = [];
    currentClusterLevelRef.current = radiusToLevel(camera.position.length());
    drawMarkersForLevel(currentClusterLevelRef.current);
    
    // Inizializza la rotazione della bussola
    updateCompassRotation();
    
    // raycaster ottimizzato
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const markerWorldPosition = new THREE.Vector3();
    
    // mouse move con throttling pesante per performance
    const handleMouseMove = throttle((event) => {
        // Disabilita l'InfoPopup se un modal è aperto, durante animazioni o dopo un click fino a chiusura modali
        if (modalOpen || galleryModalOpen || disablePopupRef.current || isAnimatingRef.current) {
            clearMarkerHover();
            if (!isDraggingRef.current) setCanvasCursor('grab');
            return;
        }
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        
        // First check if we're over the globe itself
        const globeIntersects = raycaster.intersectObject(globeRef.current);
        const isOverGlobe = globeIntersects.length > 0;
        
        // Then check markers
        const intersects = raycaster.intersectObjects(markerObjectsRef.current);
        
        if (intersects.length > 0) {
            const hoveredObj  = intersects[0].object;
            const hoveredData = hoveredObj.userData || (hoveredObj.parent ? hoveredObj.parent.userData : null);
            
            // se è un marker diverso, aggiorna lo stato
            if (hoveredData && hoveredData !== hoveredMarkerDataRef.current) {
                const previousMarker = hoveredMarkerObjectRef.current;
                if (previousMarker) {
                    previousMarker.isHovered = false;
                    previousMarker.pulseScale?.(0, markerScaleRef.current);
                }
                
                // Trova il marker completo per ottenere le informazioni del cluster
                const fullMarker = markersRef.current.find(m => m.userData === hoveredData);
                if (fullMarker) {
                    fullMarker.isHovered = true;
                    fullMarker.pulseScale?.(0, markerScaleRef.current);
                    hoveredMarkerObjectRef.current = fullMarker;
                    const enhancedData = {
                        ...hoveredData,
                        isCluster: fullMarker.userData.isCluster,
                        photos: fullMarker.userData.photos || [hoveredData],
                        photoCount: fullMarker.userData.photos ? fullMarker.userData.photos.length : 1
                    };
                    setHoveredMarker(enhancedData);
                } else {
                    setHoveredMarker(hoveredData);
                }
                hoveredMarkerDataRef.current = hoveredData;
                renderRequestedRef.current = true;
            }
            
            // compute marker screen position for InfoPopup
            hoveredObj.getWorldPosition(markerWorldPosition);
            markerWorldPosition.project(camera);
            const rect = renderer.domElement.getBoundingClientRect();
            const x = (markerWorldPosition.x * 0.5 + 0.5) * rect.width + rect.left;
            const y = (-markerWorldPosition.y * 0.5 + 0.5) * rect.height + rect.top;
            const offsetY = 10;
            const offsetX = 10;
            setPopupPosition({ x: x + offsetX, y: y + offsetY });
            
            // cursore sempre pointer mentre siamo sopra QUALSIASI marker
            if (!isDraggingRef.current) setCanvasCursor('pointer');
            
        } else {
            // fuori da tutti i marker: rimuovi hover e nascondi popup
            clearMarkerHover();
            
            // Set cursor based on whether we're over the globe
            if (!isDraggingRef.current) {
                setCanvasCursor(isOverGlobe ? 'grab' : 'default');
            }
        }
    }, 50); // Throttle a 50ms per ridurre il carico
    
    const handleClick = (event) => {
        // Ignora click se stiamo già animando o se i modal sono aperti
        if (isAnimatingRef.current || modalOpen || galleryModalOpen) return;
        
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(markerObjectsRef.current);
        
        // Se non abbiamo cliccato su nessun marker, non fare nulla
        if (intersects.length === 0) return;
        
        // Blocca immediatamente tutte le interazioni
        isAnimatingRef.current = true;
        disablePopupRef.current = true;
        
        // Chiudi l'InfoPopup
        clearMarkerHover();
        setCanvasCursor('grab');
        
        const mesh         = intersects[0].object;
        // il “gruppo” completo è sempre il parent di livello 1 (vedi createMarker)
        const markerGroup   = mesh.parent ?? mesh;
        const photosInMarker = markerGroup.userData?.photos ?? [];
        
        if (Array.isArray(photosInMarker) && photosInMarker.length > 1) {
            // CLUSTER: focus sul centro del cluster, poi apri la galleria
            const center = markerGroup.userData.center || [photosInMarker[0].lat, photosInMarker[0].lng];
            focusOnPhoto(
                { lat: center[0], lng: center[1] },
                FOCUS_OFFSET_RADIUS,
                900,
                () => {
                    if (actions.openGalleryModal) {
                        actions.openGalleryModal(photosInMarker);
                    } else {
                        actions.openPhotoModal(photosInMarker[0]);
                    }
                }
            );
            return;
        }
        
        // FOTO SINGOLA  -> flusso classico
        const photo  = photosInMarker.length === 1 ? photosInMarker[0] : null;
        const full   = photo
        ? photos.find(p => String(p.id) === String(photo.id)) || photo
        : null;
        
        if (full) {
            focusOnPhoto(full, FOCUS_OFFSET_RADIUS, 900, () => {
                actions.openPhotoModal(full);
            });
        }
    };
    
    // Event listeners
    const canvas = renderer.domElement;
    // Gestione perdita/ripristino contesto WebGL
    const handleContextLost = (event) => {
        event.preventDefault();
        console.warn('WebGL context lost');
    };
    const handleContextRestored = () => {
        if (disposed) return;
        console.warn('WebGL context restored');
        loadTextures();
    };
    const handleCanvasMouseLeave = () => {
        setCanvasCursor('default');
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mouseleave', handleCanvasMouseLeave);
    
    // --- Clear hover on wheel/touch to hide InfoPopup when rotating/zooming ---
    const clearHover = () => {
        clearMarkerHover();
    };
    canvas.addEventListener('wheel', clearHover, { passive: true });
    canvas.addEventListener('touchstart', clearHover, { passive: true });
    canvas.addEventListener('touchmove', clearHover, { passive: true });
    canvas.addEventListener('touchend', clearHover);
    
    // Keep the RAF callback cheap and only draw when something visible changed.
    let previousFrameTime = null;
    let starAnimationTime = 0;
    let markerAnimationTime = 0;
    const STAR_RENDER_INTERVAL = 1 / 12;
    const MARKER_RENDER_INTERVAL = 1 / 20;

    const animate = (lifecycleTime) => {
        if (disposed) return;
        const deltaSeconds = previousFrameTime === null
            ? 1 / 60
            : Math.min(Math.max((lifecycleTime - previousFrameTime) / 1000, 0), 0.05);
        previousFrameTime = lifecycleTime;
        let shouldRender = renderRequestedRef.current;
        renderRequestedRef.current = false;

        const updateFlags = controls.update(deltaSeconds);
        if (updateFlags & NAVIGATION_UPDATE_ROTATION) {
            updateCompassRotation();
            shouldRender = true;
        }

        // Marker scale and clustering depend only on camera distance, not every frame.
        if (updateFlags & NAVIGATION_UPDATE_CAMERA) {
            markerScaleRef.current = THREE.MathUtils.clamp(
                camera.position.length() / CAMERA_START_Z,
                0.35,
                1
            );
            markersRef.current.forEach(marker => {
                marker.pulseScale?.(0, markerScaleRef.current);
            });

            const level = radiusToLevel(camera.position.length());
            if (level !== currentClusterLevelRef.current) {
                currentClusterLevelRef.current = level;
                drawMarkersForLevel(level);
            }
            shouldRender = true;
        }

        // Only the hovered marker pulses; static markers no longer require an O(N) pass.
        markerAnimationTime += deltaSeconds;
        if (hoveredMarkerObjectRef.current && markerAnimationTime >= MARKER_RENDER_INTERVAL) {
            hoveredMarkerObjectRef.current.pulseScale?.(
                lifecycleTime / 1000,
                markerScaleRef.current
            );
            markerAnimationTime = 0;
            shouldRender = true;
        }

        // Preserve the existing star speed and update cadence independently of FPS.
        starAnimationTime += deltaSeconds;
        if (starAnimationTime >= STAR_RENDER_INTERVAL) {
            stars.rotation.x += starAnimationTime * 0.0012;
            stars.rotation.y += starAnimationTime * 0.0024;
            starAnimationTime = 0;
            shouldRender = true;
        }

        if (shouldRender) renderer.render(scene, camera);
    };

    animationLifecycle.setMainLoop(animate);
    
    // Handle resize ottimizzato
    const handleResize = throttle(() => {
        if (!mountElement || !camera || !renderer) return;
        
        const width = mountElement.clientWidth;
        const height = mountElement.clientHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderRequestedRef.current = true;
    }, 100);
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup ottimizzata
    return () => {
        disposed = true;
        textureLoadGeneration += 1;
        animationLifecycle.dispose();
        window.removeEventListener('resize', handleResize);
        
        const currentCanvas = renderer.domElement;
        currentCanvas.removeEventListener('webglcontextlost', handleContextLost, false);
        currentCanvas.removeEventListener('webglcontextrestored', handleContextRestored, false);
        currentCanvas.removeEventListener('mousemove', handleMouseMove);
        currentCanvas.removeEventListener('click', handleClick);
        currentCanvas.removeEventListener('mouseleave', handleCanvasMouseLeave);
        // Remove clearHover listeners
        currentCanvas.removeEventListener('wheel', clearHover);
        currentCanvas.removeEventListener('touchstart', clearHover);
        currentCanvas.removeEventListener('touchmove', clearHover);
        currentCanvas.removeEventListener('touchend', clearHover);
        
        controls.dispose();

        if (window.__worldmapDebug) {
            delete window.__worldmapDebug;
        }
        
        if (currentCanvas.parentNode === mountElement) {
            mountElement.removeChild(currentCanvas);
        }
        
        // Dispose completo delle risorse
        scene.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => {
                        if (m.map) m.map.dispose();
                        if (m.normalMap) m.normalMap.dispose();
                        if (m.specularMap) m.specularMap.dispose();
                        m.dispose();
                    });
                } else {
                    if (child.material.map) child.material.map.dispose();
                    if (child.material.normalMap) child.material.normalMap.dispose();
                    if (child.material.specularMap) child.material.specularMap.dispose();
                    child.material.dispose();
                }
            }
        });
        
        renderer.dispose();
        document.body.style.cursor = 'default';
        if (autoRotateTimerRef.current) {
            clearTimeout(autoRotateTimerRef.current);
            autoRotateTimerRef.current = null;
        }

        if (sceneRef.current === scene) sceneRef.current = null;
        if (rendererRef.current === renderer) rendererRef.current = null;
        if (cameraRef.current === camera) cameraRef.current = null;
        if (controlsRef.current === controls) controlsRef.current = null;
        globeRef.current = null;
        if (rotationGroupRef.current === rotationGroup) rotationGroupRef.current = null;
        markersRef.current = [];
        markerObjectsRef.current = [];
        hoveredMarkerObjectRef.current = null;
        hoveredMarkerDataRef.current = null;
        renderRequestedRef.current = true;
    };
// Initialize only after the first viewport entry. Later visibility changes
// pause/resume the lifecycle controller without rebuilding WebGL resources.
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [hasEnteredView, validPhotos, drawMarkersForLevel, updateCompassRotation, clearMarkerHover]);

// Funzione per raddrizzare il globo (nord in alto)
const straightenGlobe = useCallback(() => {
    if (!controlsRef.current || !globeRef.current || !cameraRef.current) return;
    
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    
    // Disabilita temporaneamente i controlli
    const prevEnabled = controls.enabled;
    controls.enabled = false;
    controls.autoRotate = false;
    setAutoRotate(false);
    
    // Ottieni la rotazione corrente
    const currentQuat = controls.globeQuaternion.clone();
    
    // Trova il punto sulla Terra che è attualmente al centro dello schermo
    // Creiamo un raggio dal centro della camera
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    // Troviamo l'intersezione con il globo
    const intersects = raycaster.intersectObject(globeRef.current);
    
    if (intersects.length > 0) {
        // Punto al centro dello schermo in coordinate mondo
        const centerPoint = intersects[0].point.clone();
        
        // Applichiamo la rotazione inversa per ottenere il punto originale sul globo
        const inverseQuat = currentQuat.clone().invert();
        const originalPoint = centerPoint.clone().applyQuaternion(inverseQuat).normalize();
        
        // Convertiamo in coordinate geografiche
        const lat = Math.asin(originalPoint.y) * 180 / Math.PI;
        const lng = Math.atan2(originalPoint.x, originalPoint.z) * 180 / Math.PI;
        
        // Ora creiamo una rotazione che:
        // 1. Porta questo punto al centro (fronte della camera)
        // 2. Mantiene il nord in alto
        
        // Prima ruotiamo solo attorno all'asse Y per centrare la longitudine
        const yRotation = -lng * Math.PI / 180;
        const yQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yRotation);
        
        // Poi ruotiamo attorno all'asse X per centrare la latitudine
        const xRotation = lat * Math.PI / 180;
        const xQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), xRotation);
        
        // Combiniamo le rotazioni nell'ordine corretto
        const targetQuat = new THREE.Quaternion();
        targetQuat.multiply(xQuat);
        targetQuat.multiply(yQuat);
        
        // Animazione
        const duration = 800;
        const start = animationLifecycleRef.current.now();
        
        const animate = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
            
            // Interpola la rotazione
            controls.globeQuaternion.slerpQuaternions(currentQuat, targetQuat, ease);
            controls.targetGlobeQuaternion.copy(controls.globeQuaternion);
            
            if (t < 1) {
                requestSecondaryAnimationFrame(animate);
            } else {
                // Riabilita i controlli
                controls.enabled = prevEnabled;
                scheduleAutoRotateResume();
            }
        };
        
        requestSecondaryAnimationFrame(animate);
    } else {
        // Se non troviamo intersezioni, usiamo il metodo di fallback
        // che resetta semplicemente l'inclinazione
        const currentEuler = new THREE.Euler().setFromQuaternion(currentQuat, 'YXZ');
        const targetEuler = new THREE.Euler(0, currentEuler.y, 0, 'YXZ');
        const targetQuat = new THREE.Quaternion().setFromEuler(targetEuler);
        
        const duration = 800;
        const start = animationLifecycleRef.current.now();
        
        const animate = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const ease = 1 - Math.pow(1 - t, 3);
            
            controls.globeQuaternion.slerpQuaternions(currentQuat, targetQuat, ease);
            controls.targetGlobeQuaternion.copy(controls.globeQuaternion);
            
            if (t < 1) {
                requestSecondaryAnimationFrame(animate);
            } else {
                controls.enabled = prevEnabled;
                scheduleAutoRotateResume();
            }
        };
        
        requestSecondaryAnimationFrame(animate);
    }
}, [requestSecondaryAnimationFrame, scheduleAutoRotateResume, setAutoRotate]);

// Funzioni di controllo ottimizzate
const resetView = () => {
    if (cameraRef.current && globeRef.current && controlsRef.current) {
        controlsRef.current.stopMotion?.();
        // Reset camera distance
        controlsRef.current.spherical.radius = CAMERA_START_Z;
        
        // Reset globe rotation to initial state
        const initialRotation = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, THREE.MathUtils.degToRad(START_LON_OFFSET_DEG), 0)
        );
        controlsRef.current.targetGlobeQuaternion.copy(initialRotation);
        controlsRef.current.globeQuaternion.copy(initialRotation);
        if (controlsRef.current.northLocked && controlsRef.current.syncNorthLockState) {
            controlsRef.current.syncNorthLockState(initialRotation);
        }
        
        // Re-enable auto-rotate
        controlsRef.current.autoRotate = true;
        setAutoRotate(true);
    }
};

const toggleAutoRotate = () => {
    const newAutoRotate = !autoRotate;
    setAutoRotate(newAutoRotate);
    if (controlsRef.current) {
        controlsRef.current.autoRotate = newAutoRotate;
    }
};

const zoomIn = () => {
    if (controlsRef.current) {
        controlsRef.current.scale = 0.9;
    }
};

const zoomOut = () => {
    if (controlsRef.current) {
        controlsRef.current.scale = 1.1;
    }
};


/**
* Smoothly rotates and zooms the camera to centre the given photo’s marker.
* @param {object}   photo        Photo object with `lat` and `lng`
* @param {number}   targetRadius Desired camera distance
* @param {number}   duration     Animation duration in ms
* @param {Function} onComplete   Callback once animation finishes
*/
const focusOnPhoto = useCallback((
    photo,
    targetRadius = FOCUS_OFFSET_RADIUS,
    duration = 900,
    onComplete
) => {
    // Se il focus viene richiesto mentre il modal è ancora aperto (→ “vai alla mappa”)
    if (modalOpen) {
        skipUnzoomRef.current = true;
    }
    
    if (!photo || !cameraRef.current || !controlsRef.current) return false;
    const controls = controlsRef.current;
    controls.stopMotion?.();
    prevRadiusRef.current = controls.spherical.radius;  // distanza attuale
    const markerPos = latLngToVector3(photo.lat, photo.lng, 1).normalize(); // posizione del marker
    
    // Calculate rotation to bring marker to front
    const front = new THREE.Vector3(0, 0, 1); // Front of globe when camera looks from z axis
    const currentMarkerWorld = markerPos.clone().applyQuaternion(controls.globeQuaternion);
    
    // Calculate the rotation needed
    const rotationAxis = new THREE.Vector3().crossVectors(currentMarkerWorld, front);
    const rotationAngle = currentMarkerWorld.angleTo(front);
    
    let targetGlobeQuat = controls.globeQuaternion.clone();
    if (controls.northLocked && controls.createNorthLockedTarget) {
        targetGlobeQuat = controls.createNorthLockedTarget(markerPos, targetGlobeQuat)
            || targetGlobeQuat;
    } else if (rotationAxis.length() > 0.001) {
        rotationAxis.normalize();
        const deltaQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, rotationAngle);
        targetGlobeQuat.premultiply(deltaQuat);
    }
    
    // Store initial values
    const startQuat = controls.globeQuaternion.clone();
    const startRadius = controls.spherical.radius;
    
    // sospendi controlli / auto-rotate
    const prevEnabled    = controls.enabled;
    const prevAutoRotate = controls.autoRotate;
    controls.enabled     = false;
    controls.autoRotate  = false;
    setAutoRotate(false);
    
    const start = animationLifecycleRef.current.now();
    const animate = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const ease = 1 - Math.pow(1 - t, 2);       // easeOutQuad
        
        // Interpolate globe rotation
        controls.globeQuaternion.slerpQuaternions(startQuat, targetGlobeQuat, ease);
        controls.targetGlobeQuaternion.copy(controls.globeQuaternion);
        
        // Interpolate zoom
        controls.spherical.radius = startRadius + (targetRadius - startRadius) * ease;
        
        if (t < 1) {
            requestSecondaryAnimationFrame(animate);
        } else {
            if (controls.northLocked && controls.syncNorthLockState) {
                controls.syncNorthLockState(targetGlobeQuat);
            }
            controls.enabled     = prevEnabled;
            controls.autoRotate  = prevAutoRotate;   // resta off finché non riprende col timer
            
            // Riabilita le interazioni ora che l'animazione è finita
            isAnimatingRef.current = false;
            disablePopupRef.current = false;
            
            if (typeof onComplete === "function") onComplete();
        }
    };
    requestSecondaryAnimationFrame(animate);
    return true;
}, [latLngToVector3, modalOpen, requestSecondaryAnimationFrame]);

useEffect(() => {
    actions.registerFocusHandler(focusOnPhoto);
    return () => actions.registerFocusHandler(null);
}, [actions, focusOnPhoto]);

// Handle pending map focus when map is loaded
useEffect(() => {
    if (!mapLoaded || loading || !navigatingToMap) return;

    // Fallback: se arriviamo da "vai alla mappa" ma la foto non è disponibile
    // non lasciamo il flag bloccato.
    if (!pendingMapFocus) {
        actions.resetNavigatingToMap();
        return;
    }

    // Wait a bit for everything to be ready
    const timer = setTimeout(() => {
        const started = focusOnPhoto(
            pendingMapFocus,
            FOCUS_OFFSET_RADIUS,
            900,
            () => {
                scheduleAutoRotateResume();
                actions.resetNavigatingToMap();
            }
        );

        actions.clearPendingMapFocus();
        if (!started) {
            actions.resetNavigatingToMap();
        }
    }, 500);

    return () => clearTimeout(timer);
}, [
    mapLoaded,
    pendingMapFocus,
    loading,
    navigatingToMap,
    actions,
    focusOnPhoto,
    scheduleAutoRotateResume
]);

// Se arriviamo dal PhotoModal, blocca subito la rotazione in ingresso.
useEffect(() => {
    if (!navigatingToMap || !controlsRef.current) return;

    controlsRef.current.autoRotate = false;
    setAutoRotate(false);
    if (autoRotateTimerRef.current) {
        clearTimeout(autoRotateTimerRef.current);
        autoRotateTimerRef.current = null;
    }
}, [navigatingToMap]);

// Gestisci la rotazione della terra in base allo stato del modal
// effetto completo per gestire l’apertura/chiusura del modal
useEffect(() => {
    // Salta l’unzoom standard se proveniamo da “vai alla mappa”
    if (!modalOpen && skipUnzoomRef.current) {
        skipUnzoomRef.current = false;
        return;
    }
    
    if (!controlsRef.current || !globeRef.current || !cameraRef.current) return;
    
    const controls = controlsRef.current;
    if (modalOpen || galleryModalOpen) {
        controls.autoRotate = false;
        setAutoRotate(false);
        if (autoRotateTimerRef.current) {
            clearTimeout(autoRotateTimerRef.current);
            autoRotateTimerRef.current = null;
        }
        return;
    }
    
    // Zoom out without changing the focused orientation: the selected location
    // must remain at the centre of the globe after the modal closes.
    const startRadius = controls.spherical.radius;
    const destRadius = prevRadiusRef.current || CAMERA_START_Z;
    
    const zoomDur   = 700;
    const zoomStart = animationLifecycleRef.current.now();
    let zoomFrameToken = null;
    
    const zoomAnim = (now) => {
        const t    = Math.min(1, (now - zoomStart) / zoomDur);
        const ease = 1 - Math.pow(1 - t, 2);
        
        // Interpolate zoom only (keep current rotation)
        controls.spherical.radius = startRadius + (destRadius - startRadius) * ease;
        
        if (t < 1) {
            zoomFrameToken = requestSecondaryAnimationFrame(zoomAnim);
        } else {
            // Dopo lo zoom-out, riattiva auto-rotate con il timer esistente.
            scheduleAutoRotateResume();
        }
    };
    zoomFrameToken = requestSecondaryAnimationFrame(zoomAnim);

    return () => {
        cancelSecondaryAnimationFrame(zoomFrameToken);
    };
}, [
    modalOpen,
    galleryModalOpen,
    cancelSecondaryAnimationFrame,
    requestSecondaryAnimationFrame,
    scheduleAutoRotateResume
]);


// Calcolo statistiche memoizzato
const stats = useMemo(() => {
    const countries = [...new Set(validPhotos.map(p => {
        const parts = p.location.split(',');
        return parts.length > 0 ? parts[parts.length - 1].trim() : 'Sconosciuto';
    }).filter(Boolean))];
    
    const continents = [...new Set(validPhotos.map(p => {
        const parts = p.location.split(',');
        const country = parts.length > 0 ? parts[parts.length - 1].trim().toLowerCase() : '';
        
        const continentMap = {
            'europa': [
                'italia', 'italy', 
                'francia', 'france', 
                'germania', 'germany', 
                'spagna', 'spain', 
                'norvegia', 'norway', 
                'svezia', 'sweden', 
                'finlandia', 'finland', 
                'islanda', 'iceland',
                'regno unito', 'uk', 'united kingdom',
                'grecia', 'greece', 
                'portogallo', 'portugal',
                'croazia', 'croatia',
                'slovenia', 'austria', 'svizzera', 'switzerland',
                'olanda', 'netherlands', 'belgio', 'belgium',
                'danimarca', 'denmark', 'polonia', 'poland',
                'repubblica ceca', 'czech republic', 'ungheria', 'hungary',
                'romania', 'bulgaria', 'serbia', 'bosnia', 'montenegro',
                'albania', 'macedonia', 'estonia', 'lettonia', 'lituania'
            ],
            'asia': [
                'giappone', 'japan', 
                'cina', 'china', 
                'india', 
                'thailandia', 'thailand', 
                'corea', 'korea', 'south korea',
                'vietnam', 'cambogia', 'laos', 'myanmar',
                'indonesia', 'malaysia', 'singapore', 'filippine',
                'taiwan', 'hong kong', 'macao'
            ],
            'nord america': [
                'stati uniti', 'usa', 'united states', 
                'canada', 
                'messico', 'mexico'
            ],
            'sud america': [
                'brasile', 'brazil', 
                'argentina', 
                'cile', 'chile', 
                'peru', 'colombia',
                'venezuela', 'ecuador', 'bolivia', 'paraguay', 'uruguay'
            ],
            'africa': [
                'sud africa', 'south africa', 
                'kenya', 'tanzania', 
                'marocco', 'morocco', 
                'egitto', 'egypt',
                'tunisia', 'algeria', 'libia', 'etiopia', 'nigeria'
            ],
            'oceania': [
                'australia', 
                'nuova zelanda', 'new zealand',
                'fiji', 'papua nuova guinea'
            ]
        };
        
        for (const [continent, countryList] of Object.entries(continentMap)) {
            if (countryList.some(c => country.includes(c))) {
                return continent;
            }
        }
        return 'altro';
    }).filter(Boolean))];
    
    const cities = [...new Set(validPhotos.map(p => {
        const parts = p.location.split(',');
        return parts.length > 0 ? parts[0].trim() : 'Sconosciuto';
    }).filter(Boolean))];
    
    return {
        totalPhotos: validPhotos.length,
        countries: countries.length,
        continents: continents.length,
        cities: cities.length
    };
}, [validPhotos]);

const sectionVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.8,
            staggerChildren: 0.2
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6 }
    }
};

return (
    <MapSection
    id="world-map-3d"
    variants={sectionVariants}
    initial="hidden"
    animate={hasEnteredView ? "visible" : "hidden"}
    >
    <Container>
    <SectionTitle as={headingLevel} variants={itemVariants}>
    Il Mondo in foto
    </SectionTitle>
    
    <GlobeWrapper ref={ref} variants={itemVariants}>
    {(loading || !mapLoaded) && (
        <LoadingOverlay>
        <LoadingSpinner />
        <LoadingText>Caricamento della Terra...</LoadingText>
        </LoadingOverlay>
    )}
    
    <Controls
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.6, delay: 1 }}
    >
    <CompassButton 
        data-testid="worldmap-compass"
        onClick={() => {
            // Click sinistro: raddrizza la terra
            if (northLocked && controlsRef.current?.applyNorthLock) {
                controlsRef.current.applyNorthLock();
                return;
            }
            straightenGlobe();
        }}
        onContextMenu={(e) => {
            e.preventDefault(); // Previene il menu contestuale del browser
            e.stopPropagation();
            // Click destro: toggle del blocco nord
            const newLocked = !northLocked;
            setNorthLocked(newLocked);
            if (controlsRef.current) {
                controlsRef.current.northLocked = newLocked;
                controlsRef.current.inertiaEnabled = false;
                controlsRef.current.rotationVelocity.set(0, 0);
                if (newLocked && controlsRef.current.enterNorthLock) {
                    controlsRef.current.enterNorthLock();
                } else if (!newLocked && controlsRef.current.exitNorthLock) {
                    controlsRef.current.exitNorthLock();
                }
            }
        }}
        className={northLocked ? 'locked' : ''}
        title={northLocked ? "Nord bloccato - Click sinistro: raddrizza | Click destro: sblocca" : "Click sinistro: raddrizza terra | Click destro: blocca nord in alto"}
    >
        {northLocked && (
            <LockIcon>🔒</LockIcon>
        )}
        <CompassSVG 
            ref={compassSvgRef}
            viewBox="0 0 100 100" 
        >
            {/* Cerchio esterno della bussola */}
            <circle 
                cx="50" 
                cy="50" 
                r="48" 
                fill="none" 
                stroke="white" 
                strokeWidth="3" 
                opacity="0.6"
            />
            
            {/* Indicatori cardinali */}
            <line x1="50" y1="5" x2="50" y2="15" stroke="white" strokeWidth="3" opacity="0.6"/>
            <line x1="50" y1="85" x2="50" y2="95" stroke="white" strokeWidth="3" opacity="0.6"/>
            <line x1="5" y1="50" x2="15" y2="50" stroke="white" strokeWidth="3" opacity="0.6"/>
            <line x1="85" y1="50" x2="95" y2="50" stroke="white" strokeWidth="3" opacity="0.6"/>
            
            {/* Ago della bussola */}
            <g className="compass-needle">
                {/* Parte nord (rossa) */}
                <path 
                    d="M 50,20 L 42,50 L 50,40 L 58,50 Z" 
                    fill="#ff4444" 
                    stroke="#aa0000" 
                    strokeWidth="1.5"
                />
                {/* Parte sud (bianca) */}
                <path 
                    d="M 50,80 L 42,50 L 50,60 L 58,50 Z" 
                    fill="white" 
                    stroke="#888" 
                    strokeWidth="1.5"
                />
                {/* Centro */}
                <circle cx="50" cy="50" r="5" fill="white"/>
            </g>
            
            {/* Lettera N */}
            <text 
                ref={compassNorthLabelRef}
                x="50" 
                y="20" 
                textAnchor="middle" 
                fill="white" 
                fontSize="14" 
                fontWeight="bold"
                style={{ transformOrigin: '50px 50px' }}
            >
                N
            </text>
        </CompassSVG>
    </CompassButton>
    <ControlButton onClick={resetView} title="Reset Vista">
    <Globe2 size={16} />
    </ControlButton>
    <ControlButton onClick={toggleAutoRotate} title="Auto Rotazione">
    {autoRotate ? <Pause size={16} /> : <Play size={16} />}
    </ControlButton>
    <ControlButton onClick={zoomIn} title="Zoom In">
    <Plus size={16} />
    </ControlButton>
    <ControlButton onClick={zoomOut} title="Zoom Out">
    <Minus size={16} />
    </ControlButton>
    </Controls>
    
    {/* Popup informativo per marker in hover */}
    {hoveredMarker && (
        <InfoPopup
        ref={popupRef}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        style={{
            left: `${adjustedPosition.x}px`,
            top: `${adjustedPosition.y}px`
        }}
        >
        <h4>
        {hoveredMarker.isCluster 
            ? `${hoveredMarker.photoCount} foto in zona`
            : hoveredMarker.title
        }
        </h4>
        <p style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <MapPin size={14} />
        <span>{hoveredMarker.location}</span>
        </p>
        <p style={{ fontSize: '0.75rem', opacity: 0.6 }}>
        {hoveredMarker.isCluster 
            ? `Clicca per vedere tutte le ${hoveredMarker.photoCount} foto`
            : 'Clicca per vedere la foto'
        }
        </p>
        </InfoPopup>
    )}
    
    <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
    </GlobeWrapper>
    
    <StatsContainer variants={sectionVariants}>
    <StatCard
    variants={itemVariants}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    >
    <StatNumber>{stats.totalPhotos}</StatNumber>
    <StatLabel>Foto Totali</StatLabel>
    </StatCard>
    
    <StatCard
    variants={itemVariants}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    >
    <StatNumber>{stats.countries}</StatNumber>
    <StatLabel>Paesi Visitati</StatLabel>
    </StatCard>
    
    <StatCard
    variants={itemVariants}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    >
    <StatNumber>{stats.continents}</StatNumber>
    <StatLabel>Continenti</StatLabel>
    </StatCard>
    
    <StatCard
    variants={itemVariants}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    >
    <StatNumber>{stats.cities}</StatNumber>
    <StatLabel>Città Fotografate</StatLabel>
    </StatCard>
    </StatsContainer>
    </Container>
    </MapSection>
);
};

export default WorldMap;
