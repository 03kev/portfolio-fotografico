import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { usePhotos } from '../contexts/PhotoContext';

import { useInView } from 'react-intersection-observer';

// ────────────────────────────────────────────────────────────────────────────
// Configuration constants
// ────────────────────────────────────────────────────────────────────────────
const GLOBE_RADIUS          = 5;
const ATMOSPHERE_RADIUS     = GLOBE_RADIUS * 1.025;
const STAR_FIELD_RADIUS     = 1000;
const STAR_COUNT            = 8000;
const CAMERA_START_Z        = GLOBE_RADIUS * 2.5 + 0.5;
const MIN_CAMERA_DISTANCE   = GLOBE_RADIUS + 0.5;
const MAX_CAMERA_DISTANCE   = CAMERA_START_Z * 2;
const FOCUS_OFFSET_RADIUS   = GLOBE_RADIUS + 1.2;
const RESUME_ROTATE_DELAY   = 10000; // ms
const AUTO_ROTATE_SPEED     = 0.37; // rad/s
const START_LON_OFFSET_DEG = -105; // rome longitude offset

const MapSection = styled(motion.section)`
  padding: var(--spacing-4xl) 0;
  background: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 100%);
  min-height: 100vh;
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
  background: var(--primary-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const GlobeWrapper = styled(motion.div)`
  position: relative;
  height: 600px;
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

const WorldMap = () => {
    const { photos, loading, actions, modalOpen, galleryModalOpen } = usePhotos();
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const rendererRef = useRef(null);
    const globeRef = useRef(null);
    const cameraRef = useRef(null);
    const controlsRef = useRef(null);
    const markersRef = useRef([]);
    const markerObjectsRef = useRef([]); // Cache per raycasting
    const [mapLoaded, setMapLoaded] = useState(false);
    const [autoRotate, setAutoRotate] = useState(true);
    const autoRotateTimerRef = useRef(null);
    const [hoveredMarker, setHoveredMarker] = useState(null);
    const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
    const [adjustedPosition, setAdjustedPosition] = useState({ x: 0, y: 0 });
    const popupRef = useRef(null);
    const skipUnzoomRef = useRef(false);
    const disablePopupRef = useRef(false);
    
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
        threshold: 0.1,
        triggerOnce: true
    });
    const prevRadiusRef = useRef(null);
    
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
// ————————————————————————————————————————————————

/**
* Converts latitude/longitude to a 3‑D position on the globe.
* @param {number} lat  Latitude  (degrees)
* @param {number} lng  Longitude (degrees)
* @param {number} [radius=GLOBE_RADIUS]
* @returns {THREE.Vector3}
*/
const latLngToVector3 = useCallback((lat, lng, radius = GLOBE_RADIUS) => {    const phi   = (90 - lat) * (Math.PI / 180);
    const theta = (lng + START_LON_OFFSET_DEG + 180) * (Math.PI / 180);
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
        if (markerGroup.ring) {
            markerGroup.ring.scale.setScalar(targetScale * 0.9);
        }
    };
    
    // Orienta il marker
    markerGroup.lookAt(position.clone().add(normal));
    
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
    // elimina marker esistenti
    markersRef.current.forEach(m => sceneRef.current?.remove(m));
    markersRef.current = [];
    markerObjectsRef.current = [];
    
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
        sceneRef.current.add(marker);
        markersRef.current.push(marker);
        marker.traverse(child => {
            if (child.isMesh) markerObjectsRef.current.push(child);
        });
    });
}, [clusterLevels, latLngToVector3, createMarker]);
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
            markersRef.current.forEach(m => m.isHovered = false);
            setHoveredMarker(null);
            setCanvasCursor('grab');
            // resume auto-rotation
            controlsRef.current.autoRotate = true;
            setAutoRotate(true);
        }
    }, delay);
}, [setAutoRotate, modalOpen, setHoveredMarker, setCanvasCursor]);

