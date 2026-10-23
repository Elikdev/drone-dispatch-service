import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { toBoolean } from '../../common/validation';
import { DroneState } from '../../generated/prisma/client';
import { MEDICATION_CODE_PATTERN } from '../medications/medications.dto';
import {
  DRONE_MODELS,
  DroneModel,
  MAX_ITEM_QUANTITY,
  MAX_LOAD_LINES,
} from './drones.rules';

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

export class TransitionDroneDto {
  @IsEnum(DroneState)
  to: DroneState;
}

export class LoadItemDto {
  @IsString()
  @Length(1, 100)
  @Matches(MEDICATION_CODE_PATTERN, {
    message: 'code must contain only upper case letters, numbers and _',
  })
  code: string;

  @IsInt()
  @Min(1)
  @Max(MAX_ITEM_QUANTITY)
  quantity: number;
}

export class LoadDroneDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LOAD_LINES)
  @ValidateNested({ each: true })
  @Type(() => LoadItemDto)
  items: LoadItemDto[];
}

export class RetireDroneDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
