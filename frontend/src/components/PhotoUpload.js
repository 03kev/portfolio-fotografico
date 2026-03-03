import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AlertTriangle, FolderOpen, Globe, Loader2, MapPin, PencilLine, Save, Upload } from 'lucide-react';
import { usePhotos } from '../contexts/PhotoContext';
import { photoService, uploadUtils } from '../utils/api';
import { IMAGES_BASE_URL } from '../utils/constants';
import MapSelector from './MapSelector';
import { AnimatePresence } from 'framer-motion';
import exifr from 'exifr';
import './PhotoUpload.css';

const CROP_PRESETS = [
    { key: 'r43', label: 'Archivio 4:3', ratio: '4 / 3' },
    { key: 'r11', label: 'Home 1:1', ratio: '1 / 1' },
    { key: 'social', label: 'Social 1200x630', ratio: '1200 / 630' }
];

const DEFAULT_CROP_PROFILE = { x: 0.5, y: 0.5, scale: 1 };
const CROP_MIN_SIZE_PX = 56;
const CROP_MAX_SCALE = 5;
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
    const scale = clampScale(base.width / width);

    return normalizeCropProfile({
        x: centerX / srcW,
        y: centerY / srcH,
        scale
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

    const finalMaxWidth = Math.max(minWidth, Math.min(maxWidth, maxWidthByBounds));
    width = clampBetween(width, minWidth, finalMaxWidth);

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

const normalizeImageAssetUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return `${IMAGES_BASE_URL}${raw}`;
    return `${IMAGES_BASE_URL}/${raw}`;
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

const getSteps = (isEditMode) => (
    isEditMode
        ? [
            { id: 2, label: 'Info & Posizione' },
            { id: 3, label: 'Dettagli' }
        ]
        : [
            { id: 1, label: 'Upload' },
            { id: 2, label: 'Info & Posizione' },
            { id: 3, label: 'Dettagli' }
        ]
);

const PhotoUpload = ({ onUploadSuccess, onUploadError, onClose, photoToEdit }) => {
    const { actions } = usePhotos();
    const isEditMode = Boolean(photoToEdit);
    const steps = useMemo(() => getSteps(isEditMode), [isEditMode]);
    const firstStep = steps[0].id;
    const lastStep = steps[steps.length - 1].id;

    const [formData, setFormData] = useState(() => {
        if (isEditMode) {
            const settings = {
                aperture: '',
                shutter: '',
                iso: '',
                focal: '',
                ...getPhotoSettings(photoToEdit)
            };

            return {
                title: photoToEdit.title || '',
                description: photoToEdit.description || '',
                date: photoToEdit.date || new Date().toISOString().split('T')[0],
                location: photoToEdit.location || '',
                lat: photoToEdit.lat || '',
                lng: photoToEdit.lng || '',
                camera: photoToEdit.camera || '',
                lens: photoToEdit.lens || '',
                settings,
                tags: Array.isArray(photoToEdit.tags) ? photoToEdit.tags : []
            };
        }

        return {
            title: '',
            description: '',
            date: new Date().toISOString().split('T')[0],
            location: '',
            lat: '',
            lng: '',
            camera: '',
            lens: '',
            settings: { aperture: '', shutter: '', iso: '', focal: '' },
            tags: []
        };
    });
    const [selectedFile, setSelectedFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [tagInput, setTagInput] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [showMapSelector, setShowMapSelector] = useState(false);
    const [currentStep, setCurrentStep] = useState(firstStep);
    const [isClosing, setIsClosing] = useState(false);

    const [activeCropPreset, setActiveCropPreset] = useState('r43');
    const [cropProfiles, setCropProfiles] = useState(() => normalizeCropProfiles(getPhotoSettings(photoToEdit).cropProfiles));
    const [cropViewport, setCropViewport] = useState(null);
    const [activeCropRect, setActiveCropRect] = useState(null);
    const [isCropInteracting, setIsCropInteracting] = useState(false);

    const fileInputRef = useRef(null);
    const tagInputRef = useRef(null);
    const cropWorkspaceRef = useRef(null);
    const cropImageRef = useRef(null);
    const cropPointerStateRef = useRef(null);

    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);

    useEffect(() => {
        setCurrentStep(firstStep);
        setActiveCropPreset('r43');
        setCropProfiles(normalizeCropProfiles(getPhotoSettings(photoToEdit).cropProfiles));
    }, [photoToEdit, firstStep]);

    const extractImageMetadata = useCallback(async (file) => {
        try {
            const exifData = await exifr.parse(file, [
                'Model',
                'Make',
                'LensModel',
                'FNumber',
                'ExposureTime',
                'ISO',
                'FocalLength',
                'DateTimeOriginal',
                'GPSLatitude',
                'GPSLongitude',
                'GPSLatitudeRef',
                'GPSLongitudeRef'
            ]);
            if (!exifData) return;

            const cameraModel = exifData.Make && exifData.Model
                ? `${exifData.Make} ${exifData.Model}`.trim()
                : exifData.Model || '';
            const lensModel = exifData.LensModel || '';

            let photoDate = '';
            if (exifData.DateTimeOriginal) {
                const d = new Date(exifData.DateTimeOriginal);
                if (!Number.isNaN(d.getTime())) {
                    photoDate = d.toISOString().split('T')[0];
                }
            }

            const aperture = exifData.FNumber ? `f/${exifData.FNumber}` : '';
            let shutter = '';
            if (exifData.ExposureTime) {
                shutter = exifData.ExposureTime.toString();
                if (exifData.ExposureTime < 1 && exifData.ExposureTime > 0) {
                    const inv = Math.round(1 / exifData.ExposureTime);
                    shutter = `1/${inv}s`;
                } else if (exifData.ExposureTime >= 1) {
                    shutter = `${exifData.ExposureTime}s`;
                }
            }
            const iso = exifData.ISO ? exifData.ISO.toString() : '';
            const focal = exifData.FocalLength ? `${exifData.FocalLength}mm` : '';

            setFormData((prev) => ({
                ...prev,
                date: photoDate || prev.date,
                camera: cameraModel,
                lens: lensModel,
                settings: {
                    ...(prev.settings || {}),
                    aperture,
                    shutter,
                    iso,
                    focal
                }
            }));

            const gps = await exifr.gps(file);
            if (gps && gps.latitude && gps.longitude) {
                try {
                    const res = await fetch(
                        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${gps.latitude}&longitude=${gps.longitude}&localityLanguage=it`
                    );
                    const data = await res.json();
                    setFormData((prev) => ({
                        ...prev,
                        lat: gps.latitude.toFixed(6).toString(),
                        lng: gps.longitude.toFixed(6).toString(),
                        location:
                            data.locality ||
                            data.city ||
                            data.principalSubdivision ||
                            data.countryName ||
                            `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}`
                    }));
                } catch {
                    setFormData((prev) => ({
                        ...prev,
                        lat: gps.latitude.toFixed(6).toString(),
                        lng: gps.longitude.toFixed(6).toString(),
                        location: `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}`
                    }));
                }
            }
        } catch (err) {
            console.warn('Estrazione metadati EXIF fallita:', err);
        }
    }, []);

    const handleFileSelect = useCallback((event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            uploadUtils.validateImageFile(file);
            setSelectedFile(file);
            setError('');

            const reader = new FileReader();
            reader.onload = (e) => setPreview(e.target.result);
            reader.readAsDataURL(file);

            extractImageMetadata(file);
        } catch (err) {
            setSelectedFile(null);
            setPreview(null);
            setError(err.message || 'File non valido');
        }
    }, [extractImageMetadata]);

    const getCurrentLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setError('Geolocalizzazione non supportata dal browser');
            return;
        }

        setError('');
        setLocationLoading(true);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    const res = await fetch(
                        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=it`
                    );
                    const data = await res.json();
                    setFormData((prev) => ({
                        ...prev,
                        lat: latitude.toFixed(6).toString(),
                        lng: longitude.toFixed(6).toString(),
                        location:
                            data.locality ||
                            data.city ||
                            data.principalSubdivision ||
                            data.countryName ||
                            `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                    }));
                } catch {
                    setFormData((prev) => ({
                        ...prev,
                        lat: latitude.toFixed(6).toString(),
                        lng: longitude.toFixed(6).toString(),
                        location: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                    }));
                }
                setLocationLoading(false);
            },
            () => {
                setError('Impossibile ottenere la posizione corrente');
                setLocationLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }, []);

    const handleMapLocationSelect = useCallback((locationData) => {
        if (!locationData) return;
        setFormData((prev) => ({
            ...prev,
            lat: locationData.lat.toFixed(6).toString(),
            lng: locationData.lng.toFixed(6).toString(),
            location: locationData.address || `${locationData.lat}, ${locationData.lng}`
        }));
        setShowMapSelector(false);
        setError('');
    }, []);

    const handleInputChange = (field, value) => {
        setFormData((prev) => {
            if (field.includes('.')) {
                const [parent, child] = field.split('.');
                return { ...prev, [parent]: { ...prev[parent], [child]: value } };
            }
            return { ...prev, [field]: value };
        });
        if (error) setError('');
    };

    const addTag = (tag) => {
        const newTag = tag.trim();
        if (newTag && !formData.tags.includes(newTag)) {
            setFormData((prev) => ({ ...prev, tags: [...prev.tags, newTag] }));
        }
        setTagInput('');
    };

    const removeTag = (tagToRemove) => {
        setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tagToRemove) }));
    };

    const handleTagKeyPress = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (tagInput.trim()) addTag(tagInput);
        }
    };

    const initClose = () => {
        if (loading) return;
        setIsClosing(true);
        setTimeout(() => onClose?.(), 75);
    };

    const cropImageSrc = preview || normalizeImageAssetUrl(photoToEdit?.image || photoToEdit?.url || photoToEdit?.thumbnail);
    const activeCropProfile = cropProfiles[activeCropPreset] || DEFAULT_CROP_PROFILE;

    const updateActiveCropProfile = useCallback((patch) => {
        setCropProfiles((prev) => ({
            ...prev,
            [activeCropPreset]: normalizeCropProfile({ ...(prev[activeCropPreset] || DEFAULT_CROP_PROFILE), ...patch })
        }));
    }, [activeCropPreset]);

    const refreshCropViewport = useCallback(() => {
        const workspace = cropWorkspaceRef.current;
        const image = cropImageRef.current;
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
            width = containerWidth;
            height = width / imageRatio;
            top = (containerHeight - height) / 2;
        } else {
            height = containerHeight;
            width = height * imageRatio;
            left = (containerWidth - width) / 2;
        }

        setCropViewport({
            left,
            top,
            width,
            height,
            naturalWidth,
            naturalHeight
        });
    }, []);

    const saveRectToPreset = useCallback((rect, presetKey, viewportOverride = null) => {
        const viewport = viewportOverride || cropViewport;
        if (!viewport) return;
        const ratio = getPresetRatioValue(presetKey);
        const sourceRect = viewportRectToSourceRect(rect, viewport);
        const profile = sourceRectToProfile(sourceRect, viewport.naturalWidth, viewport.naturalHeight, ratio);
        setCropProfiles((prev) => ({
            ...prev,
            [presetKey]: profile
        }));
    }, [cropViewport]);

    const beginCropMove = useCallback((event) => {
        if (!event.isPrimary || !cropViewport || !activeCropRect) return;
        event.preventDefault();

        cropPointerStateRef.current = {
            mode: 'move',
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startRect: { ...activeCropRect },
            viewport: cropViewport,
            presetKey: activeCropPreset
        };
        setIsCropInteracting(true);
    }, [activeCropPreset, activeCropRect, cropViewport]);

    const beginCropResize = useCallback((event, handle) => {
        if (!event.isPrimary || !cropViewport || !activeCropRect) return;
        event.preventDefault();
        event.stopPropagation();

        const ratio = getPresetRatioValue(activeCropPreset);
        const base = getBaseCropSize(cropViewport.naturalWidth, cropViewport.naturalHeight, ratio);
        const minWidthByScale = (base.width / CROP_MAX_SCALE / cropViewport.naturalWidth) * cropViewport.width;
        const maxWidthByScale = (base.width / cropViewport.naturalWidth) * cropViewport.width;
        const minWidth = Math.max(CROP_MIN_SIZE_PX, minWidthByScale);

        cropPointerStateRef.current = {
            mode: 'resize',
            handle,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startRect: { ...activeCropRect },
            viewport: cropViewport,
            presetKey: activeCropPreset,
            ratio,
            minWidth,
            maxWidth: Math.max(minWidth, maxWidthByScale)
        };
        setIsCropInteracting(true);
    }, [activeCropPreset, activeCropRect, cropViewport]);

    useEffect(() => {
        if (!cropWorkspaceRef.current || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => refreshCropViewport());
        observer.observe(cropWorkspaceRef.current);
        return () => observer.disconnect();
    }, [refreshCropViewport]);

    useEffect(() => {
        if (!cropViewport || isCropInteracting) return;
        const ratio = getPresetRatioValue(activeCropPreset);
        const sourceRect = profileToSourceRect(
            activeCropProfile,
            cropViewport.naturalWidth,
            cropViewport.naturalHeight,
            ratio
        );
        setActiveCropRect(sourceRectToViewportRect(sourceRect, cropViewport));
    }, [activeCropPreset, activeCropProfile, cropViewport, isCropInteracting]);

    useEffect(() => {
        setCropViewport(null);
        setActiveCropRect(null);
        setIsCropInteracting(false);
        cropPointerStateRef.current = null;
    }, [cropImageSrc]);

    useEffect(() => {
        const onPointerMove = (event) => {
            const state = cropPointerStateRef.current;
            if (!state || event.pointerId !== state.pointerId) return;

            const dx = event.clientX - state.startX;
            const dy = event.clientY - state.startY;
            const viewport = state.viewport;
            const right = viewport.left + viewport.width;
            const bottom = viewport.top + viewport.height;
            let nextRect = state.startRect;

            if (state.mode === 'move') {
                const left = clampBetween(
                    state.startRect.left + dx,
                    viewport.left,
                    right - state.startRect.width
                );
                const top = clampBetween(
                    state.startRect.top + dy,
                    viewport.top,
                    bottom - state.startRect.height
                );
                nextRect = { ...state.startRect, left, top };
            } else if (state.mode === 'resize') {
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

            setActiveCropRect(nextRect);
            saveRectToPreset(nextRect, state.presetKey, viewport);
        };

        const onPointerEnd = (event) => {
            const state = cropPointerStateRef.current;
            if (!state || event.pointerId !== state.pointerId) return;
            cropPointerStateRef.current = null;
            setIsCropInteracting(false);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerEnd);
        window.addEventListener('pointercancel', onPointerEnd);

        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerEnd);
            window.removeEventListener('pointercancel', onPointerEnd);
        };
    }, [saveRectToPreset]);

    const nextStep = useCallback(() => {
        if (loading) return;

        if (!isEditMode && currentStep === 1 && !selectedFile) {
            setError('Seleziona un\'immagine prima di continuare');
            return;
        }
        if (currentStep === 2 && !formData.title.trim()) {
            setError('Il campo Titolo è obbligatorio');
            return;
        }

        const index = steps.findIndex((step) => step.id === currentStep);
        if (index >= 0 && index < steps.length - 1) {
            setError('');
            setCurrentStep(steps[index + 1].id);
        }
    }, [loading, isEditMode, currentStep, selectedFile, formData.title, steps]);

    const prevStep = useCallback(() => {
        if (loading) return;
        const index = steps.findIndex((step) => step.id === currentStep);
        if (index > 0) {
            setError('');
            setCurrentStep(steps[index - 1].id);
        }
    }, [loading, currentStep, steps]);

    const handleUpload = async () => {
        if (!isEditMode && !selectedFile) {
            setError('Nessuna immagine selezionata');
            return;
        }
        if (!formData.title.trim()) {
            setError('Il Titolo è obbligatorio');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const nextSettings = { ...(formData.settings || {}) };
            delete nextSettings.cropFocus;

            if (isEditMode) {
                const updateData = {
                    ...formData,
                    settings: JSON.stringify(nextSettings),
                    tags: formData.tags
                };

                const result = await actions.updatePhoto(photoToEdit.id, updateData);
                if (onUploadSuccess) onUploadSuccess(result);
            } else {
                let result;
                try {
                    const photoId = Date.now();
                    const uploadId = String(photoId);
                    const signResponse = await photoService.getUploadUrl({
                        uploadId,
                        variant: 'source',
                        mimetype: selectedFile.type,
                        fileSize: selectedFile.size
                    });
                    const signedData = signResponse?.data?.data || signResponse?.data;

                    if (!signedData?.uploadUrl || !signedData?.sourcePath) {
                        throw new Error('URL di upload non valida ricevuta dal server');
                    }

                    const uploadResponse = await fetch(signedData.uploadUrl, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': selectedFile.type || 'application/octet-stream',
                            'Cache-Control': 'private, no-store'
                        },
                        body: selectedFile
                    });

                    if (!uploadResponse.ok) {
                        throw new Error(`Upload su storage fallito (${uploadResponse.status})`);
                    }

                    const uploadData = {
                        ...formData,
                        photoId,
                        sourcePath: signedData.sourcePath,
                        sourceContentType: selectedFile.type,
                        settings: nextSettings,
                        tags: formData.tags
                    };
                    result = await actions.addPhoto(uploadData);
                } catch (directUploadError) {
                    const directUploadMessage = directUploadError?.message || directUploadError?.error?.message || '';
                    const shouldFallbackToMultipart = directUploadMessage.includes('Upload diretto disponibile solo con R2 configurato');

                    if (!shouldFallbackToMultipart) {
                        throw directUploadError;
                    }

                    const multipartPayload = uploadUtils.createFormData({
                        ...formData,
                        image: selectedFile,
                        settings: JSON.stringify(nextSettings),
                        tags: formData.tags
                    });
                    result = await actions.addPhoto(multipartPayload);
                }

                if (onUploadSuccess) onUploadSuccess(result);
            }

            setFormData({
                title: '',
                description: '',
                date: new Date().toISOString().split('T')[0],
                location: '',
                lat: '',
                lng: '',
                camera: '',
                lens: '',
                settings: { aperture: '', shutter: '', iso: '', focal: '' },
                tags: []
            });
            setSelectedFile(null);
            setPreview(null);
            setTagInput('');
            setCropProfiles(normalizeCropProfiles());
            setActiveCropPreset('r43');
            setCurrentStep(firstStep);
            if (onClose) onClose();
        } catch (err) {
            console.error('Errore upload foto:', err);
            const statusCode = err?.status || err?.code || err?.response?.status || err?.error?.code;
            const isPayloadTooLarge = String(statusCode) === '413';
            const errorMessage = isPayloadTooLarge
                ? 'File troppo grande per l\'upload. Usa upload diretto R2 o riduci la dimensione.'
                : (err?.message || err?.error?.message || 'Errore durante il caricamento');
            setError(errorMessage);
            if (onUploadError) onUploadError(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key !== 'Enter' || loading) return;

            if (tagInputRef.current === document.activeElement) {
                e.preventDefault();
                if (tagInput.trim()) addTag(tagInput);
                return;
            }

            if (currentStep !== lastStep) {
                const disabledNext =
                    (!isEditMode && currentStep === 1 && !selectedFile) ||
                    (currentStep === 2 && !formData.title.trim());
                if (!disabledNext) nextStep();
                return;
            }

            if ((selectedFile || isEditMode) && formData.title.trim() && !loading) {
                handleUpload();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [
        currentStep,
        lastStep,
        loading,
        tagInput,
        selectedFile,
        isEditMode,
        formData.title,
        addTag,
        nextStep,
        handleUpload
    ]);

    const isFirstStep = currentStep === firstStep;
    const isLastStep = currentStep === lastStep;

    const isNextDisabled =
        loading ||
        (!isEditMode && currentStep === 1 && !selectedFile) ||
        (currentStep === 2 && !formData.title.trim());

    const getProfilePreviewStyle = (profile) => ({
        objectPosition: `${profile.x * 100}% ${profile.y * 100}%`,
        transform: `scale(${profile.scale})`
    });

    const activePresetRatio = getPresetRatioValue(activeCropPreset);
    const cropSelection = cropViewport && activeCropRect ? {
        left: activeCropRect.left,
        top: activeCropRect.top,
        width: activeCropRect.width,
        height: activeCropRect.height
    } : null;

    const cropMaskTopStyle = cropViewport && cropSelection ? {
        left: cropViewport.left,
        top: cropViewport.top,
        width: cropViewport.width,
        height: Math.max(0, cropSelection.top - cropViewport.top)
    } : null;

    const cropMaskBottomStyle = cropViewport && cropSelection ? {
        left: cropViewport.left,
        top: cropSelection.top + cropSelection.height,
        width: cropViewport.width,
        height: Math.max(
            0,
            (cropViewport.top + cropViewport.height) - (cropSelection.top + cropSelection.height)
        )
    } : null;

    const cropMaskLeftStyle = cropViewport && cropSelection ? {
        left: cropViewport.left,
        top: cropSelection.top,
        width: Math.max(0, cropSelection.left - cropViewport.left),
        height: cropSelection.height
    } : null;

    const cropMaskRightStyle = cropViewport && cropSelection ? {
        left: cropSelection.left + cropSelection.width,
        top: cropSelection.top,
        width: Math.max(
            0,
            (cropViewport.left + cropViewport.width) - (cropSelection.left + cropSelection.width)
        ),
        height: cropSelection.height
    } : null;

    return (
        <div className="photo-upload-modal" onClick={() => !loading && initClose()}>
            <div className={`photo-upload-container${isClosing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className="upload-header">
                    <h2>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {isEditMode ? <PencilLine size={18} /> : <Upload size={18} />}
                            {isEditMode ? 'Modifica Foto' : 'Carica Nuova Foto'}
                        </span>
                    </h2>
                    {onClose && (
                        <button className="close-btn" onClick={() => !loading && initClose()} title="Chiudi">
                            ×
                        </button>
                    )}
                </div>

                <nav className="step-navbar">
                    {steps.map((step) => (
                        <button
                            key={step.id}
                            className={currentStep === step.id ? 'active' : ''}
                            onClick={() => {
                                if (!loading) {
                                    setError('');
                                    setCurrentStep(step.id);
                                }
                            }}
                            disabled={loading}
                        >
                            {step.label}
                        </button>
                    ))}
                </nav>

                <div className="steps-container">
                    {!isEditMode && currentStep === 1 && (
                        <div className="step-content">
                            <div
                                className={`upload-area ${selectedFile ? 'has-file' : ''}`}
                                onClick={() => !loading && fileInputRef.current?.click()}
                            >
                                {preview ? (
                                    <div className="preview-container">
                                        <img src={preview} alt="Preview" className="preview-image" />
                                        <div className="preview-overlay">
                                            <button className="change-image-btn">Cambia immagine</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="upload-placeholder">
                                        <div className="upload-icon">
                                            <FolderOpen size={28} />
                                        </div>
                                        <p>Clicca per selezionare un'immagine</p>
                                        <p className="upload-hint">Formati JPG, PNG, WebP - Max 50MB</p>
                                    </div>
                                )}
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleFileSelect}
                            />
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className="step-content">
                            <div className="form-group">
                                <label>Titolo<span style={{ color: '#999', marginLeft: '2px' }}>*</span></label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => handleInputChange('title', e.target.value)}
                                    placeholder="Es: Tramonto in Toscana"
                                />
                            </div>

                            <div className="form-group">
                                <label>Descrizione</label>
                                <textarea
                                    rows="3"
                                    value={formData.description}
                                    onChange={(e) => handleInputChange('description', e.target.value)}
                                    placeholder="Racconta la storia..."
                                />
                            </div>

                            <div className="location-section">
                                <label>Posizione</label>
                                <div className="location-input-group">
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => handleInputChange('location', e.target.value)}
                                        placeholder="Es: Val d'Orcia, Toscana"
                                    />
                                    <button
                                        className="location-btn gps-btn"
                                        onClick={getCurrentLocation}
                                        disabled={locationLoading || loading}
                                        title="Usa GPS"
                                    >
                                        {locationLoading ? <Loader2 size={16} /> : <MapPin size={16} />}
                                    </button>
                                    <button
                                        className="location-btn map-btn"
                                        onClick={() => setShowMapSelector(true)}
                                        disabled={loading}
                                        title="Mappa"
                                    >
                                        <Globe size={16} />
                                    </button>
                                </div>
                                <div className="coordinates-group">
                                    <div className="form-group">
                                        <label>Latitudine</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={formData.lat}
                                            onChange={(e) => handleInputChange('lat', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Longitudine</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={formData.lng}
                                            onChange={(e) => handleInputChange('lng', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className="step-content">
                            <div className="tech-details">
                                <h3>Dettagli Tecnici</h3>
                                <div className="form-group">
                                    <label>Data</label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => handleInputChange('date', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Fotocamera</label>
                                    <input
                                        type="text"
                                        value={formData.camera}
                                        placeholder="Es: Canon EOS R5"
                                        onChange={(e) => handleInputChange('camera', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Obiettivo</label>
                                    <input
                                        type="text"
                                        value={formData.lens}
                                        placeholder="Es: RF 24-70mm f/2.8L IS"
                                        onChange={(e) => handleInputChange('lens', e.target.value)}
                                    />
                                </div>
                                <div className="settings-row">
                                    <div className="form-group">
                                        <label>Apertura</label>
                                        <input
                                            type="text"
                                            value={formData.settings.aperture}
                                            placeholder="es. f/8"
                                            onChange={(e) => handleInputChange('settings.aperture', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Tempo</label>
                                        <input
                                            type="text"
                                            value={formData.settings.shutter}
                                            placeholder="es. 1/125s"
                                            onChange={(e) => handleInputChange('settings.shutter', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>ISO</label>
                                        <input
                                            type="text"
                                            value={formData.settings.iso}
                                            placeholder="es. 100"
                                            onChange={(e) => handleInputChange('settings.iso', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Focale</label>
                                        <input
                                            type="text"
                                            value={formData.settings.focal}
                                            placeholder="es. 35mm"
                                            onChange={(e) => handleInputChange('settings.focal', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="tags-section">
                                <label>Tag</label>
                                <div className="tags-input-group">
                                    <input
                                        ref={tagInputRef}
                                        type="text"
                                        value={tagInput}
                                        placeholder="Aggiungi tag e premi Invio"
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyPress={handleTagKeyPress}
                                    />
                                    <button type="button" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()}>
                                        +
                                    </button>
                                </div>
                                {formData.tags.length > 0 && (
                                    <div className="tags-list">
                                        {formData.tags.map((tag, idx) => (
                                            <span key={idx} className="tag">
                                                {tag}
                                                <button type="button" onClick={() => removeTag(tag)}>×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {currentStep === 4 && (
                        <div className="step-content">
                            {cropImageSrc ? (
                                <div className="crop-editor-section">
                                    <div className="crop-editor-header">
                                        <h3>Composizione</h3>
                                        <button
                                            type="button"
                                            className="crop-reset-btn"
                                            disabled={loading}
                                            onClick={() => updateActiveCropProfile({ ...DEFAULT_CROP_PROFILE })}
                                        >
                                            Reset preset
                                        </button>
                                    </div>

                                    <p className="crop-editor-hint">
                                        Ridimensiona e sposta il riquadro: l&apos;immagine resta fissa, come in un editor crop.
                                    </p>

                                    <div className="crop-ratio-tabs">
                                        {CROP_PRESETS.map((preset) => (
                                            <button
                                                key={preset.key}
                                                type="button"
                                                className={`crop-ratio-tab ${activeCropPreset === preset.key ? 'active' : ''}`}
                                                onClick={() => setActiveCropPreset(preset.key)}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="crop-workspace-shell" style={{ aspectRatio: activePresetRatio }}>
                                        <div
                                            ref={cropWorkspaceRef}
                                            className={`crop-workspace ${isCropInteracting ? 'is-interacting' : ''}`}
                                        >
                                            <img
                                                ref={cropImageRef}
                                                className="crop-workspace-image"
                                                src={cropImageSrc}
                                                alt="Editor composizione"
                                                draggable="false"
                                                onLoad={refreshCropViewport}
                                            />

                                            {cropViewport && (
                                                <div
                                                    className="crop-image-bounds"
                                                    style={{
                                                        left: cropViewport.left,
                                                        top: cropViewport.top,
                                                        width: cropViewport.width,
                                                        height: cropViewport.height
                                                    }}
                                                />
                                            )}

                                            {cropSelection && (
                                                <>
                                                    <div className="crop-mask-segment" style={cropMaskTopStyle} />
                                                    <div className="crop-mask-segment" style={cropMaskBottomStyle} />
                                                    <div className="crop-mask-segment" style={cropMaskLeftStyle} />
                                                    <div className="crop-mask-segment" style={cropMaskRightStyle} />

                                                    <div
                                                        className="crop-selection-box"
                                                        style={cropSelection}
                                                        onPointerDown={beginCropMove}
                                                    >
                                                        <div className="crop-grid-lines" />
                                                        {CROP_HANDLES.map((handle) => (
                                                            <button
                                                                key={handle}
                                                                type="button"
                                                                className={`crop-handle crop-handle-${handle}`}
                                                                onPointerDown={(event) => beginCropResize(event, handle)}
                                                                aria-label={`Ridimensiona ${handle}`}
                                                            />
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="crop-editor-previews">
                                        {CROP_PRESETS.map((preset) => {
                                            const profile = cropProfiles[preset.key] || DEFAULT_CROP_PROFILE;
                                            return (
                                                <div key={preset.key} className="crop-preview crop-preview-item">
                                                    <div className="crop-preview-frame" style={{ aspectRatio: preset.ratio }}>
                                                        <img
                                                            src={cropImageSrc}
                                                            alt={`Anteprima ${preset.label}`}
                                                            draggable="false"
                                                            style={getProfilePreviewStyle(profile)}
                                                        />
                                                    </div>
                                                    <span>{preset.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="crop-editor-empty">
                                    Nessuna immagine disponibile per la composizione.
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="error-message">
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={16} /> {error}
                            </span>
                        </div>
                    )}

                    <div className="upload-actions">
                        {!isFirstStep && (
                            <button type="button" className="cancel-btn" onClick={prevStep} disabled={loading}>
                                Indietro
                            </button>
                        )}

                        {!isLastStep ? (
                            <button type="button" className="upload-btn" onClick={nextStep} disabled={isNextDisabled}>
                                Avanti
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="upload-btn"
                                    onClick={handleUpload}
                                    disabled={loading || (!selectedFile && !isEditMode)}
                                >
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                        {loading ? <Loader2 size={16} /> : isEditMode ? <Save size={16} /> : <Upload size={16} />}
                                        {loading
                                            ? (isEditMode ? 'Salvataggio...' : 'Caricamento...')
                                            : (isEditMode ? 'Salva Modifiche' : 'Carica Foto')}
                                    </span>
                                </button>
                                {onClose && (
                                    <button type="button" className="cancel-btn" onClick={onClose} disabled={loading}>
                                        Annulla
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                <AnimatePresence initial={false} mode="wait">
                    {showMapSelector && (
                        <MapSelector
                            key="map-selector"
                            isOpen={showMapSelector}
                            onClose={() => setShowMapSelector(false)}
                            onLocationSelect={handleMapLocationSelect}
                            initialLocation={
                                formData.lat && formData.lng
                                    ? { lat: parseFloat(formData.lat), lng: parseFloat(formData.lng) }
                                    : null
                            }
                            initialFullAddress={formData.location ? formData.location : ''}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default PhotoUpload;
