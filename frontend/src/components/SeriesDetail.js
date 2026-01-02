import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Image as ImageIcon, Images, LayoutGrid, PencilLine, RotateCcw, Save, Trash2, X } from 'lucide-react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useSeries } from '../contexts/SeriesContext';
import { usePhotos } from '../contexts/PhotoContext';
import SeriesEditor from './SeriesEditor';
import { useToast } from './Toast';
import { IMAGES_BASE_URL } from '../utils/constants';
import useAdminMode from '../hooks/useAdminMode';

const PageContainer = styled.div`
  min-height: 100vh;
  background: transparent;
  padding-top: 0;
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
  top: calc(78px + var(--spacing-lg));
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

  @media (max-width: 768px) {
    top: calc(70px + var(--spacing-lg));
  }

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

const HeroMetaRow = styled.div`
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  margin-top: var(--spacing-md);
`;

const Pill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: var(--font-size-sm);
  color: var(--color-white);
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
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
  background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.02) 100%);
  overflow: auto;
  padding: var(--spacing-lg);
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow: 0 18px 36px rgba(0,0,0,0.28);
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
  background-size: var(--grid-step-x, 100px) var(--grid-step-y, 24px);
  background-position: 0 0;
`;

const DraggableBlock = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--border-radius-xl);
  border: 1px solid ${props => (
    props.$media
      ? 'transparent'
      : props.$plain
        ? 'transparent'
        : (props.$selected ? 'rgba(255, 255, 255, 0.40)' : 'rgba(255, 255, 255, 0.06)')
  )};
  background: ${props => (props.$media || props.$plain ? 'transparent' : 'rgba(0, 0, 0, 0.35)')};
  backdrop-filter: blur(10px);
  overflow: hidden;
  box-shadow: ${props => (
    props.$media
      ? 'none'
      : props.$plain
        ? 'none'
        : (props.$selected ? '0 0 0 2px rgba(255,255,255,0.28), 0 16px 40px rgba(0,0,0,0.35)' : '0 12px 28px rgba(0,0,0,0.28)')
  )};
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

const Inspector = styled.div`
  position: fixed;
  top: 110px;
  right: 24px;
  width: min(320px, 92vw);
  max-height: calc(100vh - 160px);
  overflow: auto;
  z-index: 9998;
  border-radius: var(--border-radius-2xl);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(14px);
  box-shadow: 0 18px 46px rgba(0,0,0,0.38);
  padding: var(--spacing-lg);
`;

const InspectorTitle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
`;

const InspectorHeading = styled.div`
  font-weight: var(--font-weight-bold);
  color: rgba(255, 255, 255, 0.92);
`;

const InspectorSmall = styled.div`
  color: rgba(255,255,255,0.55);
  font-size: var(--font-size-sm);
`;

const InspectorClose = styled.button`
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.9);
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;

  &:hover { background: rgba(255,255,255,0.12); }
`;

const InspectorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
`;

const InspectorThumb = styled.button`
  appearance: none;
  border: 2px solid ${p => (p.$active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.10)')};
  background: rgba(0,0,0,0.20);
  border-radius: 12px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  position: relative;

  &:hover { border-color: rgba(255,255,255,0.28); }
`;

const InspectorImg = styled.img`
  width: 100%;
  height: 92px;
  object-fit: cover;
  display: block;
`;

const InspectorBadge = styled.div`
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(255,255,255,0.86);
  color: rgba(0,0,0,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
`;

const InspectorDivider = styled.div`
  height: 1px;
  background: rgba(255,255,255,0.10);
  margin: var(--spacing-md) 0;
`;

const InspectorHint = styled.div`
  color: rgba(255,255,255,0.55);
  font-size: var(--font-size-sm);
  line-height: 1.5;
`;

const BlockBody = styled.div`
  width: 100%;
  height: calc(100% - 38px);
  overflow: ${p => (p.$flush ? 'hidden' : 'auto')};
  padding: ${p => (p.$flush ? '0' : 'var(--spacing-md)')};
`;

const FloatingLayoutTools = styled.div`
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
`;

const EmptyState = styled.div`
  border: 1px dashed rgba(255,255,255,0.18);
  border-radius: var(--border-radius-xl);
  padding: var(--spacing-2xl);
  color: rgba(255,255,255,0.72);
  text-align: center;
  margin: var(--spacing-xl) auto;
  max-width: 520px;
  background: rgba(255,255,255,0.04);
`;

