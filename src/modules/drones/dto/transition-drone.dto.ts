import { IsEnum } from 'class-validator';
import { DroneState } from '../../../generated/prisma/client';

export class TransitionDroneDto {
  @IsEnum(DroneState)
  to: DroneState;
}
