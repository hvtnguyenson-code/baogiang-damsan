import request from 'supertest';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';

integration('Data Readiness HTTP Integration (PostgreSQL)', () => {
  const h = new Phase01Harness();

  async function clean(): Promise<void> {
    await h.prisma.$executeRawUnsafe('TRUNCATE TABLE "programme_plan_versions" CASCADE');
    await h.prisma.plannedProgrammeOccurrence.deleteMany();
    await h.prisma.programmeTopicItem.deleteMany();
    await h.prisma.programmePlanVersion.deleteMany();
    await h.prisma.programmeMaster.deleteMany();
    await h.prisma.historicalTeachingImportRow.deleteMany();
    await h.prisma.historicalTeachingImportBatch.deleteMany();
    await h.prisma.ppctClassAssociation.deleteMany();
    await h.prisma.ppctVersion.deleteMany();
    await h.prisma.ppctPlan.deleteMany();
    await h.prisma.timetableEntry.deleteMany();
    await h.prisma.timetableVersion.deleteMany();
    await h.clean();
  }

  beforeAll(async () => h.start());
  afterAll(async () => {
    try {
      await clean();
    } finally {
      await h.stop();
    }
  });

  beforeEach(async () => {
    await clean();
    await h.seedCapabilities([
      { key: 'APPROVAL_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
      { key: 'APPROVAL_VICE_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'PPCT_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'USER_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'TEACHER_BASE', scopes: ['PERSONAL'] },
    ]);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(h.app.getHttpServer()).get('/api/data-readiness/summary');
    expect(res.status).toBe(401);
  });

  it('rejects teacher-only account with 403 Forbidden', async () => {
    const teacher = await h.actor({ grants: [{ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }] });
    const res = await teacher.agent.get('/api/data-readiness/summary');
    expect(res.status).toBe(403);
  });

  it('allows Principal and returns all 5 domains in summary', async () => {
    const principal = await h.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL' }] });
    const year = await h.prisma.academicYear.create({
      data: { code: normalizedCode('Y'), name: '2026-2027' },
    });

    const res = await principal.agent.get(`/api/data-readiness/summary?academicYearId=${year.id}`);
    expect(res.status).toBe(200);
    expect(res.body.academicYear.id).toBe(year.id);
    expect(res.body.domains).toHaveLength(5);
    const keys = res.body.domains.map((d: { key: string }) => d.key);
    expect(keys).toContain('TKB');
    expect(keys).toContain('PPCT');
    expect(keys).toContain('HISTORICAL_TEACHING');
    expect(keys).toContain('GDDP');
    expect(keys).toContain('HDTN_HN');
  });

  it('allows Timetable Manager (TIMETABLE_MANAGE / SCHOOL_WIDE)', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const year = await h.prisma.academicYear.create({
      data: { code: normalizedCode('Y'), name: '2026-2027' },
    });

    const res = await manager.agent.get(`/api/data-readiness/summary?academicYearId=${year.id}`);
    expect(res.status).toBe(200);
    expect(res.body.overallStatus).toBeDefined();
  });

  async function fixture() {
    const actor = await h.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL' }] });
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: 'Readiness test' } });
    return { actor, year };
  }
  async function summary(f: Awaited<ReturnType<typeof fixture>>, key: string) {
    const res = await f.actor.agent.get(`/api/data-readiness/summary?academicYearId=${f.year.id}`);
    expect(res.status).toBe(200);
    return res.body.domains.find((d: { key: string }) => d.key === key);
  }
  async function calendar(f: Awaited<ReturnType<typeof fixture>>) {
    return h.prisma.academicCalendarVersion.create({ data: { academicYearId: f.year.id, versionNumber: 1, startDate: new Date('2026-09-01'), endDate: new Date('2027-06-01'), officialWeekCount: 35, reserveWeekCount: 2, teachingWeekdays: ['MONDAY'], isActive: true, activatedAt: new Date() } });
  }
  async function policy(f: Awaited<ReturnType<typeof fixture>>, date = '2026-09-01', effectiveFrom = '2026-01-01') {
    const stream = await h.prisma.businessPolicyStream.create({ data: { familyKey: 'OPERATIONAL_START', resourceKind: 'ACADEMIC_YEAR', academicYearId: f.year.id } });
    return h.prisma.businessPolicyVersion.create({ data: { streamId: stream.id, versionNumber: 1, status: 'PUBLISHED', validatorVersion: 'v1', payload: { operationalStartDate: date }, effectiveFrom: new Date(effectiveFrom), createdByUserId: f.actor.id, publishedByUserId: f.actor.id, publishedAt: new Date() } });
  }

  it('returns 404 for an unknown explicit year instead of silently selecting an existing year', async () => {
    const f = await fixture();
    expect((await f.actor.agent.get(`/api/data-readiness/summary?academicYearId=${crypto.randomUUID()}`)).status).toBe(404);
  });
  it('history requires both effective policy and active calendar; valid day-one remains READY', async () => {
    const f = await fixture();
    expect((await summary(f, 'HISTORICAL_TEACHING')).status).toBe('NOT_READY');
    await policy(f);
    expect((await summary(f, 'HISTORICAL_TEACHING')).status).toBe('NOT_READY');
    await calendar(f);
    expect((await summary(f, 'HISTORICAL_TEACHING')).status).toBe('READY');
  });
  it('history cannot use a future published policy before it becomes effective', async () => {
    const f = await fixture(); await calendar(f); await policy(f, '2026-09-01', '2099-01-01');
    const item = await summary(f, 'HISTORICAL_TEACHING');
    expect(item.status).toBe('NOT_READY');
    expect(item.findings[0].code).toBe('POLICY_NOT_CONFIGURED');
  });
  it('history rejects corrupt policy payload through the canonical resolver', async () => {
    const f = await fixture(); await calendar(f); await policy(f, 'not-a-date');
    const item = await summary(f, 'HISTORICAL_TEACHING');
    expect(item.status).toBe('NOT_READY');
    expect(item.findings[0].code).toBe('POLICY_CORRUPT');
  });

  it.each(['GDDP', 'HDTN_HN'] as const)('%s requires an issued plan for every retained master', async (kind) => {
    const f = await fixture();
    const masters = [];
    for (const gradeLevel of kind === 'GDDP' ? [10, 11, 12] : [null]) {
      masters.push(await h.prisma.programmeMaster.create({ data: { academicYearId: f.year.id, kind, gradeLevel, createdByUserId: f.actor.id } }));
    }
    for (const master of masters.slice(0, -1)) {
      await h.prisma.programmePlanVersion.create({ data: { programmeMasterId: master.id, versionNumber: 1, status: 'PUBLISHED', createdByUserId: f.actor.id, publishedByUserId: f.actor.id, publishedAt: new Date() } });
    }
    expect((await summary(f, kind)).status).toBe('NOT_READY');
    const last = masters[masters.length - 1];
    const version = await h.prisma.programmePlanVersion.create({ data: { programmeMasterId: last.id, versionNumber: 1, status: 'DRAFT', createdByUserId: f.actor.id } });
    expect((await summary(f, kind)).status).toBe('ATTENTION_REQUIRED');
    await h.prisma.programmePlanVersion.update({ where: { id: version.id }, data: { status: 'PUBLISHED', publishedByUserId: f.actor.id, publishedAt: new Date() } });
    expect((await summary(f, kind)).status).toBe('READY');
  });

  it('PPCT cannot use plan counts to hide a missing required grade or unissued version', async () => {
    const f = await fixture();
    const subject = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Toán' } });
    const schoolClass = await h.prisma.schoolClass.create({ data: { academicYearId: f.year.id, code: normalizedCode('C'), name: '11A', gradeLevel: 11 } });
    await h.prisma.teachingAssignment.create({ data: { academicYearId: f.year.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: f.actor.id, validFrom: new Date('2026-09-01') } });
    for (const gradeLevel of [10, 12]) {
      await h.prisma.ppctPlan.create({ data: { academicYearId: f.year.id, subjectId: subject.id, gradeLevel, versions: { create: { versionNumber: 1, status: 'PUBLISHED', createdByUserId: f.actor.id, publishedByUserId: f.actor.id, publishedAt: new Date() } } } });
    }
    let item = await summary(f, 'PPCT');
    expect(item.status).toBe('NOT_READY'); expect(item.stats.missingSubjectCount).toBe(1);
    const plan = await h.prisma.ppctPlan.create({ data: { academicYearId: f.year.id, subjectId: subject.id, gradeLevel: 11 } });
    item = await summary(f, 'PPCT');
    expect(item.status).toBe('NOT_READY'); expect(item.stats.unissuedCount).toBe(1);
    const version = await h.prisma.ppctVersion.create({ data: { ppctPlanId: plan.id, versionNumber: 1, status: 'DRAFT', createdByUserId: f.actor.id } });
    expect((await summary(f, 'PPCT')).status).toBe('ATTENTION_REQUIRED');
    await h.prisma.ppctVersion.update({ where: { id: version.id }, data: { status: 'PUBLISHED', publishedByUserId: f.actor.id, publishedAt: new Date() } });
    await h.prisma.ppctClassAssociation.create({ data: { academicYearId: f.year.id, schoolClassId: schoolClass.id, subjectId: subject.id, gradeLevel: 11, ppctPlanId: plan.id, ppctVersionId: version.id, curricularProfile: 'CORE_ONLY', effectiveFrom: new Date('2026-09-01'), createdByUserId: f.actor.id } });
    expect((await summary(f, 'PPCT')).status).toBe('READY');
  });
});
