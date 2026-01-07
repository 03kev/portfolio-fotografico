import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, ChevronLeft, Code, FileText, Image as ImageIcon, Images, Italic, LayoutGrid, Maximize2, PencilLine, RotateCcw, Save, Trash2, Type, Underline, X } from 'lucide-react';
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
  overflow: ${props => (props.$floatingHandle ? 'visible' : 'hidden')};

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

const FloatingBackButton = styled(motion.button)`
  position: fixed;
  top: calc(78px + 12px);
  left: 16px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.6);
  color: rgba(255, 255, 255, 0.9);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(12px);
  cursor: pointer;
  z-index: 4;

  &:hover {
    background: rgba(0, 0, 0, 0.72);
    border-color: rgba(255, 255, 255, 0.22);
  }

  @media (max-width: 768px) {
    top: calc(70px + 12px);
    width: 40px;
    height: 40px;
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
  padding: ${p => (p.$isAdmin ? 'var(--spacing-2xl)' : 'var(--spacing-4xl)')} var(--spacing-xl) var(--spacing-4xl);
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
  position: sticky;
  top: calc(78px + 12px);
  z-index: var(--z-sticky);

  @media (max-width: 768px) {
    top: calc(70px + 12px);
  }
`;

const AdminBarButton = styled(motion.button)`
  background: rgba(30, 30, 30, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: var(--color-white);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--border-radius-full);
  font-weight: var(--font-weight-medium);
  cursor: pointer;

  &:hover {
    background: rgba(30, 30, 30, 0.75);
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
  min-height: ${props => (props.$editing ? '70vh' : 'auto')};
  border-radius: ${props => (props.$editing ? 'var(--border-radius-xl)' : '0')};
  background: ${props => (props.$editing ? 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.02) 100%)' : 'transparent')};
  overflow-x: hidden;
  overflow-y: visible;
  padding: 0;
  border: none;
  box-shadow: ${props => (props.$editing ? '0 0 0 1px rgba(255,255,255,0.06), 0 18px 36px rgba(0,0,0,0.28)' : 'none')};
  transition: background 0.2s ease, box-shadow 0.2s ease;
  touch-action: pan-y;
`;

const CanvasFrame = styled.div`
  width: 100%;
  padding: var(--spacing-lg);
  box-sizing: border-box;
  border-radius: var(--border-radius-xl);
  box-shadow: ${props => (props.$showBorder ? '0 0 0 1px rgba(255,255,255,0.08)' : 'none')};
  transition: box-shadow 0.2s ease;
`;

const Canvas = styled.div`
  position: relative;
  width: var(--canvas-width, 1200px);
  max-width: 100%;
  margin: 0 auto;
  border-radius: var(--border-radius-xl);
  background: transparent;
  z-index: 0;

  .react-grid-item {
    transition: none !important;
    overflow: visible;
    touch-action: pan-y;
  }

  .react-grid-layout {
    touch-action: pan-y;
  }

  .react-resizable-handle {
    opacity: 1;
    background-size: 6px 6px;
    padding: 0 1px 1px 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 6'%3E%3Cpath d='M6 6H0V4.2H4V0H6V6Z' fill='%23ffffff' stroke='%239b9b9b' stroke-width='0.4' stroke-linejoin='round'/%3E%3C/svg%3E");
  }

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background-image:
      linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px);
    background-size:
      var(--grid-step-x, 100px) var(--grid-step-y, 24px),
      var(--grid-step-x, 100px) var(--grid-step-y, 24px);
    background-position: 0 0, 0 0;
    background-repeat: repeat, repeat;
    opacity: ${props => (props.$showGrid ? 1 : 0)};
    transition: opacity 0.2s ease;
    pointer-events: none;
  }

  box-shadow: ${props => (props.$showGrid ? '0 0 0 1px rgba(255,255,255,0.08)' : 'none')};
  transition: box-shadow 0.2s ease;
`;

