import {
  BatteryAuditLog,
  Drone,
  DroneState,
} from '../../generated/prisma/client';

export interface BatteryResponse {
  droneId: string;
  batteryPct: number;
  isLow: boolean;
  minLoadingBatteryPct: number;
}

export interface BatteryLogResponse {
  id: string;
  batteryPct: number;
  droneState: DroneState;
  isLow: boolean;
  checkedAt: Date;
}

export function toBatteryResponse(
  drone: Drone,
  minLoadingBatteryPct: number,
): BatteryResponse {
  return {
    droneId: drone.id,
    batteryPct: drone.batteryPct,
    isLow: drone.batteryPct < minLoadingBatteryPct,
    minLoadingBatteryPct,
  };
}

export function toBatteryLogResponse(log: BatteryAuditLog): BatteryLogResponse {
  return {
    id: log.id.toString(),
    batteryPct: log.batteryPct,
    droneState: log.droneState,
    isLow: log.isLow,
    checkedAt: log.checkedAt,
  };
}
