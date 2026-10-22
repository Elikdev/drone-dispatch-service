import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { seed } from '../src/database/seed';
import { BatteryAuditJob } from '../src/modules/battery/battery-audit.job';
import { createTestApp, TEST_API_KEY } from './create-test-app';
import { createTestPrisma, resetDatabase } from './database';

describe('Retire a drone (e2e)', () => {
  const prisma = createTestPrisma();
  let app: INestApplication<App>;
  let id: string;

  const call = (
    method: 'get' | 'post' | 'patch',
    path: string,
    body?: object,
  ) =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('x-api-key', TEST_API_KEY)
      .send(body);

  const retire = (droneId = id, body: object = { reason: 'Motor failure' }) =>
    call('post', `/drones/${droneId}/retire`, body);

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seed(prisma);
    id = (
      await prisma.drone.findUniqueOrThrow({
        where: { serialNumber: 'DRN-MW-001' },
      })
    ).id;
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('retires an idle drone and keeps the reason', async () => {
    const res = await retire().expect(200);

    expect(res.body.data).toMatchObject({
      id,
      state: 'IDLE',
      retiredReason: 'Motor failure',
    });
    expect(res.body.data.retiredAt).toEqual(expect.any(String));
  });

  it('returns the same drone when retired twice', async () => {
    const first = await retire().expect(200);
    const second = await retire(id, { reason: 'Again' }).expect(200);

    expect(second.body.data.retiredAt).toBe(first.body.data.retiredAt);
    expect(second.body.data.retiredReason).toBe('Motor failure');
  });

  it.each(['LOADING', 'DELIVERING'] as const)(
    'refuses to retire a drone that is %s',
    async (state) => {
      await prisma.drone.update({ where: { id }, data: { state } });

      const res = await retire().expect(409);

      expect(res.body.error).toMatchObject({
        code: 'DRONE_IN_USE',
        details: { state },
      });
    },
  );

  it('rejects a reason longer than 255 characters', async () => {
    await retire(id, { reason: 'x'.repeat(256) }).expect(400);
  });

  it('returns 404 for an unknown drone', async () => {
    await retire('0199f6d2-0000-7000-8000-000000000000').expect(404);
  });

  describe('once retired', () => {
    beforeEach(async () => {
      await retire().expect(200);
    });

    it.each([
      ['load', 'post', 'load', { items: [{ code: 'PARA_500', quantity: 1 }] }],
      ['move', 'post', 'transitions', { to: 'LOADING' }],
      ['update its battery', 'patch', 'battery', { batteryPct: 50 }],
    ] as const)('cannot %s', async (_action, method, path, body) => {
      const res = await call(method, `/drones/${id}/${path}`, body).expect(409);

      expect(res.body.error.code).toBe('DRONE_RETIRED');
    });

    it('is hidden from the list and from available drones', async () => {
      const all = await call('get', '/drones').expect(200);
      const available = await call(
        'get',
        '/drones?available=true&includeRetired=true',
      ).expect(200);
      const ids = (res: request.Response) =>
        (res.body.data.drones as { id: string }[]).map((drone) => drone.id);

      expect(ids(all)).not.toContain(id);
      expect(all.body.data.pagination.total).toBe(7);
      expect(ids(available)).not.toContain(id);
    });

    it('is listed with includeRetired=true', async () => {
      const res = await call('get', '/drones?includeRetired=true').expect(200);

      expect(res.body.data.pagination.total).toBe(8);
    });

    it('still shows its details, battery and history', async () => {
      await call('get', `/drones/${id}`).expect(200);
      await call('get', `/drones/${id}/battery`).expect(200);
      await call('get', `/drones/${id}/battery/history`).expect(200);
      await call('get', `/drones/${id}/medications`).expect(200);
    });

    it('frees a place in a full fleet', async () => {
      const register = (serialNumber: string) =>
        call('post', '/drones', {
          serialNumber,
          model: 'Lightweight',
          weightLimitG: 100,
          batteryPct: 90,
        });

      for (const serialNumber of [
        'DRN-NEW-001',
        'DRN-NEW-002',
        'DRN-NEW-003',
      ]) {
        await register(serialNumber).expect(201);
      }
      const res = await register('DRN-NEW-004').expect(409);

      expect(res.body.error.code).toBe('FLEET_FULL');
      await expect(prisma.drone.count()).resolves.toBe(11);
    });

    it('keeps its serial number taken', async () => {
      const res = await call('post', '/drones', {
        serialNumber: 'DRN-MW-001',
        model: 'Lightweight',
        weightLimitG: 100,
        batteryPct: 90,
      }).expect(409);

      expect(res.body.error.code).toBe('DUPLICATE_SERIAL');
    });

    it('is skipped by the battery audit', async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await expect(app.get(BatteryAuditJob).runOnce()).resolves.toEqual({
        checked: 7,
        low: 2,
      });
      await expect(
        prisma.batteryAuditLog.count({ where: { droneId: id } }),
      ).resolves.toBe(0);
      jest.restoreAllMocks();
    });
  });

  it('never lets a retire and a load on the same drone both succeed', async () => {
    const [retired, loaded] = await Promise.all([
      retire(),
      call('post', `/drones/${id}/load`, {
        items: [{ code: 'PARA_500', quantity: 1 }],
      }),
    ]);

    expect(
      [retired.status, loaded.status].filter((status) => status === 200),
    ).toHaveLength(1);
    const drone = await prisma.drone.findUniqueOrThrow({ where: { id } });
    expect(drone.retiredAt !== null && drone.loadedWeightMg > 0).toBe(false);
  });
});
