import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import styled from 'styled-components';
import { AnimatePresence, motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { PHOTO_UPLOAD_ACCEPT } from '@portfolio/photo-upload-contract';
import { usePhotos } from '../contexts/PhotoContext';
import { LOCAL_IMAGE_FALLBACK, resolvePhotoAssetUrl } from '../utils/imageUrl';
import {
  photoService,
  signExistingSourceUpload,
  uploadSourceToSignedUrl
} from '../utils/api';
import { validateImageFile } from '../utils/photoUploadPolicy';
import { useGalleryQueryState } from '../hooks/useGalleryQueryState';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import {
  useGalleryTouchCardState,
  useMediaQuery,
  useScrollableRail
} from '../hooks';
import {
  combineMediaQueries,
  inputQueries,
  preferenceQueries,
  viewportBreakpoints,
  viewportQueries
} from '../styles/responsive';
import {
  buildOperationErrorMessage
} from '../utils/operationErrors';
import { adminFeedback } from '../utils/adminFeedback';
import { buildPhotoOperationStatus } from '../utils/photoOperationStatus';
import { GalleryCard } from './gallery/GalleryCard';
import { LazyPhotoCropModal, LazyPhotoUpload } from './lazyAdminComponents';
import AdminConfirmDialog from './AdminConfirmDialog';

const DEBOUNCE_DELAY_FILTER = 200;
const REUPLOAD_STEP_LABELS = {
  sign: 'preparazione sostituzione',
  upload: 'caricamento del nuovo originale',
  replace: 'rigenerazione varianti'
};

const CROP_STEP_LABELS = {
  update: 'salvataggio ritaglio',
  regenerate: 'rigenerazione varianti'
};

const SKELETON_CARD_COUNT_WIDE = 9;
const SKELETON_CARD_COUNT_COMPACT = 4;
const INITIAL_VISIBLE_CARDS_WIDE = 18;
const INITIAL_VISIBLE_CARDS_COMPACT = 8;
const VISIBLE_CARDS_BATCH_WIDE = 18;
const VISIBLE_CARDS_BATCH_COMPACT = 8;
const LOAD_MORE_ROOT_MARGIN_WIDE = '700px 0px';
const LOAD_MORE_ROOT_MARGIN_COMPACT = '350px 0px';

const getThumbImageUrl = (photo) => {
  return resolvePhotoAssetUrl(photo, 'thumbnail-4x3');
};

const getPhotoCardUrl = (photo) => `/photo/${encodeURIComponent(String(photo.id))}`;

const getPhotoAltText = (photo) => {
  const title = String(photo?.title || 'Foto').trim() || 'Foto';
  const description = String(photo?.description || '').trim();
  const location = String(photo?.location || '').trim();

  if (description) return `${title} - ${description}`;
  if (location) return `${title} - ${location}`;
  return title;
};

const GallerySection = styled(motion.section)`
  padding: var(--spacing-4xl) 0;
  background: transparent;
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);

  @media (max-width: ${viewportBreakpoints.medium}px) {
    padding: 0 var(--spacing-lg);
  }
`;

const SectionHeader = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--spacing-2xl);
`;

const SectionTitle = styled(motion.h2)`
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: var(--font-weight-extrabold);
  letter-spacing: -0.03em;
  color: var(--color-text);
  margin: 0;
`;

const SectionSubtitle = styled(motion.p)`
  max-width: 680px;
  text-align: center;
  margin: 0;
  color: var(--color-muted);
`;

const ControlsRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-2xl);

  @media (max-width: ${viewportBreakpoints.medium}px) {
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-xl);
  }
`;

const SearchContainer = styled(motion.div)`
  max-width: 560px;
  margin: 0 auto;
  position: relative;

  @media (max-width: ${viewportBreakpoints.medium}px) {
    max-width: none;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 12px 44px 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: var(--border-radius-xl);
  color: var(--color-text);
  font-size: var(--font-size-base);

  &:focus {
    border-color: rgba(214, 179, 106, 0.55);
    box-shadow: 0 0 0 3px rgba(214, 179, 106, 0.10);
  }

  @media (max-width: ${viewportBreakpoints.medium}px) {
    padding: 11px 42px 11px 14px;
    font-size: var(--font-size-sm);
  }
`;

