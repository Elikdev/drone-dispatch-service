import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { EnvironmentVariables } from '../../config/env.validation';
import { AppError } from '../errors/app-error';
import { ApiKeyGuard } from './api-key.guard';

const API_KEY = 'correct-api-key-123';

function context(apiKey?: string): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => (name === 'x-api-key' ? apiKey : undefined),
      }),
    }),
  } as unknown as ExecutionContext;
}

function guard(isPublic = false): ApiKeyGuard {
  const reflector = {
    getAllAndOverride: () => isPublic,
  } as unknown as Reflector;
  const config = {
    get: () => API_KEY,
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new ApiKeyGuard(reflector, config);
}

describe('ApiKeyGuard', () => {
  it('allows a request with the right key', () => {
    expect(guard().canActivate(context(API_KEY))).toBe(true);
  });

  it.each([
    ['a missing key', undefined],
    ['a wrong key of the same length', 'correct-api-key-124'],
    ['a key of a different length', 'short'],
  ])('rejects %s with UNAUTHORIZED', (_case, apiKey) => {
    expect(() => guard().canActivate(context(apiKey))).toThrow(
      expect.objectContaining({
        code: 'UNAUTHORIZED',
        status: 401,
      }) as AppError,
    );
  });

  it('allows a public route without a key', () => {
    expect(guard(true).canActivate(context())).toBe(true);
  });
});
