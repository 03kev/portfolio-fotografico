import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const useAdaptiveHeaderPill = ({
  enabled,
  fullLabel,
  shortLabel,
  mobileMaxWidth = 560
}) => {
  const cardRef = useRef(null);
  const headerRef = useRef(null);
  const headerCopyRef = useRef(null);
  const toplineRef = useRef(null);
  const leadingRef = useRef(null);
  const trailingRef = useRef(null);
  const fullMeasureRef = useRef(null);
  const shortMeasureRef = useRef(null);
  const [mode, setMode] = useState('full');

  const updateMode = useCallback(() => {
    const card = cardRef.current;
    const header = headerRef.current;
    const headerCopy = headerCopyRef.current;
    const leading = leadingRef.current;
    const trailing = trailingRef.current;
    const fullMeasure = fullMeasureRef.current;
    const shortMeasure = shortMeasureRef.current;

    if (!card || !headerCopy || !leading || !fullMeasure || !shortMeasure) return;

    const cardWidth = card.clientWidth;
    if (!cardWidth || cardWidth > mobileMaxWidth) {
      setMode('full');
      return;
    }

    const gap = 10;
    let availableWidth = headerCopy.clientWidth;

    if (header) {
      const headerStyles = window.getComputedStyle(header);
      const headerGap = parseFloat(headerStyles.columnGap || headerStyles.gap || '0') || 0;
      const paddingInline =
        (parseFloat(headerStyles.paddingLeft || '0') || 0) +
        (parseFloat(headerStyles.paddingRight || '0') || 0);
      const trailingWidth = trailing?.offsetWidth || 0;
      const headerAvailable = header.clientWidth - paddingInline - trailingWidth - headerGap;
      if (headerAvailable > 0) {
        availableWidth = Math.max(Math.min(headerCopy.clientWidth, headerAvailable), 0);
      }
    }

    const leadingWidth = leading.offsetWidth;
    const fullWidth = leadingWidth + gap + fullMeasure.offsetWidth;
    const shortWidth = leadingWidth + gap + shortMeasure.offsetWidth;

    if (fullWidth <= availableWidth) {
      setMode('full');
      return;
    }

    if (shortWidth <= availableWidth) {
      setMode('short');
      return;
    }

    setMode('hidden');
  }, [mobileMaxWidth]);

  useLayoutEffect(() => {
    if (!enabled) return;
    updateMode();
  }, [enabled, fullLabel, shortLabel, updateMode]);

  useEffect(() => {
    if (!enabled) return undefined;

    const card = cardRef.current;
    const topline = toplineRef.current;
    if (!card || !topline || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => updateMode());
    observer.observe(card);
    observer.observe(topline);
    window.addEventListener('resize', updateMode);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateMode);
    };
  }, [enabled, updateMode]);

  return {
    mode,
    cardRef,
    headerRef,
    headerCopyRef,
    toplineRef,
    leadingRef,
    trailingRef,
    fullMeasureRef,
    shortMeasureRef
  };
};
