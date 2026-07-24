import { useEffect, useState } from 'react';

export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

export { useAutoHideOnScroll } from './useAutoHideOnScroll';
export { useMediaQuery } from './useMediaQuery';
export { useMeasuredLayoutMode } from './useMeasuredLayoutMode';
export { useTouchLongPressReveal } from './useTouchLongPressReveal';
export { useHeaderDesktopLayoutMode, HEADER_LAYOUT_MODE } from './useHeaderDesktopLayoutMode';
export { useGalleryTouchCardState } from './useGalleryTouchCardState';
export { useScrollableRail } from './useScrollableRail';
