import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Pagination, resolvePage } from '../../common/pagination/paginate';
import { gramsToMg } from '../../common/units/weight';
import { EnvironmentVariables } from '../../config/env.validation';
import { Db } from '../../database/database.types';
import { isUniqueViolation } from '../../database/prisma-errors';
import { PrismaService } from '../../database/prisma.service';
import { Drone, DroneState } from '../../generated/prisma/client';
import { assertCanTransition, assertInService } from './domain/drone-state';
import { DronesRepository } from './drones.repository';
import { ListDronesQueryDto } from './dto/list-drones-query.dto';
import { RegisterDroneDto } from './dto/register-drone.dto';

@Injectable()
export class DronesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drones: DronesRepository,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async register(dto: RegisterDroneDto): Promise<Drone> {
    const maxWeightLimitG = this.config.get('MAX_DRONE_WEIGHT_LIMIT_G', {
      infer: true,
    });
    if (dto.weightLimitG > maxWeightLimitG) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Request validation failed',
        HttpStatus.BAD_REQUEST,
        [
          {
            field: 'weightLimitG',
            errors: [
              `weightLimitG must not be greater than ${maxWeightLimitG}`,
            ],
          },
        ],
      );
    }

    const capacity = this.config.get('FLEET_CAPACITY', { infer: true });

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.drones.lockFleet(tx);
        if ((await this.drones.countInService(tx)) >= capacity) {
          throw new AppError(
            ErrorCode.FLEET_FULL,
            `The fleet already has ${capacity} drones`,
            HttpStatus.CONFLICT,
          );
        }
        return this.drones.create(tx, {
          serialNumber: dto.serialNumber,
          model: dto.model,
          weightLimitMg: gramsToMg(dto.weightLimitG),
          batteryPct: dto.batteryPct,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          ErrorCode.DUPLICATE_SERIAL,
          `A drone with serial number ${dto.serialNumber} already exists`,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async list(
    query: ListDronesQueryDto,
  ): Promise<{ drones: Drone[]; pagination: Pagination }> {
    const page = resolvePage(query, {
      defaultLimit: this.config.get('PAGINATION_DEFAULT_LIMIT', {
        infer: true,
      }),
      maxLimit: this.config.get('PAGINATION_MAX_LIMIT', { infer: true }),
    });
    const { drones, total } = await this.drones.findPage(
      {
        state: query.state,
        includeRetired: query.includeRetired,
        availableWithBatteryPct: query.available
          ? this.config.get('MIN_LOADING_BATTERY_PCT', { infer: true })
          : undefined,
      },
      page,
    );
    return {
      drones,
      pagination: { total, page: page.page, limit: page.limit },
    };
  }

  findById(id: string): Promise<Drone> {
    return this.drones.findById(id);
  }

  transition(id: string, to: DroneState): Promise<Drone> {
    return this.inDroneLock(id, async (tx, drone) => {
      assertInService(drone);
      assertCanTransition(
        drone,
        to,
        this.config.get('MIN_LOADING_BATTERY_PCT', { infer: true }),
      );

      if (to === 'IDLE') {
        await tx.delivery.updateMany({
          where: { droneId: id, closedAt: null },
          data: { closedAt: new Date() },
        });
      }
      return tx.drone.update({
        where: { id },
        data: { state: to, ...(to === 'IDLE' && { loadedWeightMg: 0 }) },
      });
    });
  }

  retire(id: string, reason: string | undefined): Promise<Drone> {
    return this.inDroneLock(id, (tx, drone) => {
      if (drone.retiredAt) {
        return Promise.resolve(drone);
      }
      if (drone.state !== 'IDLE') {
        throw new AppError(
          ErrorCode.DRONE_IN_USE,
          `A drone in state ${drone.state} cannot be retired, unload it or finish the delivery first`,
          HttpStatus.CONFLICT,
          { state: drone.state },
        );
      }
      return this.drones.retire(tx, id, reason);
    });
  }

  private inDroneLock<T>(
    id: string,
    work: (tx: Db, drone: Drone) => Promise<T>,
  ): Promise<T> {
    const lockTimeoutMs = this.config.get('DB_LOCK_TIMEOUT_MS', {
      infer: true,
    });
    return this.prisma.$transaction(async (tx) =>
      work(tx, await this.drones.lockById(tx, id, lockTimeoutMs)),
    );
  }
}
