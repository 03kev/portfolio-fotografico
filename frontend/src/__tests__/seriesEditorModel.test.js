import { SERIES_BLOCK_DEFINITIONS } from '@portfolio/series-content-contract';
import {
  appendMissingSeriesPhotoBlocks,
  createSeriesEditorBlock,
  getSeriesBlockPhotoIds,
  isSeriesEditorBlockComplete,
  moveSeriesContentBlock,
  normalizeSeriesEditorContent,
  removePhotoFromSeriesContent,
  togglePhotoInSeriesGroup
} from '../utils/seriesEditorModel';

describe('seriesEditorModel', () => {
  test('every shared block type has an explicit editor factory and shared default layout', () => {
    SERIES_BLOCK_DEFINITIONS.forEach((definition) => {
      const block = createSeriesEditorBlock({
        type: definition.type,
        photoId: 10,
        content: [10],
        id: `block-${definition.type}`,
        y: 7
      });
      expect(block.type).toBe(definition.type);
      expect(block.layout).toEqual({
        ...definition.defaultLayout,
        y: 7,
        unit: 'grid'
      });
    });
  });

  test('normalizes canonical photo group items without changing content', () => {
    const content = normalizeSeriesEditorContent([{
      id: 'group',
      type: 'photos',
      content: [
        { id: 10, layout: { x: 1, y: 2, w: 3, h: 4 } },
        { id: 11 }
      ]
    }], [10, 11]);

    expect(content[0].content).toEqual([
      { id: 10, layout: { x: 1, y: 2, w: 3, h: 4, unit: 'grid' } },
      { id: 11 }
    ]);
  });

  test('rejects unknown types and legacy scalar groups without losing content', () => {
    expect(() => normalizeSeriesEditorContent([{
      id: 'unknown',
      type: 'video',
      content: { url: 'video.mp4' }
    }], [])).toThrow('Tipo di blocco serie non supportato');

    expect(() => normalizeSeriesEditorContent([{
      id: 'legacy-group',
      type: 'photos',
      content: [10]
    }], [10])).toThrow('forma { id, layout? }');
  });

  test('rejects editorial references outside membership instead of deleting them', () => {
    expect(() => normalizeSeriesEditorContent([{
      id: 'photo',
      type: 'photo',
      content: 99
    }], [10])).toThrow('non appartiene alla serie');
  });

  test('round-trips canonical text, photo and group content at layout limits', () => {
    const content = [
      {
        id: 'text',
        type: 'text',
        content: 'Testo',
        layout: { x: 0, y: 0, w: 5, h: 2, unit: 'grid' },
        textAlign: 'justify-center',
        textSize: 'lg',
        textBold: true,
        textItalic: false,
        textUnderline: false,
        textMono: false,
        textFont: 'playfair'
      },
      {
        id: 'photo',
        type: 'photo',
        content: 10,
        layout: { x: 19, y: 2, w: 5, h: 6, unit: 'grid' },
        showTitle: false,
        showLightbox: true
      },
      {
        id: 'group',
        type: 'photos',
        content: [{ id: 11, layout: { x: 0, y: 0, w: 1, h: 1, unit: 'grid' } }],
        layout: { x: 0, y: 8, w: 24, h: 24, unit: 'grid' }
      }
    ];

    expect(normalizeSeriesEditorContent(content, [10, 11])).toEqual(content);
  });

  test('removing membership also removes every editorial reference', () => {
    const content = removePhotoFromSeriesContent([
      { id: 'single', type: 'photo', content: 10 },
      { id: 'group', type: 'photos', content: [{ id: 10 }, { id: 11 }] },
      { id: 'text', type: 'text', content: 'Intro' }
    ], 10);

    expect(content).toEqual([
      { id: 'group', type: 'photos', content: [{ id: 11 }] },
      { id: 'text', type: 'text', content: 'Intro' }
    ]);
  });

  test('group selection works with object-shaped items returned by the backend', () => {
    const initial = { id: 'group', type: 'photos', content: [{ id: 10 }] };
    const removed = togglePhotoInSeriesGroup(initial, 10);
    const added = togglePhotoInSeriesGroup(removed, 11);

    expect(getSeriesBlockPhotoIds(added)).toEqual([11]);
  });

  test('automatic structure adds only photos not already represented', () => {
    const result = appendMissingSeriesPhotoBlocks(
      [{ id: 'group', type: 'photos', content: [{ id: 10 }] }],
      [10, 11, 12],
      (photoId) => `photo-${photoId}`
    );

    expect(result.map((block) => block.id)).toEqual([
      'group',
      'photo-11',
      'photo-12'
    ]);
  });

  test('block reordering is bounded and deterministic', () => {
    const content = [
      { id: 'a', layout: { y: 0 } },
      { id: 'b', layout: { y: 20 } },
      { id: 'c', layout: { y: 40 } }
    ];
    const moved = moveSeriesContentBlock(content, 1, -1);
    expect(moved.map((block) => block.id)).toEqual(['b', 'a', 'c']);
    expect(moved.map((block) => block.layout.y)).toEqual([0, 20, 40]);
    expect(moveSeriesContentBlock(content, 0, -1)).toEqual(content);
  });

  test('incomplete blocks are detected before persistence', () => {
    expect(isSeriesEditorBlockComplete({ type: 'text', content: '  ' })).toBe(false);
    expect(isSeriesEditorBlockComplete({ type: 'photos', content: [] })).toBe(false);
    expect(isSeriesEditorBlockComplete({ type: 'photo', content: 10 })).toBe(true);
  });
});
