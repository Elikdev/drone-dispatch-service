import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Pagination } from '../../common/pagination/paginate';
import { DroneResponse, toDroneResponse } from './drone.mapper';
import { DronesService } from './drones.service';
import { ListDronesQueryDto } from './dto/list-drones-query.dto';
import { RegisterDroneDto } from './dto/register-drone.dto';
import { TransitionDroneDto } from './dto/transition-drone.dto';

@ApiTags('drones')
@Controller('drones')
export class DronesController {
  constructor(private readonly drones: DronesService) {}

  @Post()
  async register(@Body() dto: RegisterDroneDto): Promise<DroneResponse> {
    return toDroneResponse(await this.drones.register(dto));
  }

  @Get()
  async list(
    @Query() query: ListDronesQueryDto,
  ): Promise<{ drones: DroneResponse[]; pagination: Pagination }> {
    const { drones, pagination } = await this.drones.list(query);
    return { drones: drones.map(toDroneResponse), pagination };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DroneResponse> {
    return toDroneResponse(await this.drones.findById(id));
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  async transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDroneDto,
  ): Promise<DroneResponse> {
    return toDroneResponse(await this.drones.transition(id, dto.to));
  }
}
