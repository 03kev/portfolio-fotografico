import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoaderCircle, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { usePhotos } from '../contexts/PhotoContext';
import {
  LOCAL_IMAGE_FALLBACK,
  resolveAssetUrl,
  resolvePhotoAssetUrl
} from '../utils/imageUrl';
import { markImageSourceLoaded } from '../utils/imageLoadCache';
import { API_BASE_URL } from '../utils/constants';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useSharedImageLoadState } from '../hooks/useSharedImageLoadState';
import { useImagePinchZoom } from '../hooks/useImagePinchZoom';
import { useMediaQuery } from '../hooks';
import {
  combineMediaQueries,
  inputQueries,
  viewportBreakpoints,
  viewportQueries
} from '../styles/responsive';
import PhotoModalDetails from './photoModal/PhotoModalDetails';
import PhotoModalPager from './photoModal/PhotoModalPager';

const prefetchedMobileImageSources = new Set();

const getMobileImageSource = (photo) => {
  if (!photo?.assets?.mobile?.url) return '';
  return resolvePhotoAssetUrl(photo, 'mobile', '');
};

const canPrefetchMobileImages = () => {
  if (typeof navigator === 'undefined') return false;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return !connection?.saveData && !String(connection?.effectiveType || '').includes('2g');
};

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

  @media (max-width: ${viewportBreakpoints.medium}px) {
    padding: var(--spacing-md);
    background: rgba(2, 4, 10, 0.98);
    backdrop-filter: none;
  }
`;

const ModalContent = styled(motion.div)`
  position: relative;
  max-width: ${({ $compactLayout }) => ($compactLayout ? 'min(94vw, 980px)' : '90vw')};
  max-height: ${({ $compactLayout }) => ($compactLayout ? 'min(92vh, 920px)' : '90vh')};
  width: ${({ $compactLayout }) => ($compactLayout ? 'min(94vw, 980px)' : 'auto')};
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

  @media (max-width: ${viewportBreakpoints.large}px) {
    flex-direction: column;
    max-width: 95vw;
    max-height: 95vh;
    width: min(95vw, 680px);
  }

  @media (max-width: ${viewportBreakpoints.medium}px) {
    width: min(100%, 420px);
    max-width: 100%;
    max-height: calc(100dvh - 24px);
    height: min(calc(100dvh - 24px), 820px);
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.34);
  }
