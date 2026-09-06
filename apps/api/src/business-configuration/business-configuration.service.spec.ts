import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessConfigurationService } from './business-configuration.service';
import { BusinessPolicyFamilyDefinition } from './business-policy-registry';
import { CreateBusinessPolicyDraftDto } from './dto';

describe('BusinessConfigurationService', () => {
  const testFamily: BusinessPolicyFamilyDefinition = {
    key: 'TEST_FAMILY',
    resourceKind: 'SCHOOL_WIDE',
    validatorVersion: 'v1',
    publicationEnabled: true,
    downstreamAuthority: 'TEST_AUTHORITY',
    validate(payload: unknown) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new BadRequestException();
      const p = payload as Record<string, unknown>;
      if (typeof p.enabled !== 'boolean' || typeof p.threshold !== 'number') throw new BadRequestException();
      return { enabled: p.enabled, threshold: p.threshold };
    },
  };

  const p2034 = () =>
    new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock. Please retry your transaction', {
      code: 'P2034',
      clientVersion: '5',
    });

  const serialization40001 = () =>
    new Prisma.PrismaClientUnknownRequestError('PostgreSQL error 40001: could not serialize access due to read/write dependencies among transactions', {
      clientVersion: '5',
    });

  const deadlock40P01 = () =>
    new Prisma.PrismaClientUnknownRequestError('PostgreSQL error 40P01: deadlock detected', {
      clientVersion: '5',
    });

  const mockPrisma = {
    $transaction: jest.fn(),
    businessPolicyStream: { findFirst: jest.fn() },
    businessPolicyVersion: { findMany: jest.fn(), findUnique: jest.fn() },
  } as any;

  const mockAudit = { write: jest.fn() } as any;

  const mockMeta = {
    ip: '127.0.0.1',
    userAgent: 'test-agent',
    origin: 'http://localhost',
    requestId: 'req-123',
  };

  const draftDto: CreateBusinessPolicyDraftDto = {
    family: 'TEST_FAMILY',
    resource: { kind: 'SCHOOL_WIDE' },
    payload: { enabled: true, threshold: 10 },
    commandId: 'cmd-retry-test',
    effectiveFrom: '2026-09-01',
  };

  const mockTx = {
    businessPolicyCommand: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'cmd-rec-1' }),
    },
    businessPolicyStream: {
      findFirst: jest.fn().mockResolvedValue({ id: 'stream-1' }),
      create: jest.fn().mockResolvedValue({ id: 'stream-1' }),
    },
    businessPolicyVersion: {
      aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: 1 } }),
      create: jest.fn().mockResolvedValue({ id: 'version-1' }),
    },
  };

  let service: BusinessConfigurationService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => callback(mockTx));
    service = new BusinessConfigurationService(mockPrisma, mockAudit, [testFamily]);
  });

  describe('businessCivilDate', () => {
    it('returns ISO YYYY-MM-DD format in Asia/Ho_Chi_Minh timezone', () => {
      const date = service.businessCivilDate();
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('resolveEffectiveBusinessPolicy outcomes', () => {
    it('returns INVALID_EFFECTIVE_DATE for malformed civil dates', async () => {
      const res = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'SCHOOL_WIDE' }, 'not-a-date');
      expect(res.outcome).toBe('INVALID_EFFECTIVE_DATE');
    });

    it('returns UNKNOWN_POLICY_FAMILY for unregistered families', async () => {
      const res = await service.resolveEffectiveBusinessPolicy('UNKNOWN_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-01');
      expect(res.outcome).toBe('UNKNOWN_POLICY_FAMILY');
    });

    it('returns INVALID_POLICY_RESOURCE for mismatched resource kind', async () => {
      const res = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'ACADEMIC_YEAR', academicYearId: '123' }, '2026-09-01');
      expect(res.outcome).toBe('INVALID_POLICY_RESOURCE');
    });

    it('returns POLICY_NOT_CONFIGURED when no stream exists', async () => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue(null);
      const res = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-01');
      expect(res.outcome).toBe('POLICY_NOT_CONFIGURED');
    });

    it('returns POLICY_NOT_CONFIGURED when no published version covers the date', async () => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue({ id: 'stream-1' });
      mockPrisma.businessPolicyVersion.findMany.mockResolvedValue([]);
      const res = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-01');
      expect(res.outcome).toBe('POLICY_NOT_CONFIGURED');
    });

    it('returns POLICY_AMBIGUOUS when multiple matching authoritative candidates exist', async () => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue({ id: 'stream-1' });
      mockPrisma.businessPolicyVersion.findMany.mockResolvedValue([
        { id: 'v-1', streamId: 'stream-1', versionNumber: 1, validatorVersion: 'v1', payload: { enabled: true, threshold: 1 }, effectiveFrom: new Date('2026-09-01T00:00:00.000Z'), effectiveUntil: null },
        { id: 'v-2', streamId: 'stream-1', versionNumber: 2, validatorVersion: 'v1', payload: { enabled: true, threshold: 2 }, effectiveFrom: new Date('2026-09-01T00:00:00.000Z'), effectiveUntil: null },
      ]);
      const res = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-05');
      expect(res.outcome).toBe('POLICY_AMBIGUOUS');
    });

    it('returns POLICY_CORRUPT when stored validator version does not match family validator', async () => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue({ id: 'stream-1' });
      mockPrisma.businessPolicyVersion.findMany.mockResolvedValue([
        { id: 'v-1', streamId: 'stream-1', versionNumber: 1, validatorVersion: 'v-unknown', payload: { enabled: true, threshold: 1 }, effectiveFrom: new Date('2026-09-01T00:00:00.000Z'), effectiveUntil: null },
      ]);
      const res = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-05');
      expect(res.outcome).toBe('POLICY_CORRUPT');
    });

    it('returns POLICY_CORRUPT when persisted payload fails validator', async () => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue({ id: 'stream-1' });
      mockPrisma.businessPolicyVersion.findMany.mockResolvedValue([
        { id: 'v-1', streamId: 'stream-1', versionNumber: 1, validatorVersion: 'v1', payload: { invalid: 'payload' }, effectiveFrom: new Date('2026-09-01T00:00:00.000Z'), effectiveUntil: null },
      ]);
      const res = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-05');
      expect(res.outcome).toBe('POLICY_CORRUPT');
    });

    it('returns POLICY_CORRUPT when replacement lineage ancestor is missing or unclosed', async () => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue({ id: 'stream-1' });
      mockPrisma.businessPolicyVersion.findMany.mockResolvedValue([
        { id: 'v-2', streamId: 'stream-1', replacesVersionId: 'v-1', versionNumber: 2, validatorVersion: 'v1', payload: { enabled: true, threshold: 10 }, effectiveFrom: new Date('2026-09-10T00:00:00.000Z'), effectiveUntil: null },
      ]);
      mockPrisma.businessPolicyVersion.findUnique.mockResolvedValue(null);
      const res1 = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-15');
      expect(res1.outcome).toBe('POLICY_CORRUPT');

      // Unclosed ancestor (effectiveUntil is null)
      mockPrisma.businessPolicyVersion.findUnique.mockResolvedValue({
        id: 'v-1', streamId: 'stream-1', status: 'PUBLISHED', effectiveUntil: null, effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
      });
      const res2 = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-15');
      expect(res2.outcome).toBe('POLICY_CORRUPT');
    });

    it('returns POLICY_CORRUPT when correction lineage ancestor is not REVERSED', async () => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue({ id: 'stream-1' });
      mockPrisma.businessPolicyVersion.findMany.mockResolvedValue([
        { id: 'v-2', streamId: 'stream-1', correctsVersionId: 'v-1', versionNumber: 2, validatorVersion: 'v1', payload: { enabled: true, threshold: 10 }, effectiveFrom: new Date('2026-09-01T00:00:00.000Z'), effectiveUntil: null },
      ]);
      // Ancestor is still PUBLISHED instead of REVERSED
      mockPrisma.businessPolicyVersion.findUnique.mockResolvedValue({
        id: 'v-1', streamId: 'stream-1', status: 'PUBLISHED',
      });
      const res = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-05');
      expect(res.outcome).toBe('POLICY_CORRUPT');
    });

    it('returns RESOLVED with exact typed payload and metadata for valid version', async () => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue({ id: 'stream-1' });
      mockPrisma.businessPolicyVersion.findMany.mockResolvedValue([
        {
          id: 'v-1',
          streamId: 'stream-1',
          versionNumber: 1,
          status: 'PUBLISHED',
          validatorVersion: 'v1',
          payload: { enabled: true, threshold: 42 },
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
          effectiveUntil: new Date('2026-09-30T00:00:00.000Z'),
        },
      ]);
      const res = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-15');
      expect(res).toEqual({
        outcome: 'RESOLVED',
        family: 'TEST_FAMILY',
        resource: { kind: 'SCHOOL_WIDE' },
        requestedCivilDate: '2026-09-15',
        policyVersionId: 'v-1',
        validatorVersion: 'v1',
        payload: { enabled: true, threshold: 42 },
        effectiveFrom: '2026-09-01',
        effectiveUntil: '2026-09-30',
      });
    });
  });

  describe('bounded Serializable retry in mutate()', () => {
    // CASE A: P2034 lần đầu, attempt sau thành công
    it('retries P2034 on first attempt and succeeds on second attempt', async () => {
      mockPrisma.$transaction
        .mockRejectedValueOnce(p2034())
        .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => callback(mockTx));

      const res = await service.createDraft(draftDto, 'actor-1', mockMeta);
      expect(res).toEqual({ outcome: 'CREATED', streamId: 'stream-1', versionId: 'version-1' });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    // CASE B: Hai transient failures rồi success (attempt 3)
    it('retries through two transient failures and succeeds on third attempt', async () => {
      mockPrisma.$transaction
        .mockRejectedValueOnce(p2034())
        .mockRejectedValueOnce(serialization40001())
        .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => callback(mockTx));

      const res = await service.createDraft(draftDto, 'actor-1', mockMeta);
      expect(res).toEqual({ outcome: 'CREATED', streamId: 'stream-1', versionId: 'version-1' });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    });

    // CASE C: Transient failure cả 3 attempts -> exhausted typed conflict
    it('exhausts bounded retries after 3 attempts and maps to typed ConflictException without leaking raw error', async () => {
      mockPrisma.$transaction
        .mockRejectedValueOnce(p2034())
        .mockRejectedValueOnce(p2034())
        .mockRejectedValueOnce(p2034());

      await expect(service.createDraft(draftDto, 'actor-1', mockMeta)).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    });

    // CASE D: Postgres SQLSTATE 40001
    it('retries on PostgreSQL SQLSTATE 40001 serialization failure', async () => {
      mockPrisma.$transaction
        .mockRejectedValueOnce(serialization40001())
        .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => callback(mockTx));

      const res = await service.createDraft(draftDto, 'actor-1', mockMeta);
      expect(res).toEqual({ outcome: 'CREATED', streamId: 'stream-1', versionId: 'version-1' });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    // CASE E: Postgres SQLSTATE 40P01
    it('retries on PostgreSQL SQLSTATE 40P01 deadlock failure', async () => {
      mockPrisma.$transaction
        .mockRejectedValueOnce(deadlock40P01())
        .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => callback(mockTx));

      const res = await service.createDraft(draftDto, 'actor-1', mockMeta);
      expect(res).toEqual({ outcome: 'CREATED', streamId: 'stream-1', versionId: 'version-1' });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    // CASE F: Deterministic ConflictException không retry
    it('does not retry deterministic ConflictException and preserves the error', async () => {
      const deterministicConflict = new ConflictException('BUSINESS_POLICY_CONFLICT');
      mockPrisma.$transaction.mockRejectedValueOnce(deterministicConflict);

      await expect(service.createDraft(draftDto, 'actor-1', mockMeta)).rejects.toThrow(deterministicConflict);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    // CASE G: Unexpected non-transient error không retry
    it('does not retry unexpected non-transient error and preserves it', async () => {
      const unexpectedError = new Error('unexpected database connection dropped');
      mockPrisma.$transaction.mockRejectedValueOnce(unexpectedError);

      await expect(service.createDraft(draftDto, 'actor-1', mockMeta)).rejects.toThrow('unexpected database connection dropped');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    // CASE H: Deterministic validation failure không retry
    it('does not retry validation error on invalid input payload', async () => {
      const invalidDto: CreateBusinessPolicyDraftDto = {
        ...draftDto,
        payload: { invalidField: true },
      };

      await expect(service.createDraft(invalidDto, 'actor-1', mockMeta)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
