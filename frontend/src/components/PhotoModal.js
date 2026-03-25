import React, { useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, Map, MapPin } from 'lucide-react';
import { usePhotos } from '../contexts/PhotoContext';
import { LOCAL_IMAGE_FALLBACK, resolveAssetUrl } from '../utils/imageUrl';

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
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-dark);
  overflow: hidden;

  @media (max-width: 1024px) {
    min-height: 300px;
  }
`;

const ImagePreview = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(22px) saturate(1.08);
  transform: scale(1.08);
  opacity: ${({ $loaded }) => ($loaded ? 0 : 0.72)};
  transition: opacity 0.32s ease;
  pointer-events: none;
`;

const LoadingBackdrop = styled(motion.div)`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    180deg,
    rgba(7, 10, 18, 0.2) 0%,
    rgba(7, 10, 18, 0.35) 100%
  );
  pointer-events: none;
`;

const LoadingSpinner = styled(motion.div)`
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: var(--color-accent);
  animation: photo-modal-spin 0.85s linear infinite;

  @keyframes photo-modal-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const ModalImage = styled(motion.img)`
  max-width: 100%;
  max-height: 90vh;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
  opacity: ${({ $loaded }) => ($loaded ? 1 : 0)};
  transition: opacity 0.28s ease, filter 0.28s ease;
  filter: ${({ $loaded }) => ($loaded ? 'none' : 'blur(6px)')};

  @media (max-width: 1024px) {
    max-height: 60vh;
  }
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
  display: inline-flex;
  align-items: center;
  gap: 8px;

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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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
    const navigate = useNavigate();
    const location = useLocation();
    const originalBodyOverflowRef = React.useRef(null);
    const [isFullImageLoaded, setIsFullImageLoaded] = React.useState(false);
    const selectedPhotoId = selectedPhoto?.id;
    const selectedPhotoDerivativesVersion = selectedPhoto?.derivativesVersion;

    const closeModalWithRouteHandling = React.useCallback(() => {
        actions.closePhotoModal();

        if (/^\/photo\/[^/]+\/?$/.test(location.pathname)) {
            navigate('/gallery', { replace: true });
        }
    }, [actions, location.pathname, navigate]);
    
    useEffect(() => {
        if (modalOpen) {
        if (originalBodyOverflowRef.current === null) {
          originalBodyOverflowRef.current = document.body.style.overflow;
        }
        document.body.style.overflow = 'hidden';
        } else {
        document.body.style.overflow = originalBodyOverflowRef.current ?? '';
        originalBodyOverflowRef.current = null;
        }
        
        return () => {
        document.body.style.overflow = originalBodyOverflowRef.current ?? '';
        originalBodyOverflowRef.current = null;
        };
    }, [modalOpen]);
    
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeModalWithRouteHandling();
            }
        };
        
        if (modalOpen) {
            document.addEventListener('keydown', handleEscape);
        }
        
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [modalOpen, closeModalWithRouteHandling]);
    
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            closeModalWithRouteHandling();
        }
    };
    
    const handleLocationClick = () => {
        if (selectedPhoto) {
            if (galleryModalOpen) actions.closeGalleryModal();
            
            // Imposta la foto da focalizzare quando la mappa sarà pronta
            actions.setPendingMapFocus(selectedPhoto);
            
            // Chiudi il modal
            actions.closePhotoModal(true);
            
            // Naviga alla pagina della mappa
            navigate('/map');
        }
    };
    
    const handleTagClick = (tag) => {
      const scrollToTopNow = () => {
        const html = document.documentElement;
        const previousScrollBehavior = html.style.scrollBehavior;
        html.style.scrollBehavior = 'auto';
        window.scrollTo(0, 0);
        html.scrollTop = 0;
        document.body.scrollTop = 0;
        requestAnimationFrame(() => {
          html.style.scrollBehavior = previousScrollBehavior;
        });
      };

        // Resettiamo tutti i filtri e impostiamo solo il tag selezionato
        if (galleryModalOpen) actions.closeGalleryModal();
        actions.setFilter({ search: '', tags: [tag], location: '' });
        actions.closePhotoModal();
        
        // Naviga alla pagina della galleria
        navigate('/gallery');

      // Se eri già su /gallery, il pathname non cambia: forza comunque lo scroll in cima.
      scrollToTopNow();
    };
    
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('it-IT', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatResolution = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const match = raw.match(/^(\d+)\s*x\s*(\d+)$/i);
        if (!match) return raw;
        return `${match[1]} × ${match[2]} px`;
    };

    useEffect(() => {
        if (!modalOpen || !selectedPhotoId) return;
        setIsFullImageLoaded(false);
    }, [modalOpen, selectedPhotoId, selectedPhotoDerivativesVersion]);
    
    if (!selectedPhoto) return null;

    const version = selectedPhoto?.derivativesVersion || selectedPhoto?.updatedAt || selectedPhoto?.id;
    const baseImageSrc = resolveAssetUrl(selectedPhoto.image);
    const imageSrc = version
        ? `${baseImageSrc}${baseImageSrc.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(version))}`
        : baseImageSrc;
    const baseDownloadSrc = resolveAssetUrl(selectedPhoto.image, '');
    const downloadSrc = version
        ? `${baseDownloadSrc}${baseDownloadSrc.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(version))}`
        : baseDownloadSrc;
    const previewSrc = resolveAssetUrl(selectedPhoto?.thumbnail43 || selectedPhoto?.thumbnail11 || '');
    const canDownload = Boolean(downloadSrc);
    const hasTechnicalData = Boolean(
        selectedPhoto.camera ||
        selectedPhoto.lens ||
        selectedPhoto.resolution ||
        selectedPhoto.settings?.aperture ||
        selectedPhoto.settings?.shutter ||
        selectedPhoto.settings?.iso ||
        selectedPhoto.settings?.focal ||
        selectedPhoto.date
    );
    
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
            onClick={closeModalWithRouteHandling}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            >
            ×
            </CloseButton>
            
            <ImageContainer>
            {previewSrc && (
              <ImagePreview
                src={previewSrc}
                alt=""
                aria-hidden="true"
                $loaded={isFullImageLoaded}
              />
            )}
            <LoadingBackdrop
              initial={{ opacity: 0 }}
              animate={{ opacity: isFullImageLoaded ? 0 : 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <LoadingSpinner
                animate={{ opacity: isFullImageLoaded ? 0 : 1, scale: isFullImageLoaded ? 0.96 : 1 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              />
            </LoadingBackdrop>
            <ModalImage
            key={imageSrc}
            $loaded={isFullImageLoaded}
            src={imageSrc}
            alt={selectedPhoto.title}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4 }}
            onLoad={() => {
                setIsFullImageLoaded(true);
            }}
            onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = LOCAL_IMAGE_FALLBACK;
                setIsFullImageLoaded(true);
            }}
            />
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
            <MapPin size={16} />
            {selectedPhoto.location}
            </PhotoLocation>
            
            <PhotoDescription
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            >
            {selectedPhoto.description}
            </PhotoDescription>
            
            {hasTechnicalData && (
                <MetadataSection
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                >
                <MetadataTitle>Dati Tecnici</MetadataTitle>
                <MetadataGrid>
                {selectedPhoto.camera && (
                    <MetadataItem>
                    <div className="label">Camera</div>
                    <div className="value">{selectedPhoto.camera}</div>
                    </MetadataItem>
                )}
                {selectedPhoto.lens && (
                    <MetadataItem>
                    <div className="label">Obiettivo</div>
                    <div className="value">{selectedPhoto.lens}</div>
                    </MetadataItem>
                )}
                {selectedPhoto.resolution && (
                    <MetadataItem>
                    <div className="label">Risoluzione</div>
                    <div className="value">{formatResolution(selectedPhoto.resolution)}</div>
                    </MetadataItem>
                )}
                {selectedPhoto.settings && (
                    <>
                    {selectedPhoto.settings.aperture && (
                        <MetadataItem>
                        <div className="label">Apertura</div>
                        <div className="value">{selectedPhoto.settings.aperture}</div>
                        </MetadataItem>
                    )}
                    {selectedPhoto.settings.shutter && (
                        <MetadataItem>
                        <div className="label">Tempo</div>
                        <div className="value">{selectedPhoto.settings.shutter}</div>
                        </MetadataItem>
                    )}
                    {selectedPhoto.settings.iso && (
                        <MetadataItem>
                        <div className="label">ISO</div>
                        <div className="value">{selectedPhoto.settings.iso}</div>
                        </MetadataItem>
                    )}
                    {selectedPhoto.settings.focal && (
                        <MetadataItem>
                        <div className="label">Focale</div>
                        <div className="value">{selectedPhoto.settings.focal}</div>
                        </MetadataItem>
                    )}
                    </>
                )}
                {selectedPhoto.date && (
                    <MetadataItem>
                    <div className="label">Data</div>
                    <div className="value">{formatDate(selectedPhoto.date)}</div>
                    </MetadataItem>
                )}
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
            <Map size={16} />
            Vai alla Mappa
            </ActionButton>
            <ActionButton
            className="primary"
            disabled={!canDownload}
            onClick={() => {
                if (!canDownload) return;
                if (galleryModalOpen) actions.closeGalleryModal();
                const link = document.createElement('a');
                link.href = downloadSrc;
                link.download = `${selectedPhoto.title}.jpg`;
                link.click();
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            >
            <Download size={16} />
            Download
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
