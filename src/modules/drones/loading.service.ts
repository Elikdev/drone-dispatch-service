import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { EnvironmentVariables } from '../../config/env.validation';
import { Db } from '../../database/database.types';
import { PrismaService } from '../../database/prisma.service';
import { Medication } from '../../generated/prisma/client';
import { assertEnoughBatteryToLoad } from './domain/drone-state';
import {
  assertFits,
  assertLoadable,
  LoadLine,
  mergeLoadLines,
} from './domain/load-rules';
import { DronesRepository } from './drones.repository';
import {
  LoadedMedicationsView,
  toLoadedMedicationsView,
} from './loaded-medications.mapper';
import { LoadingRepository } from './loading.repository';

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
    private readonly loading: LoadingRepository,
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

      const delivery = await this.loading.findOrCreateOpenDelivery(tx, droneId);
      await this.loading.addItems(
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
          state: 'LOADING',
        },
      });

      const view = toLoadedMedicationsView(
        updated,
        await this.loading.findOpenItems(tx, droneId),
      );
      if (idempotencyKey) {
        await this.loading.saveResponse(tx, idempotencyKey, view);
      }
      return { view, replayed: false };
    });
  }

  async getLoaded(droneId: string): Promise<LoadedMedicationsView> {
    const drone = await this.drones.findById(droneId);
    return toLoadedMedicationsView(
      drone,
      await this.loading.findOpenItems(this.prisma, droneId),
    );
  }

  private async findAllMedications(
    db: Db,
    lines: LoadLine[],
  ): Promise<Medication[]> {
    const found = await this.loading.findMedicationsByCodes(
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
        ErrorCode.MEDICATION_NOT_FOUND,
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
    if (await this.loading.insertKeyIfNew(db, key, requestHash)) {
      return null;
    }

    const existing = await this.loading.findKey(db, key);
    const ttlMs =
      this.config.get('IDEMPOTENCY_KEY_TTL_HOURS', { infer: true }) * HOUR_MS;

    if (!existing || existing.createdAt.getTime() < Date.now() - ttlMs) {
      await this.loading.restartKey(db, key, requestHash);
      return null;
    }
    if (existing.requestHash !== requestHash || !existing.responseBody) {
      throw new AppError(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        'This Idempotency-Key was already used for a different request',
        HttpStatus.CONFLICT,
      );
    }
    return existing.responseBody as unknown as LoadedMedicationsView;
  }
}
