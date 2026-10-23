const MG_PER_GRAM = 1000;
const ROUNDING_TOLERANCE = 1e-6;

export function gramsToMg(grams: number): number {
  const mg = grams * MG_PER_GRAM;
  const rounded = Math.round(mg);

  if (!Number.isFinite(mg) || Math.abs(mg - rounded) > ROUNDING_TOLERANCE) {
    throw new RangeError(`${grams}g has more than 3 decimal places`);
  }
  return rounded;
}

export function mgToGrams(mg: number): number {
  return mg / MG_PER_GRAM;
}
