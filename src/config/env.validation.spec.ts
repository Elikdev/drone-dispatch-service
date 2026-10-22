import { NodeEnv, validateEnv } from './env.validation';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  API_KEY: 'a-very-long-api-key',
};

describe('validateEnv', () => {
  it('applies defaults when optional values are missing', () => {
    const env = validateEnv(validEnv);

    expect(env).toMatchObject({
      NODE_ENV: NodeEnv.Development,
      PORT: 3000,
      LOG_LEVEL: 'info',
      RATE_LIMIT_TTL_MS: 60000,
      RATE_LIMIT_MAX: 100,
    });
  });

  it('turns numeric strings into numbers', () => {
    const env = validateEnv({ ...validEnv, PORT: '8080', RATE_LIMIT_MAX: '5' });

    expect(env.PORT).toBe(8080);
    expect(env.RATE_LIMIT_MAX).toBe(5);
  });

  it('fails when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ API_KEY: validEnv.API_KEY })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('fails when DATABASE_URL is not a postgres url', () => {
    expect(() =>
      validateEnv({ ...validEnv, DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrow(/postgres connection string/);
  });

  it('fails when API_KEY is shorter than 16 characters', () => {
    expect(() => validateEnv({ ...validEnv, API_KEY: 'short' })).toThrow(
      /API_KEY/,
    );
  });

  it.each(['0', '70000', 'abc'])('fails when PORT is %s', (port) => {
    expect(() => validateEnv({ ...validEnv, PORT: port })).toThrow(/PORT/);
  });

  it('lists every invalid variable in one error', () => {
    expect(() => validateEnv({ PORT: 'abc', LOG_LEVEL: 'loud' })).toThrow(
      /PORT[\s\S]*DATABASE_URL[\s\S]*LOG_LEVEL[\s\S]*API_KEY/,
    );
  });
});
