import { plainToInstance, Transform, Type } from 'class-transformer';
import { toBoolean } from '../common/validation/to-boolean';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export const NodeEnv = {
  Development: 'development',
  Test: 'test',
  Production: 'production',
} as const;
export type NodeEnv = (typeof NodeEnv)[keyof typeof NodeEnv];

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL must be a postgres connection string',
  })
  DATABASE_URL: string;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: LogLevel = 'info';

  @IsString()
  @MinLength(16)
  API_KEY: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  RATE_LIMIT_TTL_MS = 60000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_MAX = 100;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  FLEET_CAPACITY = 10;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  MAX_DRONE_WEIGHT_LIMIT_G = 500;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  MIN_LOADING_BATTERY_PCT = 25;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PAGINATION_DEFAULT_LIMIT = 20;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  PAGINATION_MAX_LIMIT = 100;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(30000)
  DB_LOCK_TIMEOUT_MS = 3000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  IDEMPOTENCY_KEY_TTL_HOURS = 24;

  @Transform(toBoolean)
  @IsBoolean()
  BATTERY_AUDIT_ENABLED = true;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  BATTERY_CHECK_INTERVAL_MS = 60000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  BATTERY_AUDIT_BATCH_SIZE = 1000;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const lines = validateSync(env).map(
    (error) =>
      `- ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
  );

  if (env.PAGINATION_DEFAULT_LIMIT > env.PAGINATION_MAX_LIMIT) {
    lines.push(
      '- PAGINATION_DEFAULT_LIMIT: must not be greater than PAGINATION_MAX_LIMIT',
    );
  }

  if (lines.length > 0) {
    throw new Error(`Invalid environment variables:\n${lines.join('\n')}`);
  }

  return env;
}
