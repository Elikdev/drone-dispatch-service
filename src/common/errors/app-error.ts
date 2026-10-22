import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: HttpStatus,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
