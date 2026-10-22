import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError, ErrorCode } from '../../common/app-error';
import { EnvironmentVariables } from '../../config/env.validation';
import { Db, PrismaService } from '../../database/prisma.service';
import { DroneState, Medication } from '../../generated/prisma/client';
import {
  assertEnoughBatteryToLoad,
  assertFits,
  assertInService,
  assertLoadable,
  LoadLine,
  mergeLoadLines,
} from './drones.rules';
import { DronesRepository } from './drones.repository';
import {
  LoadedMedicationsView,
  toLoadedMedicationsView,
} from './drones.mapper';

const HOUR_MS = 60 * 60 * 1000;

export interface LoadResult {
  view: LoadedMedicationsView;
  replayed: boolean;
}

@Injectable()
export class LoadingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drones: DronesRepository,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  load(
    droneId: string,
    lines: LoadLine[],
    idempotencyKey?: string,
  ): Promise<LoadResult> {
    const merged = mergeLoadLines(lines);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ droneId, items: merged }))
      .digest('hex');

    return this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const saved = await this.claimKey(tx, idempotencyKey, requestHash);
        if (saved) {
          return { view: saved, replayed: true };
        }
      }

      const drone = await this.drones.lockById(
        tx,
        droneId,
        this.config.get('DB_LOCK_TIMEOUT_MS', { infer: true }),
      );
      assertInService(drone);
      assertLoadable(drone);
      assertEnoughBatteryToLoad(
        drone.batteryPct,
        this.config.get('MIN_LOADING_BATTERY_PCT', { infer: true }),
      );

      const medications = await this.findAllMedications(tx, merged);
      const items = merged.map((line, index) => ({
        line,
        medication: medications[index],
      }));
      const addedWeightMg = items.reduce(
        (sum, { line, medication }) =>
          sum + line.quantity * medication.weightMg,
        0,
      );
      assertFits(drone, addedWeightMg);

      const delivery = await this.drones.findOrCreateOpenDelivery(tx, droneId);
      await this.drones.addItems(
        tx,
        items.map(({ line, medication }) => ({
          deliveryId: delivery.id,
          medicationId: medication.id,
          quantity: line.quantity,
          unitWeightMg: medication.weightMg,
        })),
      );
      const updated = await tx.drone.update({
        where: { id: droneId },
        data: {
          loadedWeightMg: { increment: addedWeightMg },
          state: DroneState.LOADING,
        },
      });

      const view = toLoadedMedicationsView(
        updated,
        await this.drones.findOpenItems(tx, droneId),
      );
      if (idempotencyKey) {
        await this.drones.saveResponse(tx, idempotencyKey, view);
      }
      return { view, replayed: false };
    });
  }

  async getLoaded(droneId: string): Promise<LoadedMedicationsView> {
    const drone = await this.drones.findById(droneId);
    return toLoadedMedicationsView(
      drone,
      await this.drones.findOpenItems(this.prisma, droneId),
    );
  }

  private async findAllMedications(
    db: Db,
    lines: LoadLine[],
  ): Promise<Medication[]> {
    const found = await this.drones.findMedicationsByCodes(
      db,
      lines.map((line) => line.code),
    );
    const byCode = new Map(
      found.map((medication) => [medication.code, medication]),
    );
    const missing = lines.filter((line) => !byCode.has(line.code));

    if (missing.length > 0) {
      const codes = missing.map((line) => line.code);
      throw new AppError(
        ErrorCode.NOT_FOUND,
        `Unknown medication codes: ${codes.join(', ')}`,
        HttpStatus.NOT_FOUND,
        { codes },
      );
    }
    return lines.map((line) => byCode.get(line.code) as Medication);
  }

  private async claimKey(
    db: Db,
    key: string,
    requestHash: string,
  ): Promise<LoadedMedicationsView | null> {
    if (await this.drones.insertKeyIfNew(db, key, requestHash)) {
      return null;
    }

    const existing = await this.drones.findKey(db, key);
    const ttlMs =
      this.config.get('IDEMPOTENCY_KEY_TTL_HOURS', { infer: true }) * HOUR_MS;

    if (!existing || existing.createdAt.getTime() < Date.now() - ttlMs) {
      await this.drones.restartKey(db, key, requestHash);
      return null;
    }
    if (existing.requestHash !== requestHash || !existing.responseBody) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'This Idempotency-Key was already used for a different request',
        HttpStatus.CONFLICT,
      );
    }
    return existing.responseBody as unknown as LoadedMedicationsView;
  }
}
