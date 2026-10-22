import { IncomingMessage, ServerResponse } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables, NodeEnv } from './env.validation';
import { buildLoggerOptions, resolveRequestId } from './logger.config';

function fakeRequest(requestId?: string): IncomingMessage {
  return {
    headers: requestId ? { 'x-request-id': requestId } : {},
  } as IncomingMessage;
}

function fakeResponse(): ServerResponse & { setHeader: jest.Mock } {
  return { setHeader: jest.fn() } as unknown as ServerResponse & {
    setHeader: jest.Mock;
  };
}

function fakeConfig(
  values: Partial<EnvironmentVariables>,
): ConfigService<EnvironmentVariables, true> {
  return {
    get: (key: keyof EnvironmentVariables) => values[key],
  } as ConfigService<EnvironmentVariables, true>;
}

describe('resolveRequestId', () => {
  it('reuses the request id sent by the client', () => {
    const res = fakeResponse();

    expect(resolveRequestId(fakeRequest('abc-123'), res)).toBe('abc-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'abc-123');
  });

  it('creates a new id when none is sent', () => {
    const res = fakeResponse();
    const id = resolveRequestId(fakeRequest(), res);

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', id);
  });

  it('ignores an id longer than 100 characters', () => {
    const id = resolveRequestId(fakeRequest('x'.repeat(101)), fakeResponse());

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('buildLoggerOptions', () => {
  it('uses pretty logs in development', () => {
    const options = buildLoggerOptions(
      fakeConfig({ NODE_ENV: NodeEnv.Development, LOG_LEVEL: 'debug' }),
    );

    expect(options.pinoHttp).toMatchObject({
      level: 'debug',
      transport: { target: 'pino-pretty' },
    });
  });

  it('uses plain JSON logs outside development', () => {
    const options = buildLoggerOptions(
      fakeConfig({ NODE_ENV: NodeEnv.Production, LOG_LEVEL: 'info' }),
    );

    expect(options.pinoHttp).toMatchObject({ transport: undefined });
  });
});
