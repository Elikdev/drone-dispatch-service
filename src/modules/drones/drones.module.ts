import { Module } from '@nestjs/common';
import { DronesController } from './drones.controller';
import { DronesRepository } from './drones.repository';
import { DronesService } from './drones.service';
import { LoadingRepository } from './loading.repository';
import { LoadingService } from './loading.service';

@Module({
  controllers: [DronesController],
  providers: [
    DronesService,
    DronesRepository,
    LoadingService,
    LoadingRepository,
  ],
  exports: [DronesRepository],
})
export class DronesModule {}
