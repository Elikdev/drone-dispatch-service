import { gramsToMg, mgToGrams } from './weight';

describe('gramsToMg', () => {
  it.each([
    [25, 25_000],
    [20.5, 20_500],
    [0.1, 100],
    [1.005, 1_005],
    [499.999, 499_999],
  ])('converts %pg to %i mg', (grams, mg) => {
    expect(gramsToMg(grams)).toBe(mg);
  });

  it.each([12.3456, 500.0001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %p',
    (grams) => {
      expect(() => gramsToMg(grams)).toThrow(RangeError);
    },
  );
});

describe('mgToGrams', () => {
  it.each([
    [25_000, 25],
    [20_500, 20.5],
    [1, 0.001],
  ])('converts %i mg to %pg', (mg, grams) => {
    expect(mgToGrams(mg)).toBe(grams);
  });

  it('adds small weights without float drift', () => {
    expect(mgToGrams(gramsToMg(0.1) + gramsToMg(0.2))).toBe(0.3);
  });
});
