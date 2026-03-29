import { useEffect, useRef } from 'react';

const escapeStack = [];

export const useEscapeToClose = ({
  enabled = true,
  onClose,
  canClose = true,
  target = typeof document !== 'undefined' ? document : null
}) => {
  const stackTokenRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const canCloseRef = useRef(canClose);

  if (!stackTokenRef.current) {
    stackTokenRef.current = Symbol('escape-modal');
  }

  useEffect(() => {
    onCloseRef.current = onClose;
    canCloseRef.current = canClose;
  }, [onClose, canClose]);

  useEffect(() => {
    if (!enabled || !target || !onCloseRef.current) return undefined;

    const token = stackTokenRef.current;
    if (!escapeStack.includes(token)) {
      escapeStack.push(token);
    }

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (escapeStack[escapeStack.length - 1] !== token) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      if (!canCloseRef.current) return;
      onCloseRef.current?.();
    };

    target.addEventListener('keydown', handleEscape);
    return () => {
      target.removeEventListener('keydown', handleEscape);
      const tokenIndex = escapeStack.lastIndexOf(token);
      if (tokenIndex !== -1) {
        escapeStack.splice(tokenIndex, 1);
      }
    };
  }, [enabled, target]);
};
