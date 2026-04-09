import { useCallback } from 'react';
import { useMeasuredLayoutMode } from './useMeasuredLayoutMode';

export const HEADER_LAYOUT_MODE = {
  MOBILE: 'mobile',
  INLINE_FULL: 'inline-full',
  INLINE_COMPACT_UPLOAD: 'inline-compact-upload',
  STACKED_FULL: 'stacked-full',
  STACKED_COMPACT_UPLOAD: 'stacked-compact-upload',
  STACKED_COMPACT_BRAND: 'stacked-compact-brand'
};

const CENTER_SAFETY_GAP = 112;
const TOP_ROW_GAP = 24;

export const useHeaderDesktopLayoutMode = ({
  useMobileNav,
  navRef,
  brandFullMeasureRef,
  brandCompactMeasureRef,
  rightFullMeasureRef,
  rightCompactMeasureRef,
  navMeasureRef
}) => {
  const resolveDesktopLayoutMode = useCallback(() => {
    if (useMobileNav) return HEADER_LAYOUT_MODE.MOBILE;
    if (
      !navRef.current ||
      !brandFullMeasureRef.current ||
      !brandCompactMeasureRef.current ||
      !rightFullMeasureRef.current ||
      !rightCompactMeasureRef.current ||
      !navMeasureRef.current
    ) {
      return HEADER_LAYOUT_MODE.INLINE_FULL;
    }

    const navStyles = window.getComputedStyle(navRef.current);
    const paddingInline =
      (parseFloat(navStyles.paddingLeft || '0') || 0) +
      (parseFloat(navStyles.paddingRight || '0') || 0);
    const availableWidth = Math.max(navRef.current.clientWidth - paddingInline, 0);

    const brandFullWidth = brandFullMeasureRef.current.offsetWidth;
    const brandCompactWidth = brandCompactMeasureRef.current.offsetWidth;
    const rightFullWidth = rightFullMeasureRef.current.offsetWidth;
    const rightCompactWidth = rightCompactMeasureRef.current.offsetWidth;
    const navLinksWidth = navMeasureRef.current.scrollWidth;

    const fitsInline = (brandWidth, rightWidth) => {
      const sideWidth = Math.max(brandWidth, rightWidth);
      return availableWidth >= sideWidth * 2 + navLinksWidth + CENTER_SAFETY_GAP;
    };

    const fitsStacked = (brandWidth, rightWidth) => {
      return availableWidth >= brandWidth + rightWidth + TOP_ROW_GAP;
    };

    if (fitsInline(brandFullWidth, rightFullWidth)) return HEADER_LAYOUT_MODE.INLINE_FULL;
    if (fitsInline(brandFullWidth, rightCompactWidth)) return HEADER_LAYOUT_MODE.INLINE_COMPACT_UPLOAD;
    if (fitsStacked(brandFullWidth, rightFullWidth)) return HEADER_LAYOUT_MODE.STACKED_FULL;
    if (fitsStacked(brandFullWidth, rightCompactWidth)) return HEADER_LAYOUT_MODE.STACKED_COMPACT_UPLOAD;
    if (fitsStacked(brandCompactWidth, rightCompactWidth)) return HEADER_LAYOUT_MODE.STACKED_COMPACT_BRAND;

    return HEADER_LAYOUT_MODE.STACKED_COMPACT_BRAND;
  }, [
    brandCompactMeasureRef,
    brandFullMeasureRef,
    navMeasureRef,
    navRef,
    rightCompactMeasureRef,
    rightFullMeasureRef,
    useMobileNav
  ]);

  const layoutMode = useMeasuredLayoutMode({
    enabled: true,
    initialMode: HEADER_LAYOUT_MODE.INLINE_FULL,
    observedRefs: [
      navRef,
      brandFullMeasureRef,
      brandCompactMeasureRef,
      rightFullMeasureRef,
      rightCompactMeasureRef,
      navMeasureRef
    ],
    resolveMode: resolveDesktopLayoutMode
  });

  return {
    layoutMode,
    compactDesktopNav: !useMobileNav && layoutMode.startsWith('stacked'),
    compactBrand: layoutMode === HEADER_LAYOUT_MODE.STACKED_COMPACT_BRAND,
    compactUpload:
      layoutMode === HEADER_LAYOUT_MODE.INLINE_COMPACT_UPLOAD ||
      layoutMode === HEADER_LAYOUT_MODE.STACKED_COMPACT_UPLOAD ||
      layoutMode === HEADER_LAYOUT_MODE.STACKED_COMPACT_BRAND
  };
};
