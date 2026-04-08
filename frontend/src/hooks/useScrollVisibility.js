import { useEffect, useRef, useState } from 'react';

export const useScrollVisibility = ({
  enabled = true,
  topOffset = 24,
  hideThreshold = 28,
  showThreshold = 12
} = {}) => {
  const [hidden, setHidden] = useState(false);
  const lastScrollYRef = useRef(0);
  const downDeltaRef = useRef(0);
  const upDeltaRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setHidden(false);
      return undefined;
    }

    lastScrollYRef.current = window.scrollY;
    downDeltaRef.current = 0;
    upDeltaRef.current = 0;
    setHidden(false);

    const handleScroll = () => {
      const nextY = Math.max(window.scrollY, 0);
      const previousY = lastScrollYRef.current;
      const delta = nextY - previousY;
      lastScrollYRef.current = nextY;

      if (nextY <= topOffset) {
        downDeltaRef.current = 0;
        upDeltaRef.current = 0;
        setHidden(false);
        return;
      }

      if (delta > 0) {
        downDeltaRef.current += delta;
        upDeltaRef.current = 0;

        if (downDeltaRef.current >= hideThreshold) {
          setHidden(true);
          downDeltaRef.current = 0;
        }
        return;
      }

      if (delta < 0) {
        upDeltaRef.current += Math.abs(delta);
        downDeltaRef.current = 0;

        if (upDeltaRef.current >= showThreshold) {
          setHidden(false);
          upDeltaRef.current = 0;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [enabled, hideThreshold, showThreshold, topOffset]);

  return hidden;
};
