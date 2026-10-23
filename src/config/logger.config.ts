import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Params } from 'nestjs-pino';
import { EnvironmentVariables, NodeEnv } from './env.validation';

export const REQUEST_ID_HEADER = 'x-request-id';
const MAX_REQUEST_ID_LENGTH = 100;
const LOGGED_HEADERS = [
  'content-type',
  'content-length',
  'idempotency-key',
  'x-forwarded-for',
];
const QUIET_PATHS = ['/health', '/docs'];

interface SerializedRequest {
  id: string;
  method: string;
  url: string;
  remoteAddress: string;
  headers: Record<string, string | undefined>;
}

function pickHeaders(headers: Record<string, string | undefined>) {
  const picked: Record<string, string> = {};
  for (const name of LOGGED_HEADERS) {
    const value = headers[name];
    if (value) {
      picked[name] = value;
    }
  }
  return picked;
}

function summary(req: IncomingMessage, res: ServerResponse) {
  return `${req.method} ${req.url} ${res.statusCode}`;
}

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
    forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
    pinoHttp: {
      level: config.get('LOG_LEVEL', { infer: true }),
      genReqId: resolveRequestId,
      autoLogging: {
        ignore: (req) => QUIET_PATHS.some((path) => req.url?.startsWith(path)),
      },
      serializers: {
        req: (req: SerializedRequest) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          ip: req.remoteAddress,
          headers: pickHeaders(req.headers),
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (req, res, error) => {
        if (error || res.statusCode >= 500) {
          return 'error';
        }
        return res.statusCode >= 400 ? 'warn' : 'info';
      },
      customSuccessMessage: (req, res, responseTime) =>
        `${summary(req, res)} ${responseTime}ms`,
      customErrorMessage: (req, res) => summary(req, res),
      transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: { singleLine: true, ignore: 'pid,hostname' },
          }
        : undefined,
    },
  };
}
