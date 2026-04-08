import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getDistance = (touchA, touchB) => {
  const dx = touchA.clientX - touchB.clientX;
  const dy = touchA.clientY - touchB.clientY;
  return Math.hypot(dx, dy);
};

const getMidpoint = (touchA, touchB) => ({
  x: (touchA.clientX + touchB.clientX) / 2,
  y: (touchA.clientY + touchB.clientY) / 2
});

export const useTouchImageZoom = ({
  enabled = true,
  maxScale = 3,
  doubleTapScale = 2.2
} = {}) => {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const gestureRef = useRef({
    mode: null,
    startDistance: 0,
    startScale: 1,
    startOffsetX: 0,
    startOffsetY: 0,
    startTouchX: 0,
    startTouchY: 0
  });
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    gestureRef.current.mode = null;
  }, []);

  useEffect(() => {
    if (!enabled) {
      resetZoom();
    }
  }, [enabled, resetZoom]);

  const clampOffset = useCallback((nextScale, nextOffset) => {
    const containerNode = containerRef.current;
    const imageNode = imageRef.current;

    if (!containerNode || !imageNode || nextScale <= 1) {
      return { x: 0, y: 0 };
    }

    const containerWidth = containerNode.clientWidth;
    const containerHeight = containerNode.clientHeight;
    const imageWidth = imageNode.offsetWidth;
    const imageHeight = imageNode.offsetHeight;

    const maxOffsetX = Math.max((imageWidth * nextScale - containerWidth) / 2, 0);
    const maxOffsetY = Math.max((imageHeight * nextScale - containerHeight) / 2, 0);

    return {
      x: clamp(nextOffset.x, -maxOffsetX, maxOffsetX),
      y: clamp(nextOffset.y, -maxOffsetY, maxOffsetY)
    };
  }, []);

  const zoomTo = useCallback((nextScale, nextOffset = offset) => {
    const boundedScale = clamp(nextScale, 1, maxScale);
    const boundedOffset = clampOffset(boundedScale, nextOffset);
    setScale(boundedScale);
    setOffset(boundedOffset);
  }, [clampOffset, maxScale, offset]);

  const toggleZoomAtTap = useCallback((touch) => {
    const containerNode = containerRef.current;
    if (!containerNode) {
      zoomTo(scale > 1 ? 1 : doubleTapScale);
      return;
    }

    if (scale > 1) {
      resetZoom();
      return;
    }

    const rect = containerNode.getBoundingClientRect();
    const tapX = touch.clientX - rect.left - rect.width / 2;
    const tapY = touch.clientY - rect.top - rect.height / 2;
    const targetScale = doubleTapScale;
    const targetOffset = {
      x: -tapX * (targetScale - 1) / targetScale,
      y: -tapY * (targetScale - 1) / targetScale
    };

    zoomTo(targetScale, targetOffset);
  }, [doubleTapScale, resetZoom, scale, zoomTo]);

  const onTouchStart = useCallback((event) => {
    if (!enabled) return;

    const touches = event.touches;

    if (touches.length === 2) {
      const midpoint = getMidpoint(touches[0], touches[1]);
      gestureRef.current = {
        mode: 'pinch',
        startDistance: getDistance(touches[0], touches[1]),
        startScale: scale,
        startOffsetX: offset.x,
        startOffsetY: offset.y,
        startTouchX: midpoint.x,
        startTouchY: midpoint.y
      };
      return;
    }

    if (touches.length !== 1) return;

    const touch = touches[0];
    const now = Date.now();
    const lastTap = lastTapRef.current;
    const timeSinceLastTap = now - lastTap.time;
    const closeEnough =
      Math.abs(touch.clientX - lastTap.x) < 24 &&
      Math.abs(touch.clientY - lastTap.y) < 24;

    if (timeSinceLastTap < 280 && closeEnough) {
      lastTapRef.current = { time: 0, x: 0, y: 0 };
      toggleZoomAtTap(touch);
      return;
    }

    lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };

    if (scale > 1) {
      gestureRef.current = {
        mode: 'pan',
        startDistance: 0,
        startScale: scale,
        startOffsetX: offset.x,
        startOffsetY: offset.y,
        startTouchX: touch.clientX,
        startTouchY: touch.clientY
      };
    }
  }, [enabled, offset.x, offset.y, scale, toggleZoomAtTap]);

  const onTouchMove = useCallback((event) => {
    if (!enabled) return;

    const touches = event.touches;
    const gesture = gestureRef.current;

    if (touches.length === 2) {
      if (event.cancelable) event.preventDefault();

      const nextDistance = getDistance(touches[0], touches[1]);
      const scaleRatio = gesture.startDistance ? nextDistance / gesture.startDistance : 1;
      const nextScale = clamp(gesture.startScale * scaleRatio, 1, maxScale);
      const nextOffset = clampOffset(nextScale, {
        x: gesture.startOffsetX,
        y: gesture.startOffsetY
      });

      setScale(nextScale);
      setOffset(nextOffset);
      return;
    }

    if (touches.length === 1 && gesture.mode === 'pan' && scale > 1) {
      if (event.cancelable) event.preventDefault();

      const touch = touches[0];
      const nextOffset = clampOffset(scale, {
        x: gesture.startOffsetX + (touch.clientX - gesture.startTouchX),
        y: gesture.startOffsetY + (touch.clientY - gesture.startTouchY)
      });

      setOffset(nextOffset);
    }
  }, [clampOffset, enabled, maxScale, scale]);

  const onTouchEnd = useCallback((event) => {
    if (!enabled) return;

    if (event.touches.length === 0) {
      gestureRef.current.mode = null;
      if (scale <= 1.01) {
        resetZoom();
      }
      return;
    }

    if (event.touches.length === 1 && scale > 1) {
      const touch = event.touches[0];
      gestureRef.current = {
        mode: 'pan',
        startDistance: 0,
        startScale: scale,
        startOffsetX: offset.x,
        startOffsetY: offset.y,
        startTouchX: touch.clientX,
        startTouchY: touch.clientY
      };
    }
  }, [enabled, offset.x, offset.y, resetZoom, scale]);

  const bind = useMemo(() => ({
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd
  }), [onTouchEnd, onTouchMove, onTouchStart]);

  const transformStyle = useMemo(() => ({
    transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
    transition: gestureRef.current.mode ? 'none' : 'transform 0.22s ease',
    transformOrigin: 'center center'
  }), [offset.x, offset.y, scale]);

  return {
    bind,
    containerRef,
    imageRef,
    isZoomed: scale > 1.01,
    resetZoom,
    scale,
    style: transformStyle
  };
};
