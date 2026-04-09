import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Trash2, Edit3, Crop, Upload, Loader2, X } from 'lucide-react';
import { usePhotos } from '../contexts/PhotoContext';
import { LOCAL_IMAGE_FALLBACK, resolveVersionedAssetUrl } from '../utils/imageUrl';
import { photoService, signSourceUpload, uploadSourceToSignedUrl } from '../utils/api';
import { useGalleryQueryState } from '../hooks/useGalleryQueryState';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useMobileDeviceLayout, useTouchLongPressReveal } from '../hooks';
import {
  buildOperationErrorMessage
} from '../utils/operationErrors';
import PhotoUpload from './PhotoUpload';
import PhotoCropModal from './PhotoCropModal';

const DEBOUNCE_DELAY_FILTER = 200;
const SOURCE_REUPLOAD_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp';

const REUPLOAD_STEP_LABELS = {
  sign: 'firma URL upload',
  upload: 'upload source su R2',
  replace: 'rigenerazione derivate'
};

const CROP_STEP_LABELS = {
  update: 'salvataggio crop',
  regenerate: 'rigenerazione derivate'
};

const SKELETON_CARD_COUNT = 9;
const INITIAL_VISIBLE_CARDS = 24;
const VISIBLE_CARDS_BATCH = 24;
const LOAD_MORE_ROOT_MARGIN = '900px 0px';

const cardVariants = {
  hidden: { opacity: 0, scale: 0.98, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.98, y: -8, transition: { duration: 0.25 } }
};

const GallerySection = styled(motion.section)`
  padding: var(--spacing-4xl) 0;
  background: transparent;
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-xl);

  @media (max-width: 768px) {
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

  @media (max-width: 768px) {
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-xl);
  }
`;

const SearchContainer = styled(motion.div)`
  max-width: 560px;
  margin: 0 auto;
  position: relative;

  @media (max-width: 768px) {
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

  @media (max-width: 768px) {
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
  @media (max-width: 768px) {
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

  @media (max-width: 768px) {
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
  background: ${props => props.active ? 'rgba(214, 179, 106, 0.14)' : 'rgba(255, 255, 255, 0.03)'};
  color: ${props => props.active ? 'var(--color-text)' : 'var(--color-muted)'};
  border: 1px solid ${props => props.active ? 'rgba(214, 179, 106, 0.45)' : 'rgba(255, 255, 255, 0.10)'};
  padding: 8px 12px;
  border-radius: var(--border-radius-full);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);

  &:hover {
    color: var(--color-text);
    border-color: rgba(255, 255, 255, 0.16);
    transform: translateY(-1px);
  }

  @media (max-width: 768px) {
    flex: 0 0 auto;
    white-space: nowrap;
    padding: 8px 14px;
  }
`;

const GalleryGrid = styled(motion.div).attrs({ layout: true })`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--spacing-xl);

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-md);
  }

  @media (max-width: 420px) {
    gap: 12px;
  }
`;

const CardInteractionLayer = styled(motion.div)`
  display: block;
  -webkit-tap-highlight-color: transparent;
  tap-highlight-color: transparent;
  touch-action: manipulation;
  outline: none;
`;

const PhotoCard = styled(motion.div)`
  position: relative;
  border-radius: var(--border-radius-2xl);
  overflow: hidden;
  aspect-ratio: 4/3;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: var(--shadow-medium);
  transition: transform var(--transition-normal), box-shadow var(--transition-normal), border-color var(--transition-normal);
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  tap-highlight-color: transparent;
  touch-action: manipulation;

  &:hover {
    transform: translateY(-4px);
    border-color: rgba(214, 179, 106, 0.22);
    box-shadow: var(--shadow-large);
  }

  @media (max-width: 768px) {
    border-radius: 18px;
    box-shadow: var(--shadow-small);
  }
`;

const SeoImageLink = styled.a`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const PhotoImage = styled(motion.img)`
  width: 100%;
  height: 100%;
  object-fit: cover;
  color: transparent;
  font-size: 0;
  transition: transform 0.45s ease;
  -webkit-user-drag: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  pointer-events: none;

  ${PhotoCard}:hover & {
    transform: scale(1.03);
  }
