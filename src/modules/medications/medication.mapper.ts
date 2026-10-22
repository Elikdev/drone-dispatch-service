import { mgToGrams } from '../../common/weight';
import { Medication } from '../../generated/prisma/client';

export interface MedicationResponse {
  id: string;
  name: string;
  code: string;
  weightG: number;
  imageUrl: string;
}

export function toMedicationResponse(
  medication: Medication,
): MedicationResponse {
  return {
    id: medication.id,
    name: medication.name,
    code: medication.code,
    weightG: mgToGrams(medication.weightMg),
    imageUrl: medication.imageUrl,
  };
}
