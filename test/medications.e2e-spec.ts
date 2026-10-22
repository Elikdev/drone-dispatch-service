import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { seed } from '../src/database/seed';
import { createTestApp, TEST_API_KEY } from './create-test-app';
import { createTestPrisma, resetDatabase } from './database';

const validMedication = {
  name: 'Vitamin_C_500mg',
  code: 'VITC_500',
  weightG: 12.5,
  imageUrl: 'https://images.example.com/medications/vitc_500.png',
};

describe('Medications (e2e)', () => {
  const prisma = createTestPrisma();
  let app: INestApplication<App>;

  const create = (body: object, apiKey: string | null = TEST_API_KEY) => {
    const req = request(app.getHttpServer()).post('/api/v1/medications');
    if (apiKey) {
      req.set('x-api-key', apiKey);
    }
    return req.send(body);
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

  it('creates a medication and returns its weight in grams', async () => {
    const res = await create(validMedication).expect(201);

    expect(res.body.data).toMatchObject(validMedication);
    await expect(
      prisma.medication.findUnique({ where: { code: 'VITC_500' } }),
    ).resolves.toMatchObject({ weightMg: 12_500 });
  });

  it('can be loaded onto a drone straight away', async () => {
    await create(validMedication).expect(201);
    const drone = await prisma.drone.findUniqueOrThrow({
      where: { serialNumber: 'DRN-MW-001' },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/drones/${drone.id}/load`)
      .set('x-api-key', TEST_API_KEY)
      .send({ items: [{ code: 'VITC_500', quantity: 2 }] })
      .expect(200);

    expect(res.body.data.totalWeightG).toBe(25);
  });

  it('rejects a code that already exists', async () => {
    const res = await create({ ...validMedication, code: 'PARA_500' }).expect(
      409,
    );

    expect(res.body.error.code).toBe('CONFLICT');
  });

  it.each([
    ['name', { name: 'Vitamin C' }],
    ['name', { name: '' }],
    ['code', { code: 'vitc_500' }],
    ['code', { code: 'VITC-500' }],
    ['weightG', { weightG: 0 }],
    ['weightG', { weightG: -1 }],
    ['weightG', { weightG: 12.3456 }],
    ['weightG', { weightG: 501 }],
    ['weightG', { weightG: '12.5' }],
    ['imageUrl', { imageUrl: 'http://images.example.com/vitc.png' }],
    ['imageUrl', { imageUrl: 'not-a-url' }],
    ['imageUrl', { imageUrl: undefined }],
    ['extra', { extra: true }],
  ])('rejects a bad %s', async (field, change) => {
    const res = await create({ ...validMedication, ...change }).expect(400);

    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: expect.arrayContaining([
        expect.objectContaining({ field }),
      ]) as unknown,
    });
  });

  it('needs an API key', async () => {
    await create(validMedication, null).expect(401);
  });
});
