import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Crop, Edit3, Loader2, Trash2, Upload, X } from 'lucide-react';
import { useTouchLongPressReveal } from '../../hooks';
import { viewportBreakpoints } from '../../styles/responsive';

const cardVariants = {
  hidden: { opacity: 0, scale: 0.98, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.98, y: -8, transition: { duration: 0.25 } }
};

const TOUCH_ADMIN_ACTIONS = [
  {
    key: 'replace',
    tone: 'purple',
    title: 'Reupload source privata',
    icon: Upload,
    action: 'reupload'
  },
  {
    key: 'crop',
    tone: 'blue',
    title: 'Modifica crop',
    icon: Crop,
    action: 'crop'
  },
  {
    key: 'edit',
    tone: 'gold',
    title: 'Modifica foto',
    icon: Edit3,
    action: 'edit'
  },
  {
    key: 'delete',
    tone: 'danger',
    title: 'Elimina foto',
    icon: Trash2,
    action: 'delete'
  }
];

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

  @media (max-width: ${viewportBreakpoints.medium}px) {
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
  background: linear-gradient(to top, rgba(0, 0, 0, 0.82), rgba(0, 0, 0, 0.15) 55%, rgba(0, 0, 0, 0));
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

export const GalleryCard = React.memo(function GalleryCard({
  photo,
  prioritizeImage,
  motionEnabled,
  isAdmin,
  usesTouchControls,
  isTouchCardActive,
  isTouchAdminOpen,
  hideCardDescriptions,
  hasActivePhotoOp,
  photoOpStatus,
  getPhotoCardUrl,
  getPhotoAltText,
  getThumbImageUrl,
  fallbackImageSrc,
  onOpen,
  onDelete,
  onEdit,
  onCrop,
  onReuploadSource,
  onAbortReuploadUpload,
  onRevealTouchCard,
  onHideTouchCard,
  onToggleTouchAdmin,
  onCloseTouchAdmin
}) {
  const isCardOpActive = Boolean(photoOpStatus?.active);
  const isPendingCard = Boolean(photo?.__pending);
  const canOpenCard = !isCardOpActive && !isPendingCard;
  const cardImageSrc = isPendingCard ? String(photo.previewUrl || '') : getThumbImageUrl(photo);
  const isTouchUiVisible = usesTouchControls && (isTouchCardActive || isTouchAdminOpen);
  const { bind: touchRevealBind, consumeTrigger } = useTouchLongPressReveal({
    enabled: usesTouchControls && !isPendingCard && !isCardOpActive,
    onLongPress: () => onRevealTouchCard(photo.id)
  });

  const handleCardClick = () => {
    if (usesTouchControls && (isTouchCardActive || isTouchAdminOpen || consumeTrigger())) {
      onCloseTouchAdmin();
      onHideTouchCard();
      return;
    }
    if (!canOpenCard) return;
    onOpen(photo);
  };

  const handleTouchAction = (action, event) => {
    onCloseTouchAdmin();
    onHideTouchCard();

    if (action === 'reupload') onReuploadSource(event, photo);
    if (action === 'crop') onCrop(event, photo);
    if (action === 'edit') onEdit(event, photo);
    if (action === 'delete') onDelete(event, photo);
  };

  return (
    <CardInteractionLayer
      layout={motionEnabled}
      variants={motionEnabled ? cardVariants : undefined}
      initial={motionEnabled ? 'hidden' : false}
      animate={motionEnabled ? 'visible' : false}
      exit={motionEnabled ? 'exit' : undefined}
      data-touch-gallery-card-id={photo.id}
      {...touchRevealBind}
      onContextMenu={(event) => {
        if (usesTouchControls) event.preventDefault();
      }}
      onClick={handleCardClick}
    >
      <PhotoCard>
        {!isPendingCard && (
          <SeoImageLink href={getPhotoCardUrl(photo)} aria-hidden="true" tabIndex={-1}>
            {photo.title || 'Foto'}
          </SeoImageLink>
        )}
        {isAdmin && usesTouchControls && !isPendingCard && !hasActivePhotoOp && !isCardOpActive && isTouchUiVisible && (
          <>
            <MobileManageButton
              data-touch-admin-manage-button="true"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleTouchAdmin(photo.id);
              }}
              aria-label={isTouchAdminOpen ? 'Chiudi azioni admin' : 'Apri azioni admin'}
              title={isTouchAdminOpen ? 'Chiudi azioni admin' : 'Apri azioni admin'}
            >
              <Edit3 size={18} />
            </MobileManageButton>
            {isTouchAdminOpen && (
              <MobileAdminPanel
                data-touch-admin-panel="true"
                onClick={(event) => event.stopPropagation()}
              >
                {TOUCH_ADMIN_ACTIONS.map((action) => {
                  const ActionIcon = action.icon;

                  return (
                    <MobileAdminAction
                      key={action.key}
                      type="button"
                      $tone={action.tone}
                      onClick={(event) => handleTouchAction(action.action, event)}
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
        {isAdmin && !usesTouchControls && !isPendingCard && !hasActivePhotoOp && !isCardOpActive && (
          <>
            <ReplaceSourceButton
              onClick={(event) => onReuploadSource(event, photo)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Reupload source privata"
            >
              <Upload size={18} />
            </ReplaceSourceButton>
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
        <PhotoImage
          src={cardImageSrc}
          alt={getPhotoAltText(photo)}
          loading={prioritizeImage ? 'eager' : 'lazy'}
          fetchPriority={prioritizeImage ? 'high' : 'auto'}
          decoding="async"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = fallbackImageSrc;
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
        {!isCardOpActive && !usesTouchControls && (
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
        {isTouchUiVisible && Boolean(photo?.title) && (
          <MobileCaptionBar>
            <MobileCaptionTitle>{photo.title}</MobileCaptionTitle>
          </MobileCaptionBar>
        )}
      </PhotoCard>
    </CardInteractionLayer>
  );
});
