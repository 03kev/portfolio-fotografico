import {
  SERIES_BLOCK_DEFINITIONS,
  SERIES_BLOCK_TYPES
} from '@portfolio/series-content-contract';
import {
  createSeriesCanvasBlock,
  getSeriesCanvasDefaultLayout
} from '../utils/seriesCanvasModel';
import { renderSeriesBlockByType } from '../utils/seriesBlockRenderer';

describe('series block consumer coverage', () => {
  test('desktop/responsive dispatch cannot silently omit a contract type', () => {
    const renderers = Object.fromEntries(
      SERIES_BLOCK_TYPES.map((type) => [type, () => `rendered:${type}`])
    );

    SERIES_BLOCK_TYPES.forEach((type) => {
      expect(renderSeriesBlockByType({ type }, renderers, 'test renderer'))
        .toBe(`rendered:${type}`);
    });

    expect(() => renderSeriesBlockByType(
      { type: 'text' },
      { text: () => 'text', photo: () => 'photo' },
      'incomplete renderer'
    )).toThrow('non copre il contratto dei tipi');

    expect(() => renderSeriesBlockByType(
      { type: 'video' },
      renderers,
      'test renderer'
    )).toThrow('Tipo di blocco serie non supportato');
  });

  test('canvas smoke: all three blocks use the intentional visual defaults', () => {
    const expectedLayouts = {
      text: { x: 3, y: 7, w: 15, h: 9, unit: 'grid' },
      photo: { x: 3, y: 7, w: 15, h: 22, unit: 'grid' },
      photos: { x: 3, y: 7, w: 16, h: 18, unit: 'grid' }
    };

    SERIES_BLOCK_DEFINITIONS.forEach((definition) => {
      const layout = getSeriesCanvasDefaultLayout(definition.type, { x: 3, y: 7 });
      const block = createSeriesCanvasBlock({
        type: definition.type,
        id: `canvas-${definition.type}`,
        photoIds: [101],
        layout
      });

      expect(layout).toEqual(expectedLayouts[definition.type]);
      expect(block.type).toBe(definition.type);
      expect(block.layout).toEqual(expectedLayouts[definition.type]);
    });
  });

  test('wizard and canvas defaults remain distinct product decisions', () => {
    SERIES_BLOCK_DEFINITIONS.forEach((definition) => {
      expect(definition.defaultLayout).toBeDefined();
      expect(definition.canvasDefaultLayout).toBeDefined();
    });
    expect(SERIES_BLOCK_DEFINITIONS.map((definition) => definition.defaultLayout))
      .not.toEqual(SERIES_BLOCK_DEFINITIONS.map((definition) => definition.canvasDefaultLayout));
  });
});
