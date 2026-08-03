import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppConfig } from './config/app.config';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const host = process.env['API_HOST'] ?? '127.0.0.1';
  const port = parseInt(process.env['API_PORT'] ?? '3100', 10);

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    bufferLogs: false,
  });
  const config = app.get<AppConfig>('APP_CONFIG');

  // ---- Global prefix ----
  app.setGlobalPrefix('api');

  // ---- CORS ----
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
    credentials: true,
  });

  // ---- Request ID middleware ----
  app.use(RequestIdMiddleware.use);

  // ---- Global validation ----
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ---- Global exception filter ----
  app.useGlobalFilters(new AllExceptionsFilter());

  // ---- Graceful shutdown ----
  app.enableShutdownHooks();

  await app.listen(port, host);

  logger.log(`🚀 API đang chạy tại http://${host}:${port}/api`);
  logger.log(`🏥 Health: http://${host}:${port}/api/health/live`);
  logger.log(`🏥 Ready:  http://${host}:${port}/api/health/ready`);
  logger.log(`🤖 AI: ${process.env['AI_ENABLED'] === 'true' ? 'BẬT' : 'TẮT'}`);
}

void bootstrap();
