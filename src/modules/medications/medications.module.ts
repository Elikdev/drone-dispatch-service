import { Module } from '@nestjs/common';
import { MedicationsController } from './medications.controller';
import { MedicationsRepository } from './medications.repository';
import { MedicationsService } from './medications.service';

@Module({
  controllers: [MedicationsController],
  providers: [MedicationsService, MedicationsRepository],
})
export class MedicationsModule {}
