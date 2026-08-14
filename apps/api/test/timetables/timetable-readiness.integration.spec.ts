import { CatalogStatus, PpctVersionStatus, Prisma, UserStatus } from '@prisma/client';
import { PpctAssociationReadService, PpctReadClient } from '../../src/ppct/ppct-association-read.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TimetableReadinessService } from '../../src/timetables/timetable-readiness.service';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

integration('deterministic timetable readiness read model (PostgreSQL)', () => {
  const h = new Phase01Harness();

  async function clean(): Promise<void> {
    await h.prisma.ppctItemLineage.deleteMany();
    await h.prisma.ppctClassAssociation.deleteMany();
    await h.prisma.ppctItemRevision.deleteMany();
    await h.prisma.ppctItem.deleteMany();
    await h.prisma.ppctVersion.deleteMany();
    await h.prisma.ppctPlan.deleteMany();
    await h.clean();
  }

  beforeAll(async () => h.start());
  afterAll(async () => {
    try { await clean(); } finally { await h.stop(); }
  });
  beforeEach(async () => {
    await clean();
    await h.seedCapabilities([
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'PPCT_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  });

  async function fixture(actorUserId: string) {
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });
    const calendar = await h.prisma.academicCalendarVersion.create({ data: {
      academicYearId: year.id, versionNumber: 1, startDate: new Date('2026-09-01Z'), endDate: new Date('2027-05-31Z'),
      officialWeekCount: 1, reserveWeekCount: 1, teachingWeekdays: ['MONDAY', 'TUESDAY'], isActive: false,
    } });
    const reserveWeek = await h.prisma.academicWeek.create({ data: {
      calendarVersionId: calendar.id, kind: 'RESERVE', reserveWeekNumber: 1, displayLabel: 'DP1', sortOrder: 1,
    } });
    const officialWeek = await h.prisma.academicWeek.create({ data: {
      calendarVersionId: calendar.id, kind: 'OFFICIAL', officialWeekNumber: 1, displayLabel: 'T1', sortOrder: 2,
    } });
    await h.prisma.academicWeekSegment.createMany({ data: [
      { academicWeekId: reserveWeek.id, calendarVersionId: calendar.id, label: 'DP1a', segmentOrder: 1, startDate: new Date('2026-09-07Z'), endDate: new Date('2026-09-07Z') },
      { academicWeekId: reserveWeek.id, calendarVersionId: calendar.id, label: 'DP1b', segmentOrder: 2, startDate: new Date('2026-09-08Z'), endDate: new Date('2026-09-08Z') },
      { academicWeekId: officialWeek.id, calendarVersionId: calendar.id, label: 'T1', segmentOrder: 1, startDate: new Date('2026-09-21Z'), endDate: new Date('2026-09-21Z') },
    ] });
    await h.prisma.calendarInterruption.create({ data: {
      calendarVersionId: calendar.id, code: 'GAP', name: 'Gián đoạn toàn cục',
      startDate: new Date('2026-09-09Z'), endDate: new Date('2026-09-20Z'),
    } });
    const schoolClass = await h.prisma.schoolClass.create({ data: {
      academicYearId: year.id, code: normalizedCode('C'), name: '10A1', gradeLevel: 10, status: CatalogStatus.ACTIVE,
    } });
    const subject = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Toán', status: CatalogStatus.ACTIVE } });
    const teacher = await h.prisma.user.create({ data: {
      username: `teacher-${crypto.randomUUID().slice(0, 8)}`,
      passwordHash: await h.passwords.hash('TeacherPassword9'), status: UserStatus.ACTIVE, mustChangePassword: false,
      profile: { create: { displayName: 'Giáo viên', isTeachingStaff: true } },
    } });
    const assignment = await h.prisma.teachingAssignment.create({ data: {
      academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: teacher.id,
      validFrom: new Date('2026-09-01Z'), validUntil: new Date('2027-05-31Z'),
    } });
    const mondaySlot = await h.prisma.timeSlotDefinition.create({ data: {
      academicYearId: year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 1, revision: 1,
      displayLabel: 'Tiết 1', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z'),
      isActive: true, allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false,
    } });
    const tuesdaySlot = await h.prisma.timeSlotDefinition.create({ data: {
      academicYearId: year.id, weekday: 'TUESDAY', session: 'MORNING', ordinal: 1, revision: 1,
      displayLabel: 'Tiết 1', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z'),
      isActive: true, allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false,
    } });
    const timetable = await h.prisma.timetableVersion.create({ data: {
      academicYearId: year.id, versionNumber: 1, status: 'VALIDATED', calendarVersionId: calendar.id,
      effectiveAcademicWeekId: reserveWeek.id, effectiveFrom: new Date('2026-09-07Z'), createdByUserId: actorUserId,
      validatedByUserId: actorUserId, validatedAt: new Date('2026-08-14T00:00:00Z'),
    } });
    await h.prisma.timetableEntry.createMany({ data: [
      {
        timetableVersionId: timetable.id, academicYearId: year.id, weekday: 'MONDAY', timeSlotDefinitionId: mondaySlot.id,
        schoolClassId: schoolClass.id, subjectId: subject.id, teachingAssignmentId: assignment.id, teacherUserId: teacher.id,
      },
      {
        timetableVersionId: timetable.id, academicYearId: year.id, weekday: 'TUESDAY', timeSlotDefinitionId: tuesdaySlot.id,
        schoolClassId: schoolClass.id, subjectId: subject.id, teachingAssignmentId: assignment.id, teacherUserId: teacher.id,
      },
    ] });
    const plan = await h.prisma.ppctPlan.create({ data: { academicYearId: year.id, subjectId: subject.id, gradeLevel: 10 } });
    const ppctVersion = await h.prisma.ppctVersion.create({ data: {
      ppctPlanId: plan.id, versionNumber: 1, status: PpctVersionStatus.PUBLISHED, createdByUserId: actorUserId,
      publishedByUserId: actorUserId, publishedAt: new Date('2026-08-14T00:00:00Z'),
    } });
    const item = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id } });
    await h.prisma.ppctItemRevision.create({ data: {
      ppctVersionId: ppctVersion.id, ppctPlanId: plan.id, ppctItemId: item.id,
      sequence: 1, title: 'Bài 1', lessonType: 'Lý thuyết',
    } });
    const association = await h.prisma.ppctClassAssociation.create({ data: {
      academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, gradeLevel: 10,
      ppctPlanId: plan.id, ppctVersionId: ppctVersion.id, effectiveFrom: new Date('2026-09-01Z'),
      effectiveUntil: null, createdByUserId: actorUserId,
    } });
    return { year, calendar, reserveWeek, schoolClass, subject, teacher, timetable, plan, ppctVersion, association };
  }

  it('enforces TIMETABLE_MANAGE/SCHOOL_WIDE exactly and does not require PPCT_MANAGE or CSRF (A15, A16)', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const f = await fixture(manager.id);
    const ppctOnly = await h.actor({ grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: f.subject.id }] });
    const noGrant = await h.actor();
    const systemAdmin = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    const wrongScope = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE', scopeType: 'PERSONAL' }] });
    const route = `/api/timetable-versions/${f.timetable.id}/readiness?from=2026-09-07&to=2026-09-21`;
    const allowed = await manager.agent.get(route);
    expect(allowed.status).toBe(200);
    expect(allowed.body.result).toBe('PASS');
    for (const denied of [ppctOnly, noGrant, systemAdmin, wrongScope]) {
      expect((await denied.agent.get(route)).status).toBe(403);
    }
  });

  it('validates the explicit finite range and DRAFT/404 semantics (A1, A3, A4)', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const f = await fixture(manager.id);
    const base = `/api/timetable-versions/${f.timetable.id}/readiness`;
    for (const query of ['', '?from=2026-09-07', '?to=2026-09-21', '?from=2026-02-30&to=2026-09-21', '?from=2026-09-21&to=2026-09-07', '?from=2026-09-06&to=2026-09-21', '?from=2026-09-07&to=2027-06-01']) {
      expect((await manager.agent.get(`${base}${query}`)).status).toBe(400);
    }
    await h.prisma.timetableVersion.update({ where: { id: f.timetable.id }, data: { status: 'DRAFT', validatedAt: null, validatedByUserId: null } });
    expect((await manager.agent.get(`${base}?from=2026-09-07&to=2026-09-21`)).status).toBe(409);
    expect((await manager.agent.get(`/api/timetable-versions/${crypto.randomUUID()}/readiness?from=2026-09-07&to=2026-09-21`)).status).toBe(404);
  });

  it('keeps one PostgreSQL RepeatableRead snapshot across timetable, calendar and PPCT reads', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const f = await fixture(manager.id);
    const appPrisma = h.app.get(PrismaService);
    const associationRead = h.app.get(PpctAssociationReadService);
    const readerReached = deferred();
    const mutationCommitted = deferred();
    let evaluationTransactionClient: Prisma.TransactionClient | undefined;
    let associationTransactionClient: PpctReadClient | undefined;
    const originalFind = associationRead.findOverlappingRange.bind(associationRead);
    const readSpy = jest.spyOn(associationRead, 'findOverlappingRange').mockImplementationOnce(async (db, streams, from, to) => {
      associationTransactionClient = db;
      readerReached.resolve();
      await mutationCommitted.promise;
      return originalFind(db, streams, from, to);
    });
    const capturingPrisma = {
      $transaction: <T>(
        callback: (tx: Prisma.TransactionClient) => Promise<T>,
        options: { isolationLevel: Prisma.TransactionIsolationLevel },
      ) => appPrisma.$transaction((tx) => {
        evaluationTransactionClient = tx;
        return callback(tx);
      }, options),
    } as unknown as PrismaService;
    const readiness = new TimetableReadinessService(capturingPrisma, associationRead);
    const query = { from: '2026-09-07', to: '2026-09-21' };
    let inFlight: Promise<Awaited<ReturnType<TimetableReadinessService['evaluate']>>> | undefined;

    try {
      inFlight = readiness.evaluate(f.timetable.id, query);
      await readerReached.promise;
      expect(evaluationTransactionClient).toBeDefined();
      expect(associationTransactionClient).toBe(evaluationTransactionClient);

      await h.prisma.ppctClassAssociation.delete({ where: { id: f.association.id } });
      mutationCommitted.resolve();

      const snapshotResponse = await inFlight;
      expect(snapshotResponse.result).toBe('PASS');
      expect(snapshotResponse.provenance.ppctClassAssociationIds).toEqual([f.association.id]);

      const afterCommitResponse = await readiness.evaluate(f.timetable.id, query);
      expect(afterCommitResponse.result).toBe('FAIL');
      expect(afterCommitResponse.findings.map((finding) => finding.code)).toEqual([
        'PPCT_ASSOCIATION_MISSING',
        'PPCT_ASSOCIATION_MISSING',
        'PPCT_ASSOCIATION_MISSING',
      ]);
    } finally {
      mutationCommitted.resolve();
      readSpy.mockRestore();
      await inFlight?.catch(() => undefined);
    }
  });

  it('uses the exact retained inactive calendar instead of a different active calendar head', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const f = await fixture(manager.id);
    const currentCalendar = await h.prisma.academicCalendarVersion.create({ data: {
      academicYearId: f.year.id, versionNumber: 2, startDate: new Date('2026-09-01Z'), endDate: new Date('2027-05-31Z'),
      officialWeekCount: 1, reserveWeekCount: 0, teachingWeekdays: ['WEDNESDAY'], isActive: true,
      activatedAt: new Date('2026-08-15T00:00:00Z'),
    } });
    const currentWeek = await h.prisma.academicWeek.create({ data: {
      calendarVersionId: currentCalendar.id, kind: 'OFFICIAL', officialWeekNumber: 1, displayLabel: 'Current T1', sortOrder: 1,
    } });
    await h.prisma.academicWeekSegment.create({ data: {
      academicWeekId: currentWeek.id, calendarVersionId: currentCalendar.id, label: 'Current only', segmentOrder: 1,
      startDate: new Date('2026-09-09Z'), endDate: new Date('2026-09-09Z'),
    } });

    const response = await manager.agent.get(
      `/api/timetable-versions/${f.timetable.id}/readiness?from=2026-09-07&to=2026-09-21`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      result: 'PASS',
      provenance: {
        academicCalendarVersionId: f.calendar.id,
        ppctClassAssociationIds: [f.association.id],
      },
    });
    expect(response.body.provenance.academicCalendarVersionId).not.toBe(currentCalendar.id);
    expect(response.body.findings).toEqual([]);
  });

  it('uses exact retained segments and binding history, ignores master drift/capacity, and recomputes (A5-A14)', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const f = await fixture(manager.id);
    const route = `/api/timetable-versions/${f.timetable.id}/readiness?from=2026-09-07&to=2026-09-21`;
    const draft = await h.prisma.timetableVersion.update({
      where: { id: f.timetable.id },
      data: { status: 'DRAFT', validatedAt: null, validatedByUserId: null },
    });
    const validation = await manager.agent.post(`/api/timetable-versions/${f.timetable.id}/validate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: draft.updatedAt.toISOString() });
    expect(validation.status).toBe(200);
    expect(validation.body).toMatchObject({ valid: true, statusAfter: 'VALIDATED' });

    const first = await manager.agent.get(route);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      result: 'PASS',
      scope: { affectedStreams: [{ schoolClassId: f.schoolClass.id, subjectId: f.subject.id }] },
      provenance: { academicCalendarVersionId: f.calendar.id, ppctClassAssociationIds: [f.association.id], ppctVersionIds: [f.ppctVersion.id] },
    });
    expect(first.body.dimensions).toContainEqual({ key: 'PPCT_CAPACITY', state: 'NOT_ASSESSED', required: false });
    expect(first.body.findings).toEqual([]);

    await h.prisma.user.update({ where: { id: f.teacher.id }, data: { status: UserStatus.DISABLED } });
    await h.prisma.academicCalendarVersion.update({ where: { id: f.calendar.id }, data: { isActive: false } });
    const afterMasterDrift = await manager.agent.get(route);
    expect(afterMasterDrift.status).toBe(200);
    expect(afterMasterDrift.body.result).toBe('PASS');
    expect(afterMasterDrift.body.dimensions).toEqual(expect.arrayContaining([
      { key: 'NORMAL_BASE_TIMETABLE_FOUNDATION', state: 'PASS', required: true },
      { key: 'PPCT_ASSOCIATION_BINDING', state: 'PASS', required: true },
    ]));
    expect(afterMasterDrift.body.findings).toEqual([]);

    await h.prisma.ppctClassAssociation.delete({ where: { id: f.association.id } });
    const second = await manager.agent.get(route);
    expect(second.status).toBe(200);
    expect(second.body.result).toBe('FAIL');
    expect(second.body.findings).toEqual([
      expect.objectContaining({ code: 'PPCT_ASSOCIATION_MISSING', date: '2026-09-07', severity: 'BLOCKER' }),
      expect.objectContaining({ code: 'PPCT_ASSOCIATION_MISSING', date: '2026-09-08', severity: 'BLOCKER' }),
      expect.objectContaining({ code: 'PPCT_ASSOCIATION_MISSING', date: '2026-09-21', severity: 'BLOCKER' }),
    ]);
    expect(first.body.result).toBe('PASS');
    expect(first.body.findings).toEqual([]);
    expect(await h.prisma.ppctItemRevision.count({ where: { ppctVersionId: f.ppctVersion.id } })).toBe(1);
  });

  it('retains both exact associations across a mid-range switch, including SUPERSEDED PPCT (A7, A8)', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const f = await fixture(manager.id);
    await h.prisma.ppctClassAssociation.update({ where: { id: f.association.id }, data: { effectiveUntil: new Date('2026-09-07Z') } });
    await h.prisma.ppctVersion.update({ where: { id: f.ppctVersion.id }, data: {
      status: PpctVersionStatus.SUPERSEDED, supersededByUserId: manager.id, supersededAt: new Date('2026-08-15T00:00:00Z'),
    } });
    const current = await h.prisma.ppctVersion.create({ data: {
      ppctPlanId: f.plan.id, versionNumber: 2, status: PpctVersionStatus.PUBLISHED, createdByUserId: manager.id,
      publishedByUserId: manager.id, publishedAt: new Date('2026-08-15T00:00:00Z'),
    } });
    const secondAssociation = await h.prisma.ppctClassAssociation.create({ data: {
      academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, gradeLevel: 10,
      ppctPlanId: f.plan.id, ppctVersionId: current.id, effectiveFrom: new Date('2026-09-08Z'),
      effectiveUntil: null, createdByUserId: manager.id,
    } });
    const response = await manager.agent.get(`/api/timetable-versions/${f.timetable.id}/readiness?from=2026-09-07&to=2026-09-21`);
    expect(response.status).toBe(200);
    expect(response.body.result).toBe('PASS');
    expect(response.body.provenance).toMatchObject({
      ppctClassAssociationIds: [f.association.id, secondAssociation.id].sort(),
      ppctVersionIds: [f.ppctVersion.id, current.id].sort(),
    });
  });
});
