import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

const MOBILE_LIKE_DEVICE_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|SamsungBrowser/i;

const getMobileDeviceLayout = (maxWidth) => {
  if (typeof window === 'undefined') return false;

  const narrowViewportQuery = window.matchMedia(`(max-width: ${maxWidth}px)`);
  const hoverNoneQuery = window.matchMedia('(hover: none)');
  const coarsePointerQuery = window.matchMedia('(pointer: coarse)');
  const ua = window.navigator.userAgent || '';
  const touchCapable = window.navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const mobileLikeDevice = MOBILE_LIKE_DEVICE_REGEX.test(ua);

  return (
    narrowViewportQuery.matches &&
    (touchCapable || mobileLikeDevice || hoverNoneQuery.matches || coarsePointerQuery.matches)
  );
};

export const useMobileDeviceLayout = ({ maxWidth = 768 } = {}) => {
  const [isMobileDeviceLayout, setIsMobileDeviceLayout] = useState(() => getMobileDeviceLayout(maxWidth));

  const computeValue = useCallback(() => getMobileDeviceLayout(maxWidth), [maxWidth]);

  useLayoutEffect(() => {
    setIsMobileDeviceLayout(computeValue());
  }, [computeValue]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const queries = [
      window.matchMedia(`(max-width: ${maxWidth}px)`),
      window.matchMedia('(hover: none)'),
      window.matchMedia('(pointer: coarse)')
    ];

    const updateValue = () => setIsMobileDeviceLayout(computeValue());

    window.addEventListener('resize', updateValue);
    queries.forEach((query) => query.addEventListener?.('change', updateValue));

    return () => {
      window.removeEventListener('resize', updateValue);
      queries.forEach((query) => query.removeEventListener?.('change', updateValue));
    };
  }, [computeValue, maxWidth]);

  return isMobileDeviceLayout;
};
