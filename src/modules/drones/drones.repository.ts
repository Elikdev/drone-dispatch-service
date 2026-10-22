import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../../common/app-error';
import { PageRequest } from '../../common/pagination';
import {
  Db,
  isLockTimeout,
  PrismaService,
} from '../../database/prisma.service';
import {
  Delivery,
  DeliveryItem,
  Drone,
  DroneState,
  IdempotencyKey,
  Medication,
  Prisma,
} from '../../generated/prisma/client';

export interface DroneFilter {
  state?: DroneState;
  availableWithBatteryPct?: number;
  includeRetired?: boolean;
}

@Injectable()
export class DronesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async lockFleet(db: Db): Promise<void> {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('drone_fleet'))`;
  }

  async lockById(db: Db, id: string, lockTimeoutMs: number): Promise<Drone> {
    await db.$executeRaw`SELECT set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`;
    try {
      await db.$executeRaw`SELECT 1 FROM drones WHERE id = ${id}::uuid FOR UPDATE`;
    } catch (error) {
      if (isLockTimeout(error)) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'The drone is being updated by another request, try again',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
    const drone = await db.drone.findUnique({ where: { id } });
    if (!drone) {
      throw droneNotFound(id);
    }
    return drone;
  }

  retire(db: Db, id: string, reason: string | undefined): Promise<Drone> {
    return db.drone.update({
      where: { id },
      data: { retiredAt: new Date(), retiredReason: reason },
    });
  }

  async findById(id: string): Promise<Drone> {
    const drone = await this.prisma.drone.findUnique({ where: { id } });
    if (!drone) {
      throw droneNotFound(id);
    }
    return drone;
  }

  countInService(db: Db): Promise<number> {
    return db.drone.count({ where: { retiredAt: null } });
  }

  create(db: Db, data: Prisma.DroneCreateInput): Promise<Drone> {
    return db.drone.create({ data });
  }

  async findPage(
    filter: DroneFilter,
    page: PageRequest,
  ): Promise<{ drones: Drone[]; total: number }> {
    const where = this.toWhere(filter);
    const [drones, total] = await Promise.all([
      this.prisma.drone.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.drone.count({ where }),
    ]);
    return { drones, total };
  }

  private toWhere(filter: DroneFilter): Prisma.DroneWhereInput {
    const where: Prisma.DroneWhereInput = { state: filter.state };

    if (
      !filter.includeRetired ||
      filter.availableWithBatteryPct !== undefined
    ) {
      where.retiredAt = null;
    }

    if (filter.availableWithBatteryPct !== undefined) {
      where.batteryPct = { gte: filter.availableWithBatteryPct };
      where.OR = [
        { state: DroneState.IDLE },
        {
          state: DroneState.LOADING,
          loadedWeightMg: { lt: this.prisma.drone.fields.weightLimitMg },
        },
      ];
    }
    return where;
  }

  findMedicationsByCodes(db: Db, codes: string[]): Promise<Medication[]> {
    return db.medication.findMany({ where: { code: { in: codes } } });
  }

  async findOrCreateOpenDelivery(db: Db, droneId: string): Promise<Delivery> {
    const open = await db.delivery.findFirst({
      where: { droneId, closedAt: null },
    });
    return open ?? db.delivery.create({ data: { droneId } });
  }

  async addItems(
    db: Db,
    items: Prisma.DeliveryItemCreateManyInput[],
  ): Promise<void> {
    await db.deliveryItem.createMany({ data: items });
  }

  findOpenItems(db: Db, droneId: string): Promise<LoadedItem[]> {
    return db.deliveryItem.findMany({
      where: { delivery: { droneId, closedAt: null } },
      include: { medication: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async insertKeyIfNew(
    db: Db,
    key: string,
    requestHash: string,
  ): Promise<boolean> {
    const { count } = await db.idempotencyKey.createMany({
      data: [{ key, requestHash }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  findKey(db: Db, key: string): Promise<IdempotencyKey | null> {
    return db.idempotencyKey.findUnique({ where: { key } });
  }

  async restartKey(db: Db, key: string, requestHash: string): Promise<void> {
    await db.idempotencyKey.update({
      where: { key },
      data: { requestHash, responseBody: Prisma.DbNull, createdAt: new Date() },
    });
  }

  async saveResponse(db: Db, key: string, responseBody: object): Promise<void> {
    await db.idempotencyKey.update({
      where: { key },
      data: { responseBody },
    });
  }
}

function droneNotFound(id: string): AppError {
  return new AppError(
    ErrorCode.NOT_FOUND,
    `Drone ${id} was not found`,
    HttpStatus.NOT_FOUND,
  );
}

export type LoadedItem = DeliveryItem & { medication: Medication };
