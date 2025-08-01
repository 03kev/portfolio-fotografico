import React, { useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { usePhotos } from '../contexts/PhotoContext';
import { IMAGES_BASE_URL } from '../utils/constants';

const ModalOverlay = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  z-index: var(--z-modal);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-lg);

  @media (max-width: 768px) {
    padding: var(--spacing-md);
  }
`;

const ModalContent = styled(motion.div)`
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  background: rgba(0, 0, 0, 0.8);
  border-radius: var(--border-radius-xl);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: var(--shadow-2xl);
  display: flex;
  flex-direction: row;

  @media (max-width: 1024px) {
    flex-direction: column;
    max-width: 95vw;
    max-height: 95vh;
  }
`;

const ImageContainer = styled.div`
  flex: 2;
  position: relative;
  min-height: 400px;
  background: var(--color-dark);

  @media (max-width: 1024px) {
    min-height: 300px;
  }
`;

const ModalImage = styled(motion.img)`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
`;

const InfoPanel = styled.div`
  flex: 1;
  min-width: 350px;
  max-width: 400px;
  padding: var(--spacing-2xl);
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(20px);

  @media (max-width: 1024px) {
    min-width: auto;
    max-width: none;
    padding: var(--spacing-lg);
    max-height: 300px;
  }

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
  }
`;

const CloseButton = styled(motion.button)`
  position: absolute;
  top: var(--spacing-lg);
  right: var(--spacing-lg);
  width: 48px;
  height: 48px;
  background: rgba(0, 0, 0, 0.8);
  color: var(--color-white);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  cursor: pointer;
  font-size: var(--font-size-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  backdrop-filter: blur(10px);
  transition: all var(--transition-normal);

  &:hover {
    background: rgba(245, 87, 108, 0.8);
    border-color: var(--color-secondary);
  }

  @media (max-width: 768px) {
    top: var(--spacing-md);
    right: var(--spacing-md);
    width: 40px;
    height: 40px;
    font-size: var(--font-size-lg);
  }
`;

const NavigationControls = styled(motion.div)`
  position: absolute;
  bottom: var(--spacing-lg);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: var(--spacing-md);
  z-index: 10;
  
  @media (max-width: 768px) {
    bottom: var(--spacing-md);
    gap: var(--spacing-sm);
  }
`;

const NavButton = styled(motion.button)`
  width: 48px;
  height: 48px;
  background: rgba(0, 0, 0, 0.8);
  color: var(--color-white);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  cursor: pointer;
  font-size: var(--font-size-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
  transition: all var(--transition-normal);
  
  &:hover:not(:disabled) {
    background: var(--accent-gradient);
    border-color: transparent;
    transform: translateY(-2px);
  }
  
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  
  @media (max-width: 768px) {
    width: 40px;
    height: 40px;
    font-size: var(--font-size-base);
  }
`;

const LocationIndicator = styled(motion.div)`
  background: rgba(0, 0, 0, 0.8);
  color: var(--color-white);
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--border-radius-full);
  font-size: var(--font-size-sm);
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
`;

const PhotoTitle = styled(motion.h2)`
  color: var(--color-white);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--spacing-sm);
  line-height: 1.2;

  @media (max-width: 768px) {
    font-size: var(--font-size-xl);
  }
`;

const PhotoLocation = styled(motion.p)`
  color: var(--color-accent);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--spacing-lg);
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover {
    color: var(--color-white);
  }
`;

const PhotoDescription = styled(motion.p)`
  color: rgba(255, 255, 255, 0.8);
  font-size: var(--font-size-base);
  line-height: 1.6;
  margin-bottom: var(--spacing-xl);
`;

const MetadataSection = styled(motion.div)`
  margin-bottom: var(--spacing-xl);
`;

const MetadataTitle = styled.h3`
  color: var(--color-white);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const MetadataGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const MetadataItem = styled.div`
  background: rgba(255, 255, 255, 0.03);
  padding: var(--spacing-md);
  border-radius: var(--border-radius);
  border: 1px solid rgba(255, 255, 255, 0.05);

  .label {
    color: rgba(255, 255, 255, 0.6);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--spacing-xs);
  }

  .value {
    color: var(--color-white);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
  }
`;

