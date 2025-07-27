import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { usePhotos } from '../contexts/PhotoContext';
import { useInView } from 'react-intersection-observer';
// import { IMAGES_BASE_URL } from '../utils/constants'; // Non utilizzato in questo componente

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

const WorldMap = () => {
  const { photos, loading, actions } = usePhotos();
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const globeRef = useRef(null);
  const cameraRef = useRef(null);
  const markersRef = useRef([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true
  });

  // Calcola statistiche - con protezioni per dati mancanti
  const validPhotos = photos.filter(p => p && p.location && p.lat && p.lng);

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

  // Crea marker 3D più visibili
  const createMarker = useCallback((position, photo) => {
    // Gruppo per il marker completo
    const markerGroup = new THREE.Group();
    markerGroup.position.copy(position);
    markerGroup.userData = photo;

    // Marker principale più grande
    const markerGeometry = new THREE.SphereGeometry(0.08, 32, 32);
    const markerMaterial = new THREE.MeshLambertMaterial({ 
      color: 0xff4444,
      transparent: true,
      opacity: 0.9,
      emissive: 0x441111
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    markerGroup.add(marker);

    // Alone esterno
    const glowGeometry = new THREE.SphereGeometry(0.12, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6666,
      transparent: true,
      opacity: 0.4
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    markerGroup.add(glow);

    // Alone molto esterno per maggiore visibilità
    const outerGlowGeometry = new THREE.SphereGeometry(0.16, 32, 32);
    const outerGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8888,
      transparent: true,
      opacity: 0.2
    });
    const outerGlow = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
    markerGroup.add(outerGlow);

    // Effetto pulsante per tutti gli elementi
    const pulseScale = () => {
      const time = Date.now() * 0.003;
      const scale = 1 + Math.sin(time) * 0.3;
      const glowScale = 1 + Math.sin(time + 0.5) * 0.2;
      
      marker.scale.setScalar(scale);
      glow.scale.setScalar(glowScale);
      outerGlow.scale.setScalar(glowScale * 0.8);
    };
    markerGroup.pulseScale = pulseScale;

    console.log('Marker creato per:', photo.location, 'alla posizione:', position);
    return markerGroup;
  }, []);

  const handleMarkerClick = (photo) => {
    actions.openPhotoModal(photo);
  };

  useEffect(() => {
    if (!mountRef.current || !inView) return;

    // Setup scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75, 
      mountRef.current.clientWidth / mountRef.current.clientHeight, 
      0.1, 
      1000
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mountRef.current.appendChild(renderer.domElement);

    // Store references
    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;

    // Setup camera
    camera.position.z = 5;

    // Create Earth geometry
    const earthGeometry = new THREE.SphereGeometry(2, 64, 64);
    
    // Load Earth texture con texture più dettagliate
    const textureLoader = new THREE.TextureLoader();
    
    // Texture principale ad alta risoluzione
    const earthTexture = textureLoader.load(
      'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
      () => {
        console.log('Texture Terra caricata');
        setMapLoaded(true);
      },
      undefined,
      (error) => {
        console.log('Fallback alla texture alternativa');
        // Fallback texture se la prima non carica
        const fallbackTexture = textureLoader.load(
          'https://cdn.jsdelivr.net/npm/three-globe@2.24.0/example/img/earth-night.jpg',
          () => {
            console.log('Texture fallback caricata');
            setMapLoaded(true);
          }
        );
        earthMaterial.map = fallbackTexture;
        earthMaterial.needsUpdate = true;
      }
    );
    
    // Aggiungi texture normale per il bump mapping
    const normalTexture = textureLoader.load(
      'https://cdn.jsdelivr.net/npm/three-globe@2.24.0/example/img/earth-topology.png'
    );
    
    const earthMaterial = new THREE.MeshPhongMaterial({
      map: earthTexture,
      normalMap: normalTexture,
      normalScale: new THREE.Vector2(0.85, 0.85),
      transparent: false,
      shininess: 0.1
    });
    
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);
    globeRef.current = earth;

    // Add atmosphere effect
    const atmosphereGeometry = new THREE.SphereGeometry(2.1, 64, 64);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x4facfe,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);

    // Add lighting - illuminazione migliorata
    const ambientLight = new THREE.AmbientLight(0x404040, 0.8); // Luce ambientale più intensa
    scene.add(ambientLight);
    
    // Luce principale
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);
    
    // Luce di riempimento dal lato opposto
    const fillLight = new THREE.DirectionalLight(0x4a90e2, 0.3);
    fillLight.position.set(-5, -3, -5);
    scene.add(fillLight);
    
    // Luce dal basso per simulare l'atmosfera
    const bottomLight = new THREE.DirectionalLight(0x7ba7db, 0.2);
    bottomLight.position.set(0, -5, 0);
    scene.add(bottomLight);

    // Add stars background
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 10000;
    const starsPositions = new Float32Array(starsCount * 3);
    
    for (let i = 0; i < starsCount * 3; i++) {
      starsPositions[i] = (Math.random() - 0.5) * 2000;
    }
    
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
    const starsMaterial = new THREE.PointsMaterial({ 
      color: 0xffffff, 
      size: 2,
      transparent: true,
      opacity: 0.8
    });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    // Add markers per le foto
    markersRef.current = [];
    console.log('Foto valide trovate:', validPhotos.length);
    validPhotos.forEach((photo, index) => {
      console.log(`Foto ${index + 1}:`, {
        title: photo.title,
        location: photo.location,
        lat: photo.lat,
        lng: photo.lng
      });
      
      const position = latLngToVector3(photo.lat, photo.lng);
      console.log('Posizione 3D calcolata:', position);
      
      const marker = createMarker(position, photo);
      scene.add(marker);
      markersRef.current.push(marker);
    });
    
    console.log('Marker totali aggiunti:', markersRef.current.length);
    
    // Se c'è solo una foto, centra la vista su di essa
    if (validPhotos.length === 1) {
      const photo = validPhotos[0];
      const targetPosition = latLngToVector3(photo.lat, photo.lng, 2);
      
      // Posiziona la camera per guardare verso l'Italia
      setTimeout(() => {
        if (cameraRef.current && globeRef.current) {
          // Ruota il globo per mostrare l'Italia
          globeRef.current.rotation.y = -0.2; // Ruota verso est per l'Italia
          globeRef.current.rotation.x = -0.1; // Inclina leggermente
          
          console.log('Vista centrata sull\'Italia');
        }
      }, 1000);
    }

    // Mouse/Touch interaction
    let mouseX = 0, mouseY = 0;
    let targetRotationX = 0, targetRotationY = 0;
    let isMouseDown = false;

    const handleMouseMove = (event) => {
      if (isMouseDown) {
        const deltaX = event.clientX - mouseX;
        const deltaY = event.clientY - mouseY;
        
        targetRotationY += deltaX * 0.005;
        targetRotationX += deltaY * 0.005;
        
        targetRotationX = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, targetRotationX));
        setAutoRotate(false);
      }
      mouseX = event.clientX;
      mouseY = event.clientY;
    };

    const handleMouseDown = (event) => {
      isMouseDown = true;
      mouseX = event.clientX;
      mouseY = event.clientY;
    };

    const handleMouseUp = () => {
      isMouseDown = false;
    };

    const handleWheel = (event) => {
      event.preventDefault();
      camera.position.z = Math.max(3, Math.min(10, camera.position.z + event.deltaY * 0.01));
    };

    // Touch events
    let touchStartX = 0, touchStartY = 0;

    const handleTouchStart = (event) => {
      if (event.touches.length === 1) {
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
      }
    };

    const handleTouchMove = (event) => {
      if (event.touches.length === 1) {
        event.preventDefault();
        const deltaX = event.touches[0].clientX - touchStartX;
        const deltaY = event.touches[0].clientY - touchStartY;
        
        targetRotationY += deltaX * 0.005;
        targetRotationX += deltaY * 0.005;
        
        targetRotationX = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, targetRotationX));
        
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        setAutoRotate(false);
      }
    };

    // Raycaster per click sui marker
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      
      // Intersect con tutti gli oggetti dei marker (inclusi i sottogruppi)
      const allMarkerObjects = [];
      markersRef.current.forEach(marker => {
        marker.traverse((child) => {
          if (child.isMesh) {
            allMarkerObjects.push(child);
          }
        });
      });
      
      const intersects = raycaster.intersectObjects(allMarkerObjects);
      console.log('Click - Intersects trovati:', intersects.length);

      if (intersects.length > 0) {
        // Trova il marker parent
        let clickedMarker = intersects[0].object;
        while (clickedMarker.parent && !clickedMarker.userData) {
          clickedMarker = clickedMarker.parent;
        }
        
        console.log('Marker cliccato:', clickedMarker.userData);
        if (clickedMarker.userData) {
          handleMarkerClick(clickedMarker.userData);
        }
      }
    };

    // Add event listeners
    const canvas = renderer.domElement;
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('click', handleClick);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      if (earth) {
        if (autoRotate) {
          earth.rotation.y += 0.002;
          atmosphere.rotation.y += 0.002;
        } else {
          earth.rotation.x += (targetRotationX - earth.rotation.x) * 0.05;
          earth.rotation.y += (targetRotationY - earth.rotation.y) * 0.05;
          atmosphere.rotation.x = earth.rotation.x;
          atmosphere.rotation.y = earth.rotation.y;
        }
      }

      // Animate markers
      markersRef.current.forEach(marker => {
        if (marker.pulseScale) marker.pulseScale();
        // Mantieni i marker sempre verso la camera
        marker.lookAt(camera.position);
        
        // Assicurati che i marker siano sempre visibili
        marker.traverse((child) => {
          if (child.isMesh) {
            child.material.depthTest = false;
            child.renderOrder = 999;
          }
        });
      });

      // Rotate stars slowly
      stars.rotation.x += 0.0002;
      stars.rotation.y += 0.0002;

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer) return;
      
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      
      // Salva il riferimento al canvas per la cleanup
      const currentCanvas = renderer.domElement;
      
      currentCanvas.removeEventListener('mousemove', handleMouseMove);
      currentCanvas.removeEventListener('mousedown', handleMouseDown);
      currentCanvas.removeEventListener('mouseup', handleMouseUp);
      currentCanvas.removeEventListener('wheel', handleWheel);
      currentCanvas.removeEventListener('touchstart', handleTouchStart);
      currentCanvas.removeEventListener('touchmove', handleTouchMove);
      currentCanvas.removeEventListener('click', handleClick);
      
      const currentMount = mountRef.current;
      if (currentMount && currentCanvas) {
        currentMount.removeChild(currentCanvas);
      }
      
      // Dispose delle risorse Three.js
      scene.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      
      renderer.dispose();
    };
  }, [inView, latLngToVector3, createMarker, validPhotos, autoRotate, actions, handleMarkerClick]);

  const resetView = () => {
    if (cameraRef.current && globeRef.current) {
      cameraRef.current.position.set(0, 0, 5);
      globeRef.current.rotation.set(0, 0, 0);
      setAutoRotate(true);
    }
  };

  const toggleAutoRotate = () => {
    setAutoRotate(!autoRotate);
  };

  const zoomIn = () => {
    if (cameraRef.current) {
      cameraRef.current.position.z = Math.max(3, cameraRef.current.position.z - 0.5);
    }
  };

  const zoomOut = () => {
    if (cameraRef.current) {
      cameraRef.current.position.z = Math.min(10, cameraRef.current.position.z + 0.5);
    }
  };

  const stats = {
    totalPhotos: validPhotos.length,
    countries: [...new Set(validPhotos.map(p => {
      const parts = p.location.split(',');
      return parts.length > 0 ? parts[parts.length - 1].trim() : 'Sconosciuto';
    }).filter(Boolean))].length,
    continents: [...new Set(validPhotos.map(p => {
      const parts = p.location.split(',');
      const country = parts.length > 0 ? parts[parts.length - 1].trim() : '';
      if (['Italia', 'Francia', 'Germania', 'Spagna', 'Norvegia', 'Svezia', 'Finlandia', 'Islanda'].includes(country)) return 'Europa';
      if (['Giappone', 'Cina', 'India', 'Thailandia'].includes(country)) return 'Asia';
      if (['Stati Uniti', 'Canada', 'Messico'].includes(country)) return 'Nord America';
      if (['Brasile', 'Argentina', 'Cile'].includes(country)) return 'Sud America';
      if (['Sud Africa', 'Kenya', 'Tanzania', 'Marocco'].includes(country)) return 'Africa';
      if (['Australia', 'Nuova Zelanda'].includes(country)) return 'Oceania';
      return 'Altro';
    }).filter(Boolean))].length,
    cities: [...new Set(validPhotos.map(p => {
      const parts = p.location.split(',');
      return parts.length > 0 ? parts[0].trim() : 'Sconosciuto';
    }).filter(Boolean))].length
  };

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
            <ControlButton onClick={zoomIn} title="Zoom In">
              ➕
            </ControlButton>
            <ControlButton onClick={zoomOut} title="Zoom Out">
              ➖
            </ControlButton>
          </Controls>

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
