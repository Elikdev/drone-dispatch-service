import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  MethodNotAllowedException,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppError, ErrorCode } from './app-error';

function run(exception: unknown, requestId?: string) {
  const json = jest.fn<void, [Record<string, unknown>]>();
  const status = jest.fn<{ json: typeof json }, [number]>(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: requestId }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);

  return {
    status: status.mock.calls[0][0],
    body: json.mock.calls[0][0],
  };
}

describe('AllExceptionsFilter', () => {
  let logError: jest.SpyInstance;

  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    logError.mockRestore();
  });

  it('uses the code, status and details of an AppError', () => {
    const result = run(
      new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Request validation failed',
        HttpStatus.BAD_REQUEST,
        [{ field: 'name', errors: ['name is required'] }],
      ),
      'req-1',
    );

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [{ field: 'name', errors: ['name is required'] }],
        requestId: 'req-1',
      },
    });
  });

  it.each([
    [
      new BadRequestException('Unexpected end of JSON input'),
      400,
      'VALIDATION_ERROR',
    ],
    [new NotFoundException('Cannot GET /nope'), 404, 'NOT_FOUND'],
    [new ThrottlerException(), 429, 'RATE_LIMITED'],
    [new MethodNotAllowedException(), 405, 'VALIDATION_ERROR'],
    [new InternalServerErrorException(), 500, 'INTERNAL_ERROR'],
  ])('maps %p to %i %s', (exception, status, code) => {
    const result = run(exception);

    expect(result.status).toBe(status);
    expect(result.body).toMatchObject({ success: false, error: { code } });
  });

  it('maps a body that is too large to a 413 validation error', () => {
    const result = run({ type: 'entity.too.large', status: 413 });

    expect(result.status).toBe(413);
    expect(result.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('hides the details of an unexpected error', () => {
    const result = run(new Error('connection string with password'));

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      success: false,
      data: null,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('connection string with password'),
    );
  });

  it('does not log client errors', () => {
    run(new NotFoundException());

    expect(logError).not.toHaveBeenCalled();
  });
});