`;

const PhotoOverlay = styled(motion.div)`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.82), rgba(0, 0, 0, 0.15) 55%, rgba(0, 0, 0, 0.0));
  padding: var(--spacing-lg);
  opacity: 0;
  transition: opacity var(--transition-normal);

  ${PhotoCard}:hover & {
    opacity: 1;
  }
`;

const DeleteButton = styled(motion.button)`
  position: absolute;
  top: var(--spacing-md);
  right: var(--spacing-md);
  background: rgba(220, 38, 38, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 8px;
  border-radius: var(--border-radius-full);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-normal), background var(--transition-normal);
  z-index: 10;

  ${PhotoCard}:hover & {
    opacity: 1;
  }

  &:hover {
    background: rgba(185, 28, 28, 1);
  }
`;

const EditButton = styled(motion.button)`
  position: absolute;
  top: var(--spacing-md);
  right: calc(var(--spacing-md) + 48px);
  background: rgba(214, 179, 106, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 8px;
  border-radius: var(--border-radius-full);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-normal), background var(--transition-normal);
  z-index: 10;

  ${PhotoCard}:hover & {
    opacity: 1;
  }

  &:hover {
    background: rgba(184, 149, 76, 1);
  }
`;

const CropButton = styled(motion.button)`
  position: absolute;
  top: var(--spacing-md);
  right: calc(var(--spacing-md) + 96px);
  background: rgba(39, 137, 255, 0.88);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: white;
  padding: 8px;
  border-radius: var(--border-radius-full);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-normal), background var(--transition-normal);
  z-index: 10;

  ${PhotoCard}:hover & {
    opacity: 1;
  }

  &:hover {
    background: rgba(18, 118, 236, 1);
  }
`;

const ReplaceSourceButton = styled(motion.button)`
  position: absolute;
  top: var(--spacing-md);
  right: calc(var(--spacing-md) + 144px);
  background: rgba(123, 107, 255, 0.88);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: white;
  padding: 8px;
  border-radius: var(--border-radius-full);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-normal), background var(--transition-normal);
  z-index: 10;

  ${PhotoCard}:hover & {
    opacity: 1;
  }

  &:hover {
    background: rgba(103, 84, 255, 1);
  }

  &:disabled {
    cursor: wait;
    opacity: 0.5;
  }
`;

const MobileManageButton = styled.button`
  position: absolute;
  top: 6px;
  right: 6px;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(10, 12, 18, 0.74);
  backdrop-filter: blur(12px);
  color: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 26px rgba(0, 0, 0, 0.22);
  z-index: 14;
  -webkit-tap-highlight-color: transparent;
  tap-highlight-color: transparent;
`;

const MobileAdminPanel = styled.div`
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  width: min(84px, calc(100% - 12px));
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 6px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(10, 12, 18, 0.9);
  backdrop-filter: blur(16px);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.26);
  z-index: 15;
`;

const MobileAdminAction = styled.button`
  width: 100%;
  aspect-ratio: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: ${({ $tone }) => {
    if ($tone === 'purple') return 'rgba(123, 107, 255, 0.18)';
    if ($tone === 'blue') return 'rgba(39, 137, 255, 0.18)';
    if ($tone === 'gold') return 'rgba(214, 179, 106, 0.18)';
    if ($tone === 'danger') return 'rgba(220, 38, 38, 0.18)';
    return 'rgba(255, 255, 255, 0.06)';
  }};
  color: ${({ $tone }) => {
    if ($tone === 'purple') return 'rgba(197, 189, 255, 0.98)';
    if ($tone === 'blue') return 'rgba(178, 216, 255, 0.98)';
    if ($tone === 'gold') return 'rgba(239, 216, 161, 0.98)';
    if ($tone === 'danger') return 'rgba(255, 211, 211, 0.98)';
    return 'rgba(255, 255, 255, 0.94)';
  }};
  padding: 0;
  -webkit-tap-highlight-color: transparent;
  tap-highlight-color: transparent;
