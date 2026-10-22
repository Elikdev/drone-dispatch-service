import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { seed } from '../src/database/seed';
import { createTestApp, TEST_API_KEY } from './create-test-app';
import { createTestPrisma, resetDatabase } from './database';

describe('Loading (e2e)', () => {
  const prisma = createTestPrisma();
  let app: INestApplication<App>;

  const droneId = async (serialNumber: string) =>
    (await prisma.drone.findUniqueOrThrow({ where: { serialNumber } })).id;

  const load = (id: string, items: object[], idempotencyKey?: string) => {
    const req = request(app.getHttpServer())
      .post(`/api/v1/drones/${id}/load`)
      .set('x-api-key', TEST_API_KEY);
    if (idempotencyKey !== undefined) {
      req.set('idempotency-key', idempotencyKey);
    }
    return req.send({ items });
  };

  const loaded = (id: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/drones/${id}/medications`)
      .set('x-api-key', TEST_API_KEY);

  const itemWeightSumMg = async (id: string) => {
    const items = await prisma.deliveryItem.findMany({
      where: { delivery: { droneId: id, closedAt: null } },
    });
    return items.reduce(
      (sum, item) => sum + item.quantity * item.unitWeightMg,
      0,
    );
  };

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seed(prisma);
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('loads medications and moves the drone to LOADING', async () => {
    const id = await droneId('DRN-MW-001');

    const res = await load(id, [
      { code: 'PARA_500', quantity: 2 },
      { code: 'ORS_20', quantity: 1 },
    ]).expect(200);

    expect(res.body.data).toEqual({
      droneId: id,
      state: 'LOADING',
      totalWeightG: 70.5,
      items: expect.arrayContaining([
        expect.objectContaining({
          code: 'PARA_500',
          quantity: 2,
          unitWeightG: 25,
          totalWeightG: 50,
        }),
        expect.objectContaining({
          code: 'ORS_20',
          quantity: 1,
          totalWeightG: 20.5,
        }),
      ]) as unknown,
    });
  });

  it('adds to the same delivery on a second load and merges repeated codes', async () => {
    const id = await droneId('DRN-MW-001');
    await load(id, [{ code: 'PARA_500', quantity: 1 }]).expect(200);

    const res = await load(id, [
      { code: 'PARA_500', quantity: 1 },
      { code: 'PARA_500', quantity: 2 },
    ]).expect(200);

    expect(res.body.data.items).toEqual([
      expect.objectContaining({
        code: 'PARA_500',
        quantity: 4,
        totalWeightG: 100,
      }),
    ]);
    await expect(
      prisma.delivery.count({ where: { droneId: id } }),
    ).resolves.toBe(1);
  });

  it('loads exactly up to the limit and rejects 1 more item', async () => {
    const id = await droneId('DRN-LW-001');
    await load(id, [
      { code: 'EPI_03', quantity: 1 },
      { code: 'ACT_20', quantity: 2 },
    ]).expect(200);

    const res = await load(id, [{ code: 'ACT_20', quantity: 1 }]).expect(422);

    expect(res.body.error).toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      details: { currentG: 150, requestedG: 15, limitG: 150 },
    });
  });

  it('adds decimal weights without float drift', async () => {
    const id = await droneId('DRN-HW-001');

    const res = await load(id, [
      { code: 'ORS_20', quantity: 3 },
      { code: 'IBU_400', quantity: 1 },
    ]).expect(200);

    expect(res.body.data.totalWeightG).toBe(84);
  });

  it('allows a battery exactly at the minimum and rejects one below', async () => {
    await load(await droneId('DRN-MW-002'), [
      { code: 'PARA_500', quantity: 1 },
    ]).expect(200);

    const res = await load(await droneId('DRN-LW-002'), [
      { code: 'PARA_500', quantity: 1 },
    ]).expect(422);

    expect(res.body.error).toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      details: { batteryPct: 20, minBatteryPct: 25 },
    });
  });

  it('rejects loading a drone that is not IDLE or LOADING', async () => {
    const id = await droneId('DRN-MW-001');
    await prisma.drone.update({ where: { id }, data: { state: 'DELIVERING' } });

    const res = await load(id, [{ code: 'PARA_500', quantity: 1 }]).expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('lists every unknown medication code', async () => {
    const res = await load(await droneId('DRN-MW-001'), [
      { code: 'PARA_500', quantity: 1 },
      { code: 'NOPE_1', quantity: 1 },
      { code: 'NOPE_2', quantity: 1 },
    ]).expect(404);

    expect(res.body.error).toMatchObject({
      code: 'NOT_FOUND',
      details: { codes: ['NOPE_1', 'NOPE_2'] },
    });
  });

  it.each([
    [[]],
    [[{ code: 'PARA_500', quantity: 0 }]],
    [[{ code: 'PARA_500', quantity: 1.5 }]],
    [[{ code: 'PARA_500', quantity: 10_001 }]],
    [[{ code: 'para_500', quantity: 1 }]],
    [[{ quantity: 1 }]],
  ])('rejects bad items %j', async (items) => {
    const res = await load(await droneId('DRN-MW-001'), items).expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('leaves the drone unchanged when a load is rejected', async () => {
    const id = await droneId('DRN-LW-001');
    await load(id, [{ code: 'EPI_03', quantity: 1 }]).expect(200);
    const before = await prisma.drone.findUniqueOrThrow({ where: { id } });

    await load(id, [{ code: 'EPI_03', quantity: 1 }]).expect(422);

    await expect(
      prisma.drone.findUniqueOrThrow({ where: { id } }),
    ).resolves.toMatchObject({
      loadedWeightMg: before.loadedWeightMg,
      state: before.state,
    });
    await expect(prisma.deliveryItem.count()).resolves.toBe(1);
  });

  it('never goes over the limit when 20 loads arrive at once', async () => {
    const id = await droneId('DRN-HW-001');

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        load(id, [{ code: 'EPI_03', quantity: 1 }]),
      ),
    );

    const statuses = results.map((res) => res.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(4);
    expect(statuses.filter((status) => status === 422)).toHaveLength(16);
    const drone = await prisma.drone.findUniqueOrThrow({ where: { id } });
    expect(drone.loadedWeightMg).toBe(480_000);
    await expect(itemWeightSumMg(id)).resolves.toBe(drone.loadedWeightMg);
  });

  describe('idempotency key', () => {
    const items = [{ code: 'PARA_500', quantity: 2 }];

    it('loads once when the same request is retried', async () => {
      const id = await droneId('DRN-MW-001');

      const first = await load(id, items, 'retry-1').expect(200);
      const retry = await load(id, items, 'retry-1').expect(200);

      expect(retry.body).toEqual(first.body);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      await expect(itemWeightSumMg(id)).resolves.toBe(50_000);
    });

    it('rejects the same key with a different request', async () => {
      const id = await droneId('DRN-MW-001');
      await load(id, items, 'reuse-1').expect(200);

      const res = await load(
        id,
        [{ code: 'PARA_500', quantity: 3 }],
        'reuse-1',
      ).expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('loads once when the same key arrives twice at the same time', async () => {
      const id = await droneId('DRN-MW-001');

      const results = await Promise.all([
        load(id, items, 'race-1'),
        load(id, items, 'race-1'),
      ]);

      expect(results.map((res) => res.status)).toEqual([200, 200]);
      await expect(itemWeightSumMg(id)).resolves.toBe(50_000);
    });

    it('runs again after a failed attempt with the same key', async () => {
      const id = await droneId('DRN-MW-001');
      await prisma.drone.update({ where: { id }, data: { batteryPct: 10 } });
      await load(id, items, 'after-fail-1').expect(422);
      await prisma.drone.update({ where: { id }, data: { batteryPct: 90 } });

      await load(id, items, 'after-fail-1').expect(200);

      await expect(itemWeightSumMg(id)).resolves.toBe(50_000);
    });

    it('treats an expired key as new', async () => {
      const id = await droneId('DRN-MW-001');
      await load(id, items, 'old-1').expect(200);
      await prisma.idempotencyKey.update({
        where: { key: 'old-1' },
        data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      });

      const res = await load(id, items, 'old-1').expect(200);

      expect(res.headers['idempotent-replayed']).toBeUndefined();
      await expect(itemWeightSumMg(id)).resolves.toBe(100_000);
    });

    it('rejects a key longer than 255 characters', async () => {
      const res = await load(
        await droneId('DRN-MW-001'),
        items,
        'k'.repeat(256),
      ).expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /drones/:id/medications', () => {
    it('shows an empty list for an empty drone', async () => {
      const id = await droneId('DRN-MW-001');

      const res = await loaded(id).expect(200);

      expect(res.body.data).toEqual({
        droneId: id,
        state: 'IDLE',
        totalWeightG: 0,
        items: [],
      });
    });

    it('shows what is on the drone', async () => {
      const id = await droneId('DRN-MW-001');
      await load(id, [{ code: 'INSULIN_100', quantity: 2 }]).expect(200);

      const res = await loaded(id).expect(200);

      expect(res.body.data).toMatchObject({
        totalWeightG: 90,
        items: [
          {
            code: 'INSULIN_100',
            name: 'Insulin_Glargine',
            quantity: 2,
            unitWeightG: 45,
            totalWeightG: 90,
            imageUrl: expect.stringMatching(/^https:\/\//) as unknown,
          },
        ],
      });
    });

    it('returns 404 for an unknown drone', async () => {
      const res = await loaded('0199f6d2-0000-7000-8000-000000000000').expect(
        404,
      );

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /medications', () => {
    it('lists the catalogue with weights in grams', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/medications?limit=3')
        .set('x-api-key', TEST_API_KEY)
        .expect(200);

      expect(res.body.data.pagination).toEqual({ total: 8, page: 1, limit: 3 });
      expect(res.body.data.medications[0]).toMatchObject({
        code: 'ACT_20',
        weightG: 15,
      });
    });
  });
});
