import { PrismaClient } from '../src/generated/prisma/client';
import { createTestPrisma, resetDatabase } from './database';

describe('Database constraints', () => {
  const prisma: PrismaClient = createTestPrisma();

  const createDrone = (serialNumber = 'DRN-TEST-001') =>
    prisma.drone.create({
      data: {
        serialNumber,
        model: 'Lightweight',
        weightLimitMg: 100_000,
        batteryPct: 80,
      },
    });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows a load exactly at the weight limit', async () => {
    const drone = await createDrone();

    await expect(
      prisma.drone.update({
        where: { id: drone.id },
        data: { loadedWeightMg: 100_000 },
      }),
    ).resolves.toMatchObject({ loadedWeightMg: 100_000 });
  });

  it.each([100_001, -1])(
    'rejects a loaded weight of %i mg on a 100000 mg drone',
    async (loadedWeightMg) => {
      const drone = await createDrone();

      await expect(
        prisma.drone.update({
          where: { id: drone.id },
          data: { loadedWeightMg },
        }),
      ).rejects.toThrow(/drones_loaded_weight_within_limit/);
    },
  );

  it('rejects a duplicate serial number', async () => {
    await createDrone();

    await expect(createDrone()).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows only one open delivery per drone', async () => {
    const drone = await createDrone();
    const first = await prisma.delivery.create({ data: { droneId: drone.id } });

    await expect(
      prisma.delivery.create({ data: { droneId: drone.id } }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.delivery.update({
      where: { id: first.id },
      data: { closedAt: new Date() },
    });
    await expect(
      prisma.delivery.create({ data: { droneId: drone.id } }),
    ).resolves.toMatchObject({ droneId: drone.id, closedAt: null });
  });

  it('blocks deleting a drone that has a delivery', async () => {
    const drone = await createDrone();
    await prisma.delivery.create({ data: { droneId: drone.id } });

    await expect(
      prisma.drone.delete({ where: { id: drone.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