// Creates custom controls for the camera
const createCustomControls = useCallback((camera, domElement) => {
    const controls = {
        enabled: true,
        autoRotate: false,
        autoRotateSpeed: AUTO_ROTATE_SPEED,
        enableDamping: true,
        dampingFactor: 0.08,
        enableZoom: true,
        minDistance: MIN_CAMERA_DISTANCE,
        maxDistance: MAX_CAMERA_DISTANCE,
        enablePan: false,
        
        spherical: new THREE.Spherical(),
        sphericalDelta: new THREE.Spherical(),
        scale: 1,
        
        state: { NONE: -1, ROTATE: 0, ZOOM: 1 },
        currentState: -1,
        
        rotateStart: new THREE.Vector2(),
        rotateEnd: new THREE.Vector2(),
        rotateDelta: new THREE.Vector2(),
        
        target: new THREE.Vector3(0, 0, 0),
        
        update: function() {
            const offset = new THREE.Vector3();
            const quat = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0));
            const quatInverse = quat.clone().invert();
            
            offset.copy(camera.position).sub(this.target);
            offset.applyQuaternion(quat);
            
            this.spherical.setFromVector3(offset);
            
            if (this.autoRotate && this.currentState === this.state.NONE) {
                this.spherical.theta -= this.autoRotateSpeed * 2 * Math.PI / 60 / 60;
            }
            
            this.spherical.theta += this.sphericalDelta.theta;
            this.spherical.phi += this.sphericalDelta.phi;
            
            this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
            
            this.spherical.radius *= this.scale;
            this.spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.spherical.radius));
            
            offset.setFromSpherical(this.spherical);
            offset.applyQuaternion(quatInverse);
            
            camera.position.copy(this.target).add(offset);
            camera.lookAt(this.target);
            
            if (this.enableDamping) {
                this.sphericalDelta.theta *= (1 - this.dampingFactor);
                this.sphericalDelta.phi *= (1 - this.dampingFactor);
            } else {
                this.sphericalDelta.set(0, 0, 0);
            }
            
            this.scale = 1;
        },
        
        onMouseDown: function(event) {
            if (!this.enabled) return;
            event.preventDefault();
            
            switch (event.button) {
                case 0:
                this.currentState = this.state.ROTATE;
                this.rotateStart.set(event.clientX, event.clientY);
                disableAutoRotate();
                scheduleAutoRotateResume();
                break;
            }
            
            if (this.currentState !== this.state.NONE) {
                document.addEventListener('mousemove', this.onMouseMove);
                document.addEventListener('mouseup', this.onMouseUp);
            }
            
            isDraggingRef.current = true;
            setCanvasCursor('grabbing');
        },
        
        onMouseMove: function(event) {
            if (!this.enabled) return;
            event.preventDefault();
            
            if (this.currentState === this.state.ROTATE) {
                this.rotateEnd.set(event.clientX, event.clientY);
                const dragT = (this.spherical.radius - this.minDistance) / (this.maxDistance - this.minDistance || 1);
                const dragFactor = 0.004 * Math.max(0.15, Math.min(1, dragT));
                this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar(dragFactor);
                
                this.sphericalDelta.theta -= this.rotateDelta.x;
                this.sphericalDelta.phi -= this.rotateDelta.y;
                
                this.rotateStart.copy(this.rotateEnd);
                disableAutoRotate();
                scheduleAutoRotateResume();
            }
        },
        
        onMouseUp: function() {
            if (!this.enabled) return;
            
            document.removeEventListener('mousemove', this.onMouseMove);
            document.removeEventListener('mouseup', this.onMouseUp);
            
            this.currentState = this.state.NONE;
            
            isDraggingRef.current = false;
            setCanvasCursor('grab');
        },
        
        onWheel: function(event) {
            if (!this.enabled) return;
            event.preventDefault();
            setCanvasCursor('grab');
            
            const absX = Math.abs(event.deltaX || 0);
            const absY = Math.abs(event.deltaY || 0);
            
            // Heuristics:
            // - ctrl/meta => pinch zoom (Mac trackpad)
            // - mouse wheel: absX ~ 0 and big |deltaY| or deltaMode === 1
            const isPinch = !!(event.ctrlKey || event.metaKey);
            const isMouseWheel = !isPinch && absX < 1 && (event.deltaMode === 1 || absY >= 40);
            
            const zoomT = (this.spherical.radius - this.minDistance) / (this.maxDistance - this.minDistance || 1);
            const clampT = Math.max(0, Math.min(1, zoomT));
            
            // Zoom factors: smaller => faster
            const basePinch = 0.992;                 // più veloce con le dita
            const baseWheel = 0.985;                // classico ma reattivo
            const base = isPinch ? basePinch : baseWheel;
            
            // Rotazione sensitivity
            const k = (0.004 * Math.max(0.15, Math.min(1, clampT))) * 0.30;
            
            if (isPinch || isMouseWheel) {
                if (!this.enableZoom) return;
                // deltaY > 0 => ZOOM IN (avvicina), deltaY < 0 => ZOOM OUT
                if (event.deltaY > 0) {
                    this.scale /= base;
                } else if (event.deltaY < 0) {
                    this.scale *= base;
                }
                disableAutoRotate();
                scheduleAutoRotateResume();
            } else {
                // Rotazione 2D: invertito verticale rispetto alla versione precedente
                const dx = (event.deltaX || 0);
                const dy = (event.deltaY || 0);
                // dx > 0 (dita a destra) => est (theta +)
                this.sphericalDelta.theta += dx * k;
                // dy > 0 (dita in giù) => sud (phi +)
                this.sphericalDelta.phi   += dy * k;
                disableAutoRotate();
                scheduleAutoRotateResume();
            }
        },
        
        onTouchStart: function(event) {
            if (!this.enabled) return;
            if (event.touches.length === 1) {
                this.currentState = this.state.ROTATE;
                this.rotateStart.set(event.touches[0].pageX, event.touches[0].pageY);
            }
        },
        
        onTouchMove: function(event) {
            if (!this.enabled) return;
            event.preventDefault();
            
            if (event.touches.length === 1 && this.currentState === this.state.ROTATE) {
                this.rotateEnd.set(event.touches[0].pageX, event.touches[0].pageY);
                const dragT = (this.spherical.radius - this.minDistance) / (this.maxDistance - this.minDistance || 1);
                const dragFactor = 0.004 * Math.max(0.15, Math.min(1, dragT));
                
                this.sphericalDelta.theta -= this.rotateDelta.x;
                this.sphericalDelta.phi -= this.rotateDelta.y;
                
                this.rotateStart.copy(this.rotateEnd);
                disableAutoRotate();
                scheduleAutoRotateResume();
            }
        },
        
        onTouchEnd: function() {
            this.currentState = this.state.NONE;
        },
        
        bindEventHandlers: function() {
            this.onMouseDown = this.onMouseDown.bind(this);
            this.onMouseMove = this.onMouseMove.bind(this);
            this.onMouseUp = this.onMouseUp.bind(this);
            this.onWheel = this.onWheel.bind(this);
            this.onTouchStart = this.onTouchStart.bind(this);
            this.onTouchMove = this.onTouchMove.bind(this);
            this.onTouchEnd = this.onTouchEnd.bind(this);
            
            domElement.addEventListener('mousedown', this.onMouseDown);
            domElement.addEventListener('wheel', this.onWheel, { passive: false });
            domElement.addEventListener('touchstart', this.onTouchStart, { passive: true });
            domElement.addEventListener('touchmove', this.onTouchMove, { passive: false });
            domElement.addEventListener('touchend', this.onTouchEnd);
        },
        
        dispose: function() {
            domElement.removeEventListener('mousedown', this.onMouseDown);
            domElement.removeEventListener('wheel', this.onWheel);
            domElement.removeEventListener('touchstart', this.onTouchStart);
            domElement.removeEventListener('touchmove', this.onTouchMove);
            domElement.removeEventListener('touchend', this.onTouchEnd);
            
            document.removeEventListener('mousemove', this.onMouseMove);
            document.removeEventListener('mouseup', this.onMouseUp);
        }
    };
    
    controls.spherical.setFromVector3(camera.position.clone().sub(controls.target));
    controls.bindEventHandlers();
    
    return controls;
}, [disableAutoRotate, scheduleAutoRotateResume]);

