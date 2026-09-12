import { CatalogStatus, UserStatus } from '@prisma/client';
import request from 'supertest';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';

integration('PPCT administration workspace options (PostgreSQL integration)', () => {
  const h = new Phase01Harness();

  async function clean(): Promise<void> {
    await h.prisma.ppctItemLineage.deleteMany();
    await h.prisma.ppctClassAssociation.deleteMany();
    await h.prisma.ppctItemRevision.deleteMany();
    await h.prisma.ppctItem.deleteMany();
    await h.prisma.ppctVersion.deleteMany();
    await h.prisma.ppctPlan.deleteMany();
    await h.prisma.calendarInterruption.deleteMany();
    await h.prisma.semester.deleteMany();
    await h.prisma.academicWeekSegment.deleteMany();
    await h.prisma.academicWeek.deleteMany();
    await h.prisma.academicCalendarVersion.deleteMany();
    await h.prisma.schoolClass.deleteMany();
    await h.prisma.academicYear.deleteMany();
    await h.prisma.subject.deleteMany();
    await h.clean();
  }

  beforeAll(async () => h.start());
  afterAll(async () => {
    try { await clean(); } finally { await h.stop(); }
  });
  beforeEach(async () => {
    await clean();
    await h.seedCapabilities([
      { key: 'PPCT_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'ACADEMIC_STRUCTURE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
    ]);
  });

  it('1. unauthenticated requests return 401', async () => {
    await request(h.app.getHttpServer())
      .get('/api/ppct-options/academic-years')
      .expect(401);

    await request(h.app.getHttpServer())
      .get(`/api/ppct-options/academic-years/${crypto.randomUUID()}`)
      .expect(401);
  });

  it('2. authenticated user lacking PPCT_MANAGE returns 403', async () => {
    const actor = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE', scopeType: 'SCHOOL_WIDE' }] });
    await actor.agent.get('/api/ppct-options/academic-years').expect(403);
  });

  it('3. SYSTEM_ADMIN alone without PPCT_MANAGE returns 403', async () => {
    const actor = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN', scopeType: 'SCHOOL_WIDE' }] });
    await actor.agent.get('/api/ppct-options/academic-years').expect(403);
  });

  it('4. PPCT_MANAGE / SUBJECT accesses academic-year options without SUBJECT_MANAGE or ACADEMIC_STRUCTURE_MANAGE', async () => {
    const s = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Toán', status: CatalogStatus.ACTIVE } });
    const y = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });

    const actor = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: s.id }],
    });

    const res = await actor.agent.get('/api/ppct-options/academic-years').expect(200);
    expect(res.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: y.id, code: y.code, name: y.name }),
      ]),
    );
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('5-8. PPCT_MANAGE / SUBJECT accesses workspace options, filters exact granted subjects, and does not leak unrelated active subjects', async () => {
    const s1 = await h.prisma.subject.create({ data: { code: normalizedCode('S1'), name: 'Môn Được Cấp 1', status: CatalogStatus.ACTIVE } });
    const s2 = await h.prisma.subject.create({ data: { code: normalizedCode('S2'), name: 'Môn Được Cấp 2', status: CatalogStatus.ACTIVE } });
    const s3 = await h.prisma.subject.create({ data: { code: normalizedCode('S3'), name: 'Môn Không Được Cấp', status: CatalogStatus.ACTIVE } });

    const y = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });
    const c1 = await h.prisma.schoolClass.create({ data: { academicYearId: y.id, code: normalizedCode('C1'), name: '10A1', gradeLevel: 10, status: CatalogStatus.ACTIVE } });

    // Test 6: exact single subject grant -> only exact that subject
    const actorSingle = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: s1.id }],
    });
    const resSingle = await actorSingle.agent.get(`/api/ppct-options/academic-years/${y.id}`).expect(200);
    expect(resSingle.body.academicYear).toEqual({ id: y.id, code: y.code, name: y.name });
    expect(resSingle.body.classes).toEqual([
      { id: c1.id, code: c1.code, name: c1.name, gradeLevel: 10, status: 'ACTIVE' },
    ]);
    expect(resSingle.body.subjects).toEqual([
      { id: s1.id, code: s1.code, name: s1.name, status: 'ACTIVE' },
    ]);
    // Test 8: s3 is not leaked
    expect(resSingle.body.subjects.some((s: { id: string }) => s.id === s3.id)).toBe(false);

    // Test 7: two SUBJECT grants -> exactly two subjects
    const actorDouble = await h.actor({
      grants: [
        { capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: s1.id },
        { capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: s2.id },
      ],
    });
    const resDouble = await actorDouble.agent.get(`/api/ppct-options/academic-years/${y.id}`).expect(200);
    expect(resDouble.body.subjects.map((s: { id: string }) => s.id).sort()).toEqual([s1.id, s2.id].sort());
    expect(resDouble.body.subjects.some((s: { id: string }) => s.id === s3.id)).toBe(false);
  });

  it('9. inactive subject grant does not appear in options', async () => {
    const sInactive = await h.prisma.subject.create({ data: { code: normalizedCode('SI'), name: 'Môn Ẩn', status: CatalogStatus.INACTIVE } });
    const sActive = await h.prisma.subject.create({ data: { code: normalizedCode('SA'), name: 'Môn Hiện', status: CatalogStatus.ACTIVE } });
    const y = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });

    const actor = await h.actor({
      grants: [
        { capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: sInactive.id },
        { capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: sActive.id },
      ],
    });

    const res = await actor.agent.get(`/api/ppct-options/academic-years/${y.id}`).expect(200);
    expect(res.body.subjects).toEqual([
      { id: sActive.id, code: sActive.code, name: sActive.name, status: 'ACTIVE' },
    ]);
  });

  it('10. revoked or expired PPCT grant does not grant access (returns 403)', async () => {
    const s = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Toán', status: CatalogStatus.ACTIVE } });
    const y = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });

    // Revoked grant
    const revokedActor = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: s.id }],
    });
    await h.prisma.capabilityGrant.updateMany({
      where: { userId: revokedActor.id },
      data: { revokedAt: new Date() },
    });
    await revokedActor.agent.get('/api/ppct-options/academic-years').expect(403);
    await revokedActor.agent.get(`/api/ppct-options/academic-years/${y.id}`).expect(403);

    // Expired grant
    const validFrom = new Date(Date.now() - 2 * 3600_000);
    const validUntil = new Date(Date.now() - 3600_000);
    const expiredActor = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: s.id }],
    });
    await h.prisma.capabilityGrant.updateMany({
      where: { userId: expiredActor.id },
      data: { validFrom, validUntil },
    });
    await expiredActor.agent.get('/api/ppct-options/academic-years').expect(403);
    await expiredActor.agent.get(`/api/ppct-options/academic-years/${y.id}`).expect(403);
  });

  it('11. PPCT_MANAGE / SCHOOL_WIDE returns all eligible active subjects', async () => {
    const s1 = await h.prisma.subject.create({ data: { code: normalizedCode('S1'), name: 'Môn A', status: CatalogStatus.ACTIVE } });
    const s2 = await h.prisma.subject.create({ data: { code: normalizedCode('S2'), name: 'Môn B', status: CatalogStatus.ACTIVE } });
    const sInactive = await h.prisma.subject.create({ data: { code: normalizedCode('SI'), name: 'Môn C Inactive', status: CatalogStatus.INACTIVE } });
    const y = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });

    const actor = await h.actor({ grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SCHOOL_WIDE' }] });
    const res = await actor.agent.get(`/api/ppct-options/academic-years/${y.id}`).expect(200);

    const returnedIds = res.body.subjects.map((s: { id: string }) => s.id);
    expect(returnedIds).toContain(s1.id);
    expect(returnedIds).toContain(s2.id);
    expect(returnedIds).not.toContain(sInactive.id);
  });

  it('12. classes returned belong strictly to the requested academic year', async () => {
    const y1 = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y1'), name: '2025-2026' } });
    const y2 = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y2'), name: '2026-2027' } });

    const c1 = await h.prisma.schoolClass.create({ data: { academicYearId: y1.id, code: normalizedCode('C1'), name: '10A1', gradeLevel: 10, status: CatalogStatus.ACTIVE } });
    const c2 = await h.prisma.schoolClass.create({ data: { academicYearId: y2.id, code: normalizedCode('C2'), name: '11B1', gradeLevel: 11, status: CatalogStatus.ACTIVE } });

    const actor = await h.actor({ grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SCHOOL_WIDE' }] });

    const res1 = await actor.agent.get(`/api/ppct-options/academic-years/${y1.id}`).expect(200);
    expect(res1.body.classes.map((c: { id: string }) => c.id)).toEqual([c1.id]);

    const res2 = await actor.agent.get(`/api/ppct-options/academic-years/${y2.id}`).expect(200);
    expect(res2.body.classes.map((c: { id: string }) => c.id)).toEqual([c2.id]);
  });

  it('13. orders academic years, classes, and subjects deterministically', async () => {
    await h.prisma.academicYear.create({ data: { code: '2026-B', name: 'Năm B' } });
    const yA = await h.prisma.academicYear.create({ data: { code: '2026-A', name: 'Năm A' } });

    const c12 = await h.prisma.schoolClass.create({ data: { academicYearId: yA.id, code: '12B', name: '12B', gradeLevel: 12, status: CatalogStatus.ACTIVE } });
    const c10B = await h.prisma.schoolClass.create({ data: { academicYearId: yA.id, code: '10B', name: '10B', gradeLevel: 10, status: CatalogStatus.ACTIVE } });
    const c10A = await h.prisma.schoolClass.create({ data: { academicYearId: yA.id, code: '10A', name: '10A', gradeLevel: 10, status: CatalogStatus.ACTIVE } });

    const sB = await h.prisma.subject.create({ data: { code: 'SB', name: 'Văn học', status: CatalogStatus.ACTIVE } });
    const sA = await h.prisma.subject.create({ data: { code: 'SA', name: 'Hóa học', status: CatalogStatus.ACTIVE } });

    const actor = await h.actor({ grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SCHOOL_WIDE' }] });

    const resYears = await actor.agent.get('/api/ppct-options/academic-years').expect(200);
    const codes = resYears.body.items.map((y: { code: string }) => y.code);
    const indexA = codes.indexOf('2026-A');
    const indexB = codes.indexOf('2026-B');
    expect(indexA).toBeLessThan(indexB);

    const resWorkspace = await actor.agent.get(`/api/ppct-options/academic-years/${yA.id}`).expect(200);
    expect(resWorkspace.body.classes.map((c: { id: string }) => c.id)).toEqual([c10A.id, c10B.id, c12.id]);
    expect(resWorkspace.body.subjects.map((s: { id: string }) => s.id)).toEqual([sA.id, sB.id]);
  });

  it('14. unknown academicYear returns 404', async () => {
    const actor = await h.actor({ grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SCHOOL_WIDE' }] });
    await actor.agent.get(`/api/ppct-options/academic-years/${crypto.randomUUID()}`).expect(404);
  });

  it('15. generic /subjects still requires SUBJECT_MANAGE / SCHOOL_WIDE (denies PPCT_MANAGE)', async () => {
    const s = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Toán', status: CatalogStatus.ACTIVE } });
    const ppctOnly = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: s.id }],
    });
    await ppctOnly.agent.get('/api/subjects').expect(403);

    const ppctSchool = await h.actor({ grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SCHOOL_WIDE' }] });
    await ppctSchool.agent.get('/api/subjects').expect(403);
  });

  it('16. generic /academic-years still requires ACADEMIC_STRUCTURE_MANAGE / SCHOOL_WIDE (denies PPCT_MANAGE)', async () => {
    const y = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });
    const s = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Toán', status: CatalogStatus.ACTIVE } });

    const ppctOnly = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: s.id }],
    });
    await ppctOnly.agent.get('/api/academic-years').expect(403);
    await ppctOnly.agent.get(`/api/academic-years/${y.id}/classes`).expect(403);

    const ppctSchool = await h.actor({ grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SCHOOL_WIDE' }] });
    await ppctSchool.agent.get('/api/academic-years').expect(403);
    await ppctSchool.agent.get(`/api/academic-years/${y.id}/classes`).expect(403);
  });

  it('17. disabled authenticated session is rejected with 401', async () => {
    const s = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Toán', status: CatalogStatus.ACTIVE } });
    const y = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });

    const disabledActor = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: s.id }],
    });
    await h.prisma.user.update({ where: { id: disabledActor.id }, data: { status: UserStatus.DISABLED } });
    await disabledActor.agent.get('/api/ppct-options/academic-years').expect(401);
    await disabledActor.agent.get(`/api/ppct-options/academic-years/${y.id}`).expect(401);
  });

  it('18. locked authenticated session is rejected with 401', async () => {
    const s = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Toán', status: CatalogStatus.ACTIVE } });
    const y = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });

    const lockedActor = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: s.id }],
    });
    await h.prisma.user.update({ where: { id: lockedActor.id }, data: { lockedUntil: new Date(Date.now() + 3600_000) } });
    await lockedActor.agent.get('/api/ppct-options/academic-years').expect(401);
    await lockedActor.agent.get(`/api/ppct-options/academic-years/${y.id}`).expect(401);
  });
});
