import { useEffect, useRef } from 'react';
import { registerModalHistoryEntry } from '../utils/modalHistory';

const escapeStack = [];
let modalTokenCounter = 0;

const removeStackEntry = (stack, entry) => {
  const index = stack.lastIndexOf(entry);
  if (index !== -1) stack.splice(index, 1);
};

export const useEscapeToClose = ({
  enabled = true,
  onClose,
  canClose = true,
  target = typeof document !== 'undefined' ? document : null,
  handleBrowserBack = true
}) => {
  const stackTokenRef = useRef(null);
  const historyTokenRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const canCloseRef = useRef(canClose);

  if (!stackTokenRef.current) {
    stackTokenRef.current = Symbol('escape-modal');
  }

  if (!historyTokenRef.current) {
    modalTokenCounter += 1;
    historyTokenRef.current = `modal-${modalTokenCounter}`;
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
      removeStackEntry(escapeStack, token);
    };
  }, [enabled, target]);

  useEffect(() => {
    if (!enabled || !handleBrowserBack || typeof window === 'undefined' || !window.history) {
      return undefined;
    }

    const historyToken = historyTokenRef.current;
    return registerModalHistoryEntry({
      historyToken,
      canClose: () => canCloseRef.current,
      onClose: () => onCloseRef.current?.()
    });
  }, [enabled, handleBrowserBack]);
};
