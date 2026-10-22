import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pagination, resolvePage } from '../../common/pagination/paginate';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { EnvironmentVariables } from '../../config/env.validation';
import { PrismaService } from '../../database/prisma.service';
import { DronesRepository } from '../drones/drones.repository';
import {
  BatteryLogResponse,
  BatteryResponse,
  toBatteryLogResponse,
  toBatteryResponse,
} from './battery.mapper';

@Injectable()
export class BatteryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drones: DronesRepository,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async get(droneId: string): Promise<BatteryResponse> {
    return toBatteryResponse(
      await this.drones.findById(droneId),
      this.minLoadingBatteryPct(),
    );
  }

  async update(droneId: string, batteryPct: number): Promise<BatteryResponse> {
    await this.drones.findById(droneId);
    const drone = await this.prisma.drone.update({
      where: { id: droneId },
      data: { batteryPct },
    });
    return toBatteryResponse(drone, this.minLoadingBatteryPct());
  }

  async history(
    droneId: string,
    query: PaginationQueryDto,
  ): Promise<{ logs: BatteryLogResponse[]; pagination: Pagination }> {
    await this.drones.findById(droneId);
    const page = resolvePage(query, {
      defaultLimit: this.config.get('PAGINATION_DEFAULT_LIMIT', {
        infer: true,
      }),
      maxLimit: this.config.get('PAGINATION_MAX_LIMIT', { infer: true }),
    });
    const [logs, total] = await Promise.all([
      this.prisma.batteryAuditLog.findMany({
        where: { droneId },
        orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.batteryAuditLog.count({ where: { droneId } }),
    ]);
    return {
      logs: logs.map(toBatteryLogResponse),
      pagination: { total, page: page.page, limit: page.limit },
    };
  }

  private minLoadingBatteryPct(): number {
    return this.config.get('MIN_LOADING_BATTERY_PCT', { infer: true });
  }
}
