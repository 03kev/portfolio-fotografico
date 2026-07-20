import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SCALE = 4;
const DOUBLE_TAP_DELAY = 280;
const DOUBLE_TAP_DISTANCE = 28;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getDistance = ([first, second]) => Math.hypot(
  first.clientX - second.clientX,
  first.clientY - second.clientY
);

const getMidpoint = ([first, second]) => ({
  x: (first.clientX + second.clientX) / 2,
  y: (first.clientY + second.clientY) / 2
});

/**
 * Keeps the hot path outside React: touch moves only update a composited CSS
 * transform on the image once per animation frame.
 */
export const useImagePinchZoom = ({ enabled, resetKey }) => {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const gestureRef = useRef({
    pointers: new Map(),
    scale: 1,
    translateX: 0,
    translateY: 0,
    panStartX: 0,
    panStartY: 0,
    pinchStartDistance: 0,
    pinchStartScale: 1,
    pinchStartTranslateX: 0,
    pinchStartTranslateY: 0,
    pinchStartMidpoint: null,
    frameId: null,
    lastTap: null
  });
  const [isZoomed, setIsZoomed] = useState(false);

  const syncZoomState = useCallback((scale) => {
    const nextIsZoomed = scale > 1.01;
    setIsZoomed((current) => (current === nextIsZoomed ? current : nextIsZoomed));
  }, []);

  const getBounds = useCallback((scale) => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image) return { x: 0, y: 0 };

    return {
      x: Math.max(0, (image.offsetWidth * scale - container.clientWidth) / 2),
      y: Math.max(0, (image.offsetHeight * scale - container.clientHeight) / 2)
    };
  }, []);

  const constrainPosition = useCallback((scale, translateX, translateY) => {
    const bounds = getBounds(scale);
    return {
      x: clamp(translateX, -bounds.x, bounds.x),
      y: clamp(translateY, -bounds.y, bounds.y)
    };
  }, [getBounds]);

  const render = useCallback((withTransition = false) => {
    const image = imageRef.current;
    const gesture = gestureRef.current;
    if (!image) return;

    image.style.transition = withTransition ? 'transform 180ms ease-out' : 'none';
    image.style.transform = `translate3d(${gesture.translateX}px, ${gesture.translateY}px, 0) scale(${gesture.scale})`;
  }, []);

  const queueRender = useCallback(() => {
    const gesture = gestureRef.current;
    if (gesture.frameId !== null) return;

    gesture.frameId = window.requestAnimationFrame(() => {
      gesture.frameId = null;
      render();
    });
  }, [render]);

  const applyTransform = useCallback((scale, translateX, translateY, withTransition = false) => {
    const gesture = gestureRef.current;
    const nextScale = clamp(scale, 1, MAX_SCALE);
    const position = constrainPosition(nextScale, translateX, translateY);
    gesture.scale = nextScale;
    gesture.translateX = position.x;
    gesture.translateY = position.y;
    render(withTransition);
    syncZoomState(nextScale);
  }, [constrainPosition, render, syncZoomState]);

  const reset = useCallback((withTransition = false) => {
    applyTransform(1, 0, 0, withTransition);
  }, [applyTransform]);

  const zoomIn = useCallback((withTransition = true) => {
    applyTransform(2, 0, 0, withTransition);
  }, [applyTransform]);

  const toggle = useCallback(() => {
    if (gestureRef.current.scale > 1.01) reset(true);
    else zoomIn(true);
  }, [reset, zoomIn]);

  useEffect(() => {
    reset();
  }, [reset, resetKey]);

  useEffect(() => () => {
    const frameId = gestureRef.current.frameId;
    if (frameId !== null) window.cancelAnimationFrame(frameId);
  }, []);

  const handlePointerDown = useCallback((event) => {
    if (!enabled || event.pointerType === 'mouse') return;

    const gesture = gestureRef.current;
    gesture.pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });

    const pointers = [...gesture.pointers.values()];
    if (pointers.length > 1 || gesture.scale > 1.01) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (pointers.length === 1) {
      const lastTap = gesture.lastTap;
      const isDoubleTap = lastTap
        && event.timeStamp - lastTap.time < DOUBLE_TAP_DELAY
        && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < DOUBLE_TAP_DISTANCE;

      if (isDoubleTap) {
        const container = containerRef.current;
        const nextScale = gesture.scale > 1.01 ? 1 : 2;
        const localX = container ? event.clientX - container.getBoundingClientRect().left - container.clientWidth / 2 : 0;
        const localY = container ? event.clientY - container.getBoundingClientRect().top - container.clientHeight / 2 : 0;
        applyTransform(nextScale, -localX * (nextScale - 1), -localY * (nextScale - 1), true);
        gesture.lastTap = null;
      } else {
        gesture.lastTap = { time: event.timeStamp, x: event.clientX, y: event.clientY };
      }

      gesture.panStartX = event.clientX - gesture.translateX;
      gesture.panStartY = event.clientY - gesture.translateY;
      return;
    }

    if (pointers.length === 2) {
      const midpoint = getMidpoint(pointers);
      gesture.pinchStartDistance = getDistance(pointers);
      gesture.pinchStartScale = gesture.scale;
      gesture.pinchStartTranslateX = gesture.translateX;
      gesture.pinchStartTranslateY = gesture.translateY;
      gesture.pinchStartMidpoint = midpoint;
    }
  }, [applyTransform, enabled]);

  const handlePointerMove = useCallback((event) => {
    if (!enabled || event.pointerType === 'mouse') return;

    const gesture = gestureRef.current;
    if (!gesture.pointers.has(event.pointerId)) return;
    gesture.pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });

    const pointers = [...gesture.pointers.values()];
    if (pointers.length >= 2 && gesture.pinchStartDistance) {
      const midpoint = getMidpoint(pointers);
      const nextScale = clamp(gesture.pinchStartScale * (getDistance(pointers) / gesture.pinchStartDistance), 1, MAX_SCALE);
      const nextX = gesture.pinchStartTranslateX + midpoint.x - gesture.pinchStartMidpoint.x;
      const nextY = gesture.pinchStartTranslateY + midpoint.y - gesture.pinchStartMidpoint.y;
      const position = constrainPosition(nextScale, nextX, nextY);
      gesture.scale = nextScale;
      gesture.translateX = position.x;
      gesture.translateY = position.y;
      syncZoomState(nextScale);
      queueRender();
      event.preventDefault();
      return;
    }

    if (pointers.length === 1 && gesture.scale > 1.01) {
      const position = constrainPosition(
        gesture.scale,
        event.clientX - gesture.panStartX,
        event.clientY - gesture.panStartY
      );
      gesture.translateX = position.x;
      gesture.translateY = position.y;
      queueRender();
      event.preventDefault();
    }
  }, [constrainPosition, enabled, queueRender, syncZoomState]);

  const handlePointerEnd = useCallback((event) => {
    if (!enabled || event.pointerType === 'mouse') return;

    const gesture = gestureRef.current;
    gesture.pointers.delete(event.pointerId);

    const pointers = [...gesture.pointers.values()];
    if (pointers.length === 1) {
      const pointer = pointers[0];
      gesture.panStartX = pointer.clientX - gesture.translateX;
      gesture.panStartY = pointer.clientY - gesture.translateY;
      return;
    }

    gesture.pinchStartDistance = 0;
    gesture.pinchStartMidpoint = null;
    if (gesture.scale < 1.05) reset(true);
  }, [enabled, reset]);

  return {
    containerRef,
    imageRef,
    isZoomed,
    reset,
    toggle,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd
    }
  };
};
