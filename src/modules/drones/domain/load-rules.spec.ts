import { assertFits, assertLoadable, mergeLoadLines } from './load-rules';

describe('mergeLoadLines', () => {
  it('adds up repeated codes and sorts by code', () => {
    expect(
      mergeLoadLines([
        { code: 'PARA_500', quantity: 2 },
        { code: 'ACT_20', quantity: 1 },
        { code: 'PARA_500', quantity: 3 },
      ]),
    ).toEqual([
      { code: 'ACT_20', quantity: 1 },
      { code: 'PARA_500', quantity: 5 },
    ]);
  });
});

describe('assertLoadable', () => {
  it.each(['IDLE', 'LOADING'] as const)('allows %s', (state) => {
    expect(() => assertLoadable({ state })).not.toThrow();
  });

  it.each(['LOADED', 'DELIVERING', 'DELIVERED', 'RETURNING'] as const)(
    'rejects %s',
    (state) => {
      expect(() => assertLoadable({ state })).toThrow(
        expect.objectContaining({ code: 'DRONE_NOT_LOADABLE' }) as Error,
      );
    },
  );
});

describe('assertFits', () => {
  const drone = { loadedWeightMg: 300_000, weightLimitMg: 500_000 };

  it('allows a load that ends exactly at the limit', () => {
    expect(() => assertFits(drone, 200_000)).not.toThrow();
  });

  it('rejects a load 1 mg over the limit with the numbers in grams', () => {
    expect(() => assertFits(drone, 200_001)).toThrow(
      expect.objectContaining({
        code: 'DRONE_OVERWEIGHT',
        details: { currentG: 300, requestedG: 200.001, limitG: 500 },
      }) as Error,
    );
  });
});
