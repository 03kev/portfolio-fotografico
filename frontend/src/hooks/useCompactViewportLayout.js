import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

export const useCompactViewportLayout = ({
  maxWidth = 1120,
  maxHeight = 860
} = {}) => {
  const [isCompactViewport, setIsCompactViewport] = useState(false);

  const computeValue = useCallback(() => {
    if (typeof window === 'undefined') return false;

    return window.innerWidth <= maxWidth || window.innerHeight <= maxHeight;
  }, [maxHeight, maxWidth]);

  useLayoutEffect(() => {
    setIsCompactViewport(computeValue());
  }, [computeValue]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateValue = () => setIsCompactViewport(computeValue());

    window.addEventListener('resize', updateValue);
    return () => window.removeEventListener('resize', updateValue);
  }, [computeValue]);

  return isCompactViewport;
};
