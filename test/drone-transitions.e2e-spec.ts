import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { seed } from '../src/database/seed';
import { Drone } from '../src/generated/prisma/client';
import { createTestApp, TEST_API_KEY } from './create-test-app';
import { createTestPrisma, resetDatabase } from './database';

describe('Drone transitions (e2e)', () => {
  const prisma = createTestPrisma();
  let app: INestApplication<App>;
  let drone: Drone;

  const transition = (to: string, id = drone.id) =>
    request(app.getHttpServer())
      .post(`/api/v1/drones/${id}/transitions`)
      .set('x-api-key', TEST_API_KEY)
      .send({ to });

  const loadDirectly = async () => {
    const delivery = await prisma.delivery.create({
      data: { droneId: drone.id },
    });
    const medication = await prisma.medication.findUniqueOrThrow({
      where: { code: 'PARA_500' },
    });
    await prisma.deliveryItem.create({
      data: {
        deliveryId: delivery.id,
        medicationId: medication.id,
        quantity: 2,
        unitWeightMg: medication.weightMg,
      },
    });
    await prisma.drone.update({
      where: { id: drone.id },
      data: { loadedWeightMg: 2 * medication.weightMg },
    });
  };

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seed(prisma);
    drone = await prisma.drone.findUniqueOrThrow({
      where: { serialNumber: 'DRN-MW-001' },
    });
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('walks a full delivery and empties the drone at the end', async () => {
    await transition('LOADING').expect(200);
    await loadDirectly();

    for (const state of ['LOADED', 'DELIVERING', 'DELIVERED', 'RETURNING']) {
      const res = await transition(state).expect(200);
      expect(res.body.data.state).toBe(state);
    }
    const res = await transition('IDLE').expect(200);

    expect(res.body.data).toMatchObject({ state: 'IDLE', loadedWeightG: 0 });
    await expect(
      prisma.delivery.count({ where: { droneId: drone.id, closedAt: null } }),
    ).resolves.toBe(0);
  });

  it('cancels loading and closes the delivery', async () => {
    await transition('LOADING').expect(200);
    await loadDirectly();

    const res = await transition('IDLE').expect(200);

    expect(res.body.data).toMatchObject({ state: 'IDLE', loadedWeightG: 0 });
    await expect(
      prisma.delivery.count({ where: { droneId: drone.id, closedAt: null } }),
    ).resolves.toBe(0);
  });

  it('rejects an illegal move and lists the allowed ones', async () => {
    const res = await transition('DELIVERING').expect(409);

    expect(res.body.error).toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
      details: { from: 'IDLE', to: 'DELIVERING', allowed: ['LOADING'] },
    });
  });

  it('rejects LOADED when nothing is loaded', async () => {
    await transition('LOADING').expect(200);

    const res = await transition('LOADED').expect(409);

    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('rejects LOADING when the battery is too low', async () => {
    const lowDrone = await prisma.drone.findUniqueOrThrow({
      where: { serialNumber: 'DRN-LW-002' },
    });

    const res = await transition('LOADING', lowDrone.id).expect(422);

    expect(res.body.error.code).toBe('BATTERY_TOO_LOW');
  });

  it.each([['FLYING'], [undefined]])(
    'rejects a bad target state %p',
    async (to) => {
      const res = await transition(to as string).expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('returns 404 for an unknown drone', async () => {
    const res = await transition(
      'LOADING',
      '0199f6d2-0000-7000-8000-000000000000',
    ).expect(404);

    expect(res.body.error.code).toBe('DRONE_NOT_FOUND');
  });

  it('answers DRONE_BUSY when another request holds the drone too long', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked: () => void = () => undefined;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));

    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM drones WHERE id = ${drone.id}::uuid FOR UPDATE`;
        locked();
        await held;
      },
      { timeout: 10_000 },
    );
    await isLocked;

    const res = await transition('LOADING');
    release();
    await holder;

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRONE_BUSY');
  });
});
