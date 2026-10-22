import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorBody, ApiFailure } from '../responses/api-response';
import { AppError } from './app-error';
import { ErrorCode } from './error-codes';

interface MappedError {
  status: number;
  body: Omit<ApiErrorBody, 'requestId'>;
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

function isBodyTooLarge(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'type' in exception &&
    exception.type === 'entity.too.large'
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const { status, body } = this.map(exception);

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ApiFailure = {
      success: false,
      data: null,
      error: {
        ...body,
        requestId: typeof request.id === 'string' ? request.id : undefined,
      },
    };
    response.status(status).json(payload);
  }

  private map(exception: unknown): MappedError {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        body: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const fallback =
        status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.REQUEST_ERROR;
      return {
        status,
        body: {
          code: CODE_BY_STATUS[status] ?? fallback,
          message: exception.message,
        },
      };
    }

    if (isBodyTooLarge(exception)) {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        body: {
          code: ErrorCode.PAYLOAD_TOO_LARGE,
          message: 'Request body is too large',
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Something went wrong',
      },
    };
  }
}
