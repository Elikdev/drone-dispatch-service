import { resolvePage } from './pagination';

const limits = { defaultLimit: 20, maxLimit: 100 };

describe('resolvePage', () => {
  it('uses page 1 and the default limit when nothing is sent', () => {
    expect(resolvePage({}, limits)).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('skips the rows of earlier pages', () => {
    expect(resolvePage({ page: 3, limit: 10 }, limits)).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
    });
  });

  it('lowers a limit above the max to the max', () => {
    expect(resolvePage({ limit: 500 }, limits)).toMatchObject({ limit: 100 });
  });
});
