import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { Download, Map, MapPin } from 'lucide-react';
import { usePhotos } from '../contexts/PhotoContext';
import { LOCAL_IMAGE_FALLBACK, resolveAssetUrl, resolveVersionedAssetUrl } from '../utils/imageUrl';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useSharedImageLoadState } from '../hooks/useSharedImageLoadState';
import { useMobileDeviceLayout } from '../hooks';

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
  background: var(--color-dark);
  overflow: hidden;

  @media (max-width: 1024px) {
    flex: 0 0 auto;
    min-height: 0;
    height: clamp(260px, 46vh, 420px);
  }

  @media (max-width: 768px) {
    height: clamp(300px, 52dvh, 440px);
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
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(20px);

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
    margin-bottom: 10px;
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

  @media (max-width: 768px) {
    font-size: var(--font-size-base);
    margin-bottom: 12px;
  }
`;

const PhotoDescription = styled(motion.p)`
  color: rgba(255, 255, 255, 0.8);
  font-size: var(--font-size-base);
  line-height: 1.6;
  margin-bottom: var(--spacing-xl);

  @media (max-width: 768px) {
    font-size: var(--font-size-sm);
    line-height: 1.55;
    margin-bottom: 14px;
  }
`;

const MetadataSection = styled(motion.div)`
  margin-bottom: var(--spacing-xl);

  @media (max-width: 768px) {
    margin-bottom: 16px;
  }
`;

const MetadataTitle = styled.h3`
  color: var(--color-white);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  @media (max-width: 768px) {
    font-size: var(--font-size-base);
    margin-bottom: 10px;
    padding-bottom: 8px;
  }
`;

const MetadataGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  @media (max-width: 360px) {
    grid-template-columns: 1fr;
  }
`;

const MetadataItem = styled.div`
  background: rgba(255, 255, 255, 0.02);
  padding: 13px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);

  &.wide {
    grid-column: 1 / -1;
  }

  .label {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.78rem;
    font-weight: var(--font-weight-medium);
    margin-bottom: 6px;
  }

  .value {
    color: var(--color-white);
    font-size: 0.98rem;
    font-weight: var(--font-weight-medium);
    line-height: 1.35;
  }
`;

const TagsContainer = styled(motion.div)`
  margin-bottom: var(--spacing-xl);
`;

const TagsGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);

  @media (max-width: 768px) {
    gap: 8px;
  }
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

  @media (max-width: 768px) {
    flex-direction: row;
    gap: 10px;
    margin-top: 16px;
  }
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

  @media (max-width: 768px) {
    min-width: 0;
    padding: 14px 12px;
    font-size: 0.95rem;
    gap: 6px;
  }

  @media (max-width: 420px) {
    font-size: 0.88rem;
    padding: 13px 10px;

    svg {
      width: 15px;
      height: 15px;
    }
  }
`;

const MobileViewport = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.9);
`;

const MobileCarousel = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const MobileSlide = styled.section`
  flex: 0 0 100%;
  min-width: 100%;
  min-height: 0;
  scroll-snap-align: start;
  scroll-snap-stop: always;
`;

const MobileImageSlide = styled(ImageContainer)`
  height: 100%;
  min-height: 0;
  flex: none;
  background: rgba(0, 0, 0, 0.94);
`;

const MobileInfoSlide = styled(InfoPanel)`
  height: 100%;
  min-height: 0;
  max-width: none;
  min-width: 0;
  border-top: 0;
  padding: 22px 18px 18px;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const MobileIndicatorBar = styled.div`
  display: flex;
  justify-content: center;
  padding: 10px 0 14px;
  margin-top: 4px;
  background: linear-gradient(
    180deg,
    rgba(10, 12, 18, 0) 0%,
    rgba(10, 12, 18, 0.34) 100%
  );
  pointer-events: none;
`;

const MobileIndicatorPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border-radius: 999px;
  background: rgba(8, 10, 16, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(14px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.26);
`;

