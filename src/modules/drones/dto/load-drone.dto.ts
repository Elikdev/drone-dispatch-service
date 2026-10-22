import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MEDICATION_CODE_PATTERN } from '../../medications/domain/medication.rules';
import { MAX_ITEM_QUANTITY, MAX_LOAD_LINES } from '../domain/load-rules';

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
