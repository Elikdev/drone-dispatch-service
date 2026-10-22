import { Module } from '@nestjs/common';
import { DronesModule } from '../drones/drones.module';
import { BatteryAuditJob } from './battery-audit.job';
import { BatteryController } from './battery.controller';
import { BatteryService } from './battery.service';

@Module({
  imports: [DronesModule],
  controllers: [BatteryController],
  providers: [BatteryService, BatteryAuditJob],
})
export class BatteryModule {}
