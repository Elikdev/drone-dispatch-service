import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { DroneState } from '../../../generated/prisma/client';

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class ListDronesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DroneState)
  state?: DroneState;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  available?: boolean;
}
