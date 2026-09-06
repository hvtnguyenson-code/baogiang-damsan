import { BadRequestException } from '@nestjs/common';
import { BusinessConfigurationService } from './business-configuration.service';
import { BusinessPolicyFamilyDefinition } from './business-policy-registry';

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

  const mockPrisma = {
    businessPolicyStream: { findFirst: jest.fn() },
    businessPolicyVersion: { findMany: jest.fn(), findUnique: jest.fn() },
  } as any;

  const mockAudit = { write: jest.fn() } as any;

  let service: BusinessConfigurationService;

  beforeEach(() => {
    jest.clearAllMocks();
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
});
