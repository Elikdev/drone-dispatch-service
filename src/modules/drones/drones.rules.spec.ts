import { DroneState } from '../../generated/prisma/client';
import {
  ALLOWED_TRANSITIONS,
  assertCanTransition,
  assertFits,
  assertInService,
  assertLoadable,
  mergeLoadLines,
} from './drones.rules';

const MIN_BATTERY = 25;
const STATES = Object.keys(ALLOWED_TRANSITIONS) as DroneState[];

function drone(state: DroneState, batteryPct = 80, loadedWeightMg = 10_000) {
  return { state, batteryPct, loadedWeightMg };
}

describe('assertCanTransition', () => {
  const allowedPairs = STATES.flatMap((from) =>
    ALLOWED_TRANSITIONS[from].map((to) => [from, to] as const),
  );
  const illegalPairs = STATES.flatMap((from) =>
    STATES.filter((to) => !ALLOWED_TRANSITIONS[from].includes(to)).map(
      (to) => [from, to] as const,
    ),
  );

  it.each(allowedPairs)('allows %s → %s', (from, to) => {
    expect(() =>
      assertCanTransition(drone(from), to, MIN_BATTERY),
    ).not.toThrow();
  });

  it.each(illegalPairs)('rejects %s → %s', (from, to) => {
    expect(() => assertCanTransition(drone(from), to, MIN_BATTERY)).toThrow(
      expect.objectContaining({
        code: 'CONFLICT',
        details: { from, to, allowed: ALLOWED_TRANSITIONS[from] },
      }) as Error,
    );
  });

  it.each(['LOADING', 'LOADED'] as const)(
    'needs enough battery to go to %s',
    (to) => {
      const from = to === 'LOADING' ? 'IDLE' : 'LOADING';

      expect(() =>
        assertCanTransition(drone(from, 24), to, MIN_BATTERY),
      ).toThrow(
        expect.objectContaining({ code: 'UNPROCESSABLE_ENTITY' }) as Error,
      );
      expect(() =>
        assertCanTransition(drone(from, 25), to, MIN_BATTERY),
      ).not.toThrow();
    },
  );

  it('does not check the battery for other moves', () => {
    expect(() =>
      assertCanTransition(drone('LOADED', 5), 'DELIVERING', MIN_BATTERY),
    ).not.toThrow();
  });

  it('rejects LOADED when nothing is loaded', () => {
    expect(() =>
      assertCanTransition(drone('LOADING', 80, 0), 'LOADED', MIN_BATTERY),
    ).toThrow(expect.objectContaining({ code: 'CONFLICT' }) as Error);
  });
});

describe('assertInService', () => {
  it('allows a drone that is not retired', () => {
    expect(() => assertInService({ id: 'd1', retiredAt: null })).not.toThrow();
  });

  it('rejects a retired drone', () => {
    expect(() => assertInService({ id: 'd1', retiredAt: new Date() })).toThrow(
      expect.objectContaining({ code: 'CONFLICT' }) as Error,
    );
  });
});

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
        expect.objectContaining({ code: 'CONFLICT' }) as Error,
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
        code: 'UNPROCESSABLE_ENTITY',
        details: { currentG: 300, requestedG: 200.001, limitG: 500 },
      }) as Error,
    );
  });
});
