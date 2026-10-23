import {
  IsNumber,
  IsPositive,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export const MEDICATION_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export const MEDICATION_CODE_PATTERN = /^[A-Z0-9_]+$/;

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
