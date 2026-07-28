import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { HealthController } from '../../src/health/health.controller';
import { PrismaService } from '../../src/prisma/prisma.service';
import { HealthLiveResponse, HealthReadyResponse } from '@baogiang/contracts';

/**
 * Unit tests for HealthController.
 * The PrismaService is mocked - no real database is needed.
 */
describe('HealthController (unit)', () => {
  let controller: HealthController;
  let prismaService: jest.Mocked<Pick<PrismaService, '$queryRaw'>>;

  const mockPrismaQueryRaw = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: mockPrismaQueryRaw,
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---- Liveness ----

  describe('getLive()', () => {
    it('should return status ok with process metadata', () => {
      const result: HealthLiveResponse = controller.getLive();

      expect(result.status).toBe('ok');
      expect(result.version).toBeDefined();
      expect(result.phase).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return a valid ISO timestamp', () => {
      const result = controller.getLive();
      const parsed = new Date(result.timestamp);
      expect(isNaN(parsed.getTime())).toBe(false);
    });
  });

  // ---- Readiness ----

  describe('getReady()', () => {
    it('should return status ok when database responds', async () => {
      mockPrismaQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      const mockRes = { status: jest.fn() } as unknown as Response;

      const result: HealthReadyResponse = await controller.getReady(mockRes);

      expect(result.status).toBe('ok');
      expect(result.checks.database.status).toBe('ok');
      expect(typeof result.checks.database.latencyMs).toBe('number');
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return status error and HTTP 503 status when database fails', async () => {
      mockPrismaQueryRaw.mockRejectedValueOnce(
        new Error('Connection refused'),
      );
      const mockRes = { status: jest.fn() } as unknown as Response;

      const result: HealthReadyResponse = await controller.getReady(mockRes);

      expect(result.status).toBe('error');
      expect(result.checks.database.status).toBe('error');
      expect(result.checks.database.message).toContain('Connection refused');
      expect(mockRes.status).toHaveBeenCalledWith(503);
    });

    it('should return a valid ISO timestamp', async () => {
      mockPrismaQueryRaw.mockResolvedValueOnce([]);
      const mockRes = { status: jest.fn() } as unknown as Response;
      const result = await controller.getReady(mockRes);
      const parsed = new Date(result.timestamp);
      expect(isNaN(parsed.getTime())).toBe(false);
    });
  });

  it('prismaService is mocked and not undefined', () => {
    expect(prismaService).toBeDefined();
  });
});
