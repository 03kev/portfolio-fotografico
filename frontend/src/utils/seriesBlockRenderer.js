import {
  assertSeriesBlockTypeCoverage,
  normalizeBlockType
} from '@portfolio/series-content-contract';

export function renderSeriesBlockByType(block, renderers, consumer) {
  const rendererEntries = Object.entries(renderers || {});
  const invalidRenderer = rendererEntries.find(([, renderer]) => typeof renderer !== 'function');
  if (invalidRenderer) {
    throw new TypeError(
      `${consumer || 'Renderer serie'} non implementa "${invalidRenderer[0]}" con una funzione.`
    );
  }

  assertSeriesBlockTypeCoverage(
    rendererEntries.map(([type]) => type),
    consumer || 'Renderer serie'
  );
  const type = normalizeBlockType(block?.type);
  return renderers[type](block);
}
