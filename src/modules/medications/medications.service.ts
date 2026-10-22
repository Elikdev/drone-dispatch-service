import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Pagination, resolvePage } from '../../common/pagination/paginate';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { gramsToMg } from '../../common/units/weight';
import { EnvironmentVariables } from '../../config/env.validation';
import { isUniqueViolation } from '../../database/prisma-errors';
import { Medication } from '../../generated/prisma/client';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { MedicationsRepository } from './medications.repository';

@Injectable()
export class MedicationsService {
  constructor(
    private readonly medications: MedicationsRepository,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async list(
    query: PaginationQueryDto,
  ): Promise<{ medications: Medication[]; pagination: Pagination }> {
    const page = resolvePage(query, {
      defaultLimit: this.config.get('PAGINATION_DEFAULT_LIMIT', {
        infer: true,
      }),
      maxLimit: this.config.get('PAGINATION_MAX_LIMIT', { infer: true }),
    });
    const { medications, total } = await this.medications.findPage(page);
    return {
      medications,
      pagination: { total, page: page.page, limit: page.limit },
    };
  }

  async create(dto: CreateMedicationDto): Promise<Medication> {
    const maxWeightG = this.config.get('MAX_DRONE_WEIGHT_LIMIT_G', {
      infer: true,
    });
    if (dto.weightG > maxWeightG) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Request validation failed',
        HttpStatus.BAD_REQUEST,
        [
          {
            field: 'weightG',
            errors: [
              `weightG must not be greater than ${maxWeightG}, no drone could carry it`,
            ],
          },
        ],
      );
    }

    try {
      return await this.medications.create({
        name: dto.name,
        code: dto.code,
        weightMg: gramsToMg(dto.weightG),
        imageUrl: dto.imageUrl,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          ErrorCode.DUPLICATE_MEDICATION_CODE,
          `A medication with code ${dto.code} already exists`,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }
}