useEffect(() => {
    if (!mountRef.current || !inView) return;
    
    const scene = new THREE.Scene();
    let contextLost = false;
    const camera = new THREE.PerspectiveCamera(
        50, // FOV
        mountRef.current.clientWidth / mountRef.current.clientHeight, 
        0.1, 
        1000
    );
    const renderer = new THREE.WebGLRenderer({ 
        antialias: window.devicePixelRatio <= 1,
        alpha: true,
        powerPreference: "high-performance"
    });
    
    renderer.setClearColor(0x060608, 1);
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    
    renderer.shadowMap.enabled = false;
    mountRef.current.appendChild(renderer.domElement);
    
    // store references
    sceneRef.current = scene;
    rendererRef.current = renderer;
    
    cameraRef.current = camera;
    
    // setup camera iniziale
    camera.position.set(0, 0, CAMERA_START_Z);
    
    // crea controlli personalizzati
    const controls = createCustomControls(camera, renderer.domElement);
    controls.autoRotate = autoRotate;
    controlsRef.current = controls;
    
    // crea geometria della Terra ottimizzata
    const earthGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    
    // carica texture ottimizzate
    const textureLoader = new THREE.TextureLoader();
    
    const loadTextures = async () => {
        try {
            const earthTexture = await new Promise((resolve, reject) => {
                textureLoader.load(
                    '/textures/16k_earth.jpg',
                    resolve,
                    undefined,
                    reject
                );
            });
            
            const earthMaterial = new THREE.MeshLambertMaterial({
                map: earthTexture,
                transparent: false
            });
            
            const earth = new THREE.Mesh(earthGeometry, earthMaterial);
            scene.add(earth);
            globeRef.current = earth;
            
            earth.rotation.y = THREE.MathUtils.degToRad(START_LON_OFFSET_DEG);
            
            setMapLoaded(true);
            
        } catch (error) {
            console.log('Usando texture di fallback');
            const fallbackMaterial = new THREE.MeshLambertMaterial({
                color: 0x6B93D6,
                transparent: false
            });
            
            const earth = new THREE.Mesh(earthGeometry, fallbackMaterial);
            scene.add(earth);
            globeRef.current = earth;
            setMapLoaded(true);
        }
    };
    
    loadTextures();
    
    // atmosfera semplificata
    const atmosphereGeometry = new THREE.SphereGeometry(ATMOSPHERE_RADIUS, 32, 32);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
        color: 0x4a90e2,
        transparent: true,
        opacity: 0.1,
        side: THREE.BackSide
    });
    
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);
    
    // sistema di illuminazione più "daylight" (meno ombre notturne)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xfff6e5, 1.2);
    sunLight.position.set(5, 3, 5);
    sunLight.castShadow = false;
    scene.add(sunLight);
    
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
    
    // raycaster ottimizzato
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    // mouse move con throttling pesante per performance
    const handleMouseMove = throttle((event) => {
        // Disabilita l'InfoPopup se un modal è aperto o dopo un click fino a chiusura modali
        if (modalOpen || galleryModalOpen || disablePopupRef.current) {
            markersRef.current.forEach(m => m.isHovered = false);
            setHoveredMarker(null);
            if (!isDraggingRef.current) setCanvasCursor('grab');
            return;
        }
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        
        // Usa la cache degli oggetti invece di ricreare l'array
        const intersects = raycaster.intersectObjects(markerObjectsRef.current);
        
        if (intersects.length > 0) {
            const hoveredObj  = intersects[0].object;
            const hoveredData = hoveredObj.userData || (hoveredObj.parent ? hoveredObj.parent.userData : null);
            
            // se è un marker diverso, aggiorna lo stato
            if (hoveredData && hoveredData !== hoveredMarker) {
                if (hoveredMarker) {
                    const prev = markersRef.current.find(m => m.userData === hoveredMarker);
                    if (prev) prev.isHovered = false;
                }
                
                // Trova il marker completo per ottenere le informazioni del cluster
                const fullMarker = markersRef.current.find(m => m.userData === hoveredData);
                if (fullMarker) {
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
            }
            
            // compute marker screen position for InfoPopup
            const worldPos = hoveredObj.getWorldPosition(new THREE.Vector3());
            worldPos.project(camera);
            const rect = renderer.domElement.getBoundingClientRect();
            const x = (worldPos.x * 0.5 + 0.5) * rect.width + rect.left;
            const y = (-worldPos.y * 0.5 + 0.5) * rect.height + rect.top;
            const offsetY = 10;
            const offsetX = 10;
            setPopupPosition({ x: x + offsetX, y: y + offsetY });
            
            // cursore sempre pointer mentre siamo sopra QUALSIASI marker
            if (!isDraggingRef.current) setCanvasCursor('pointer');
            
        } else {
            // fuori da tutti i marker: rimuovi hover e nascondi popup
            markersRef.current.forEach(m => m.isHovered = false);
            setHoveredMarker(null);
            if (!isDraggingRef.current) setCanvasCursor('grab');
        }
    }, 50); // Throttle a 50ms per ridurre il carico
    
    const handleClick = (event) => {
        // Chiudi sempre l'InfoPopup quando clicco un marker/cluster
        markersRef.current.forEach(m => m.isHovered = false);
        setHoveredMarker(null);
        // Disabilita InfoPopup fino a chiusura di tutti i modal
        disablePopupRef.current = true;
        setCanvasCursor('grab');
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(markerObjectsRef.current);
        
        if (intersects.length === 0) return;
        
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
    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        contextLost = true;
        console.warn('WebGL context lost');
    }, false);
    canvas.addEventListener('webglcontextrestored', () => {
        console.warn('WebGL context restored');
        contextLost = false;
        // Ricarica texture della Terra
        if (typeof loadTextures === 'function') {
            loadTextures();
        }
    }, false);
    
    
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mouseleave', () => {
        setCanvasCursor('grab');
    });
    
    // --- Clear hover on wheel/touch to hide InfoPopup when rotating/zooming ---
    const clearHover = () => {
        markersRef.current.forEach(m => m.isHovered = false);
        setHoveredMarker(null);
    };
    canvas.addEventListener('wheel', clearHover, { passive: true });
    canvas.addEventListener('touchstart', clearHover, { passive: true });
    canvas.addEventListener('touchmove', clearHover, { passive: true });
    canvas.addEventListener('touchend', clearHover);
    
    // Animation loop ottimizzato
    const clock = new THREE.Clock();
    let frameCount = 0;
    
    const animate = () => {
        requestAnimationFrame(animate);
        frameCount++;
        const elapsedTime = clock.getElapsedTime();
        
        // Aggiorna controlli
        if (controlsRef.current) {
            controlsRef.current.update();
        }
        
        // Anima i marker solo ogni 3 frame per performance
        if (frameCount % 3 === 0) {
            // scala da 1 (lontano) a 0.35 (molto vicino)
            const scaleFactor = THREE.MathUtils.clamp(
                camera.position.length() / CAMERA_START_Z,
                0.35,
                1
            );
            
            markersRef.current.forEach((marker) => {
                if (marker.pulseScale) {
                    marker.pulseScale(elapsedTime, scaleFactor);
                }
            });
        }
        
        // Rotazione lenta delle stelle solo ogni 5 frame
        if (frameCount % 5 === 0) {
            stars.rotation.x += 0.0001;
            stars.rotation.y += 0.0002;
        }
        
        // se la distanza camera cambia livello, ridisegna i marker
        const lvlNow = radiusToLevel(camera.position.length());
        if (lvlNow !== currentClusterLevelRef.current) {
            currentClusterLevelRef.current = lvlNow;
            drawMarkersForLevel(lvlNow);
        }
        
        renderer.render(scene, camera);
    };
    
    animate();
    
    // Handle resize ottimizzato
    const handleResize = throttle(() => {
        if (!mountRef.current || !camera || !renderer) return;
        
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    }, 100);
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup ottimizzata
    return () => {
        window.removeEventListener('resize', handleResize);
        
        const currentCanvas = renderer.domElement;
        currentCanvas.removeEventListener('mousemove', handleMouseMove);
        currentCanvas.removeEventListener('click', handleClick);
        // Remove clearHover listeners
        currentCanvas.removeEventListener('wheel', clearHover);
        currentCanvas.removeEventListener('touchstart', clearHover);
        currentCanvas.removeEventListener('touchmove', clearHover);
        currentCanvas.removeEventListener('touchend', clearHover);
        
        if (controlsRef.current) {
            controlsRef.current.dispose();
        }
        
        const currentMount = mountRef.current;
        if (currentMount && currentCanvas) {
            currentMount.removeChild(currentCanvas);
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
        if (autoRotateTimerRef.current) { clearTimeout(autoRotateTimerRef.current); }
    };
}, [inView, validPhotos, drawMarkersForLevel]);

