import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { toBoolean } from '../../../common/validation/to-boolean';
import { DroneState } from '../../../generated/prisma/client';

export class ListDronesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DroneState)
  state?: DroneState;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeRetired?: boolean;
}
