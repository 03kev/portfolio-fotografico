import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useSeries } from '../contexts/SeriesContext';
import { usePhotos } from '../contexts/PhotoContext';
import SeriesEditor from './SeriesEditor';
import { useToast } from './Toast';
import { IMAGES_BASE_URL } from '../utils/constants';
import useAdminMode from '../hooks/useAdminMode';

const PageContainer = styled.div`
  min-height: 100vh;
  background: transparent;
  padding-top: 80px;
`;

const HeroSection = styled(motion.div)`
  position: relative;
  height: 60vh;
  min-height: 400px;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.72) 70%, rgba(0,0,0,0.95) 100%);
    z-index: 1;
  }
`;

const CoverImage = styled(motion.div)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: url(${props => props.src});
  background-size: cover;
  background-position: center;
`;

const HeroContent = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: var(--spacing-4xl) var(--spacing-xl);
  z-index: 2;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
`;

const BackButton = styled(motion.button)`
  position: absolute;
  top: var(--spacing-2xl);
  left: var(--spacing-xl);
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--color-white);
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--border-radius-full);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  z-index: 3;

  &:hover {
    background: rgba(0, 0, 0, 0.9);
    border-color: rgba(255, 255, 255, 0.3);
  }
`;

const EditButton = styled(BackButton)`
  left: auto;
  right: var(--spacing-xl);
  background: var(--primary-gradient);
  border-color: transparent;

  &:hover {
    opacity: 0.9;
  }
`;

const SeriesTitle = styled(motion.h1)`
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: var(--font-weight-black);
  color: var(--color-white);
  margin-bottom: var(--spacing-md);
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
`;

const SeriesDescription = styled(motion.p)`
  font-size: var(--font-size-xl);
  color: rgba(255, 255, 255, 0.9);
  max-width: 800px;
  line-height: 1.6;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
`;

const PhotoCount = styled(motion.div)`
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--border-radius-full);
  font-size: var(--font-size-base);
  color: var(--color-white);
  margin-top: var(--spacing-lg);
`;

const ContentSection = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--spacing-4xl) var(--spacing-xl);
`;

const ContentBlock = styled(motion.div)`
  margin-bottom: var(--spacing-4xl);
`;

const TextBlock = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border-left: 4px solid var(--color-primary);
  padding: var(--spacing-2xl);
  border-radius: var(--border-radius-lg);
  margin: var(--spacing-2xl) 0;

  p {
    font-size: var(--font-size-lg);
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.8;
    white-space: pre-wrap;
  }
`;

const AdminBar = styled.div`
  display: flex;
  gap: var(--spacing-md);
  align-items: center;
  justify-content: flex-end;
  margin-bottom: var(--spacing-2xl);
`;

const AdminBarButton = styled(motion.button)`
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: var(--color-white);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--border-radius-full);
  font-weight: var(--font-weight-medium);
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }
`;

const PrimaryAdminButton = styled(AdminBarButton)`
  background: var(--primary-gradient);
  border-color: transparent;

  &:hover {
    opacity: 0.92;
  }
`;

const LayoutStage = styled.div`
  position: relative;
  min-height: 70vh;
  border-radius: var(--border-radius-xl);
  background: transparent;
  overflow: auto;
  padding: var(--spacing-lg);
`;

const Canvas = styled.div`
  position: relative;
  width: 1200px;
  margin: 0 auto;
  border-radius: var(--border-radius-xl);
  background: transparent;

  background-image:
    linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px);
  background-size: 8px 8px;
  background-position: 0 0;
`;

const DraggableBlock = styled.div`
  position: absolute;
  border-radius: var(--border-radius-xl);
  border: 1px solid ${props => (props.$selected ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.12)')};
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  overflow: hidden;
  touch-action: none;
  box-shadow: ${props => (props.$selected ? '0 0 0 2px rgba(255,255,255,0.28), 0 16px 40px rgba(0,0,0,0.35)' : '0 12px 28px rgba(0,0,0,0.28)')};
`;


const DragHandle = styled.div`
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacing-md);
  cursor: grab;
  user-select: none;
  background: rgba(0, 0, 0, 0.55);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  &:active {
    cursor: grabbing;
  }
`;

const DragLabel = styled.div`
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.65);
`;

const DragHint = styled.div`
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.45);
`;

const BlockBody = styled.div`
  width: 100%;
  height: calc(100% - 38px);
  overflow: auto;
  padding: var(--spacing-md);
`;

