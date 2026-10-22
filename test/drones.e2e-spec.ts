import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { seed } from '../src/database/seed';
import { createTestApp, TEST_API_KEY } from './create-test-app';
import { createTestPrisma, resetDatabase } from './database';

const validDrone = {
  serialNumber: 'DRN-NEW-001',
  model: 'Middleweight',
  weightLimitG: 300,
  batteryPct: 90,
};

describe('Drones (e2e)', () => {
  const prisma = createTestPrisma();
  let app: INestApplication<App>;

  const api = () => ({
    get: (path: string) =>
      request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .set('x-api-key', TEST_API_KEY),
    post: (path: string, body: object) =>
      request(app.getHttpServer())
        .post(`/api/v1${path}`)
        .set('x-api-key', TEST_API_KEY)
        .send(body),
  });

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

  describe('POST /drones', () => {
    it('registers an idle, empty drone', async () => {
      const res = await api().post('/drones', validDrone).expect(201);

      expect(res.body.data).toMatchObject({
        ...validDrone,
        loadedWeightG: 0,
        remainingCapacityG: 300,
        state: 'IDLE',
      });
      await expect(
        prisma.drone.findUnique({ where: { serialNumber: 'DRN-NEW-001' } }),
      ).resolves.toMatchObject({ weightLimitMg: 300_000 });
    });

    it('stores a decimal weight limit exactly', async () => {
      const res = await api()
        .post('/drones', { ...validDrone, weightLimitG: 120.125 })
        .expect(201);

      expect(res.body.data).toMatchObject({ weightLimitG: 120.125 });
    });

    it.each([
      ['serialNumber', { serialNumber: '' }],
      ['serialNumber', { serialNumber: '   ' }],
      ['serialNumber', { serialNumber: 'x'.repeat(101) }],
      ['model', { model: 'lightweight' }],
      ['weightLimitG', { weightLimitG: 0 }],
      ['weightLimitG', { weightLimitG: -5 }],
      ['weightLimitG', { weightLimitG: 12.3456 }],
      ['weightLimitG', { weightLimitG: '150' }],
      ['weightLimitG', { weightLimitG: 501 }],
      ['batteryPct', { batteryPct: 101 }],
      ['batteryPct', { batteryPct: 50.5 }],
      ['state', { state: 'LOADED' }],
    ])('rejects a bad %s', async (field, change) => {
      const res = await api()
        .post('/drones', { ...validDrone, ...change })
        .expect(400);

      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([
          expect.objectContaining({ field }),
        ]) as unknown,
      });
    });

    it('rejects a duplicate serial number', async () => {
      const res = await api()
        .post('/drones', { ...validDrone, serialNumber: 'DRN-LW-001' })
        .expect(409);

      expect(res.body.error).toMatchObject({ code: 'DUPLICATE_SERIAL' });
    });

    it('rejects a new drone when the fleet is full', async () => {
      await api().post('/drones', validDrone).expect(201);
      await api()
        .post('/drones', { ...validDrone, serialNumber: 'DRN-NEW-002' })
        .expect(201);

      const res = await api()
        .post('/drones', { ...validDrone, serialNumber: 'DRN-NEW-003' })
        .expect(409);

      expect(res.body.error).toMatchObject({ code: 'FLEET_FULL' });
    });

    it('lets only one of two parallel registrations take the last slot', async () => {
      await api().post('/drones', validDrone).expect(201);

      const results = await Promise.all(
        ['DRN-NEW-002', 'DRN-NEW-003'].map((serialNumber) =>
          api().post('/drones', { ...validDrone, serialNumber }),
        ),
      );

      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      await expect(prisma.drone.count()).resolves.toBe(10);
    });
  });

  describe('GET /drones', () => {
    it('lists every drone with pagination', async () => {
      const res = await api().get('/drones').expect(200);

      expect(res.body.data.drones).toHaveLength(8);
      expect(res.body.data.pagination).toEqual({
        total: 8,
        page: 1,
        limit: 20,
      });
    });

    it('lists only drones that can be loaded', async () => {
      await prisma.drone.update({
        where: { serialNumber: 'DRN-HW-001' },
        data: { state: 'LOADING', loadedWeightMg: 500_000 },
      });
      await prisma.drone.update({
        where: { serialNumber: 'DRN-HW-002' },
        data: { state: 'LOADING', loadedWeightMg: 100_000 },
      });
      await prisma.drone.update({
        where: { serialNumber: 'DRN-CW-001' },
        data: { state: 'DELIVERING' },
      });

      const res = await api().get('/drones?available=true').expect(200);
      const serials = (res.body.data.drones as { serialNumber: string }[])
        .map((drone) => drone.serialNumber)
        .sort();

      expect(serials).toEqual([
        'DRN-HW-002',
        'DRN-LW-001',
        'DRN-MW-001',
        'DRN-MW-002',
      ]);
    });

    it('filters by state', async () => {
      await prisma.drone.update({
        where: { serialNumber: 'DRN-CW-001' },
        data: { state: 'DELIVERING' },
      });

      const res = await api().get('/drones?state=DELIVERING').expect(200);

      expect(res.body.data.drones).toHaveLength(1);
      expect(res.body.data.pagination.total).toBe(1);
    });

    it('returns pages without overlap', async () => {
      const first = await api().get('/drones?page=1&limit=5').expect(200);
      const second = await api().get('/drones?page=2&limit=5').expect(200);
      const ids = [...first.body.data.drones, ...second.body.data.drones].map(
        (drone: { id: string }) => drone.id,
      );

      expect(first.body.data.drones).toHaveLength(5);
      expect(second.body.data.drones).toHaveLength(3);
      expect(new Set(ids).size).toBe(8);
    });

    it('lowers a limit above the max and returns empty pages past the end', async () => {
      const big = await api().get('/drones?limit=500').expect(200);
      const past = await api().get('/drones?page=9').expect(200);

      expect(big.body.data.pagination.limit).toBe(100);
      expect(past.body.data.drones).toEqual([]);
    });

    it.each([
      'page=0',
      'page=1.5',
      'limit=0',
      'limit=abc',
      'available=yes',
      'state=FLYING',
    ])('rejects %s', async (query) => {
      const res = await api().get(`/drones?${query}`).expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /drones/:id', () => {
    it('returns one drone', async () => {
      const drone = await prisma.drone.findUniqueOrThrow({
        where: { serialNumber: 'DRN-MW-001' },
      });

      const res = await api().get(`/drones/${drone.id}`).expect(200);

      expect(res.body.data).toMatchObject({
        id: drone.id,
        weightLimitG: 250,
        batteryPct: 85,
      });
    });

    it('returns 404 for an unknown drone', async () => {
      const res = await api()
        .get('/drones/0199f6d2-0000-7000-8000-000000000000')
        .expect(404);

      expect(res.body.error.code).toBe('DRONE_NOT_FOUND');
    });

    it('returns 400 for an id that is not a uuid', async () => {
      await api().get('/drones/not-a-uuid').expect(400);
    });
  });
});