const TagsContainer = styled(motion.div)`
  margin-bottom: var(--spacing-xl);
`;

const TagsGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
`;

const Tag = styled(motion.span)`
  background: var(--accent-gradient);
  color: var(--color-white);
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--border-radius-full);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(79, 172, 254, 0.3);
  }
`;

const ActionButtons = styled(motion.div)`
  display: flex;
  gap: var(--spacing-md);
  margin-top: var(--spacing-xl);
`;

const ActionButton = styled(motion.button)`
  flex: 1;
  padding: var(--spacing-md) var(--spacing-lg);
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-white);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--border-radius);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-normal);
  backdrop-filter: blur(10px);

  &:hover {
    background: var(--accent-gradient);
    border-color: transparent;
    transform: translateY(-2px);
  }

  &.primary {
    background: var(--primary-gradient);
    border-color: transparent;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(103, 126, 234, 0.4);
    }
  }
`;

const PhotoModal = () => {
    const { modalOpen, selectedPhoto, actions, galleryModalOpen } = usePhotos();
    
    useEffect(() => {
        if (modalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, [modalOpen]);
    
    const handleNavigateNext = useCallback(() => {
        const nextPhoto = actions.findNextPhoto(selectedPhoto);
        if (nextPhoto) {
            actions.openPhotoModal(nextPhoto);
            // Centra anche sulla mappa
            actions.focusOnPhoto(nextPhoto);
        }
    }, [selectedPhoto, actions]);
    
    const handleNavigatePrevious = useCallback(() => {
        const prevPhoto = actions.findPreviousPhoto(selectedPhoto);
        if (prevPhoto) {
            actions.openPhotoModal(prevPhoto);
            // Centra anche sulla mappa
            actions.focusOnPhoto(prevPhoto);
        }
    }, [selectedPhoto, actions]);
    
    const handleNavigateNearest = useCallback(() => {
        const nearestPhoto = actions.findNearestPhoto(selectedPhoto, [selectedPhoto.id]);
        if (nearestPhoto) {
            actions.openPhotoModal(nearestPhoto);
            // Centra anche sulla mappa
            actions.focusOnPhoto(nearestPhoto);
        }
    }, [selectedPhoto, actions]);
    
    useEffect(() => {
        const handleKeyPress = (e) => {
            if (e.key === 'Escape') {
                actions.closePhotoModal();
            } else if (e.key === 'ArrowLeft') {
                handleNavigatePrevious();
            } else if (e.key === 'ArrowRight') {
                handleNavigateNext();
            }
        };
        
        if (modalOpen) {
            document.addEventListener('keydown', handleKeyPress);
        }
        
        return () => {
            document.removeEventListener('keydown', handleKeyPress);
        };
    }, [modalOpen, actions, handleNavigatePrevious, handleNavigateNext]);
    

    
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            actions.closePhotoModal();
        }
    };
    
    const handleLocationClick = () => {
        if (selectedPhoto) {
            if (galleryModalOpen) actions.closeGalleryModal();
            // Passa un flag per indicare che stiamo navigando alla mappa
            
            setTimeout(() => {
                actions.focusOnPhoto(selectedPhoto);
                actions.closePhotoModal(true);
                const mapSection = document.getElementById('world-map-3d');
                if (mapSection) {
                    mapSection.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100);
        }
    };
    
    const handleTagClick = (tag) => {
        // Resettiamo tutti i filtri e impostiamo solo il tag selezionato
        // Usando setFilterAndSync per forzare la sincronizzazione con la Gallery
        if (galleryModalOpen) actions.closeGalleryModal();
        actions.setFilterAndSync({ search: '', tags: [tag], location: '' });
        actions.closePhotoModal();
        const gallerySection = document.getElementById('galleria');
        if (gallerySection) {
            setTimeout(() => {
                gallerySection.scrollIntoView({ behavior: 'smooth' });
            }, 150);
        }
    };
    
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('it-IT', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };
    
    if (!selectedPhoto) return null;
    
    return (
        <AnimatePresence>
        {modalOpen && (
            <ModalOverlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleOverlayClick}
            >
            <ModalContent
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={(e) => e.stopPropagation()}
            >
            <CloseButton
            onClick={actions.closePhotoModal}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            >
            ×
            </CloseButton>
            
            <ImageContainer>
            <ModalImage
            src={`${IMAGES_BASE_URL}${selectedPhoto.image}`}
            alt={selectedPhoto.title}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4 }}
            onError={(e) => {
                e.target.src = `https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=900&fit=crop`;
            }}
            />
            
            <NavigationControls
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            >
            <NavButton
            onClick={handleNavigatePrevious}
            disabled={!actions.findPreviousPhoto(selectedPhoto)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Foto precedente (←)"
            >
            ←
            </NavButton>
            
            <LocationIndicator>
            📍 Più vicina
            </LocationIndicator>
            
            <NavButton
            onClick={handleNavigateNearest}
            disabled={!actions.findNearestPhoto(selectedPhoto, [selectedPhoto.id])}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Foto più vicina geograficamente"
            >
            📍
            </NavButton>
            
            <NavButton
            onClick={handleNavigateNext}
            disabled={!actions.findNextPhoto(selectedPhoto)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Foto successiva (→)"
            >
            →
            </NavButton>
            </NavigationControls>
            </ImageContainer>
            
            <InfoPanel>
            <PhotoTitle
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            >
            {selectedPhoto.title}
            </PhotoTitle>
            
            <PhotoLocation
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            onClick={handleLocationClick}
            >
            📍 {selectedPhoto.location}
            </PhotoLocation>
            
            <PhotoDescription
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            >
            {selectedPhoto.description}
            </PhotoDescription>
            
            {selectedPhoto.camera && (
                <MetadataSection
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                >
                <MetadataTitle>Dati Tecnici</MetadataTitle>
                <MetadataGrid>
                <MetadataItem>
                <div className="label">Camera</div>
                <div className="value">{selectedPhoto.camera}</div>
                </MetadataItem>
                {selectedPhoto.lens && (
                    <MetadataItem>
                    <div className="label">Obiettivo</div>
                    <div className="value">{selectedPhoto.lens}</div>
                    </MetadataItem>
                )}
                {selectedPhoto.settings && (
                    <>
                    <MetadataItem>
                    <div className="label">Apertura</div>
                    <div className="value">{selectedPhoto.settings.aperture}</div>
                    </MetadataItem>
                    <MetadataItem>
                    <div className="label">Tempo</div>
                    <div className="value">{selectedPhoto.settings.shutter}</div>
                    </MetadataItem>
                    <MetadataItem>
                    <div className="label">ISO</div>
                    <div className="value">{selectedPhoto.settings.iso}</div>
                    </MetadataItem>
                    <MetadataItem>
                    <div className="label">Focale</div>
                    <div className="value">{selectedPhoto.settings.focal}</div>
                    </MetadataItem>
                    </>
                )}
                <MetadataItem>
                <div className="label">Data</div>
                <div className="value">{formatDate(selectedPhoto.date)}</div>
                </MetadataItem>
                </MetadataGrid>
                </MetadataSection>
            )}
            
            {selectedPhoto.tags && selectedPhoto.tags.length > 0 && (
                <TagsContainer
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                >
                <MetadataTitle>Tag</MetadataTitle>
                <TagsGrid>
                {selectedPhoto.tags.map((tag, index) => (
                    <Tag
                    key={tag}
                    onClick={() => handleTagClick(tag)}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.1 * index }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    >
                    {tag}
                    </Tag>
                ))}
                </TagsGrid>
                </TagsContainer>
            )}
            
            <ActionButtons
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.6 }}
            >
            <ActionButton
            onClick={handleLocationClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            >
            📍 Vai alla Mappa
            </ActionButton>
            <ActionButton
            className="primary"
            onClick={() => {
                if (galleryModalOpen) actions.closeGalleryModal();
                const link = document.createElement('a');
                link.href = `https://images.unsplash.com/photo-${selectedPhoto.id > 3 ? '1516426122078-c23e76319801' : '1506905925346-21bda4d32df4'}?w=1920&h=1080&fit=crop`;
                link.download = `${selectedPhoto.title}.jpg`;
                link.click();
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            >
            💾 Download
            </ActionButton>
            </ActionButtons>
            </InfoPanel>
            </ModalContent>
            </ModalOverlay>
        )}
        </AnimatePresence>
    );
};

export default PhotoModal;
