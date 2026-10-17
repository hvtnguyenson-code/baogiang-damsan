import { ConflictException } from '@nestjs/common';
import {
  evaluateCoordinateEffectivity,
} from '../../src/capabilities/effectivity-evaluator';
import {
  getTemplateDefinition,
  listTemplateDefinitions,
  materializeTemplateGrants,
} from '../../src/capabilities/responsibility-template-catalog';
import { AccessBaselineService } from '../../src/capabilities/access-baseline.service';

describe('P5-051 Access Baseline & Responsibility Template Unit Tests', () => {
  const now = new Date('2026-10-15T10:00:00.000Z');

  describe('Effectivity Evaluator (5 distinct states + historical handling)', () => {
    it('1. returns MISSING when no non-revoked grants exist', () => {
      const result = evaluateCoordinateEffectivity(now, null, []);
      expect(result.status).toBe('MISSING');
      expect(result.conflictingGrant).toBeUndefined();
    });

    it('2. returns ALREADY_COVERED when an active open-ended grant covers [now, infinity)', () => {
      const grant = {
        id: 'grant-1',
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        scopeResourceId: null,
        validFrom: new Date('2026-09-01T00:00:00.000Z'),
        validUntil: null,
        revokedAt: null,
      };
      const result = evaluateCoordinateEffectivity(now, null, [grant]);
      expect(result.status).toBe('ALREADY_COVERED');
      expect(result.existingGrantId).toBe('grant-1');
    });

    it('3. returns FUTURE_CONFLICT when a grant starts in the future [now + 10d, infinity)', () => {
      const grant = {
        id: 'grant-future',
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        scopeResourceId: null,
        validFrom: new Date('2026-10-25T00:00:00.000Z'),
        validUntil: null,
        revokedAt: null,
      };
      const result = evaluateCoordinateEffectivity(now, null, [grant]);
      expect(result.status).toBe('FUTURE_CONFLICT');
      expect(result.conflictingGrant?.id).toBe('grant-future');
    });

    it('4. returns FINITE_COVERAGE when a grant is active now but ends at a finite date', () => {
      const grant = {
        id: 'grant-finite',
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        scopeResourceId: null,
        validFrom: new Date('2026-09-01T00:00:00.000Z'),
        validUntil: new Date('2026-12-31T23:59:59.000Z'),
        revokedAt: null,
      };
      const result = evaluateCoordinateEffectivity(now, null, [grant]);
      expect(result.status).toBe('FINITE_COVERAGE');
      expect(result.conflictingGrant?.id).toBe('grant-finite');
    });

    it('5. returns OVERLAP_CONFLICT when finite intervals partially overlap', () => {
      const grant = {
        id: 'grant-overlap',
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        scopeResourceId: null,
        validFrom: new Date('2026-10-01T00:00:00.000Z'),
        validUntil: new Date('2026-10-20T00:00:00.000Z'),
        revokedAt: null,
      };
      // Proposed interval [2026-10-15, 2026-10-25)
      const proposedStart = new Date('2026-10-15T00:00:00.000Z');
      const proposedEnd = new Date('2026-10-25T00:00:00.000Z');
      const result = evaluateCoordinateEffectivity(proposedStart, proposedEnd, [grant]);
      expect(result.status).toBe('OVERLAP_CONFLICT');
      expect(result.conflictingGrant?.id).toBe('grant-overlap');
    });

    it('6. ignores revoked grants (historical grant with revokedAt set returns MISSING)', () => {
      const revokedGrant = {
        id: 'grant-revoked',
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        scopeResourceId: null,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validUntil: null,
        revokedAt: new Date('2026-06-01T00:00:00.000Z'),
      };
      const result = evaluateCoordinateEffectivity(now, null, [revokedGrant]);
      expect(result.status).toBe('MISSING');
      expect(result.conflictingGrant).toBeUndefined();
    });

    it('7. ignores expired past grants (validUntil < now returns MISSING)', () => {
      const expiredGrant = {
        id: 'grant-expired',
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        scopeResourceId: null,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validUntil: new Date('2026-05-01T00:00:00.000Z'),
        revokedAt: null,
      };
      const result = evaluateCoordinateEffectivity(now, null, [expiredGrant]);
      expect(result.status).toBe('MISSING');
      expect(result.conflictingGrant).toBeUndefined();
    });
  });

  describe('Responsibility Template Catalog Definitions & Invariants', () => {
    it('8. contains all 7 required templates with version v1', () => {
      const templates = listTemplateDefinitions();
      expect(templates.map((t) => t.key)).toEqual([
        'TEACHER',
        'SUBJECT_LEADER',
        'VICE_PRINCIPAL_ACADEMIC',
        'PRINCIPAL',
        'GDDP_COORDINATOR',
        'HDTN_COORDINATOR',
        'TECHNICAL_ACCOUNT_ADMIN',
      ]);
      for (const t of templates) {
        expect(t.version).toBe('v1');
      }
    });

    it('9. Teacher template includes TEACHER_BASE as source authority + 3 product operability grants', () => {
      const def = getTemplateDefinition('TEACHER');
      expect(def.requiresTeachingStaff).toBe(true);
      expect(def.requiredResourceKind).toBe('NONE');
      expect(def.sourceAuthorityGrants).toHaveLength(1);
      expect(def.sourceAuthorityGrants[0]).toMatchObject({
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        scopeResourceId: null,
      });
      expect(def.productOperabilityGrants).toHaveLength(3);
      const keys = def.productOperabilityGrants.map((g) => g.capabilityKey);
      expect(keys).toContain('REPORTING_STATEMENT_SUBMIT');
      expect(keys).toContain('REPORTING_STATEMENT_READ');
      expect(keys).toContain('TEACHING_EXECUTION_RECORD');
      for (const g of def.productOperabilityGrants) {
        expect(g.scopeType).toBe('PERSONAL');
      }

      const materialized = materializeTemplateGrants({ templateKey: 'TEACHER' });
      expect(materialized).toHaveLength(4);
    });

    it('10. PHT (VICE_PRINCIPAL_ACADEMIC) template materializes exact 19 total grants', () => {
      const def = getTemplateDefinition('VICE_PRINCIPAL_ACADEMIC');
      expect(def.requiresTeachingStaff).toBe(true);
      const materialized = materializeTemplateGrants({ templateKey: 'VICE_PRINCIPAL_ACADEMIC' });
      // 4 teacher grants + 15 PHT grants
      expect(materialized).toHaveLength(19);

      const phtKeys = materialized.map((g) => g.capabilityKey);

      // Must include APPROVAL_VICE_PRINCIPAL & REPORTING_STATEMENT_READ / SCHOOL_WIDE
      expect(phtKeys).toContain('APPROVAL_VICE_PRINCIPAL');
      expect(phtKeys).toContain('REPORTING_STATEMENT_READ');

      // Check key academic-operability grants
      const expectedPhtKeys = [
        'APPROVAL_VICE_PRINCIPAL',
        'REPORTING_STATEMENT_READ',
        'REPORTING_READ',
        'TIMETABLE_MANAGE',
        'PPCT_MANAGE',
        'ACADEMIC_STRUCTURE_MANAGE',
        'CALENDAR_EXCEPTION_MANAGE',
        'TEACHING_OPERATION_MANAGE',
        'TEACHING_EXECUTION_MANAGE',
        'HOMEROOM_ASSIGNMENT_MANAGE',
        'SPECIAL_ACTIVITY_MANAGE',
        'BUSINESS_CONFIGURATION_MANAGE',
        'SUBJECT_GROUP_MANAGE',
        'SUBJECT_MANAGE',
        'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE',
      ];
      for (const k of expectedPhtKeys) {
        expect(phtKeys).toContain(k);
      }
    });

    it('11. PHT explicitly forbids technical admin powers and Principal approval', () => {
      const def = getTemplateDefinition('VICE_PRINCIPAL_ACADEMIC');
      expect(def.forbiddenDefaults).toContain('SYSTEM_ADMIN');
      expect(def.forbiddenDefaults).toContain('USER_MANAGE');
      expect(def.forbiddenDefaults).toContain('CAPABILITY_GRANT');
      expect(def.forbiddenDefaults).toContain('APPROVAL_PRINCIPAL');

      const materialized = materializeTemplateGrants({ templateKey: 'VICE_PRINCIPAL_ACADEMIC' });
      const keys = materialized.map((g) => g.capabilityKey);
      expect(keys).not.toContain('SYSTEM_ADMIN');
      expect(keys).not.toContain('USER_MANAGE');
      expect(keys).not.toContain('CAPABILITY_GRANT');
      expect(keys).not.toContain('APPROVAL_PRINCIPAL');
    });

    it('12. Principal template includes APPROVAL_PRINCIPAL and AUDIT_VIEW (PRODUCT_OPERABILITY), forbids admin powers', () => {
      const def = getTemplateDefinition('PRINCIPAL');
      expect(def.requiresTeachingStaff).toBe(true);
      expect(def.forbiddenDefaults).toContain('SYSTEM_ADMIN');
      expect(def.forbiddenDefaults).toContain('USER_MANAGE');
      expect(def.forbiddenDefaults).toContain('CAPABILITY_GRANT');
      expect(def.forbiddenDefaults).toContain('APPROVAL_VICE_PRINCIPAL');

      // AUDIT_VIEW must be categorized as PRODUCT_OPERABILITY, not SOURCE_AUTHORITY
      const auditGrantDef = def.productOperabilityGrants.find((g) => g.capabilityKey === 'AUDIT_VIEW');
      expect(auditGrantDef).toBeDefined();
      expect(auditGrantDef?.category).toBe('PRODUCT_OPERABILITY');
      expect(def.sourceAuthorityGrants.some((g) => g.capabilityKey === 'AUDIT_VIEW')).toBe(false);

      const materialized = materializeTemplateGrants({ templateKey: 'PRINCIPAL' });
      const keys = materialized.map((g) => g.capabilityKey);
      expect(keys).toContain('APPROVAL_PRINCIPAL');
      expect(keys).toContain('AUDIT_VIEW');
      expect(keys).toContain('REPORTING_STATEMENT_READ');
      expect(keys).not.toContain('SYSTEM_ADMIN');
      expect(keys).not.toContain('USER_MANAGE');
      expect(keys).not.toContain('CAPABILITY_GRANT');
      expect(keys).not.toContain('APPROVAL_VICE_PRINCIPAL');

      const auditGrant = materialized.find((g) => g.capabilityKey === 'AUDIT_VIEW');
      expect(auditGrant?.category).toBe('PRODUCT_OPERABILITY');
    });

    it('13. Technical Account Admin template includes technical grants, forbids SYSTEM_ADMIN and approval powers', () => {
      const def = getTemplateDefinition('TECHNICAL_ACCOUNT_ADMIN');
      expect(def.requiresTeachingStaff).toBe(false);
      expect(def.forbiddenDefaults).toContain('SYSTEM_ADMIN');
      expect(def.forbiddenDefaults).toContain('APPROVAL_PRINCIPAL');
      expect(def.forbiddenDefaults).toContain('APPROVAL_VICE_PRINCIPAL');

      const materialized = materializeTemplateGrants({ templateKey: 'TECHNICAL_ACCOUNT_ADMIN' });
      const keys = materialized.map((g) => g.capabilityKey);
      expect(keys).toContain('USER_MANAGE');
      expect(keys).toContain('CAPABILITY_GRANT');
      expect(keys).toContain('AUDIT_VIEW');
      expect(keys).toContain('ADDITIONAL_DUTY_CATALOG_MANAGE');
      expect(keys).not.toContain('SYSTEM_ADMIN');
      expect(keys).not.toContain('TEACHER_BASE');
    });

    it('14. Subject Leader template materializes SUBJECT_GROUP and resolved SUBJECT grants', () => {
      const def = getTemplateDefinition('SUBJECT_LEADER');
      expect(def.requiresTeachingStaff).toBe(true);
      expect(def.requiredResourceKind).toBe('SUBJECT_GROUP');

      const subjectGroupId = 'group-uuid-1';
      const resolvedSubjectIds = ['subj-math-1', 'subj-math-2'];
      const materialized = materializeTemplateGrants({
        templateKey: 'SUBJECT_LEADER',
        subjectGroupId,
        resolvedSubjectIds,
      });

      // 4 teacher grants + 2 subject group grants + 5 subject grants * 2 subjects = 16 grants
      expect(materialized).toHaveLength(16);

      const groupGrants = materialized.filter(
        (g) => g.scopeType === 'SUBJECT_GROUP'
      );
      expect(groupGrants).toHaveLength(2);
      expect(groupGrants.map((g) => g.capabilityKey)).toEqual([
        'SUBJECT_GROUP_LEAD',
        'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE',
      ]);
      for (const g of groupGrants) {
        expect(g.scopeResourceId).toBe(subjectGroupId);
      }

      const subjGrants = materialized.filter(
        (g) => g.scopeType === 'SUBJECT'
      );
      // 5 keys * 2 subjects = 10 grants
      expect(subjGrants).toHaveLength(10);
      const math1Grants = subjGrants.filter(
        (g) => g.scopeResourceId === 'subj-math-1'
      );
      expect(math1Grants).toHaveLength(5);
      const math2Grants = subjGrants.filter(
        (g) => g.scopeResourceId === 'subj-math-2'
      );
      expect(math2Grants).toHaveLength(5);

      // Verify exact wording for subject-scoped grants
      expect(math1Grants[0].description).toBe(
        'Quản trị PPCT môn chuyên môn được giao cho tổ trưởng.'
      );

      // When no subjectIds provided -> zero SUBJECT grants
      const noSubjectGrants = materializeTemplateGrants({
        templateKey: 'SUBJECT_LEADER',
        subjectGroupId,
      });
      expect(noSubjectGrants.filter((g) => g.scopeType === 'SUBJECT')).toHaveLength(0);
      expect(noSubjectGrants.filter((g) => g.scopeType === 'SUBJECT_GROUP')).toHaveLength(2);

      // Duplicate subjectIds are deterministically deduplicated
      const dedupeGrants = materializeTemplateGrants({
        templateKey: 'SUBJECT_LEADER',
        subjectGroupId,
        resolvedSubjectIds: ['subj-math-1', 'subj-math-1'],
      });
      expect(dedupeGrants.filter((g) => g.scopeType === 'SUBJECT')).toHaveLength(5);
    });

    it('15. Coordinator templates require ProgrammeMaster resource and correct kind', () => {
      const gddpDef = getTemplateDefinition('GDDP_COORDINATOR');
      expect(gddpDef.requiresTeachingStaff).toBe(true);
      expect(gddpDef.requiredResourceKind).toBe('ACTIVITY');

      const hdtnDef = getTemplateDefinition('HDTN_COORDINATOR');
      expect(hdtnDef.requiresTeachingStaff).toBe(true);
      expect(hdtnDef.requiredResourceKind).toBe('ACTIVITY');

      const masterId = 'master-uuid-1';
      const gddpMaterialized = materializeTemplateGrants({
        templateKey: 'GDDP_COORDINATOR',
        programmeMasterId: masterId,
      });
      const gddpGrants = gddpMaterialized.filter(
        (g) => g.capabilityKey === 'GDDP_COORDINATOR'
      );
      expect(gddpGrants).toHaveLength(1);
      expect(gddpGrants[0]).toMatchObject({
        scopeType: 'ACTIVITY',
        scopeResourceId: masterId,
      });

      const hdtnMaterialized = materializeTemplateGrants({
        templateKey: 'HDTN_COORDINATOR',
        programmeMasterId: masterId,
      });
      const hdtnGrants = hdtnMaterialized.filter(
        (g) => g.capabilityKey === 'HĐTN_COORDINATOR'
      );
      expect(hdtnGrants).toHaveLength(1);
      expect(hdtnGrants[0]).toMatchObject({
        scopeType: 'ACTIVITY',
        scopeResourceId: masterId,
      });
    });
  });

  describe('AccessBaselineService Invariants & Guards (Mocked Unit)', () => {
    it('16. template apply on non-teaching staff fails closed with ConflictException', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-1',
            status: 'ACTIVE',
            profile: { isTeachingStaff: false },
          }),
        },
        $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(mockPrisma)),
      };
      const service = new AccessBaselineService(
        mockPrisma as never,
        {} as never
      );

      await expect(
        service.applyTemplate(
          'user-1',
          { templateKey: 'TEACHER' },
          'admin',
          { requestId: 'trace-1' }
        )
      ).rejects.toThrow(ConflictException);

      await expect(
        service.applyTemplate(
          'user-1',
          { templateKey: 'VICE_PRINCIPAL_ACADEMIC' },
          'admin',
          { requestId: 'trace-2' }
        )
      ).rejects.toThrow(
        'Tài khoản không phải nhân sự giảng dạy (isTeachingStaff=false); không thể áp dụng responsibility template chuyên môn.'
      );
    });

    it('17. coordinator template without required programmeMasterId fails closed on apply', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-1',
            status: 'ACTIVE',
            profile: { isTeachingStaff: true },
          }),
        },
        $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(mockPrisma)),
      };
      const service = new AccessBaselineService(
        mockPrisma as never,
        {} as never
      );

      await expect(
        service.applyTemplate(
          'user-1',
          { templateKey: 'GDDP_COORDINATOR' },
          'admin',
          { requestId: 'trace-3' }
        )
      ).rejects.toThrow(
        'Template GDDP_COORDINATOR yêu cầu resource ACTIVITY nhưng chưa được cung cấp.'
      );
    });

    it('18. subject leader template without subjectGroupId fails closed on apply', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-1',
            status: 'ACTIVE',
            profile: { isTeachingStaff: true },
          }),
        },
        $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb(mockPrisma)),
      };
      const service = new AccessBaselineService(
        mockPrisma as never,
        {} as never
      );

      await expect(
        service.applyTemplate(
          'user-1',
          { templateKey: 'SUBJECT_LEADER' },
          'admin',
          { requestId: 'trace-4' }
        )
      ).rejects.toThrow(
        'Template SUBJECT_LEADER yêu cầu resource SUBJECT_GROUP nhưng chưa được cung cấp.'
      );
    });

    it('19. validateCapabilityGrantSpecs throws NotFoundException when definition does not exist', async () => {
      const mockPrisma = {
        capabilityDefinition: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const service = new AccessBaselineService(mockPrisma as never, {} as never);

      await expect(
        service.validateCapabilityGrantSpecs(
          [{ capabilityKey: 'NON_EXISTENT_CAP', scopeType: 'PERSONAL' }],
          mockPrisma as never
        )
      ).rejects.toThrow('Không tìm thấy định nghĩa quyền: NON_EXISTENT_CAP.');
    });

    it('20. validateCapabilityGrantSpecs throws ConflictException when definition is inactive', async () => {
      const mockPrisma = {
        capabilityDefinition: {
          findMany: jest.fn().mockResolvedValue([
            { key: 'TEACHER_BASE', isActive: false, allowedScopeTypes: ['PERSONAL'] },
          ]),
        },
      };
      const service = new AccessBaselineService(mockPrisma as never, {} as never);

      await expect(
        service.validateCapabilityGrantSpecs(
          [{ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }],
          mockPrisma as never
        )
      ).rejects.toThrow('Quyền TEACHER_BASE đang bị vô hiệu hóa hoặc không khả dụng.');
    });

    it('21. validateCapabilityGrantSpecs throws ConflictException when scopeType is not allowed', async () => {
      const mockPrisma = {
        capabilityDefinition: {
          findMany: jest.fn().mockResolvedValue([
            { key: 'TEACHER_BASE', isActive: true, allowedScopeTypes: ['PERSONAL'] },
          ]),
        },
      };
      const service = new AccessBaselineService(mockPrisma as never, {} as never);

      await expect(
        service.validateCapabilityGrantSpecs(
          [{ capabilityKey: 'TEACHER_BASE', scopeType: 'SCHOOL_WIDE' }],
          mockPrisma as never
        )
      ).rejects.toThrow('Phạm vi SCHOOL_WIDE không được phép cho quyền TEACHER_BASE.');
    });

    it('22. validateCapabilityGrantSpecs passes when all specs are valid and active', async () => {
      const mockPrisma = {
        capabilityDefinition: {
          findMany: jest.fn().mockResolvedValue([
            { key: 'TEACHER_BASE', isActive: true, allowedScopeTypes: ['PERSONAL'] },
          ]),
        },
      };
      const service = new AccessBaselineService(mockPrisma as never, {} as never);

      await expect(
        service.validateCapabilityGrantSpecs(
          [{ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }],
          mockPrisma as never
        )
      ).resolves.toBeUndefined();
    });
  });
});
