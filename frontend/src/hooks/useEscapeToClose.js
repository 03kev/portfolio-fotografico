import { useEffect, useRef } from 'react';

const escapeStack = [];
let suppressPopstateCount = 0;
let modalTokenCounter = 0;

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
  const consumedByPopstateRef = useRef(false);

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
      const tokenIndex = escapeStack.lastIndexOf(token);
      if (tokenIndex !== -1) {
        escapeStack.splice(tokenIndex, 1);
      }
    };
  }, [enabled, target]);

  useEffect(() => {
    if (!enabled || !handleBrowserBack || typeof window === 'undefined' || !window.history) {
      consumedByPopstateRef.current = false;
      return undefined;
    }

    const token = stackTokenRef.current;
    const historyToken = historyTokenRef.current;
    consumedByPopstateRef.current = false;

    window.history.pushState(
      {
        ...(window.history.state || {}),
        __modalToken: historyToken
      },
      ''
    );

    const handlePopstate = () => {
      if (suppressPopstateCount > 0) {
        suppressPopstateCount -= 1;
        return;
      }

      if (escapeStack[escapeStack.length - 1] !== token) return;
      consumedByPopstateRef.current = true;
      if (!canCloseRef.current) return;
      onCloseRef.current?.();
    };

    window.addEventListener('popstate', handlePopstate);

    return () => {
      window.removeEventListener('popstate', handlePopstate);

      if (consumedByPopstateRef.current) {
        consumedByPopstateRef.current = false;
        return;
      }

      if (window.history.state?.__modalToken !== historyToken) return;

      suppressPopstateCount += 1;
      window.history.back();
    };
  }, [enabled, handleBrowserBack]);
};
