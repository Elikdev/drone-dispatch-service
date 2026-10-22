import {
  IsNumber,
  IsPositive,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  MEDICATION_CODE_PATTERN,
  MEDICATION_NAME_PATTERN,
} from '../domain/medication.rules';

export class CreateMedicationDto {
  @IsString()
  @Length(1, 100)
  @Matches(MEDICATION_NAME_PATTERN, {
    message: 'name must contain only letters, numbers, - and _',
  })
  name: string;

  @IsString()
  @Length(1, 100)
  @Matches(MEDICATION_CODE_PATTERN, {
    message: 'code must contain only upper case letters, numbers and _',
  })
  code: string;

  @IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false })
  @IsPositive()
  weightG: number;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl: string;
}
