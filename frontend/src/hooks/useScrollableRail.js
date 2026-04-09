import { useEffect, useRef, useState } from 'react';

export const useScrollableRail = ({
  activeKey,
  itemCount = 0,
  enabled = true
} = {}) => {
  const railRef = useRef(null);
  const itemRefs = useRef(new Map());
  const [fadeState, setFadeState] = useState({ left: false, right: false });

  useEffect(() => {
    const railNode = railRef.current;
    if (!enabled || !railNode) {
      setFadeState({ left: false, right: false });
      return undefined;
    }

    const updateRailFade = () => {
      const { scrollLeft, clientWidth, scrollWidth } = railNode;
      const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
      const threshold = 6;

      setFadeState({
        left: scrollLeft > threshold,
        right: scrollLeft < maxScrollLeft - threshold
      });
    };

    updateRailFade();
    railNode.addEventListener('scroll', updateRailFade, { passive: true });
    window.addEventListener('resize', updateRailFade);

    return () => {
      railNode.removeEventListener('scroll', updateRailFade);
      window.removeEventListener('resize', updateRailFade);
    };
  }, [enabled, itemCount]);

  useEffect(() => {
    if (!enabled) return undefined;

    const railNode = railRef.current;
    const activeButton = itemRefs.current.get(activeKey);
    if (!railNode || !activeButton) return undefined;

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        activeButton.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [activeKey, enabled, itemCount]);

  return {
    railRef,
    itemRefs,
    fadeState
  };
};