const MobileIndicatorDot = styled.span`
  width: ${({ $active }) => ($active ? '18px' : '7px')};
  height: 7px;
  border-radius: 999px;
  background: ${({ $active }) =>
    $active ? 'var(--color-accent)' : 'rgba(255, 255, 255, 0.25)'};
  transition: width 0.22s ease, background 0.22s ease, opacity 0.22s ease;
  opacity: ${({ $active }) => ($active ? 1 : 0.9)};
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

    const renderInfoContent = (withMotion = true) => (
      <>
        <PhotoTitle
          initial={withMotion ? { opacity: 0, y: 20 } : false}
          animate={withMotion ? { opacity: 1, y: 0 } : false}
          transition={withMotion ? { duration: 0.4, delay: 0.1 } : undefined}
        >
          {selectedPhoto.title}
        </PhotoTitle>

        <PhotoLocation
          initial={withMotion ? { opacity: 0, y: 20 } : false}
          animate={withMotion ? { opacity: 1, y: 0 } : false}
          transition={withMotion ? { duration: 0.4, delay: 0.2 } : undefined}
          onClick={handleLocationClick}
        >
          <MapPin size={16} />
          {selectedPhoto.location}
        </PhotoLocation>

        {selectedPhoto.description && (
          <PhotoDescription
            initial={withMotion ? { opacity: 0, y: 20 } : false}
            animate={withMotion ? { opacity: 1, y: 0 } : false}
            transition={withMotion ? { duration: 0.4, delay: 0.3 } : undefined}
          >
            {selectedPhoto.description}
          </PhotoDescription>
        )}

        {hasTechnicalData && (
          <MetadataSection
            initial={withMotion ? { opacity: 0, y: 20 } : false}
            animate={withMotion ? { opacity: 1, y: 0 } : false}
            transition={withMotion ? { duration: 0.4, delay: 0.4 } : undefined}
          >
            <MetadataTitle>Dati Tecnici</MetadataTitle>
            <MetadataGrid>
              {selectedPhoto.camera && (
                <MetadataItem className="wide">
                  <div className="label">Camera</div>
                  <div className="value">{selectedPhoto.camera}</div>
                </MetadataItem>
              )}
              {selectedPhoto.lens && (
                <MetadataItem className="wide">
                  <div className="label">Obiettivo</div>
                  <div className="value">{selectedPhoto.lens}</div>
                </MetadataItem>
              )}
              {selectedPhoto.resolution && (
                <MetadataItem className="wide">
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
                <MetadataItem className="wide">
                  <div className="label">Data</div>
                  <div className="value">{formatDate(selectedPhoto.date)}</div>
                </MetadataItem>
              )}
            </MetadataGrid>
          </MetadataSection>
        )}

        {selectedPhoto.tags && selectedPhoto.tags.length > 0 && (
          <TagsContainer
            initial={withMotion ? { opacity: 0, y: 20 } : false}
            animate={withMotion ? { opacity: 1, y: 0 } : false}
            transition={withMotion ? { duration: 0.4, delay: 0.5 } : undefined}
          >
            <MetadataTitle>Tag</MetadataTitle>
            <TagsGrid>
              {selectedPhoto.tags.map((tag, index) => (
                <Tag
                  key={tag}
                  onClick={() => handleTagClick(tag)}
                  initial={withMotion ? { opacity: 0, scale: 0.8 } : false}
                  animate={withMotion ? { opacity: 1, scale: 1 } : false}
                  transition={withMotion ? { duration: 0.3, delay: 0.1 * index } : undefined}
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
          initial={withMotion ? { opacity: 0, y: 20 } : false}
          animate={withMotion ? { opacity: 1, y: 0 } : false}
          transition={withMotion ? { duration: 0.4, delay: 0.6 } : undefined}
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
      </>
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
              <MobileViewport>
                <MobileCarousel
                  ref={mobileCarouselRef}
                  onScroll={handleMobileCarouselScroll}
                >
                  <MobileSlide aria-label="Foto">
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
                  </MobileSlide>
                  <MobileSlide aria-label="Dettagli">
                    <MobileInfoSlide>{renderInfoContent(false)}</MobileInfoSlide>
                  </MobileSlide>
                </MobileCarousel>
                <MobileIndicatorBar>
                  <MobileIndicatorPill aria-hidden="true">
                    <MobileIndicatorDot $active={activeMobileSlide === 0} />
                    <MobileIndicatorDot $active={activeMobileSlide === 1} />
                  </MobileIndicatorPill>
                </MobileIndicatorBar>
              </MobileViewport>
            )}

            {!isMobileLayout && <InfoPanel>{renderInfoContent(true)}</InfoPanel>}
            </ModalContent>
            </ModalOverlay>
        )}
        </AnimatePresence>
    );
};

export default PhotoModal;