const SearchIcon = styled.div`
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.55);
  pointer-events: none;
`;

const FilterRailShell = styled(motion.div)`
  @media (max-width: ${viewportBreakpoints.medium}px) {
    position: relative;

    &::before,
    &::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 4px;
      width: 34px;
      pointer-events: none;
      z-index: 2;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    &::before {
      left: 0;
      background: linear-gradient(90deg, rgba(8, 10, 16, 0.96) 0%, rgba(8, 10, 16, 0.72) 55%, rgba(8, 10, 16, 0) 100%);
      opacity: ${({ $fadeLeft }) => ($fadeLeft ? 1 : 0)};
    }

    &::after {
      right: 0;
      background: linear-gradient(90deg, rgba(8, 10, 16, 0) 0%, rgba(8, 10, 16, 0.72) 45%, rgba(8, 10, 16, 0.96) 100%);
      opacity: ${({ $fadeRight }) => ($fadeRight ? 1 : 0)};
    }
  }
`;

const FilterContainer = styled(motion.div)`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;

  @media (max-width: ${viewportBreakpoints.medium}px) {
    flex-wrap: nowrap;
    justify-content: flex-start;
    overflow-x: auto;
    overflow-y: hidden;
    gap: 8px;
    padding: 0 10px 4px 2px;
    scrollbar-width: none;
    -ms-overflow-style: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`;

const FilterButton = styled(motion.button)`
  background: ${props => props.$active ? 'rgba(214, 179, 106, 0.14)' : 'rgba(255, 255, 255, 0.03)'};
  color: ${props => props.$active ? 'var(--color-text)' : 'var(--color-muted)'};
  border: 1px solid ${props => props.$active ? 'rgba(214, 179, 106, 0.45)' : 'rgba(255, 255, 255, 0.10)'};
  padding: 8px 12px;
  border-radius: var(--border-radius-full);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);

  &:hover {
    color: var(--color-text);
    border-color: rgba(255, 255, 255, 0.16);
    transform: translateY(-1px);
  }

  @media (max-width: ${viewportBreakpoints.medium}px) {
    flex: 0 0 auto;
    white-space: nowrap;
    padding: 8px 14px;
  }
`;

const GalleryGrid = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--spacing-xl);

  @media (max-width: ${viewportBreakpoints.medium}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-md);
  }

  @media (max-width: 420px) {
    gap: 12px;
  }
`;


const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 320px;
`;

const LoadingSpinner = styled.div`
  width: 42px;
  height: 42px;
  border: 3px solid rgba(255, 255, 255, 0.18);
  border-radius: 50%;
  border-top-color: rgba(214, 179, 106, 0.85);
  animation: spin 1s ease-in-out infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const SkeletonBase = styled.div`
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.08) 45%,
      rgba(255, 255, 255, 0.15) 50%,
      rgba(255, 255, 255, 0.08) 55%,
      transparent 100%
    );
    animation: gallery-skeleton-shimmer 1.3s ease-in-out infinite;
  }

  @keyframes gallery-skeleton-shimmer {
    100% {
      transform: translateX(100%);
    }
  }
`;

const SkeletonSearch = styled(SkeletonBase)`
  width: min(560px, 100%);
  height: 46px;
  border-radius: var(--border-radius-xl);
  margin: 0 auto;
`;

const SkeletonFilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
`;

const SkeletonFilterChip = styled(SkeletonBase)`
  width: ${({ $w }) => $w || 84}px;
  height: 34px;
  border-radius: var(--border-radius-full);
`;

const SkeletonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--spacing-xl);

  @media (max-width: ${viewportBreakpoints.medium}px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-md);
  }

  @media (max-width: 420px) {
    gap: 12px;
  }
