import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

function intercept(value: unknown) {
  const next: CallHandler = { handle: () => of(value) };
  return lastValueFrom(
    new ResponseInterceptor().intercept({} as ExecutionContext, next),
  );
}

describe('ResponseInterceptor', () => {
  it('wraps the handler result in the success format', async () => {
    await expect(intercept({ status: 'ok' })).resolves.toEqual({
      success: true,
      data: { status: 'ok' },
      error: null,
    });
  });

  it('returns null data when the handler returns nothing', async () => {
    await expect(intercept(undefined)).resolves.toEqual({
      success: true,
      data: null,
      error: null,
    });
  });
});
