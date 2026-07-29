import {
  entityMatchesPatch,
  findEntityById,
  includesEntityId,
  valuesEquivalent
} from '../utils/mutationReconciliation';

describe('mutation reconciliation', () => {
  test('compares JSON strings with structured API values', () => {
    expect(valuesEquivalent(
      { crop: { x: 1 }, tags: ['a'] },
      '{"tags":["a"],"crop":{"x":1}}'
    )).toBe(true);
  });

  test('matches only the fields included in a mutation patch', () => {
    expect(entityMatchesPatch(
      { id: 1, title: 'Nuovo', version: 4, untouched: true },
      { title: 'Nuovo' }
    )).toBe(true);
    expect(entityMatchesPatch(
      { id: 1, title: 'Vecchio' },
      { title: 'Nuovo' }
    )).toBe(false);
  });

  test('compares relation IDs independently from number/string representation', () => {
    expect(includesEntityId([1, '2', { id: 3 }], '3')).toBe(true);
    expect(findEntityById([{ id: 4 }], '4')).toEqual({ id: 4 });
  });
});