`;

const MobileCaptionBar = styled.div`
  position: absolute;
  inset: auto 0 0 0;
  padding: 34px 12px 10px;
  background: linear-gradient(180deg, rgba(8, 10, 16, 0) 0%, rgba(8, 10, 16, 0.72) 52%, rgba(8, 10, 16, 0.96) 100%);
  pointer-events: none;
  z-index: 11;
`;

const MobileCaptionTitle = styled.div`
  color: rgba(255, 255, 255, 0.96);
  font-size: 0.84rem;
  line-height: 1.25;
  font-weight: var(--font-weight-semibold);
  letter-spacing: -0.01em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
`;

const ReuploadCardOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(8, 10, 16, 0.58);
  backdrop-filter: blur(2px);
  z-index: 12;
  pointer-events: auto;
  color: rgba(255, 255, 255, 0.94);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.01em;
`;

const ReuploadCardSpinner = styled(Loader2)`
  animation: replace-source-spin 0.9s linear infinite;
  color: rgba(214, 179, 106, 0.98);
  filter: drop-shadow(0 0 8px rgba(214, 179, 106, 0.35));

  @keyframes replace-source-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const ReuploadProgressMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(240px, 72%);
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.78rem;
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.01em;
  gap: 10px;
`;

const ReuploadProgressTrack = styled.div`
  width: min(240px, 72%);
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
`;

const ReuploadProgressFill = styled.div`
  width: ${({ $percent }) => `${$percent}%`};
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(214, 179, 106, 0.92), rgba(255, 230, 168, 0.94));
  transition: width 220ms ease-out;
`;

const ReuploadAbortButton = styled.button`
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: var(--border-radius-full);
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.95);
  font-size: 0.76rem;
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: var(--transition-normal);

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.34);
    transform: translateY(-1px);
  }
`;

const OverlayContent = styled.div`
  width: 100%;
`;

const PhotoTitle = styled.h3`
  color: var(--color-text);
  margin: 0 0 6px 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
`;

const PhotoLocation = styled.p`
  color: rgba(255, 255, 255, 0.78);
  margin: 0 0 6px 0;
  font-size: var(--font-size-sm);
`;

const PhotoDescription = styled.p`
  color: rgba(255, 255, 255, 0.70);
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: 1.45;
`;

const PhotoTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
`;

const Tag = styled.span`
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.80);
  padding: 4px 8px;
  border-radius: var(--border-radius-full);
  font-size: 0.72rem;
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

  @media (max-width: 768px) {
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

const DeleteModalBackdrop = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(4, 6, 12, 0.74);
  backdrop-filter: blur(6px);
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const DeleteModalCard = styled(motion.div)`
  width: min(460px, 100%);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(180deg, rgba(12, 17, 28, 0.96), rgba(8, 12, 22, 0.98));
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
  padding: 22px;
`;

const DeleteModalTitle = styled.h3`
  margin: 0 0 8px 0;
  font-size: 1.12rem;
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
`;

const DeleteModalText = styled.p`
  margin: 0;
  color: var(--color-muted);
  line-height: 1.5;
  font-size: var(--font-size-sm);
`;

const DeleteModalActions = styled.div`
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const DeleteModalButton = styled.button`
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--border-radius-lg);
  padding: 9px 14px;
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: var(--transition-normal);
  color: var(--color-text);
  background: rgba(255, 255, 255, 0.04);

  &:hover:enabled {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.24);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }
`;

const DeleteConfirmButton = styled(DeleteModalButton)`
  background: rgba(214, 56, 56, 0.92);
  border-color: rgba(255, 255, 255, 0.2);

  &:hover:enabled {
    background: rgba(194, 39, 39, 0.96);
    border-color: rgba(255, 255, 255, 0.28);
  }
