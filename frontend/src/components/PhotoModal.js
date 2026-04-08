import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePhotos } from '../contexts/PhotoContext';
import { LOCAL_IMAGE_FALLBACK, resolveAssetUrl, resolveVersionedAssetUrl } from '../utils/imageUrl';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useSharedImageLoadState } from '../hooks/useSharedImageLoadState';
import { useMobileDeviceLayout } from '../hooks';
import PhotoModalDetails from './photoModal/PhotoModalDetails';
import PhotoModalMobilePager from './photoModal/PhotoModalMobilePager';

const ModalOverlay = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 20% 12%, rgba(214, 181, 102, 0.08) 0%, rgba(214, 181, 102, 0) 28%),
    radial-gradient(circle at 82% 18%, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0) 22%),
    rgba(2, 4, 10, 0.88);
  z-index: var(--z-modal);
  backdrop-filter: blur(16px) saturate(1.05);
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
  background:
    linear-gradient(180deg, rgba(14, 17, 26, 0.98) 0%, rgba(8, 10, 16, 0.96) 100%);
  border-radius: var(--border-radius-xl);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 26px 80px rgba(0, 0, 0, 0.52),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
  display: flex;
  flex-direction: row;

  @media (max-width: 1024px) {
    flex-direction: column;
    max-width: 95vw;
    max-height: 95vh;
    width: min(95vw, 680px);
  }

  @media (max-width: 768px) {
    width: min(100%, 420px);
    max-width: 100%;
    max-height: calc(100dvh - 24px);
    height: min(calc(100dvh - 24px), 820px);
  }
`;

const ImageContainer = styled.div`
  flex: 2;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(14px, 1.9vw, 22px);
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0) 32%),
    linear-gradient(180deg, rgba(13, 16, 25, 0.98) 0%, rgba(7, 9, 15, 0.98) 100%);
  overflow: hidden;

  @media (max-width: 1024px) {
    flex: 0 0 auto;
    min-height: 0;
    height: clamp(260px, 46vh, 420px);
    padding: 14px;
  }

  @media (max-width: 768px) {
    height: clamp(300px, 52dvh, 440px);
    padding: 12px 12px 0;
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
  border-radius: 22px;
  opacity: ${({ $loaded }) => ($loaded ? 1 : 0)};
  transition: opacity 0.28s ease, filter 0.28s ease;
  filter: ${({ $loaded }) => ($loaded ? 'none' : 'blur(6px)')};
  box-shadow:
    0 18px 50px rgba(0, 0, 0, 0.34),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04);

  @media (max-width: 1024px) {
    max-height: 100%;
    width: 100%;
  }
