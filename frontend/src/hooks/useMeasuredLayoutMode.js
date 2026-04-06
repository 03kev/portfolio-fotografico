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

    const updateMode = () => {
      const nextMode = resolveMode();
      if (typeof nextMode !== 'undefined') {
        setMode((currentMode) => (currentMode === nextMode ? currentMode : nextMode));
      }
    };

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateMode);
    observedRefs
      .map((ref) => ref?.current)
      .filter(Boolean)
      .forEach((node) => observer?.observe(node));

    window.addEventListener('resize', updateMode);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateMode);
    };
  }, [enabled, observedRefs, resolveMode]);

  return mode;
};
