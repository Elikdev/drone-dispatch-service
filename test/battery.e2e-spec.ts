import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { EnvironmentVariables } from '../src/config/env.validation';
import { PrismaService } from '../src/database/prisma.service';
import { seed } from '../src/database/seed';
import { BatteryAuditJob } from '../src/modules/battery/battery-audit.job';
import { createTestApp, TEST_API_KEY } from './create-test-app';
import { createTestPrisma, resetDatabase } from './database';

const UNKNOWN_ID = '0199f6d2-0000-7000-8000-000000000000';

describe('Battery (e2e)', () => {
  const prisma = createTestPrisma();
  let app: INestApplication<App>;

  const droneId = async (serialNumber: string) =>
    (await prisma.drone.findUniqueOrThrow({ where: { serialNumber } })).id;

  const api = (method: 'get' | 'patch', path: string) =>
    request(app.getHttpServer())
      [method](`/api/v1/drones/${path}`)
      .set('x-api-key', TEST_API_KEY);

  const createJob = (batchSize: number) => {
    const values: Partial<EnvironmentVariables> = {
      BATTERY_AUDIT_ENABLED: false,
      BATTERY_AUDIT_BATCH_SIZE: batchSize,
      MIN_LOADING_BATTERY_PCT: 25,
    };
    const config = {
      get: (key: keyof EnvironmentVariables) => values[key],
    } as unknown as ConfigService<EnvironmentVariables, true>;
    return new BatteryAuditJob(prisma as unknown as PrismaService, config);
  };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    await resetDatabase(prisma);
    await seed(prisma);
    app = await createTestApp();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /drones/:id/battery', () => {
    it('returns the level and whether it is too low to load', async () => {
      const low = await api(
        'get',
        `${await droneId('DRN-LW-002')}/battery`,
      ).expect(200);
      const ok = await api(
        'get',
        `${await droneId('DRN-MW-002')}/battery`,
      ).expect(200);

      expect(low.body.data).toMatchObject({
        batteryPct: 20,
        isLow: true,
        minLoadingBatteryPct: 25,
      });
      expect(ok.body.data).toMatchObject({ batteryPct: 25, isLow: false });
    });

    it('returns 404 for an unknown drone', async () => {
      const res = await api('get', `${UNKNOWN_ID}/battery`).expect(404);

      expect(res.body.error.code).toBe('DRONE_NOT_FOUND');
    });
  });

  describe('PATCH /drones/:id/battery', () => {
    it('sets the battery level', async () => {
      const id = await droneId('DRN-LW-002');

      const res = await api('patch', `${id}/battery`)
        .send({ batteryPct: 80 })
        .expect(200);

      expect(res.body.data).toMatchObject({ batteryPct: 80, isLow: false });
      await expect(
        prisma.drone.findUniqueOrThrow({ where: { id } }),
      ).resolves.toMatchObject({
        batteryPct: 80,
      });
    });

    it('records a drop while loading without changing the state', async () => {
      const id = await droneId('DRN-MW-001');
      await prisma.drone.update({ where: { id }, data: { state: 'LOADING' } });

      const res = await api('patch', `${id}/battery`)
        .send({ batteryPct: 10 })
        .expect(200);

      expect(res.body.data.isLow).toBe(true);
      await expect(
        prisma.drone.findUniqueOrThrow({ where: { id } }),
      ).resolves.toMatchObject({
        state: 'LOADING',
      });
    });

    it.each([[-1], [101], [50.5], ['80'], [undefined]])(
      'rejects %p',
      async (batteryPct) => {
        const id = await droneId('DRN-MW-001');

        const res = await api('patch', `${id}/battery`)
          .send({ batteryPct })
          .expect(400);

        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      },
    );

    it('returns 404 for an unknown drone', async () => {
      await api('patch', `${UNKNOWN_ID}/battery`)
        .send({ batteryPct: 50 })
        .expect(404);
    });
  });

  describe('audit job', () => {
    it('writes one row per drone with the same time and the right low flag', async () => {
      const result = await createJob(1000).runOnce();

      expect(result).toEqual({ checked: 8, low: 2 });
      const logs = await prisma.batteryAuditLog.findMany();
      expect(logs).toHaveLength(8);
      expect(new Set(logs.map((log) => log.checkedAt.getTime())).size).toBe(1);
      expect(logs.filter((log) => log.isLow)).toHaveLength(2);
    });

    it('works across several batches', async () => {
      await expect(createJob(3).runOnce()).resolves.toEqual({
        checked: 8,
        low: 2,
      });
      await expect(prisma.batteryAuditLog.count()).resolves.toBe(8);
    });

    it('skips a run while the last one is still going', async () => {
      const job = createJob(1000);

      const [first, second] = await Promise.all([job.runOnce(), job.runOnce()]);

      expect(first).toEqual({ checked: 8, low: 2 });
      expect(second).toBeNull();
      await expect(prisma.batteryAuditLog.count()).resolves.toBe(8);
    });

    it('skips a run when another instance holds the audit lock', async () => {
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked: () => void = () => undefined;
      const isLocked = new Promise<void>((resolve) => (locked = resolve));
      const otherInstance = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('battery_audit'))`;
          locked();
          await held;
        },
        { timeout: 10_000 },
      );
      await isLocked;

      const result = await createJob(1000).runOnce();
      release();
      await otherInstance;

      expect(result).toBeNull();
      await expect(prisma.batteryAuditLog.count()).resolves.toBe(0);
    });

    it('keeps working after a failed run', async () => {
      const job = createJob(1000);
      jest
        .spyOn(prisma, '$transaction')
        .mockRejectedValueOnce(new Error('db down'));

      await expect(job.runOnce()).resolves.toBeNull();
      await expect(job.runOnce()).resolves.toEqual({ checked: 8, low: 2 });
    });
  });

  describe('GET /drones/:id/battery/history', () => {
    it('lists the audit log newest first with pagination', async () => {
      const id = await droneId('DRN-MW-001');
      const job = createJob(1000);
      await job.runOnce();
      await prisma.drone.update({ where: { id }, data: { batteryPct: 40 } });
      await job.runOnce();

      const res = await api('get', `${id}/battery/history?limit=1`).expect(200);

      expect(res.body.data.pagination).toEqual({ total: 2, page: 1, limit: 1 });
      expect(res.body.data.logs).toEqual([
        expect.objectContaining({
          batteryPct: 40,
          droneState: 'IDLE',
          isLow: false,
        }),
      ]);
      expect(typeof res.body.data.logs[0].id).toBe('string');
    });

    it('returns 404 for an unknown drone', async () => {
      await api('get', `${UNKNOWN_ID}/battery/history`).expect(404);
    });
  });
});

describe('BatteryAuditJob timer', () => {
  it('starts only when enabled and stops on shutdown', () => {
    jest.useFakeTimers();
    const config = (enabled: boolean) =>
      ({
        get: (key: string) =>
          key === 'BATTERY_AUDIT_ENABLED' ? enabled : 60_000,
      }) as unknown as ConfigService<EnvironmentVariables, true>;
    const prisma = {} as PrismaService;

    const disabled = new BatteryAuditJob(prisma, config(false));
    disabled.onModuleInit();
    expect(jest.getTimerCount()).toBe(0);

    const enabled = new BatteryAuditJob(prisma, config(true));
    const runOnce = jest.spyOn(enabled, 'runOnce').mockResolvedValue(null);
    enabled.onModuleInit();
    jest.advanceTimersByTime(60_000);
    expect(runOnce).toHaveBeenCalledTimes(1);

    enabled.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});
