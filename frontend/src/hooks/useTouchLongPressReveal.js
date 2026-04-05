import { useCallback, useEffect, useRef } from 'react';

export const useTouchLongPressReveal = ({ enabled, onLongPress, delay = 260 }) => {
  const timerRef = useRef(null);
  const triggeredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(() => {
    if (!enabled) return;

    clearTimer();
    triggeredRef.current = false;
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      onLongPress?.();
    }, delay);
  }, [clearTimer, delay, enabled, onLongPress]);

  const handlePointerEnd = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const consumeTrigger = useCallback(() => {
    const wasTriggered = triggeredRef.current;
    triggeredRef.current = false;
    return wasTriggered;
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    consumeTrigger,
    bind: enabled ? {
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
      onPointerLeave: handlePointerEnd
    } : {}
  };
};
