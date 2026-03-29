import { useCallback, useEffect, useState } from 'react';
import { hasLoadedImageSource, markImageSourceLoaded } from '../utils/imageLoadCache';

export function useSharedImageLoadState(src, enabled = true) {
  const [isLoaded, setIsLoaded] = useState(() => Boolean(enabled && src && hasLoadedImageSource(src)));

  useEffect(() => {
    if (!enabled || !src) {
      setIsLoaded(false);
      return;
    }

    setIsLoaded(hasLoadedImageSource(src));
  }, [enabled, src]);

  const markLoaded = useCallback(() => {
    if (src) {
      markImageSourceLoaded(src);
    }
    setIsLoaded(true);
  }, [src]);

  return {
    isLoaded,
    setIsLoaded,
    markLoaded
  };
}
