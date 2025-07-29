import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapSelector.css';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';

// Fix per le icone di Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const MapSelectorOverlay = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
  backdrop-filter: blur(10px);
`;

const MapContainer2 = styled(motion.div)`
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 900px;
  height: 80vh;
  max-height: 700px;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
`;

const MapHeader = styled.div`
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  
  h3 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
  }
`;

const CloseButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 1.5rem;
  cursor: pointer;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.1);
  }
`;

const MapContent = styled.div`
  flex: 1;
  position: relative;
  
  .leaflet-container {
    height: 100%;
    border-radius: 0 0 16px 16px;
  }
`;

const MapInstructions = styled.div`
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(255, 255, 255, 0.95);
  padding: 16px 20px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  font-size: 0.9rem;
  color: #334155;
  max-width: 280px;
  backdrop-filter: blur(10px);
  
  h4 {
    margin: 0 0 8px 0;
    color: #667eea;
    font-size: 1rem;
    font-weight: 600;
  }
  
  p {
    margin: 0;
    line-height: 1.4;
  }
`;

const CoordinatesDisplay = styled.div`
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 12px 16px;
  border-radius: 12px;
  backdrop-filter: blur(10px);
  z-index: 1000;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 0.85rem;
  
  .coord-label {
    opacity: 0.7;
    font-size: 0.75rem;
    margin-bottom: 4px;
  }
  
  .coord-values {
    font-weight: 600;
  }
`;

const ActionButtons = styled.div`
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  gap: 12px;
  z-index: 1000;
`;

const ActionButton = styled.button`
  background: ${props => props.primary 
    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
    : 'rgba(255, 255, 255, 0.9)'};
  color: ${props => props.primary ? 'white' : '#334155'};
  border: none;
  padding: 12px 20px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

// Componente per gestire i click sulla mappa
const MapClickHandler = ({ onLocationSelect, selectedPosition }) => {
  useMapEvents({
    click: (e) => {
      const { lat, lng } = e.latlng;
      onLocationSelect(lat, lng);
    },
  });
  
  return selectedPosition ? (
    <Marker position={[selectedPosition.lat, selectedPosition.lng]} />
  ) : null;
};

const MapSelector = ({ isOpen, onClose, onLocationSelect, initialLocation = null }) => {
  const [selectedPosition, setSelectedPosition] = useState(
    initialLocation ? { lat: initialLocation.lat, lng: initialLocation.lng } : null
  );
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Geolocalizzazione
  const getCurrentLocation = () => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setSelectedPosition({ lat: latitude, lng: longitude });
        reverseGeocode(latitude, longitude);
        setLoading(false);
      },
      (error) => {
        console.error('Errore geolocalizzazione:', error);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  
  // Reverse geocoding per ottenere l'indirizzo
  const reverseGeocode = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=it`
      );
      const data = await response.json();
      const addressString = data.locality || data.city || data.countryName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setAddress(addressString);
    } catch (error) {
      console.error('Errore reverse geocoding:', error);
      setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }
  };
  
  const handleLocationClick = async (lat, lng) => {
    setSelectedPosition({ lat, lng });
    await reverseGeocode(lat, lng);
  };
  
  const handleConfirm = () => {
    if (selectedPosition && onLocationSelect) {
      onLocationSelect({
        lat: selectedPosition.lat,
        lng: selectedPosition.lng,
        address: address
      });
    }
    onClose();
  };
  
  if (!isOpen) return null;
  
  return (
    <MapSelectorOverlay
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <MapContainer2
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
      >
        <MapHeader>
          <h3>🗺️ Seleziona Posizione</h3>
          <CloseButton onClick={onClose}>×</CloseButton>
        </MapHeader>
        
        <MapContent className="map-selector-container">
          <MapContainer
            center={
              selectedPosition 
                ? [selectedPosition.lat, selectedPosition.lng]
                : [41.8719, 12.5674] // Roma come default
            }
            zoom={selectedPosition ? 12 : 6}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <MapClickHandler 
              onLocationSelect={handleLocationClick}
              selectedPosition={selectedPosition}
            />
          </MapContainer>
          
          <MapInstructions>
            <h4>Come usare:</h4>
            <p>Clicca sulla mappa per selezionare una posizione, oppure usa il pulsante "Posizione attuale" per usare il GPS.</p>
          </MapInstructions>
          
          {selectedPosition && (
            <CoordinatesDisplay>
              <div className="coord-label">Coordinate selezionate:</div>
              <div className="coord-values">
                {selectedPosition.lat.toFixed(6)}, {selectedPosition.lng.toFixed(6)}
              </div>
              {address && (
                <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '4px' }}>
                  📍 {address}
                </div>
              )}
            </CoordinatesDisplay>
          )}
          
          <ActionButtons>
            <ActionButton onClick={getCurrentLocation} disabled={loading}>
              {loading ? '📍' : '🎯'} Posizione attuale
            </ActionButton>
            <ActionButton onClick={onClose}>
              Annulla
            </ActionButton>
            <ActionButton 
              primary 
              onClick={handleConfirm}
              disabled={!selectedPosition}
            >
              ✓ Conferma Posizione
            </ActionButton>
          </ActionButtons>
        </MapContent>
      </MapContainer2>
    </MapSelectorOverlay>
  );
};

export default MapSelector;