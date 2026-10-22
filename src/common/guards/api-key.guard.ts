import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { EnvironmentVariables } from '../../config/env.validation';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export const API_KEY_HEADER = 'x-api-key';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly expectedDigest: Buffer;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.expectedDigest = digest(config.get('API_KEY', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const apiKey = context
      .switchToHttp()
      .getRequest<Request>()
      .header(API_KEY_HEADER);

    if (apiKey && timingSafeEqual(digest(apiKey), this.expectedDigest)) {
      return true;
    }

    throw new AppError(
      ErrorCode.UNAUTHORIZED,
      'Missing or invalid API key',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
