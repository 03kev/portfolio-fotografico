import React, { useEffect } from 'react';
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
  background: rgba(0, 0, 0, 0.95);
  z-index: var(--z-modal);
  backdrop-filter: blur(15px);
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
  max-width: 95vw;
  max-height: 90vh;
  background: rgba(0, 0, 0, 0.9);
  border-radius: var(--border-radius-xl);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: var(--shadow-2xl);
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  padding: var(--spacing-xl) var(--spacing-xl) var(--spacing-lg);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(20px);
`;

const Title = styled.h2`
  color: var(--color-white);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  margin: 0 0 var(--spacing-sm) 0;
  text-align: center;

  @media (max-width: 768px) {
    font-size: var(--font-size-xl);
  }
`;

const Subtitle = styled.p`
  color: rgba(255, 255, 255, 0.7);
  font-size: var(--font-size-base);
  margin: 0;
  text-align: center;
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

const PhotoGrid = styled.div`
  padding: var(--spacing-xl);
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--spacing-lg);
  max-height: 70vh;

  @media (max-width: 768px) {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    gap: var(--spacing-md);
  }

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

const PhotoCard = styled(motion.div)`
  background: rgba(255, 255, 255, 0.05);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all var(--transition-normal);
  backdrop-filter: blur(10px);

  &:hover {
    transform: translateY(-4px);
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--color-accent);
    box-shadow: 0 12px 30px rgba(79, 172, 254, 0.2);
  }
`;

const PhotoImage = styled.div`
  width: 100%;
  height: 200px;
  background-image: url(${props => props.src});
  background-size: cover;
  background-position: center;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      180deg,
      transparent 0%,
      transparent 60%,
      rgba(0, 0, 0, 0.7) 100%
    );
  }
`;

const PhotoInfo = styled.div`
  padding: var(--spacing-lg);
`;

const PhotoTitle = styled.h3`
  color: var(--color-white);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: 1.3;
`;

const PhotoLocation = styled.p`
  color: var(--color-accent);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  margin: 0 0 var(--spacing-sm) 0;
`;

const PhotoDescription = styled.p`
  color: rgba(255, 255, 255, 0.8);
  font-size: var(--font-size-sm);
  line-height: 1.4;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const LoadingSpinner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--color-accent);
  font-size: var(--font-size-2xl);
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  padding: var(--spacing-xl);

  .icon {
    font-size: 4rem;
    margin-bottom: var(--spacing-lg);
    opacity: 0.5;
  }

  .title {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--spacing-sm);
  }

  .description {
    font-size: var(--font-size-base);
    opacity: 0.8;
  }
`;

const GalleryModal = () => {
  const { galleryModalOpen, galleryPhotos, actions } = usePhotos();

  useEffect(() => {
    if (galleryModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [galleryModalOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        actions.closeGalleryModal();
      }
    };

    if (galleryModalOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [galleryModalOpen, actions]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      actions.closeGalleryModal();
    }
  };

  const handlePhotoClick = (photo) => {
    actions.closeGalleryModal();
    actions.openPhotoModal(photo);
  };

  const getPhotoSrc = (photo) => {
    // Se la foto ha un'immagine locale, usala
    if (photo.image && photo.image.startsWith('/')) {
      return `${IMAGES_BASE_URL}${photo.image}`;
    }
    
    // Altrimenti usa l'immagine di fallback
    return `https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=400&fit=crop`;
  };

  if (!galleryPhotos || galleryPhotos.length === 0) {
    return null;
  }

  // Determina la località principale del cluster
  const getClusterLocation = () => {
    if (galleryPhotos.length === 1) {
      return galleryPhotos[0].location;
    }

    // Prova a trovare la località comune
    const locations = galleryPhotos.map(p => p.location);
    const commonParts = locations[0].split(',').map(part => part.trim());
    
    // Trova le parti comuni a tutte le località
    const common = commonParts.filter(part => 
      locations.every(loc => loc.includes(part))
    );

    return common.length > 0 ? common[common.length - 1] : 'Località Multiple';
  };

  return (
    <AnimatePresence>
      {galleryModalOpen && (
        <ModalOverlay
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleOverlayClick}
        >
          <ModalContent
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={(e) => e.stopPropagation()}
          >
            <CloseButton
              onClick={actions.closeGalleryModal}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              ×
            </CloseButton>

            <Header>
              <Title>📍 {getClusterLocation()}</Title>
              <Subtitle>
                {galleryPhotos.length} {galleryPhotos.length === 1 ? 'foto' : 'foto'} in questa zona
              </Subtitle>
            </Header>

            <PhotoGrid>
              {galleryPhotos.map((photo, index) => (
                <PhotoCard
                  key={photo.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  onClick={() => handlePhotoClick(photo)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <PhotoImage src={getPhotoSrc(photo)} />
                  
                  <PhotoInfo>
                    <PhotoTitle>{photo.title}</PhotoTitle>
                    <PhotoLocation>📍 {photo.location}</PhotoLocation>
                    {photo.description && (
                      <PhotoDescription>{photo.description}</PhotoDescription>
                    )}
                  </PhotoInfo>
                </PhotoCard>
              ))}
            </PhotoGrid>

            {galleryPhotos.length === 0 && (
              <EmptyState>
                <div className="icon">📷</div>
                <div className="title">Nessuna foto trovata</div>
                <div className="description">
                  Non ci sono foto da mostrare in questa località.
                </div>
              </EmptyState>
            )}
          </ModalContent>
        </ModalOverlay>
      )}
    </AnimatePresence>
  );
};

export default GalleryModal;
