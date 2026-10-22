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
      FLEET_CAPACITY: 10,
      MAX_DRONE_WEIGHT_LIMIT_G: 500,
      MIN_LOADING_BATTERY_PCT: 25,
      PAGINATION_DEFAULT_LIMIT: 20,
      PAGINATION_MAX_LIMIT: 100,
      DB_LOCK_TIMEOUT_MS: 3000,
      IDEMPOTENCY_KEY_TTL_HOURS: 24,
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

  it.each([
    ['MIN_LOADING_BATTERY_PCT', '150'],
    ['MAX_DRONE_WEIGHT_LIMIT_G', '0'],
    ['MAX_DRONE_WEIGHT_LIMIT_G', '12.3456'],
    ['FLEET_CAPACITY', '0'],
  ])('fails when %s is %s', (name, value) => {
    expect(() => validateEnv({ ...validEnv, [name]: value })).toThrow(
      new RegExp(name),
    );
  });

  it('fails when the default page size is bigger than the max', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        PAGINATION_DEFAULT_LIMIT: '50',
        PAGINATION_MAX_LIMIT: '10',
      }),
    ).toThrow(/PAGINATION_DEFAULT_LIMIT/);
  });

  it('lists every invalid variable in one error', () => {
    expect(() => validateEnv({ PORT: 'abc', LOG_LEVEL: 'loud' })).toThrow(
      /PORT[\s\S]*DATABASE_URL[\s\S]*LOG_LEVEL[\s\S]*API_KEY/,
    );
  });
});
