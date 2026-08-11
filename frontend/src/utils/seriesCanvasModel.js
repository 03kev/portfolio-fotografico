import {
  assertSeriesBlockTypeCoverage,
  getSeriesBlockDefinition,
  normalizeBlockType
} from '@portfolio/series-content-contract';

const SERIES_CANVAS_BLOCK_FACTORIES = Object.freeze({
  text: ({ id, layout }) => ({
    id,
    type: 'text',
    content: '',
    layout,
    textAlign: 'left',
    textSize: 'base',
    textBold: false,
    textItalic: false,
    textUnderline: false,
    textMono: false,
    textFont: 'inter'
  }),
  photo: ({ id, layout, photoIds }) => ({
    id,
    type: 'photo',
    content: photoIds[0],
    layout,
    showTitle: true,
    showLightbox: true
  }),
  photos: ({ id, layout }) => ({
    id,
    type: 'photos',
    content: [],
    layout
  })
});

assertSeriesBlockTypeCoverage(
  Object.keys(SERIES_CANVAS_BLOCK_FACTORIES),
  'SeriesDetail: factory canvas'
);

export function getSeriesCanvasDefaultLayout(type, { x = 0, y = 0 } = {}) {
  const canonicalType = normalizeBlockType(type);
  const defaults = getSeriesBlockDefinition(canonicalType).canvasDefaultLayout;
  return { ...defaults, x, y, unit: 'grid' };
}

export function createSeriesCanvasBlock({
  type,
  id,
  photoIds = [],
  layout
}) {
  const canonicalType = normalizeBlockType(type);
  const factory = SERIES_CANVAS_BLOCK_FACTORIES[canonicalType];
  return factory({ id, layout, photoIds });
}

