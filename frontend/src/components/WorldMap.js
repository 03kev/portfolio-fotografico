import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon, divIcon } from 'leaflet';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { usePhotos } from '../contexts/PhotoContext';
import { useInView } from 'react-intersection-observer';

const MapSection = styled(motion.section)`
  padding: var(--spacing-4xl) 0;
  background: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 100%);
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);

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

const MapWrapper = styled(motion.div)`
  position: relative;
  height: 600px;
  border-radius: var(--border-radius-2xl);
  overflow: hidden;
  box-shadow: var(--shadow-2xl);
  margin-bottom: var(--spacing-2xl);
  background: var(--color-dark-light);

  @media (max-width: 768px) {
    height: 400px;
    margin-bottom: var(--spacing-xl);
  }

  .leaflet-container {
    height: 100%;
    width: 100%;
    border-radius: var(--border-radius-2xl);
  }
`;

const MapInfo = styled(motion.div)`
  position: absolute;
  top: var(--spacing-lg);
  left: var(--spacing-lg);
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(20px);
  padding: var(--spacing-lg);
  border-radius: var(--border-radius-xl);
  z-index: 1000;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: var(--shadow-large);

  @media (max-width: 768px) {
    top: var(--spacing-md);
    left: var(--spacing-md);
    padding: var(--spacing-md);
  }

  h3 {
    color: var(--color-accent);
    margin-bottom: var(--spacing-sm);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  p {
    color: rgba(255, 255, 255, 0.8);
    font-size: var(--font-size-sm);
    margin: 0;
  }
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
  z-index: 1001;
  border-radius: var(--border-radius-2xl);
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

const WorldMap = () => {
  const { photos, loading, actions } = usePhotos();
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true
  });

  // Crea icona personalizzata per i marker
  const createCustomIcon = (isActive = false) => {
    return divIcon({
      className: 'custom-marker',
      html: `<div style="
        width: 16px;
        height: 16px;
        background: ${isActive ? 
          'linear-gradient(135deg, #4facfe, #00f2fe)' : 
          'linear-gradient(135deg, #667eea, #764ba2)'};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
        ${isActive ? 'transform: scale(1.2);' : ''}
      "></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
  };

  const handleMarkerClick = (photo) => {
    actions.openPhotoModal(photo);
  };

  // Calcola statistiche
  const stats = {
    totalPhotos: photos.length,
    countries: [...new Set(photos.map(p => p.location.split(',').pop().trim()))].length,
    continents: [...new Set(photos.map(p => {
      const country = p.location.split(',').pop().trim();
      // Semplificata mappatura continenti
      if (['Italia', 'Francia', 'Germania', 'Spagna', 'Norvegia', 'Svezia', 'Finlandia', 'Islanda'].includes(country)) return 'Europa';
      if (['Giappone', 'Cina', 'India', 'Thailandia'].includes(country)) return 'Asia';
      if (['Stati Uniti', 'Canada', 'Messico'].includes(country)) return 'Nord America';
      if (['Brasile', 'Argentina', 'Cile'].includes(country)) return 'Sud America';
      if (['Sud Africa', 'Kenya', 'Tanzania', 'Marocco'].includes(country)) return 'Africa';
      if (['Australia', 'Nuova Zelanda'].includes(country)) return 'Oceania';
      return 'Altro';
    }))].length,
    cities: [...new Set(photos.map(p => p.location.split(',')[0].trim()))].length
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
          Mappa dei Miei Viaggi
        </SectionTitle>

        <MapWrapper variants={itemVariants}>
          {loading && (
            <LoadingOverlay>
              <LoadingSpinner />
            </LoadingOverlay>
          )}

          <MapInfo
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            <h3>Luoghi Fotografati</h3>
            <p>Clicca sui marker per vedere le foto</p>
          </MapInfo>

          <MapContainer
            center={[20, 0]}
            zoom={2}
            scrollWheelZoom={true}
            zoomControl={true}
            ref={mapRef}
            whenCreated={() => setMapLoaded(true)}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
            />

            {photos.map((photo) => (
              <Marker
                key={photo.id}
                position={[photo.lat, photo.lng]}
                icon={createCustomIcon()}
                eventHandlers={{
                  click: () => handleMarkerClick(photo),
                }}
              >
                <Popup className="custom-popup">
                  <div style={{ textAlign: 'center', minWidth: '200px' }}>
                    <img
                      src={`https://images.unsplash.com/photo-${photo.id > 3 ? '1516426122078-c23e76319801' : '1506905925346-21bda4d32df4'}?w=200&h=150&fit=crop`}
                      alt={photo.title}
                      style={{
                        width: '200px',
                        height: '150px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        marginBottom: '10px'
                      }}
                    />
                    <h3 style={{ color: '#4facfe', margin: '0 0 5px 0', fontSize: '16px' }}>
                      {photo.title}
                    </h3>
                    <p style={{ margin: '0 0 10px 0', color: '#ccc', fontSize: '14px' }}>
                      {photo.location}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkerClick(photo);
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #667eea, #764ba2)',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      Visualizza
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </MapWrapper>

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
