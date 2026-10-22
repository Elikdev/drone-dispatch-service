import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { Drone, DroneState } from '../../../generated/prisma/client';

type DroneSnapshot = Pick<Drone, 'state' | 'batteryPct' | 'loadedWeightMg'>;

export const ALLOWED_TRANSITIONS: Record<DroneState, readonly DroneState[]> = {
  IDLE: ['LOADING'],
  LOADING: ['LOADED', 'IDLE'],
  LOADED: ['DELIVERING'],
  DELIVERING: ['DELIVERED'],
  DELIVERED: ['RETURNING'],
  RETURNING: ['IDLE'],
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

  if (to === 'LOADING' || to === 'LOADED') {
    assertEnoughBatteryToLoad(drone.batteryPct, minBatteryPct);
  }

  if (to === 'LOADED' && drone.loadedWeightMg === 0) {
    throw new AppError(
      ErrorCode.INVALID_STATE_TRANSITION,
      'A drone cannot be LOADED with nothing on it',
      HttpStatus.CONFLICT,
      { from: drone.state, to },
    );
  }
}
