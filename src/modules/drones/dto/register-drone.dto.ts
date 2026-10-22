import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsPositive,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { DRONE_MODELS, DroneModel } from '../domain/drone.rules';

export class RegisterDroneDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  serialNumber: string;

  @IsIn(DRONE_MODELS)
  model: DroneModel;

  @IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false })
  @IsPositive()
  weightLimitG: number;

  @IsInt()
  @Min(0)
  @Max(100)
  batteryPct: number;
}
