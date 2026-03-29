import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapSelector.css';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Check, LocateFixed, MapPinned, X } from 'lucide-react';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { media } from '../styles/responsive';
import { insetPanelSurface, panelSurface, topAlignedModalBackdropSurface } from '../styles/surfaces';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const MapSelectorOverlay = styled(motion.div)`
  ${topAlignedModalBackdropSurface};
  z-index: 2000;
`;

const MapContainer2 = styled(motion.div)`
  ${panelSurface};
  container-type: inline-size;
  width: 100%;
  max-width: 960px;
  height: min(84vh, 760px);
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  ${media.down('tablet')`
    max-width: none;
    height: calc(100dvh - (var(--panel-overlay-pad-inline) * 2));
  `}
`;

const MapHeader = styled.div`
  color: var(--color-text);
  padding: 14px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  
  h3 {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 1.08rem;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  ${media.down('tablet')`
    padding: 12px 14px;
    gap: 10px;

    h3 {
      font-size: 1rem;
    }
  `}
`;

const CloseButton = styled.button`
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--color-text);
  cursor: pointer;
  width: var(--panel-close-size);
  height: var(--panel-close-size);
  border-radius: var(--panel-close-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition-normal);
  
  &:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(214, 179, 106, 0.3);
  }

  ${media.down('tablet')`
    width: 40px;
    height: 40px;
  `}
`;

const MapContent = styled.div`
  flex: 1;
  position: relative;
  
  .leaflet-container {
    height: 100%;
    border-radius: 0 0 calc(var(--panel-radius) - 2px) calc(var(--panel-radius) - 2px);
  }
`;

const MapMetaPanel = styled.div`
  position: absolute;
  top: 16px;
  left: 16px;
  ${insetPanelSurface};
  background:
    linear-gradient(180deg, rgba(11, 14, 21, 0.84) 0%, rgba(11, 14, 21, 0.74) 100%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow:
    0 16px 36px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  z-index: 1000;
  color: var(--color-text);
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: fit-content;
  max-width: calc(100% - 112px);
  min-width: 300px;

  .meta-label {
    color: rgba(214, 179, 106, 0.92);
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .meta-values {
    font-family: 'Monaco', 'Consolas', monospace;
    font-weight: 600;
    font-size: 0.82rem;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.4;
  }

  .meta-address {
    font-size: 0.76rem;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.7);
    overflow-wrap: anywhere;
  }

  .meta-attribution {
    margin: 0;
    font-size: 0.68rem;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.52);
  }

  ${media.down('tablet')`
    top: 14px;
    left: 14px;
    width: fit-content;
    max-width: calc(100% - 84px);
    min-width: 0;
    gap: 5px;
    padding: 10px 12px;

    .meta-values {
      font-size: 0.78rem;
    }

    .meta-address {
      font-size: 0.72rem;
    }
  `}
`;

const ActionButtons = styled.div`
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  gap: 12px;
  z-index: 1000;

  ${media.down('tablet')`
    left: 14px;
    right: 14px;
    bottom: 14px;
    gap: 8px;
    justify-content: space-between;
    flex-wrap: nowrap;
  `}
`;