`;

const DeleteInlineSpinner = styled(Loader2)`
  animation: delete-photo-spin 0.9s linear infinite;

  @keyframes delete-photo-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const GalleryCard = React.memo(function GalleryCard({
  photo,
  index,
  isAdmin,
  compactMobile,
  isTouchCardActive,
  isMobileAdminOpen,
  hideCardDescriptions,
  hasActivePhotoOp,
  photoOpStatus,
  getPhotoCardUrl,
  getPhotoAltText,
  getThumbImageUrl,
  onOpen,
  onDelete,
  onEdit,
  onCrop,
  onReuploadSource,
  onAbortReuploadUpload,
  onRevealMobileCard,
  onHideMobileCard,
  onToggleMobileAdmin,
  onCloseMobileAdmin
}) {
  const isCardOpActive = Boolean(photoOpStatus?.active);
  const isPendingCard = Boolean(photo?.__pending);
  const canOpenCard = !isCardOpActive && !isPendingCard;
  const cardImageSrc = isPendingCard ? String(photo.previewUrl || '') : getThumbImageUrl(photo);
  const isMobileUiVisible = compactMobile && (isTouchCardActive || isMobileAdminOpen);
  const mobileAdminActions = [
    {
      key: 'replace',
      tone: 'purple',
      title: 'Reupload source privata',
      icon: Upload,
      onClick: onReuploadSource
    },
    {
      key: 'crop',
      tone: 'blue',
      title: 'Modifica crop',
      icon: Crop,
      onClick: onCrop
    },
    {
      key: 'edit',
      tone: 'gold',
      title: 'Modifica foto',
      icon: Edit3,
      onClick: onEdit
    },
    {
      key: 'delete',
      tone: 'danger',
      title: 'Elimina foto',
      icon: Trash2,
      onClick: onDelete
    }
  ];
  const { bind: touchRevealBind, consumeTrigger } = useTouchLongPressReveal({
    enabled: compactMobile && !isPendingCard && !isCardOpActive,
    onLongPress: () => onRevealMobileCard(photo.id)
  });

  return (
    <CardInteractionLayer
      layout
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      data-mobile-gallery-card-id={photo.id}
      {...touchRevealBind}
      onContextMenu={(event) => {
        if (compactMobile) {
          event.preventDefault();
        }
      }}
      onClick={() => {
        if (compactMobile && (isTouchCardActive || isMobileAdminOpen || consumeTrigger())) {
          onCloseMobileAdmin();
          onHideMobileCard();
          return;
        }
        if (!canOpenCard) return;
        onOpen(photo);
      }}
    >
      <PhotoCard>
        {!isPendingCard && (
          <SeoImageLink href={getPhotoCardUrl(photo)} aria-hidden="true" tabIndex={-1}>
            {photo.title || 'Foto'}
          </SeoImageLink>
        )}
        {isAdmin && compactMobile && !isPendingCard && !hasActivePhotoOp && !isCardOpActive && isMobileUiVisible && (
          <>
            <MobileManageButton
              data-mobile-admin-manage-button="true"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleMobileAdmin(photo.id);
              }}
              aria-label={isMobileAdminOpen ? 'Chiudi azioni admin' : 'Apri azioni admin'}
              title={isMobileAdminOpen ? 'Chiudi azioni admin' : 'Apri azioni admin'}
            >
              <Edit3 size={18} />
            </MobileManageButton>
            {isMobileAdminOpen && (
              <MobileAdminPanel
                data-mobile-admin-panel="true"
                onClick={(event) => event.stopPropagation()}
              >
                {mobileAdminActions.map((action) => {
                  const ActionIcon = action.icon;

                  return (
                    <MobileAdminAction
                      key={action.key}
                      type="button"
                      $tone={action.tone}
                      onClick={(event) => {
                        onCloseMobileAdmin();
                        onHideMobileCard();
                        action.onClick(event, photo);
                      }}
                      title={action.title}
                      aria-label={action.title}
                    >
                      <ActionIcon size={16} />
                    </MobileAdminAction>
                  );
                })}
              </MobileAdminPanel>
            )}
          </>
        )}
        {isAdmin && !compactMobile && !isPendingCard && (
          <>
            {!hasActivePhotoOp && !isCardOpActive && (
              <ReplaceSourceButton
                onClick={(event) => onReuploadSource(event, photo)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                title="Reupload source privata"
              >
                <Upload size={18} />
              </ReplaceSourceButton>
            )}
            {!hasActivePhotoOp && !isCardOpActive && (
              <>
                <CropButton
                  onClick={(event) => onCrop(event, photo)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  title="Modifica crop"
                >
                  <Crop size={18} />
                </CropButton>
                <EditButton
                  onClick={(event) => onEdit(event, photo)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <Edit3 size={18} />
                </EditButton>
                <DeleteButton
                  onClick={(event) => onDelete(event, photo)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <Trash2 size={18} />
                </DeleteButton>
              </>
            )}
          </>
        )}
        <PhotoImage
          src={cardImageSrc}
          alt={getPhotoAltText(photo)}
          loading={index < 3 ? 'eager' : 'lazy'}
          fetchPriority={index < 3 ? 'high' : 'auto'}
          decoding="async"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = LOCAL_IMAGE_FALLBACK;
          }}
        />
        {isCardOpActive && (
          <ReuploadCardOverlay>
            <ReuploadCardSpinner size={26} />
            <span>{photoOpStatus?.label || 'Operazione in corso'}</span>
            <ReuploadProgressMeta>
              <span>{photoOpStatus?.type === 'source-reupload' || photoOpStatus?.type === 'new-upload' ? 'Stato upload' : 'Stato operazione'}</span>
              <span>{Math.round(photoOpStatus?.percent || 0)}%</span>
            </ReuploadProgressMeta>
            <ReuploadProgressTrack>
              <ReuploadProgressFill $percent={Math.max(0, Math.min(100, photoOpStatus?.percent || 0))} />
            </ReuploadProgressTrack>
            {photoOpStatus?.type === 'source-reupload' && photoOpStatus?.step === 'upload' && (
              <ReuploadAbortButton
                type="button"
                onClick={(event) => onAbortReuploadUpload(event, photo.id, photoOpStatus?.step)}
              >
                <X size={14} />
                Annulla upload
              </ReuploadAbortButton>
            )}
          </ReuploadCardOverlay>
        )}
        {!isCardOpActive && !compactMobile && (
          <PhotoOverlay>
            <OverlayContent>
              <PhotoTitle>{photo.title}</PhotoTitle>
              <PhotoLocation>{photo.location}</PhotoLocation>
              {!hideCardDescriptions && (
                <PhotoDescription>{photo.description}</PhotoDescription>
              )}
              {Array.isArray(photo.tags) && photo.tags.length > 0 && (
                <PhotoTags>
                  {photo.tags.slice(0, 3).map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </PhotoTags>
              )}
            </OverlayContent>
          </PhotoOverlay>
        )}
        {isMobileUiVisible && Boolean(photo?.title) && (
          <MobileCaptionBar>
            <MobileCaptionTitle>{photo.title}</MobileCaptionTitle>
          </MobileCaptionBar>
        )}
      </PhotoCard>
    </CardInteractionLayer>
  );
});

const Gallery = ({ headingLevel = 'h2', forcedPhotoId = null, hideCardDescriptions = false }) => {
  const { photos, filteredPhotos, loading, actions, modalOpen, photoOpsByPhotoId, pendingUploads } = usePhotos();
  const outletContext = useOutletContext();
  const isAdmin = Boolean(outletContext?.isAdmin);
  const notify = outletContext?.notify || null;
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
  const filterRailRef = useRef(null);
  const filterButtonRefs = useRef(new Map());
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [croppingPhoto, setCroppingPhoto] = useState(null);
  const [reuploadSourcePhoto, setReuploadSourcePhoto] = useState(null);
  const [photoPendingDelete, setPhotoPendingDelete] = useState(null);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [mobileTouchPhotoId, setMobileTouchPhotoId] = useState(null);
  const [mobileAdminPhotoId, setMobileAdminPhotoId] = useState(null);
  const [filterRailFadeState, setFilterRailFadeState] = useState({ left: false, right: false });
  const softProgressTimerRef = useRef(null);
  const reuploadUploadAbortControllerRef = useRef(null);
  const activeReuploadPhotoIdRef = useRef(null);
  const isMountedRef = useRef(true);
  const loadMoreTriggerRef = useRef(null);
  const [visibleCardsCount, setVisibleCardsCount] = useState(INITIAL_VISIBLE_CARDS);
  const lastRevealKeyRef = useRef(null);
  const previousGalleryLengthRef = useRef(0);
  const compactMobile = useMobileDeviceLayout({ maxWidth: 900 });

  useEffect(() => {
    if (!compactMobile && mobileAdminPhotoId !== null) {
      setMobileAdminPhotoId(null);
    }
    if (!compactMobile && mobileTouchPhotoId !== null) {
      setMobileTouchPhotoId(null);
    }
  }, [compactMobile, mobileAdminPhotoId, mobileTouchPhotoId]);

  useEffect(() => {
    if (!compactMobile || (mobileAdminPhotoId === null && mobileTouchPhotoId === null)) return undefined;

    const activeCardId = mobileAdminPhotoId ?? mobileTouchPhotoId;
    const activeCardSelector = activeCardId !== null
      ? `[data-mobile-gallery-card-id="${String(activeCardId)}"]`
      : null;

    const handlePointerDownOutsideMobileCard = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      if (
        target.closest('[data-mobile-admin-panel="true"]')
        || target.closest('[data-mobile-admin-manage-button="true"]')
      ) {
        return;
      }

      if (activeCardSelector && target.closest(activeCardSelector)) {
        return;
      }

      setMobileAdminPhotoId(null);
      setMobileTouchPhotoId(null);
    };

    document.addEventListener('pointerdown', handlePointerDownOutsideMobileCard);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutsideMobileCard);
  }, [compactMobile, mobileAdminPhotoId, mobileTouchPhotoId]);

  const allTags = useMemo(() =>
    [...new Set(photos.flatMap(photo => Array.isArray(photo.tags) ? photo.tags : []))],
  [photos]);

  useEffect(() => {
    const railNode = filterRailRef.current;
    if (!railNode) return undefined;

    const updateRailFade = () => {
      const { scrollLeft, clientWidth, scrollWidth } = railNode;
      const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
      const threshold = 6;

      setFilterRailFadeState({
        left: scrollLeft > threshold,
        right: scrollLeft < maxScrollLeft - threshold
      });
    };

    updateRailFade();
    railNode.addEventListener('scroll', updateRailFade, { passive: true });
    window.addEventListener('resize', updateRailFade);

    return () => {
      railNode.removeEventListener('scroll', updateRailFade);
      window.removeEventListener('resize', updateRailFade);
    };
  }, [allTags.length, compactMobile]);

  useEffect(() => {
    if (!compactMobile) return;

    const railNode = filterRailRef.current;
    const activeButton = filterButtonRefs.current.get(activeFilter);
    if (!railNode || !activeButton) return;

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        activeButton.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [activeFilter, compactMobile, allTags.length]);

  const filterOptions = useMemo(() => ['all', ...allTags], [allTags]);
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
      setVisibleCardsCount(Math.min(nextLength, INITIAL_VISIBLE_CARDS));
    } else if (allCardsWereVisible) {
      // Keep live updates snappy: if the grid was already fully visible,
      // show newly inserted cards immediately instead of re-running the reveal.
      setVisibleCardsCount(nextLength);
    } else if (visibleCardsCount > nextLength) {
      setVisibleCardsCount(nextLength);
    }

    previousGalleryLengthRef.current = nextLength;
  }, [galleryCards.length, activeFilter, debouncedSearchTerm, visibleCardsCount]);

  useEffect(() => {
    if (loading || waitingForForcedModal) return;
    if (visibleCardsCount >= galleryCards.length) return;
    if (!loadMoreTriggerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setVisibleCardsCount((previous) => Math.min(galleryCards.length, previous + VISIBLE_CARDS_BATCH));
      },
      {
        root: null,
        rootMargin: LOAD_MORE_ROOT_MARGIN,
        threshold: 0
      }
    );

    observer.observe(loadMoreTriggerRef.current);

    return () => observer.disconnect();
  }, [loading, waitingForForcedModal, visibleCardsCount, galleryCards.length]);

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
    actions.openPhotoModal(photo);
  }, [actions]);

  const getThumbImageUrl = (photo) => {
    const version = photo?.derivativesVersion || photo?.updatedAt || photo?.id;
    return resolveVersionedAssetUrl(photo.thumbnail43, version);
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
      notify?.success?.(`Foto eliminata: "${photoPendingDelete.title || 'foto'}".`, 3200);
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

  const handleAbortReuploadUpload = (event, photoId, step) => {
    event.stopPropagation();
    if (step !== 'upload') return;
    if (activeReuploadPhotoIdRef.current !== photoId) return;
    reuploadUploadAbortControllerRef.current?.abort();
  };

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
    actions.setPhotoOpStatus(targetPhotoId, {
      active: true,
      type: 'source-reupload',
      percent: 3,
      label: 'Preparazione upload',
      step: 'sign'
    });
    let currentStep = 'sign';
    try {
      notify?.info?.(`Caricamento source in corso per "${targetPhoto.title || 'foto'}"...`, 2500);

      currentStep = 'sign';
      actions.setPhotoOpStatus(targetPhotoId, {
        percent: 8,
        label: 'Firma URL upload',
        step: 'sign'
      });
      const signedData = await signSourceUpload({
        uploadId: String(targetPhoto.id),
        file
      });

      currentStep = 'upload';
      actions.setPhotoOpStatus(targetPhotoId, {
        percent: 12,
        label: 'Upload source su R2',
        step: 'upload'
      });
      const uploadAbortController = new AbortController();
      reuploadUploadAbortControllerRef.current = uploadAbortController;
      await uploadSourceToSignedUrl({
        uploadUrl: signedData.uploadUrl,
        file,
        signal: uploadAbortController.signal,
        onProgress: ({ ratio }) => {
          const normalized = Math.max(0, Math.min(1, Number(ratio) || 0));
          const mapped = Math.round(12 + normalized * 58); // 12% -> 70%
          actions.setPhotoOpStatus(targetPhotoId, { percent: mapped });
        }
      });
      reuploadUploadAbortControllerRef.current = null;

      currentStep = 'replace';
      actions.setPhotoOpStatus(targetPhotoId, {
        label: 'Rigenerazione derivate',
        percent: 74,
        step: 'replace'
      });
      startSoftProgress(targetPhotoId, 74, 95);
      const replaceResponse = await photoService.replaceSource(targetPhoto.id, {
        sourcePath: signedData.sourcePath,
        sourceContentType: file.type,
        replaceToken: signedData.replaceToken || ''
      });
      stopSoftProgress();
      const updatedPhoto = replaceResponse?.data?.data || replaceResponse?.data;
      actions.applyPhotoUpdate?.(updatedPhoto);
      actions.setPhotoOpStatus(targetPhotoId, {
        percent: 100,
        label: 'Completato',
        step: 'done'
      });
      notify?.success?.(`Source aggiornata: "${targetPhoto.title || 'foto'}".`, 3500);
    } catch (error) {
      stopSoftProgress();
      console.error('Errore reupload source privata:', error);
      if (error?.code === 'UPLOAD_ABORTED') {
        notify?.info?.('Upload source annullato.', 3500);
      } else {
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
    actions.setPhotoOpStatus(photoId, {
      active: true,
      type: 'crop',
      percent: 12,
      label: 'Salvataggio crop',
      step: 'update'
    });

    let currentStep = 'update';
    try {
      notify?.info?.(`Applicazione crop in corso per "${title}"...`, 2200);
      await photoService.update(photoId, { settings: JSON.stringify(nextSettings) });

      currentStep = 'regenerate';
      actions.setPhotoOpStatus(photoId, {
        percent: 38,
        label: 'Rigenerazione derivate',
        step: 'regenerate'
      });
      startSoftProgress(photoId, 38, 95);

      const regenerateResponse = await photoService.regenerateDerivatives(photoId);
      stopSoftProgress();

      const updatedPhoto = regenerateResponse?.data?.data || regenerateResponse?.data;
      actions.applyPhotoUpdate?.(updatedPhoto);
      actions.setPhotoOpStatus(photoId, {
        percent: 100,
        label: 'Crop applicato',
        step: 'done'
      });
      notify?.success?.(`Crop applicato: "${title}".`, 3200);
    } catch (error) {
      stopSoftProgress();
      console.error('Errore applicazione crop:', error);
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
            {Array.from({ length: SKELETON_CARD_COUNT }).map((_, idx) => (
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
          accept={SOURCE_REUPLOAD_ACCEPT}
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
                  active={activeFilter === filter}
                  onClick={() => handleFilterClick(filter)}
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
            <GalleryGrid key="gallery-grid">
              <AnimatePresence mode="popLayout" initial={false}>
                {visibleGalleryCards.map((photo, index) => {
                  return (
                    <GalleryCard
                      key={photo.id}
                      photo={photo}
                      index={index}
                      isAdmin={isAdmin}
                      compactMobile={compactMobile}
                      isTouchCardActive={mobileTouchPhotoId === photo.id}
                      isMobileAdminOpen={mobileAdminPhotoId === photo.id}
                      hideCardDescriptions={hideCardDescriptions}
                      hasActivePhotoOp={hasActivePhotoOp}
                      photoOpStatus={photoOpsByPhotoId?.[String(photo.id)]}
                      getPhotoCardUrl={getPhotoCardUrl}
                      getPhotoAltText={getPhotoAltText}
                      getThumbImageUrl={getThumbImageUrl}
                      onOpen={handlePhotoClick}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                      onCrop={handleCrop}
                      onReuploadSource={handleReuploadSourceClick}
                      onAbortReuploadUpload={handleAbortReuploadUpload}
                      onRevealMobileCard={(photoId) => {
                        setMobileTouchPhotoId(photoId);
                        setMobileAdminPhotoId((current) => (current === photoId ? current : null));
                      }}
                      onHideMobileCard={() => setMobileTouchPhotoId(null)}
                      onToggleMobileAdmin={(photoId) => {
                        setMobileTouchPhotoId(photoId);
                        setMobileAdminPhotoId((current) => (current === photoId ? null : photoId));
                      }}
                      onCloseMobileAdmin={() => setMobileAdminPhotoId(null)}
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

        {isAdmin && editingPhoto && (
          <PhotoUpload
            photoToEdit={editingPhoto}
            onClose={() => setEditingPhoto(null)}
            onUploadSuccess={(updatedPhoto) => {
              actions.applyPhotoUpdate?.(updatedPhoto);
              setEditingPhoto(null);
            }}
            onUploadError={(error) => {
              notify?.error?.(
                error?.message || buildOperationErrorMessage(error, 'aggiornamento foto'),
                6000
              );
            }}
          />
        )}

        <PhotoCropModal
          photo={croppingPhoto}
          isOpen={isAdmin && Boolean(croppingPhoto)}
          onClose={() => setCroppingPhoto(null)}
          onApply={({ photoId, photoTitle, nextSettings }) => {
            setCroppingPhoto(null);
            handleApplyCropInBackground({ photoId, photoTitle, nextSettings });
          }}
        />

        <AnimatePresence>
          {photoPendingDelete && (
            <DeleteModalBackdrop
              key="delete-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCancelDelete}
            >
              <DeleteModalCard
                key="delete-modal-card"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                onClick={(e) => e.stopPropagation()}
              >
                <DeleteModalTitle>Elimina foto</DeleteModalTitle>
                <DeleteModalText>
                  Stai per eliminare <strong>{photoPendingDelete.title || 'questa foto'}</strong>.
                  L&apos;operazione rimuove anche source privata e derivate pubbliche.
                </DeleteModalText>
                <DeleteModalActions>
                  <DeleteModalButton
                    type="button"
                    onClick={handleCancelDelete}
                    disabled={deletingPhoto}
                  >
                    Annulla
                  </DeleteModalButton>
                  <DeleteConfirmButton
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={deletingPhoto}
                  >
                    {deletingPhoto ? (
                      <>
                        <DeleteInlineSpinner size={16} />
                        Eliminazione...
                      </>
                    ) : (
                      'Elimina'
                    )}
                  </DeleteConfirmButton>
                </DeleteModalActions>
              </DeleteModalCard>
            </DeleteModalBackdrop>
          )}
        </AnimatePresence>
      </Container>
    </GallerySection>
  );
};

export default Gallery;