`;

const SkeletonCard = styled(SkeletonBase)`
  border-radius: var(--border-radius-2xl);
  aspect-ratio: 4 / 3;
`;

const LoadMoreSentinel = styled.div`
  width: 100%;
  height: 1px;
`;

const NoResults = styled(motion.div)`
  text-align: center;
  padding: var(--spacing-3xl) var(--spacing-lg);
  color: var(--color-muted);

  h3 {
    font-size: var(--font-size-xl);
    margin-bottom: var(--spacing-sm);
    color: var(--color-text);
  }

  p {
    margin: 0;
    font-size: var(--font-size-base);
  }
`;

const Gallery = ({ headingLevel = 'h2', forcedPhotoId = null, hideCardDescriptions = false }) => {
  const { photos, filteredPhotos, loading, actions, modalOpen, photoOpsByPhotoId, pendingUploads } = usePhotos();
  const outletContext = useOutletContext();
  const isAdmin = Boolean(outletContext?.isAdmin);
  const notify = outletContext?.notify || null;
  const openPhotoModalRef = useRef(actions.openPhotoModal);
  const {
    activeFilter,
    searchTerm,
    debouncedSearchTerm,
    photoParam,
    handleFilterClick,
    handleSearchChange,
    clearSearch
  } = useGalleryQueryState({ debounceMs: DEBOUNCE_DELAY_FILTER });
  const resolvedPhotoId = forcedPhotoId || photoParam;
  const hasForcedPhotoId = Boolean(forcedPhotoId);
  const forcedPhotoExists = !hasForcedPhotoId
    || photos.some((photo) => String(photo.id) === String(forcedPhotoId));
  const waitingForForcedModal = hasForcedPhotoId && forcedPhotoExists && !modalOpen;
  const autoOpenedPhotoRef = useRef(null);
  const sourceFileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [croppingPhoto, setCroppingPhoto] = useState(null);
  const [reuploadSourcePhoto, setReuploadSourcePhoto] = useState(null);
  const [photoPendingDelete, setPhotoPendingDelete] = useState(null);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const softProgressTimerRef = useRef(null);
  const reuploadUploadAbortControllerRef = useRef(null);
  const activeReuploadPhotoIdRef = useRef(null);
  const isMountedRef = useRef(true);
  const loadMoreTriggerRef = useRef(null);
  const [visibleCardsCount, setVisibleCardsCount] = useState(INITIAL_VISIBLE_CARDS_WIDE);
  const lastRevealKeyRef = useRef(null);
  const previousGalleryLengthRef = useRef(0);
  const isCompactGalleryViewport = useMediaQuery(viewportQueries.down('content'));
  const isNarrowGalleryViewport = useMediaQuery(viewportQueries.down('medium'));
  const usesTouchCardControls = useMediaQuery(combineMediaQueries(
    viewportQueries.down('content'),
    inputQueries.cannotHover,
    inputQueries.primaryCoarse
  ));
  const prefersReducedMotion = useMediaQuery(preferenceQueries.reducedMotion);
  const initialVisibleCards = isCompactGalleryViewport ? INITIAL_VISIBLE_CARDS_COMPACT : INITIAL_VISIBLE_CARDS_WIDE;
  const visibleCardsBatch = isCompactGalleryViewport ? VISIBLE_CARDS_BATCH_COMPACT : VISIBLE_CARDS_BATCH_WIDE;
  const loadMoreRootMargin = isCompactGalleryViewport ? LOAD_MORE_ROOT_MARGIN_COMPACT : LOAD_MORE_ROOT_MARGIN_WIDE;
  const skeletonCardCount = isCompactGalleryViewport ? SKELETON_CARD_COUNT_COMPACT : SKELETON_CARD_COUNT_WIDE;
  const priorityImageCount = isCompactGalleryViewport ? 1 : 2;
  const {
    activeCardId: touchPhotoId,
    activeAdminCardId: touchAdminPhotoId,
    revealCard: handleRevealTouchCard,
    hideCard: handleHideTouchCard,
    toggleAdmin: handleToggleTouchAdmin,
    closeAdmin: handleCloseTouchAdmin
  } = useGalleryTouchCardState({ enabled: usesTouchCardControls });

  const allTags = useMemo(() =>
    [...new Set(photos.flatMap(photo => Array.isArray(photo.tags) ? photo.tags : []))],
  [photos]);
  const filterOptions = useMemo(() => ['all', ...allTags], [allTags]);
  const {
    railRef: filterRailRef,
    itemRefs: filterButtonRefs,
    fadeState: filterRailFadeState
  } = useScrollableRail({
    activeKey: activeFilter,
    itemCount: filterOptions.length,
    enabled: isNarrowGalleryViewport
  });
  const hasActivePhotoOp = useMemo(
    () => Object.values(photoOpsByPhotoId || {}).some((entry) => Boolean(entry?.active)),
    [photoOpsByPhotoId]
  );

  const galleryCards = useMemo(() => {
    const pendingCards = (pendingUploads || []).map((entry) => ({
      ...entry,
      __pending: true
    }));
    const pendingPhotoIds = new Set(
      pendingCards
        .map((entry) => String(entry?.id || '').trim())
        .filter(Boolean)
    );

    const stablePhotos = filteredPhotos.filter((photo) => !pendingPhotoIds.has(String(photo?.id || '').trim()));
    return [...pendingCards, ...stablePhotos];
  }, [pendingUploads, filteredPhotos]);

  const visibleGalleryCards = useMemo(
    () => galleryCards.slice(0, Math.max(0, visibleCardsCount)),
    [galleryCards, visibleCardsCount]
  );

  useEffect(() => {
    openPhotoModalRef.current = actions.openPhotoModal;
  }, [actions.openPhotoModal]);

  useEffect(() => {
    const nextSearch = debouncedSearchTerm.trim();
    if (nextSearch) {
      if (activeFilter !== 'all') {
        actions.setFilter({ search: nextSearch, tags: [activeFilter] });
      } else {
        actions.setFilter({ search: nextSearch, tags: [] });
      }
    } else {
      if (activeFilter !== 'all') {
        actions.setFilter({ search: '', tags: [activeFilter] });
      } else {
        actions.clearFilters();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, activeFilter]);

  useEffect(() => {
    const revealKey = `${activeFilter}::${debouncedSearchTerm.trim()}`;
    const previousLength = previousGalleryLengthRef.current;
    const nextLength = galleryCards.length;
    const allCardsWereVisible = visibleCardsCount >= previousLength;

    if (lastRevealKeyRef.current !== revealKey) {
      lastRevealKeyRef.current = revealKey;
      setVisibleCardsCount(Math.min(nextLength, initialVisibleCards));
    } else if (allCardsWereVisible) {
      // Keep live updates snappy: if the grid was already fully visible,
      // show newly inserted cards immediately instead of re-running the reveal.
      setVisibleCardsCount(nextLength);
    } else if (visibleCardsCount > nextLength) {
      setVisibleCardsCount(nextLength);
    }

    previousGalleryLengthRef.current = nextLength;
  }, [galleryCards.length, activeFilter, debouncedSearchTerm, visibleCardsCount, initialVisibleCards]);

  useEffect(() => {
    if (loading || waitingForForcedModal) return;
    if (visibleCardsCount >= galleryCards.length) return;
    if (!loadMoreTriggerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setVisibleCardsCount((previous) => Math.min(galleryCards.length, previous + visibleCardsBatch));
      },
      {
        root: null,
        rootMargin: loadMoreRootMargin,
        threshold: 0
      }
    );

    observer.observe(loadMoreTriggerRef.current);

    return () => observer.disconnect();
  }, [loading, waitingForForcedModal, visibleCardsCount, galleryCards.length, visibleCardsBatch, loadMoreRootMargin]);

  useEffect(() => {
    if (!resolvedPhotoId) {
      autoOpenedPhotoRef.current = null;
      return;
    }

    if (loading || photos.length === 0) return;
    if (autoOpenedPhotoRef.current === resolvedPhotoId) return;

    const targetPhoto = photos.find((photo) => String(photo.id) === String(resolvedPhotoId));
    if (!targetPhoto) return;

    actions.openPhotoModal(targetPhoto);
    autoOpenedPhotoRef.current = resolvedPhotoId;
  }, [resolvedPhotoId, loading, photos, actions]);

  useEffect(() => {
    const isTextEditingElement = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const tagName = element.tagName;
      return element.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
    };

    const handleKeyDown = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

      const activeElement = document.activeElement;
      const isSearchFocused = activeElement === searchInputRef.current;

      if (event.key === '/') {
        if (isTextEditingElement(activeElement) && !isSearchFocused) return;
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === 'Escape' && isSearchFocused) {
        event.preventDefault();
        if (searchTerm.trim()) {
          clearSearch();
        } else {
          searchInputRef.current?.blur();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchTerm, clearSearch]);

  const handlePhotoClick = useCallback((photo) => {
    openPhotoModalRef.current(photo);
  }, []);

  const handleFilterButtonClick = useCallback((filter) => {
    handleFilterClick(filter);
  }, [handleFilterClick]);

  const handleDelete = useCallback((e, photo) => {
    e.stopPropagation();
    if (deletingPhoto || hasActivePhotoOp) return;
    setPhotoPendingDelete(photo);
  }, [deletingPhoto, hasActivePhotoOp]);

  const handleCancelDelete = useCallback(() => {
    if (deletingPhoto) return;
    setPhotoPendingDelete(null);
  }, [deletingPhoto]);

  const handleConfirmDelete = async () => {
    if (!photoPendingDelete || deletingPhoto) return;

    setDeletingPhoto(true);
    try {
      await actions.deletePhoto(photoPendingDelete.id);
      notify?.success?.(adminFeedback.photoDeleted(photoPendingDelete));
      setPhotoPendingDelete(null);
    } catch (error) {
      console.error('Errore nell\'eliminazione della foto:', error);
      setPhotoPendingDelete(null);
      notify?.error?.(
        buildOperationErrorMessage(error, 'eliminazione foto'),
        5200
      );
    } finally {
      setDeletingPhoto(false);
    }
  };

  useEscapeToClose({
    enabled: Boolean(photoPendingDelete),
    onClose: handleCancelDelete,
    canClose: !deletingPhoto
  });

  const handleEdit = useCallback((e, photo) => {
    e.stopPropagation();
    if (hasActivePhotoOp) return;
    setEditingPhoto(photo);
  }, [hasActivePhotoOp]);

  const handleCrop = useCallback((e, photo) => {
    e.stopPropagation();
    if (hasActivePhotoOp) return;
    setCroppingPhoto(photo);
  }, [hasActivePhotoOp]);

  const handleReuploadSourceClick = useCallback((e, photo) => {
    e.stopPropagation();
    if (hasActivePhotoOp) return;
    setReuploadSourcePhoto(photo);
    if (sourceFileInputRef.current) {
      sourceFileInputRef.current.value = '';
      sourceFileInputRef.current.click();
    }
  }, [hasActivePhotoOp]);

  const stopSoftProgress = useCallback(() => {
    if (softProgressTimerRef.current) {
      clearInterval(softProgressTimerRef.current);
      softProgressTimerRef.current = null;
    }
  }, []);

  const startSoftProgress = useCallback((photoId, from = 74, to = 95, intervalMs = 240) => {
    stopSoftProgress();
    let current = Math.max(0, Math.min(100, from));
    actions.setPhotoOpStatus(photoId, { percent: current });
    softProgressTimerRef.current = setInterval(() => {
      current = Math.min(to, current + 1);
      actions.setPhotoOpStatus(photoId, { percent: current });
      if (current >= to) {
        stopSoftProgress();
      }
    }, intervalMs);
  }, [actions, stopSoftProgress]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopSoftProgress();
    };
  }, [stopSoftProgress]);

  const handleAbortReuploadUpload = useCallback((event, photoId, step) => {
    event.stopPropagation();
    if (step !== 'upload') return;
    if (activeReuploadPhotoIdRef.current !== photoId) return;
    reuploadUploadAbortControllerRef.current?.abort();
  }, []);

  const handleReuploadSourceSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const targetPhoto = reuploadSourcePhoto;
    if (!file || !targetPhoto) {
      if (isMountedRef.current) setReuploadSourcePhoto(null);
      return;
    }

    const targetPhotoId = targetPhoto.id;
    activeReuploadPhotoIdRef.current = targetPhotoId;
    actions.setPhotoOpStatus(
      targetPhotoId,
      buildPhotoOperationStatus('replaceSource', 'prepare')
    );
    let currentStep = 'sign';
    let signedData = null;
    try {
      validateImageFile(file);
      currentStep = 'sign';
      actions.setPhotoOpStatus(
        targetPhotoId,
        buildPhotoOperationStatus('replaceSource', 'sign')
      );
      signedData = await signExistingSourceUpload({
        photo: targetPhoto,
        file
      });

      currentStep = 'upload';
      actions.setPhotoOpStatus(
        targetPhotoId,
        buildPhotoOperationStatus('replaceSource', 'upload')
      );
      const uploadAbortController = new AbortController();
      reuploadUploadAbortControllerRef.current = uploadAbortController;
      await uploadSourceToSignedUrl({
        uploadUrl: signedData.uploadUrl,
        file,
        contentType: signedData.contentType,
        signal: uploadAbortController.signal,
        onProgress: ({ ratio }) => {
          const normalized = Math.max(0, Math.min(1, Number(ratio) || 0));
          const mapped = Math.round(12 + normalized * 58); // 12% -> 70%
          actions.setPhotoOpStatus(targetPhotoId, { percent: mapped });
        }
      });
      reuploadUploadAbortControllerRef.current = null;

      currentStep = 'replace';
      actions.setPhotoOpStatus(
        targetPhotoId,
        buildPhotoOperationStatus('replaceSource', 'process')
      );
      startSoftProgress(targetPhotoId, 74, 95);
      const replaceResponse = await photoService.replaceSource(targetPhoto.id, {
        sourcePath: signedData.sourcePath,
        operationId: signedData.operationId,
        mediaGeneration: signedData.mediaGeneration
      }, targetPhoto.version);
      stopSoftProgress();
      const updatedPhoto = replaceResponse?.data?.data || replaceResponse?.data;
      actions.applyPhotoUpdate?.(updatedPhoto);
      actions.setPhotoOpStatus(
        targetPhotoId,
        buildPhotoOperationStatus('replaceSource', 'done')
      );
      notify?.success?.(adminFeedback.photoSourceReplaced(targetPhoto));
    } catch (error) {
      stopSoftProgress();
      if (signedData?.operationId) {
        try {
          await photoService.abortMediaOperation(
            targetPhoto.id,
            signedData.operationId,
            signedData.sourcePath
          );
        } catch (abortError) {
          console.warn('Impossibile annullare la prenotazione media:', abortError);
        }
      }
      console.error('Errore reupload source privata:', error);
      if (error?.code === 'UPLOAD_ABORTED') {
        notify?.info?.(adminFeedback.photoSourceUploadCancelled());
      } else {
        if (error?.status === 409 || error?.status === 428) {
          await actions.fetchPhotos({ force: true });
        }
        const stepLabel = REUPLOAD_STEP_LABELS[currentStep] || 'operazione source';
        notify?.error?.(buildOperationErrorMessage(error, stepLabel), 6500);
      }
    } finally {
      reuploadUploadAbortControllerRef.current = null;
      activeReuploadPhotoIdRef.current = null;
      setTimeout(() => {
        actions.clearPhotoOpStatus(targetPhotoId);
      }, 250);
      if (isMountedRef.current) setReuploadSourcePhoto(null);
    }
  };

  const handleApplyCropInBackground = async ({ photoId, photoTitle, nextSettings }) => {
    if (!photoId || !nextSettings) return;

    const title = photoTitle || 'foto';
    actions.setPhotoOpStatus(
      photoId,
      buildPhotoOperationStatus('crop', 'save')
    );

    let currentStep = 'regenerate';
    try {
      actions.setPhotoOpStatus(
        photoId,
        buildPhotoOperationStatus('crop', 'process')
      );
      startSoftProgress(photoId, 24, 95);

      const currentPhoto = photos.find((photo) => String(photo.id) === String(photoId));
      const regenerateResponse = await photoService.applyCrop(
        photoId,
        nextSettings,
        currentPhoto?.version
      );
      stopSoftProgress();

      const updatedPhoto = regenerateResponse?.data?.data || regenerateResponse?.data;
      actions.applyPhotoUpdate?.(updatedPhoto);
      actions.setPhotoOpStatus(
        photoId,
        buildPhotoOperationStatus('crop', 'done')
      );
      notify?.success?.(adminFeedback.photoCropApplied({ title }));
    } catch (error) {
      stopSoftProgress();
      console.error('Errore applicazione crop:', error);
      if (error?.status === 409 || error?.status === 428) {
        await actions.fetchPhotos({ force: true });
      }
      const stepLabel = CROP_STEP_LABELS[currentStep] || 'applicazione crop';
      notify?.error?.(buildOperationErrorMessage(error, stepLabel), 6000);
    } finally {
      setTimeout(() => {
        actions.clearPhotoOpStatus(photoId);
      }, 250);
    }
  };

  if (loading || waitingForForcedModal) {
    return (
      <GallerySection>
        <Container>
          <SectionHeader>
            <SectionTitle as={headingLevel}>Archivio</SectionTitle>
            <SectionSubtitle>
              Filtra per tag o cerca per titolo, luogo e descrizione.
            </SectionSubtitle>
          </SectionHeader>
          <ControlsRow>
            <SkeletonSearch />
            <SkeletonFilterRow>
              <SkeletonFilterChip $w={62} />
              <SkeletonFilterChip $w={94} />
              <SkeletonFilterChip $w={86} />
              <SkeletonFilterChip $w={78} />
              <SkeletonFilterChip $w={90} />
            </SkeletonFilterRow>
          </ControlsRow>
          <SkeletonGrid>
            {Array.from({ length: skeletonCardCount }).map((_, idx) => (
              <SkeletonCard key={`gallery-skeleton-${idx}`} />
            ))}
          </SkeletonGrid>
          <LoadingContainer>
            <LoadingSpinner />
          </LoadingContainer>
        </Container>
      </GallerySection>
    );
  }

  return (
    <GallerySection>
      <Container>
        <input
          ref={sourceFileInputRef}
          type="file"
          accept={PHOTO_UPLOAD_ACCEPT}
          style={{ display: 'none' }}
          onChange={handleReuploadSourceSelected}
        />

        <SectionHeader>
          <SectionTitle as={headingLevel} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, ease: 'easeOut' }}>
            Archivio
          </SectionTitle>
          <SectionSubtitle initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, ease: 'easeOut', delay: 0.05 }}>
            Filtra per tag o cerca per titolo, luogo e descrizione.
          </SectionSubtitle>
        </SectionHeader>

        <ControlsRow>
          <SearchContainer initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35 }}>
            <SearchInput
              ref={searchInputRef}
              type="text"
              placeholder="Cerca…"
              value={searchTerm}
              onChange={handleSearchChange}
            />
            <SearchIcon>
              <Search size={18} />
            </SearchIcon>
          </SearchContainer>

          <FilterRailShell
            $fadeLeft={filterRailFadeState.left}
            $fadeRight={filterRailFadeState.right}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35 }}
          >
            <FilterContainer
              ref={filterRailRef}
              initial={false}
            >
              {filterOptions.map((filter) => (
                <FilterButton
                  key={filter}
                  ref={(node) => {
                    if (node) {
                      filterButtonRefs.current.set(filter, node);
                    } else {
                      filterButtonRefs.current.delete(filter);
                    }
                  }}
                  $active={activeFilter === filter}
                  onClick={() => handleFilterButtonClick(filter)}
                  whileTap={{ scale: 0.98 }}
                >
                  {filter === 'all' ? 'Tutti' : filter}
                </FilterButton>
              ))}
            </FilterContainer>
          </FilterRailShell>
        </ControlsRow>

        {galleryCards.length === 0 ? (
          <NoResults initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h3>Nessuna foto trovata</h3>
            <p>Prova a cambiare filtri o ricerca.</p>
          </NoResults>
        ) : (
          <>
            <GalleryGrid key="gallery-grid" layout={!usesTouchCardControls && !prefersReducedMotion}>
              <AnimatePresence mode="popLayout" initial={false}>
                {visibleGalleryCards.map((photo, index) => {
                  return (
                    <GalleryCard
                      key={photo.id}
                      photo={photo}
                      isAdmin={isAdmin}
                      usesTouchControls={usesTouchCardControls}
                      isTouchCardActive={touchPhotoId === photo.id}
                      isTouchAdminOpen={touchAdminPhotoId === photo.id}
                      hideCardDescriptions={hideCardDescriptions}
                      hasActivePhotoOp={hasActivePhotoOp}
                      photoOpStatus={photoOpsByPhotoId?.[String(photo.id)]}
                      getPhotoCardUrl={getPhotoCardUrl}
                      getPhotoAltText={getPhotoAltText}
                      getThumbImageUrl={getThumbImageUrl}
                      fallbackImageSrc={LOCAL_IMAGE_FALLBACK}
                      prioritizeImage={index < priorityImageCount}
                      motionEnabled={!usesTouchCardControls && !prefersReducedMotion}
                      onOpen={handlePhotoClick}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                      onCrop={handleCrop}
                      onReuploadSource={handleReuploadSourceClick}
                      onAbortReuploadUpload={handleAbortReuploadUpload}
                      onRevealTouchCard={handleRevealTouchCard}
                      onHideTouchCard={handleHideTouchCard}
                      onToggleTouchAdmin={handleToggleTouchAdmin}
                      onCloseTouchAdmin={handleCloseTouchAdmin}
                    />
                  );
                })}
              </AnimatePresence>
            </GalleryGrid>
            {visibleCardsCount < galleryCards.length && (
              <LoadMoreSentinel ref={loadMoreTriggerRef} aria-hidden="true" />
            )}
          </>
        )}

        <Suspense fallback={null}>
          {isAdmin && editingPhoto && (
            <LazyPhotoUpload
              photoToEdit={editingPhoto}
              onClose={() => setEditingPhoto(null)}
              onUploadSuccess={(updatedPhoto) => {
                actions.applyPhotoUpdate?.(updatedPhoto);
                setEditingPhoto(null);
                notify?.success?.(adminFeedback.photoUpdated(updatedPhoto));
              }}
              onUploadError={(error) => {
                notify?.error?.(
                  buildOperationErrorMessage(error, 'aggiornamento foto'),
                  6000
                );
              }}
            />
          )}

          {isAdmin && croppingPhoto && (
            <LazyPhotoCropModal
              photo={croppingPhoto}
              isOpen
              onClose={() => setCroppingPhoto(null)}
              onApply={({ photoId, photoTitle, nextSettings }) => {
                setCroppingPhoto(null);
                handleApplyCropInBackground({ photoId, photoTitle, nextSettings });
              }}
            />
          )}
        </Suspense>

        <AdminConfirmDialog
          open={Boolean(photoPendingDelete)}
          title="Elimina foto"
          pending={deletingPhoto}
          onCancel={handleCancelDelete}
          onConfirm={handleConfirmDelete}
        >
          Stai per eliminare <strong>{photoPendingDelete?.title || 'questa foto'}</strong>.
          L&apos;operazione rimuove anche source privata e derivate pubbliche.
        </AdminConfirmDialog>
      </Container>
    </GallerySection>
  );
};

export default Gallery;
