import { mgToGrams } from '../../common/weight';
import { Drone, DroneState } from '../../generated/prisma/client';
import { LoadedItem } from './drones.repository';

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

export interface LoadedItemView {
  code: string;
  name: string;
  quantity: number;
  unitWeightG: number;
  totalWeightG: number;
  imageUrl: string;
}

export interface LoadedMedicationsView {
  droneId: string;
  state: DroneState;
  totalWeightG: number;
  items: LoadedItemView[];
}

export function toLoadedMedicationsView(
  drone: Drone,
  items: LoadedItem[],
): LoadedMedicationsView {
  const lines = new Map<string, LoadedItemView>();

  for (const item of items) {
    const lineKey = `${item.medication.code}:${item.unitWeightMg}`;
    const line = lines.get(lineKey) ?? {
      code: item.medication.code,
      name: item.medication.name,
      quantity: 0,
      unitWeightG: mgToGrams(item.unitWeightMg),
      totalWeightG: 0,
      imageUrl: item.medication.imageUrl,
    };
    line.quantity += item.quantity;
    line.totalWeightG = mgToGrams(line.quantity * item.unitWeightMg);
    lines.set(lineKey, line);
  }

  return {
    droneId: drone.id,
    state: drone.state,
    totalWeightG: mgToGrams(drone.loadedWeightMg),
    items: [...lines.values()],
  };
}
