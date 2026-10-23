import { IsInt, Max, Min } from 'class-validator';

export class UpdateBatteryDto {
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPct: number;
}
