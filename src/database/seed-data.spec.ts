import { gramsToMg } from '../common/weight';
import { DRONE_MODELS } from '../modules/drones/drones.rules';
import {
  MEDICATION_CODE_PATTERN,
  MEDICATION_NAME_PATTERN,
} from '../modules/medications/medications.dto';
import { DRONE_SEEDS, MEDICATION_SEEDS } from './seed-data';

const MAX_WEIGHT_LIMIT_G = 500;

describe('seed data', () => {
  it('has 8 drones, leaving room in a fleet of 10', () => {
    expect(DRONE_SEEDS).toHaveLength(8);
  });

  it.each(DRONE_SEEDS)('drone $serialNumber follows the rules', (drone) => {
    expect(drone.serialNumber.length).toBeLessThanOrEqual(100);
    expect(DRONE_MODELS).toContain(drone.model);
    expect(drone.weightLimitG).toBeGreaterThan(0);
    expect(drone.weightLimitG).toBeLessThanOrEqual(MAX_WEIGHT_LIMIT_G);
    expect(() => gramsToMg(drone.weightLimitG)).not.toThrow();
    expect(drone.batteryPct).toBeGreaterThanOrEqual(0);
    expect(drone.batteryPct).toBeLessThanOrEqual(100);
  });

  it.each(MEDICATION_SEEDS)(
    'medication $code follows the rules',
    (medication) => {
      expect(medication.name).toMatch(MEDICATION_NAME_PATTERN);
      expect(medication.code).toMatch(MEDICATION_CODE_PATTERN);
      expect(medication.weightG).toBeGreaterThan(0);
      expect(() => gramsToMg(medication.weightG)).not.toThrow();
      expect(medication.imageUrl).toMatch(/^https:\/\//);
    },
  );

  it('has unique serial numbers and codes', () => {
    const serials = DRONE_SEEDS.map((drone) => drone.serialNumber);
    const codes = MEDICATION_SEEDS.map((medication) => medication.code);

    expect(new Set(serials).size).toBe(serials.length);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