const ResizeHandle = styled.div`
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.45);
  z-index: 3;
`;

const SeriesText = styled.div`
  width: 100%;
  height: 100%;
  padding: var(--spacing-lg);
  color: rgba(255, 255, 255, 0.88);
  font-size: var(--font-size-lg);
  line-height: 1.85;
  letter-spacing: 0.01em;
  white-space: pre-wrap;

  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  border-radius: var(--border-radius-xl);
`;

const PhotoFrame = styled.figure`
  margin: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
`;

const CanvasPhoto = styled.img`
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 0;
  object-fit: contain;
  display: block;
  border-radius: var(--border-radius-xl);
  background: rgba(255, 255, 255, 0.04);
`;

const CanvasCaption = styled.figcaption`
  color: rgba(255, 255, 255, 0.55);
  font-size: var(--font-size-sm);
  padding: 0 var(--spacing-sm);
`;

const ThumbGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--spacing-md);
  padding: var(--spacing-sm);
  align-content: start;
`;

const ThumbButton = styled.button`
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(0, 0, 0, 0.18);
  border-radius: var(--border-radius-xl);
  padding: 0;
  overflow: hidden;
  cursor: pointer;

  &:hover {
    border-color: rgba(255, 255, 255, 0.20);
  }
`;

const ThumbImage = styled.img`
  width: 100%;
  height: 140px;
  object-fit: contain;
  display: block;
  background: rgba(255, 255, 255, 0.04);
`;

const ClassicFigure = styled.figure`
  margin: 0;

  img {
    width: 100%;
    height: auto;
    display: block;
    border-radius: var(--border-radius-xl);
    background: rgba(255, 255, 255, 0.04);
  }

  figcaption {
    margin-top: var(--spacing-sm);
    color: rgba(255, 255, 255, 0.6);
    font-size: var(--font-size-sm);
  }
`;

const PhotoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--spacing-xl);
  margin: var(--spacing-2xl) 0;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: var(--spacing-lg);
  }
`;

const PhotoCard = styled(motion.button)`
  appearance: none;
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  border-radius: var(--border-radius-xl);
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  text-align: left;

  &:hover {
    border-color: rgba(255, 255, 255, 0.22);
  }
`;

const PhotoImage = styled.img`
  width: 100%;
  height: auto;
  display: block;
  background: rgba(255, 255, 255, 0.04);
`;

const LightboxOverlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-2xl);
`;

const LightboxImage = styled.img`
  max-width: min(1200px, 92vw);
  max-height: 88vh;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--border-radius-xl);
  background: rgba(255, 255, 255, 0.04);
`;

const LightboxClose = styled(motion.button)`
  position: fixed;
  top: var(--spacing-xl);
  right: var(--spacing-xl);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.6);
  color: var(--color-white);
  font-size: 20px;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.72);
  }
`;

const LoadingContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0c0c0c;
`;

const LoadingSpinner = styled(motion.div)`
  width: 60px;
  height: 60px;
  border: 4px solid rgba(102, 126, 234, 0.2);
  border-top-color: #667eea;
  border-radius: 50%;
`;

const ErrorContainer = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0c0c0c;
  padding: var(--spacing-xl);
  text-align: center;
`;

const ErrorIcon = styled.div`
  font-size: 4rem;
  margin-bottom: var(--spacing-lg);
`;

const ErrorText = styled.h2`
  color: var(--color-white);
  font-size: var(--font-size-2xl);
  margin-bottom: var(--spacing-md);
`;

const ErrorButton = styled(motion.button)`
  background: var(--primary-gradient);
  border: none;
  color: var(--color-white);
  padding: var(--spacing-md) var(--spacing-xl);
  border-radius: var(--border-radius-full);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  margin-top: var(--spacing-lg);

  &:hover {
    opacity: 0.9;
  }
