import { css } from 'styled-components';

export const viewportBreakpoints = Object.freeze({
  phone: 480,
  compact: 680,
  tablet: 768,
  laptop: 1024,
  desktop: 1280,
  wide: 1440
});

export const viewportHeights = Object.freeze({
  compact: 860,
  short: 740
});

const resolveValue = (collection, keyOrValue) => {
  if (typeof keyOrValue === 'number') {
    return keyOrValue;
  }

  return collection[keyOrValue];
};

const toPx = (value) => `${value}px`;

const buildMaxWidth = (value) => `screen and (max-width: ${toPx(value)})`;
const buildMinWidth = (value) => `screen and (min-width: ${toPx(value)})`;
const buildMaxHeight = (value) => `screen and (max-height: ${toPx(value)})`;
const buildMinHeight = (value) => `screen and (min-height: ${toPx(value)})`;

export const media = Object.freeze({
  down: (breakpoint) => (...args) => css`
    @media ${buildMaxWidth(resolveValue(viewportBreakpoints, breakpoint))} {
      ${css(...args)}
    }
  `,
  up: (breakpoint) => (...args) => css`
    @media ${buildMinWidth(resolveValue(viewportBreakpoints, breakpoint))} {
      ${css(...args)}
    }
  `,
  heightDown: (breakpoint) => (...args) => css`
    @media ${buildMaxHeight(resolveValue(viewportHeights, breakpoint))} {
      ${css(...args)}
    }
  `,
  heightUp: (breakpoint) => (...args) => css`
    @media ${buildMinHeight(resolveValue(viewportHeights, breakpoint))} {
      ${css(...args)}
    }
  `
});

export const container = Object.freeze({
  down: (breakpoint) => (...args) => css`
    @container (max-width: ${toPx(resolveValue(viewportBreakpoints, breakpoint))}) {
      ${css(...args)}
    }
  `,
  up: (breakpoint) => (...args) => css`
    @container (min-width: ${toPx(resolveValue(viewportBreakpoints, breakpoint))}) {
      ${css(...args)}
    }
  `
});