const FabButton = styled(motion.button)`
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.60);
  color: var(--color-white);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 16px 40px rgba(0,0,0,0.35);

  &:hover { background: rgba(0, 0, 0, 0.72); }
`;

const FabMenu = styled(motion.div)`
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
`;

const FabItem = styled(motion.button)`
  border-radius: var(--border-radius-full);
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.92);
  padding: 10px 14px;
  cursor: pointer;
  font-weight: var(--font-weight-medium);
  display: inline-flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 12px 28px rgba(0,0,0,0.30);

  &:hover {
    background: rgba(0, 0, 0, 0.68);
    border-color: rgba(255, 255, 255, 0.22);
  }
`;

const FabIcon = styled.span`
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.10);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
`;

const InlineTextEditor = styled.textarea`
  width: 100%;
  height: 100%;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.68);
  font-size: var(--font-size-sm);
  line-height: 1.75;
  letter-spacing: 0.02em;
  text-transform: none;
  padding: var(--spacing-lg);
  font-family: inherit;
  box-sizing: border-box;
  overflow: auto;
`;

const SeriesText = styled.div`
  width: 100%;
  height: 100%;
  padding: var(--spacing-lg);
  color: rgba(255, 255, 255, 0.68);
  font-size: var(--font-size-sm);
  line-height: 1.75;
  letter-spacing: 0.02em;
  text-transform: none;
  white-space: pre-wrap;
  box-sizing: border-box;
  overflow: auto;

  background: transparent;
  border-radius: 0;
`;

const PhotoFrame = styled.figure`
  margin: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  align-items: center;
`;

const CanvasPhoto = styled.img`
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 0;
  object-fit: contain;
  display: block;
  border-radius: var(--border-radius-xl);
  background: transparent;
`;

const CanvasCaption = styled.figcaption`
  color: rgba(255, 255, 255, 0.6);
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-top: 10px;
  text-align: center;
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
  border: none;
  background: transparent;
  border-radius: 0;
  padding: 0;
  overflow: hidden;
  cursor: pointer;

  &:hover {
    filter: brightness(1.05);
  }
`;

const ThumbImage = styled.img`
  width: 100%;
  height: 140px;
  object-fit: contain;
  display: block;
  background: transparent;
  border-radius: var(--border-radius-lg);
`;

