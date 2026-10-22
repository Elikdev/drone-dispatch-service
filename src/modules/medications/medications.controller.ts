import { Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Pagination, resolvePage } from '../../common/pagination/paginate';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { EnvironmentVariables } from '../../config/env.validation';
import { PrismaService } from '../../database/prisma.service';
import { MedicationResponse, toMedicationResponse } from './medication.mapper';

@ApiTags('medications')
@Controller('medications')
export class MedicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Get()
  async list(
    @Query() query: PaginationQueryDto,
  ): Promise<{ medications: MedicationResponse[]; pagination: Pagination }> {
    const page = resolvePage(query, {
      defaultLimit: this.config.get('PAGINATION_DEFAULT_LIMIT', {
        infer: true,
      }),
      maxLimit: this.config.get('PAGINATION_MAX_LIMIT', { infer: true }),
    });
    const [medications, total] = await Promise.all([
      this.prisma.medication.findMany({
        orderBy: { code: 'asc' },
        skip: page.skip,
        take: page.limit,
      }),
      this.prisma.medication.count(),
    ]);
    return {
      medications: medications.map(toMedicationResponse),
      pagination: { total, page: page.page, limit: page.limit },
    };
  }
}
