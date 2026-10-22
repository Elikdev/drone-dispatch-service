import { Module } from '@nestjs/common';
import { MedicationsController } from './medications.controller';

@Module({
  controllers: [MedicationsController],
})
export class MedicationsModule {}
