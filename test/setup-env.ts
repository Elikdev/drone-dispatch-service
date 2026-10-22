import 'reflect-metadata';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.API_KEY ??= 'test-api-key-0123456789';
process.env.RATE_LIMIT_MAX ??= '10000';
process.env.DB_LOCK_TIMEOUT_MS ??= '500';
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/drone_dispatch_test';
