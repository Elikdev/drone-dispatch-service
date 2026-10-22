import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { EnvironmentVariables, validateEnv } from './config/env.validation';
import { buildLoggerOptions } from './config/logger.config';
import { PrismaModule } from './database/prisma.module';
import { BatteryModule } from './modules/battery/battery.module';
import { DronesModule } from './modules/drones/drones.module';
import { HealthModule } from './modules/health/health.module';
import { MedicationsModule } from './modules/medications/medications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildLoggerOptions,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => [
        {
          ttl: config.get('RATE_LIMIT_TTL_MS', { infer: true }),
          limit: config.get('RATE_LIMIT_MAX', { infer: true }),
        },
      ],
    }),
    PrismaModule,
    HealthModule,
    DronesModule,
    MedicationsModule,
    BatteryModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
