import { mgToGrams } from '../../common/units/weight';
import { Drone, DroneState } from '../../generated/prisma/client';

export interface DroneResponse {
  id: string;
  serialNumber: string;
  model: string;
  weightLimitG: number;
  loadedWeightG: number;
  remainingCapacityG: number;
  batteryPct: number;
  state: DroneState;
  retiredAt: Date | null;
  retiredReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toDroneResponse(drone: Drone): DroneResponse {
  return {
    id: drone.id,
    serialNumber: drone.serialNumber,
    model: drone.model,
    weightLimitG: mgToGrams(drone.weightLimitMg),
    loadedWeightG: mgToGrams(drone.loadedWeightMg),
    remainingCapacityG: mgToGrams(drone.weightLimitMg - drone.loadedWeightMg),
    batteryPct: drone.batteryPct,
    state: drone.state,
    retiredAt: drone.retiredAt,
    retiredReason: drone.retiredReason,
    createdAt: drone.createdAt,
    updatedAt: drone.updatedAt,
  };
}
