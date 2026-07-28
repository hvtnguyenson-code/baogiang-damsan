import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Integration tests for health endpoints.
 * These tests require a running PostgreSQL baogiang_test database.
 */
describe('Health endpoints (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env['DATABASE_URL'] =
      process.env['TEST_DATABASE_URL'] ??
      'postgresql://baogiang_test_user@127.0.0.1:5432/baogiang_test?schema=public';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health/live', () => {
    it('should return 200 with status ok', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health/live')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
      expect(typeof response.body.uptime).toBe('number');
    });
  });

  describe('GET /api/health/ready', () => {
    it('should return 200 with database status when DB is available', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.checks.database.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return 503 with error status when database fails', async () => {
      const prisma = app.get(PrismaService);
      jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('DB failure simulation'));

      const response = await request(app.getHttpServer())
        .get('/api/health/ready')
        .expect(503);

      expect(response.body.status).toBe('error');
      expect(response.body.checks.database.status).toBe('error');
      expect(response.body.checks.database.message).toBe('DB failure simulation');
    });

    it('should include database latency in response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health/ready');

      expect(typeof response.body.checks.database.latencyMs).toBe('number');
    });
  });

  describe('404 handling', () => {
    it('should return structured error for unknown routes', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/nonexistent-route')
        .expect(404);

      expect(response.body.statusCode).toBe(404);
      expect(response.body.timestamp).toBeDefined();
    });
  });
});