const ActionButton = styled.button`
  background: ${({ primary }) => (
    primary
      ? 'linear-gradient(135deg, rgba(214, 179, 106, 0.98) 0%, rgba(188, 152, 80, 1) 100%)'
      : 'rgba(18, 24, 34, 0.92)'
  )};
  color: ${({ primary }) => (primary ? '#16120b' : 'var(--color-text)')};
  border: 1px solid ${({ primary }) => (
    primary ? 'rgba(214, 179, 106, 0.26)' : 'rgba(255, 255, 255, 0.14)'
  )};
  padding: 12px 18px;
  border-radius: var(--panel-inset-radius);
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: ${({ primary }) => (
    primary
      ? '0 14px 30px rgba(214, 179, 106, 0.18)'
      : 'inset 0 1px 0 rgba(255, 255, 255, 0.04)'
  )};
  transition: var(--transition-normal);
  
  &:hover {
    transform: translateY(-1px);
    background: ${({ primary }) => (
      primary
        ? 'linear-gradient(135deg, rgba(220, 186, 114, 0.98) 0%, rgba(196, 158, 84, 1) 100%)'
        : 'rgba(32, 39, 52, 0.98)'
    )};
    border-color: ${({ primary }) => (
      primary ? 'rgba(214, 179, 106, 0.32)' : 'rgba(255, 255, 255, 0.2)'
    )};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .label-phone {
    display: none;
  }

  ${media.down('tablet')`
    padding: 10px 12px;
    font-size: 0.84rem;
    gap: 6px;
    min-height: 42px;
    white-space: nowrap;
    flex: 1 1 0;

    svg {
      width: 14px;
      height: 14px;
    }

    .label-desktop {
      display: none;
    }

    .label-phone {
      display: inline;
    }
  `}
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

const MapSelector = ({ isOpen, onClose, onLocationSelect, initialLocation = null, initialFullAddress = '' }) => {
    const [initialAddr, initialCtry = ''] = initialFullAddress
    .split(',')
    .map(s => s.trim());
    
    const [selectedPosition, setSelectedPosition] = useState(
        initialLocation ? { lat: initialLocation.lat, lng: initialLocation.lng } : null
    );
    
    const [address, setAddress] = useState(initialAddr);
    const [country, setCountry] = useState(initialCtry);
    const [loading, setLoading] = useState(false);
    
    const overlayRef = useRef();
    useEffect(() => {
        const onOutsideClick = (e) => {
            // se il click è sull’overlay esterno, chiudi
            if (e.target === overlayRef.current) {
                onClose();
            }
        };
        document.addEventListener('mousedown', onOutsideClick);
        return () => document.removeEventListener('mousedown', onOutsideClick);
    }, [onClose]);
    
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
            setCountry(data.countryName || '');
        } catch (error) {
            console.error('Errore reverse geocoding:', error);
            setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
    };
    
    const handleLocationClick = async (lat, lng) => {
        setSelectedPosition({ lat, lng });
        await reverseGeocode(lat, lng);
    };
    
    const handleConfirm = useCallback(() => {
        if (selectedPosition && onLocationSelect) {
            let base = address
            ? address
            : `${selectedPosition.lat.toFixed(4)}, ${selectedPosition.lng.toFixed(4)}`;
            const fullAddress = country
            ? `${base}, ${country}`
            : base;
            
            onLocationSelect({
                lat: selectedPosition.lat,
                lng: selectedPosition.lng,
                address: fullAddress
            });
        }
        onClose();
    }, [address, country, onClose, onLocationSelect, selectedPosition]);
    
    // Conferma posizione premendo Invio
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Enter' && selectedPosition) {
                handleConfirm();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [selectedPosition, handleConfirm]);

    useEscapeToClose({
        enabled: isOpen,
        onClose
    });
    
    if (!isOpen) return null;
    
    return (
        <MapSelectorOverlay
        ref={overlayRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.15 } }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        >
        <MapContainer2
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: { type: "spring", damping: 18, stiffness: 400, duration: 0.15 } }}
        exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.15 } }}
        transition={{ type: "spring", damping: 18, stiffness: 400 }}
        >
        <MapHeader>
        <h3><MapPinned size={18} /> Seleziona Posizione</h3>
        <CloseButton onClick={onClose} aria-label="Chiudi">
          <X size={18} />
        </CloseButton>
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
        zoomControl={true}
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

        <MapMetaPanel>
        {selectedPosition && (
            <>
            <div className="meta-label">Coordinate selezionate</div>
            <div className="meta-values">
            {selectedPosition.lat.toFixed(6)}, {selectedPosition.lng.toFixed(6)}
            </div>
            {address && (
                <div className="meta-address">
                {address}{country ? `, ${country}` : ''}
                </div>
            )}
            </>
        )}
        <div className="meta-attribution">Leaflet | © OpenStreetMap contributors</div>
        </MapMetaPanel>
        
        <ActionButtons>
        <ActionButton onClick={getCurrentLocation} disabled={loading}>
        <LocateFixed size={16} />
        <span className="label-desktop">Posizione attuale</span>
        <span className="label-phone">GPS</span>
        </ActionButton>
        <ActionButton onClick={onClose}>
        <X size={16} /> Annulla
        </ActionButton>
        <ActionButton 
        primary 
        onClick={handleConfirm}
        disabled={!selectedPosition}
        >
        <Check size={16} />
        <span className="label-desktop">Conferma Posizione</span>
        <span className="label-phone">Conferma</span>
        </ActionButton>
        </ActionButtons>
        </MapContent>
        </MapContainer2>
        </MapSelectorOverlay>
    );
};

export default MapSelector;