`;

const ImageContainer = styled.div`
  flex: ${({ $detailsExpanded }) => ($detailsExpanded ? '1.35' : '2')};
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ $portraitDesktop, $detailsExpanded }) => {
    if ($portraitDesktop) return '0';
    return $detailsExpanded ? 'clamp(12px, 1.4vw, 18px)' : 'clamp(14px, 1.9vw, 22px)';
  }};
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0) 32%),
    linear-gradient(180deg, rgba(13, 16, 25, 0.98) 0%, rgba(7, 9, 15, 0.98) 100%);
  overflow: hidden;

  @media (max-width: ${viewportBreakpoints.large}px) {
    flex: 0 0 auto;
    min-height: 0;
    height: clamp(260px, 46vh, 420px);
    padding: 14px;
  }

  @media (max-width: ${viewportBreakpoints.medium}px) {
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

  @media (max-width: ${viewportBreakpoints.medium}px) {
    filter: none;
    transform: none;
    opacity: ${({ $loaded }) => ($loaded ? 0 : 0.38)};
    transition-duration: 0.18s;
  }
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

  @media (max-width: ${viewportBreakpoints.large}px) {
    max-height: 100%;
    width: 100%;
  }

  @media (max-width: ${viewportBreakpoints.medium}px) {
    filter: none;
    transition: opacity 0.18s ease;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
    touch-action: ${({ $zoomable, $zoomed }) => {
      if (!$zoomable) return 'auto';
      return $zoomed ? 'none' : 'pan-x';
    }};
    user-select: none;
    -webkit-user-drag: none;
    will-change: ${({ $zoomable }) => ($zoomable ? 'transform' : 'auto')};
  }
`;

const InfoPanel = styled.div`
  flex: 1;
  min-width: ${({ $detailsExpanded }) => ($detailsExpanded ? '440px' : '350px')};
  max-width: ${({ $detailsExpanded }) => ($detailsExpanded ? '560px' : '400px')};
  padding: ${({ $detailsExpanded }) => ($detailsExpanded ? '28px 28px 24px' : 'var(--spacing-2xl)')};
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(214, 181, 102, 0.42) rgba(255, 255, 255, 0.05);
  background:
    linear-gradient(180deg, rgba(8, 10, 16, 0.96) 0%, rgba(4, 5, 10, 0.94) 100%);
  backdrop-filter: blur(22px);

  @media (max-width: ${viewportBreakpoints.large}px) {
    flex: 1 1 auto;
    min-height: 0;
    min-width: auto;
    max-width: none;
    padding: var(--spacing-lg);
    max-height: none;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  @media (max-width: ${viewportBreakpoints.medium}px) {
    padding: 16px 16px 18px;
    backdrop-filter: none;
  }

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 10px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.04);
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }

  &::-webkit-scrollbar-thumb {
    background:
      linear-gradient(180deg, rgba(214, 181, 102, 0.52) 0%, rgba(176, 144, 77, 0.56) 100%);
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: padding-box;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 0 0 1px rgba(214, 181, 102, 0.1);
  }

  &::-webkit-scrollbar-thumb:hover {
    background:
      linear-gradient(180deg, rgba(224, 191, 111, 0.72) 0%, rgba(190, 156, 82, 0.76) 100%);
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

  @media (max-width: ${viewportBreakpoints.medium}px) {
    top: var(--spacing-md);
    right: var(--spacing-md);
    width: 40px;
    height: 40px;
    font-size: var(--font-size-lg);
    backdrop-filter: none;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
  }
`;

const PagerQualityButton = styled.button`
  border: 1px solid ${({ $active }) => ($active ? 'rgba(214, 179, 106, 0.68)' : 'rgba(255, 255, 255, 0.22)')};
  border-radius: var(--border-radius-full);
  width: 38px;
  height: 38px;
  padding: 0;
  background: ${({ $active }) => ($active ? 'rgba(214, 179, 106, 0.2)' : 'rgba(10, 12, 18, 0.88)')};
  color: ${({ $active }) => ($active ? 'rgb(255, 231, 174)' : 'rgba(255, 255, 255, 0.92)')};
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
  display: inline-grid;
  place-items: center;
  cursor: ${({ $loading }) => ($loading ? 'progress' : 'pointer')};

  &:disabled {
    opacity: 0.82;
  }
`;

const PagerQualityLoader = styled(LoaderCircle)`
  animation: photo-modal-quality-spin 0.8s linear infinite;

  @keyframes photo-modal-quality-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const PagerImageSlide = styled(ImageContainer)`
  height: 100%;
  min-height: 0;
  flex: none;
  background:
    linear-gradient(180deg, rgba(10, 12, 18, 0.98) 0%, rgba(4, 6, 10, 0.98) 100%);
`;

const PagerInfoSlide = styled(InfoPanel)`
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
    const { modalOpen, photos, selectedPhoto, actions, galleryModalOpen } = usePhotos();
    const navigate = useNavigate();
    const location = useLocation();
    const isNarrowViewport = useMediaQuery(viewportQueries.down('medium'));
    const isCompactViewport = useMediaQuery(viewportQueries.constrained({
      maxWidth: 1120,
      maxHeight: 860
    }));
    const hasCoarseInput = useMediaQuery(inputQueries.anyCoarse);
    const preferNativeShare = useMediaQuery(combineMediaQueries(
      inputQueries.cannotHover,
      inputQueries.primaryCoarse
    ));
    const originalBodyOverflowRef = React.useRef(null);
    const pagerCarouselRef = useRef(null);
    const qualityRequestIdRef = useRef(0);
    const infoPanelRef = useRef(null);
    const [activePagerSlide, setActivePagerSlide] = useState(0);
    const [detailsExpanded, setDetailsExpanded] = useState(false);
    const [useFullImageFallback, setUseFullImageFallback] = useState(false);
    const [showFullResolution, setShowFullResolution] = useState(false);
    const [isQualitySwitching, setIsQualitySwitching] = useState(false);
    const selectedPhotoId = selectedPhoto?.id;
    const fullImageSrc = resolvePhotoAssetUrl(selectedPhoto, 'full');
    const mobileImageSrc = selectedPhoto?.assets?.mobile?.url
      ? resolvePhotoAssetUrl(selectedPhoto, 'mobile', '')
      : '';
    const imageSrc = isNarrowViewport && mobileImageSrc && !showFullResolution && !useFullImageFallback
      ? mobileImageSrc
      : fullImageSrc;
    const downloadSrc = selectedPhotoId
      ? `${API_BASE_URL}/photos/${encodeURIComponent(String(selectedPhotoId))}/download`
      : '';
    const previewSrc = resolveAssetUrl(
      selectedPhoto?.assets?.['thumbnail-4x3']?.url
        || selectedPhoto?.assets?.['thumbnail-1x1']?.url
        || '',
      ''
    );
    const { isLoaded: isFullImageLoaded, setIsLoaded: setIsFullImageLoaded, markLoaded: markFullImageLoaded } = useSharedImageLoadState(imageSrc, modalOpen && Boolean(selectedPhotoId));
    const isImageDisplayReady = isFullImageLoaded || isQualitySwitching;
    const imageZoom = useImagePinchZoom({
      enabled: modalOpen && isNarrowViewport && hasCoarseInput && isFullImageLoaded,
      resetKey: `${modalOpen ? 'open' : 'closed'}:${selectedPhotoId || ''}`
    });

    useEffect(() => {
      qualityRequestIdRef.current += 1;
      setUseFullImageFallback(false);
      setShowFullResolution(false);
      setIsQualitySwitching(false);
    }, [selectedPhotoId, mobileImageSrc]);

    useEffect(() => {
      if (
        !modalOpen ||
        !isNarrowViewport ||
        !isFullImageLoaded ||
        showFullResolution ||
        !selectedPhotoId ||
        !canPrefetchMobileImages()
      ) {
        return undefined;
      }

      const currentIndex = photos.findIndex((photo) => String(photo.id) === String(selectedPhotoId));
      if (currentIndex < 0) return undefined;

      const sources = [photos[currentIndex - 1], photos[currentIndex + 1]]
        .map(getMobileImageSource)
        .filter(Boolean);
      if (sources.length === 0) return undefined;

      let cancelled = false;
      const prefetch = () => {
        if (cancelled) return;

        sources.forEach((source) => {
          if (prefetchedMobileImageSources.has(source)) return;
          prefetchedMobileImageSources.add(source);

          const image = new Image();
          image.decoding = 'async';
          if ('fetchPriority' in image) image.fetchPriority = 'low';
          image.onload = () => {
            markImageSourceLoaded(source);
          };
          image.onerror = () => {
            prefetchedMobileImageSources.delete(source);
          };
          image.src = source;
        });
      };

      if (typeof window.requestIdleCallback === 'function') {
        const idleCallbackId = window.requestIdleCallback(prefetch, { timeout: 1200 });
        return () => {
          cancelled = true;
          window.cancelIdleCallback(idleCallbackId);
        };
      }

      const timeoutId = window.setTimeout(prefetch, 250);
      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      };
    }, [isFullImageLoaded, isNarrowViewport, modalOpen, photos, selectedPhotoId, showFullResolution]);

    const handleImageError = useCallback((event) => {
      setIsQualitySwitching(false);
      if (imageSrc === mobileImageSrc && fullImageSrc && !useFullImageFallback) {
        setUseFullImageFallback(true);
        setShowFullResolution(true);
        return;
      }

      event.currentTarget.onerror = null;
      event.currentTarget.src = LOCAL_IMAGE_FALLBACK;
      setIsFullImageLoaded(true);
    }, [fullImageSrc, imageSrc, mobileImageSrc, setIsFullImageLoaded, useFullImageFallback]);

    const handleQualityToggle = useCallback(() => {
      if (isQualitySwitching) return;

      const nextShowFullResolution = !showFullResolution;
      const nextImageSrc = nextShowFullResolution ? fullImageSrc : mobileImageSrc;
      if (!nextImageSrc || nextImageSrc === imageSrc || !isFullImageLoaded) {
        setShowFullResolution(nextShowFullResolution);
        return;
      }

      const requestId = qualityRequestIdRef.current + 1;
      qualityRequestIdRef.current = requestId;
      setIsQualitySwitching(true);

      const image = new Image();
      image.decoding = 'async';
      if ('fetchPriority' in image) image.fetchPriority = 'high';
      image.onload = async () => {
        try {
          await image.decode?.();
        } catch {
          // Alcuni browser rifiutano decode() per immagini già decodificate: il file è comunque pronto.
        }

        if (qualityRequestIdRef.current !== requestId) return;
        markImageSourceLoaded(nextImageSrc);
        setShowFullResolution(nextShowFullResolution);
      };
      image.onerror = () => {
        if (qualityRequestIdRef.current === requestId) setIsQualitySwitching(false);
      };
      image.src = nextImageSrc;
    }, [fullImageSrc, imageSrc, isFullImageLoaded, isQualitySwitching, mobileImageSrc, showFullResolution]);

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

    const handlePagerScroll = useCallback((event) => {
        const { scrollLeft, clientWidth } = event.currentTarget;
        if (!clientWidth) return;
        const nextSlide = Math.round(scrollLeft / clientWidth);
        setActivePagerSlide((prev) => (prev === nextSlide ? prev : nextSlide));
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
        
        // Naviga alla pagina della galleria mantenendo sincronizzati filtro applicato e UI attiva.
        navigate(`/gallery?tag=${encodeURIComponent(tag)}`);

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

    const parsedResolution = (() => {
        const raw = String(selectedPhoto?.resolution || '').trim();
        const match = raw.match(/^(\d+)\s*x\s*(\d+)$/i);
        if (!match) return null;
        const width = Number(match[1]);
        const height = Number(match[2]);
        if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
        return { width, height };
    })();

    const useCompactPagerLayout = isCompactViewport;
    const isPortraitPhoto = Boolean(parsedResolution && parsedResolution.height > parsedResolution.width);

    useEffect(() => {
        if (!modalOpen || !isCompactViewport) return;
        setActivePagerSlide(0);
        if (pagerCarouselRef.current) {
            pagerCarouselRef.current.scrollTo({ left: 0, behavior: 'auto' });
        }
    }, [isCompactViewport, modalOpen, selectedPhotoId]);

    const handlePagerSelectSlide = useCallback((index) => {
      const carouselNode = pagerCarouselRef.current;
      if (!carouselNode) return;

      const nextLeft = index * carouselNode.clientWidth;
      carouselNode.scrollTo({ left: nextLeft, behavior: 'smooth' });
      setActivePagerSlide(index);
    }, []);

    useEffect(() => {
      if (!modalOpen || useCompactPagerLayout) {
        setDetailsExpanded(false);
        return;
      }

      const panel = infoPanelRef.current;
      if (!panel) return;

      let frameId = null;

      const evaluate = () => {
        frameId = null;
        const nextOverflowing = panel.scrollHeight > panel.clientHeight + 8;
        setDetailsExpanded((prev) => (prev || nextOverflowing ? (prev || nextOverflowing) : false));
      };

      const scheduleEvaluate = () => {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = requestAnimationFrame(evaluate);
      };

      scheduleEvaluate();

      const observer = typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(scheduleEvaluate);
      observer?.observe(panel);
      if (!observer) window.addEventListener('resize', scheduleEvaluate);

      return () => {
        if (frameId !== null) cancelAnimationFrame(frameId);
        observer?.disconnect();
        if (!observer) window.removeEventListener('resize', scheduleEvaluate);
      };
    }, [modalOpen, selectedPhotoId, useCompactPagerLayout]);

    if (!selectedPhoto) return null;
    const canDownload = Boolean(downloadSrc);
    
    return (
        <AnimatePresence>
        {modalOpen && (
            <ModalOverlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: isNarrowViewport ? 0.16 : 0.25 }}
            onClick={handleOverlayClick}
            >
            <ModalContent
            $compactLayout={useCompactPagerLayout}
            initial={isNarrowViewport ? { opacity: 0, y: 8 } : { scale: 0.8, opacity: 0 }}
            animate={isNarrowViewport ? { opacity: 1, y: 0 } : { scale: 1, opacity: 1 }}
            exit={isNarrowViewport ? { opacity: 0, y: 8 } : { scale: 0.8, opacity: 0 }}
            transition={{ duration: isNarrowViewport ? 0.18 : 0.3 }}
            onClick={(e) => e.stopPropagation()}
            >
            <CloseButton
            onClick={closeModalWithRouteHandling}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            >
            ×
            </CloseButton>
            
            {!useCompactPagerLayout ? (
            <ImageContainer
            $portraitDesktop={isPortraitPhoto}
            $detailsExpanded={detailsExpanded}
            >
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
            loading="eager"
            fetchPriority="high"
            decoding="async"
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4 }}
            onLoad={() => {
                markFullImageLoaded();
            }}
            onError={handleImageError}
            />
            </ImageContainer>
            ) : (
              <PhotoModalPager
                activeSlide={activePagerSlide}
                carouselRef={pagerCarouselRef}
                onScroll={handlePagerScroll}
                onSelectSlide={handlePagerSelectSlide}
                footerAction={activePagerSlide === 0 && mobileImageSrc && !useFullImageFallback ? (
                  <PagerQualityButton
                    type="button"
                    $active={showFullResolution}
                    $loading={isQualitySwitching}
                    disabled={isQualitySwitching}
                    aria-busy={isQualitySwitching}
                    aria-pressed={showFullResolution}
                    aria-label={showFullResolution ? 'Usa qualità mobile' : 'Carica qualità originale'}
                    title={showFullResolution ? 'Usa qualità mobile' : 'Carica qualità originale'}
                    onClick={handleQualityToggle}
                  >
                    {isQualitySwitching
                      ? <PagerQualityLoader size={17} strokeWidth={2.25} aria-hidden="true" />
                      : <Maximize2 size={17} strokeWidth={2.25} aria-hidden="true" />}
                  </PagerQualityButton>
                ) : null}
                footerEndAction={activePagerSlide === 0 && isFullImageLoaded ? (
                  <PagerQualityButton
                    type="button"
                    $active={imageZoom.isZoomed}
                    aria-pressed={imageZoom.isZoomed}
                    aria-label={imageZoom.isZoomed ? 'Riduci foto' : 'Ingrandisci foto'}
                    title={imageZoom.isZoomed ? 'Riduci foto' : 'Ingrandisci foto'}
                    onClick={imageZoom.toggle}
                  >
                    {imageZoom.isZoomed
                      ? <ZoomOut size={18} strokeWidth={2.25} aria-hidden="true" />
                      : <ZoomIn size={18} strokeWidth={2.25} aria-hidden="true" />}
                  </PagerQualityButton>
                ) : null}
              >
                <PagerImageSlide
                  ref={imageZoom.containerRef}
                  {...imageZoom.handlers}
                >
                  {previewSrc && (
                    <ImagePreview
                      src={previewSrc}
                      alt=""
                      aria-hidden="true"
                      $loaded={isImageDisplayReady}
                    />
                  )}
                  <LoadingBackdrop
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isImageDisplayReady ? 0 : 1 }}
                    transition={{ duration: isNarrowViewport ? 0.12 : 0.2, ease: 'easeOut' }}
                  >
                    <LoadingSpinner
                      animate={isNarrowViewport
                        ? { opacity: isImageDisplayReady ? 0 : 1 }
                        : { opacity: isImageDisplayReady ? 0 : 1, scale: isImageDisplayReady ? 0.96 : 1 }}
                      transition={{ duration: isNarrowViewport ? 0.12 : 0.18, ease: 'easeOut' }}
                    />
                  </LoadingBackdrop>
                  <ModalImage
                    as="img"
                    ref={imageZoom.imageRef}
                    $zoomable
                    $zoomed={imageZoom.isZoomed}
                    $loaded={isImageDisplayReady}
                    src={imageSrc}
                    alt={selectedPhoto.title}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: isNarrowViewport ? 0.18 : 0.28 }}
                    onLoad={() => {
                      markFullImageLoaded();
                      setIsQualitySwitching(false);
                    }}
                    onError={handleImageError}
                  />
                </PagerImageSlide>
                <PagerInfoSlide>
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
                    constrainContent={isCompactViewport && !isNarrowViewport}
                    preferNativeShare={preferNativeShare}
                  />
                </PagerInfoSlide>
              </PhotoModalPager>
            )}

            {!useCompactPagerLayout && (
              <InfoPanel ref={infoPanelRef} $detailsExpanded={detailsExpanded}>
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
                  constrainContent={false}
                  preferNativeShare={preferNativeShare}
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
