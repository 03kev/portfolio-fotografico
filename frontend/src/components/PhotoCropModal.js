import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crop as CropIcon, Loader2, X } from 'lucide-react';
import { photoService } from '../utils/api';
import { resolveAssetUrl } from '../utils/imageUrl';
import './PhotoCropModal.css';

const CROP_PRESETS = [
  { key: 'r43', label: 'Archivio 4:3', ratio: '4 / 3' },
  { key: 'r11', label: 'Home 1:1', ratio: '1 / 1' },
  { key: 'social', label: 'Social 1200x630', ratio: '1200 / 630' }
];

const DEFAULT_CROP_PROFILE = { x: 0.5, y: 0.5, scale: 1 };
const CROP_MAX_SCALE = 5;
const CROP_MIN_SIZE_PX = 56;
const CROP_HANDLES = ['nw', 'ne', 'sw', 'se'];

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const clampScale = (value) => Math.max(1, Math.min(CROP_MAX_SCALE, value));
const clampBetween = (value, min, max) => Math.max(min, Math.min(max, value));

const parseAspectRatio = (ratio) => {
  if (typeof ratio !== 'string') return 4 / 3;
  const [rawWidth, rawHeight] = ratio.split('/');
  const width = Number(rawWidth?.trim());
  const height = Number(rawHeight?.trim());
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return 4 / 3;
  return width / height;
};

const getPresetRatioValue = (presetKey) => {
  const preset = CROP_PRESETS.find((item) => item.key === presetKey);
  return parseAspectRatio(preset?.ratio || '4 / 3');
};

const normalizeCropProfile = (value) => {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CROP_PROFILE };
  const x = Number(value.x);
  const y = Number(value.y);
  const scale = Number(value.scale);

  return {
    x: Number.isFinite(x) ? clamp01(x) : DEFAULT_CROP_PROFILE.x,
    y: Number.isFinite(y) ? clamp01(y) : DEFAULT_CROP_PROFILE.y,
    scale: Number.isFinite(scale) ? clampScale(scale) : DEFAULT_CROP_PROFILE.scale
  };
};

const normalizeCropProfiles = (value) => {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    r43: normalizeCropProfile(raw.r43),
    r11: normalizeCropProfile(raw.r11),
    social: normalizeCropProfile(raw.social)
  };
};

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

const getBaseCropSize = (sourceWidth, sourceHeight, targetRatio) => {
  const srcW = Math.max(1, Number(sourceWidth) || 1);
  const srcH = Math.max(1, Number(sourceHeight) || 1);
  const ratio = Number.isFinite(targetRatio) && targetRatio > 0 ? targetRatio : 4 / 3;
  const sourceRatio = srcW / srcH;

  if (sourceRatio > ratio) {
    return {
      width: Math.max(1, Math.round(srcH * ratio)),
      height: srcH
    };
  }

  return {
    width: srcW,
    height: Math.max(1, Math.round(srcW / ratio))
  };
};

const profileToSourceRect = (profile, sourceWidth, sourceHeight, targetRatio) => {
  const srcW = Math.max(1, Number(sourceWidth) || 1);
  const srcH = Math.max(1, Number(sourceHeight) || 1);
  const base = getBaseCropSize(srcW, srcH, targetRatio);
  const normalized = normalizeCropProfile(profile);

  const cropWidth = Math.max(1, Math.min(srcW, Math.round(base.width / normalized.scale)));
  const cropHeight = Math.max(1, Math.min(srcH, Math.round(base.height / normalized.scale)));
  const centerX = clamp01(normalized.x) * srcW;
  const centerY = clamp01(normalized.y) * srcH;
  const maxLeft = srcW - cropWidth;
  const maxTop = srcH - cropHeight;

  const left = Math.max(0, Math.min(maxLeft, Math.round(centerX - cropWidth / 2)));
  const top = Math.max(0, Math.min(maxTop, Math.round(centerY - cropHeight / 2)));

  return { left, top, width: cropWidth, height: cropHeight };
};

const sourceRectToProfile = (rect, sourceWidth, sourceHeight, targetRatio) => {
  const srcW = Math.max(1, Number(sourceWidth) || 1);
  const srcH = Math.max(1, Number(sourceHeight) || 1);
  const base = getBaseCropSize(srcW, srcH, targetRatio);
  const width = Math.max(1, Math.min(srcW, Number(rect?.width) || 1));
  const height = Math.max(1, Math.min(srcH, Number(rect?.height) || 1));
  const left = Math.max(0, Math.min(srcW - width, Number(rect?.left) || 0));
  const top = Math.max(0, Math.min(srcH - height, Number(rect?.top) || 0));
  const centerX = left + width / 2;
  const centerY = top + height / 2;

  return normalizeCropProfile({
    x: centerX / srcW,
    y: centerY / srcH,
    scale: clampScale(base.width / width)
  });
};

const sourceRectToViewportRect = (sourceRect, viewport) => ({
  left: viewport.left + (sourceRect.left / viewport.naturalWidth) * viewport.width,
  top: viewport.top + (sourceRect.top / viewport.naturalHeight) * viewport.height,
  width: (sourceRect.width / viewport.naturalWidth) * viewport.width,
  height: (sourceRect.height / viewport.naturalHeight) * viewport.height
});

