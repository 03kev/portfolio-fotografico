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

export { useCompactViewportLayout } from './useCompactViewportLayout';
export { useAutoHideOnScroll } from './useAutoHideOnScroll';

export { useMobileDeviceLayout } from './useMobileDeviceLayout';
export { useMeasuredLayoutMode } from './useMeasuredLayoutMode';
export { useTouchLongPressReveal } from './useTouchLongPressReveal';
export { useHeaderDesktopLayoutMode, HEADER_LAYOUT_MODE } from './useHeaderDesktopLayoutMode';
export { useGalleryMobileCardState } from './useGalleryMobileCardState';
export { useScrollableRail } from './useScrollableRail';
