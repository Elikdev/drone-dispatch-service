import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { PageRequest } from '../../common/pagination/paginate';
import { Db } from '../../database/database.types';
import { PrismaService } from '../../database/prisma.service';
import { Drone, DroneState, Prisma } from '../../generated/prisma/client';

export interface DroneFilter {
  state?: DroneState;
  availableWithBatteryPct?: number;
}

@Injectable()
export class DronesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async lockFleet(db: Db): Promise<void> {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('drone_fleet'))`;
  }

  async lockById(db: Db, id: string, lockTimeoutMs: number): Promise<Drone> {
    await db.$executeRaw`SELECT set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`;
    await db.$executeRaw`SELECT 1 FROM drones WHERE id = ${id}::uuid FOR UPDATE`;
    const drone = await db.drone.findUnique({ where: { id } });
    if (!drone) {
      throw droneNotFound(id);
    }
    return drone;
  }

  async findById(id: string): Promise<Drone> {
    const drone = await this.prisma.drone.findUnique({ where: { id } });
    if (!drone) {
      throw droneNotFound(id);
    }
    return drone;
  }

  count(db: Db): Promise<number> {
    return db.drone.count();
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

    if (filter.availableWithBatteryPct !== undefined) {
      where.batteryPct = { gte: filter.availableWithBatteryPct };
      where.OR = [
        { state: 'IDLE' },
        {
          state: 'LOADING',
          loadedWeightMg: { lt: this.prisma.drone.fields.weightLimitMg },
        },
      ];
    }
    return where;
  }
}

function droneNotFound(id: string): AppError {
  return new AppError(
    ErrorCode.DRONE_NOT_FOUND,
    `Drone ${id} was not found`,
    HttpStatus.NOT_FOUND,
  );
}
