import { useCallback, useEffect, useState } from 'react';
import { hasLoadedImageSource, markImageSourceLoaded } from '../utils/imageLoadCache';

export function useSharedImageLoadState(src, enabled = true) {
  const [loadedSource, setLoadedSource] = useState(() => (
    enabled && src && hasLoadedImageSource(src) ? src : ''
  ));
  const isLoaded = Boolean(enabled && src && loadedSource === src);

  useEffect(() => {
    if (!enabled || !src) {
      setLoadedSource('');
      return;
    }

    setLoadedSource(hasLoadedImageSource(src) ? src : '');
  }, [enabled, src]);

  const setIsLoaded = useCallback((nextLoaded) => {
    setLoadedSource(nextLoaded ? src : '');
  }, [src]);

  const markLoaded = useCallback(() => {
    if (src) {
      markImageSourceLoaded(src);
    }
    setLoadedSource(src || '');
  }, [src]);

  return {
    isLoaded,
    setIsLoaded,
    markLoaded
  };
}
