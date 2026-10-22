import { seed } from '../src/database/seed';
import { DRONE_SEEDS, MEDICATION_SEEDS } from '../src/database/seed-data';
import { createTestPrisma, resetDatabase } from './database';

describe('seed', () => {
  const prisma = createTestPrisma();

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates every drone and medication with weights in mg', async () => {
    await seed(prisma);

    await expect(prisma.drone.count()).resolves.toBe(DRONE_SEEDS.length);
    await expect(prisma.medication.count()).resolves.toBe(
      MEDICATION_SEEDS.length,
    );
    await expect(
      prisma.medication.findUnique({ where: { code: 'ORS_20' } }),
    ).resolves.toMatchObject({ weightMg: 20_500 });
    await expect(
      prisma.drone.findUnique({ where: { serialNumber: 'DRN-HW-001' } }),
    ).resolves.toMatchObject({
      weightLimitMg: 500_000,
      loadedWeightMg: 0,
      state: 'IDLE',
    });
  });

  it('adds nothing when run twice', async () => {
    await seed(prisma);
    await seed(prisma);

    await expect(prisma.drone.count()).resolves.toBe(DRONE_SEEDS.length);
    await expect(prisma.medication.count()).resolves.toBe(
      MEDICATION_SEEDS.length,
    );
  });

  it('keeps changes made after the first run', async () => {
    await seed(prisma);
    await prisma.drone.update({
      where: { serialNumber: 'DRN-LW-001' },
      data: { batteryPct: 42 },
    });

    await seed(prisma);

    await expect(
      prisma.drone.findUnique({ where: { serialNumber: 'DRN-LW-001' } }),
    ).resolves.toMatchObject({ batteryPct: 42 });
  });
});
