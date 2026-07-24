import {
  combineMediaQueries,
  inputQueries,
  viewportQueries
} from './responsive';

describe('responsive query helpers', () => {
  it('builds viewport queries from the shared breakpoint scale', () => {
    expect(viewportQueries.down('medium')).toBe('(max-width: 768px)');
    expect(viewportQueries.up('large')).toBe('(min-width: 1024px)');
  });

  it('builds a width-or-height constrained viewport query', () => {
    expect(viewportQueries.constrained({
      maxWidth: 1120,
      maxHeight: 'compact'
    })).toBe('(max-width: 1120px), (max-height: 860px)');
  });

  it('combines layout and input capability queries without device detection', () => {
    expect(combineMediaQueries(
      viewportQueries.down('medium'),
      inputQueries.cannotHover,
      inputQueries.primaryCoarse
    )).toBe('(max-width: 768px) and (hover: none) and (pointer: coarse)');
  });

  it('fails fast for unknown breakpoint names', () => {
    expect(() => viewportQueries.down('missing')).toThrow(
      '[responsive] Unknown breakpoint: missing'
    );
  });
});
