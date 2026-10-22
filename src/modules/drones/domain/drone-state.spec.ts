import { DroneState } from '../../../generated/prisma/client';
import { ALLOWED_TRANSITIONS, assertCanTransition } from './drone-state';

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
        code: 'INVALID_STATE_TRANSITION',
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
      ).toThrow(expect.objectContaining({ code: 'BATTERY_TOO_LOW' }) as Error);
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
    ).toThrow(
      expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }) as Error,
    );
  });
});
