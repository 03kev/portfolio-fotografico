import {
  appendMissingSeriesPhotoBlocks,
  getSeriesBlockPhotoIds,
  isSeriesEditorBlockComplete,
  moveSeriesContentBlock,
  normalizeSeriesEditorContent,
  removePhotoFromSeriesContent,
  togglePhotoInSeriesGroup
} from './seriesEditorModel';

describe('seriesEditorModel', () => {
  test('normalizes canonical and legacy photo group items without duplicates', () => {
    const content = normalizeSeriesEditorContent([{
      id: 'group',
      type: 'photos',
      content: [
        { id: 10, layout: { x: 1, y: 2, w: 3, h: 4 } },
        11,
        { id: 10 },
        99
      ]
    }], [10, 11]);

    expect(content[0].content).toEqual([
      { id: 10, layout: { x: 1, y: 2, w: 3, h: 4 } },
      { id: 11 }
    ]);
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
