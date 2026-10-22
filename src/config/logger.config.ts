import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { Params } from 'nestjs-pino';
import { EnvironmentVariables, NodeEnv } from './env.validation';

export const REQUEST_ID_HEADER = 'x-request-id';
const MAX_REQUEST_ID_LENGTH = 100;

export function resolveRequestId(
  req: IncomingMessage,
  res: ServerResponse,
): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incoming === 'string' &&
    incoming.length > 0 &&
    incoming.length <= MAX_REQUEST_ID_LENGTH
      ? incoming
      : randomUUID();

  res.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}

export function buildLoggerOptions(
  config: ConfigService<EnvironmentVariables, true>,
): Params {
  const isDevelopment =
    config.get('NODE_ENV', { infer: true }) === NodeEnv.Development;

  return {
    pinoHttp: {
      level: config.get('LOG_LEVEL', { infer: true }),
      genReqId: resolveRequestId,
      redact: ['req.headers.authorization', 'req.headers["x-api-key"]'],
      autoLogging: { ignore: (req) => req.url === '/health' },
      transport: isDevelopment
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
    },
  };
}
