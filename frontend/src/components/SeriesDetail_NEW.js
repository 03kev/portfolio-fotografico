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

// Styled Components
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
  flex-wrap: wrap;
`;

const AdminBarButton = styled(motion.button)`
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: var(--color-white);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--border-radius-full);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  font-size: var(--font-size-sm);

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PrimaryAdminButton = styled(AdminBarButton)`
  background: var(--primary-gradient);
  border-color: transparent;

  &:hover {
    opacity: 0.92;
  }
`;

const DangerAdminButton = styled(AdminBarButton)`
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;

  &:hover {
    background: rgba(239, 68, 68, 0.3);
  }
`;

const LayoutStage = styled.div`
  position: relative;
  min-height: 70vh;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  border-radius: var(--border-radius-xl);
  background: rgba(0, 0, 0, 0.22);
  overflow: auto;
  padding: var(--spacing-lg);
`;

const Canvas = styled.div`
  position: relative;
  width: 1200px;
  border-radius: var(--border-radius-xl);
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background-image: ${props => props.$showGrid ? `
    linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)
  ` : 'none'};
  background-size: 8px 8px;
  background-position: 0 0;
`;

const DraggableBlock = styled.div`
  position: absolute;
  border-radius: var(--border-radius-xl);
  border: 2px solid ${props => (props.$selected ? 'rgba(102, 126, 234, 0.9)' : 'rgba(255, 255, 255, 0.12)')};
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  overflow: hidden;
  touch-action: none;
  box-shadow: ${props => (props.$selected 
    ? '0 0 0 3px rgba(102, 126, 234, 0.3), 0 16px 40px rgba(0,0,0,0.4)' 
    : '0 8px 24px rgba(0,0,0,0.25)')};
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
  cursor: ${props => props.$isDragging ? 'grabbing !important' : 'grab'};

  &:hover {
    border-color: ${props => props.$selected ? 'rgba(102, 126, 234, 1)' : 'rgba(255, 255, 255, 0.2)'};
  }
`;

const DragHandle = styled.div`
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacing-md);
  cursor: grab;
  user-select: none;
  background: ${props => props.$selected ? 'rgba(102, 126, 234, 0.25)' : 'rgba(0, 0, 0, 0.6)'};
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  &:active {
    cursor: grabbing;
  }
`;

const DragLabel = styled.div`
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${props => props.$selected ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.7)'};
  font-weight: ${props => props.$selected ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)'};
`;

const DragHint = styled.div`
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
`;

const BlockBody = styled.div`
  width: 100%;
  height: calc(100% - 40px);
  overflow: auto;
  padding: var(--spacing-md);
  
  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(102, 126, 234, 0.4);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: rgba(102, 126, 234, 0.6);
  }
`;

const ResizeHandle = styled.div`
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: rgba(102, 126, 234, 0.95);
  border: 2px solid rgba(255, 255, 255, 0.8);
  z-index: 10;
  opacity: ${props => props.$visible ? 1 : 0};
  transition: opacity 0.2s ease, transform 0.1s ease;

  &:hover {
    background: rgba(102, 126, 234, 1);
    transform: scale(1.4);
  }
`;

const ClassicFigure = styled.figure`
  margin: 0;

  img {
    width: 100%;
    height: auto;
    display: block;
    border-radius: var(--border-radius-lg);
    background: rgba(255, 255, 255, 0.02);
  }

  figcaption {
    margin-top: var(--spacing-sm);
    color: rgba(255, 255, 255, 0.6);
    font-size: var(--font-size-sm);
  }
`;

const PhotoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--spacing-lg);
  margin: 0;
`;

const PhotoCard = styled(motion.button)`
  appearance: none;
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  border-radius: var(--border-radius-lg);
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  text-align: left;

  &:hover {
    border-color: rgba(255, 255, 255, 0.25);
  }
`;

const PhotoImage = styled.img`
  width: 100%;
  height: auto;
  display: block;
  background: rgba(255, 255, 255, 0.02);
`;

const LightboxOverlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.95);
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-2xl);
`;

const LightboxImage = styled.img`
  max-width: min(1400px, 92vw);
  max-height: 90vh;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--border-radius-xl);
  background: rgba(255, 255, 255, 0.02);
`;

