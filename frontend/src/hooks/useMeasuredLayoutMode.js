import { useEffect, useLayoutEffect, useState } from 'react';

export const useMeasuredLayoutMode = ({
  enabled = true,
  initialMode,
  observedRefs = [],
  resolveMode
}) => {
  const [mode, setMode] = useState(initialMode);

  useLayoutEffect(() => {
    if (!enabled) return;
    const nextMode = resolveMode();
    if (typeof nextMode !== 'undefined') {
      setMode((currentMode) => (currentMode === nextMode ? currentMode : nextMode));
    }
  }, [enabled, resolveMode]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    let frameId = null;
    const updateMode = () => {
      frameId = null;
      const nextMode = resolveMode();
      if (typeof nextMode !== 'undefined') {
        setMode((currentMode) => (currentMode === nextMode ? currentMode : nextMode));
      }
    };

    const scheduleUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateMode);
    };

    const observedNodes = observedRefs
      .map((ref) => ref?.current)
      .filter(Boolean);
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleUpdate);
    observedNodes.forEach((node) => observer?.observe(node));

    if (!observer) {
      window.addEventListener('resize', scheduleUpdate);
    }

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      if (!observer) {
        window.removeEventListener('resize', scheduleUpdate);
      }
    };
  }, [enabled, observedRefs, resolveMode]);

  return mode;
};
