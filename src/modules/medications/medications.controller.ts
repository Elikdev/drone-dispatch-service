import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Pagination, PaginationQueryDto } from '../../common/pagination';
import { CreateMedicationDto } from './medications.dto';
import { MedicationResponse, toMedicationResponse } from './medication.mapper';
import { MedicationsService } from './medications.service';

@ApiTags('medications')
@Controller('medications')
export class MedicationsController {
  constructor(private readonly medications: MedicationsService) {}

  @Get()
  async list(
    @Query() query: PaginationQueryDto,
  ): Promise<{ medications: MedicationResponse[]; pagination: Pagination }> {
    const { medications, pagination } = await this.medications.list(query);
    return { medications: medications.map(toMedicationResponse), pagination };
  }

  @Post()
  async create(@Body() dto: CreateMedicationDto): Promise<MedicationResponse> {
    return toMedicationResponse(await this.medications.create(dto));
  }
}