const LightboxClose = styled(motion.button)`
  position: fixed;
  top: var(--spacing-xl);
  right: var(--spacing-xl);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.7);
  color: var(--color-white);
  font-size: 24px;
  cursor: pointer;
  z-index: 1;

  &:hover {
    background: rgba(0, 0, 0, 0.85);
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

const LayoutInfo = styled.div`
  display: flex;
  gap: var(--spacing-lg);
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  background: rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: var(--border-radius);
  color: rgba(255, 255, 255, 0.9);
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-lg);
`;

// Main Component
function SeriesDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { currentSeries, fetchSeriesBySlug, updateSeries, loading, error } = useSeries();
  const { photos } = usePhotos();
  const [showEditor, setShowEditor] = useState(false);
  const [seriesPhotos, setSeriesPhotos] = useState([]);
  const [layoutMode, setLayoutMode] = useState(false);
  const [draftContent, setDraftContent] = useState([]);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const dragStateRef = useRef(null);

  const canvasRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const CANVAS_WIDTH = 1200;
  const GRID_SIZE = 8;
  const SNAP_THRESHOLD = 6;
  const MIN_W = 200;
  const MIN_H = 120;

  const isAdmin = useAdminMode();
  const toast = useToast();

  // Load series on mount
  useEffect(() => {
    if (slug) {
      fetchSeriesBySlug(slug);
    }
  }, [slug, fetchSeriesBySlug]);

  // Filter photos for this series
  useEffect(() => {
    if (currentSeries && photos.length > 0) {
      const filteredPhotos = photos.filter(photo =>
        currentSeries.photos.includes(photo.id)
      );
      setSeriesPhotos(filteredPhotos);
    }
  }, [currentSeries, photos]);

  // Initialize draft content with defaults
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

  // Keyboard controls for layout mode
  useEffect(() => {
    if (!layoutMode || selectedIndex === null) return;

    const onKeyDown = (e) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();

      // Delete block
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const confirmed = window.confirm('Vuoi eliminare questo blocco?');
        if (confirmed) {
          setDraftContent(prev => prev.filter((_, i) => i !== selectedIndex));
          setSelectedIndex(null);
          toast.success('Blocco eliminato');
        }
        return;
      }

      // Move block with arrow keys
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
  }, [layoutMode, selectedIndex, snapEnabled, toast]);

  const getCanvasHeight = (content) => {
    const maxBottom = (content || []).reduce((max, b) => {
      const l = b?.layout;
      if (!l) return max;
      return Math.max(max, (l.y || 0) + (l.h || 0));
    }, 0);
    return Math.max(800, maxBottom + 120);
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
    if (!layoutMode) {
      setLightboxPhoto(photo);
    }
  };

  const startDrag = (index, e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIndex(index);
    setIsDragging(true);

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
    setIsDragging(true);

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

        x = clamp(x, 0, canvasW - w);
        y = clamp(y, 0, canvasH - h);

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
    setIsDragging(false);
  };

  const handleSaveLayout = async () => {
    try {
      await updateSeries(currentSeries.id, {
        ...currentSeries,
        content: draftContent,
      });
      toast.success('Layout salvato con successo! ✨');
      setLayoutMode(false);
      setSelectedIndex(null);
      if (slug) {
        fetchSeriesBySlug(slug);
      }
    } catch (err) {
      toast.error(`Errore nel salvataggio: ${err?.message || 'errore sconosciuto'}`);
    }
  };

  const handleResetLayout = () => {
    if (!currentSeries) return;
    const confirmed = window.confirm('Ripristinare il layout salvato? Le modifiche non salvate andranno perse.');
    if (confirmed) {
      // Reload from currentSeries
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
      setSelectedIndex(null);
      toast.success('Layout ripristinato');
    }
  };

  const getCoverPhoto = () => {
    if (!currentSeries) return null;
    if (currentSeries.coverImage) {
      const coverPhoto = photos.find(p => p.id === currentSeries.coverImage);
      if (coverPhoto) return coverPhoto;
    }
    return seriesPhotos[0] || null;
  };

  // Render block content
  const renderBlockContent = (block) => {
    if (block.type === 'text') {
      return (
        <TextBlock style={{ margin: 0 }}>
          <p>{block.content}</p>
        </TextBlock>
      );
    }

    if (block.type === 'photo') {
      const photo = photos.find(p => p.id === block.content);
      if (!photo) return <div style={{ color: 'rgba(255,255,255,0.5)' }}>Foto non trovata</div>;
      return (
        <ClassicFigure>
          <img
            src={`${IMAGES_BASE_URL}${photo.image}`}
            alt={photo.title}
            loading="lazy"
            onClick={() => handlePhotoClick(photo)}
            style={{ cursor: layoutMode ? 'default' : 'pointer' }}
          />
          {photo.title && <figcaption>{photo.title}</figcaption>}
        </ClassicFigure>
      );
    }

    if (block.type === 'photos') {
      return (
        <PhotoGrid>
          {block.content.map(photoId => {
            const photo = photos.find(p => p.id === photoId);
            return photo ? (
              <PhotoCard
                key={photo.id}
                type="button"
                onClick={() => handlePhotoClick(photo)}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.99 }}
              >
                <PhotoImage
                  src={`${IMAGES_BASE_URL}${photo.image}`}
                  alt={photo.title}
                  loading="lazy"
                />
              </PhotoCard>
            ) : null;
          })}
        </PhotoGrid>
      );
    }

    return null;
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
        <Error