`;

function SeriesDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { currentSeries, fetchSeriesBySlug, updateSeries, loading, error } = useSeries();
  const { photos, actions } = usePhotos();
  const [showEditor, setShowEditor] = useState(false);
  const [seriesPhotos, setSeriesPhotos] = useState([]);
  const [layoutMode, setLayoutMode] = useState(false);
  const [draftContent, setDraftContent] = useState([]);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const stageRef = useRef(null);
  const dragStateRef = useRef(null);

  const canvasRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  const CANVAS_WIDTH = 1200;
  const GRID_SIZE = 8;
  const SNAP_THRESHOLD = 6;
  const MIN_W = 240;
  const MIN_H = 140;

  const isAdmin = useAdminMode();
  const toast = useToast();


  useEffect(() => {
    if (slug) {
      fetchSeriesBySlug(slug);
    }
  }, [slug, fetchSeriesBySlug]);

  useEffect(() => {
    if (currentSeries && photos.length > 0) {
      const filteredPhotos = photos.filter(photo =>
        currentSeries.photos.includes(photo.id)
      );
      setSeriesPhotos(filteredPhotos);
    }
  }, [currentSeries, photos]);

  useEffect(() => {
    if (!currentSeries) return;

    const withDefaults = (content = []) => {
      let yCursor = 24;
      return content.map((block) => {
        const base = { ...block };
        if (!base.layout) {
          const isText = base.type === 'text';
          const isSingle = base.type === 'photo';
          base.layout = {
            x: 24,
            y: yCursor,
            w: 720,
            h: isText ? 220 : isSingle ? 520 : 420,
          };
        }
        yCursor += (base.layout?.h || 260) + 24;
        return base;
      });
    };

    setDraftContent(withDefaults(currentSeries.content || []));
  }, [currentSeries]);

  useEffect(() => {
    if (!layoutMode) return;
    if (selectedIndex === null) return;

    const onKeyDown = (e) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();

      const step = e.shiftKey ? 10 : e.altKey ? 1 : 2;

      setDraftContent(prev => {
        if (!prev[selectedIndex]?.layout) return prev;
        const next = [...prev];
        const b = { ...next[selectedIndex] };
        const l = { ...b.layout };

        const canvasH = getCanvasHeight(prev);
        const canvasW = CANVAS_WIDTH;

        const w = l.w || 600;
        const h = l.h || 300;

        let x = l.x || 0;
        let y = l.y || 0;

        if (e.key === 'ArrowLeft') x -= step;
        if (e.key === 'ArrowRight') x += step;
        if (e.key === 'ArrowUp') y -= step;
        if (e.key === 'ArrowDown') y += step;

        x = clamp(x, 0, canvasW - w);
        y = clamp(y, 0, canvasH - h);

        if (snapEnabled) {
          x = snap(x);
          y = snap(y);
          x = snapEdges(x, canvasW - w);
          y = snapEdges(y, canvasH - h);
        }

        b.layout = { ...l, x, y };
        next[selectedIndex] = b;
        return next;
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [layoutMode, selectedIndex, snapEnabled]);

  const getCanvasHeight = (content) => {
    const maxBottom = (content || []).reduce((max, b) => {
      const l = b?.layout;
      if (!l) return max;
      return Math.max(max, (l.y || 0) + (l.h || 0));
    }, 0);
    return Math.max(720, maxBottom + 120);
  };

  const snap = (v) => {
    if (!snapEnabled) return v;
    return Math.round(v / GRID_SIZE) * GRID_SIZE;
  };

  const snapEdges = (value, maxValue) => {
    if (!snapEnabled) return value;
    if (Math.abs(value - 0) <= SNAP_THRESHOLD) return 0;
    if (Math.abs(value - maxValue) <= SNAP_THRESHOLD) return maxValue;
    return value;
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

  const handlePhotoClick = (photo) => {
    setLightboxPhoto(photo);
  };

  const startDrag = (index, e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIndex(index);

    const canvas = canvasRef.current;
    if (!canvas) return;

    dragStateRef.current = {
      kind: 'drag',
      index,
      startX: e.clientX,
      startY: e.clientY,
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  };

  const startResize = (index, dir, e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIndex(index);

    dragStateRef.current = {
      kind: 'resize',
      dir,
      index,
      startX: e.clientX,
      startY: e.clientY,
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  };

  const onPointerMove = (e) => {
    const st = dragStateRef.current;
    if (!st) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    setDraftContent(prev => {
      const next = [...prev];
      const b = { ...next[st.index] };
      const l = { ...(b.layout || {}) };

      const canvasH = getCanvasHeight(prev);
      const canvasW = CANVAS_WIDTH;

      if (st.kind === 'drag') {
        let x = (l.x || 0) + dx;
        let y = (l.y || 0) + dy;

        const w = l.w || 600;
        const h = l.h || 300;

        if (w >= canvasW) x = 0;
        else x = clamp(x, 0, canvasW - w);

        if (h >= canvasH) y = 0;
        else y = clamp(y, 0, canvasH - h);

        x = snap(x);
        y = snap(y);

        x = snapEdges(x, canvasW - w);
        y = snapEdges(y, canvasH - h);

        b.layout = { ...l, x, y };
      } else {
        let x = l.x || 0;
        let y = l.y || 0;
        let w = l.w || 600;
        let h = l.h || 300;

        const dir = st.dir;

        if (dir.includes('e')) w = w + dx;
        if (dir.includes('s')) h = h + dy;
        if (dir.includes('w')) { w = w - dx; x = x + dx; }
        if (dir.includes('n')) { h = h - dy; y = y + dy; }

        w = Math.max(MIN_W, w);
        h = Math.max(MIN_H, h);

        // never allow resize beyond canvas bounds
        if (w > canvasW) { w = canvasW; x = 0; }
        if (h > canvasH) { h = canvasH; y = 0; }

        // clamp position again after width/height adjustments
        x = clamp(x, 0, canvasW - w);
        y = clamp(y, 0, canvasH - h);

        x = clamp(x, 0, canvasW - w);
        y = clamp(y, 0, canvasH - h);

        x = snap(x);
        y = snap(y);
        w = snap(w);
        h = snap(h);

        x = snapEdges(x, canvasW - w);
        y = snapEdges(y, canvasH - h);

        b.layout = { ...l, x, y, w, h };
      }

      next[st.index] = b;
      return next;
    });

    st.startX = e.clientX;
    st.startY = e.clientY;
  };

  const onPointerUp = () => {
    window.removeEventListener('pointermove', onPointerMove);
    dragStateRef.current = null;
  };


  const handleSaveLayout = async () => {
    try {
      await updateSeries(currentSeries.id, {
        ...currentSeries,
        content: draftContent,
      });
      toast.success('Layout serie salvato ✅');
      setLayoutMode(false);
      if (slug) {
        fetchSeriesBySlug(slug);
      }
    } catch (err) {
      toast.error(`Errore salvataggio layout: ${err?.message || 'unknown'}`);
    }
  };

  const handleResetLayout = () => {
    if (!currentSeries) return;
    setDraftContent(currentSeries.content || []);
  };

  const getCoverPhoto = () => {
    if (!currentSeries) return null;
    if (currentSeries.coverImage) {
      const coverPhoto = photos.find(p => p.id === currentSeries.coverImage);
      if (coverPhoto) return coverPhoto;
    }
    return seriesPhotos[0] || null;
  };

  if (loading) {
    return (
      <LoadingContainer>
        <LoadingSpinner
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </LoadingContainer>
    );
  }

  if (error || !currentSeries) {
    return (
      <ErrorContainer>
        <ErrorIcon>😕</ErrorIcon>
        <ErrorText>Serie non trovata</ErrorText>
        <p style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
          La serie che stai cercando non esiste o non è più disponibile.
        </p>
        <ErrorButton
          onClick={() => navigate('/')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Torna alla Home
        </ErrorButton>
      </ErrorContainer>
    );
  }

  const hasSavedLayout =
    Array.isArray(currentSeries?.content) &&
    currentSeries.content.some(b => b?.layout && typeof b.layout.x === "number");

  const coverPhoto = getCoverPhoto();

  return (
    <>
      <PageContainer>
        <HeroSection>
          {coverPhoto && (
            <CoverImage
              src={`${IMAGES_BASE_URL}${coverPhoto.image}`}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.5 }}
            />
          )}

          <BackButton
            onClick={() => navigate('/')}
            whileHover={{ x: -5 }}
            whileTap={{ scale: 0.95 }}
          >
            <span>←</span> Indietro
          </BackButton>

          {isAdmin && (
            <EditButton
              onClick={() => setShowEditor(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span>✏️</span> Modifica
            </EditButton>
          )}

          <HeroContent>
            <SeriesTitle
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              {currentSeries.title}
            </SeriesTitle>
            <SeriesDescription
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
            >
              {currentSeries.description}
            </SeriesDescription>
            <PhotoCount
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7 }}
            >
              Foto: {seriesPhotos.length}
            </PhotoCount>
          </HeroContent>
        </HeroSection>

        <ContentSection>
          {isAdmin && (
            <AdminBar>
              <AdminBarButton
                type="button"
                onClick={() => setShowEditor(true)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                ✏️ Contenuti
              </AdminBarButton>

              <AdminBarButton
                type="button"
                onClick={() => setLayoutMode(v => !v)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                {layoutMode ? '✓ Esci layout' : '↔︎ Layout (drag/resize)'}
              </AdminBarButton>

              {layoutMode && (
                <>
                  <PrimaryAdminButton
                    type="button"
                    onClick={handleSaveLayout}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Salva layout
                  </PrimaryAdminButton>

                  <AdminBarButton
                    type="button"
                    onClick={handleResetLayout}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Reset
                  </AdminBarButton>
                </>
              )}
              <AdminBarButton
                type="button"
                onClick={() => setSnapEnabled(v => !v)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Snap: {snapEnabled ? 'ON' : 'OFF'}
              </AdminBarButton>

              <AdminBarButton
                type="button"
                onClick={() => setShowGrid(v => !v)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Grid: {showGrid ? 'ON' : 'OFF'}
              </AdminBarButton>
            </AdminBar>
          )}

          {layoutMode ? (
            <LayoutStage
              ref={stageRef}
              onPointerDown={() => setSelectedIndex(null)}
            >
              <Canvas
                ref={canvasRef}
                style={{
                  height: `${getCanvasHeight(draftContent)}px`,
                  backgroundImage: showGrid ? undefined : 'none',
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {draftContent.map((block, index) => {
                  const layout = block.layout || { x: 24, y: 24, w: 720, h: 320 };
                  const isSelected = selectedIndex === index;

                  const renderBlock = () => {
                    if (block.type === 'text') {
                      return <SeriesText>{block.content}</SeriesText>;
                    }

                    if (block.type === 'photo') {
                      const photo = photos.find(p => p.id === block.content);
                      if (!photo) return null;
                      return (
                        <PhotoFrame>
                          <CanvasPhoto
                            src={`${IMAGES_BASE_URL}${photo.image}`}
                            alt={photo.title}
                            loading="lazy"
                            onClick={() => handlePhotoClick(photo)}
                            style={{ cursor: 'pointer' }}
                          />
                          {photo.title && <CanvasCaption>{photo.title}</CanvasCaption>}
                        </PhotoFrame>
                      );
                    }

                    if (block.type === 'photos') {
                      return (
                        <ThumbGrid>
                          {block.content.map(photoId => {
                            const photo = photos.find(p => p.id === photoId);
                            return photo ? (
                              <ThumbButton
                                key={photo.id}
                                type="button"
                                onClick={() => handlePhotoClick(photo)}
                                title={photo.title || ''}
                              >
                                <ThumbImage
                                  src={`${IMAGES_BASE_URL}${photo.image}`}
                                  alt={photo.title}
                                  loading="lazy"
                                />
                              </ThumbButton>
                            ) : null;
                          })}
                        </ThumbGrid>
                      );
                    }

                    return null;
                  };

                  return (
                    <DraggableBlock
                      key={index}
                      $selected={isSelected}
                      style={{
                        left: layout.x,
                        top: layout.y,
                        width: layout.w,
                        height: layout.h,
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedIndex(index);
                      }}
                    >
                      <DragHandle onPointerDown={(e) => startDrag(index, e)}>
                        <DragLabel>
                          {block.type === 'text' ? 'Testo' : block.type === 'photo' ? 'Foto' : 'Gruppo foto'}
                        </DragLabel>
                        <DragHint>drag • resize con maniglie • frecce per nudge</DragHint>
                      </DragHandle>

                      <BlockBody>
                        {renderBlock()}
                      </BlockBody>

                      {isSelected && (
                        <>
                          {/* corners */}
                          <ResizeHandle style={{ left: '-5px', top: '-5px', cursor: 'nwse-resize' }} onPointerDown={(e) => startResize(index, 'nw', e)} />
                          <ResizeHandle style={{ right: '-5px', top: '-5px', cursor: 'nesw-resize' }} onPointerDown={(e) => startResize(index, 'ne', e)} />
                          <ResizeHandle style={{ right: '-5px', bottom: '-5px', cursor: 'nwse-resize' }} onPointerDown={(e) => startResize(index, 'se', e)} />
                          <ResizeHandle style={{ left: '-5px', bottom: '-5px', cursor: 'nesw-resize' }} onPointerDown={(e) => startResize(index, 'sw', e)} />

                          {/* edges */}
                          <ResizeHandle style={{ left: '50%', top: '-5px', transform: 'translateX(-50%)', cursor: 'ns-resize' }} onPointerDown={(e) => startResize(index, 'n', e)} />
                          <ResizeHandle style={{ right: '-5px', top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' }} onPointerDown={(e) => startResize(index, 'e', e)} />
                          <ResizeHandle style={{ left: '50%', bottom: '-5px', transform: 'translateX(-50%)', cursor: 'ns-resize' }} onPointerDown={(e) => startResize(index, 's', e)} />
                          <ResizeHandle style={{ left: '-5px', top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' }} onPointerDown={(e) => startResize(index, 'w', e)} />
                        </>
                      )}
                    </DraggableBlock>
                  );
                })}
              </Canvas>
            </LayoutStage>
          ) : (
            <>
              {hasSavedLayout ? (
                <div style={{ overflow: "auto" }}>
                  <div style={{ width: "100%", overflow: "hidden" }}>
                    <div>
                      <Canvas
  style={{
    height: `${getCanvasHeight(currentSeries.content)}px`,
    backgroundImage: "none",
    border: "none",
    background: "transparent",
  }}
>
                        {currentSeries.content.map((block, index) => {
                          const layout = block.layout || { x: 24, y: 24, w: 720, h: 320 };

                          const renderBlock = () => {
                            if (block.type === 'text') {
                              return <SeriesText>{block.content}</SeriesText>;
                            }

                            if (block.type === "photo") {
                              const photo = photos.find(p => p.id === block.content);
                              if (!photo) return null;
                              return (
                                <PhotoFrame>
                                  <CanvasPhoto
                                    src={`${IMAGES_BASE_URL}${photo.image}`}
                                    alt={photo.title}
                                    loading="lazy"
                                    onClick={() => handlePhotoClick(photo)}
                                    style={{ cursor: "pointer" }}
                                  />
                                  {photo.title && <CanvasCaption>{photo.title}</CanvasCaption>}
                                </PhotoFrame>
                              );
                            }

                            if (block.type === "photos") {
                              return (
                                <ThumbGrid>
                                  {block.content.map(photoId => {
                                    const photo = photos.find(p => p.id === photoId);
                                    return photo ? (
                                      <ThumbButton
                                        key={photo.id}
                                        type="button"
                                        onClick={() => handlePhotoClick(photo)}
                                        title={photo.title || ''}
                                      >
                                        <ThumbImage
                                          src={`${IMAGES_BASE_URL}${photo.image}`}
                                          alt={photo.title}
                                          loading="lazy"
                                        />
                                      </ThumbButton>
                                    ) : null;
                                  })}
                                </ThumbGrid>
                              );
                            }

                            return null;
                          };

                          return (
                            <div
                              key={index}
                              style={{
                                position: "absolute",
                                left: layout.x,
                                top: layout.y,
                                width: layout.w,
                                height: layout.h,
                                borderRadius: "var(--border-radius-xl)",
                                overflow: "auto",
                              }}
                            >
                              {renderBlock()}
                            </div>
                          );
                        })}
                      </Canvas>
                    </div>
                  </div>
                </div>
              ) : (
                // fallback: la tua view classica attuale
                <>
                  {currentSeries.content && currentSeries.content.length > 0 ? (
                    currentSeries.content.map((block, index) => (
                      <ContentBlock
                        key={index}
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: index * 0.1 }}
                      >
                        {/* ...tuo rendering classico... */}
                      </ContentBlock>
                    ))
                  ) : (
                    <>
                      {seriesPhotos.map(photo => (
                        <ClassicFigure key={photo.id} style={{ marginBottom: "var(--spacing-4xl)" }}>
                          <img
                            src={`${IMAGES_BASE_URL}${photo.image}`}
                            alt={photo.title}
                            loading="lazy"
                            onClick={() => handlePhotoClick(photo)}
                            style={{ cursor: "pointer" }}
                          />
                          {photo.title && <figcaption>{photo.title}</figcaption>}
                        </ClassicFigure>
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </ContentSection>
      </PageContainer>

      <AnimatePresence>
        {showEditor && (
          <SeriesEditor
            series={currentSeries}
            onClose={() => setShowEditor(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {lightboxPhoto && (
          <LightboxOverlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxPhoto(null)}
          >
            <LightboxClose
              type="button"
              onClick={() => setLightboxPhoto(null)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              ✕
            </LightboxClose>
            <LightboxImage
              src={`${IMAGES_BASE_URL}${lightboxPhoto.image}`}
              alt={lightboxPhoto.title}
              onClick={(e) => e.stopPropagation()}
            />
          </LightboxOverlay>
        )}
      </AnimatePresence>
    </>
  );
}

export default SeriesDetail;
