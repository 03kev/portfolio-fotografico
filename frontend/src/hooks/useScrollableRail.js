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
      setFadeState((current) => (
        current.left || current.right ? { left: false, right: false } : current
      ));
      return undefined;
    }

    const updateRailFade = () => {
      const { scrollLeft, clientWidth, scrollWidth } = railNode;
      const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
      const threshold = 6;
      const nextFadeState = {
        left: scrollLeft > threshold,
        right: scrollLeft < maxScrollLeft - threshold
      };

      setFadeState((current) => (
        current.left === nextFadeState.left && current.right === nextFadeState.right
          ? current
          : nextFadeState
      ));
    };

    let scrollFrame = null;
    const scheduleRailFadeUpdate = () => {
      if (scrollFrame !== null) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        updateRailFade();
      });
    };

    updateRailFade();
    railNode.addEventListener('scroll', scheduleRailFadeUpdate, { passive: true });
    window.addEventListener('resize', updateRailFade);

    return () => {
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      railNode.removeEventListener('scroll', scheduleRailFadeUpdate);
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
