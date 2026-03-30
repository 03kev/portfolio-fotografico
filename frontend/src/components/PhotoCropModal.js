import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Crop as CropIcon, RotateCcw, X } from 'lucide-react';
import { resolveVersionedAssetUrl } from '../utils/imageUrl';
import {
  CROP_HANDLES,
  CROP_MAX_SCALE,
  CROP_MIN_SIZE_PX,
  CROP_PRESETS,
  DEFAULT_CROP_PROFILE,
  buildPreviewStyleFromViewportRect,
  getBaseCropSize,
  getPresetRatioValue,
  normalizeCropProfiles,
  profileToSourceRect,
  resizeRectFromCorner,
  sourceRectToProfile,
  sourceRectToViewportRect,
  viewportRectToSourceRect,
  clampBetween
} from '../utils/cropEditor';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useSharedImageLoadState } from '../hooks/useSharedImageLoadState';
import './PhotoCropModal.css';

const getPhotoSettings = (photo) => {
  if (!photo) return {};

  if (typeof photo.settings === 'string') {
    try {
      const parsed = JSON.parse(photo.settings);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  return photo.settings && typeof photo.settings === 'object' ? photo.settings : {};
};

const PhotoCropModal = ({ photo, isOpen, onClose, onApply }) => {
  const [activePreset, setActivePreset] = useState('r43');
  const [cropProfiles, setCropProfiles] = useState(() => normalizeCropProfiles());
  const [initialCropProfiles, setInitialCropProfiles] = useState(() => normalizeCropProfiles());
  const [cropViewport, setCropViewport] = useState(null);
  const [transientRect, setTransientRect] = useState(null);
  const [isInteracting, setIsInteracting] = useState(false);

  const workspaceRef = useRef(null);
  const imageRef = useRef(null);
  const pointerStateRef = useRef(null);
  const refreshRafRef = useRef(null);
  const cardRef = useRef(null);
  const headerToplineRef = useRef(null);
  const headerEyebrowRef = useRef(null);
  const headerFullPillMeasureRef = useRef(null);
  const headerShortPillMeasureRef = useRef(null);
  const [headerPillMode, setHeaderPillMode] = useState('full');

  const imageVersion = photo?.derivativesVersion || photo?.updatedAt || photo?.id;
  const cropImageSrc = useMemo(
    () => resolveVersionedAssetUrl(photo?.image, imageVersion),
    [imageVersion, photo]
  );
  const { isLoaded: isFullImageLoaded, setIsLoaded: setIsFullImageLoaded, markLoaded: markFullImageLoaded } = useSharedImageLoadState(cropImageSrc, isOpen && Boolean(photo?.id));

  const workspacePreviewSrc = useMemo(() => {
    const previewCandidate = photo?.thumbnail43 || photo?.thumbnail11 || photo?.socialImage || '';
    return previewCandidate ? resolveVersionedAssetUrl(previewCandidate, imageVersion, '') : '';
  }, [imageVersion, photo]);

  const activePresetPreviewSrc = useMemo(() => {
    const previewCandidate = activePreset === 'r11'
      ? (photo?.thumbnail11 || photo?.thumbnail43 || photo?.socialImage || '')
      : activePreset === 'social'
        ? (photo?.socialImage || photo?.thumbnail43 || photo?.thumbnail11 || '')
        : (photo?.thumbnail43 || photo?.thumbnail11 || photo?.socialImage || '');

    return previewCandidate ? resolveVersionedAssetUrl(previewCandidate, imageVersion, '') : '';
  }, [activePreset, imageVersion, photo]);

  const activePresetConfig = useMemo(
    () => CROP_PRESETS.find((preset) => preset.key === activePreset) || CROP_PRESETS[0],
    [activePreset]
  );

  const activeProfile = cropProfiles[activePreset] || DEFAULT_CROP_PROFILE;
  const activeRatio = getPresetRatioValue(activePreset);

  const refreshViewport = useCallback(() => {
    const workspace = workspaceRef.current;
    const image = imageRef.current;
    if (!workspace || !image || !image.naturalWidth || !image.naturalHeight) return;

    const containerWidth = workspace.clientWidth;
    const containerHeight = workspace.clientHeight;
    if (!containerWidth || !containerHeight) return;

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    const imageRatio = naturalWidth / naturalHeight;
    const containerRatio = containerWidth / containerHeight;

    let width = containerWidth;
    let height = containerHeight;
    let left = 0;
    let top = 0;

    if (imageRatio > containerRatio) {
      height = width / imageRatio;
      top = (containerHeight - height) / 2;
    } else {
      width = height * imageRatio;
      left = (containerWidth - width) / 2;
    }

    setCropViewport({ left, top, width, height, naturalWidth, naturalHeight });
  }, []);

  const scheduleViewportRefresh = useCallback(() => {
    if (refreshRafRef.current) {
      cancelAnimationFrame(refreshRafRef.current);
    }

    refreshRafRef.current = requestAnimationFrame(() => {
      refreshViewport();
      refreshRafRef.current = requestAnimationFrame(() => {
        refreshViewport();
        refreshRafRef.current = null;
      });
    });
  }, [refreshViewport]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !photo) return;

    const settings = getPhotoSettings(photo);
    const normalizedProfiles = normalizeCropProfiles(settings.cropProfiles);
    setActivePreset('r43');
    setCropProfiles(normalizedProfiles);
    setInitialCropProfiles(normalizedProfiles);
    setCropViewport(null);
    setTransientRect(null);
    setIsInteracting(false);
    pointerStateRef.current = null;
  }, [isOpen, photo]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    setTransientRect(null);
    scheduleViewportRefresh();
  }, [activePreset, isOpen, scheduleViewportRefresh]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const syncViewport = () => {
      const image = imageRef.current;
      if (image && image.complete && image.naturalWidth && image.naturalHeight) {
        markFullImageLoaded();
        scheduleViewportRefresh();
      }
    };

    const rafId = requestAnimationFrame(syncViewport);
    const timeoutId = setTimeout(syncViewport, 40);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [cropImageSrc, isOpen, markFullImageLoaded, scheduleViewportRefresh]);

  useEffect(() => {
    if (!workspaceRef.current || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => scheduleViewportRefresh());
    observer.observe(workspaceRef.current);

    return () => observer.disconnect();
  }, [scheduleViewportRefresh]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleWindowResize = () => scheduleViewportRefresh();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [isOpen, scheduleViewportRefresh]);

  useEffect(() => (
    () => {
      if (refreshRafRef.current) {
        cancelAnimationFrame(refreshRafRef.current);
      }
    }
  ), []);

  useEscapeToClose({
    enabled: isOpen,
    onClose
  });

  const saveRectToProfile = useCallback((rect, presetKey, viewportOverride = null) => {
    const viewport = viewportOverride || cropViewport;
    if (!viewport) return;

    const ratio = getPresetRatioValue(presetKey);
    const sourceRect = viewportRectToSourceRect(rect, viewport);
    const profile = sourceRectToProfile(sourceRect, viewport.naturalWidth, viewport.naturalHeight, ratio);

    setCropProfiles((prev) => ({ ...prev, [presetKey]: profile }));
  }, [cropViewport]);

  const derivedSelection = useMemo(() => {
    if (!cropViewport) return null;

    const sourceRect = profileToSourceRect(
      activeProfile,
      cropViewport.naturalWidth,
      cropViewport.naturalHeight,
      activeRatio
    );

    return sourceRectToViewportRect(sourceRect, cropViewport);
  }, [activeProfile, activeRatio, cropViewport]);

  const selection = transientRect || derivedSelection;

  const beginMove = useCallback((event) => {
    if (!event.isPrimary || !cropViewport || !selection) return;

    event.preventDefault();
    pointerStateRef.current = {
      mode: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRect: { ...selection },
      viewport: cropViewport,
      presetKey: activePreset
    };
    setIsInteracting(true);
  }, [activePreset, cropViewport, selection]);

  const beginResize = useCallback((event, handle) => {
    if (!event.isPrimary || !cropViewport || !selection) return;

    event.preventDefault();
    event.stopPropagation();

    const ratio = getPresetRatioValue(activePreset);
    const base = getBaseCropSize(cropViewport.naturalWidth, cropViewport.naturalHeight, ratio);
    const minWidthByScale = (base.width / CROP_MAX_SCALE / cropViewport.naturalWidth) * cropViewport.width;
    const maxWidthByScale = (base.width / cropViewport.naturalWidth) * cropViewport.width;
    const minWidth = Math.max(CROP_MIN_SIZE_PX, minWidthByScale);

    pointerStateRef.current = {
      mode: 'resize',
      handle,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRect: { ...selection },
      viewport: cropViewport,
      presetKey: activePreset,
      ratio,
      minWidth,
      maxWidth: Math.max(minWidth, maxWidthByScale)
    };

    setIsInteracting(true);
  }, [activePreset, cropViewport, selection]);

  useEffect(() => {
    const onPointerMove = (event) => {
      const state = pointerStateRef.current;
      if (!state || event.pointerId !== state.pointerId) return;

      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const viewport = state.viewport;
      const right = viewport.left + viewport.width;
      const bottom = viewport.top + viewport.height;

      let nextRect = state.startRect;

      if (state.mode === 'move') {
        const left = clampBetween(state.startRect.left + dx, viewport.left, right - state.startRect.width);
        const top = clampBetween(state.startRect.top + dy, viewport.top, bottom - state.startRect.height);
        nextRect = { ...state.startRect, left, top };
      } else {
        nextRect = resizeRectFromCorner({
          startRect: state.startRect,
          handle: state.handle,
          dx,
          dy,
          viewport,
          ratio: state.ratio,
          minWidth: state.minWidth,
          maxWidth: state.maxWidth
        });
      }

      setTransientRect(nextRect);
      saveRectToProfile(nextRect, state.presetKey, viewport);
    };

    const onPointerEnd = (event) => {
      const state = pointerStateRef.current;
      if (!state || event.pointerId !== state.pointerId) return;

      pointerStateRef.current = null;
      setTransientRect(null);
      setIsInteracting(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [saveRectToProfile]);

  const handleResetPreset = () => {
    const sourceProfile = initialCropProfiles?.[activePreset] || DEFAULT_CROP_PROFILE;
    setCropProfiles((prev) => ({ ...prev, [activePreset]: { ...sourceProfile } }));
    setTransientRect(null);
  };

  const handleApply = () => {
    if (!photo?.id) return;
    const existingSettings = getPhotoSettings(photo);
    const nextSettings = {
      ...existingSettings,
      cropProfiles: normalizeCropProfiles(cropProfiles)
    };
    onApply?.({
      photoId: photo.id,
      photoTitle: photo.title || 'foto',
      nextSettings
    });
    onClose?.();
  };

  const getPresetShortLabel = (presetKey) => {
    switch (presetKey) {
      case 'r43':
        return '4:3';
      case 'r11':
        return '1:1';
      case 'social':
        return '1200×630';
      default:
        return '';
    }
  };

  const updateHeaderPillMode = useCallback(() => {
    const card = cardRef.current;
    const topline = headerToplineRef.current;
    const eyebrow = headerEyebrowRef.current;
    const fullMeasure = headerFullPillMeasureRef.current;
    const shortMeasure = headerShortPillMeasureRef.current;

    if (!card || !topline || !eyebrow || !fullMeasure || !shortMeasure) return;

    const cardWidth = card.clientWidth;
    if (!cardWidth || cardWidth > 560) {
      setHeaderPillMode('full');
      return;
    }

    const gap = 10;
    const availableWidth = topline.clientWidth;
    const eyebrowWidth = eyebrow.offsetWidth;
    const fullWidth = eyebrowWidth + gap + fullMeasure.offsetWidth;
    const shortWidth = eyebrowWidth + gap + shortMeasure.offsetWidth;

    if (fullWidth <= availableWidth) {
      setHeaderPillMode('full');
      return;
    }

    if (shortWidth <= availableWidth) {
      setHeaderPillMode('short');
      return;
    }

    setHeaderPillMode('hidden');
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !photo) return;
    updateHeaderPillMode();
  }, [isOpen, photo, activePreset, updateHeaderPillMode]);

  useEffect(() => {
    if (!isOpen || !photo) return undefined;

    const card = cardRef.current;
    const topline = headerToplineRef.current;
    if (!card || !topline || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => updateHeaderPillMode());
    observer.observe(card);
    observer.observe(topline);
    window.addEventListener('resize', updateHeaderPillMode);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeaderPillMode);
    };
  }, [isOpen, photo, updateHeaderPillMode]);

  if (!isOpen || !photo) return null;

  const imageBounds = cropViewport
    ? {
        left: cropViewport.left,
        top: cropViewport.top,
        width: cropViewport.width,
        height: cropViewport.height
      }
    : null;

  const maskTop = imageBounds && selection
    ? {
        left: imageBounds.left,
        top: imageBounds.top,
        width: imageBounds.width,
        height: Math.max(0, selection.top - imageBounds.top)
      }
    : null;

  const maskBottom = imageBounds && selection
    ? {
        left: imageBounds.left,
        top: selection.top + selection.height,
        width: imageBounds.width,
        height: Math.max(0, (imageBounds.top + imageBounds.height) - (selection.top + selection.height))
      }
    : null;

  const maskLeft = imageBounds && selection
    ? {
        left: imageBounds.left,
        top: selection.top,
        width: Math.max(0, selection.left - imageBounds.left),
        height: selection.height
      }
    : null;

  const maskRight = imageBounds && selection
    ? {
        left: selection.left + selection.width,
        top: selection.top,
        width: Math.max(0, (imageBounds.left + imageBounds.width) - (selection.left + selection.width)),
        height: selection.height
      }
    : null;

  const activePreviewStyle = buildPreviewStyleFromViewportRect(selection, imageBounds);

  return (
    <div className="crop-modal-backdrop" onClick={() => onClose?.()}>
      <div ref={cardRef} className="crop-modal-card" onClick={(event) => event.stopPropagation()}>
        <header className="crop-modal-shell-header">
          <div className="crop-modal-header-copy">
            <div ref={headerToplineRef} className="crop-modal-header-topline">
              <span ref={headerEyebrowRef} className="crop-modal-eyebrow">
                <CropIcon size={14} />
                Crop
              </span>
              {headerPillMode !== 'hidden' && (
                <span className="crop-modal-progress-pill">
                  {headerPillMode === 'short' ? getPresetShortLabel(activePreset) : activePresetConfig.label}
                </span>
              )}
              <span className="crop-modal-progress-pill-measures" aria-hidden="true">
                <span ref={headerFullPillMeasureRef} className="crop-modal-progress-pill crop-modal-progress-pill-measure">
                  {activePresetConfig.label}
                </span>
                <span ref={headerShortPillMeasureRef} className="crop-modal-progress-pill crop-modal-progress-pill-measure">
                  {getPresetShortLabel(activePreset)}
                </span>
              </span>
            </div>
            <h2>{photo.title || 'Composizione immagine'}</h2>
            <p className="crop-modal-header-subtitle">
              Seleziona il formato, sposta il crop e ridimensionalo dai corner handle.
            </p>
          </div>
          <button type="button" className="crop-modal-close" onClick={() => onClose?.()} aria-label="Chiudi crop modal">
            <X size={18} />
          </button>
        </header>

        <div className="crop-modal-toolbar">
          <div className="crop-modal-presets">
            {CROP_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                className={`crop-modal-preset ${activePreset === preset.key ? 'active' : ''}`}
                onClick={() => setActivePreset(preset.key)}
              >
                <span className="crop-modal-preset-full">{preset.label}</span>
                <span className="crop-modal-preset-short">{getPresetShortLabel(preset.key)}</span>
              </button>
            ))}
          </div>
          <button type="button" className="crop-modal-reset" onClick={handleResetPreset}>
            <RotateCcw size={14} />
            Ripristina preset
          </button>
        </div>

        <div className="crop-modal-content">
          <div className="crop-modal-main">
            <div className="crop-modal-editor-col">
              <div className="crop-modal-workspace-panel">
                <div className="crop-modal-workspace-shell">
                  <div ref={workspaceRef} className={`crop-modal-workspace ${isInteracting ? 'is-interacting' : ''}`}>
                    {workspacePreviewSrc ? (
                      <img
                        className={`crop-modal-image-preview ${isFullImageLoaded ? 'is-loaded' : ''}`}
                        src={workspacePreviewSrc}
                        alt=""
                        aria-hidden="true"
                      />
                    ) : null}
                    <div className={`crop-modal-image-loading-backdrop ${isFullImageLoaded ? 'is-loaded' : ''}`}>
                      <div className="crop-modal-image-loading-spinner" />
                    </div>
                    <img
                      ref={imageRef}
                      className={`crop-modal-image ${isFullImageLoaded ? 'is-loaded' : ''}`}
                      src={cropImageSrc}
                      alt={`Crop ${photo.title || 'foto'}`}
                      draggable="false"
                      onLoad={() => {
                        markFullImageLoaded();
                        refreshViewport();
                      }}
                      onError={() => {
                        setIsFullImageLoaded(true);
                      }}
                    />

                    {imageBounds && <div className="crop-modal-image-bounds" style={imageBounds} />}

                    {selection && (
                      <>
                        <div className="crop-modal-mask" style={maskTop} />
                        <div className="crop-modal-mask" style={maskBottom} />
                        <div className="crop-modal-mask" style={maskLeft} />
                        <div className="crop-modal-mask" style={maskRight} />

                        <div className="crop-modal-selection" style={selection} onPointerDown={beginMove}>
                          <div className="crop-modal-grid" />
                          {CROP_HANDLES.map((handle) => (
                            <button
                              key={handle}
                              type="button"
                              className={`crop-modal-handle crop-modal-handle-${handle}`}
                              onPointerDown={(event) => beginResize(event, handle)}
                              aria-label={`Ridimensiona ${handle}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <aside className="crop-modal-preview-col">
              <div className="crop-modal-preview-copy">
                <span className="crop-modal-preview-kicker">Preview</span>
                <h4 className="crop-modal-preview-title">Preview attiva</h4>
                <p className="crop-modal-preview-description">{activePresetConfig.label}</p>
              </div>
              <div className="crop-modal-preview-item">
                <div className="crop-modal-preview-frame" style={{ aspectRatio: activePresetConfig.ratio }}>
                  {activePresetPreviewSrc ? (
                    <img
                      className={`crop-modal-preview-placeholder ${isFullImageLoaded ? 'is-loaded' : ''}`}
                      src={activePresetPreviewSrc}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : null}
                  <img
                    className={`crop-modal-preview-image ${isFullImageLoaded ? 'is-loaded' : ''}`}
                    src={cropImageSrc}
                    alt={`Preview ${activePresetConfig.label}`}
                    draggable="false"
                    style={activePreviewStyle}
                  />
                </div>
              </div>
            </aside>
          </div>
        </div>

        <footer className="crop-modal-actions">
          <div className="crop-modal-actions-buttons">
            <button type="button" className="crop-modal-btn secondary crop-modal-btn-reset-mobile" onClick={handleResetPreset}>
              <RotateCcw size={15} />
              Ripristina
            </button>
            <button type="button" className="crop-modal-btn secondary" onClick={() => onClose?.()}>
              Annulla
            </button>
            <button type="button" className="crop-modal-btn primary" onClick={handleApply}>
              <Check size={16} />
              Applica
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default PhotoCropModal;
