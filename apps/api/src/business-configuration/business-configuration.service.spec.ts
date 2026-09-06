import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessConfigurationService } from './business-configuration.service';
import { BusinessPolicyFamilyDefinition } from './business-policy-registry';
import { CreateBusinessPolicyDraftDto } from './dto';

describe('BusinessConfigurationService', () => {
  const testFamily: BusinessPolicyFamilyDefinition = {
    key: 'TEST_FAMILY',
    resourceKind: 'SCHOOL_WIDE',
    currentValidatorVersion: 'v1',
    publicationEnabled: true,
    downstreamAuthority: 'TEST_AUTHORITY',
    validators: [
      {
        version: 'v1',
        validate(payload: unknown) {
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new BadRequestException();
          const p = payload as Record<string, unknown>;
          if (typeof p.enabled !== 'boolean' || typeof p.threshold !== 'number') throw new BadRequestException();
          return { enabled: p.enabled, threshold: p.threshold };
        },
      },
    ],
  };

  const multiVersionFamily: BusinessPolicyFamilyDefinition = {
    key: 'MULTI_VERSION_FAMILY',
    resourceKind: 'SCHOOL_WIDE',
    currentValidatorVersion: 'v2',
    publicationEnabled: true,
    downstreamAuthority: 'TEST_AUTHORITY',
    validators: [
      {
        version: 'v1',
        validate(payload: unknown) {
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new BadRequestException('Invalid v1 payload');
          const p = payload as Record<string, unknown>;
          if (typeof p.v1Field !== 'string') throw new BadRequestException('Invalid v1 payload');
          return { v1Field: p.v1Field };
        },
      },
      {
        version: 'v2',
        validate(payload: unknown) {
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new BadRequestException('Invalid v2 payload');
          const p = payload as Record<string, unknown>;
          if (typeof p.v2Field !== 'number' || typeof p.v2Flag !== 'boolean') throw new BadRequestException('Invalid v2 payload');
          return { v2Field: p.v2Field, v2Flag: p.v2Flag };
        },
      },
    ],
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

  type MockFn = jest.Mock;

  interface MockTxClient {
    businessPolicyCommand: {
      findUnique: MockFn;
      create: MockFn;
    };
    businessPolicyStream: {
      findFirst: MockFn;
      create: MockFn;
    };
    businessPolicyVersion: {
      aggregate: MockFn;
      create: MockFn;
      findUnique: MockFn;
      updateMany: MockFn;
    };
  }

  interface MockPrismaClient {
    $transaction: MockFn;
    businessPolicyStream: { findFirst: MockFn };
    businessPolicyVersion: { findMany: MockFn; findUnique: MockFn };
  }

  const mockPrisma: MockPrismaClient = {
    $transaction: jest.fn(),
    businessPolicyStream: { findFirst: jest.fn() },
    businessPolicyVersion: { findMany: jest.fn(), findUnique: jest.fn() },
  };

  const mockAudit = { write: jest.fn() } as unknown as AuditService;

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

  const mockTx: MockTxClient = {
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
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  let service: BusinessConfigurationService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      callback(mockTx as unknown as Prisma.TransactionClient),
    );
    service = new BusinessConfigurationService(
      mockPrisma as unknown as PrismaService,
      mockAudit,
      [testFamily, multiVersionFamily],
    );
  });

  describe('businessCivilDate', () => {
    it('returns ISO YYYY-MM-DD format in Asia/Ho_Chi_Minh timezone', () => {
      const date = service.businessCivilDate();
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('strict civil date validation', () => {
    const validDates = ['2024-02-29', '2026-09-06'];
    const invalidDates = [
      '2026-02-30',
      '2025-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-04-31',
      'not-a-date',
      '2026-09-06T00:00:00.000Z',
    ];

    test.each(validDates)('accepts valid civil date in resolver: %s', async (date) => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue({ id: 'stream-1' });
      mockPrisma.businessPolicyVersion.findMany.mockResolvedValue([]);
      const res = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'SCHOOL_WIDE' }, date);
      expect(res.outcome).not.toBe('INVALID_EFFECTIVE_DATE');
    });

    test.each(invalidDates)('rejects invalid civil date in resolver with INVALID_EFFECTIVE_DATE: %s', async (date) => {
      const res = await service.resolveEffectiveBusinessPolicy('TEST_FAMILY', { kind: 'SCHOOL_WIDE' }, date);
      expect(res.outcome).toBe('INVALID_EFFECTIVE_DATE');
    });

    test.each(invalidDates)('rejects invalid effectiveFrom in createDraft with INVALID_EFFECTIVE_DATE: %s', async (date) => {
      const dto: CreateBusinessPolicyDraftDto = {
        ...draftDto,
        effectiveFrom: date,
      };
      await expect(service.createDraft(dto, 'actor-1', mockMeta)).rejects.toThrow('INVALID_EFFECTIVE_DATE');
    });

    test.each(invalidDates)('rejects invalid effectiveUntil in createDraft with INVALID_EFFECTIVE_DATE: %s', async (date) => {
      const dto: CreateBusinessPolicyDraftDto = {
        ...draftDto,
        effectiveFrom: '2026-09-01',
        effectiveUntil: date,
      };
      await expect(service.createDraft(dto, 'actor-1', mockMeta)).rejects.toThrow('INVALID_EFFECTIVE_DATE');
    });
  });

  describe('historical validator version architecture (multi-version family)', () => {
    it('resolves persisted PUBLISHED v1 using v1 validator without corruption', async () => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue({ id: 'stream-mv' });
      mockPrisma.businessPolicyVersion.findMany.mockResolvedValue([
        {
          id: 'v-legacy-1',
          streamId: 'stream-mv',
          versionNumber: 1,
          status: 'PUBLISHED',
          validatorVersion: 'v1',
          payload: { v1Field: 'legacy-valid-value' },
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
          effectiveUntil: new Date('2026-09-10T00:00:00.000Z'),
        },
      ]);

      const res = await service.resolveEffectiveBusinessPolicy('MULTI_VERSION_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-05');
      expect(res.outcome).toBe('RESOLVED');
      if (res.outcome === 'RESOLVED') {
        expect(res.validatorVersion).toBe('v1');
        expect(res.payload).toEqual({ v1Field: 'legacy-valid-value' });
      }
    });

    it('resolves persisted PUBLISHED v2 using current v2 validator', async () => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue({ id: 'stream-mv' });
      mockPrisma.businessPolicyVersion.findMany.mockResolvedValue([
        {
          id: 'v-new-2',
          streamId: 'stream-mv',
          versionNumber: 2,
          status: 'PUBLISHED',
          validatorVersion: 'v2',
          payload: { v2Field: 100, v2Flag: true },
          effectiveFrom: new Date('2026-09-11T00:00:00.000Z'),
          effectiveUntil: null,
        },
      ]);

      const res = await service.resolveEffectiveBusinessPolicy('MULTI_VERSION_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-15');
      expect(res.outcome).toBe('RESOLVED');
      if (res.outcome === 'RESOLVED') {
        expect(res.validatorVersion).toBe('v2');
        expect(res.payload).toEqual({ v2Field: 100, v2Flag: true });
      }
    });

    it('returns POLICY_CORRUPT for unknown stored validator versions (e.g. v0 or v99)', async () => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue({ id: 'stream-mv' });
      mockPrisma.businessPolicyVersion.findMany.mockResolvedValue([
        {
          id: 'v-unknown-99',
          streamId: 'stream-mv',
          versionNumber: 1,
          status: 'PUBLISHED',
          validatorVersion: 'v99',
          payload: { v2Field: 100, v2Flag: true },
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
          effectiveUntil: null,
        },
      ]);

      const res = await service.resolveEffectiveBusinessPolicy('MULTI_VERSION_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-05');
      expect(res.outcome).toBe('POLICY_CORRUPT');
    });

    it('does NOT reinterpret v1 payload with current v2 validator', async () => {
      mockPrisma.businessPolicyStream.findFirst.mockResolvedValue({ id: 'stream-mv' });
      mockPrisma.businessPolicyVersion.findMany.mockResolvedValue([
        {
          id: 'v-legacy-1',
          streamId: 'stream-mv',
          versionNumber: 1,
          status: 'PUBLISHED',
          validatorVersion: 'v1',
          payload: { v1Field: 'only-in-v1' },
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
          effectiveUntil: null,
        },
      ]);

      const res = await service.resolveEffectiveBusinessPolicy('MULTI_VERSION_FAMILY', { kind: 'SCHOOL_WIDE' }, '2026-09-05');
      expect(res.outcome).toBe('RESOLVED');
      if (res.outcome === 'RESOLVED') {
        expect(res.validatorVersion).toBe('v1');
      }
    });

    it('creates new draft using current validator version (v2)', async () => {
      const createDto: CreateBusinessPolicyDraftDto = {
        family: 'MULTI_VERSION_FAMILY',
        resource: { kind: 'SCHOOL_WIDE' },
        payload: { v2Field: 42, v2Flag: true },
        commandId: 'cmd-create-v2',
        effectiveFrom: '2026-09-01',
      };

      await service.createDraft(createDto, 'actor-1', mockMeta);
      expect(mockTx.businessPolicyVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            validatorVersion: 'v2',
            payload: { v2Field: 42, v2Flag: true },
          }),
        }),
      );

      const legacyDto: CreateBusinessPolicyDraftDto = {
        ...createDto,
        payload: { v1Field: 'legacy-attempt' },
        commandId: 'cmd-create-legacy',
      };
      await expect(service.createDraft(legacyDto, 'actor-1', mockMeta)).rejects.toThrow('Invalid v2 payload');
    });

    it('validates editDraft using the exact stored validatorVersion (v1)', async () => {
      const existingDraftV1 = {
        id: 'draft-v1',
        streamId: 'stream-mv',
        status: 'DRAFT',
        draftRevision: 1,
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        effectiveUntil: null,
        stream: { familyKey: 'MULTI_VERSION_FAMILY', resourceKind: 'SCHOOL_WIDE', academicYearId: null },
      };
      mockTx.businessPolicyVersion.findUnique = jest.fn().mockResolvedValue(existingDraftV1);
      mockTx.businessPolicyVersion.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const editDtoValid = {
        expectedRevision: 1,
        commandId: 'cmd-edit-v1',
        payload: { v1Field: 'updated-v1-value' },
      };
      const res = await service.editDraft('draft-v1', editDtoValid, 'actor-1', mockMeta);
      expect(res).toEqual({ outcome: 'UPDATED', versionId: 'draft-v1' });
      expect(mockTx.businessPolicyVersion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            payload: { v1Field: 'updated-v1-value' },
            draftRevision: { increment: 1 },
          },
        }),
      );

      const editDtoInvalidV2 = {
        expectedRevision: 1,
        commandId: 'cmd-edit-v2-reject',
        payload: { v2Field: 99, v2Flag: true },
      };
      await expect(service.editDraft('draft-v1', editDtoInvalidV2, 'actor-1', mockMeta)).rejects.toThrow('Invalid v1 payload');
    });

    it('revalidates publish using the exact stored validatorVersion (v1)', async () => {
      const existingDraftV1 = {
        id: 'draft-v1',
        streamId: 'stream-mv',
        status: 'DRAFT',
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        effectiveUntil: null,
        payload: { v1Field: 'ready-to-publish' },
        stream: { familyKey: 'MULTI_VERSION_FAMILY', resourceKind: 'SCHOOL_WIDE', academicYearId: null },
      };
      mockTx.businessPolicyVersion.findUnique = jest.fn().mockResolvedValue(existingDraftV1);
      mockTx.businessPolicyVersion.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const res = await service.publish('draft-v1', { commandId: 'cmd-pub-v1' }, 'actor-1', mockMeta);
      expect(res).toEqual({ outcome: 'PUBLISHED', versionId: 'draft-v1' });
      expect(mockTx.businessPolicyVersion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'draft-v1', status: 'DRAFT' },
          data: expect.objectContaining({ status: 'PUBLISHED' }),
        }),
      );
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
        .mockImplementationOnce(async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          callback(mockTx as unknown as Prisma.TransactionClient),
        );

      const res = await service.createDraft(draftDto, 'actor-1', mockMeta);
      expect(res).toEqual({ outcome: 'CREATED', streamId: 'stream-1', versionId: 'version-1' });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    // CASE B: Hai transient failures rồi success (attempt 3)
    it('retries through two transient failures and succeeds on third attempt', async () => {
      mockPrisma.$transaction
        .mockRejectedValueOnce(p2034())
        .mockRejectedValueOnce(serialization40001())
        .mockImplementationOnce(async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          callback(mockTx as unknown as Prisma.TransactionClient),
        );

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
        .mockImplementationOnce(async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          callback(mockTx as unknown as Prisma.TransactionClient),
        );

      const res = await service.createDraft(draftDto, 'actor-1', mockMeta);
      expect(res).toEqual({ outcome: 'CREATED', streamId: 'stream-1', versionId: 'version-1' });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    // CASE E: Postgres SQLSTATE 40P01
    it('retries on PostgreSQL SQLSTATE 40P01 deadlock failure', async () => {
      mockPrisma.$transaction
        .mockRejectedValueOnce(deadlock40P01())
        .mockImplementationOnce(async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          callback(mockTx as unknown as Prisma.TransactionClient),
        );

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

  describe('audit evidence completeness (Gate 16)', () => {
    it('records full audit metadata for CREATE DRAFT', async () => {
      await service.createDraft(draftDto, 'actor-1', mockMeta);
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'actor-1',
          action: 'BUSINESS_POLICY_DRAFT_CREATED',
          entityType: 'BusinessPolicyVersion',
          entityId: 'version-1',
          metadata: expect.objectContaining({
            family: 'TEST_FAMILY',
            resource: { kind: 'SCHOOL_WIDE' },
            versionId: 'version-1',
            effectiveFrom: '2026-09-01',
            effectiveUntil: null,
            validatorVersion: 'v1',
            commandId: 'cmd-retry-test',
            payloadFingerprint: expect.any(String),
          }),
        }),
        expect.anything(),
      );
    });

    it('records full audit metadata for EDIT DRAFT including draftRevision', async () => {
      mockTx.businessPolicyVersion.findUnique.mockResolvedValue({
        id: 'draft-edit-1',
        status: 'DRAFT',
        draftRevision: 2,
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        effectiveUntil: null,
        stream: { familyKey: 'TEST_FAMILY', resourceKind: 'SCHOOL_WIDE', academicYearId: null },
      });
      mockTx.businessPolicyVersion.updateMany.mockResolvedValue({ count: 1 });

      await service.editDraft('draft-edit-1', { expectedRevision: 2, commandId: 'cmd-edit-meta', payload: { enabled: true, threshold: 5 } }, 'actor-1', mockMeta);
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'actor-1',
          action: 'BUSINESS_POLICY_DRAFT_EDITED',
          entityId: 'draft-edit-1',
          metadata: expect.objectContaining({
            family: 'TEST_FAMILY',
            resource: { kind: 'SCHOOL_WIDE' },
            versionId: 'draft-edit-1',
            effectiveFrom: '2026-09-01',
            effectiveUntil: null,
            validatorVersion: 'v1',
            commandId: 'cmd-edit-meta',
            payloadFingerprint: expect.any(String),
            draftRevision: 3,
          }),
        }),
        expect.anything(),
      );
    });

    it('records full audit metadata for PUBLISH', async () => {
      mockTx.businessPolicyVersion.findUnique.mockResolvedValue({
        id: 'draft-pub-1',
        status: 'DRAFT',
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        effectiveUntil: new Date('2026-09-30T00:00:00.000Z'),
        payload: { enabled: true, threshold: 10 },
        stream: { familyKey: 'TEST_FAMILY', resourceKind: 'SCHOOL_WIDE', academicYearId: null },
      });
      mockTx.businessPolicyVersion.updateMany.mockResolvedValue({ count: 1 });

      await service.publish('draft-pub-1', { commandId: 'cmd-pub-meta' }, 'actor-1', mockMeta);
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'actor-1',
          action: 'BUSINESS_POLICY_PUBLISHED',
          entityId: 'draft-pub-1',
          metadata: expect.objectContaining({
            family: 'TEST_FAMILY',
            resource: { kind: 'SCHOOL_WIDE' },
            versionId: 'draft-pub-1',
            effectiveFrom: '2026-09-01',
            effectiveUntil: '2026-09-30',
            validatorVersion: 'v1',
            commandId: 'cmd-pub-meta',
          }),
        }),
        expect.anything(),
      );
    });

    it('records full audit metadata for REPLACE with explicit before/after effectivity', async () => {
      jest.spyOn(service, 'businessCivilDate').mockReturnValue('2026-09-01');
      mockTx.businessPolicyVersion.findUnique.mockResolvedValue({
        id: 'published-rep-1',
        streamId: 'stream-1',
        status: 'PUBLISHED',
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        effectiveUntil: null,
        stream: { familyKey: 'TEST_FAMILY', resourceKind: 'SCHOOL_WIDE', academicYearId: null },
      });
      mockTx.businessPolicyVersion.aggregate.mockResolvedValue({ _max: { versionNumber: 1 } });
      mockTx.businessPolicyVersion.updateMany.mockResolvedValue({ count: 1 });
      mockTx.businessPolicyVersion.create.mockResolvedValue({ id: 'replacement-v2' });

      await service.replace(
        'published-rep-1',
        { commandId: 'cmd-rep-meta', effectiveFrom: '2026-09-10', payload: { enabled: false, threshold: 99 } },
        'actor-1',
        mockMeta,
      );
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'actor-1',
          action: 'BUSINESS_POLICY_REPLACED',
          entityId: 'published-rep-1',
          metadata: expect.objectContaining({
            family: 'TEST_FAMILY',
            resource: { kind: 'SCHOOL_WIDE' },
            sourceVersionId: 'published-rep-1',
            replacementVersionId: 'replacement-v2',
            sourceEffectiveFrom: '2026-09-01',
            sourceEffectiveUntilBefore: null,
            sourceEffectiveUntilAfter: '2026-09-09',
            replacementEffectiveFrom: '2026-09-10',
            replacementEffectiveUntil: null,
            validatorVersion: 'v1',
            replacesVersionId: 'published-rep-1',
            commandId: 'cmd-rep-meta',
            payloadFingerprint: expect.any(String),
          }),
        }),
        expect.anything(),
      );
    });

    it('records full audit metadata for RETIRE with explicit before/after effectivity', async () => {
      jest.spyOn(service, 'businessCivilDate').mockReturnValue('2026-09-01');
      mockTx.businessPolicyVersion.findUnique.mockResolvedValue({
        id: 'published-ret-1',
        status: 'PUBLISHED',
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        effectiveUntil: null,
        stream: { familyKey: 'TEST_FAMILY', resourceKind: 'SCHOOL_WIDE', academicYearId: null },
      });
      mockTx.businessPolicyVersion.updateMany.mockResolvedValue({ count: 1 });

      await service.retire(
        'published-ret-1',
        { commandId: 'cmd-ret-meta', effectiveUntil: '2026-09-20', reason: 'Normal retirement' },
        'actor-1',
        mockMeta,
      );
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'actor-1',
          action: 'BUSINESS_POLICY_RETIRED',
          entityId: 'published-ret-1',
          metadata: expect.objectContaining({
            family: 'TEST_FAMILY',
            resource: { kind: 'SCHOOL_WIDE' },
            versionId: 'published-ret-1',
            effectiveFrom: '2026-09-01',
            effectiveUntilBefore: null,
            effectiveUntilAfter: '2026-09-20',
            reason: 'Normal retirement',
            commandId: 'cmd-ret-meta',
          }),
        }),
        expect.anything(),
      );
    });

    it('records full audit metadata for CORRECT with source/corrected effectivity', async () => {
      mockTx.businessPolicyVersion.findUnique.mockResolvedValue({
        id: 'published-cor-1',
        streamId: 'stream-1',
        status: 'PUBLISHED',
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        effectiveUntil: null,
        stream: { familyKey: 'TEST_FAMILY', resourceKind: 'SCHOOL_WIDE', academicYearId: null },
      });
      mockTx.businessPolicyVersion.aggregate.mockResolvedValue({ _max: { versionNumber: 1 } });
      mockTx.businessPolicyVersion.updateMany.mockResolvedValue({ count: 1 });
      mockTx.businessPolicyVersion.create.mockResolvedValue({ id: 'corrected-v2' });

      await service.correct(
        'published-cor-1',
        { commandId: 'cmd-cor-meta', payload: { enabled: true, threshold: 50 }, reason: 'Fix typographical threshold mistake' },
        'actor-1',
        mockMeta,
      );
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'actor-1',
          action: 'BUSINESS_POLICY_CORRECTED',
          entityId: 'published-cor-1',
          metadata: expect.objectContaining({
            family: 'TEST_FAMILY',
            resource: { kind: 'SCHOOL_WIDE' },
            sourceVersionId: 'published-cor-1',
            sourceEffectiveFrom: '2026-09-01',
            sourceEffectiveUntil: null,
            correctedVersionId: 'corrected-v2',
            correctedEffectiveFrom: '2026-09-01',
            correctedEffectiveUntil: null,
            validatorVersion: 'v1',
            correctsVersionId: 'published-cor-1',
            reason: 'Fix typographical threshold mistake',
            commandId: 'cmd-cor-meta',
            payloadFingerprint: expect.any(String),
          }),
        }),
        expect.anything(),
      );
    });

    it('records full audit metadata for CORRECT with modified interval', async () => {
      mockTx.businessPolicyVersion.findUnique.mockResolvedValue({
        id: 'published-cor-2',
        streamId: 'stream-1',
        status: 'PUBLISHED',
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        effectiveUntil: null,
        stream: { familyKey: 'TEST_FAMILY', resourceKind: 'SCHOOL_WIDE', academicYearId: null },
      });
      mockTx.businessPolicyVersion.aggregate.mockResolvedValue({ _max: { versionNumber: 1 } });
      mockTx.businessPolicyVersion.updateMany.mockResolvedValue({ count: 1 });
      mockTx.businessPolicyVersion.create.mockResolvedValue({ id: 'corrected-v3' });

      await service.correct(
        'published-cor-2',
        {
          commandId: 'cmd-cor-interval',
          effectiveFrom: '2026-09-05',
          effectiveUntil: '2026-09-25',
          payload: { enabled: true, threshold: 75 },
          reason: 'Adjust effective dates and parameters',
        },
        'actor-1',
        mockMeta,
      );
      expect(mockAudit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'actor-1',
          action: 'BUSINESS_POLICY_CORRECTED',
          entityId: 'published-cor-2',
          metadata: expect.objectContaining({
            family: 'TEST_FAMILY',
            resource: { kind: 'SCHOOL_WIDE' },
            sourceVersionId: 'published-cor-2',
            sourceEffectiveFrom: '2026-09-01',
            sourceEffectiveUntil: null,
            correctedVersionId: 'corrected-v3',
            correctedEffectiveFrom: '2026-09-05',
            correctedEffectiveUntil: '2026-09-25',
            validatorVersion: 'v1',
            correctsVersionId: 'published-cor-2',
            reason: 'Adjust effective dates and parameters',
            commandId: 'cmd-cor-interval',
            payloadFingerprint: expect.any(String),
          }),
        }),
        expect.anything(),
      );
    });
  });
});