const ClassicFigure = styled.figure`
  margin: 0;

  img {
    width: 100%;
    height: auto;
    display: block;
    border-radius: var(--border-radius-xl);
    background: transparent;
  }

  figcaption {
    margin-top: var(--spacing-sm);
    color: rgba(255, 255, 255, 0.6);
    font-size: var(--font-size-xs);
    text-align: center;
    letter-spacing: 0.08em;
    text-transform: uppercase;
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
  const { photos } = usePhotos();
  const [showEditor, setShowEditor] = useState(false);
  const [seriesPhotos, setSeriesPhotos] = useState([]);
  const [layoutMode, setLayoutMode] = useState(false);
  const [draftContent, setDraftContent] = useState([]);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const stageRef = useRef(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);

  const CANVAS_WIDTH = 1200;
  const GRID_COLS = 12;
  const ROW_HEIGHT = 24;
  const GRID_GUTTER = 12;
  const MIN_W = 240;
  const MIN_H = 140;
  const COL_WIDTH = (CANVAS_WIDTH - GRID_GUTTER * (GRID_COLS - 1)) / GRID_COLS;
  const GRID_STEP_X = COL_WIDTH + GRID_GUTTER;
  const GRID_STEP_Y = ROW_HEIGHT + GRID_GUTTER;
  const MIN_W_COLS = Math.max(1, Math.round((MIN_W + GRID_GUTTER) / GRID_STEP_X));
  const MIN_H_ROWS = Math.max(1, Math.round((MIN_H + GRID_GUTTER) / GRID_STEP_Y));

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!currentSeries) return;

    const prepared = prepareContent(currentSeries.content || [], true);
    setDraftContent(prepared);
  }, [currentSeries]);

  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

  const createBlockId = () =>
    `block-${Math.random().toString(16).slice(2)}-${Date.now().toString(36)}`;

  const getBlockId = (block, index, assignNew) => {
    if (block.id) return block.id;
    if (block._id) return block._id;
    if (block.uid) return block.uid;
    if (assignNew) return createBlockId();
    return `block-${index}`;
  };

  const isGridLayout = (layout) => (
    layout &&
    (layout.unit === 'grid' ||
      (Number.isFinite(layout.w) && layout.w <= GRID_COLS && Number.isFinite(layout.x) && layout.x <= GRID_COLS))
  );

  const getDefaultGridSize = (type) => {
    if (type === 'text') return { w: Math.max(MIN_W_COLS, 7), h: Math.max(MIN_H_ROWS, 8) };
    if (type === 'photo') return { w: Math.max(MIN_W_COLS, 8), h: Math.max(MIN_H_ROWS, 18) };
    return { w: Math.max(MIN_W_COLS, 9), h: Math.max(MIN_H_ROWS, 14) };
  };

  const getDefaultPxSize = (type) => {
    if (type === 'text') return { w: 720, h: 220 };
    if (type === 'photo') return { w: 720, h: 520 };
    return { w: 760, h: 420 };
  };

  const pxToColPos = (px) => Math.max(0, Math.round(px / GRID_STEP_X));
  const pxToRowPos = (px) => Math.max(0, Math.round(px / GRID_STEP_Y));
  const pxToColSpan = (px) => Math.max(1, Math.round((px + GRID_GUTTER) / GRID_STEP_X));
  const pxToRowSpan = (px) => Math.max(1, Math.round((px + GRID_GUTTER) / GRID_STEP_Y));

  const clampGridLayout = (layout) => {
    const w = clamp(layout.w || MIN_W_COLS, MIN_W_COLS, GRID_COLS);
    const h = Math.max(layout.h || MIN_H_ROWS, MIN_H_ROWS);
    const x = clamp(layout.x || 0, 0, GRID_COLS - w);
    const y = Math.max(layout.y || 0, 0);
    return { x, y, w, h, unit: 'grid' };
  };

  const prepareContent = (content = [], assignIds = false) => {
    let yCursor = 0;
    const nextContent = [];

    (content || []).forEach((block, index) => {
      const id = getBlockId(block, index, assignIds);
      const defaults = getDefaultGridSize(block.type);
      const fallbackPx = getDefaultPxSize(block.type);
      const baseLayout = block.layout;
      let layout;

      if (baseLayout && isGridLayout(baseLayout)) {
        layout = {
          x: baseLayout.x ?? 0,
          y: baseLayout.y ?? yCursor,
          w: baseLayout.w ?? defaults.w,
          h: baseLayout.h ?? defaults.h,
        };
      } else if (baseLayout) {
        const xPx = typeof baseLayout.x === 'number' ? baseLayout.x : 24;
        const yPx = typeof baseLayout.y === 'number' ? baseLayout.y : yCursor * ROW_HEIGHT;
        const wPx = typeof baseLayout.w === 'number' ? baseLayout.w : fallbackPx.w;
        const hPx = typeof baseLayout.h === 'number' ? baseLayout.h : fallbackPx.h;
        layout = {
          x: pxToColPos(xPx),
          y: pxToRowPos(yPx),
          w: pxToColSpan(wPx),
          h: pxToRowSpan(hPx),
        };
      } else {
        layout = { x: 0, y: yCursor, w: defaults.w, h: defaults.h };
      }

      const clamped = clampGridLayout(layout);
      const placed = findAvailablePosition(clamped, nextContent, id);
      yCursor = Math.max(yCursor, placed.y + placed.h + 1);

      nextContent.push({ ...block, id, layout: placed });
    });

    return nextContent;
  };

  const buildGridLayout = (content = []) =>
    (content || []).map((block) => ({
      i: String(block.id),
      x: block.layout?.x ?? 0,
      y: block.layout?.y ?? 0,
      w: block.layout?.w ?? MIN_W_COLS,
      h: block.layout?.h ?? MIN_H_ROWS,
      minW: MIN_W_COLS,
      minH: MIN_H_ROWS,
    }));

  const hasGridOverlap = (layout, content, ignoreId) => {
    return (content || []).some((b) => {
      if (String(b.id) === String(ignoreId)) return false;
      const other = b.layout;
      if (!other) return false;
      return !(
        layout.x + layout.w <= other.x ||
        layout.x >= other.x + other.w ||
        layout.y + layout.h <= other.y ||
        layout.y >= other.y + other.h
      );
    });
  };

  const findAvailablePosition = (layout, content, ignoreId) => {
    let next = { ...layout };
    let guard = 200;
    while (hasGridOverlap(next, content, ignoreId) && guard > 0) {
      next = { ...next, y: next.y + 1 };
      guard -= 1;
    }
    return next;
  };

  const handlePhotoClick = (photo) => {
    setLightboxPhoto(photo);
  };

  const handleSaveLayout = async () => {
    try {
      const cleanContent = prepareContent(draftContent, true);
      await updateSeries(currentSeries.id, {
        ...currentSeries,
        content: cleanContent,
      });
      setDraftContent(cleanContent);
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
    const prepared = prepareContent(currentSeries.content || [], true);
    setDraftContent(prepared);
  };

  const getViewportInsertPoint = () => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };

    // posiziona vicino alla vista attuale
    const x = Math.max(0, Math.round(((stage.scrollLeft || 0) + 40) / GRID_STEP_X));
    const y = Math.max(0, Math.round(((stage.scrollTop || 0) + 40) / GRID_STEP_Y));
    return { x, y };
  };

  const updateTextBlock = (index, value) => {
    setDraftContent((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], content: value };
      return next;
    });
  };

  const setSelectedPhoto = (photoId) => {
    if (selectedIndex === null) return;
    setDraftContent(prev => {
      const next = [...prev];
      const b = { ...next[selectedIndex] };
      if (b.type !== 'photo') return prev;
      b.content = photoId;
      next[selectedIndex] = b;
      return next;
    });
  };

  const toggleSelectedPhotoInGroup = (photoId) => {
    if (selectedIndex === null) return;
    setDraftContent(prev => {
      const next = [...prev];
      const b = { ...next[selectedIndex] };
      if (b.type !== 'photos') return prev;
      const arr = Array.isArray(b.content) ? b.content : [];
      const has = arr.includes(photoId);
      b.content = has ? arr.filter(id => id !== photoId) : [...arr, photoId];
      next[selectedIndex] = b;
      return next;
    });
  };

  const deleteBlock = (index) => {
    setDraftContent(prev => prev.filter((_, i) => i !== index));

    setSelectedIndex(prev => {
      if (prev === null) return null;
      if (prev === index) return null;
      if (prev > index) return prev - 1;
      return prev;
    });
  };

  const addLayoutBlock = (type) => {
    if (!currentSeries) return;

    const seriesIds = Array.isArray(currentSeries.photos) ? currentSeries.photos : [];
    if ((type === 'photo' || type === 'photos') && seriesIds.length === 0) {
      toast.error('Aggiungi prima delle foto alla serie (in Seleziona Foto).');
      return;
    }

    const { x: rawX, y: rawY } = getViewportInsertPoint();

    setDraftContent((prev) => {
      const defaults = getDefaultGridSize(type);
      const id = createBlockId();
      const layout = clampGridLayout({
        x: rawX,
        y: rawY,
        w: defaults.w,
        h: defaults.h,
      });

      const block = {
        id,
        type,
        order: prev.length,
        content:
          type === 'text'
            ? 'Scrivi qui…'
            : type === 'photo'
              ? seriesIds[0]
              : seriesIds.slice(0, 12),
        layout: findAvailablePosition(layout, prev, id),
      };

      const next = [...prev, block];
      setSelectedIndex(next.length - 1);
      return next;
    });

    setQuickAddOpen(false);
  };

  const handleGridLayoutChange = (layout) => {
    const layoutById = new Map(layout.map(item => [String(item.i), item]));
    setDraftContent(prev => prev.map((block) => {
      const nextLayout = layoutById.get(String(block.id));
      if (!nextLayout) return block;
      return {
        ...block,
        layout: clampGridLayout({
          x: nextLayout.x,
          y: nextLayout.y,
          w: nextLayout.w,
          h: nextLayout.h,
        }),
      };
    }));
  };

  const handleGridDragStart = (layout, oldItem) => {
    const index = draftContent.findIndex(block => String(block.id) === String(oldItem.i));
    if (index !== -1) setSelectedIndex(index);
  };

  const handleGridResizeStart = (layout, oldItem) => {
    const index = draftContent.findIndex(block => String(block.id) === String(oldItem.i));
    if (index !== -1) setSelectedIndex(index);
  };

  const handleCanvasPointerDown = (e) => {
    if (!e.target.closest('.react-grid-item')) {
      setSelectedIndex(null);
      setQuickAddOpen(false);
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

  const viewContent = prepareContent(currentSeries?.content || [], false);

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
    currentSeries.content.some(b => b?.layout);

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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <PencilLine size={18} /> Modifica
              </span>
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} /> Contenuti
                </span>
              </AdminBarButton>

              <AdminBarButton
                type="button"
                onClick={() => setLayoutMode(v => !v)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {layoutMode ? <X size={16} /> : <LayoutGrid size={16} />}
                  {layoutMode ? 'Esci layout' : 'Layout (drag/resize)'}
                </span>
              </AdminBarButton>

              {layoutMode && (
                <>
                  <PrimaryAdminButton
                    type="button"
                    onClick={handleSaveLayout}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Save size={16} /> Salva layout
                    </span>
                  </PrimaryAdminButton>

                  <AdminBarButton
                    type="button"
                    onClick={handleResetLayout}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <RotateCcw size={16} /> Reset
                    </span>
                  </AdminBarButton>
                </>
              )}
            </AdminBar>
          )}

          {layoutMode ? (
            <LayoutStage
              ref={stageRef}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) {
                  setSelectedIndex(null);
                  setQuickAddOpen(false);
                }
              }}
            >
              <FloatingLayoutTools
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
              >
                <AnimatePresence>
                  {quickAddOpen && (
                    <FabMenu
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.18 }}
                    >
                      <FabItem type="button" onClick={() => addLayoutBlock('text')} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <FabIcon><FileText size={16} /></FabIcon> Testo
                      </FabItem>
                      <FabItem type="button" onClick={() => addLayoutBlock('photo')} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <FabIcon><ImageIcon size={16} /></FabIcon> Foto
                      </FabItem>
                      <FabItem type="button" onClick={() => addLayoutBlock('photos')} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <FabIcon><Images size={16} /></FabIcon> Gruppo
                      </FabItem>
                    </FabMenu>
                  )}
                </AnimatePresence>

                <FabButton type="button" onClick={() => setQuickAddOpen(v => !v)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <span style={{ lineHeight: 1, transform: 'translateY(-1px)' }}>
                    {quickAddOpen ? '×' : '+'}
                  </span>
                </FabButton>
              </FloatingLayoutTools>

              {selectedIndex !== null &&
                draftContent[selectedIndex] &&
                (draftContent[selectedIndex].type === 'photo' || draftContent[selectedIndex].type === 'photos') && (
                  <Inspector onPointerDown={(e) => e.stopPropagation()}>
                    <InspectorTitle>
                      <div>
                        <InspectorHeading>
                          {draftContent[selectedIndex].type === 'photo' ? 'Scegli foto' : 'Scegli foto del gruppo'}
                        </InspectorHeading>
                        <InspectorSmall>
                          {draftContent[selectedIndex].type === 'photo'
                            ? 'Clicca una miniatura per sostituire'
                            : 'Clicca per aggiungere/rimuovere'}
                        </InspectorSmall>
                      </div>
                      <InspectorClose type="button" onClick={() => setSelectedIndex(null)}>
                        ✕
                      </InspectorClose>
                    </InspectorTitle>

                    <InspectorGrid>
                      {seriesPhotos.map((p) => {
                        const isActive =
                          draftContent[selectedIndex].type === 'photo'
                            ? draftContent[selectedIndex].content === p.id
                            : (Array.isArray(draftContent[selectedIndex].content) &&
                              draftContent[selectedIndex].content.includes(p.id));

                        return (
                          <InspectorThumb
                            key={p.id}
                            type="button"
                            $active={isActive}
                            onClick={() => {
                              if (draftContent[selectedIndex].type === 'photo') setSelectedPhoto(p.id);
                              else toggleSelectedPhotoInGroup(p.id);
                            }}
                            title={p.title || ''}
                          >
                            <InspectorImg
                              src={`${IMAGES_BASE_URL}${p.thumbnail || p.image}`}
                              alt={p.title}
                              loading="lazy"
                            />
                            {isActive && <InspectorBadge>✓</InspectorBadge>}
                          </InspectorThumb>
                        );
                      })}
                    </InspectorGrid>

                    <InspectorDivider />
                    <InspectorHint>
                      Qui scegli solo tra le foto già aggiunte alla serie (in <b>Contenuti</b>).
                    </InspectorHint>
                  </Inspector>
                )}

              <Canvas
                style={{ '--grid-step-x': `${GRID_STEP_X}px`, '--grid-step-y': `${GRID_STEP_Y}px` }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handleCanvasPointerDown(e);
                }}
              >
                {draftContent.length === 0 && (
                  <EmptyState>
                    Nessun blocco ancora. Usa il pulsante + per aggiungere testo o foto e inizia a comporre la serie.
                  </EmptyState>
                )}

                <GridLayout
                  layout={buildGridLayout(draftContent)}
                  cols={GRID_COLS}
                  rowHeight={ROW_HEIGHT}
                  width={CANVAS_WIDTH}
                  margin={[GRID_GUTTER, GRID_GUTTER]}
                  containerPadding={[0, 0]}
                  isResizable
                  isDraggable
                  preventCollision
                  compactType={null}
                  isBounded
                  resizeHandles={['se', 'sw', 'ne', 'nw']}
                  draggableHandle=".series-drag-handle"
                  draggableCancel=".series-editable,textarea,input,button"
                  onLayoutChange={handleGridLayoutChange}
                  onDragStart={handleGridDragStart}
                  onResizeStart={handleGridResizeStart}
                >
                  {draftContent.map((block, index) => {
                    const isSelected = selectedIndex === index;

                    const renderBlock = () => {
                      if (block.type === 'text') {
                        return selectedIndex === index ? (
                          <SeriesText style={{ padding: 0 }}>
                            <InlineTextEditor
                              className="series-editable"
                              value={block.content}
                              onChange={(e) => updateTextBlock(index, e.target.value)}
                              placeholder="Scrivi qui…"
                            />
                          </SeriesText>
                        ) : (
                          <SeriesText>{block.content}</SeriesText>
                        );
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
                        const group = Array.isArray(block.content) ? block.content : [];
                        return (
                          <ThumbGrid>
                            {group.map(photoId => {
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
                        key={block.id}
                        $selected={isSelected}
                        $media={block.type === 'photo' || block.type === 'photos'}
                        $plain={block.type === 'text'}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedIndex(index);
                        }}
                      >
                        <DragHandle
                          className="series-drag-handle"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelectedIndex(index);
                          }}
                        >
                          <DragLabel>
                            {block.type === 'text' ? 'Testo' : block.type === 'photo' ? 'Foto' : 'Gruppo foto'}
                          </DragLabel>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <DragHint>drag • resize</DragHint>

                            {isSelected && (
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteBlock(index);
                                }}
                                style={{
                                  border: 'none',
                                  background: 'rgba(255,255,255,0.10)',
                                  color: 'rgba(255,255,255,0.92)',
                                  width: 30,
                                  height: 30,
                                  borderRadius: 999,
                                  cursor: 'pointer',
                                }}
                              title="Elimina"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        </DragHandle>

                        <BlockBody $flush={block.type === 'photo' || block.type === 'photos'}>
                          {renderBlock()}
                        </BlockBody>
                      </DraggableBlock>
                    );
                  })}
                </GridLayout>
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
                          backgroundImage: "none",
                          border: "none",
                          background: "transparent",
                          '--grid-step-x': `${GRID_STEP_X}px`,
                          '--grid-step-y': `${GRID_STEP_Y}px`,
                        }}
                      >
                        <GridLayout
                          layout={buildGridLayout(viewContent)}
                          cols={GRID_COLS}
                          rowHeight={ROW_HEIGHT}
                          width={CANVAS_WIDTH}
                          margin={[GRID_GUTTER, GRID_GUTTER]}
                          containerPadding={[0, 0]}
                          isDraggable={false}
                          isResizable={false}
                          compactType={null}
                          isBounded
                        >
                          {viewContent.map((block) => {
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
                                const group = Array.isArray(block.content) ? block.content : [];
                                return (
                                  <ThumbGrid>
                                    {group.map(photoId => {
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
                                key={block.id}
                                $media={block.type === 'photo' || block.type === 'photos'}
                                $plain={block.type === 'text'}
                              >
                                <BlockBody $flush={block.type === 'photo' || block.type === 'photos'}>
                                  {renderBlock()}
                                </BlockBody>
                              </DraggableBlock>
                            );
                          })}
                        </GridLayout>
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