const viewportRectToSourceRect = (viewportRect, viewport) => ({
  left: ((viewportRect.left - viewport.left) / viewport.width) * viewport.naturalWidth,
  top: ((viewportRect.top - viewport.top) / viewport.height) * viewport.naturalHeight,
  width: (viewportRect.width / viewport.width) * viewport.naturalWidth,
  height: (viewportRect.height / viewport.height) * viewport.naturalHeight
});

const buildPreviewStyleFromViewportRect = (cropRect, imageBounds) => {
  if (!cropRect || !imageBounds) {
    return {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    };
  }

  const widthPercent = (imageBounds.width / cropRect.width) * 100;
  const heightPercent = (imageBounds.height / cropRect.height) * 100;
  const leftPercent = -((cropRect.left - imageBounds.left) / cropRect.width) * 100;
  const topPercent = -((cropRect.top - imageBounds.top) / cropRect.height) * 100;

  return {
    position: 'absolute',
    width: `${widthPercent}%`,
    height: `${heightPercent}%`,
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
    maxWidth: 'none',
    maxHeight: 'none',
      objectFit: 'fill'
  };
};

const resizeRectFromCorner = ({ startRect, handle, dx, dy, viewport, ratio, minWidth, maxWidth }) => {
  const right = viewport.left + viewport.width;
  const bottom = viewport.top + viewport.height;
  const startCornerX = handle.includes('w') ? startRect.left : startRect.left + startRect.width;
  const startCornerY = handle.includes('n') ? startRect.top : startRect.top + startRect.height;

  let anchorX = startRect.left;
  let anchorY = startRect.top;
  if (handle === 'nw') {
    anchorX = startRect.left + startRect.width;
    anchorY = startRect.top + startRect.height;
  } else if (handle === 'ne') {
    anchorX = startRect.left;
    anchorY = startRect.top + startRect.height;
  } else if (handle === 'sw') {
    anchorX = startRect.left + startRect.width;
    anchorY = startRect.top;
  }

  const pointerX = startCornerX + dx;
  const pointerY = startCornerY + dy;
  const widthFromX = Math.abs(anchorX - pointerX);
  const widthFromY = Math.abs(anchorY - pointerY) * ratio;
  const useHorizontal = Math.abs(dx) >= Math.abs(dy) * ratio;

  let width = useHorizontal ? widthFromX : widthFromY;
  if (!Number.isFinite(width) || width <= 0) width = startRect.width;

  let maxWidthByBounds = maxWidth;
  if (handle === 'nw') {
    maxWidthByBounds = Math.min(anchorX - viewport.left, (anchorY - viewport.top) * ratio);
  } else if (handle === 'ne') {
    maxWidthByBounds = Math.min(right - anchorX, (anchorY - viewport.top) * ratio);
  } else if (handle === 'sw') {
    maxWidthByBounds = Math.min(anchorX - viewport.left, (bottom - anchorY) * ratio);
  } else if (handle === 'se') {
    maxWidthByBounds = Math.min(right - anchorX, (bottom - anchorY) * ratio);
  }

  width = clampBetween(width, minWidth, Math.max(minWidth, Math.min(maxWidth, maxWidthByBounds)));
  const height = width / ratio;

  let left = startRect.left;
  let top = startRect.top;
  if (handle === 'nw') {
    left = anchorX - width;
    top = anchorY - height;
  } else if (handle === 'ne') {
    left = anchorX;
    top = anchorY - height;
  } else if (handle === 'sw') {
    left = anchorX - width;
    top = anchorY;
  } else if (handle === 'se') {
    left = anchorX;
    top = anchorY;
  }

  return {
    left: clampBetween(left, viewport.left, right - width),
    top: clampBetween(top, viewport.top, bottom - height),
    width,
    height
  };
};

const getErrorMessage = (error) => {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.error?.message) return error.error.message;
  return 'Errore durante l’aggiornamento del crop';
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

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!photo || !isOpen) return;
    const settings = getPhotoSettings(photo);
    setActivePreset('r43');
    setCropProfiles(normalizeCropProfiles(settings.cropProfiles));
    setCropViewport(null);
    setCropRect(null);
    setError('');
  }, [photo, isOpen]);

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
  }, [cropImageSrc, isOpen, photo?.id, refreshViewport]);

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
    if (!workspaceRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => refreshViewport());
    observer.observe(workspaceRef.current);
    return () => observer.disconnect();
  }, [refreshViewport]);

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
  const imageBounds = cropViewport ? {
    left: cropViewport.left,
    top: cropViewport.top,
    width: cropViewport.width,
    height: cropViewport.height
  } : null;

  const maskTop = imageBounds && selection ? {
    left: imageBounds.left,
    top: imageBounds.top,
    width: imageBounds.width,
    height: Math.max(0, selection.top - imageBounds.top)
  } : null;

  const maskBottom = imageBounds && selection ? {
    left: imageBounds.left,
    top: selection.top + selection.height,
    width: imageBounds.width,
    height: Math.max(0, (imageBounds.top + imageBounds.height) - (selection.top + selection.height))
  } : null;

  const maskLeft = imageBounds && selection ? {
    left: imageBounds.left,
    top: selection.top,
    width: Math.max(0, selection.left - imageBounds.left),
    height: selection.height
  } : null;

  const maskRight = imageBounds && selection ? {
    left: selection.left + selection.width,
    top: selection.top,
    width: Math.max(0, (imageBounds.left + imageBounds.width) - (selection.left + selection.width)),
    height: selection.height
  } : null;

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