`;

const InfoPanel = styled.div`
  flex: 1;
  min-width: 350px;
  max-width: 400px;
  padding: var(--spacing-2xl);
  overflow-y: auto;
  background:
    linear-gradient(180deg, rgba(8, 10, 16, 0.96) 0%, rgba(4, 5, 10, 0.94) 100%);
  backdrop-filter: blur(22px);

  @media (max-width: 1024px) {
    flex: 1 1 auto;
    min-height: 0;
    min-width: auto;
    max-width: none;
    padding: var(--spacing-lg);
    max-height: none;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  @media (max-width: 768px) {
    padding: 16px 16px 18px;
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
  background: rgba(10, 12, 18, 0.76);
  color: var(--color-white);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  cursor: pointer;
  font-size: var(--font-size-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  backdrop-filter: blur(18px);
  transition: all var(--transition-normal);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);

  &:hover {
    background: rgba(21, 24, 35, 0.92);
    border-color: rgba(214, 181, 102, 0.34);
    transform: translateY(-1px);
  }

  @media (max-width: 768px) {
    top: var(--spacing-md);
    right: var(--spacing-md);
    width: 40px;
    height: 40px;
    font-size: var(--font-size-lg);
  }
`;

const MobileImageSlide = styled(ImageContainer)`
  height: 100%;
  min-height: 0;
  flex: none;
  background:
    linear-gradient(180deg, rgba(10, 12, 18, 0.98) 0%, rgba(4, 6, 10, 0.98) 100%);
`;

const MobileInfoSlide = styled(InfoPanel)`
  height: 100%;
  min-height: 0;
  max-width: none;
  min-width: 0;
  border-top: 0;
  padding: 18px 18px 18px;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const PhotoModal = () => {
    const { modalOpen, selectedPhoto, actions, galleryModalOpen } = usePhotos();
    const navigate = useNavigate();
    const location = useLocation();
    const isMobileLayout = useMobileDeviceLayout({ maxWidth: 768 });
    const originalBodyOverflowRef = React.useRef(null);
    const mobileCarouselRef = useRef(null);
    const [activeMobileSlide, setActiveMobileSlide] = useState(0);
    const selectedPhotoId = selectedPhoto?.id;
    const version = selectedPhoto?.derivativesVersion || selectedPhoto?.updatedAt || selectedPhoto?.id;
    const imageSrc = resolveVersionedAssetUrl(selectedPhoto?.image, version);
    const downloadSrc = resolveVersionedAssetUrl(selectedPhoto?.image, version, '');
    const previewSrc = resolveAssetUrl(selectedPhoto?.thumbnail43 || selectedPhoto?.thumbnail11 || '');
    const { isLoaded: isFullImageLoaded, setIsLoaded: setIsFullImageLoaded, markLoaded: markFullImageLoaded } = useSharedImageLoadState(imageSrc, modalOpen && Boolean(selectedPhotoId));

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
    
    useEscapeToClose({
        enabled: modalOpen,
        onClose: closeModalWithRouteHandling
    });
    
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            closeModalWithRouteHandling();
        }
    };

    const handleMobileCarouselScroll = useCallback((event) => {
        const { scrollLeft, clientWidth } = event.currentTarget;
        if (!clientWidth) return;
        const nextSlide = Math.round(scrollLeft / clientWidth);
        setActiveMobileSlide((prev) => (prev === nextSlide ? prev : nextSlide));
    }, []);
    
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
        if (!modalOpen || !isMobileLayout) return;
        setActiveMobileSlide(0);
        if (mobileCarouselRef.current) {
            mobileCarouselRef.current.scrollTo({ left: 0, behavior: 'auto' });
        }
    }, [isMobileLayout, modalOpen, selectedPhotoId]);

    if (!selectedPhoto) return null;
    const canDownload = Boolean(downloadSrc);
    
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
            
            {!isMobileLayout ? (
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
                markFullImageLoaded();
            }}
            onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = LOCAL_IMAGE_FALLBACK;
                setIsFullImageLoaded(true);
            }}
            />
            </ImageContainer>
            ) : (
              <PhotoModalMobilePager
                activeSlide={activeMobileSlide}
                carouselRef={mobileCarouselRef}
                onScroll={handleMobileCarouselScroll}
              >
                <MobileImageSlide>
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
                    initial={{ scale: 1.04 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.35 }}
                    onLoad={() => {
                      markFullImageLoaded();
                    }}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = LOCAL_IMAGE_FALLBACK;
                      setIsFullImageLoaded(true);
                    }}
                  />
                </MobileImageSlide>
                <MobileInfoSlide>
                  <PhotoModalDetails
                    photo={selectedPhoto}
                    canDownload={canDownload}
                    downloadSrc={downloadSrc}
                    galleryModalOpen={galleryModalOpen}
                    actions={actions}
                    handleLocationClick={handleLocationClick}
                    handleTagClick={handleTagClick}
                    formatDate={formatDate}
                    formatResolution={formatResolution}
                    withMotion={false}
                  />
                </MobileInfoSlide>
              </PhotoModalMobilePager>
            )}

            {!isMobileLayout && (
              <InfoPanel>
                <PhotoModalDetails
                  photo={selectedPhoto}
                  canDownload={canDownload}
                  downloadSrc={downloadSrc}
                  galleryModalOpen={galleryModalOpen}
                  actions={actions}
                  handleLocationClick={handleLocationClick}
                  handleTagClick={handleTagClick}
                  formatDate={formatDate}
                  formatResolution={formatResolution}
                  withMotion
                />
              </InfoPanel>
            )}
            </ModalContent>
            </ModalOverlay>
        )}
        </AnimatePresence>
    );
};

export default PhotoModal;