// Funzioni di controllo ottimizzate
const resetView = () => {
    if (cameraRef.current && globeRef.current && controlsRef.current) {
        cameraRef.current.position.set(0, 0, CAMERA_START_Z);
        globeRef.current.rotation.set(
            0,
            THREE.MathUtils.degToRad(START_LON_OFFSET_DEG),
            0
        );
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
    if (cameraRef.current) {
        const newZ = Math.max(2.5, cameraRef.current.position.z - 0.8);
        cameraRef.current.position.z = newZ;
    }
};

const zoomOut = () => {
    if (cameraRef.current) {
        const newZ = Math.min(15, cameraRef.current.position.z + 0.8);
        cameraRef.current.position.z = newZ;
    }
};


/**
* Smoothly rotates and zooms the camera to centre the given photo’s marker.
* @param {object}   photo        Photo object with `lat` and `lng`
* @param {number}   targetRadius Desired camera distance
* @param {number}   duration     Animation duration in ms
* @param {Function} onComplete   Callback once animation finishes
*/
const focusOnPhoto = (
    photo,
    targetRadius = FOCUS_OFFSET_RADIUS,
    duration = 900,
    onComplete
) => {
    // Se il focus viene richiesto mentre il modal è ancora aperto (→ “vai alla mappa”)
    if (modalOpen) {
        skipUnzoomRef.current = true;
    }
    
    if (!photo || !cameraRef.current || !controlsRef.current) return;
    const controls = controlsRef.current;
    const camera   = cameraRef.current;
    prevRadiusRef.current = camera.position.length();  // distanza attuale
    const dir = latLngToVector3(photo.lat, photo.lng, 1).normalize(); // direzione del marker
    const destPos = dir.clone().multiplyScalar(targetRadius);   // camera opposta al pin
    const startPos = camera.position.clone();
    
    // sospendi controlli / auto-rotate
    const prevEnabled    = controls.enabled;
    const prevAutoRotate = controls.autoRotate;
    controls.enabled     = false;
    controls.autoRotate  = false;
    setAutoRotate(false);
    
    const start = performance.now();
    const animate = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const ease = 1 - Math.pow(1 - t, 2);       // easeOutQuad
        camera.position.lerpVectors(startPos, destPos, ease);
        camera.lookAt(0, 0, 0);
        
        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            // riallinea le sferiche dei controlli alla nuova camera
            controls.spherical.setFromVector3(
                camera.position.clone().sub(controls.target)
            );
            controls.enabled     = prevEnabled;
            controls.autoRotate  = prevAutoRotate;   // resta off finché non riprende col timer
            if (typeof onComplete === "function") onComplete();
        }
    };
    requestAnimationFrame(animate);
};

