import { INestApplication, Type } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export const TEST_API_KEY = process.env.API_KEY as string;

interface TestAppOptions {
  controllers?: Type<unknown>[];
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function createTestApp({
  controllers = [],
  configure = (builder) => builder,
}: TestAppOptions = {}): Promise<INestApplication<App>> {
  const moduleRef = await configure(
    Test.createTestingModule({ imports: [AppModule], controllers }),
  ).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}