const DraggableBlock = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: ${props => (props.$media ? '0' : 'var(--border-radius-xl)')};
  border: 1px solid ${props => (
    props.$editing
      ? 'rgba(255, 255, 255, 0.08)'
      : props.$media
        ? 'transparent'
        : props.$plain
          ? 'transparent'
          : (props.$selected ? 'rgba(255, 255, 255, 0.40)' : 'rgba(255, 255, 255, 0.06)')
  )};
  background: ${props => (
    props.$editing
      ? 'rgba(255, 255, 255, 0.035)'
      : (props.$media || props.$plain ? 'transparent' : 'rgba(0, 0, 0, 0.35)')
  )};
  backdrop-filter: blur(10px);
  overflow: hidden;
  box-shadow: ${props => (
    props.$editing
      ? '0 0 0 1px rgba(255,255,255,0.06)'
      : props.$media
        ? 'none'
        : props.$plain
          ? 'none'
          : (props.$selected ? '0 0 0 2px rgba(255,255,255,0.28), 0 16px 40px rgba(0,0,0,0.35)' : '0 12px 28px rgba(0,0,0,0.28)')
  )};
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;

  &:hover .series-drag-handle {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  ${props => (props.$selected ? `
    .series-drag-handle {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
  ` : '')}
`;


const DragHandle = styled.div`
  position: absolute;
   top: ${props => (props.$floating ? '-34px' : '0')};
  left: 0;
  right: 0;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  cursor: grab;
  user-select: none;
  background: ${props => (props.$solid ? '#000' : 'rgba(0, 0, 0, 0.85)')};
  border-bottom: ${props => (props.$floating ? 'none' : (props.$solid ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.08)'))};
  border: ${props => (props.$floating ? '1px solid rgba(255, 255, 255, 0.12)' : 'none')};
  border-radius: ${props => (props.$floating ? '999px' : '0')};
  backdrop-filter: ${props => (props.$solid ? 'none' : 'blur(8px)')};
  z-index: 2;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 0.18s ease, transform 0.18s ease;
  box-shadow: ${props => (props.$floating ? '0 12px 26px rgba(0,0,0,0.35)' : 'none')};
  pointer-events: none;

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
  margin-top: -35px;
  margin-right: -10px;

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

const InspectorSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: var(--spacing-md);
`;

const InspectorLabel = styled.div`
  font-size: var(--font-size-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.55);
`;

const InspectorRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const InspectorIconButton = styled.button`
  border: 1px solid ${p => (p.$active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.16)')};
  background: ${p => (p.$active ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.35)')};
  color: rgba(255,255,255,0.9);
  width: 38px;
  height: 34px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;

  &:hover {
    background: rgba(255,255,255,0.12);
    border-color: rgba(255,255,255,0.32);
  }

  &:active {
    transform: scale(0.98);
  }
`;

const InspectorIconWrap = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const InspectorIconBadge = styled.span`
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 14px;
  height: 14px;
  border-radius: 999px;
  padding: 0 3px;
  background: rgba(255,255,255,0.85);
  color: rgba(0,0,0,0.9);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const InspectorTextSizeButton = styled(InspectorIconButton)`
  width: 46px;
  font-weight: 600;
  font-size: ${p => p.$preview || 'var(--font-size-sm)'};
`;

const InspectorFontButton = styled(InspectorIconButton)`
  width: auto;
  min-width: 88px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
  font-family: ${p => p.$font || 'inherit'};
`;

const BlockBody = styled.div`
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 0;
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
  font-size: ${props => props.$size || 'var(--font-size-sm)'};
  font-weight: ${props => (props.$bold ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)')};
  font-style: ${props => (props.$italic ? 'italic' : 'normal')};
  text-decoration: ${props => (props.$underline ? 'underline' : 'none')};
  line-height: 1.75;
  letter-spacing: 0.02em;
  text-transform: none;
  text-align: ${props => props.$align || 'left'};
  text-align-last: ${props => props.$alignLast || 'auto'};
  padding: var(--spacing-sm);
  font-family: ${props => (
    props.$mono
      ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
      : (props.$font || 'inherit')
  )};
  box-sizing: border-box;
  overflow: auto;

  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
`;

const SeriesText = styled.div`
  width: 100%;
  height: 100%;
  color: rgba(255, 255, 255, 0.68);
  font-size: ${props => props.$size || 'var(--font-size-sm)'};
  font-weight: ${props => (props.$bold ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)')};
  font-style: ${props => (props.$italic ? 'italic' : 'normal')};
  text-decoration: ${props => (props.$underline ? 'underline' : 'none')};
  line-height: 1.75;
  letter-spacing: 0.02em;
  text-transform: none;
  text-align: ${props => props.$align || 'left'};
  text-align-last: ${props => props.$alignLast || 'auto'};
  white-space: pre-wrap;
  box-sizing: border-box;
  overflow: hidden;
  font-family: ${props => (
    props.$mono
      ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
      : (props.$font || 'inherit')
  )};

  background: transparent;
  border-radius: 0;
  padding: var(--spacing-sm);
`;

const PhotoFrame = styled.figure`
  margin: 0;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 0;
  padding: 0;
  align-items: stretch;
`;

const PhotoMedia = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  grid-row: 1 / 2;
  overflow: hidden;
`;

const CanvasPhoto = styled.img`
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  object-position: center;
  display: block;
  border-radius: 0;
  background: transparent;
`;

const PhotoClickArea = styled.button`
  position: absolute;
  inset: 0;
  border: none;
  padding: 0;
  margin: 0;
  background: transparent;
  cursor: default;
`;

const CanvasCaption = styled.figcaption`
  color: rgba(255, 255, 255, 0.6);
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-top: 10px;
  text-align: center;
`;

const GroupGrid = styled.div`
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: ${props => (props.$editing ? 'rgba(255,255,255,0.03)' : 'transparent')};
  display: ${props => (props.$editing ? 'block' : 'grid')};
  grid-template-columns: repeat(var(--group-cols, 1), minmax(0, 1fr));
  grid-template-rows: repeat(var(--group-rows, 1), var(--group-row-height, 16px));
  gap: var(--group-gap, 8px);
  align-content: start;
`;

const GroupItem = styled.div`
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 0;
  background: ${props => (props.$editing ? 'rgba(0,0,0,0.32)' : 'transparent')};
`;

const ThumbButton = styled.button`
  appearance: none;
  border: none;
  background: transparent;
  border-radius: 0;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  width: 100%;
  height: 100%;
  display: block;
`;

const ThumbImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: transparent;
  border-radius: 0;
  transition: filter 0.18s ease, transform 0.18s ease;
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
  const canvasFrameRef = useRef(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [gridRowsOverride, setGridRowsOverride] = useState(null);
  const CANVAS_MAX_WIDTH = 1200;
  const [canvasWidth, setCanvasWidth] = useState(CANVAS_MAX_WIDTH);
  const GRID_VERSION = 2;
  const GRID_COLS = 24;
  const ROW_HEIGHT = 16;
  const GRID_GUTTER = 8;
  const BASE_GRID_ROWS = 24;
  const GRID_ROW_BUFFER = 6;
  const TEXT_MIN_H_ROWS = 2;
  const TEXT_SIZE_MAP = {
    sm: 'var(--font-size-sm)',
    base: 'calc(var(--font-size-base) - 0.5px)',
    lg: 'var(--font-size-lg)',
    xl: 'var(--font-size-xl)',
  };
  const TEXT_FONT_MAP = {
    inter: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    manrope: "'Manrope', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    playfair: "'Playfair Display', 'Times New Roman', serif",
    source: "'Source Serif 4', 'Times New Roman', serif",
  };
  const TEXT_SIZE_OPTIONS = [
    { id: 'sm', label: 'A', size: TEXT_SIZE_MAP.sm, title: 'Piccolo' },
    { id: 'base', label: 'A', size: TEXT_SIZE_MAP.base, title: 'Normale' },
    { id: 'lg', label: 'A', size: TEXT_SIZE_MAP.lg, title: 'Grande' },
    { id: 'xl', label: 'A', size: TEXT_SIZE_MAP.xl, title: 'Extra' },
  ];
  const TEXT_FONT_OPTIONS = [
    { id: 'inter', label: 'Inter', family: TEXT_FONT_MAP.inter },
    { id: 'manrope', label: 'Manrope', family: TEXT_FONT_MAP.manrope },
    { id: 'playfair', label: 'Playfair', family: TEXT_FONT_MAP.playfair },
    { id: 'source', label: 'Source Serif', family: TEXT_FONT_MAP.source },
  ];
  const TEXT_ALIGN_OPTIONS = [
    { id: 'left', icon: AlignLeft, label: 'Allinea a sinistra' },
    { id: 'center', icon: AlignCenter, label: 'Allinea al centro' },
    { id: 'right', icon: AlignRight, label: 'Allinea a destra' },
    { id: 'justify', icon: AlignJustify, label: 'Giustifica' },
    { id: 'justify-center', icon: AlignJustify, label: 'Giustifica al centro', badge: 'C' },
    { id: 'justify-right', icon: AlignJustify, label: 'Giustifica a destra', badge: 'R' },
  ];
  const TEXT_STYLE_OPTIONS = [
    { id: 'textBold', icon: Bold, label: 'Grassetto' },
    { id: 'textItalic', icon: Italic, label: 'Corsivo' },
    { id: 'textUnderline', icon: Underline, label: 'Sottolineato' },
    { id: 'textMono', icon: Code, label: 'Monospace' },
  ];
  const GROUP_GRID_VERSION = 2;
  const LEGACY_GROUP_COLS = 6;
  const LEGACY_GROUP_ROW_HEIGHT = 70;
  const LEGACY_GROUP_GUTTER = 8;
  const GROUP_MIN_W = 1;
  const GROUP_MIN_H = 1;
  const GROUP_DEFAULT_W = 2;
  const GROUP_DEFAULT_H = 2;
  const LEGACY_GRID_COLS = 12;
  const LEGACY_ROW_HEIGHT = 24;
  const LEGACY_GRID_GUTTER = 12;
  const MIN_W = 240;
  const MIN_H = 140;
  const COL_WIDTH = (canvasWidth - GRID_GUTTER * (GRID_COLS - 1)) / GRID_COLS;
  const GRID_STEP_X = COL_WIDTH + GRID_GUTTER;
  const GRID_STEP_Y = ROW_HEIGHT + GRID_GUTTER;
  const LEGACY_COL_WIDTH =
    (canvasWidth - LEGACY_GRID_GUTTER * (LEGACY_GRID_COLS - 1)) / LEGACY_GRID_COLS;
  const LEGACY_STEP_X = LEGACY_COL_WIDTH + LEGACY_GRID_GUTTER;
  const LEGACY_STEP_Y = LEGACY_ROW_HEIGHT + LEGACY_GRID_GUTTER;
  const GRID_SCALE_X = LEGACY_STEP_X / GRID_STEP_X;
  const GRID_SCALE_Y = LEGACY_STEP_Y / GRID_STEP_Y;
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

  useLayoutEffect(() => {
    const container = canvasFrameRef.current;
    if (!container) return;

    const updateWidth = () => {
      const styles = window.getComputedStyle(container);
      const paddingX =
        parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
      const innerWidth = container.clientWidth - paddingX;
      if (Number.isFinite(innerWidth) && innerWidth > 0) {
        setCanvasWidth(Math.min(CANVAS_MAX_WIDTH, innerWidth));
      }
    };

    updateWidth();

    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateWidth());
      observer.observe(container);
    } else {
      window.addEventListener('resize', updateWidth);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener('resize', updateWidth);
      }
    };
  }, [layoutMode, CANVAS_MAX_WIDTH, currentSeries]);

  useLayoutEffect(() => {
    if (layoutMode) {
      setSelectedId(null);
      setQuickAddOpen(false);
    }
  }, [layoutMode]);

  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

  const getBlockMinRows = (type) => (type === 'text' ? TEXT_MIN_H_ROWS : MIN_H_ROWS);

  const scaleGridLayout = (layout, scaleX, scaleY) => ({
    x: Math.max(0, Math.round((layout.x ?? 0) * scaleX)),
    y: Math.max(0, Math.round((layout.y ?? 0) * scaleY)),
    w: Math.max(1, Math.round((layout.w ?? MIN_W_COLS) * scaleX)),
    h: Math.max(1, Math.round((layout.h ?? MIN_H_ROWS) * scaleY)),
  });

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

  const getDefaultPxSize = (type) => {
    if (type === 'text') return { w: 720, h: 220 };
    if (type === 'photo') return { w: 720, h: 520 };
    return { w: 760, h: 420 };
  };

  const getDefaultGridSize = (type) => {
    const fallbackPx = getDefaultPxSize(type);
    return {
      w: Math.max(MIN_W_COLS, pxToColSpan(fallbackPx.w)),
      h: Math.max(MIN_H_ROWS, pxToRowSpan(fallbackPx.h)),
    };
  };

  const pxToColPos = (px) => Math.max(0, Math.round(px / GRID_STEP_X));
  const pxToRowPos = (px) => Math.max(0, Math.round(px / GRID_STEP_Y));
  const pxToColSpan = (px) => Math.max(1, Math.round((px + GRID_GUTTER) / GRID_STEP_X));
  const pxToRowSpan = (px) => Math.max(1, Math.round((px + GRID_GUTTER) / GRID_STEP_Y));

  const clampGridLayout = (layout, minRows = MIN_H_ROWS) => {
    const w = clamp(layout.w || MIN_W_COLS, MIN_W_COLS, GRID_COLS);
    const h = Math.max(layout.h || minRows, minRows);
    const x = clamp(layout.x || 0, 0, GRID_COLS - w);
    const y = Math.max(layout.y || 0, 0);
    return { x, y, w, h, unit: 'grid', gridVersion: GRID_VERSION };
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
        const base = {
          x: baseLayout.x ?? 0,
          y: baseLayout.y ?? yCursor,
          w: baseLayout.w ?? defaults.w,
          h: baseLayout.h ?? defaults.h,
        };
        const version = baseLayout.gridVersion ?? 1;
        layout = version === GRID_VERSION
          ? base
          : scaleGridLayout(base, GRID_SCALE_X, GRID_SCALE_Y);
      } else if (baseLayout) {
        const xPx = typeof baseLayout.x === 'number' ? baseLayout.x : 24;
        const yPx = typeof baseLayout.y === 'number' ? baseLayout.y : yCursor * GRID_STEP_Y;
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

      const clamped = clampGridLayout(layout, getBlockMinRows(block.type));
      const placed = findAvailablePosition(clamped, nextContent, id);
      yCursor = Math.max(yCursor, placed.y + placed.h + 1);

      const nextBlock = { ...block, id, layout: placed };
      if (block.type === 'photo' && typeof block.showTitle !== 'boolean') {
        nextBlock.showTitle = true;
      }
      if (block.type === 'photo' && typeof block.showLightbox !== 'boolean') {
        nextBlock.showLightbox = true;
      }
      if (block.type === 'photos') {
        nextBlock.content = prepareGroupItems(block.content || [], nextBlock.layout);
      }
      if (block.type === 'text') {
        nextBlock.content = typeof nextBlock.content === 'string' ? nextBlock.content : '';
        if (nextBlock.content === 'Scrivi qui…') {
          nextBlock.content = '';
        }
        nextBlock.textAlign = nextBlock.textAlign || 'left';
        nextBlock.textSize = nextBlock.textSize || 'base';
        nextBlock.textBold = Boolean(nextBlock.textBold);
        nextBlock.textItalic = Boolean(nextBlock.textItalic);
        nextBlock.textUnderline = Boolean(nextBlock.textUnderline);
        nextBlock.textMono = Boolean(nextBlock.textMono);
        nextBlock.textFont = nextBlock.textFont || 'inter';
      }
      nextContent.push(nextBlock);
    });

    return nextContent;
  };

  const buildGridLayout = (content = []) =>
    (content || []).map((block) => {
      const baseMinRows = getBlockMinRows(block.type);
      let minCols = MIN_W_COLS;
      let minRows = baseMinRows;

      if (block.type === 'photos') {
        const required = getGroupContentMinSize(block);
        minCols = Math.min(GRID_COLS, Math.max(minCols, required.minCols));
        minRows = Math.max(minRows, required.minRows);
      }

      const clamped = clampGridLayout({
        x: block.layout?.x ?? 0,
        y: block.layout?.y ?? 0,
        w: block.layout?.w ?? MIN_W_COLS,
        h: block.layout?.h ?? minRows,
      }, minRows);

      let w = clamped.w;
      let h = clamped.h;
      let x = clamped.x;
      const y = clamped.y;

      if (block.type === 'photos') {
        w = Math.min(GRID_COLS, Math.max(w, minCols));
        h = Math.max(h, minRows);
        x = clamp(x, 0, GRID_COLS - w);
      }

      return {
        i: String(block.id),
        x,
        y,
        w,
        h,
        minW: minCols,
        minH: minRows,
      };
    });

  const getBlockPixelWidth = (layout) => {
    const w = layout?.w ?? MIN_W_COLS;
    return Math.round(COL_WIDTH * w + Math.max(0, w - 1) * GRID_GUTTER);
  };

  const getBlockPixelHeight = (layout) => {
    const h = layout?.h ?? MIN_H_ROWS;
    return Math.round(ROW_HEIGHT * h + Math.max(0, h - 1) * GRID_GUTTER);
  };

  const getGroupCols = (layout) =>
    Math.max(GROUP_MIN_W, layout?.w ?? LEGACY_GROUP_COLS);

  const getGroupRows = (layout) =>
    Math.max(GROUP_MIN_H, layout?.h ?? GROUP_DEFAULT_H);

  const getGroupMinCols = (groupCols) =>
    Math.max(GROUP_MIN_W, Math.min(groupCols || LEGACY_GROUP_COLS, MIN_W_COLS));

  const getGroupMinRows = (groupRows) =>
    Math.max(GROUP_MIN_H, Math.min(groupRows || GROUP_DEFAULT_H, MIN_H_ROWS));

  const getGroupContentMinSize = (block) => {
    const items = prepareGroupItems(block.content || [], block.layout);
    let maxCols = GROUP_MIN_W;
    let maxRows = GROUP_MIN_H;

    items.forEach((item) => {
      const layout = item.layout || {};
      const w = layout.w ?? GROUP_DEFAULT_W;
      const h = layout.h ?? GROUP_DEFAULT_H;
      const x = layout.x ?? 0;
      const y = layout.y ?? 0;
      maxCols = Math.max(maxCols, x + w);
      maxRows = Math.max(maxRows, y + h);
    });

    return { minCols: maxCols, minRows: maxRows };
  };

  const getLegacyGroupColWidth = (width) =>
    (width - LEGACY_GROUP_GUTTER * (LEGACY_GROUP_COLS - 1)) / LEGACY_GROUP_COLS;

  const scaleLegacyGroupLayout = (layout, groupWidth) => {
    const legacyColWidth = getLegacyGroupColWidth(groupWidth);
    const legacyStepX = legacyColWidth + LEGACY_GROUP_GUTTER;
    const legacyStepY = LEGACY_GROUP_ROW_HEIGHT + LEGACY_GROUP_GUTTER;
    const xPx = (layout.x ?? 0) * legacyStepX;
    const yPx = (layout.y ?? 0) * legacyStepY;
    const wPx = (layout.w ?? GROUP_DEFAULT_W) * legacyStepX - LEGACY_GROUP_GUTTER;
    const hPx = (layout.h ?? GROUP_DEFAULT_H) * legacyStepY - LEGACY_GROUP_GUTTER;

    return {
      x: Math.max(0, Math.round(xPx / GRID_STEP_X)),
      y: Math.max(0, Math.round(yPx / GRID_STEP_Y)),
      w: Math.max(1, Math.round((wPx + GRID_GUTTER) / GRID_STEP_X)),
      h: Math.max(1, Math.round((hPx + GRID_GUTTER) / GRID_STEP_Y)),
      gridVersion: GROUP_GRID_VERSION,
    };
  };

  const buildGroupLayout = (items = [], groupCols, groupRows) =>
    (items || []).map((item) => {
      const minCols = getGroupMinCols(groupCols);
      const minRows = getGroupMinRows(groupRows);
      const clamped = clampGroupLayout({
        x: item.layout?.x ?? 0,
        y: item.layout?.y ?? 0,
        w: item.layout?.w ?? GROUP_DEFAULT_W,
        h: item.layout?.h ?? GROUP_DEFAULT_H,
      }, groupCols, groupRows);

      return {
        i: String(item.id),
        x: clamped.x,
        y: clamped.y,
        w: clamped.w,
        h: clamped.h,
        minW: minCols,
        minH: minRows,
        maxW: groupCols,
        maxH: groupRows,
      };
    });

  const getGridRows = (content = []) => {
    let maxRow = 0;
    (content || []).forEach((block) => {
      const layout = block.layout || {};
      const end = (layout.y ?? 0) + (layout.h ?? MIN_H_ROWS);
      if (end > maxRow) maxRow = end;
    });
    return Math.max(BASE_GRID_ROWS, maxRow);
  };

  const bumpGridRows = (rows) => {
    setGridRowsOverride((prev) => {
      if (prev === null) return rows;
      return rows > prev ? rows : prev;
    });
  };

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

  const getGroupItemId = (item, index) => {
    if (item && typeof item === 'object') {
      return item.id ?? item.photoId ?? item._id ?? item.uid ?? item;
    }
    return item ?? `photo-${index}`;
  };

  const clampGroupLayout = (layout, groupCols, groupRows) => {
    const maxCols = Math.max(GROUP_MIN_W, groupCols || LEGACY_GROUP_COLS);
    const maxRows = Math.max(GROUP_MIN_H, groupRows || GROUP_DEFAULT_H);
    const minCols = getGroupMinCols(maxCols);
    const minRows = getGroupMinRows(maxRows);
    const w = clamp(layout.w || GROUP_DEFAULT_W, minCols, maxCols);
    const h = clamp(layout.h || GROUP_DEFAULT_H, minRows, maxRows);
    const x = clamp(layout.x || 0, 0, maxCols - w);
    const maxRow = typeof maxRows === 'number' ? Math.max(0, maxRows - h) : null;
    const y = maxRow === null ? Math.max(layout.y || 0, 0) : clamp(layout.y || 0, 0, maxRow);
    return { x, y, w, h, gridVersion: GROUP_GRID_VERSION };
  };

  const hasGroupOverlap = (layout, items, ignoreId) => {
    return (items || []).some((b) => {
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

  const findAvailableGroupPosition = (layout, items, ignoreId, groupCols = null, groupRows = null, startFromTop = false) => {
    const next = { ...layout };
    const maxCols = Math.max(GROUP_MIN_W, groupCols || LEGACY_GROUP_COLS);
    const maxRows = Math.max(GROUP_MIN_H, groupRows || GROUP_DEFAULT_H);
    const maxX = Math.max(0, maxCols - next.w);
    const maxY = Math.max(0, maxRows - next.h);

    const isInside = (candidate) =>
      candidate.x >= 0 && candidate.x <= maxX && candidate.y >= 0 && candidate.y <= maxY;

    if (!startFromTop && isInside(next) && !hasGroupOverlap(next, items, ignoreId)) {
      return next;
    }

    const yStart = startFromTop ? 0 : Math.max(0, next.y);
    for (let y = yStart; y <= maxY; y += 1) {
      for (let x = 0; x <= maxX; x += 1) {
        const candidate = { ...next, x, y };
        if (!hasGroupOverlap(candidate, items, ignoreId)) {
          return candidate;
        }
      }
    }

    return null;
  };

  const prepareGroupItems = (content = [], blockLayout) => {
    const groupCols = getGroupCols(blockLayout);
    const groupRows = getGroupRows(blockLayout);
    const groupWidth = getBlockPixelWidth(blockLayout);
    let yCursor = 0;
    const items = [];

    (content || []).forEach((item, index) => {
      const id = getGroupItemId(item, index);
      if (id === undefined || id === null) return;
      const base = item && typeof item === 'object' ? { ...item } : {};
      const baseLayout = base.layout || null;
      const fallbackLayout = {
        x: 0,
        y: yCursor,
        w: GROUP_DEFAULT_W,
        h: GROUP_DEFAULT_H,
      };
      const layout = baseLayout
        ? {
          x: baseLayout.x ?? 0,
          y: baseLayout.y ?? yCursor,
          w: baseLayout.w ?? GROUP_DEFAULT_W,
          h: baseLayout.h ?? GROUP_DEFAULT_H,
          gridVersion: baseLayout.gridVersion,
        }
        : fallbackLayout;
      const normalized = baseLayout && layout.gridVersion !== GROUP_GRID_VERSION
        ? scaleLegacyGroupLayout(layout, groupWidth)
        : layout;

      const clamped = clampGroupLayout(normalized, groupCols, groupRows);
      const placed = findAvailableGroupPosition(clamped, items, id, groupCols, groupRows, false) || clamped;
      yCursor = Math.max(yCursor, placed.y + placed.h + 1);
      items.push({ ...base, id, layout: placed });
    });

    return items;
  };

  const handlePhotoClick = (photo) => {
    setLightboxPhoto(photo);
  };

  const getContainedImageRect = (img) => {
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const { naturalWidth, naturalHeight } = img;
    if (!naturalWidth || !naturalHeight || rect.width === 0 || rect.height === 0) {
      return rect;
    }
    const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const displayW = naturalWidth * scale;
    const displayH = naturalHeight * scale;
    const offsetX = (rect.width - displayW) / 2;
    const offsetY = (rect.height - displayH) / 2;
    return {
      left: rect.left + offsetX,
      right: rect.left + offsetX + displayW,
      top: rect.top + offsetY,
      bottom: rect.top + offsetY + displayH,
    };
  };

  const isPointerOverImage = (event, img) => {
    const rect = getContainedImageRect(img);
    if (!rect) return false;
    const { clientX, clientY } = event;
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  };

  const handlePhotoClickGuarded = (event, photo, img) => {
    if (event?.clientX === 0 && event?.clientY === 0) {
      handlePhotoClick(photo);
      return;
    }
    if (isPointerOverImage(event, img)) {
      handlePhotoClick(photo);
    }
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

  const updateTextBlockStyle = (index, updates) => {
    setDraftContent((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const togglePhotoTitle = (index) => {
    setDraftContent((prev) => {
      const next = [...prev];
      const block = next[index];
      if (!block || block.type !== 'photo') return prev;
      next[index] = { ...block, showTitle: !block.showTitle };
      return next;
    });
  };

  const togglePhotoLightbox = (index) => {
    setDraftContent((prev) => {
      const next = [...prev];
      const block = next[index];
      if (!block || block.type !== 'photo') return prev;
      next[index] = { ...block, showLightbox: !block.showLightbox };
      return next;
    });
  };

  const setSelectedPhoto = (photoId) => {
    if (selectedId === null) return;
    setDraftContent(prev => {
      const index = prev.findIndex(block => String(block.id) === String(selectedId));
      if (index === -1) return prev;
      const next = [...prev];
      const b = { ...next[index] };
      if (b.type !== 'photo') return prev;
      b.content = photoId;
      next[index] = b;
      return next;
    });
  };

  const toggleSelectedPhotoInGroup = (photoId) => {
    if (selectedId === null) return;
    setDraftContent(prev => {
      const index = prev.findIndex(block => String(block.id) === String(selectedId));
      if (index === -1) return prev;
      const next = [...prev];
      const b = { ...next[index] };
      if (b.type !== 'photos') return prev;
      const items = prepareGroupItems(b.content || [], b.layout);
      const ids = items.map(item => item.id);
      const has = ids.includes(photoId);
      let nextItems = items;
      if (has) {
        nextItems = items.filter(item => item.id !== photoId);
      } else {
        const yCursor = items.reduce(
          (max, item) => Math.max(max, item.layout.y + item.layout.h + 1),
          0
        );
        const groupCols = getGroupCols(b.layout);
        const groupRows = getGroupRows(b.layout);
        const baseLayout = clampGroupLayout(
          { x: 0, y: yCursor, w: GROUP_DEFAULT_W, h: GROUP_DEFAULT_H },
          groupCols,
          groupRows
        );
        const layout = findAvailableGroupPosition(baseLayout, items, photoId, groupCols, groupRows, true);
        if (!layout) {
          toast.error('Nessuno spazio disponibile nel gruppo foto.');
          return prev;
        }
        nextItems = [...items, { id: photoId, layout }];
      }
      b.content = nextItems;
      next[index] = b;
      return next;
    });
  };

  const handleGroupLayoutChange = (blockIndex, groupCols, groupRows) => (layout) => {
    const layoutById = new Map(layout.map(item => [String(item.i), item]));
    setDraftContent((prev) => {
      const next = [...prev];
      const block = next[blockIndex];
      if (!block || block.type !== 'photos') return prev;
      const items = prepareGroupItems(block.content || [], block.layout);
      const updated = items.map((item) => {
        const nextLayout = layoutById.get(String(item.id));
        if (!nextLayout) return item;
        return {
          ...item,
          layout: clampGroupLayout({
            x: nextLayout.x,
            y: nextLayout.y,
            w: nextLayout.w,
            h: nextLayout.h,
          }, groupCols, groupRows),
        };
      });
      next[blockIndex] = { ...block, content: updated };
      return next;
    });
  };

  const deleteBlock = (blockId) => {
    setDraftContent(prev => prev.filter(block => String(block.id) !== String(blockId)));
    setSelectedId(prev => (String(prev) === String(blockId) ? null : prev));
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
      const minRows = getBlockMinRows(type);
      const layout = clampGridLayout({
        x: rawX,
        y: rawY,
        w: defaults.w,
        h: defaults.h,
      }, minRows);

      const block = {
        id,
        type,
        order: prev.length,
        content:
          type === 'text'
            ? ''
            : type === 'photo'
              ? seriesIds[0]
              : [],
        layout: findAvailablePosition(layout, prev, id),
      };
      if (type === 'text') {
        block.textAlign = 'left';
        block.textSize = 'base';
        block.textBold = false;
        block.textItalic = false;
        block.textUnderline = false;
        block.textMono = false;
        block.textFont = 'inter';
      }
      if (type === 'photo') {
        block.showTitle = true;
        block.showLightbox = true;
      }

      const next = [...prev, block];
      setSelectedId(id);
      return next;
    });

    setQuickAddOpen(false);
  };

  const handleGridLayoutChange = (layout) => {
    const layoutById = new Map(layout.map(item => [String(item.i), item]));
    setDraftContent(prev => prev.map((block) => {
      const nextLayout = layoutById.get(String(block.id));
      if (!nextLayout) return block;
      const minRows = getBlockMinRows(block.type);
      return {
        ...block,
        layout: clampGridLayout({
          x: nextLayout.x,
          y: nextLayout.y,
          w: nextLayout.w,
          h: nextLayout.h,
        }, minRows),
      };
    }));
  };

  const handleGridDragStart = (layout, oldItem) => {
    setSelectedId(oldItem.i);
    bumpGridRows(getGridRows(draftContent) + GRID_ROW_BUFFER);
  };

  const handleGridDrag = (layout, oldItem, newItem) => {
    bumpGridRows(Math.max(BASE_GRID_ROWS, newItem.y + newItem.h + GRID_ROW_BUFFER));
  };

  const handleGridDragStop = () => {
    setGridRowsOverride(null);
  };

  const handleGridResizeStart = (layout, oldItem) => {
    setSelectedId(oldItem.i);
    bumpGridRows(getGridRows(draftContent) + GRID_ROW_BUFFER);
  };

  const handleGridResize = (layout, oldItem, newItem) => {
    bumpGridRows(Math.max(BASE_GRID_ROWS, newItem.y + newItem.h + GRID_ROW_BUFFER));
  };

  const handleGridResizeStop = () => {
    setGridRowsOverride(null);
  };

  const handleCanvasPointerDown = (e) => {
    if (!e.target.closest('.react-grid-item')) {
      setSelectedId(null);
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
  const renderContent = layoutMode ? draftContent : viewContent;
  const selectedIndex = selectedId !== null
    ? draftContent.findIndex(block => String(block.id) === String(selectedId))
    : -1;
  const selectedBlock = selectedIndex >= 0 ? draftContent[selectedIndex] : null;
  const selectedGroupIds =
    selectedBlock?.type === 'photos'
      ? prepareGroupItems(selectedBlock.content || [], selectedBlock.layout).map(item => item.id)
      : [];
  const gridRows = layoutMode
    ? Math.max(getGridRows(draftContent), gridRowsOverride || 0)
    : getGridRows(viewContent);
  const gridCanvasHeight = gridRows * GRID_STEP_Y - GRID_GUTTER;

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
        <FloatingBackButton
          onClick={() => navigate('/')}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          aria-label="Torna indietro"
        >
          <ChevronLeft size={20} />
        </FloatingBackButton>
        <HeroSection>
          {coverPhoto && (
            <CoverImage
              src={`${IMAGES_BASE_URL}${coverPhoto.image}`}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.5 }}
            />
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
          </HeroContent>
        </HeroSection>

        <ContentSection $isAdmin={isAdmin}>

          {isAdmin && (
            <AdminBar>
              <AdminBarButton
                type="button"
                onClick={() => setShowEditor(true)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <PencilLine size={16} /> Modifica
                </span>
              </AdminBarButton>

              <AdminBarButton
                type="button"
                onClick={() => {
                  if (!layoutMode) {
                    setSelectedId(null);
                    setQuickAddOpen(false);
                  }
                  setLayoutMode(v => !v);
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {layoutMode ? <X size={16} /> : <LayoutGrid size={16} />}
                  {layoutMode ? 'Esci layout' : 'Layout'}
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

          {layoutMode || hasSavedLayout ? (
            <LayoutStage
              ref={stageRef}
              $editing={layoutMode}
              onPointerDown={(e) => {
                if (!layoutMode) return;
                if (e.target === e.currentTarget) {
                  setSelectedId(null);
                  setQuickAddOpen(false);
                }
              }}
            >
              {layoutMode && (
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
              )}

              {layoutMode && selectedBlock && (
                <Inspector onPointerDown={(e) => e.stopPropagation()}>
                  <InspectorTitle>
                    <div>
                      <InspectorHeading>
                        {selectedBlock.type === 'text'
                          ? 'Formato testo'
                          : selectedBlock.type === 'photo'
                            ? 'Scegli foto'
                            : 'Scegli foto del gruppo'}
                      </InspectorHeading>
                      <InspectorSmall>
                        {selectedBlock.type === 'text'
                          ? 'Allineamento e dimensione del testo'
                          : selectedBlock.type === 'photo'
                            ? 'Clicca una miniatura per sostituire'
                            : 'Clicca per aggiungere/rimuovere'}
                      </InspectorSmall>
                    </div>
                    <InspectorClose type="button" onClick={() => setSelectedId(null)}>
                      ✕
                    </InspectorClose>
                  </InspectorTitle>

                  {selectedBlock.type === 'text' ? (
                    <>
                      <InspectorSection>
                        <InspectorLabel>Dimensione</InspectorLabel>
                        <InspectorRow>
                          {TEXT_SIZE_OPTIONS.map((option) => (
                            <InspectorTextSizeButton
                              key={option.id}
                              type="button"
                              $active={(selectedBlock.textSize || 'base') === option.id}
                              $preview={option.size}
                              onClick={() => updateTextBlockStyle(selectedIndex, { textSize: option.id })}
                              title={option.title}
                            >
                              {option.label}
                            </InspectorTextSizeButton>
                          ))}
                        </InspectorRow>
                      </InspectorSection>

                      <InspectorSection>
                        <InspectorLabel>Font</InspectorLabel>
                        <InspectorRow>
                          {TEXT_FONT_OPTIONS.map((option) => (
                            <InspectorFontButton
                              key={option.id}
                              type="button"
                              $active={(selectedBlock.textFont || 'inter') === option.id}
                              $font={option.family}
                              onClick={() => updateTextBlockStyle(selectedIndex, { textFont: option.id, textMono: false })}
                              title={option.label}
                            >
                              {option.label}
                            </InspectorFontButton>
                          ))}
                        </InspectorRow>
                      </InspectorSection>

                      <InspectorSection>
                        <InspectorLabel>Stile</InspectorLabel>
                        <InspectorRow>
                          {TEXT_STYLE_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            const isActive = Boolean(selectedBlock[option.id]);
                            return (
                              <InspectorIconButton
                                key={option.id}
                                type="button"
                                $active={isActive}
                                onClick={() => updateTextBlockStyle(selectedIndex, { [option.id]: !isActive })}
                                title={option.label}
                              >
                                <InspectorIconWrap>
                                  <Icon size={18} />
                                </InspectorIconWrap>
                              </InspectorIconButton>
                            );
                          })}
                        </InspectorRow>
                      </InspectorSection>

                      <InspectorSection>
                        <InspectorLabel>Allineamento</InspectorLabel>
                        <InspectorRow>
                          {TEXT_ALIGN_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            return (
                              <InspectorIconButton
                                key={option.id}
                                type="button"
                                $active={(selectedBlock.textAlign || 'left') === option.id}
                                onClick={() => updateTextBlockStyle(selectedIndex, { textAlign: option.id })}
                                title={option.label}
                              >
                                <InspectorIconWrap>
                                  <Icon size={18} />
                                  {option.badge && (
                                    <InspectorIconBadge>{option.badge}</InspectorIconBadge>
                                  )}
                                </InspectorIconWrap>
                              </InspectorIconButton>
                            );
                          })}
                        </InspectorRow>
                      </InspectorSection>
                    </>
                  ) : (
                    <>
                      <InspectorGrid>
                        {seriesPhotos.map((p) => {
                          const isActive =
                            selectedBlock.type === 'photo'
                              ? selectedBlock.content === p.id
                              : selectedGroupIds.includes(p.id);

                          return (
                            <InspectorThumb
                              key={p.id}
                              type="button"
                              $active={isActive}
                              onClick={() => {
                                if (selectedBlock.type === 'photo') setSelectedPhoto(p.id);
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
                    </>
                  )}
                </Inspector>
              )}

              <CanvasFrame ref={canvasFrameRef} $showBorder={layoutMode}>
                <Canvas
                  $showGrid={layoutMode}
                  style={{
                    '--canvas-width': `${canvasWidth}px`,
                    '--grid-step-x': `${GRID_STEP_X}px`,
                    '--grid-step-y': `${GRID_STEP_Y}px`,
                    ...(layoutMode
                      ? { minHeight: `${gridCanvasHeight}px`, height: `${gridCanvasHeight}px` }
                      : {}),
                  }}
                  onPointerDown={(e) => {
                    if (!layoutMode) return;
                    e.stopPropagation();
                    handleCanvasPointerDown(e);
                  }}
                >
                  {layoutMode && renderContent.length === 0 && (
                    <EmptyState>
                      Nessun blocco ancora. Usa il pulsante + per aggiungere testo o foto e inizia a comporre la serie.
                    </EmptyState>
                  )}

                  <GridLayout
                    layout={buildGridLayout(renderContent)}
                    cols={GRID_COLS}
                    rowHeight={ROW_HEIGHT}
                    width={canvasWidth}
                    margin={[GRID_GUTTER, GRID_GUTTER]}
                    containerPadding={[0, 0]}
                    autoSize={!layoutMode}
                    style={layoutMode ? { height: gridCanvasHeight } : undefined}
                    isResizable={layoutMode}
                    isDraggable={layoutMode}
                    preventCollision={layoutMode}
                    compactType={null}
                    isBounded
                    resizeHandles={layoutMode ? ['se', 'sw', 'ne', 'nw'] : []}
                    draggableHandle={layoutMode ? ".series-drag-handle" : undefined}
                    draggableCancel={layoutMode ? ".series-editable,textarea,input,button" : undefined}
                    onLayoutChange={layoutMode ? handleGridLayoutChange : undefined}
                    onDragStart={layoutMode ? handleGridDragStart : undefined}
                    onDrag={layoutMode ? handleGridDrag : undefined}
                    onDragStop={layoutMode ? handleGridDragStop : undefined}
                    onResizeStart={layoutMode ? handleGridResizeStart : undefined}
                    onResize={layoutMode ? handleGridResize : undefined}
                    onResizeStop={layoutMode ? handleGridResizeStop : undefined}
                  >
                    {renderContent.map((block, index) => {
                      const isSelected = layoutMode && selectedIndex === index;

                      const renderBlock = () => {
                        if (block.type === 'text') {
                          const textAlign = block.textAlign || 'left';
                          const isJustify = ['justify', 'justify-right', 'justify-center'].includes(textAlign);
                          const textAlignCss = isJustify ? 'justify' : textAlign;
                          const textAlignLast =
                            textAlign === 'justify-right'
                              ? 'right'
                              : textAlign === 'justify-center'
                                ? 'center'
                                : 'auto';
                          const textSize = TEXT_SIZE_MAP[block.textSize] || TEXT_SIZE_MAP.base;
                          const textBold = Boolean(block.textBold);
                          const textItalic = Boolean(block.textItalic);
                          const textUnderline = Boolean(block.textUnderline);
                          const textMono = Boolean(block.textMono);
                          const textFont = TEXT_FONT_MAP[block.textFont] || TEXT_FONT_MAP.inter;
                          return layoutMode && isSelected ? (
                            <SeriesText style={{ padding: 0 }}>
                              <InlineTextEditor
                                className="series-editable"
                                value={block.content}
                                onChange={(e) => updateTextBlock(index, e.target.value)}
                                placeholder="Scrivi qui…"
                                $align={textAlignCss}
                                $alignLast={textAlignLast}
                                $size={textSize}
                                $bold={textBold}
                                $italic={textItalic}
                                $underline={textUnderline}
                                $mono={textMono}
                                $font={textFont}
                              />
                            </SeriesText>
                          ) : (
                            <SeriesText
                              $align={textAlignCss}
                              $alignLast={textAlignLast}
                              $size={textSize}
                              $bold={textBold}
                              $italic={textItalic}
                              $underline={textUnderline}
                              $mono={textMono}
                              $font={textFont}
                            >
                              {block.content}
                            </SeriesText>
                          );
                        }

                        if (block.type === 'photo') {
                          const photo = photos.find(p => p.id === block.content);
                          if (!photo) return null;
                          const canOpenLightbox = !layoutMode && block.showLightbox !== false;
                          return (
                            <PhotoFrame>
                              <PhotoMedia>
                                <CanvasPhoto
                                  src={`${IMAGES_BASE_URL}${photo.image}`}
                                  alt={photo.title}
                                  loading="lazy"
                                />
                                {canOpenLightbox && (
                                  <PhotoClickArea
                                    type="button"
                                    onClick={(event) => {
                                      const img = event.currentTarget?.parentElement?.querySelector('img');
                                      handlePhotoClickGuarded(event, photo, img);
                                    }}
                                    onMouseMove={(event) => {
                                      const img = event.currentTarget?.parentElement?.querySelector('img');
                                      event.currentTarget.style.cursor = isPointerOverImage(event, img)
                                        ? 'pointer'
                                        : 'default';
                                    }}
                                    onMouseLeave={(event) => {
                                      event.currentTarget.style.cursor = 'default';
                                    }}
                                    aria-label={photo.title ? `Apri ${photo.title}` : 'Apri foto'}
                                    title={photo.title || 'Apri foto'}
                                  />
                                )}
                              </PhotoMedia>
                              {block.showTitle !== false && photo.title && (
                                <CanvasCaption>{photo.title}</CanvasCaption>
                              )}
                            </PhotoFrame>
                          );
                        }

                        if (block.type === 'photos') {
                          const groupCols = getGroupCols(block.layout);
                          const groupRows = getGroupRows(block.layout);
                          const groupItems = prepareGroupItems(block.content || [], block.layout);
                          const groupWidth = getBlockPixelWidth(block.layout);
                          const groupHeight = getBlockPixelHeight(block.layout);

                          if (layoutMode) {
                            return (
                              <GroupGrid $editing={layoutMode}>
                                <GridLayout
                                  layout={buildGroupLayout(groupItems, groupCols, groupRows)}
                                  cols={groupCols}
                                  rowHeight={ROW_HEIGHT}
                                  width={groupWidth}
                                  margin={[GRID_GUTTER, GRID_GUTTER]}
                                  containerPadding={[0, 0]}
                                  autoSize={false}
                                  maxRows={groupRows}
                                  style={{ height: groupHeight }}
                                  isResizable={layoutMode}
                                  isDraggable={layoutMode}
                                  preventCollision={layoutMode}
                                  compactType={null}
                                  isBounded
                                  resizeHandles={layoutMode ? ['se', 'sw', 'ne', 'nw'] : []}
                                  onLayoutChange={layoutMode ? handleGroupLayoutChange(index, groupCols, groupRows) : undefined}
                                >
                                  {groupItems.map((item) => {
                                    const photo = photos.find(p => p.id === item.id);
                                    if (!photo) return null;
                                    return (
                                      <GroupItem key={item.id} $editing={layoutMode}>
                                        <ThumbImage
                                          src={`${IMAGES_BASE_URL}${photo.image}`}
                                          alt={photo.title}
                                          loading="lazy"
                                        />
                                      </GroupItem>
                                    );
                                  })}
                                </GridLayout>
                              </GroupGrid>
                            );
                          }

                          return (
                            <GroupGrid
                              $editing={false}
                              style={{
                                '--group-cols': groupCols,
                                '--group-rows': groupRows,
                                '--group-row-height': `${ROW_HEIGHT}px`,
                                '--group-gap': `${GRID_GUTTER}px`,
                              }}
                            >
                              {groupItems.map((item) => {
                                const photo = photos.find(p => p.id === item.id);
                                if (!photo) return null;
                                const layout = item.layout || {};
                                const colStart = Math.max(0, layout.x || 0);
                                const rowStart = Math.max(0, layout.y || 0);
                                const colSpan = Math.max(1, layout.w || GROUP_DEFAULT_W);
                                const rowSpan = Math.max(1, layout.h || GROUP_DEFAULT_H);
                                return (
                                  <GroupItem
                                    key={item.id}
                                    $editing={false}
                                    style={{
                                      gridColumn: `${colStart + 1} / span ${colSpan}`,
                                      gridRow: `${rowStart + 1} / span ${rowSpan}`,
                                    }}
                                  >
                                    <ThumbButton
                                      type="button"
                                      onClick={(event) => {
                                        const img = event.currentTarget.querySelector('img');
                                        handlePhotoClickGuarded(event, photo, img);
                                      }}
                                      onMouseMove={(event) => {
                                        const img = event.currentTarget.querySelector('img');
                                        const isOver = isPointerOverImage(event, img);
                                        event.currentTarget.style.cursor = isOver ? 'pointer' : 'default';
                                        if (img) {
                                          img.style.filter = isOver
                                            ? 'brightness(1.12) saturate(1.08) contrast(1.05)'
                                            : 'none';
                                          img.style.transform = isOver ? 'scale(1.01)' : 'scale(1)';
                                        }
                                      }}
                                      onMouseLeave={(event) => {
                                        event.currentTarget.style.cursor = 'default';
                                        const img = event.currentTarget.querySelector('img');
                                        if (img) {
                                          img.style.filter = 'none';
                                          img.style.transform = 'scale(1)';
                                        }
                                      }}
                                      title={photo.title || ''}
                                    >
                                      <ThumbImage
                                        src={`${IMAGES_BASE_URL}${photo.image}`}
                                        alt={photo.title}
                                        loading="lazy"
                                      />
                                    </ThumbButton>
                                  </GroupItem>
                                );
                              })}
                            </GroupGrid>
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
                          $editing={layoutMode}
                          $floatingHandle={layoutMode && block.type === 'text'}
                          onPointerDown={(e) => {
                            if (!layoutMode) return;
                            e.stopPropagation();
                            setSelectedId(block.id);
                          }}
                        >
                          {layoutMode && (
                            <DragHandle
                              className="series-drag-handle"
                              $solid={block.type === 'text'}
                              $floating={block.type === 'text'}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                setSelectedId(block.id);
                              }}
                            >
                              <DragLabel>
                                {block.type === 'text' ? 'Testo' : block.type === 'photo' ? 'Foto' : 'Gruppo foto'}
                              </DragLabel>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <DragHint>drag • resize</DragHint>

                              {isSelected && block.type === 'photo' && (
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePhotoTitle(index);
                                  }}
                                  style={{
                                    border: 'none',
                                    background: block.showTitle
                                      ? 'rgba(255,255,255,0.18)'
                                      : 'rgba(255,255,255,0.08)',
                                    color: 'rgba(255,255,255,0.92)',
                                    width: 30,
                                    height: 30,
                                    borderRadius: 999,
                                    cursor: 'pointer',
                                  }}
                                  title={block.showTitle ? 'Nascondi titolo' : 'Mostra titolo'}
                                  aria-pressed={block.showTitle ? 'true' : 'false'}
                                >
                                  <Type size={14} />
                                </button>
                              )}

                              {isSelected && block.type === 'photo' && (
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePhotoLightbox(index);
                                  }}
                                  style={{
                                    border: 'none',
                                    background: block.showLightbox
                                      ? 'rgba(255,255,255,0.18)'
                                      : 'rgba(255,255,255,0.08)',
                                    color: 'rgba(255,255,255,0.92)',
                                    width: 30,
                                    height: 30,
                                    borderRadius: 999,
                                    cursor: 'pointer',
                                  }}
                                  title={block.showLightbox ? 'Disattiva ingrandimento' : 'Attiva ingrandimento'}
                                  aria-pressed={block.showLightbox ? 'true' : 'false'}
                                >
                                  <Maximize2 size={14} />
                                </button>
                              )}

                              {isSelected && (
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      deleteBlock(block.id);
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
                          )}

                          <BlockBody $flush={block.type === 'photo' || block.type === 'photos'}>
                            {renderBlock()}
                          </BlockBody>
                        </DraggableBlock>
                      );
                    })}
                  </GridLayout>
                </Canvas>
              </CanvasFrame>
            </LayoutStage>
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
