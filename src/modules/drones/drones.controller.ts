import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Pagination } from '../../common/pagination/paginate';
import { DroneResponse, toDroneResponse } from './drone.mapper';
import { DronesService } from './drones.service';
import { ListDronesQueryDto } from './dto/list-drones-query.dto';
import { LoadDroneDto } from './dto/load-drone.dto';
import { RegisterDroneDto } from './dto/register-drone.dto';
import { TransitionDroneDto } from './dto/transition-drone.dto';
import { LoadedMedicationsView } from './loaded-medications.mapper';
import { LoadingService } from './loading.service';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

function checkIdempotencyKey(key: string | undefined): string | undefined {
  if (
    key !== undefined &&
    (key.length === 0 || key.length > MAX_IDEMPOTENCY_KEY_LENGTH)
  ) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Request validation failed',
      HttpStatus.BAD_REQUEST,
      [
        {
          field: IDEMPOTENCY_KEY_HEADER,
          errors: [
            `${IDEMPOTENCY_KEY_HEADER} must be 1 to ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
          ],
        },
      ],
    );
  }
  return key;
}

@ApiTags('drones')
@Controller('drones')
export class DronesController {
  constructor(
    private readonly drones: DronesService,
    private readonly loading: LoadingService,
  ) {}

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

  @Post(':id/load')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: false })
  async load(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LoadDroneDto,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoadedMedicationsView> {
    const { view, replayed } = await this.loading.load(
      id,
      dto.items,
      checkIdempotencyKey(idempotencyKey),
    );
    if (replayed) {
      res.setHeader('idempotent-replayed', 'true');
    }
    return view;
  }

  @Get(':id/medications')
  getLoaded(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LoadedMedicationsView> {
    return this.loading.getLoaded(id);
  }
}
