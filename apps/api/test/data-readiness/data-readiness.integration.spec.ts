import request from 'supertest';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';

integration('Data Readiness HTTP Integration (PostgreSQL)', () => {
  const h = new Phase01Harness();

  async function clean(): Promise<void> {
    await h.prisma.programmePlanVersion.deleteMany();
    await h.prisma.plannedProgrammeOccurrence.deleteMany();
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
});
