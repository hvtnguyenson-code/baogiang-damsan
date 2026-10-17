import request from 'supertest';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { USER_DELETE_FK_INVENTORY } from '../../src/users/user-delete-fk-inventory';
import { Phase01Harness, integration, normalizedCode, testOrigin, testPassword } from '../helpers/phase01-test-harness';

jest.setTimeout(20000);

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

integration('P5-051 clean-slate deletion (real isolated PostgreSQL)', () => {
  const h = new Phase01Harness();
  let admin: Awaited<ReturnType<Phase01Harness['actor']>>;
  let pause: { id: string; entered: ReturnType<typeof latch>; resume: ReturnType<typeof latch>; used: boolean } | undefined;
  let faultAfterFirstCleanup = false;

  beforeAll(async () => {
    await h.start();
    h.app.get(PrismaService).$use(async (params, next) => {
      if (pause && !pause.used && params.model === 'User' && params.action === 'findUnique'
        && params.args?.where?.id === pause.id && params.args?.select?.lastLoginAt) {
        pause.used = true;
        pause.entered.release();
        await pause.resume.promise;
      }
      const result: unknown = await next(params);
      if (faultAfterFirstCleanup && params.model === 'SubjectGroupMembership' && params.action === 'deleteMany') {
        faultAfterFirstCleanup = false;
        throw new Error('P5-051 injected failure after first cleanup');
      }
      return result;
    });
  });
  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities([
      { key: 'USER_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'CAPABILITY_GRANT', scopes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_GROUP_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'TEACHER_BASE', scopes: ['PERSONAL'] },
      { key: 'TEACHING_EXECUTION_RECORD', scopes: ['PERSONAL'] },
      { key: 'REPORTING_STATEMENT_SUBMIT', scopes: ['PERSONAL'] },
      { key: 'REPORTING_STATEMENT_READ', scopes: ['PERSONAL'] },
    ]);
    admin = await h.actor({ grants: [{ capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'SYSTEM_ADMIN' }, { capabilityKey: 'CAPABILITY_GRANT' }, { capabilityKey: 'SUBJECT_GROUP_MANAGE' }, { capabilityKey: 'SUBJECT_MANAGE' }] });
  });
  afterEach(() => { pause?.resume.release(); pause = undefined; faultAfterFirstCleanup = false; });
  afterAll(async () => { await h.clean(); await h.stop(); });

  async function target(status: UserStatus = UserStatus.PENDING) {
    return h.prisma.user.create({ data: {
      username: `clean-${crypto.randomUUID()}`, passwordHash: 'isolated-test-only', status,
      profile: { create: { displayName: 'Tài khoản thử', isTeachingStaff: true } },
    }, include: { profile: true } });
  }
  const preview = (id: string) => admin.agent.get(`/api/users/${id}/delete-preflight`);
  const remove = (u: { id: string; username: string }) => admin.agent.delete(`/api/users/${u.id}`).set('Origin', testOrigin).send({ confirmUsername: u.username });
  async function blocked(u: { id: string; username: string }, code: string) {
    const p = await preview(u.id);
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ eligibility: 'BLOCKED', disableRecommended: true, blockers: expect.arrayContaining([expect.objectContaining({ code })]) });
    expect((await remove(u)).status).toBe(409);
    expect(await h.prisma.user.count({ where: { id: u.id } })).toBe(1);
  }
  async function setup(u: { id: string }) {
    const group = await h.prisma.subjectGroup.create({ data: { code: normalizedCode('GR'), name: 'Tổ' } });
    const subject = await h.prisma.subject.create({ data: { code: normalizedCode('SB'), name: 'Môn' } });
    const membership = await admin.agent.post('/api/subject-group-memberships').set('Origin', testOrigin).send({ userId: u.id, subjectGroupId: group.id });
    const staffSubject = await admin.agent.post('/api/staff-subjects').set('Origin', testOrigin).send({ userId: u.id, subjectId: subject.id });
    expect(membership.status).toBe(201);
    expect(staffSubject.status).toBe(201);
    for (const path of [`/api/subject-group-memberships/${membership.body.id}`, `/api/staff-subjects/${staffSubject.body.id}`]) {
      expect((await admin.agent.patch(path).set('Origin', testOrigin).send({ isPrimary: true })).status).toBe(200);
      expect((await admin.agent.post(`${path}/end`).set('Origin', testOrigin).send({ endAt: new Date(Date.now() + 60000).toISOString() })).status).toBe(200);
    }
    return { group, subject, setupIds: [membership.body.id as string, staffSubject.body.id as string] };
  }
  function pauseDelete(id: string) {
    pause = { id, entered: latch(), resume: latch(), used: false };
    return pause;
  }
  async function waitForLock(pid?: number) {
    for (let i = 0; i < 150; i++) {
      const rows = await h.prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND (${pid ?? null}::int IS NULL OR pid = ${pid ?? null}::int)
      ) AS waiting`;
      if (rows[0].waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Expected an observed PostgreSQL lock wait');
  }

  it('verifies PostgreSQL version, READ COMMITTED and migration-backed 40-table/72-direct + 4-indirect graph', async () => {
    const [v] = await h.prisma.$queryRaw<Array<{ version: string; isolation: string }>>`SELECT version(), current_setting('transaction_isolation') AS isolation`;
    expect(v.version).toMatch(/PostgreSQL/);
    expect(v.isolation).toBe('read committed');
    expect(USER_DELETE_FK_INVENTORY.filter((f) => f.parent === 'users')).toHaveLength(72);
    expect(new Set(USER_DELETE_FK_INVENTORY.filter((f) => f.parent === 'users').map((f) => f.child)).size).toBe(40);
    expect(USER_DELETE_FK_INVENTORY.filter((f) => f.parent !== 'users')).toHaveLength(4);
    expect((await preview((await target()).id)).body.eligibility).toBe('ELIGIBLE');
  });

  it('read-only preview is minimal and pristine PENDING profile deletion retains administrator audit and unrelated data', async () => {
    const created = await admin.agent.post('/api/users').set('Origin', testOrigin).send({
      username: `clean-${crypto.randomUUID()}`, password: testPassword,
      profile: { displayName: 'Tài khoản thử', isTeachingStaff: true },
    });
    expect(created.status).toBe(201);
    const u = created.body as { id: string; username: string };
    expect((await admin.agent.patch(`/api/users/${u.id}`).set('Origin', testOrigin).send({ profile: { positionTitle: 'Giáo viên' } })).status).toBe(200);
    const other = await target();
    const before = await h.prisma.auditEvent.count();
    const p = await preview(u.id);
    expect(p.body).toMatchObject({ targetUserId: u.id, username: u.username, displayName: 'Tài khoản thử', eligibility: 'ELIGIBLE', blockers: [], cleanupCounts: { staffProfiles: 1, staffSubjects: 0, subjectGroupMemberships: 0 }, disableRecommended: false });
    expect(await h.prisma.auditEvent.count()).toBe(before);
    expect(JSON.stringify(p.body)).not.toMatch(/password|token|credential/i);
    expect((await remove(u)).status).toBe(200);
    expect(await h.prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
    expect(await h.prisma.staffProfile.count({ where: { userId: u.id } })).toBe(0);
    expect(await h.prisma.user.count({ where: { id: other.id } })).toBe(1);
    const audit = await h.prisma.auditEvent.findFirstOrThrow({ where: { action: 'USER_CLEAN_SLATE_DELETED', entityId: u.id } });
    expect(audit).toMatchObject({ actorUserId: admin.id, entityType: 'User', result: 'SUCCESS', metadata: { deletedUserId: u.id, username: u.username, displayName: 'Tài khoản thử', cleanupCounts: p.body.cleanupCounts } });
    expect(JSON.stringify(audit.metadata)).not.toMatch(/password|token|credential/i);
    expect(await h.prisma.auditEvent.count({ where: { action: 'USER_CREATED', entityId: u.id, actorUserId: admin.id } })).toBe(1);
    expect(await h.prisma.auditEvent.count()).toBe(before + 1);
  });

  it('atomically deletes only three allowlisted categories, never their catalog parents', async () => {
    const u = await target(); const refs = await setup(u);
    const other = await target();
    await h.prisma.staffSubject.create({ data: { userId: other.id, subjectId: refs.subject.id } });
    await h.prisma.subjectGroupMembership.create({ data: { userId: other.id, subjectGroupId: refs.group.id } });
    const p = await preview(u.id);
    expect(p.body.cleanupCounts).toEqual({ staffProfiles: 1, subjectGroupMemberships: 1, staffSubjects: 1 });
    expect((await remove(u)).body.cleanupCounts).toEqual(p.body.cleanupCounts);
    expect(await h.prisma.subjectGroupMembership.count({ where: { userId: u.id } })).toBe(0);
    expect(await h.prisma.staffSubject.count({ where: { userId: u.id } })).toBe(0);
    expect(await h.prisma.subjectGroupMembership.count({ where: { userId: other.id } })).toBe(1);
    expect(await h.prisma.staffSubject.count({ where: { userId: other.id } })).toBe(1);
    expect(await h.prisma.staffProfile.count({ where: { userId: other.id } })).toBe(1);
    expect(await h.prisma.subject.count({ where: { id: refs.subject.id } })).toBe(1);
    expect(await h.prisma.subjectGroup.count({ where: { id: refs.group.id } })).toBe(1);
    expect(await h.prisma.auditEvent.count({ where: { entityId: { in: refs.setupIds }, actorUserId: admin.id } })).toBe(6);
  });

  it('does not exempt setup-looking audit receipts with unverified extra metadata', async () => {
    const u = await target(); const refs = await setup(u);
    await h.prisma.auditEvent.updateMany({ where: { action: 'STAFF_SUBJECT_CREATED', entityId: refs.setupIds[1] }, data: {
      metadata: { userId: u.id, subjectId: refs.subject.id, unverifiedBusinessReference: u.id },
    } });
    await blocked(u, 'UNVERIFIED_REFERENCE');
    expect(await h.prisma.staffSubject.count({ where: { userId: u.id } })).toBe(1);
  });

  it('blocks self even with both administrative capabilities', async () => {
    const u = await h.prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    await blocked(u, 'SELF');
    const p = await preview(u.id.toUpperCase());
    expect(p.body.blockers).toContainEqual(expect.objectContaining({ code: 'SELF' }));
  });
  it('uses canonical DB UUIDs for uppercase route identity and retained deletion audit', async () => {
    const u = await target();
    expect((await remove({ ...u, id: u.id.toUpperCase() })).body.deletedUserId).toBe(u.id);
    expect(await h.prisma.auditEvent.count({ where: { action: 'USER_CLEAN_SLATE_DELETED', entityId: u.id } })).toBe(1);
  });
  it('protects bootstrap from persisted provenance, including custom username and actor-null historical receipt', async () => {
    const u = await target();
    await h.prisma.auditEvent.create({ data: { action: 'AUTH_BOOTSTRAP_ADMIN_SUCCESS', entityType: 'User', entityId: u.id, result: 'SUCCESS' } });
    await blocked(u, 'PROTECTED');
  });
  it('does not hardcode the username admin', async () => {
    const u = await target();
    await h.prisma.user.update({ where: { id: u.id }, data: { username: 'admin' } });
    expect((await remove({ ...u, username: 'admin' })).status).toBe(200);
  });
  it('blocks lastLoginAt without depending on a current session', async () => {
    const u = await target();
    await h.prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    await blocked(u, 'LOGIN_HISTORY');
  });
  it.each([false, true])('blocks active/revoked session history (revoked=%s)', async (revoked) => {
    const u = await target();
    await h.prisma.authSession.create({ data: { userId: u.id, tokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 60000), revokedAt: revoked ? new Date() : null } });
    await blocked(u, 'SECURITY_HISTORY');
    expect(await h.prisma.authSession.count({ where: { userId: u.id } })).toBe(1);
  });
  it.each([false, true])('blocks current/historical baseline grant without exemptions (revoked=%s)', async (revoked) => {
    const u = await target();
    await h.prisma.capabilityGrant.create({ data: { userId: u.id, capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', revokedAt: revoked ? new Date() : null } });
    await blocked(u, 'SECURITY_HISTORY');
  });
  it.each(['grantedByUserId', 'revokedByUserId'] as const)('blocks target as %s despite SET NULL', async (field) => {
    const u = await target();
    await h.prisma.capabilityGrant.create({ data: { userId: admin.id, capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', [field]: u.id } });
    await blocked(u, 'SECURITY_HISTORY');
    expect(await h.prisma.capabilityGrant.count({ where: { [field]: u.id } })).toBe(1);
  });
  it('blocks audit actor despite SET NULL; blocked target can still be disabled', async () => {
    const u = await target();
    await h.prisma.auditEvent.create({ data: { actorUserId: u.id, action: 'TEST_BUSINESS', entityType: 'User' } });
    await blocked(u, 'SECURITY_HISTORY');
    expect((await admin.agent.post(`/api/users/${u.id}/disable`).set('Origin', testOrigin).send({})).status).toBe(200);
    expect(await h.prisma.auditEvent.count({ where: { actorUserId: u.id } })).toBe(1);
  });
  it('blocks administrator-owned security receipts and unknown target User audit references even without metadata IDs', async () => {
    const u = await target();
    await h.prisma.auditEvent.create({ data: { actorUserId: admin.id, action: 'USER_PASSWORD_RESET', entityType: 'User', entityId: u.id, metadata: { revokedSessionCount: 0 } } });
    await blocked(u, 'SECURITY_HISTORY');
    const other = await target();
    await h.prisma.auditEvent.create({ data: { actorUserId: admin.id, action: 'UNKNOWN_USER_HISTORY', entityType: 'User', entityId: other.id } });
    await blocked(other, 'SECURITY_HISTORY');
  });
  it('blocks indirect AdditionalDuty through profile before cleanup', async () => {
    const u = await target();
    const duty = await h.prisma.additionalDutyDefinition.create({ data: { code: normalizedCode('DUTY'), name: 'Nhiệm vụ', category: 'TEST' } });
    await h.prisma.staffAdditionalDutyAssignment.create({ data: { staffProfileId: u.profile!.id, dutyDefinitionId: duty.id, scopeType: 'SCHOOL_WIDE', createdByUserId: admin.id } });
    await blocked(u, 'INDIRECT_HISTORY');
    expect(await h.prisma.staffAdditionalDutyAssignment.count()).toBe(1);
  });
  it.each(['GDDP', 'HDTN_HN'] as const)('blocks migration-only programme %s FK', async (kind) => {
    const u = await target();
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('YR'), name: 'Năm học' } });
    await h.prisma.programmeMaster.create({ data: { academicYearId: year.id, kind, gradeLevel: kind === 'GDDP' ? 10 : null, createdByUserId: u.id } });
    await blocked(u, 'BUSINESS_HISTORY');
    expect(await h.prisma.programmeMaster.count()).toBe(1);
  });
  it('blocks Telegram history without revealing tokens', async () => {
    const u = await target();
    await h.prisma.telegramLinkChallenge.create({ data: { userId: u.id, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60000) } });
    await blocked(u, 'BUSINESS_HISTORY');
    expect(JSON.stringify((await preview(u.id)).body)).not.toContain('a'.repeat(64));
  });
  it('fails closed on non-FK command-result identity references', async () => {
    const u = await target();
    await h.prisma.programmePlanningCommand.create({ data: { actorUserId: admin.id, commandId: crypto.randomUUID(), commandType: 'TEST', fingerprint: 'x', result: { teacherUserId: u.id } } });
    await blocked(u, 'UNVERIFIED_REFERENCE');
  });
  it.each(['username', 'staffCode'] as const)('fails closed on retained teacher source alias matching %s even when its FK points to another account', async (kind) => {
    const u = await target();
    const code = normalizedCode('STAFF');
    await h.prisma.staffProfile.update({ where: { userId: u.id }, data: { staffCode: code } });
    const source = kind === 'username' ? u.username : code;
    const profile = await h.prisma.timetableImportProfile.create({ data: { sourceKey: normalizedCode('IMPORT'), name: 'Kiểm thử', createdByUserId: admin.id } });
    await h.prisma.timetableImportEntityAlias.create({ data: { profileId: profile.id, entityType: 'TEACHER', sourceValue: source, sourceValueKey: source.toUpperCase(), teacherUserId: admin.id, createdByUserId: admin.id } });
    await blocked(u, 'UNVERIFIED_REFERENCE');
    expect(await h.prisma.timetableImportEntityAlias.count({ where: { profileId: profile.id } })).toBe(1);
  });
  it('C: ignores a stale clean preview after protected child is committed', async () => {
    const u = await target();
    expect((await preview(u.id)).body.eligibility).toBe('ELIGIBLE');
    await h.prisma.authSession.create({ data: { userId: u.id, tokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
    await blocked(u, 'SECURITY_HISTORY');
  });
  it.each(['teaching', 'homeroom', 'ppct', 'reporting', 'operational'] as const)('preserves %s history and denies physical deletion', async (kind) => {
    const u = await target();
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('YR'), name: 'Năm học' } });
    const schoolClass = await h.prisma.schoolClass.create({ data: { academicYearId: year.id, code: normalizedCode('CL'), name: 'Lớp', gradeLevel: 10 } });
    const subject = await h.prisma.subject.create({ data: { code: normalizedCode('SU'), name: 'Môn' } });
    if (kind === 'teaching') {
      await h.prisma.teachingAssignment.create({ data: { academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: u.id, validFrom: new Date('2026-09-01') } });
      await blocked(u, 'BUSINESS_HISTORY');
      expect(await h.prisma.teachingAssignment.count({ where: { teacherUserId: u.id } })).toBe(1);
    } else if (kind === 'homeroom') {
      await h.prisma.homeroomAssignment.create({ data: { academicYearId: year.id, schoolClassId: schoolClass.id, teacherUserId: u.id, validFrom: new Date('2026-09-01'), createdByUserId: admin.id } });
      await blocked(u, 'BUSINESS_HISTORY');
      expect(await h.prisma.homeroomAssignment.count({ where: { teacherUserId: u.id } })).toBe(1);
    } else if (kind === 'ppct') {
      const plan = await h.prisma.ppctPlan.create({ data: { academicYearId: year.id, subjectId: subject.id, gradeLevel: 10 } });
      try {
        await h.prisma.ppctVersion.create({ data: { ppctPlanId: plan.id, versionNumber: 1, createdByUserId: u.id } });
        await blocked(u, 'BUSINESS_HISTORY');
        expect(await h.prisma.ppctVersion.count({ where: { createdByUserId: u.id } })).toBe(1);
      } finally { await h.prisma.ppctVersion.deleteMany(); await h.prisma.ppctPlan.deleteMany(); }
    } else if (kind === 'reporting') {
      await h.prisma.reportingStatementSeries.create({ data: { statementProfile: 'TEST', submitterUserId: u.id, academicYearId: year.id, fromCivilDate: new Date('2026-09-01'), toCivilDate: new Date('2026-09-30') } });
      await blocked(u, 'BUSINESS_HISTORY');
      expect(await h.prisma.reportingStatementSeries.count({ where: { submitterUserId: u.id } })).toBe(1);
    } else {
      const calendar = await h.prisma.academicCalendarVersion.create({ data: { academicYearId: year.id, versionNumber: 1, startDate: new Date('2026-09-01'), endDate: new Date('2027-05-31'), officialWeekCount: 1, reserveWeekCount: 0, teachingWeekdays: ['MONDAY'] } });
      try {
        await h.prisma.calendarException.create({ data: { academicYearId: year.id, academicCalendarVersionId: calendar.id, civilDate: new Date('2026-09-01'), scope: 'SCHOOL_WIDE', timeSelector: 'WHOLE_DAY', createdByUserId: u.id, createRequestKey: crypto.randomUUID(), createRequestFingerprint: 'x' } });
        await blocked(u, 'BUSINESS_HISTORY');
        expect(await h.prisma.calendarException.count({ where: { createdByUserId: u.id } })).toBe(1);
      } finally { await h.prisma.calendarException.deleteMany(); }
    }
  });
  it('fails closed on an unknown physical FK rather than trusting its cascade', async () => {
    const u = await target();
    await h.prisma.$executeRaw`ALTER TABLE public.capability_grants ADD CONSTRAINT p5051_unknown_reference FOREIGN KEY (scope_resource_id) REFERENCES public.users(id) ON DELETE CASCADE`;
    try { await blocked(u, 'UNVERIFIED_REFERENCE'); }
    finally { await h.prisma.$executeRaw`ALTER TABLE public.capability_grants DROP CONSTRAINT p5051_unknown_reference`; }
  });
  it('fails closed on a new identity table even when no new FK advertises it', async () => {
    const u = await target();
    await h.prisma.$executeRaw`CREATE TABLE public.p5051_unknown_identity (id uuid PRIMARY KEY, identity_snapshot text)`;
    try {
      const p = await preview(u.id);
      expect(p.body.cleanupCounts).toBeNull();
      expect(p.body.displayName).toBe('Tài khoản thử');
      await blocked(u, 'UNVERIFIED_REFERENCE');
    } finally { await h.prisma.$executeRaw`DROP TABLE public.p5051_unknown_identity`; }
  });
  it('fails closed when RLS could hide retained audit references', async () => {
    const u = await target();
    await h.prisma.auditEvent.create({ data: { actorUserId: u.id, action: 'TEST_HISTORY', entityType: 'User' } });
    await h.prisma.$executeRaw`ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY`;
    await h.prisma.$executeRaw`ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY`;
    try { await blocked(u, 'UNVERIFIED_REFERENCE'); }
    finally {
      await h.prisma.$executeRaw`ALTER TABLE public.audit_events NO FORCE ROW LEVEL SECURITY`;
      await h.prisma.$executeRaw`ALTER TABLE public.audit_events DISABLE ROW LEVEL SECURITY`;
    }
    expect(await h.prisma.auditEvent.count({ where: { actorUserId: u.id } })).toBe(1);
  });
  it.each([{}, { confirmUsername: 1 }, { confirmUsername: '' }, { confirmUsername: ' bad ' }, { confirmUsername: 'wrong' }, { confirmUsername: 'x', eligibility: 'ELIGIBLE' }])('rejects malformed/mismatching confirmation %j', async (body) => {
    const u = await target();
    expect((await admin.agent.delete(`/api/users/${u.id}`).set('Origin', testOrigin).send(body)).status).toBe(400);
    expect(await h.prisma.user.count({ where: { id: u.id } })).toBe(1);
  });
  it('enforces actual endpoint session, BOTH school-wide capabilities, must-change-password and Origin', async () => {
    const u = await target(); const path = `/api/users/${u.id}`;
    expect((await request(h.app.getHttpServer()).delete(path).set('Origin', testOrigin).send({ confirmUsername: u.username })).status).toBe(401);
    for (const capabilityKey of ['USER_MANAGE', 'SYSTEM_ADMIN', undefined]) {
      const actor = await h.actor({ grants: capabilityKey ? [{ capabilityKey }] : [] });
      await h.prisma.staffProfile.update({ where: { userId: actor.id }, data: { positionTitle: 'Hiệu trưởng / Quản trị' } });
      expect((await actor.agent.delete(path).set('Origin', testOrigin).send({ confirmUsername: u.username })).status).toBe(403);
      expect((await actor.agent.get(`${path}/delete-preflight`)).status).toBe(capabilityKey === 'USER_MANAGE' ? 200 : 403);
    }
    const mustChange = await h.actor({ grants: [{ capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'SYSTEM_ADMIN' }], mustChangePassword: true });
    expect((await mustChange.agent.delete(path).set('Origin', testOrigin).send({ confirmUsername: u.username })).status).toBe(403);
    expect((await admin.agent.delete(path).send({ confirmUsername: u.username })).status).toBe(403);
    expect((await admin.agent.delete(path).set('Origin', 'https://invalid.example').send({ confirmUsername: u.username })).status).toBe(403);
    expect((await remove(u)).status).toBe(200);
  });
  it('does not implicitly convert a numeric confirmation even when the canonical username is numeric', async () => {
    const u = await target();
    await h.prisma.user.update({ where: { id: u.id }, data: { username: '12345' } });
    expect((await admin.agent.delete(`/api/users/${u.id}`).set('Origin', testOrigin).send({ confirmUsername: 12345 })).status).toBe(400);
    expect(await h.prisma.user.count({ where: { id: u.id } })).toBe(1);
    expect((await remove({ ...u, username: '12345' })).status).toBe(200);
  });
  it('rolls back the first child removal, User and audit after an injected transaction failure', async () => {
    const u = await target(); await setup(u);
    faultAfterFirstCleanup = true;
    expect((await remove(u)).status).toBe(500);
    expect(await h.prisma.user.count({ where: { id: u.id } })).toBe(1);
    expect(await h.prisma.staffProfile.count({ where: { userId: u.id } })).toBe(1);
    expect(await h.prisma.staffSubject.count({ where: { userId: u.id } })).toBe(1);
    expect(await h.prisma.subjectGroupMembership.count({ where: { userId: u.id } })).toBe(1);
    expect(await h.prisma.auditEvent.count({ where: { action: 'USER_CLEAN_SLATE_DELETED' } })).toBe(0);
  });

  it('A: DELETE holds FOR UPDATE first; a real protected child INSERT waits then fails FK', async () => {
    const u = await target(); const gate = pauseDelete(u.id);
    const deletion = remove(u).then((r) => r);
    await gate.entered.promise;
    const insertion = h.prisma.authSession.create({ data: { userId: u.id, tokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 60000) } }).then(() => 'inserted', (e: unknown) => e);
    await waitForLock(); gate.resume.release();
    expect((await deletion).status).toBe(200);
    expect(await insertion).toMatchObject({ code: 'P2003' });
    expect(await h.prisma.authSession.count({ where: { userId: u.id } })).toBe(0);
  });
  it('B: protected INSERT wins KEY SHARE first; DELETE waits, re-reads committed child and denies', async () => {
    const u = await target(); const inserted = latch(); const commit = latch();
    const insertion = h.prisma.$transaction(async (tx) => {
      await tx.authSession.create({ data: { userId: u.id, tokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
      inserted.release(); await commit.promise;
    });
    await inserted.promise;
    const deletion = remove(u).then((r) => r);
    await waitForLock(); commit.release(); await insertion;
    const denied = await deletion;
    expect(denied.status).toBe(409);
    expect(denied.body.blockers).toContainEqual(expect.objectContaining({ code: 'SECURITY_HISTORY' }));
    expect(await h.prisma.staffProfile.count({ where: { userId: u.id } })).toBe(1);
    expect(await h.prisma.authSession.count({ where: { userId: u.id } })).toBe(1);
  });
  it('indirect A: locked StaffProfile prevents a concurrent retained duty insert from surviving deletion', async () => {
    const u = await target();
    const duty = await h.prisma.additionalDutyDefinition.create({ data: { code: normalizedCode('DUTY'), name: 'Nhiệm vụ', category: 'TEST' } });
    const gate = pauseDelete(u.id);
    const deletion = remove(u).then((r) => r); await gate.entered.promise;
    const insertion = h.prisma.staffAdditionalDutyAssignment.create({ data: {
      staffProfileId: u.profile!.id, dutyDefinitionId: duty.id, scopeType: 'SCHOOL_WIDE', createdByUserId: admin.id,
    } }).then(() => 'inserted', (e: unknown) => e);
    await waitForLock(); gate.resume.release();
    expect((await deletion).status).toBe(200);
    expect(await insertion).toMatchObject({ code: 'P2003' });
    expect(await h.prisma.staffAdditionalDutyAssignment.count()).toBe(0);
  });
  it('indirect B: a duty insert holding Profile KEY SHARE wins first and blocks deletion after commit', async () => {
    const u = await target();
    const duty = await h.prisma.additionalDutyDefinition.create({ data: { code: normalizedCode('DUTY'), name: 'Nhiệm vụ', category: 'TEST' } });
    const inserted = latch(); const commit = latch();
    const insertion = h.prisma.$transaction(async (tx) => {
      await tx.staffAdditionalDutyAssignment.create({ data: {
        staffProfileId: u.profile!.id, dutyDefinitionId: duty.id, scopeType: 'SCHOOL_WIDE', createdByUserId: admin.id,
      } });
      inserted.release(); await commit.promise;
    });
    await inserted.promise;
    const deletion = remove(u).then((r) => r);
    await waitForLock(); commit.release(); await insertion;
    const denied = await deletion;
    expect(denied.status).toBe(409);
    expect(denied.body.blockers).toContainEqual(expect.objectContaining({ code: 'INDIRECT_HISTORY' }));
    expect(await h.prisma.staffProfile.count({ where: { userId: u.id } })).toBe(1);
    expect(await h.prisma.staffAdditionalDutyAssignment.count({ where: { staffProfileId: u.profile!.id } })).toBe(1);
  });
  it('D: concurrent confirmations delete exactly once and retain exactly one audit', async () => {
    const u = await target(); const gate = pauseDelete(u.id);
    const first = remove(u).then((r) => r); await gate.entered.promise;
    const second = remove(u).then((r) => r); await waitForLock(); gate.resume.release();
    expect([(await first).status, (await second).status].sort()).toEqual([200, 404]);
    expect(await h.prisma.auditEvent.count({ where: { action: 'USER_CLEAN_SLATE_DELETED', entityId: u.id } })).toBe(1);
  });
  it.each(['template', 'activation', 'capability', 'session'] as const)('E/extra: DELETE first serializes with real %s write', async (kind) => {
    const u = await target(); const gate = pauseDelete(u.id);
    const deletion = remove(u).then((r) => r); await gate.entered.promise;
    const concurrent = kind === 'template'
      ? admin.agent.post(`/api/users/${u.id}/responsibility-templates/apply`).set('Origin', testOrigin).send({ templateKey: 'TEACHER' }).then((r) => r.status)
      : kind === 'activation'
        ? admin.agent.post(`/api/users/${u.id}/activate`).set('Origin', testOrigin).send({}).then((r) => r.status)
        : h.prisma.$transaction(async (tx) => {
          if (kind === 'capability') await tx.capabilityGrant.create({ data: { userId: u.id, capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', grantedByUserId: admin.id } });
          else await tx.authSession.create({ data: { userId: u.id, tokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
          return 200;
        }).catch((e: unknown) => e);
    await waitForLock(); gate.resume.release();
    expect((await deletion).status).toBe(200);
    if (kind === 'template' || kind === 'activation') expect(await concurrent).toBe(404);
    else expect(await concurrent).toMatchObject({ code: 'P2003' });
    expect(await h.prisma.capabilityGrant.count({ where: { userId: u.id } })).toBe(0);
    expect(await h.prisma.authSession.count({ where: { userId: u.id } })).toBe(0);
  });
  it.each(['template', 'activation'] as const)('E/extra: %s commits first, then deletion preserves all generated grants', async (kind) => {
    const u = await target();
    const path = kind === 'template' ? 'responsibility-templates/apply' : 'activate';
    const result = await admin.agent.post(`/api/users/${u.id}/${path}`).set('Origin', testOrigin).send(kind === 'template' ? { templateKey: 'TEACHER' } : {});
    expect(result.status).toBe(200);
    await blocked(u, 'SECURITY_HISTORY');
    expect(await h.prisma.capabilityGrant.count({ where: { userId: u.id } })).toBeGreaterThan(0);
  });
});
