import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Pagination, PaginationQueryDto } from '../../common/pagination';
import { BatteryLogResponse, BatteryResponse } from './battery.mapper';
import { BatteryService } from './battery.service';
import { UpdateBatteryDto } from './battery.dto';

@ApiTags('battery')
@Controller('drones/:id/battery')
export class BatteryController {
  constructor(private readonly battery: BatteryService) {}

  @Get()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<BatteryResponse> {
    return this.battery.get(id);
  }

  @Patch()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBatteryDto,
  ): Promise<BatteryResponse> {
    return this.battery.update(id, dto.batteryPct);
  }

  @Get('history')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<{ logs: BatteryLogResponse[]; pagination: Pagination }> {
    return this.battery.history(id, query);
  }
}
