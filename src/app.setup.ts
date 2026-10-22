import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppError } from './common/errors/app-error';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { ErrorCode } from './common/errors/error-codes';
import { formatValidationErrors } from './common/errors/format-validation-errors';
import { API_KEY_HEADER } from './common/guards/api-key.guard';
import { ResponseInterceptor } from './common/responses/response.interceptor';

export const API_PREFIX = 'api/v1';

export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Request validation failed',
          HttpStatus.BAD_REQUEST,
          formatValidationErrors(errors),
        ),
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Drone Dispatch Service')
    .setDescription(
      'REST API for managing a fleet of drones that deliver medication',
    )
    .setVersion('1.0')
    .addApiKey(
      { type: 'apiKey', name: API_KEY_HEADER, in: 'header' },
      API_KEY_HEADER,
    )
    .addSecurityRequirements(API_KEY_HEADER)
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
}
