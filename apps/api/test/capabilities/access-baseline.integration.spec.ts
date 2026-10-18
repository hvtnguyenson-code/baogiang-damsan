import request from 'supertest';
import { CatalogStatus, UserStatus } from '@prisma/client';
import { AccessBaselineService } from '../../src/capabilities/access-baseline.service';
import { CapabilityAuthorizationService } from '../../src/authorization/capability-authorization.service';
import { Phase01Harness, integration, normalizedCode, testOrigin } from '../helpers/phase01-test-harness';

integration('P5-051 Professional Baseline & Responsibility Templates (Isolated PostgreSQL Integration)', () => {
  const h = new Phase01Harness();
  let baselineService: AccessBaselineService;
  let defaultAdminId: string;

  const ALL_CAPABILITIES = [
    { key: 'CAPABILITY_GRANT', scopes: ['SCHOOL_WIDE'] },
    { key: 'USER_MANAGE', scopes: ['SCHOOL_WIDE'] },
    { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    { key: 'TEACHER_BASE', scopes: ['PERSONAL'] },
    { key: 'REPORTING_STATEMENT_SUBMIT', scopes: ['PERSONAL'] },
    { key: 'REPORTING_STATEMENT_READ', scopes: ['PERSONAL', 'SCHOOL_WIDE', 'SUBJECT'] },
    { key: 'TEACHING_EXECUTION_RECORD', scopes: ['PERSONAL'] },
    { key: 'SUBJECT_GROUP_LEAD', scopes: ['SUBJECT_GROUP'] },
    { key: 'PPCT_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
    { key: 'TEACHING_OPERATION_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
    { key: 'TEACHING_EXECUTION_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
    { key: 'REPORTING_READ', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
    { key: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', scopes: ['SUBJECT_GROUP', 'SCHOOL_WIDE'] },
    { key: 'APPROVAL_VICE_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
    { key: 'APPROVAL_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
    { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
    { key: 'ACADEMIC_STRUCTURE_MANAGE', scopes: ['SCHOOL_WIDE'] },
    { key: 'CALENDAR_EXCEPTION_MANAGE', scopes: ['SCHOOL_WIDE'] },
    { key: 'HOMEROOM_ASSIGNMENT_MANAGE', scopes: ['SCHOOL_WIDE'] },
    { key: 'SPECIAL_ACTIVITY_MANAGE', scopes: ['SCHOOL_WIDE'] },
    { key: 'BUSINESS_CONFIGURATION_MANAGE', scopes: ['SCHOOL_WIDE'] },
    { key: 'SUBJECT_GROUP_MANAGE', scopes: ['SCHOOL_WIDE'] },
    { key: 'SUBJECT_MANAGE', scopes: ['SCHOOL_WIDE'] },
    { key: 'AUDIT_VIEW', scopes: ['SCHOOL_WIDE'] },
    { key: 'GDDP_COORDINATOR', scopes: ['ACTIVITY'] },
    { key: 'HĐTN_COORDINATOR', scopes: ['ACTIVITY'] },
    { key: 'ADDITIONAL_DUTY_CATALOG_MANAGE', scopes: ['SCHOOL_WIDE'] },
  ];

  beforeAll(async () => {
    await h.start();
    baselineService = h.app.get(AccessBaselineService);
  });

  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities(ALL_CAPABILITIES);
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }, { capabilityKey: 'USER_MANAGE' }] });
    defaultAdminId = admin.id;
  });

  afterAll(async () => {
    try {
      await h.clean();
    } finally {
      await h.stop();
    }
  });

  async function createTestUser(options: {
    status?: UserStatus;
    isTeachingStaff?: boolean;
    usernamePrefix?: string;
    positionTitle?: string;
  } = {}): Promise<string> {
    const user = await h.prisma.user.create({
      data: {
        username: `${options.usernamePrefix ?? 'u'}-${crypto.randomUUID().slice(0, 8)}`,
        passwordHash: 'hash-test',
        status: options.status ?? UserStatus.ACTIVE,
        mustChangePassword: false,
        profile: {
          create: {
            displayName: 'Test User',
            positionTitle: options.positionTitle,
            isTeachingStaff: options.isTeachingStaff ?? true,
          },
        },
      },
    });
    return user.id;
  }

  it.each(['inactive', 'invalid-scope', 'valid'] as const)('existing baseline grant still validates its definition (%s)', async (kind) => {
    const userId = await createTestUser();
    await h.prisma.capabilityGrant.create({ data: {
      userId, capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL',
      validFrom: new Date(Date.now() - 10000), grantedByUserId: defaultAdminId,
    } });
    const admin = await h.actor({ grants: [{ capabilityKey: 'USER_MANAGE' }] });
    await h.prisma.capabilityDefinition.update({ where: { key: 'TEACHER_BASE' }, data: {
      isActive: kind !== 'inactive', allowedScopeTypes: kind === 'invalid-scope' ? ['SCHOOL_WIDE'] : ['PERSONAL'],
    } });
    const result = await admin.agent.post(`/api/users/${userId}/activate`).set('Origin', testOrigin).send({});
    expect(result.status).toBe(kind === 'valid' ? 200 : 409);
    if (kind === 'valid') expect((await baselineService.ensureProfessionalBaseline(userId, defaultAdminId, {})).status).toBe('ALREADY_COMPLIANT');
    else await expect(baselineService.ensureProfessionalBaseline(userId, defaultAdminId, {})).rejects.toThrow();
    expect(await h.prisma.capabilityGrant.count({ where: { userId } })).toBe(1);
    expect(await h.prisma.auditEvent.count({ where: { action: 'PROFESSIONAL_BASELINE_GRANTED', metadata: { path: ['targetUserId'], equals: userId } } })).toBe(0);
  });

  // =========================================================================
  // 1 & 2. Activation Baseline Enforcement
  // =========================================================================
  it('1. activate teaching staff (PENDING -> ACTIVE) ensures TEACHER_BASE', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.PENDING, isTeachingStaff: true });

    const res = await admin.agent
      .post(`/api/users/${userId}/activate`)
      .set('Origin', testOrigin)
      .send({});
    expect(res.status).toBe(200);

    const grants = await h.prisma.capabilityGrant.findMany({
      where: { userId, revokedAt: null },
    });
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      capabilityKey: 'TEACHER_BASE',
      scopeType: 'PERSONAL',
      scopeResourceId: null,
      validUntil: null,
    });
  });

  it('2. activate technical user (isTeachingStaff = false) does NOT grant baseline', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.PENDING, isTeachingStaff: false });

    const res = await admin.agent
      .post(`/api/users/${userId}/activate`)
      .set('Origin', testOrigin)
      .send({});
    expect(res.status).toBe(200);

    const grants = await h.prisma.capabilityGrant.findMany({
      where: { userId, revokedAt: null },
    });
    expect(grants).toHaveLength(0);
  });

  // =========================================================================
  // 3 & 4. Profile Update Invariant
  // =========================================================================
  it('3. ACTIVE user update isTeachingStaff: false -> true ensures TEACHER_BASE', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: false });

    const res = await admin.agent
      .patch(`/api/users/${userId}`)
      .set('Origin', testOrigin)
      .send({ profile: { isTeachingStaff: true } });
    expect(res.status).toBe(200);

    const grants = await h.prisma.capabilityGrant.findMany({
      where: { userId, capabilityKey: 'TEACHER_BASE', revokedAt: null },
    });
    expect(grants).toHaveLength(1);
    expect(grants[0].scopeType).toBe('PERSONAL');
  });

  it('4. ACTIVE user update isTeachingStaff: true -> false does NOT implicitly revoke TEACHER_BASE', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    // Seed TEACHER_BASE
    await h.prisma.capabilityGrant.create({
      data: {
        userId,
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        validFrom: new Date(),
      },
    });

    const res = await admin.agent
      .patch(`/api/users/${userId}`)
      .set('Origin', testOrigin)
      .send({ profile: { isTeachingStaff: false } });
    expect(res.status).toBe(200);

    const grants = await h.prisma.capabilityGrant.findMany({
      where: { userId, capabilityKey: 'TEACHER_BASE', revokedAt: null },
    });
    expect(grants).toHaveLength(1);
    expect(grants[0].revokedAt).toBeNull();
  });

  // =========================================================================
  // 5 & 6. Idempotency & PostgreSQL Concurrency Row Locking
  // =========================================================================
  it('5. repeated ensure baseline is completely idempotent', async () => {
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const res1 = await baselineService.ensureProfessionalBaseline(userId, defaultAdminId, { requestId: 'req-1' });
    expect(res1.status).toBe('SUCCESS');

    const res2 = await baselineService.ensureProfessionalBaseline(userId, defaultAdminId, { requestId: 'req-2' });
    expect(res2.status).toBe('ALREADY_COMPLIANT');

    const count = await h.prisma.capabilityGrant.count({
      where: { userId, capabilityKey: 'TEACHER_BASE', revokedAt: null },
    });
    expect(count).toBe(1);
  });

  it('6. two concurrent baseline calls serialize via row lock without duplicate or false conflict', async () => {
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const [r1, r2] = await Promise.all([
      baselineService.ensureProfessionalBaseline(userId, defaultAdminId, { requestId: 'c-1' }),
      baselineService.ensureProfessionalBaseline(userId, defaultAdminId, { requestId: 'c-2' }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual(['ALREADY_COMPLIANT', 'SUCCESS']);

    const count = await h.prisma.capabilityGrant.count({
      where: { userId, capabilityKey: 'TEACHER_BASE', revokedAt: null },
    });
    expect(count).toBe(1);
  });

  // =========================================================================
  // 7, 8, 9, 10. Effectivity Engine Integration with Real PostgreSQL
  // =========================================================================
  it('7. future grant conflict returns FUTURE_CONFLICT and prevents blind insert', async () => {
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });
    const futureDate = new Date(Date.now() + 86400000 * 30); // 30 days in future

    await h.prisma.capabilityGrant.create({
      data: {
        userId,
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        validFrom: futureDate,
        validUntil: null,
      },
    });

    await expect(
      baselineService.ensureProfessionalBaseline(userId, defaultAdminId, { requestId: 'req-future' })
    ).rejects.toThrow('Xung đột hiệu lực TEACHER_BASE');

    // Exactly 1 grant remains (the future one), no duplicate was inserted
    const grants = await h.prisma.capabilityGrant.findMany({ where: { userId } });
    expect(grants).toHaveLength(1);
    expect(grants[0].validFrom.getTime()).toBe(futureDate.getTime());
  });

  it('8. finite current grant returns FINITE_COVERAGE', async () => {
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });
    const pastDate = new Date(Date.now() - 86400000 * 5);
    const futureEndDate = new Date(Date.now() + 86400000 * 10);

    await h.prisma.capabilityGrant.create({
      data: {
        userId,
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        validFrom: pastDate,
        validUntil: futureEndDate,
      },
    });

    await expect(
      baselineService.ensureProfessionalBaseline(userId, defaultAdminId, { requestId: 'req-finite' })
    ).rejects.toThrow('Xung đột hiệu lực TEACHER_BASE');

    const grants = await h.prisma.capabilityGrant.findMany({ where: { userId } });
    expect(grants).toHaveLength(1);
  });

  it('9. open-ended current coverage returns ALREADY_COVERED', async () => {
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });
    const pastDate = new Date(Date.now() - 86400000 * 5);

    await h.prisma.capabilityGrant.create({
      data: {
        userId,
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        validFrom: pastDate,
        validUntil: null,
      },
    });

    const res = await baselineService.ensureProfessionalBaseline(userId, defaultAdminId, { requestId: 'req-covered' });
    expect(res.status).toBe('ALREADY_COMPLIANT');
  });

  it('10. revoked historical grant does NOT block new open-ended baseline grant', async () => {
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    await h.prisma.capabilityGrant.create({
      data: {
        userId,
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        validFrom: new Date('2025-01-01T00:00:00Z'),
        validUntil: null,
        revokedAt: new Date('2025-06-01T00:00:00Z'),
      },
    });

    const res = await baselineService.ensureProfessionalBaseline(userId, defaultAdminId, { requestId: 'req-revoked' });
    expect(res.status).toBe('SUCCESS');

    const grants = await h.prisma.capabilityGrant.findMany({
      where: { userId, revokedAt: null },
    });
    expect(grants).toHaveLength(1);
    expect(grants[0].validUntil).toBeNull();
  });

  // =========================================================================
  // 11, 12, 13, 14. Template Preview & Apply: PHT & Principal Invariants
  // =========================================================================
  it('11a. PHT template preview: asserts exact grants, forbidden defaults, and zero DB mutation', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const countBefore = await h.prisma.capabilityGrant.count();

    const previewRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/preview`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'VICE_PRINCIPAL_ACADEMIC' });

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.eligibility.isEligible).toBe(true);
    expect(previewRes.body.templateKey).toBe('VICE_PRINCIPAL_ACADEMIC');
    expect(previewRes.body.version).toBe('v1');

    const grantsToAdd = previewRes.body.grantsToAdd as Array<{ capabilityKey: string; scopeType: string }>;
    expect(grantsToAdd).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capabilityKey: 'APPROVAL_VICE_PRINCIPAL', scopeType: 'SCHOOL_WIDE' }),
        expect.objectContaining({ capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SCHOOL_WIDE' }),
        expect.objectContaining({ capabilityKey: 'TIMETABLE_MANAGE', scopeType: 'SCHOOL_WIDE' }),
      ]),
    );

    expect(previewRes.body.forbiddenDefaults).toEqual(
      expect.arrayContaining([
        'SYSTEM_ADMIN',
        'USER_MANAGE',
        'CAPABILITY_GRANT',
        'APPROVAL_PRINCIPAL',
      ]),
    );

    const countAfter = await h.prisma.capabilityGrant.count();
    expect(countAfter).toBe(countBefore);
  });

  it('11 & 12. PHT template apply materializes exact grants, includes APPROVAL_VICE_PRINCIPAL', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const applyRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'VICE_PRINCIPAL_ACADEMIC' });
    expect(applyRes.status).toBe(200);
    expect(applyRes.body.templateKey).toBe('VICE_PRINCIPAL_ACADEMIC');
    expect(applyRes.body.grantsAdded).toHaveLength(19);

    const grants = await h.prisma.capabilityGrant.findMany({
      where: { userId, revokedAt: null },
    });
    const keys = grants.map((g) => g.capabilityKey);

    // Verify critical inclusions
    expect(keys).toContain('APPROVAL_VICE_PRINCIPAL');
    expect(keys).toContain('REPORTING_STATEMENT_READ');
    expect(keys).toContain('TEACHER_BASE');
    expect(keys).toContain('TIMETABLE_MANAGE');
    expect(keys).toContain('PPCT_MANAGE');

    // Verify critical exclusions
    expect(keys).not.toContain('SYSTEM_ADMIN');
    expect(keys).not.toContain('USER_MANAGE');
    expect(keys).not.toContain('CAPABILITY_GRANT');
    expect(keys).not.toContain('APPROVAL_PRINCIPAL');
  });

  it('13 & 14. Principal template apply excludes SYSTEM_ADMIN, USER_MANAGE, CAPABILITY_GRANT', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const applyRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'PRINCIPAL' });
    expect(applyRes.status).toBe(200);

    const grants = await h.prisma.capabilityGrant.findMany({
      where: { userId, revokedAt: null },
    });
    const keys = grants.map((g) => g.capabilityKey);

    expect(keys).toContain('APPROVAL_PRINCIPAL');
    expect(keys).toContain('AUDIT_VIEW');
    expect(keys).not.toContain('SYSTEM_ADMIN');
    expect(keys).not.toContain('USER_MANAGE');
    expect(keys).not.toContain('CAPABILITY_GRANT');
    expect(keys).not.toContain('APPROVAL_VICE_PRINCIPAL');
  });

  // =========================================================================
  // 15, 16, 17, 18. Template Eligibility & Resource Resolving
  // =========================================================================
  it('15. template apply on isTeachingStaff = false fails closed with 409', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: false });

    const res = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'TEACHER' });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('isTeachingStaff=false');
  });

  it('16 & 17. Coordinator template requires resource and rejects invalid programme kind', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const year = await h.prisma.academicYear.create({
      data: { code: 'YEAR-2026', name: 'Năm học 2026' },
    });
    const gddpMaster = await h.prisma.programmeMaster.create({
      data: { academicYearId: year.id, kind: 'GDDP', gradeLevel: 10, createdByUserId: admin.id },
    });
    const hdtnMaster = await h.prisma.programmeMaster.create({
      data: { academicYearId: year.id, kind: 'HDTN_HN', gradeLevel: null, createdByUserId: admin.id },
    });

    // 17: Apply GDDP_COORDINATOR with HDTN master -> denied (409)
    const invalidRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'GDDP_COORDINATOR', programmeMasterId: hdtnMaster.id });
    expect(invalidRes.status).toBe(409);
    expect(invalidRes.body.message).toContain('Giáo dục địa phương (GDĐP)');

    // 16: Apply GDDP_COORDINATOR with correct GDDP master -> succeeds
    const validRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'GDDP_COORDINATOR', programmeMasterId: gddpMaster.id });
    expect(validRes.status).toBe(200);

    const grants = await h.prisma.capabilityGrant.findMany({
      where: { userId, capabilityKey: 'GDDP_COORDINATOR' },
    });
    expect(grants).toHaveLength(1);
    expect(grants[0].scopeType).toBe('ACTIVITY');
    expect(grants[0].scopeResourceId).toBe(gddpMaster.id);
  });

  it('18. Subject Leader template requires subjectGroupId and materializes SubjectGroup + explicitly selected Subject grants', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const group = await h.prisma.subjectGroup.create({
      data: { code: 'TOAN-TIN', name: 'Tổ Toán - Tin', status: CatalogStatus.ACTIVE },
    });
    const subject1 = await h.prisma.subject.create({
      data: { code: 'TOAN', name: 'Toán', status: CatalogStatus.ACTIVE },
    });
    const subject2 = await h.prisma.subject.create({
      data: { code: 'TIN', name: 'Tin học', status: CatalogStatus.ACTIVE },
    });

    // 18A: selected valid subjectIds -> exact Subject grants + SubjectGroup grants
    const res = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'SUBJECT_LEADER', subjectGroupId: group.id, subjectIds: [subject1.id, subject2.id] });
    expect(res.status).toBe(200);

    const grants = await h.prisma.capabilityGrant.findMany({
      where: { userId, revokedAt: null },
    });

    const groupGrants = grants.filter((g) => g.scopeType === 'SUBJECT_GROUP');
    expect(groupGrants.map((g) => g.capabilityKey)).toEqual(
      expect.arrayContaining(['SUBJECT_GROUP_LEAD', 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE'])
    );
    for (const g of groupGrants) {
      expect(g.scopeResourceId).toBe(group.id);
    }

    const subjectGrants = grants.filter((g) => g.scopeType === 'SUBJECT');
    expect(subjectGrants.length).toBe(10); // 5 keys * 2 subjects

    // 18B: no subjectIds -> zero SUBJECT grants, but subjectGroup grants materialize
    const user2 = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });
    const resNoSubjects = await admin.agent
      .post(`/api/users/${user2}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'SUBJECT_LEADER', subjectGroupId: group.id });
    expect(resNoSubjects.status).toBe(200);

    const user2Grants = await h.prisma.capabilityGrant.findMany({
      where: { userId: user2, revokedAt: null },
    });
    expect(user2Grants.filter((g) => g.scopeType === 'SUBJECT')).toHaveLength(0);
    expect(user2Grants.filter((g) => g.scopeType === 'SUBJECT_GROUP')).toHaveLength(2);

    // 18C: does NOT auto-infer subjects from group members + StaffSubject
    await h.prisma.subjectGroupMembership.create({
      data: {
        userId,
        subjectGroupId: group.id,
        isPrimary: true,
        validFrom: new Date('2026-01-01'),
      },
    });
    await h.prisma.staffSubject.create({
      data: {
        userId,
        subjectId: subject1.id,
        validFrom: new Date('2026-01-01'),
      },
    });

    const user3 = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });
    const resNoInfer = await admin.agent
      .post(`/api/users/${user3}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'SUBJECT_LEADER', subjectGroupId: group.id });
    expect(resNoInfer.status).toBe(200);

    const user3Grants = await h.prisma.capabilityGrant.findMany({
      where: { userId: user3, revokedAt: null },
    });
    expect(user3Grants.filter((g) => g.scopeType === 'SUBJECT')).toHaveLength(0);

    // 18D: inactive subject -> fails closed (409 Conflict)
    const inactiveSubj = await h.prisma.subject.create({
      data: { code: 'INACT', name: 'Môn vô hiệu', status: CatalogStatus.INACTIVE },
    });
    const resInactive = await admin.agent
      .post(`/api/users/${user3}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'SUBJECT_LEADER', subjectGroupId: group.id, subjectIds: [inactiveSubj.id] });
    expect(resInactive.status).toBe(409);

    // 18E: nonexistent subject -> fails closed (404 Not Found)
    const resNotFound = await admin.agent
      .post(`/api/users/${user3}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'SUBJECT_LEADER', subjectGroupId: group.id, subjectIds: [crypto.randomUUID()] });
    expect(resNotFound.status).toBe(404);

    // 18F: duplicate subject IDs -> rejected with 400 Bad Request by DTO @ArrayUnique
    const resDuplicate = await admin.agent
      .post(`/api/users/${user3}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'SUBJECT_LEADER', subjectGroupId: group.id, subjectIds: [subject1.id, subject1.id] });
    expect(resDuplicate.status).toBe(400);
  });

  // =========================================================================
  // 19, 20, 21. Additive Nature, Repeat Idempotency & Concurrent Template Apply
  // =========================================================================
  it('19. template apply preserves unrelated manual grants', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    // Manually give user AUDIT_VIEW
    await h.prisma.capabilityGrant.create({
      data: {
        userId,
        capabilityKey: 'AUDIT_VIEW',
        scopeType: 'SCHOOL_WIDE',
        validFrom: new Date(),
      },
    });

    // Apply TEACHER template
    await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'TEACHER' });

    // Manual grant must still exist!
    const auditGrant = await h.prisma.capabilityGrant.findFirst({
      where: { userId, capabilityKey: 'AUDIT_VIEW', revokedAt: null },
    });
    expect(auditGrant).not.toBeNull();
  });

  it('20. template repeat apply is completely idempotent', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const first = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'TEACHER' });
    expect(first.status).toBe(200);
    expect(first.body.grantsAdded).toHaveLength(4);

    const second = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'TEACHER' });
    expect(second.status).toBe(200);
    expect(second.body.grantsAdded).toHaveLength(0);
    expect(second.body.alreadyPresent).toHaveLength(4);
  });

  it('21. concurrent template apply serializes via row lock without duplicate key errors', async () => {
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const [r1, r2] = await Promise.all([
      baselineService.applyTemplate(userId, { templateKey: 'TEACHER' }, defaultAdminId, { requestId: 'req-t1' }),
      baselineService.applyTemplate(userId, { templateKey: 'TEACHER' }, defaultAdminId, { requestId: 'req-t2' }),
    ]);

    expect(r1.templateKey).toBe('TEACHER');
    expect(r2.templateKey).toBe('TEACHER');

    const totalAdded = r1.grantsAdded.length + r2.grantsAdded.length;
    expect(totalAdded).toBe(4); // 4 added by one request, 0 by the other

    const count = await h.prisma.capabilityGrant.count({
      where: { userId, revokedAt: null },
    });
    expect(count).toBe(4);
  });

  // =========================================================================
  // 22, 23, 24. Baseline Reconciliation
  // =========================================================================
  it('22. reconciliation preview classifies users accurately', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });

    // User A: Active teaching staff with no grant -> MISSING
    const userA = await createTestUser({ isTeachingStaff: true, usernamePrefix: 'user-a' });

    // User B: Active teaching staff with active grant -> COMPLIANT
    const userB = await createTestUser({ isTeachingStaff: true, usernamePrefix: 'user-b' });
    await h.prisma.capabilityGrant.create({
      data: { userId: userB, capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', validFrom: new Date() },
    });

    // User C: Active non-teaching staff -> EXCLUDED
    await createTestUser({ isTeachingStaff: false, usernamePrefix: 'user-c' });

    // User D: Active teaching staff with future grant -> CONFLICT
    const userD = await createTestUser({ isTeachingStaff: true, usernamePrefix: 'user-d' });
    await h.prisma.capabilityGrant.create({
      data: {
        userId: userD,
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        validFrom: new Date(Date.now() + 86400000 * 30),
      },
    });

    const res = await admin.agent
      .get('/api/responsibility-templates/baseline-reconciliation/preview');
    expect(res.status).toBe(200);

    const body = res.body;
    expect(body.totalActiveUsers).toBeGreaterThanOrEqual(4);
    expect(body.eligibleProfessionals).toBeGreaterThanOrEqual(3);

    const missingIds = body.missing.map((u: { userId: string }) => u.userId);
    expect(missingIds).toContain(userA);

    const conflictIds = body.conflicts.map((u: { userId: string }) => u.userId);
    expect(conflictIds).toContain(userD);
  });

  it('23 & 24. reconciliation apply fixes missing, skips conflicts, and is idempotent', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });

    const userMissing = await createTestUser({ isTeachingStaff: true, usernamePrefix: 'rec-missing' });
    const userConflict = await createTestUser({ isTeachingStaff: true, usernamePrefix: 'rec-conflict' });
    await h.prisma.capabilityGrant.create({
      data: {
        userId: userConflict,
        capabilityKey: 'TEACHER_BASE',
        scopeType: 'PERSONAL',
        validFrom: new Date(Date.now() + 86400000 * 30),
      },
    });

    const applyRes = await admin.agent
      .post('/api/responsibility-templates/baseline-reconciliation/apply')
      .set('Origin', testOrigin)
      .send({});
    expect(applyRes.status).toBe(200);

    // userMissing should now be SUCCESS (newly granted baseline)
    const missingResult = applyRes.body.results.find((r: { userId: string }) => r.userId === userMissing);
    expect(missingResult?.status).toBe('SUCCESS');

    // userConflict should be CONFLICT
    const conflictResult = applyRes.body.results.find((r: { userId: string }) => r.userId === userConflict);
    expect(conflictResult?.status).toBe('CONFLICT');

    // Verify database state: userMissing now has TEACHER_BASE
    const missingGrant = await h.prisma.capabilityGrant.findFirst({
      where: { userId: userMissing, capabilityKey: 'TEACHER_BASE', revokedAt: null },
    });
    expect(missingGrant).not.toBeNull();
  });

  // =========================================================================
  // 25. Audit Event Invariant
  // =========================================================================
  it('25. audit events record exact template/version and delta metadata', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'TEACHER' });

    const auditEvents = await h.prisma.auditEvent.findMany({
      where: {
        action: 'RESPONSIBILITY_TEMPLATE_APPLIED',
      },
    });
    expect(auditEvents.length).toBeGreaterThanOrEqual(1);

    const event = auditEvents[0];
    expect(event.metadata).toMatchObject({
      targetUserId: userId,
      templateKey: 'TEACHER',
      templateVersion: 'v1',
    });
    const metadata = event.metadata as Record<string, unknown>;
    expect(metadata['grantsAddedCount']).toBe(4);
  });

  // =========================================================================
  // 26 & 27. Reconciliation Active-Only Invariant & DTO Safety
  // =========================================================================
  it('26. reconciliation enforces active-only invariant and excludes PENDING/DISABLED users', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });

    const userPending = await createTestUser({ status: UserStatus.PENDING, isTeachingStaff: true, usernamePrefix: 'rec-pend' });
    const userDisabled = await createTestUser({ status: UserStatus.DISABLED, isTeachingStaff: true, usernamePrefix: 'rec-dis' });
    const userActive = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true, usernamePrefix: 'rec-act' });

    // Explicitly targeting PENDING, DISABLED, and ACTIVE users
    const res = await admin.agent
      .post('/api/responsibility-templates/baseline-reconciliation/apply')
      .set('Origin', testOrigin)
      .send({ targetUserIds: [userPending, userDisabled, userActive] });
    expect(res.status).toBe(200);

    const pendResult = res.body.results.find((r: { userId: string }) => r.userId === userPending);
    expect(pendResult?.status).toBe('EXCLUDED');
    expect(pendResult?.reason).toMatch(/không ở trạng thái hoạt động/i);

    const disResult = res.body.results.find((r: { userId: string }) => r.userId === userDisabled);
    expect(disResult?.status).toBe('EXCLUDED');
    expect(disResult?.reason).toMatch(/không ở trạng thái hoạt động/i);

    const actResult = res.body.results.find((r: { userId: string }) => r.userId === userActive);
    expect(actResult?.status).toBe('SUCCESS');

    // Verify database grants: 0 grants for PENDING and DISABLED, 1 grant for ACTIVE
    const pendGrants = await h.prisma.capabilityGrant.findMany({ where: { userId: userPending } });
    expect(pendGrants).toHaveLength(0);

    const disGrants = await h.prisma.capabilityGrant.findMany({ where: { userId: userDisabled } });
    expect(disGrants).toHaveLength(0);

    const actGrants = await h.prisma.capabilityGrant.findMany({ where: { userId: userActive, capabilityKey: 'TEACHER_BASE' } });
    expect(actGrants).toHaveLength(1);
  });

  it('27. reconciliation DTO rejects empty array [] and duplicate targetUserIds with 400', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const user = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    // Empty array -> 400 Bad Request
    const resEmpty = await admin.agent
      .post('/api/responsibility-templates/baseline-reconciliation/apply')
      .set('Origin', testOrigin)
      .send({ targetUserIds: [] });
    expect(resEmpty.status).toBe(400);

    // Duplicate targetUserIds -> 400 Bad Request
    const resDup = await admin.agent
      .post('/api/responsibility-templates/baseline-reconciliation/apply')
      .set('Origin', testOrigin)
      .send({ targetUserIds: [user, user] });
    expect(resDup.status).toBe(400);
  });

  // =========================================================================
  // 28, 29, 30. CapabilityDefinition Validation & Atomic Rollback
  // =========================================================================
  it('28. CapabilityDefinition validation: inactive TEACHER_BASE rolls back user activation atomically', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' }] });
    const user = await createTestUser({ status: UserStatus.PENDING, isTeachingStaff: true });

    // Temporarily deactivate TEACHER_BASE definition in DB
    await h.prisma.capabilityDefinition.update({
      where: { key: 'TEACHER_BASE' },
      data: { isActive: false },
    });

    try {
      const res = await admin.agent
        .post(`/api/users/${user}/activate`)
        .set('Origin', testOrigin)
        .send({});
      expect(res.status).toBe(409);

      // Verify user remains in prior PENDING state and 0 grants created
      const dbUser = await h.prisma.user.findUniqueOrThrow({ where: { id: user } });
      expect(dbUser.status).toBe(UserStatus.PENDING);

      const dbGrants = await h.prisma.capabilityGrant.findMany({ where: { userId: user } });
      expect(dbGrants).toHaveLength(0);
    } finally {
      // Restore TEACHER_BASE definition
      await h.prisma.capabilityDefinition.update({
        where: { key: 'TEACHER_BASE' },
        data: { isActive: true },
      });
    }
  });

  it('29. CapabilityDefinition validation: template with inactive capability fails closed with 0 partial grants', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const user = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    // Temporarily deactivate REPORTING_STATEMENT_SUBMIT
    await h.prisma.capabilityDefinition.update({
      where: { key: 'REPORTING_STATEMENT_SUBMIT' },
      data: { isActive: false },
    });

    try {
      const res = await admin.agent
        .post(`/api/users/${user}/responsibility-templates/apply`)
        .set('Origin', testOrigin)
        .send({ templateKey: 'TEACHER' });
      expect(res.status).toBe(409);

      // No partial grants should exist for this user!
      const dbGrants = await h.prisma.capabilityGrant.findMany({ where: { userId: user } });
      expect(dbGrants).toHaveLength(0);
    } finally {
      await h.prisma.capabilityDefinition.update({
        where: { key: 'REPORTING_STATEMENT_SUBMIT' },
        data: { isActive: true },
      });
    }
  });

  it('30. CapabilityDefinition validation: template scope not in allowedScopeTypes fails closed', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const user = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    // Temporarily change allowedScopeTypes of REPORTING_STATEMENT_SUBMIT to only SCHOOL_WIDE
    await h.prisma.capabilityDefinition.update({
      where: { key: 'REPORTING_STATEMENT_SUBMIT' },
      data: { allowedScopeTypes: ['SCHOOL_WIDE'] },
    });

    try {
      const res = await admin.agent
        .post(`/api/users/${user}/responsibility-templates/apply`)
        .set('Origin', testOrigin)
        .send({ templateKey: 'TEACHER' });
      expect(res.status).toBe(409);

      const dbGrants = await h.prisma.capabilityGrant.findMany({ where: { userId: user } });
      expect(dbGrants).toHaveLength(0);
    } finally {
      await h.prisma.capabilityDefinition.update({
        where: { key: 'REPORTING_STATEMENT_SUBMIT' },
        data: { allowedScopeTypes: ['PERSONAL'] },
      });
    }
  });

  // =========================================================================
  // 31, 32, 33, 34. Nested DTO Validation for Resources
  // =========================================================================
  it('31. nested DTO validation: rejects invalid subjectGroupId UUID in resources with 400', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const previewRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/preview`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'SUBJECT_LEADER',
        resources: { subjectGroupId: 'invalid-not-uuid' },
      });
    expect(previewRes.status).toBe(400);

    const applyRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'SUBJECT_LEADER',
        resources: { subjectGroupId: 'invalid-not-uuid' },
      });
    expect(applyRes.status).toBe(400);
  });

  it('32. nested DTO validation: rejects non-UUID elements in resources.subjectIds with 400', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const previewRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/preview`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'SUBJECT_LEADER',
        resources: {
          subjectGroupId: crypto.randomUUID(),
          subjectIds: ['invalid-uuid'],
        },
      });
    expect(previewRes.status).toBe(400);

    const applyRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'SUBJECT_LEADER',
        resources: {
          subjectGroupId: crypto.randomUUID(),
          subjectIds: ['invalid-uuid'],
        },
      });
    expect(applyRes.status).toBe(400);
  });

  it('33. nested DTO validation: rejects duplicate subjectIds in resources with 400', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });
    const sameUuid = crypto.randomUUID();

    const previewRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/preview`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'SUBJECT_LEADER',
        resources: {
          subjectGroupId: crypto.randomUUID(),
          subjectIds: [sameUuid, sameUuid],
        },
      });
    expect(previewRes.status).toBe(400);

    const applyRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'SUBJECT_LEADER',
        resources: {
          subjectGroupId: crypto.randomUUID(),
          subjectIds: [sameUuid, sameUuid],
        },
      });
    expect(applyRes.status).toBe(400);
  });

  it('34. nested DTO validation: valid nested resources pass validation and execute normally', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const group = await h.prisma.subjectGroup.create({
      data: { code: normalizedCode('SG', 6), name: 'Tổ Toán', status: CatalogStatus.ACTIVE },
    });
    const subject = await h.prisma.subject.create({
      data: { code: normalizedCode('SUB', 6), name: 'Toán 10', status: CatalogStatus.ACTIVE },
    });

    const previewRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/preview`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'SUBJECT_LEADER',
        resources: {
          subjectGroupId: group.id,
          subjectIds: [subject.id],
        },
      });
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.requiredResources.resolvedSubjectGroupId).toBe(group.id);

    const applyRes = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'SUBJECT_LEADER',
        resources: {
          subjectGroupId: group.id,
          subjectIds: [subject.id],
        },
      });
    expect(applyRes.status).toBe(200);
  });

  // =========================================================================
  // 35, 36, 37, 38, 39. Preview CapabilityDefinition Validation Fail-Closed
  // =========================================================================
  it('35. previewTemplate fail-closed: inactive template capability returns 409', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const user = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    await h.prisma.capabilityDefinition.update({
      where: { key: 'REPORTING_STATEMENT_SUBMIT' },
      data: { isActive: false },
    });

    try {
      const res = await admin.agent
        .post(`/api/users/${user}/responsibility-templates/preview`)
        .set('Origin', testOrigin)
        .send({ templateKey: 'TEACHER' });
      expect(res.status).toBe(409);
    } finally {
      await h.prisma.capabilityDefinition.update({
        where: { key: 'REPORTING_STATEMENT_SUBMIT' },
        data: { isActive: true },
      });
    }
  });

  it('36. previewTemplate fail-closed: missing template capability definition returns 404', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const user = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const def = await h.prisma.capabilityDefinition.findUniqueOrThrow({
      where: { key: 'TEACHING_EXECUTION_RECORD' },
    });
    await h.prisma.capabilityDefinition.delete({
      where: { key: 'TEACHING_EXECUTION_RECORD' },
    });

    try {
      const res = await admin.agent
        .post(`/api/users/${user}/responsibility-templates/preview`)
        .set('Origin', testOrigin)
        .send({ templateKey: 'TEACHER' });
      expect(res.status).toBe(404);
    } finally {
      await h.prisma.capabilityDefinition.create({
        data: def,
      });
    }
  });

  it('37. previewTemplate fail-closed: invalid allowedScope returns 409', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const user = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    await h.prisma.capabilityDefinition.update({
      where: { key: 'REPORTING_STATEMENT_SUBMIT' },
      data: { allowedScopeTypes: ['SCHOOL_WIDE'] },
    });

    try {
      const res = await admin.agent
        .post(`/api/users/${user}/responsibility-templates/preview`)
        .set('Origin', testOrigin)
        .send({ templateKey: 'TEACHER' });
      expect(res.status).toBe(409);
    } finally {
      await h.prisma.capabilityDefinition.update({
        where: { key: 'REPORTING_STATEMENT_SUBMIT' },
        data: { allowedScopeTypes: ['PERSONAL'] },
      });
    }
  });

  it('38. previewReconciliation fail-closed: inactive TEACHER_BASE returns 409', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });

    await h.prisma.capabilityDefinition.update({
      where: { key: 'TEACHER_BASE' },
      data: { isActive: false },
    });

    try {
      const res = await admin.agent
        .get('/api/responsibility-templates/baseline-reconciliation/preview')
        .set('Origin', testOrigin);
      expect(res.status).toBe(409);
    } finally {
      await h.prisma.capabilityDefinition.update({
        where: { key: 'TEACHER_BASE' },
        data: { isActive: true },
      });
    }
  });

  it('39. previewReconciliation passes and returns preview when catalog is normal', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });

    const res = await admin.agent
      .get('/api/responsibility-templates/baseline-reconciliation/preview')
      .set('Origin', testOrigin);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalActiveUsers');
    expect(res.body).toHaveProperty('eligibleProfessionals');
  });

  // =========================================================================
  // 40. Title-Only Non-Authorization Invariant
  // =========================================================================
  it('40. title-only does NOT authorize: positionTitle alone creates zero authority', async () => {
    const admin = await h.actor({ grants: [{ capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' }] });
    const authService = h.app.get(CapabilityAuthorizationService);

    // Create user with positionTitle = "Phó Hiệu trưởng", isTeachingStaff = false, status = PENDING
    const userId = await createTestUser({
      status: UserStatus.PENDING,
      isTeachingStaff: false,
      positionTitle: 'Phó Hiệu trưởng',
    });

    // Activate user
    const actRes = await admin.agent
      .post(`/api/users/${userId}/activate`)
      .set('Origin', testOrigin)
      .send({});
    expect(actRes.status).toBe(200);

    const activatedUser = await h.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true },
    });
    expect(activatedUser.status).toBe(UserStatus.ACTIVE);
    expect(activatedUser.profile?.positionTitle).toBe('Phó Hiệu trưởng');
    expect(activatedUser.profile?.isTeachingStaff).toBe(false);

    // Assert: activate does NOT auto-grant TEACHER_BASE
    const grants = await h.prisma.capabilityGrant.findMany({
      where: { userId },
    });
    expect(grants).toHaveLength(0);

    // Assert: effective capabilities has zero grants and does NOT contain any PHT capabilities
    const effective = await authService.listEffectiveCapabilities(userId);
    const effectiveKeys = effective.map((c) => c.key);

    expect(effectiveKeys).not.toContain('TEACHER_BASE');
    expect(effectiveKeys).not.toContain('APPROVAL_VICE_PRINCIPAL');
    expect(effectiveKeys).not.toContain('TIMETABLE_MANAGE');
    expect(effectiveKeys).not.toContain('PPCT_MANAGE');
    expect(effectiveKeys).not.toContain('REPORTING_READ');
    expect(effectiveKeys).not.toContain('REPORTING_STATEMENT_READ');
    expect(effective).toHaveLength(0);
  });

  // =========================================================================
  // 41. Administrative Read-Model Options Authentication & Authorization boundaries
  // =========================================================================
  it('41. Administrative Read-Model Options enforces authentication and CAPABILITY_GRANT guard', async () => {
    const unauthenticated = request(h.app.getHttpServer());
    const noGrantActor = await h.actor();
    const userManageActor = await h.actor({ grants: [{ capabilityKey: 'USER_MANAGE' }] });
    const systemAdminActor = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    const principalActor = await h.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL' }] });
    const academicStructureActor = await h.actor({ grants: [{ capabilityKey: 'ACADEMIC_STRUCTURE_MANAGE' }] });
    const manager = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });

    const fakeUuid = '00000000-0000-4000-8000-000000000000';

    // 401 unauthenticated
    expect((await unauthenticated.get('/api/capabilities/responsibility-templates/academic-year-options')).status).toBe(401);
    expect((await unauthenticated.get(`/api/capabilities/responsibility-templates/programme-master-options?academicYearId=${fakeUuid}&kind=GDDP`)).status).toBe(401);

    // 403 when lacking CAPABILITY_GRANT (no role substitution allowed)
    for (const actor of [noGrantActor, userManageActor, systemAdminActor, principalActor, academicStructureActor]) {
      expect((await actor.agent.get('/api/capabilities/responsibility-templates/academic-year-options')).status).toBe(403);
      expect((await actor.agent.get(`/api/capabilities/responsibility-templates/programme-master-options?academicYearId=${fakeUuid}&kind=GDDP`)).status).toBe(403);
    }

    // 200 with CAPABILITY_GRANT
    expect((await manager.agent.get('/api/capabilities/responsibility-templates/academic-year-options')).status).toBe(200);
    expect((await manager.agent.get(`/api/capabilities/responsibility-templates/programme-master-options?academicYearId=${fakeUuid}&kind=GDDP`)).status).toBe(200);
  });

  // =========================================================================
  // 42. Administrative Read-Model Options Validation and Data Isolation
  // =========================================================================
  it('42. Administrative Read-Model Options validates inputs, isolates datasets, and enforces minimal projection', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });

    // Validation errors: 400 for invalid UUID or invalid kind
    expect((await manager.agent.get('/api/capabilities/responsibility-templates/programme-master-options?academicYearId=not-a-uuid&kind=GDDP')).status).toBe(400);
    expect((await manager.agent.get('/api/capabilities/responsibility-templates/programme-master-options?academicYearId=00000000-0000-4000-8000-000000000000&kind=INVALID')).status).toBe(400);
    expect((await manager.agent.get('/api/capabilities/responsibility-templates/programme-master-options?kind=GDDP')).status).toBe(400);

    // Seed test data across 2 academic years
    const yearA = await h.prisma.academicYear.create({ data: { code: '2026_2027', name: 'Năm học 2026-2027' } });
    const yearB = await h.prisma.academicYear.create({ data: { code: '2025_2026', name: 'Năm học 2025-2026' } });

    const masterA_GDDP = await h.prisma.programmeMaster.create({
      data: { academicYearId: yearA.id, kind: 'GDDP', gradeLevel: 10, createdByUserId: manager.id },
    });
    const masterA_HDTN = await h.prisma.programmeMaster.create({
      data: { academicYearId: yearA.id, kind: 'HDTN_HN', gradeLevel: null, createdByUserId: manager.id },
    });
    const masterB_GDDP = await h.prisma.programmeMaster.create({
      data: { academicYearId: yearB.id, kind: 'GDDP', gradeLevel: 11, createdByUserId: manager.id },
    });

    // 1. Academic years options: strictly { id, code, name }, ordered code desc
    const yearRes = await manager.agent.get('/api/capabilities/responsibility-templates/academic-year-options');
    expect(yearRes.status).toBe(200);
    expect(yearRes.body.total).toBe(2);
    expect(yearRes.body.items[0]).toEqual({ id: yearA.id, code: '2026_2027', name: 'Năm học 2026-2027' });
    expect(yearRes.body.items[1]).toEqual({ id: yearB.id, code: '2025_2026', name: 'Năm học 2025-2026' });
    expect(yearRes.body.items[0]).not.toHaveProperty('createdAt');
    expect(yearRes.body.items[0]).not.toHaveProperty('updatedAt');

    // 2. Programme master options for yearA + GDDP: only masterA_GDDP
    const masterResA = await manager.agent.get(
      `/api/capabilities/responsibility-templates/programme-master-options?academicYearId=${yearA.id}&kind=GDDP`,
    );
    expect(masterResA.status).toBe(200);
    expect(masterResA.body.total).toBe(1);
    expect(masterResA.body.items[0]).toEqual({
      id: masterA_GDDP.id,
      academicYearId: yearA.id,
      kind: 'GDDP',
      gradeLevel: 10,
    });
    expect(masterResA.body.items[0]).not.toHaveProperty('createdByUserId');
    expect(masterResA.body.items[0]).not.toHaveProperty('createdAt');

    // 3. Programme master options for yearA + HDTN_HN: only masterA_HDTN
    const masterResHDTN = await manager.agent.get(
      `/api/capabilities/responsibility-templates/programme-master-options?academicYearId=${yearA.id}&kind=HDTN_HN`,
    );
    expect(masterResHDTN.status).toBe(200);
    expect(masterResHDTN.body.total).toBe(1);
    expect(masterResHDTN.body.items[0].id).toBe(masterA_HDTN.id);

    // 4. Programme master options for yearB + GDDP: only masterB_GDDP
    const masterResB = await manager.agent.get(
      `/api/capabilities/responsibility-templates/programme-master-options?academicYearId=${yearB.id}&kind=GDDP`,
    );
    expect(masterResB.status).toBe(200);
    expect(masterResB.body.total).toBe(1);
    expect(masterResB.body.items[0].id).toBe(masterB_GDDP.id);

    // 5. Programme master options for yearB + HDTN_HN: empty list
    const masterResEmpty = await manager.agent.get(
      `/api/capabilities/responsibility-templates/programme-master-options?academicYearId=${yearB.id}&kind=HDTN_HN`,
    );
    expect(masterResEmpty.status).toBe(200);
    expect(masterResEmpty.body.total).toBe(0);
    expect(masterResEmpty.body.items).toEqual([]);
  });

  // =========================================================================
  // 43. Coordinator Template Preview and Apply Flow with Canonical Keys
  // =========================================================================
  it('43. Coordinator responsibility templates preview and apply with read-model master id and canonical capability keys', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const targetUserId = await createTestUser({ status: UserStatus.ACTIVE, isTeachingStaff: true });

    const year = await h.prisma.academicYear.create({ data: { code: '2026_2027_COORD', name: 'Năm học Điều phối' } });
    const masterGDDP = await h.prisma.programmeMaster.create({
      data: { academicYearId: year.id, kind: 'GDDP', gradeLevel: 10, createdByUserId: manager.id },
    });
    const masterHDTN = await h.prisma.programmeMaster.create({
      data: { academicYearId: year.id, kind: 'HDTN_HN', gradeLevel: null, createdByUserId: manager.id },
    });

    // 1. Preview GDDP_COORDINATOR with matching master
    const previewGDDP = await manager.agent
      .post(`/api/users/${targetUserId}/responsibility-templates/preview`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'GDDP_COORDINATOR',
        programmeMasterId: masterGDDP.id,
      });
    expect(previewGDDP.status).toBe(200);
    expect(previewGDDP.body.eligibility.isEligible).toBe(true);
    expect(previewGDDP.body.requiredResources.provided).toBe(true);
    expect(previewGDDP.body.requiredResources.resolvedProgrammeMasterId).toBe(masterGDDP.id);

    // Apply GDDP_COORDINATOR
    const applyGDDP = await manager.agent
      .post(`/api/users/${targetUserId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'GDDP_COORDINATOR',
        programmeMasterId: masterGDDP.id,
      });
    expect(applyGDDP.status).toBe(200);
    expect(applyGDDP.body.applied).toBe(true);
    expect(applyGDDP.body.grantsAdded[0].capabilityKey).toBe('GDDP_COORDINATOR');
    expect(applyGDDP.body.grantsAdded[0].scopeResourceId).toBe(masterGDDP.id);

    // 2. Preview HDTN_COORDINATOR with matching master -> grants canonical HĐTN_COORDINATOR
    const previewHDTN = await manager.agent
      .post(`/api/users/${targetUserId}/responsibility-templates/preview`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'HDTN_COORDINATOR',
        programmeMasterId: masterHDTN.id,
      });
    expect(previewHDTN.status).toBe(200);
    expect(previewHDTN.body.eligibility.isEligible).toBe(true);
    expect(previewHDTN.body.requiredResources.resolvedProgrammeMasterId).toBe(masterHDTN.id);

    const applyHDTN = await manager.agent
      .post(`/api/users/${targetUserId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'HDTN_COORDINATOR',
        programmeMasterId: masterHDTN.id,
      });
    expect(applyHDTN.status).toBe(200);
    expect(applyHDTN.body.applied).toBe(true);
    // Canonical capability key has 'Đ'
    expect(applyHDTN.body.grantsAdded[0].capabilityKey).toBe('HĐTN_COORDINATOR');
    expect(applyHDTN.body.grantsAdded[0].scopeResourceId).toBe(masterHDTN.id);

    // 3. Conflict when previewing GDDP_COORDINATOR with HDTN master
    const conflictRes = await manager.agent
      .post(`/api/users/${targetUserId}/responsibility-templates/preview`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'GDDP_COORDINATOR',
        programmeMasterId: masterHDTN.id,
      });
    expect(conflictRes.status).toBe(409);

    // 4. NotFound when programmeMasterId does not exist
    const notFoundRes = await manager.agent
      .post(`/api/users/${targetUserId}/responsibility-templates/preview`)
      .set('Origin', testOrigin)
      .send({
        templateKey: 'GDDP_COORDINATOR',
        programmeMasterId: '00000000-0000-4000-8000-000000000000',
      });
    expect(notFoundRes.status).toBe(404);
  });
});
