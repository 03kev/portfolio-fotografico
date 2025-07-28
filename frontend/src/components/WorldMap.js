import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { usePhotos } from '../contexts/PhotoContext';
import { useInView } from 'react-intersection-observer';

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
  background: radial-gradient(circle at 30% 30%, #1a1a2e, #0f0f23);

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
  font-size: var(--font-size-base);
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
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
`;

const InfoPopup = styled(motion.div)`
  position: absolute;
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
  const { photos, loading, actions } = usePhotos();
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
  const [hoveredMarker, setHoveredMarker] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const lastMouseMoveTime = useRef(0); // Per throttling
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true
  });

  // Memoizza le foto valide
  const validPhotos = useMemo(() => 
    photos.filter(p => p && p.location && p.lat && p.lng),
    [photos]
  );

  // Converti coordinate geografiche in coordinate 3D sulla sfera
  const latLngToVector3 = useCallback((lat, lng, radius = 2) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }, []);

  // Crea marker 3D ottimizzati
  const createMarker = useCallback((position, photo) => {
    const markerGroup = new THREE.Group();
    markerGroup.position.copy(position);
    markerGroup.userData = photo;

    // Pin principale con geometria ridotta
    const pinGeometry = new THREE.ConeGeometry(0.04, 0.12, 6); // Ridotto segmenti
    const pinMaterial = new THREE.MeshLambertMaterial({ 
      color: 0xff3030,
      transparent: true,
      opacity: 0.9
    });
    const pin = new THREE.Mesh(pinGeometry, pinMaterial);
    pin.position.y = 0.06;
    markerGroup.add(pin);

    // Base del pin semplificata
    const baseGeometry = new THREE.SphereGeometry(0.03, 8, 8); // Ridotto segmenti
    const baseMaterial = new THREE.MeshLambertMaterial({ 
      color: 0xff5050,
      transparent: true,
      opacity: 0.8
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    markerGroup.add(base);

    // Alone pulsante leggero
    const glowGeometry = new THREE.SphereGeometry(0.06, 6, 6); // Molto ridotto
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6060,
      transparent: true,
      opacity: 0.2
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    markerGroup.add(glow);

    // Stati per animazione ottimizzata
    markerGroup.isHovered = false;
    markerGroup.originalScale = 1;
    
    // Animazione solo quando necessario
    markerGroup.pulseScale = (time) => {
      if (markerGroup.isHovered) {
        const scale = 1.2 + Math.sin(time * 3) * 0.1;
        const glowScale = 1.5 + Math.sin(time * 2) * 0.3;
        
        pin.scale.setScalar(scale);
        base.scale.setScalar(scale);
        glow.scale.setScalar(glowScale);
      } else {
        // Reset rapido quando non in hover
        pin.scale.setScalar(markerGroup.originalScale);
        base.scale.setScalar(markerGroup.originalScale);
        glow.scale.setScalar(markerGroup.originalScale);
      }
    };

    // Orienta il marker
    const normal = position.clone().normalize();
    markerGroup.lookAt(position.clone().add(normal));

    return markerGroup;
  }, []);

  // Throttle ottimizzato
  const throttle = useCallback((func, limit) => {
    return function(...args) {
      const now = Date.now();
      if (now - lastMouseMoveTime.current >= limit) {
        lastMouseMoveTime.current = now;
        func.apply(this, args);
      }
    };
  }, []);

  // Controlli personalizzati ottimizzati
  const createCustomControls = useCallback((camera, domElement) => {
    const controls = {
      enabled: true,
      autoRotate: false,
      autoRotateSpeed: 0.3, // Ridotto per performance
      enableDamping: true,
      dampingFactor: 0.08, // Aumentato per smorzare di più
      enableZoom: true,
      minDistance: 2.5,
      maxDistance: 15,
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
            break;
        }
        
        if (this.currentState !== this.state.NONE) {
          document.addEventListener('mousemove', this.onMouseMove);
          document.addEventListener('mouseup', this.onMouseUp);
        }
      },
      
      onMouseMove: function(event) {
        if (!this.enabled) return;
        
        event.preventDefault();
        
        if (this.currentState === this.state.ROTATE) {
          this.rotateEnd.set(event.clientX, event.clientY);
          this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar(0.004);
          
          this.sphericalDelta.theta -= this.rotateDelta.x;
          this.sphericalDelta.phi -= this.rotateDelta.y;
          
          this.rotateStart.copy(this.rotateEnd);
          this.autoRotate = false;
        }
      },
      
      onMouseUp: function() {
        if (!this.enabled) return;
        
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
        
        this.currentState = this.state.NONE;
      },
      
      onWheel: function(event) {
        if (!this.enabled || !this.enableZoom) return;
        
        event.preventDefault();
        
        if (event.deltaY < 0) {
          this.scale /= 0.95;
        } else if (event.deltaY > 0) {
          this.scale *= 0.95;
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
          this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar(0.004);
          
          this.sphericalDelta.theta -= this.rotateDelta.x;
          this.sphericalDelta.phi -= this.rotateDelta.y;
          
          this.rotateStart.copy(this.rotateEnd);
          this.autoRotate = false;
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
  }, []);

  useEffect(() => {
    if (!mountRef.current || !inView) return;

    // Setup scene ottimizzato
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      50, // FOV ridotto per performance
      mountRef.current.clientWidth / mountRef.current.clientHeight, 
      0.1, 
      1000
    );
    const renderer = new THREE.WebGLRenderer({ 
      antialias: window.devicePixelRatio <= 1, // Antialias solo su schermi non retina
      alpha: true,
      powerPreference: "high-performance"
    });
    
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Limitato per performance
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = false; // Disabilitato per performance
    mountRef.current.appendChild(renderer.domElement);

    // Store references
    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;

    // Setup camera iniziale
    camera.position.set(0, 0, 5);

    // Crea controlli personalizzati
    const controls = createCustomControls(camera, renderer.domElement);
    controls.autoRotate = autoRotate;
    controlsRef.current = controls;

    // Crea geometria della Terra ottimizzata
    const earthGeometry = new THREE.SphereGeometry(2, 64, 64); // Ridotto da 128
    
    // Carica texture ottimizzate
    const textureLoader = new THREE.TextureLoader();
    
    const loadTextures = async () => {
      try {
        const earthTexture = await new Promise((resolve, reject) => {
          textureLoader.load(
            'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
            resolve,
            undefined,
            reject
          );
        });

        const earthMaterial = new THREE.MeshLambertMaterial({ // Lambert invece di Phong per performance
          map: earthTexture,
          transparent: false
        });
        
        const earth = new THREE.Mesh(earthGeometry, earthMaterial);
        scene.add(earth);
        globeRef.current = earth;

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

    // Atmosfera semplificata
    const atmosphereGeometry = new THREE.SphereGeometry(2.05, 32, 32); // Ridotto
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x4a90e2,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide
    });
    
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);

    // Sistema di illuminazione semplificato
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);

    // Stelle di sfondo ottimizzate
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 8000; // Ridotto da 15000
    const starsPositions = new Float32Array(starsCount * 3);
    
    for (let i = 0; i < starsCount; i++) {
      const radius = 500;
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
      opacity: 0.8,
      color: 0xffffff,
      sizeAttenuation: false
    });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    // Aggiungi marker per le foto
    markersRef.current = [];
    markerObjectsRef.current = []; // Reset cache
    console.log('Foto valide trovate:', validPhotos.length);
    
    validPhotos.forEach((photo, index) => {
      const position = latLngToVector3(photo.lat, photo.lng, 2.02);
      const marker = createMarker(position, photo);
      scene.add(marker);
      markersRef.current.push(marker);
      
      // Cache oggetti per raycasting
      marker.traverse((child) => {
        if (child.isMesh) {
          markerObjectsRef.current.push(child);
        }
      });
    });

    // Centra vista sull'Italia se disponibile
    const italianPhoto = validPhotos.find(photo => 
      photo.location.toLowerCase().includes('italia') || 
      photo.location.toLowerCase().includes('italy')
    );
    
    if (italianPhoto) {
      setTimeout(() => {
        if (globeRef.current) {
          const targetRotationY = -italianPhoto.lng * (Math.PI / 180);
          const targetRotationX = (italianPhoto.lat - 20) * (Math.PI / 180);
          
          globeRef.current.rotation.y = targetRotationY;
          globeRef.current.rotation.x = targetRotationX;
        }
      }, 1000);
    }

    // Raycaster ottimizzato
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Mouse move con throttling pesante per performance
    const handleMouseMove = throttle((event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      setMousePosition({ x: event.clientX, y: event.clientY });

      raycaster.setFromCamera(mouse, camera);
      
      // Usa la cache degli oggetti invece di ricreare l'array
      const intersects = raycaster.intersectObjects(markerObjectsRef.current);
      
      if (intersects.length > 0) {
        let hoveredMarkerGroup = intersects[0].object;
        while (hoveredMarkerGroup.parent && !hoveredMarkerGroup.userData) {
          hoveredMarkerGroup = hoveredMarkerGroup.parent;
        }
        
        if (hoveredMarkerGroup.userData && hoveredMarkerGroup.userData !== hoveredMarker) {
          // Reset stato hover precedente
          if (hoveredMarker) {
            const prevMarker = markersRef.current.find(m => m.userData === hoveredMarker);
            if (prevMarker) prevMarker.isHovered = false;
          }
          
          setHoveredMarker(hoveredMarkerGroup.userData);
          hoveredMarkerGroup.isHovered = true;
          document.body.style.cursor = 'pointer';
        }
      } else {
        if (hoveredMarker) {
          const prevMarker = markersRef.current.find(m => m.userData === hoveredMarker);
          if (prevMarker) prevMarker.isHovered = false;
          
          setHoveredMarker(null);
          document.body.style.cursor = 'grab';
        }
      }
    }, 50); // Throttle a 50ms per ridurre il carico

    const handleClick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(markerObjectsRef.current);

      if (intersects.length > 0) {
        let clickedMarker = intersects[0].object;
        while (clickedMarker.parent && !clickedMarker.userData) {
          clickedMarker = clickedMarker.parent;
        }
        
        if (clickedMarker.userData) {
          console.log('Marker cliccato:', clickedMarker.userData);
          actions.openPhotoModal(clickedMarker.userData);
        }
      }
    };

    // Event listeners
    const canvas = renderer.domElement;
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

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
        markersRef.current.forEach((marker) => {
          if (marker.pulseScale) {
            marker.pulseScale(elapsedTime);
          }
        });
      }

      // Rotazione lenta delle stelle solo ogni 5 frame
      if (frameCount % 5 === 0) {
        stars.rotation.x += 0.0001;
        stars.rotation.y += 0.0002;
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
    };
  }, [inView, latLngToVector3, createMarker, validPhotos, autoRotate, actions, createCustomControls, hoveredMarker, throttle]);

  // Funzioni di controllo ottimizzate
  const resetView = () => {
    if (cameraRef.current && globeRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 0, 5);
      globeRef.current.rotation.set(0, 0, 0);
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

  const focusOnItaly = () => {
    const italianPhoto = validPhotos.find(photo => 
      photo.location.toLowerCase().includes('italia') || 
      photo.location.toLowerCase().includes('italy')
    );
    
    if (italianPhoto && globeRef.current && cameraRef.current) {
      const targetRotationY = -italianPhoto.lng * (Math.PI / 180);
      const targetRotationX = (italianPhoto.lat - 20) * (Math.PI / 180);
      
      // Animazione smooth ottimizzata
      const startRotationX = globeRef.current.rotation.x;
      const startRotationY = globeRef.current.rotation.y;
      const startTime = Date.now();
      const duration = 1500; // Ridotto da 2000ms
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 2); // Easing più leggero
        
        globeRef.current.rotation.x = startRotationX + (targetRotationX - startRotationX) * easeProgress;
        globeRef.current.rotation.y = startRotationY + (targetRotationY - startRotationY) * easeProgress;
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      animate();
      setAutoRotate(false);
      if (controlsRef.current) {
        controlsRef.current.autoRotate = false;
      }
    }
  };

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
            <ControlButton onClick={focusOnItaly} title="Centra sull'Italia">
              🇮🇹
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
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              style={{
                left: mousePosition.x + 10,
                top: mousePosition.y - 80
              }}
            >
              <h4>{hoveredMarker.title}</h4>
              <p>{hoveredMarker.location}</p>
              <p style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                Clicca per vedere la foto
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