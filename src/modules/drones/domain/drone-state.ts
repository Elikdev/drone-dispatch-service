import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { Drone, DroneState } from '../../../generated/prisma/client';

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
      ErrorCode.BATTERY_TOO_LOW,
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
      ErrorCode.INVALID_STATE_TRANSITION,
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
      ErrorCode.INVALID_STATE_TRANSITION,
      'A drone cannot be LOADED with nothing on it',
      HttpStatus.CONFLICT,
      { from: drone.state, to },
    );
  }
}

export function assertInService(drone: Pick<Drone, 'id' | 'retiredAt'>): void {
  if (drone.retiredAt) {
    throw new AppError(
      ErrorCode.DRONE_RETIRED,
      `Drone ${drone.id} is retired`,
      HttpStatus.CONFLICT,
      { retiredAt: drone.retiredAt },
    );
  }
}
