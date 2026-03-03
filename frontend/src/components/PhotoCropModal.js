import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crop as CropIcon, Loader2, X } from 'lucide-react';
import { photoService } from '../utils/api';
import { resolveAssetUrl } from '../utils/imageUrl';
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

const getErrorMessage = (error) => {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.error?.message) return error.error.message;
  return 'Errore durante l\'aggiornamento del crop';
};

const PhotoCropModal = ({ photo, isOpen, onClose, onSaved }) => {
  const [activePreset, setActivePreset] = useState('r43');
  const [cropProfiles, setCropProfiles] = useState(() => normalizeCropProfiles());
  const [cropViewport, setCropViewport] = useState(null);
  const [cropRect, setCropRect] = useState(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const workspaceRef = useRef(null);
  const imageRef = useRef(null);
  const pointerStateRef = useRef(null);

  const cropImageSrc = useMemo(
    () => resolveAssetUrl(photo?.image || photo?.url || photo?.thumbnail || photo?.thumbnail43),
    [photo]
  );

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
    setActivePreset('r43');
    setCropProfiles(normalizeCropProfiles(settings.cropProfiles));
    setCropViewport(null);
    setCropRect(null);
    setIsInteracting(false);
    pointerStateRef.current = null;
    setError('');
  }, [isOpen, photo]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const syncViewport = () => {
      const image = imageRef.current;
      if (image && image.complete && image.naturalWidth && image.naturalHeight) {
        refreshViewport();
      }
    };

    const rafId = requestAnimationFrame(syncViewport);
    const timeoutId = setTimeout(syncViewport, 40);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [cropImageSrc, isOpen, refreshViewport]);

  useEffect(() => {
    if (!workspaceRef.current || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => refreshViewport());
    observer.observe(workspaceRef.current);

    return () => observer.disconnect();
  }, [refreshViewport]);

  const saveRectToProfile = useCallback((rect, presetKey, viewportOverride = null) => {
    const viewport = viewportOverride || cropViewport;
    if (!viewport) return;

    const ratio = getPresetRatioValue(presetKey);
    const sourceRect = viewportRectToSourceRect(rect, viewport);
    const profile = sourceRectToProfile(sourceRect, viewport.naturalWidth, viewport.naturalHeight, ratio);

    setCropProfiles((prev) => ({ ...prev, [presetKey]: profile }));
  }, [cropViewport]);

  const beginMove = useCallback((event) => {
    if (!event.isPrimary || !cropViewport || !cropRect) return;

    event.preventDefault();
    pointerStateRef.current = {
      mode: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRect: { ...cropRect },
      viewport: cropViewport,
      presetKey: activePreset
    };
    setIsInteracting(true);
  }, [activePreset, cropRect, cropViewport]);

  const beginResize = useCallback((event, handle) => {
    if (!event.isPrimary || !cropViewport || !cropRect) return;

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
      startRect: { ...cropRect },
      viewport: cropViewport,
      presetKey: activePreset,
      ratio,
      minWidth,
      maxWidth: Math.max(minWidth, maxWidthByScale)
    };

    setIsInteracting(true);
  }, [activePreset, cropRect, cropViewport]);

  useEffect(() => {
    if (!cropViewport || isInteracting) return;

    const sourceRect = profileToSourceRect(
      activeProfile,
      cropViewport.naturalWidth,
      cropViewport.naturalHeight,
      activeRatio
    );

    setCropRect(sourceRectToViewportRect(sourceRect, cropViewport));
  }, [activeProfile, activeRatio, cropViewport, isInteracting]);

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

      setCropRect(nextRect);
      saveRectToProfile(nextRect, state.presetKey, viewport);
    };

    const onPointerEnd = (event) => {
      const state = pointerStateRef.current;
      if (!state || event.pointerId !== state.pointerId) return;

      pointerStateRef.current = null;
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
    setCropProfiles((prev) => ({ ...prev, [activePreset]: { ...DEFAULT_CROP_PROFILE } }));
  };

  const handleApply = async () => {
    if (!photo?.id) return;

    setSaving(true);
    setError('');

    try {
      const existingSettings = getPhotoSettings(photo);
      const nextSettings = {
        ...existingSettings,
        cropProfiles: normalizeCropProfiles(cropProfiles)
      };

      await photoService.update(photo.id, { settings: JSON.stringify(nextSettings) });
      await photoService.regenerateDerivatives(photo.id);
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !photo) return null;

  const selection = cropViewport && cropRect ? cropRect : null;
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

  const activePreviewStyle = buildPreviewStyleFromViewportRect(cropRect, imageBounds);

  return (
    <div className="crop-modal-backdrop" onClick={() => !saving && onClose?.()}>
      <div className="crop-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="crop-modal-header">
          <div className="crop-modal-title">
            <span className="crop-modal-badge"><CropIcon size={14} /> Crop</span>
            <h3>{photo.title || 'Composizione immagine'}</h3>
          </div>
          <button type="button" className="crop-modal-close" onClick={() => !saving && onClose?.()} disabled={saving}>
            <X size={18} />
          </button>
        </div>

        <p className="crop-modal-hint">
          Seleziona il formato, sposta il crop e ridimensionalo dai corner handle.
        </p>

        <div className="crop-modal-presets">
          {CROP_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={`crop-modal-preset ${activePreset === preset.key ? 'active' : ''}`}
              onClick={() => setActivePreset(preset.key)}
              disabled={saving}
            >
              {preset.label}
            </button>
          ))}
          <button type="button" className="crop-modal-reset" onClick={handleResetPreset} disabled={saving}>
            Reset preset
          </button>
        </div>

        <div className="crop-modal-main">
          <div className="crop-modal-editor-col">
            <div className="crop-modal-workspace-shell">
              <div ref={workspaceRef} className={`crop-modal-workspace ${isInteracting ? 'is-interacting' : ''}`}>
                <img
                  ref={imageRef}
                  className="crop-modal-image"
                  src={cropImageSrc}
                  alt={`Crop ${photo.title || 'foto'}`}
                  draggable="false"
                  onLoad={refreshViewport}
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

          <aside className="crop-modal-preview-col">
            <h4>Preview attiva</h4>
            <p>{activePresetConfig.label}</p>
            <div className="crop-modal-preview-item">
              <div className="crop-modal-preview-frame" style={{ aspectRatio: activePresetConfig.ratio }}>
                <img
                  src={cropImageSrc}
                  alt={`Preview ${activePresetConfig.label}`}
                  draggable="false"
                  style={activePreviewStyle}
                />
              </div>
              <span>{activePresetConfig.label}</span>
            </div>
          </aside>
        </div>

        {error && <div className="crop-modal-error">{error}</div>}

        <div className="crop-modal-actions">
          <button type="button" className="crop-modal-btn secondary" onClick={() => onClose?.()} disabled={saving}>
            Annulla
          </button>
          <button type="button" className="crop-modal-btn primary" onClick={handleApply} disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
            {saving ? 'Applico...' : 'Applica crop'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PhotoCropModal;
