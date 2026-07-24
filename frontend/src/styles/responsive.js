import { css } from 'styled-components';

export const viewportBreakpoints = Object.freeze({
  // These names describe available width, never a device category.
  narrow: 480,
  small: 640,
  medium: 768,
  content: 900,
  large: 1024
});

export const viewportHeights = Object.freeze({
  compact: 860,
  short: 740
});

const resolveValue = (collection, keyOrValue) => {
  if (typeof keyOrValue === 'number') {
    return keyOrValue;
  }

  const value = collection[keyOrValue];
  if (typeof value !== 'number') {
    throw new Error(`[responsive] Unknown breakpoint: ${String(keyOrValue)}`);
  }
  return value;
};

const toPx = (value) => `${value}px`;

const buildMaxWidth = (value) => `(max-width: ${toPx(value)})`;
const buildMinWidth = (value) => `(min-width: ${toPx(value)})`;
const buildMaxHeight = (value) => `(max-height: ${toPx(value)})`;
const buildMinHeight = (value) => `(min-height: ${toPx(value)})`;

export const viewportQueries = Object.freeze({
  down: (breakpoint) => buildMaxWidth(resolveValue(viewportBreakpoints, breakpoint)),
  up: (breakpoint) => buildMinWidth(resolveValue(viewportBreakpoints, breakpoint)),
  heightDown: (breakpoint) => buildMaxHeight(resolveValue(viewportHeights, breakpoint)),
  heightUp: (breakpoint) => buildMinHeight(resolveValue(viewportHeights, breakpoint)),
  constrained: ({ maxWidth, maxHeight }) => [
    buildMaxWidth(resolveValue(viewportBreakpoints, maxWidth)),
    buildMaxHeight(resolveValue(viewportHeights, maxHeight))
  ].join(', ')
});

export const inputQueries = Object.freeze({
  primaryCoarse: '(pointer: coarse)',
  cannotHover: '(hover: none)',
  anyCoarse: '(any-pointer: coarse)'
});

export const preferenceQueries = Object.freeze({
  reducedMotion: '(prefers-reduced-motion: reduce)'
});

export const combineMediaQueries = (...queries) => queries.filter(Boolean).join(' and ');

export const media = Object.freeze({
  down: (breakpoint) => (...args) => css`
    @media ${viewportQueries.down(breakpoint)} {
      ${css(...args)}
    }
  `,
  up: (breakpoint) => (...args) => css`
    @media ${viewportQueries.up(breakpoint)} {
      ${css(...args)}
    }
  `,
  heightDown: (breakpoint) => (...args) => css`
    @media ${viewportQueries.heightDown(breakpoint)} {
      ${css(...args)}
    }
  `,
  heightUp: (breakpoint) => (...args) => css`
    @media ${viewportQueries.heightUp(breakpoint)} {
      ${css(...args)}
    }
  `
});