useEffect(() => {
    actions.registerFocusHandler(focusOnPhoto);
}, [actions, focusOnPhoto]);

// Gestisci la rotazione della terra in base allo stato del modal
// effetto completo per gestire l’apertura/chiusura del modal
useEffect(() => {
    // Reinstate InfoPopup when all modals are closed
    if (!modalOpen && !galleryModalOpen) {
        disablePopupRef.current = false;
    }
    // Salta l’unzoom standard se proveniamo da “vai alla mappa”
    if (!modalOpen && skipUnzoomRef.current) {
        skipUnzoomRef.current = false;
        return;
    }

    if (!controlsRef.current || !globeRef.current || !cameraRef.current) return;
    
    const controls = controlsRef.current;
    const cam      = cameraRef.current;
    
    if (modalOpen || galleryModalOpen) {
        controls.autoRotate = false;
        setAutoRotate(false);
        if (autoRotateTimerRef.current) {
            clearTimeout(autoRotateTimerRef.current);
            autoRotateTimerRef.current = null;
        }
        return;
    }
    
    /* --- MODAL CHIUSO: livella + zoom-out (comportamento normale) -------------------------------- */
    
    /* 1) Livella inclinazione (rotation.x → 0) */
    const rotStartX = globeRef.current.rotation.x;
    const targetRotX = 0;
    const levelDur = 800;
    const levelStart = performance.now();
    
    const levelAnim = (now) => {
        const t    = Math.min(1, (now - levelStart) / levelDur);
        const ease = 1 - Math.pow(1 - t, 2);         // easeOutQuad
        globeRef.current.rotation.x =
        rotStartX + (targetRotX - rotStartX) * ease;
        if (t < 1) requestAnimationFrame(levelAnim);
    };
    requestAnimationFrame(levelAnim);
    
    /* 2) Zoom-out alla distanza originale */
    const zoomStartPos = cam.position.clone();
    const destRadius   = prevRadiusRef.current || 5;
    const destPos      = zoomStartPos.clone().normalize()
    .multiplyScalar(destRadius);
    
    const zoomDur   = 700;
    const zoomStart = performance.now();
    
    const zoomAnim = (now) => {
        const t    = Math.min(1, (now - zoomStart) / zoomDur);
        const ease = 1 - Math.pow(1 - t, 2);
        cam.position.lerpVectors(zoomStartPos, destPos, ease);
        cam.lookAt(0, 0, 0);
        
        if (t < 1) {
            requestAnimationFrame(zoomAnim);
        } else {
            /* 3) Dopo lo zoom-out, riattiva auto-rotate con il timer esistente */
            scheduleAutoRotateResume();
        }
    };
    requestAnimationFrame(zoomAnim);
}, [modalOpen, galleryModalOpen]);


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
            'europa': ['italia', 'italy', 'francia', 'france', 'germania', 'germany', 'spagna', 'spain', 
                'norvegia', 'norway', 'svezia', 'sweden', 'finlandia', 'finland', 'islanda', 'iceland',
                'regno unito', 'uk', 'grecia', 'greece', 'portogallo', 'portugal'],
                'asia': ['giappone', 'japan', 'cina', 'china', 'india', 'thailandia', 'thailand', 'corea', 'korea'],
                'nord america': ['stati uniti', 'usa', 'united states', 'canada', 'messico', 'mexico'],
                'sud america': ['brasile', 'brazil', 'argentina', 'cile', 'chile', 'peru', 'colombia'],
                'africa': ['sud africa', 'south africa', 'kenya', 'tanzania', 'marocco', 'morocco', 'egitto', 'egypt'],
                'oceania': ['australia', 'nuova zelanda', 'new zealand']
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
        ref={ref}
        variants={sectionVariants}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
        >
        <Container>
        <SectionTitle variants={itemVariants}>
        Il Mio Mondo in 3D
        </SectionTitle>
        
        <GlobeWrapper variants={itemVariants}>
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
        <ControlButton onClick={resetView} title="Reset Vista">
        🌍
        </ControlButton>
        <ControlButton onClick={toggleAutoRotate} title="Auto Rotazione">
        {autoRotate ? '⏸️' : '▶️'}
        </ControlButton>
        <ControlButton onClick={zoomIn} title="Zoom In">
        ➕
        </ControlButton>
        <ControlButton onClick={zoomOut} title="Zoom Out">
        ➖
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
            <p>📍 {hoveredMarker.location}</p>
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