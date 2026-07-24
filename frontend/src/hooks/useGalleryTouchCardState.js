import { useCallback, useEffect, useRef, useState } from 'react';

export const useGalleryTouchCardState = ({ enabled = false } = {}) => {
  const [activeCardId, setActiveCardId] = useState(null);
  const [activeAdminCardId, setActiveAdminCardId] = useState(null);
  const activeCardIdRef = useRef(null);

  useEffect(() => {
    activeCardIdRef.current = activeAdminCardId ?? activeCardId;
  }, [activeAdminCardId, activeCardId]);

  useEffect(() => {
    if (enabled) return;
    if (activeAdminCardId !== null) setActiveAdminCardId(null);
    if (activeCardId !== null) setActiveCardId(null);
  }, [enabled, activeAdminCardId, activeCardId]);

  const revealCard = useCallback((cardId) => {
    setActiveCardId(cardId);
    setActiveAdminCardId((current) => (current === cardId ? current : null));
  }, []);

  const hideCard = useCallback(() => {
    setActiveCardId(null);
  }, []);

  const toggleAdmin = useCallback((cardId) => {
    setActiveCardId(cardId);
    setActiveAdminCardId((current) => (current === cardId ? null : cardId));
  }, []);

  const closeAdmin = useCallback(() => {
    setActiveAdminCardId(null);
  }, []);

  const closeAll = useCallback(() => {
    setActiveAdminCardId(null);
    setActiveCardId(null);
  }, []);

  useEffect(() => {
    if (!enabled || (activeAdminCardId === null && activeCardId === null)) return undefined;

    const handlePointerDownOutsideTouchCard = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      if (
        target.closest('[data-touch-admin-panel="true"]')
        || target.closest('[data-touch-admin-manage-button="true"]')
      ) {
        return;
      }

      const currentCardId = activeCardIdRef.current;
      const activeCardSelector = currentCardId !== null
        ? `[data-touch-gallery-card-id="${String(currentCardId)}"]`
        : null;

      if (activeCardSelector && target.closest(activeCardSelector)) {
        return;
      }

      closeAll();
    };

    document.addEventListener('pointerdown', handlePointerDownOutsideTouchCard);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutsideTouchCard);
  }, [enabled, activeAdminCardId, activeCardId, closeAll]);

  return {
    activeCardId,
    activeAdminCardId,
    revealCard,
    hideCard,
    toggleAdmin,
    closeAdmin,
    closeAll
  };
};
