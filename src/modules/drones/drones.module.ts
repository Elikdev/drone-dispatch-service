import { Module } from '@nestjs/common';
import { DronesController } from './drones.controller';
import { DronesRepository } from './drones.repository';
import { DronesService } from './drones.service';
import { LoadingService } from './loading.service';

@Module({
  controllers: [DronesController],
  providers: [DronesService, DronesRepository, LoadingService],
  exports: [DronesRepository],
})
export class DronesModule {}
