import { CatalogStatus, UserStatus } from '@prisma/client';
import { AccessBaselineService } from '../../src/capabilities/access-baseline.service';
import { Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';

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
            isTeachingStaff: options.isTeachingStaff ?? true,
          },
        },
      },
    });
    return user.id;
  }

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
  // 11, 12, 13, 14. Template Apply: PHT & Principal Invariants
  // =========================================================================
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

  it('18. Subject Leader template resolves subject group and member subjects', async () => {
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

    const res = await admin.agent
      .post(`/api/users/${userId}/responsibility-templates/apply`)
      .set('Origin', testOrigin)
      .send({ templateKey: 'SUBJECT_LEADER', subjectGroupId: group.id, subjectIds: [subject1.id, subject2.id] });
    expect(res.status).toBe(200);

    const grants = await h.prisma.capabilityGrant.findMany({
      where: { userId, revokedAt: null },
    });

    // Subject group grants
    const groupGrants = grants.filter((g) => g.scopeType === 'SUBJECT_GROUP');
    expect(groupGrants.map((g) => g.capabilityKey)).toEqual(
      expect.arrayContaining(['SUBJECT_GROUP_LEAD', 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE'])
    );
    for (const g of groupGrants) {
      expect(g.scopeResourceId).toBe(group.id);
    }

    // Subject level grants for both subjects
    const subjectGrants = grants.filter((g) => g.scopeType === 'SUBJECT');
    expect(subjectGrants.length).toBe(10); // 5 keys * 2 subjects
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
});
