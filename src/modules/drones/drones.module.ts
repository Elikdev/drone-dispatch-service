import { Module } from '@nestjs/common';
import { DronesController } from './drones.controller';
import { DronesRepository } from './drones.repository';
import { DronesService } from './drones.service';

@Module({
  controllers: [DronesController],
  providers: [DronesService, DronesRepository],
  exports: [DronesService, DronesRepository],
})
export class DronesModule {}
