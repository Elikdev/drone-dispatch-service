import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './create-test-app';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app.close();
  });

  it('returns ok without an API key when the database is up', async () => {
    app = await createTestApp();

    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toEqual({
      success: true,
      data: { status: 'ok' },
      error: null,
    });
  });

  it('returns 503 when the database is down', async () => {
    app = await createTestApp({
      configure: (builder) =>
        builder.overrideProvider(PrismaService).useValue({
          $queryRaw: () => Promise.reject(new Error('connection refused')),
        }),
    });

    const res = await request(app.getHttpServer()).get('/health').expect(503);

    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
  });
});
