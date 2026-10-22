import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { getOptionsToken } from '@nestjs/throttler';
import { IsInt, IsString, Min } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { Public } from '../src/common/decorators/public.decorator';
import { createTestApp, TEST_API_KEY as API_KEY } from './create-test-app';

const RATE_LIMIT = 5;

class ProbeDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

@Controller('probe')
class ProbeController {
  @Get()
  get() {
    return { ok: true };
  }

  @Public()
  @Get('public')
  getPublic() {
    return { ok: true };
  }

  @Post()
  create(@Body() body: ProbeDto) {
    return body;
  }
}

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp({
      controllers: [ProbeController],
      configure: (builder) =>
        builder
          .overrideProvider(getOptionsToken())
          .useValue([{ ttl: 60000, limit: RATE_LIMIT }]),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('wraps a successful response', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe')
      .set('x-api-key', API_KEY)
      .expect(200);

    expect(res.body).toEqual({
      success: true,
      data: { ok: true },
      error: null,
    });
  });

  it('rejects a request without an API key', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe')
      .expect(401);

    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('allows a public route without an API key', async () => {
    await request(app.getHttpServer()).get('/api/v1/probe/public').expect(200);
  });

  it('returns the error format for an unknown route', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .set('x-api-key', API_KEY)
      .expect(404);

    expect(res.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('lists each invalid field', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .set('x-api-key', API_KEY)
      .send({ name: 42, quantity: 0, extra: true })
      .expect(400);

    expect(res.body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
          expect.objectContaining({ field: 'quantity' }),
          expect.objectContaining({ field: 'extra' }),
        ]) as unknown,
      },
    });
  });

  it('rejects broken JSON', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .set('x-api-key', API_KEY)
      .set('content-type', 'application/json')
      .send('{"name":')
      .expect(400);

    expect(res.body).toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: expect.stringContaining('JSON') as unknown,
      },
    });
  });

  it('rejects a body larger than 100kb', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .set('x-api-key', API_KEY)
      .send({ name: 'x'.repeat(110_000), quantity: 1 })
      .expect(413);

    expect(res.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('sends back the request id and puts it in errors', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe')
      .set('x-request-id', 'trace-123')
      .expect(401);

    expect(res.headers['x-request-id']).toBe('trace-123');
    expect(res.body).toMatchObject({ error: { requestId: 'trace-123' } });
  });

  it('limits requests per client', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < RATE_LIMIT; i++) {
      await request(server).get('/api/v1/probe').set('x-api-key', API_KEY);
    }

    const res = await request(server)
      .get('/api/v1/probe')
      .set('x-api-key', API_KEY)
      .expect(429);

    expect(res.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });
});
