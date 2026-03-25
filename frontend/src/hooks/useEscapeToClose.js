import { useEffect } from 'react';

export const useEscapeToClose = ({
  enabled = true,
  onClose,
  canClose = true,
  target = typeof document !== 'undefined' ? document : null
}) => {
  useEffect(() => {
    if (!enabled || !target || !onClose) return undefined;

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (!canClose) return;
      onClose();
    };

    target.addEventListener('keydown', handleEscape);
    return () => target.removeEventListener('keydown', handleEscape);
  }, [enabled, onClose, canClose, target]);
};

