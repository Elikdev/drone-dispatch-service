import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RetireDroneDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
