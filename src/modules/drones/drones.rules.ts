import { HttpStatus } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/app-error';
import { mgToGrams } from '../../common/weight';
import { Drone, DroneState } from '../../generated/prisma/client';

export const DRONE_MODELS = [
  'Lightweight',
  'Middleweight',
  'Cruiserweight',
  'Heavyweight',
] as const;

export type DroneModel = (typeof DRONE_MODELS)[number];

type DroneSnapshot = Pick<Drone, 'state' | 'batteryPct' | 'loadedWeightMg'>;

export const ALLOWED_TRANSITIONS: Record<DroneState, readonly DroneState[]> = {
  [DroneState.IDLE]: [DroneState.LOADING],
  [DroneState.LOADING]: [DroneState.LOADED, DroneState.IDLE],
  [DroneState.LOADED]: [DroneState.DELIVERING],
  [DroneState.DELIVERING]: [DroneState.DELIVERED],
  [DroneState.DELIVERED]: [DroneState.RETURNING],
  [DroneState.RETURNING]: [DroneState.IDLE],
};

export function assertEnoughBatteryToLoad(
  batteryPct: number,
  minBatteryPct: number,
): void {
  if (batteryPct < minBatteryPct) {
    throw new AppError(
      ErrorCode.UNPROCESSABLE_ENTITY,
      `Battery is at ${batteryPct}%, loading needs at least ${minBatteryPct}%`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { batteryPct, minBatteryPct },
    );
  }
}

export function assertCanTransition(
  drone: DroneSnapshot,
  to: DroneState,
  minBatteryPct: number,
): void {
  const allowed = ALLOWED_TRANSITIONS[drone.state];

  if (!allowed.includes(to)) {
    throw new AppError(
      ErrorCode.CONFLICT,
      `A drone cannot go from ${drone.state} to ${to}`,
      HttpStatus.CONFLICT,
      { from: drone.state, to, allowed },
    );
  }

  if (to === DroneState.LOADING || to === DroneState.LOADED) {
    assertEnoughBatteryToLoad(drone.batteryPct, minBatteryPct);
  }

  if (to === DroneState.LOADED && drone.loadedWeightMg === 0) {
    throw new AppError(
      ErrorCode.CONFLICT,
      'A drone cannot be LOADED with nothing on it',
      HttpStatus.CONFLICT,
      { from: drone.state, to },
    );
  }
}

export function assertInService(drone: Pick<Drone, 'id' | 'retiredAt'>): void {
  if (drone.retiredAt) {
    throw new AppError(
      ErrorCode.CONFLICT,
      `Drone ${drone.id} is retired`,
      HttpStatus.CONFLICT,
      { retiredAt: drone.retiredAt },
    );
  }
}

export const MAX_ITEM_QUANTITY = 10_000;
export const MAX_LOAD_LINES = 50;

export interface LoadLine {
  code: string;
  quantity: number;
}

export function mergeLoadLines(lines: LoadLine[]): LoadLine[] {
  const quantityByCode = new Map<string, number>();
  for (const { code, quantity } of lines) {
    quantityByCode.set(code, (quantityByCode.get(code) ?? 0) + quantity);
  }
  return [...quantityByCode.entries()]
    .map(([code, quantity]) => ({ code, quantity }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function assertLoadable(drone: Pick<Drone, 'state'>): void {
  if (drone.state !== DroneState.IDLE && drone.state !== DroneState.LOADING) {
    throw new AppError(
      ErrorCode.CONFLICT,
      `A drone in state ${drone.state} cannot be loaded`,
      HttpStatus.CONFLICT,
      { state: drone.state },
    );
  }
}

export function assertFits(
  drone: Pick<Drone, 'loadedWeightMg' | 'weightLimitMg'>,
  addedWeightMg: number,
): void {
  if (drone.loadedWeightMg + addedWeightMg > drone.weightLimitMg) {
    throw new AppError(
      ErrorCode.UNPROCESSABLE_ENTITY,
      `Adding ${mgToGrams(addedWeightMg)}g would exceed the ${mgToGrams(drone.weightLimitMg)}g limit`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      {
        currentG: mgToGrams(drone.loadedWeightMg),
        requestedG: mgToGrams(addedWeightMg),
        limitG: mgToGrams(drone.weightLimitMg),
      },
    );
  }
}
