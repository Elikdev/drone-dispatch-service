import { HttpStatus } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { mgToGrams } from '../../../common/units/weight';
import { Drone } from '../../../generated/prisma/client';

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
  if (drone.state !== 'IDLE' && drone.state !== 'LOADING') {
    throw new AppError(
      ErrorCode.DRONE_NOT_LOADABLE,
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
      ErrorCode.DRONE_OVERWEIGHT,
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
