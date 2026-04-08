import { useEffect, useRef, useState } from 'react';

export const useAutoHideOnScroll = ({
  enabled = true,
  topVisibleOffset = 24,
  hideDelta = 18,
  showDelta = 12
} = {}) => {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setIsVisible(true);
      return undefined;
    }

    lastScrollYRef.current = window.scrollY;
    let ticking = false;

    const updateVisibility = () => {
      ticking = false;

      const currentScrollY = Math.max(window.scrollY, 0);
      const previousScrollY = lastScrollYRef.current;
      const delta = currentScrollY - previousScrollY;

      if (currentScrollY <= topVisibleOffset) {
        setIsVisible(true);
      } else if (delta >= hideDelta) {
        setIsVisible(false);
      } else if (delta <= -showDelta) {
        setIsVisible(true);
      }

      lastScrollYRef.current = currentScrollY;
    };

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateVisibility);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [enabled, hideDelta, showDelta, topVisibleOffset]);

  return isVisible;
};
