import { CatalogStatus, Prisma, UserStatus } from '@prisma/client';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

integration('timetable draft validation control plane (PostgreSQL)', () => {
  const h = new Phase01Harness();

  beforeAll(async () => h.start());
  afterAll(async () => {
    try {
      await h.clean();
    } finally {
      await h.stop();
    }
  });
  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities([
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'ACADEMIC_STRUCTURE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_MANAGE', scopes: ['SCHOOL_WIDE'] },
    ]);
  });

  async function academicFixture() {
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });
    const calendar = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id, versionNumber: 1, startDate: new Date('2026-09-01Z'), endDate: new Date('2027-05-31Z'),
        officialWeekCount: 35, reserveWeekCount: 1, teachingWeekdays: ['MONDAY'], isActive: false,
      },
    });
    const week = await h.prisma.academicWeek.create({
      data: { calendarVersionId: calendar.id, kind: 'RESERVE', reserveWeekNumber: 1, displayLabel: 'DP1', sortOrder: 36 },
    });
    await h.prisma.academicWeekSegment.createMany({ data: [
      { academicWeekId: week.id, calendarVersionId: calendar.id, label: 'DP1a', segmentOrder: 1, startDate: new Date('2026-09-07Z'), endDate: new Date('2026-09-08Z') },
      { academicWeekId: week.id, calendarVersionId: calendar.id, label: 'DP1b', segmentOrder: 2, startDate: new Date('2026-09-10Z'), endDate: new Date('2026-09-11Z') },
    ] });
    const schoolClass = await h.prisma.schoolClass.create({
      data: { academicYearId: year.id, code: '10A1', name: '10A1', gradeLevel: 10, status: CatalogStatus.ACTIVE },
    });
    const subject = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Toán', status: CatalogStatus.ACTIVE } });
    const teacher = await h.prisma.user.create({
      data: {
        username: `teacher-${crypto.randomUUID().slice(0, 8)}`, passwordHash: await h.passwords.hash('TeacherPassword9'),
        status: UserStatus.ACTIVE, mustChangePassword: false,
        profile: { create: { displayName: 'Giáo viên', isTeachingStaff: true } },
      },
    });
    const assignment = await h.prisma.teachingAssignment.create({
      data: {
        academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: teacher.id,
        validFrom: new Date('2026-09-01Z'), validUntil: new Date('2027-05-31Z'),
      },
    });
    const slot = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 1, revision: 1,
        displayLabel: 'Tiết 1', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z'),
        isActive: true, allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false,
      },
    });
    return { year, calendar, week, schoolClass, subject, teacher, assignment, slot };
  }

  const entryPayload = (fixture: Awaited<ReturnType<typeof academicFixture>>, overrides = {}) => ({
    weekday: 'MONDAY', timeSlotDefinitionId: fixture.slot.id, schoolClassId: fixture.schoolClass.id,
    subjectId: fixture.subject.id, teachingAssignmentId: fixture.assignment.id, ...overrides,
  });

  async function createDraft(manager: Awaited<ReturnType<typeof h.actor>>, academicYearId: string) {
    return manager.agent.post(`/api/academic-years/${academicYearId}/timetable-versions`)
      .set('Origin', testOrigin).send({});
  }

  async function targetDraft(
    manager: Awaited<ReturnType<typeof h.actor>>,
    draft: { body: { id: string; updatedAt: string } },
    fixture: Awaited<ReturnType<typeof academicFixture>>,
  ) {
    return manager.agent.post(`/api/timetable-versions/${draft.body.id}/target`).set('Origin', testOrigin).send({
      expectedUpdatedAt: draft.body.updatedAt,
      calendarVersionId: fixture.calendar.id,
      effectiveAcademicWeekId: fixture.week.id,
    });
  }

  async function authorDraft(
    manager: Awaited<ReturnType<typeof h.actor>>,
    versionId: string,
    expectedUpdatedAt: string,
    entries: Record<string, unknown>[],
  ) {
    return manager.agent.put(`/api/timetable-versions/${versionId}/entries`).set('Origin', testOrigin).send({
      expectedUpdatedAt, entries,
    });
  }

  async function prepareApproved(
    manager: Awaited<ReturnType<typeof h.actor>>,
    fixture: Awaited<ReturnType<typeof academicFixture>>,
    week = fixture.week,
  ) {
    const created = await createDraft(manager, fixture.year.id);
    const targeted = await manager.agent.post(`/api/timetable-versions/${created.body.id}/target`)
      .set('Origin', testOrigin).send({
        expectedUpdatedAt: created.body.updatedAt,
        calendarVersionId: fixture.calendar.id,
        effectiveAcademicWeekId: week.id,
      });
    const authored = await authorDraft(manager, created.body.id, targeted.body.updatedAt, [entryPayload(fixture)]);
    const validated = await manager.agent.post(`/api/timetable-versions/${created.body.id}/validate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: authored.body.version.updatedAt });
    expect(validated.body).toMatchObject({ valid: true, statusAfter: 'VALIDATED' });
    const approved = await manager.agent.post(`/api/timetable-versions/${created.body.id}/approve`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: validated.body.version.updatedAt });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
    return approved;
  }

  async function createWeek(
    fixture: Awaited<ReturnType<typeof academicFixture>>,
    startDate: string,
    sortOrder: number,
  ) {
    const week = await h.prisma.academicWeek.create({ data: {
      calendarVersionId: fixture.calendar.id, kind: 'OFFICIAL', officialWeekNumber: sortOrder,
      displayLabel: `Tuần ${sortOrder}`, sortOrder,
    } });
    await h.prisma.academicWeekSegment.create({ data: {
      academicWeekId: week.id, calendarVersionId: fixture.calendar.id, label: `W${sortOrder}`,
      segmentOrder: 1, startDate: new Date(`${startDate}T00:00:00Z`), endDate: new Date(`${startDate}T00:00:00Z`),
    } });
    return week;
  }

  async function markCalendarActive(calendarId: string): Promise<void> {
    await h.prisma.academicCalendarVersion.update({
      where: { id: calendarId },
      data: { isActive: true, activatedAt: new Date() },
    });
  }

  it('enforces exact capability and CSRF composition', async () => {
    const { year } = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const noGrant = await h.actor();
    const systemAdmin = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    const academicManager = await h.actor({ grants: [{ capabilityKey: 'ACADEMIC_STRUCTURE_MANAGE' }] });
    const subjectManager = await h.actor({ grants: [{ capabilityKey: 'SUBJECT_MANAGE' }] });
    const wrongScope = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE', scopeType: 'PERSONAL' }] });

    expect((await manager.agent.get(`/api/academic-years/${year.id}/timetable-versions`)).status).toBe(200);
    for (const denied of [noGrant, systemAdmin, academicManager, subjectManager, wrongScope]) {
      expect((await denied.agent.get(`/api/academic-years/${year.id}/timetable-versions`)).status).toBe(403);
    }
    expect((await manager.agent.post(`/api/academic-years/${year.id}/timetable-versions`).send({})).status).toBe(403);
    expect((await manager.agent.post(`/api/academic-years/${year.id}/timetable-versions`).set('Origin', testOrigin).send({ note: ' Nháp ' })).status).toBe(201);
  });

  it('enforces lifecycle/resolution authorization and mutation CSRF without adding a capability', async () => {
    const { year } = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const deniedActors = [
      await h.actor(),
      await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] }),
      await h.actor({ grants: [{ capabilityKey: 'ACADEMIC_STRUCTURE_MANAGE' }] }),
      await h.actor({ grants: [{ capabilityKey: 'SUBJECT_MANAGE' }] }),
      await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE', scopeType: 'PERSONAL' }] }),
    ];
    const missingVersion = crypto.randomUUID();
    expect((await manager.agent.get(`/api/academic-years/${year.id}/timetable-resolution?date=2026-09-01`)).status).toBe(200);
    expect((await manager.agent.post(`/api/timetable-versions/${missingVersion}/approve`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: new Date().toISOString() })).status).toBe(404);
    expect((await manager.agent.post(`/api/timetable-versions/${missingVersion}/activate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: new Date().toISOString(), expectedActiveVersionId: null })).status).toBe(404);
    expect((await manager.agent.post(`/api/timetable-versions/${missingVersion}/approve`)
      .send({ expectedUpdatedAt: new Date().toISOString() })).status).toBe(403);
    for (const denied of deniedActors) {
      expect((await denied.agent.get(`/api/academic-years/${year.id}/timetable-resolution?date=2026-09-01`)).status).toBe(403);
      expect((await denied.agent.post(`/api/timetable-versions/${missingVersion}/approve`)
        .set('Origin', testOrigin).send({ expectedUpdatedAt: new Date().toISOString() })).status).toBe(403);
      expect((await denied.agent.post(`/api/timetable-versions/${missingVersion}/activate`)
        .set('Origin', testOrigin).send({ expectedUpdatedAt: new Date().toISOString(), expectedActiveVersionId: null })).status).toBe(403);
    }
  });

  it('derives target, snapshots teacher, replaces atomically, validates, audits, and freezes content', async () => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await manager.agent.post(`/api/academic-years/${fixture.year.id}/timetable-versions`)
      .set('Origin', testOrigin).send({ note: ' Nháp 1 ' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ versionNumber: 1, status: 'DRAFT', note: 'Nháp 1', calendarVersionId: null, contentChecksum: null, entryCount: 0 });

    expect((await manager.agent.post(`/api/timetable-versions/${created.body.id}/target`).set('Origin', testOrigin).send({
      expectedUpdatedAt: created.body.updatedAt, calendarVersionId: fixture.calendar.id,
      effectiveAcademicWeekId: fixture.week.id, effectiveFrom: '2026-09-08',
    })).status).toBe(400);

    const targeted = await manager.agent.post(`/api/timetable-versions/${created.body.id}/target`).set('Origin', testOrigin).send({
      expectedUpdatedAt: created.body.updatedAt,
      calendarVersionId: fixture.calendar.id,
      effectiveAcademicWeekId: fixture.week.id,
    });
    expect(targeted.status).toBe(200);
    expect(targeted.body.effectiveFrom).toBe('2026-09-07');
    expect(new Date(targeted.body.updatedAt).getTime()).toBeGreaterThan(new Date(created.body.updatedAt).getTime());

    const normalized = {
      weekday: 'MONDAY', timeSlotDefinitionId: fixture.slot.id, schoolClassId: fixture.schoolClass.id,
      subjectId: fixture.subject.id, teachingAssignmentId: fixture.assignment.id,
    };
    expect((await manager.agent.put(`/api/timetable-versions/${created.body.id}/entries`).set('Origin', testOrigin).send({
      expectedUpdatedAt: targeted.body.updatedAt,
      entries: [{ ...normalized, teacherUserId: fixture.teacher.id }],
    })).status).toBe(400);
    const replaced = await manager.agent.put(`/api/timetable-versions/${created.body.id}/entries`).set('Origin', testOrigin).send({
      expectedUpdatedAt: targeted.body.updatedAt, entries: [normalized],
    });
    expect(replaced.status).toBe(200);
    const stored = await h.prisma.timetableEntry.findFirstOrThrow({ where: { timetableVersionId: created.body.id } });
    expect(stored.teacherUserId).toBe(fixture.assignment.teacherUserId);

    const stale = await manager.agent.put(`/api/timetable-versions/${created.body.id}/entries`).set('Origin', testOrigin).send({
      expectedUpdatedAt: targeted.body.updatedAt, entries: [],
    });
    expect(stale.status).toBe(409);
    expect(await h.prisma.timetableEntry.count({ where: { timetableVersionId: created.body.id } })).toBe(1);
    expect(await h.prisma.auditEvent.count({
      where: { entityId: created.body.id, action: 'TIMETABLE_ENTRIES_REPLACED' },
    })).toBe(1);

    const validated = await manager.agent.post(`/api/timetable-versions/${created.body.id}/validate`).set('Origin', testOrigin).send({
      expectedUpdatedAt: replaced.body.version.updatedAt,
    });
    expect(validated.status).toBe(200);
    expect(validated.body).toMatchObject({
      valid: true, statusBefore: 'DRAFT', statusAfter: 'VALIDATED', validationScope: 'NORMAL_BASE_TIMETABLE',
      deferredChecks: ['TIMETABLE_COMPLETENESS', 'PPCT_ASSOCIATION', 'SPECIAL_ACTIVITY_COLLISIONS'],
    });
    expect(validated.body.validatedByUserId).toBe(manager.id);
    expect(validated.body.validatedAt).toEqual(expect.any(String));
    expect((await manager.agent.put(`/api/timetable-versions/${created.body.id}/entries`).set('Origin', testOrigin).send({
      expectedUpdatedAt: validated.body.version.updatedAt, entries: [],
    })).status).toBe(409);
    expect((await manager.agent.post(`/api/timetable-versions/${created.body.id}/target`).set('Origin', testOrigin).send({
      expectedUpdatedAt: validated.body.version.updatedAt,
      calendarVersionId: fixture.calendar.id,
      effectiveAcademicWeekId: fixture.week.id,
    })).status).toBe(409);

    const beforeReads = await h.prisma.auditEvent.count({ where: { entityId: created.body.id } });
    expect((await manager.agent.get(`/api/academic-years/${fixture.year.id}/timetable-versions`)).status).toBe(200);
    expect((await manager.agent.get(`/api/timetable-versions/${created.body.id}`)).status).toBe(200);
    expect((await manager.agent.get(`/api/timetable-versions/${created.body.id}/entries`)).status).toBe(200);
    expect(await h.prisma.auditEvent.count({ where: { entityId: created.body.id } })).toBe(beforeReads);

    const auditRows = await h.prisma.auditEvent.findMany({ where: { entityId: created.body.id }, orderBy: { createdAt: 'asc' } });
    const actions = auditRows.map((row) => row.action);
    expect(actions).toEqual([
      'TIMETABLE_VERSION_DRAFT_CREATED', 'TIMETABLE_VERSION_TARGET_SET', 'TIMETABLE_ENTRIES_REPLACED', 'TIMETABLE_VALIDATION_RUN',
    ]);
    expect(auditRows.at(-1)).toMatchObject({ action: 'TIMETABLE_VALIDATION_RUN', result: 'SUCCESS' });
    expect(auditRows.at(-1)?.metadata as Prisma.JsonObject).toMatchObject({ valid: true, issueCount: 0 });
    expect((await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: created.body.id } })).contentChecksum).toBeNull();
  });

  it('returns an invalid report for empty content and advances the draft token', async () => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await manager.agent.post(`/api/academic-years/${fixture.year.id}/timetable-versions`).set('Origin', testOrigin).send({});
    const report = await manager.agent.post(`/api/timetable-versions/${created.body.id}/validate`).set('Origin', testOrigin).send({ expectedUpdatedAt: created.body.updatedAt });
    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({ valid: false, statusAfter: 'DRAFT', validatedAt: null, validatedByUserId: null });
    expect(report.body.issues.map((value: { code: string }) => value.code)).toEqual(['TARGET_REQUIRED', 'EMPTY_TIMETABLE']);
    expect(new Date(report.body.version.updatedAt).getTime()).toBeGreaterThan(new Date(created.body.updatedAt).getTime());
    const audit = await h.prisma.auditEvent.findFirstOrThrow({
      where: { entityId: created.body.id, action: 'TIMETABLE_VALIDATION_RUN' }, orderBy: { createdAt: 'desc' },
    });
    expect(audit.result).toBe('SUCCESS');
    expect(audit.metadata as Prisma.JsonObject).toMatchObject({
      valid: false, issueCount: 2, issueCodes: ['TARGET_REQUIRED', 'EMPTY_TIMETABLE'],
    });
  });

  it('rolls back a real replacement transaction when the new rows conflict', async () => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await createDraft(manager, fixture.year.id);
    const targeted = await targetDraft(manager, created, fixture);
    const first = await authorDraft(manager, created.body.id, targeted.body.updatedAt, [entryPayload(fixture)]);
    const original = await h.prisma.timetableEntry.findFirstOrThrow({ where: { timetableVersionId: created.body.id } });
    const auditCount = await h.prisma.auditEvent.count({
      where: { entityId: created.body.id, action: 'TIMETABLE_ENTRIES_REPLACED' },
    });
    const mismatchedSubject = await h.prisma.subject.create({ data: {
      code: normalizedCode('M'), name: 'Môn không khớp phân công', status: CatalogStatus.ACTIVE,
    } });
    const failed = await authorDraft(manager, created.body.id, first.body.version.updatedAt, [
      entryPayload(fixture), entryPayload(fixture, { subjectId: mismatchedSubject.id }),
    ]);
    expect(failed.status).toBe(409);
    const after = await h.prisma.timetableEntry.findMany({ where: { timetableVersionId: created.body.id } });
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(original.id);
    expect(await h.prisma.auditEvent.count({
      where: { entityId: created.body.id, action: 'TIMETABLE_ENTRIES_REPLACED' },
    })).toBe(auditCount);
  });

  it.each([
    ['slot', 'SLOT_NOT_ACTIVE'],
    ['class', 'CLASS_NOT_ACTIVE'],
    ['subject', 'SUBJECT_NOT_ACTIVE'],
    ['teacher', 'TEACHER_NOT_ACTIVE'],
    ['assignment', 'ASSIGNMENT_COVERAGE_GAP'],
  ] as const)('reports dependency invalidation for %s without mutating draft content', async (dependency, issueCode) => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await createDraft(manager, fixture.year.id);
    const targeted = await targetDraft(manager, created, fixture);
    const authored = await authorDraft(manager, created.body.id, targeted.body.updatedAt, [entryPayload(fixture)]);
    if (dependency === 'slot') await h.prisma.timeSlotDefinition.update({ where: { id: fixture.slot.id }, data: { isActive: false } });
    if (dependency === 'class') await h.prisma.schoolClass.update({ where: { id: fixture.schoolClass.id }, data: { status: CatalogStatus.INACTIVE } });
    if (dependency === 'subject') await h.prisma.subject.update({ where: { id: fixture.subject.id }, data: { status: CatalogStatus.INACTIVE } });
    if (dependency === 'teacher') await h.prisma.user.update({ where: { id: fixture.teacher.id }, data: { status: UserStatus.DISABLED } });
    if (dependency === 'assignment') await h.prisma.teachingAssignment.update({
      where: { id: fixture.assignment.id }, data: { validUntil: new Date('2026-12-31Z') },
    });
    const report = await manager.agent.post(`/api/timetable-versions/${created.body.id}/validate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: authored.body.version.updatedAt });
    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({ valid: false, statusAfter: 'DRAFT', validatedAt: null, validatedByUserId: null });
    expect(report.body.issues.map((value: { code: string }) => value.code)).toContain(issueCode);
    expect(await h.prisma.timetableEntry.count({ where: { timetableVersionId: created.body.id } })).toBe(1);
    expect(await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({
      calendarVersionId: fixture.calendar.id, effectiveAcademicWeekId: fixture.week.id, status: 'DRAFT',
    });
  });

  it('detects historical class and teacher overlaps across different slot revisions', async () => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await createDraft(manager, fixture.year.id);
    const targeted = await targetDraft(manager, created, fixture);
    const authored = await authorDraft(manager, created.body.id, targeted.body.updatedAt, [entryPayload(fixture)]);
    await h.prisma.timeSlotDefinition.update({ where: { id: fixture.slot.id }, data: { isActive: false } });
    const overlapping = await h.prisma.timeSlotDefinition.create({ data: {
      academicYearId: fixture.year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 2, revision: 1,
      displayLabel: 'Tiết chồng lấn', startTime: new Date('1970-01-01T07:30:00Z'), endTime: new Date('1970-01-01T08:15:00Z'),
      isActive: true, allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false,
    } });
    await h.prisma.timetableEntry.create({ data: {
      timetableVersionId: created.body.id, academicYearId: fixture.year.id, weekday: 'MONDAY',
      timeSlotDefinitionId: overlapping.id, schoolClassId: fixture.schoolClass.id, subjectId: fixture.subject.id,
      teachingAssignmentId: fixture.assignment.id, teacherUserId: fixture.teacher.id,
    } });
    const report = await manager.agent.post(`/api/timetable-versions/${created.body.id}/validate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: authored.body.version.updatedAt });
    const codes = report.body.issues.map((value: { code: string }) => value.code);
    expect(codes).toEqual(expect.arrayContaining(['SLOT_NOT_ACTIVE', 'CLASS_TIME_OVERLAP', 'TEACHER_TIME_OVERLAP']));
  });

  it('uses half-open time ranges so sequential slots do not collide', async () => {
    const fixture = await academicFixture();
    const sequential = await h.prisma.timeSlotDefinition.create({ data: {
      academicYearId: fixture.year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 2, revision: 1,
      displayLabel: 'Tiết 2', startTime: new Date('1970-01-01T07:45:00Z'), endTime: new Date('1970-01-01T08:30:00Z'),
      isActive: true, allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false,
    } });
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await createDraft(manager, fixture.year.id);
    const targeted = await targetDraft(manager, created, fixture);
    const authored = await authorDraft(manager, created.body.id, targeted.body.updatedAt, [
      entryPayload(fixture), entryPayload(fixture, { timeSlotDefinitionId: sequential.id }),
    ]);
    const report = await manager.agent.post(`/api/timetable-versions/${created.body.id}/validate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: authored.body.version.updatedAt });
    expect(report.body.valid).toBe(true);
    expect(report.body.issues).toEqual([]);
  });

  it('does not treat calendar interruptions as normal-base invalidation or mutate entries', async () => {
    const fixture = await academicFixture();
    await h.prisma.calendarInterruption.create({ data: {
      calendarVersionId: fixture.calendar.id, code: 'INT-1', name: 'Nghỉ kiểm tra',
      startDate: new Date('2026-09-07Z'), endDate: new Date('2026-09-07Z'),
    } });
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await createDraft(manager, fixture.year.id);
    const targeted = await targetDraft(manager, created, fixture);
    const authored = await authorDraft(manager, created.body.id, targeted.body.updatedAt, [entryPayload(fixture)]);
    const report = await manager.agent.post(`/api/timetable-versions/${created.body.id}/validate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: authored.body.version.updatedAt });
    expect(report.body.valid).toBe(true);
    expect(await h.prisma.timetableEntry.count({ where: { timetableVersionId: created.body.id } })).toBe(1);
  });

  it('allows one timetable manager to validate, approve and first-activate the same future-effective version', async () => {
    const fixture = await academicFixture();
    await markCalendarActive(fixture.calendar.id);
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const approved = await prepareApproved(manager, fixture);
    const activated = await manager.agent.post(`/api/timetable-versions/${approved.body.id}/activate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: approved.body.updatedAt, expectedActiveVersionId: null });
    expect(activated.status).toBe(200);
    expect(activated.body).toMatchObject({
      activated: true, statusBefore: 'APPROVED', statusAfter: 'ACTIVE', supersededVersion: null,
      deferredChecks: ['TIMETABLE_COMPLETENESS', 'PPCT_ASSOCIATION', 'SPECIAL_ACTIVITY_COLLISIONS'],
    });
    const stored = await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: approved.body.id } });
    expect(stored).toMatchObject({
      status: 'ACTIVE', validatedByUserId: manager.id, approvedByUserId: manager.id,
      activatedByUserId: manager.id, effectiveUntil: null, supersededAt: null, contentChecksum: null,
    });
    expect(stored.activatedAt).not.toBeNull();
    expect(await h.prisma.auditEvent.count({ where: { entityId: stored.id, action: 'TIMETABLE_ACTIVATION_RUN' } })).toBe(1);
    expect(await h.prisma.auditEvent.count({ where: { entityId: stored.id, action: 'TIMETABLE_VERSION_ACTIVATED' } })).toBe(1);
  });

  it('supersedes the predecessor one civil day before a future successor and resolves inclusive history', async () => {
    const fixture = await academicFixture();
    await markCalendarActive(fixture.calendar.id);
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const firstWeek = await createWeek(fixture, '2026-09-01', 1);
    const successorWeek = await createWeek(fixture, '2026-09-21', 2);
    const first = await prepareApproved(manager, fixture, firstWeek);
    const firstActivated = await manager.agent.post(`/api/timetable-versions/${first.body.id}/activate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: first.body.updatedAt, expectedActiveVersionId: null });
    expect(firstActivated.body.activated).toBe(true);
    const predecessorEntries = await h.prisma.timetableEntry.findMany({ where: { timetableVersionId: first.body.id } });
    const predecessorBefore = await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: first.body.id } });

    const successor = await prepareApproved(manager, fixture, successorWeek);
    const activated = await manager.agent.post(`/api/timetable-versions/${successor.body.id}/activate`)
      .set('Origin', testOrigin).send({
        expectedUpdatedAt: successor.body.updatedAt, expectedActiveVersionId: first.body.id,
      });
    expect(activated.status).toBe(200);
    expect(activated.body).toMatchObject({
      activated: true,
      supersededVersion: { id: first.body.id, status: 'SUPERSEDED', effectiveUntil: '2026-09-20' },
      version: { id: successor.body.id, status: 'ACTIVE', effectiveFrom: '2026-09-21', effectiveUntil: null },
    });
    const predecessorAfter = await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: first.body.id } });
    expect(predecessorAfter).toMatchObject({
      status: 'SUPERSEDED', effectiveUntil: new Date('2026-09-20Z'), activatedByUserId: predecessorBefore.activatedByUserId,
      activatedAt: predecessorBefore.activatedAt, calendarVersionId: predecessorBefore.calendarVersionId,
      effectiveAcademicWeekId: predecessorBefore.effectiveAcademicWeekId, effectiveFrom: predecessorBefore.effectiveFrom,
      contentChecksum: predecessorBefore.contentChecksum,
    });
    expect(await h.prisma.timetableEntry.findMany({ where: { timetableVersionId: first.body.id } })).toEqual(predecessorEntries);

    await h.prisma.calendarInterruption.create({ data: {
      calendarVersionId: fixture.calendar.id, code: 'HIST-INT', name: 'Gián đoạn lịch sử',
      startDate: new Date('2026-09-20Z'), endDate: new Date('2026-09-20Z'),
    } });
    await h.prisma.academicCalendarVersion.update({ where: { id: fixture.calendar.id }, data: { isActive: false } });

    for (const [date, id] of [
      ['2026-08-31', null], ['2026-09-01', first.body.id], ['2026-09-20', first.body.id],
      ['2026-09-21', successor.body.id], ['2027-01-01', successor.body.id],
    ] as const) {
      const response = await manager.agent.get(`/api/academic-years/${fixture.year.id}/timetable-resolution?date=${date}`);
      expect(response.status).toBe(200);
      expect(response.body.version?.id ?? null).toBe(id);
    }
    expect(await h.prisma.auditEvent.count({ where: { entityId: first.body.id, action: 'TIMETABLE_VERSION_SUPERSEDED' } })).toBe(1);
  });

  it.each([
    ['slot', 'SLOT_NOT_ACTIVE'],
    ['class', 'CLASS_NOT_ACTIVE'],
    ['subject', 'SUBJECT_NOT_ACTIVE'],
    ['teacher', 'TEACHER_NOT_ACTIVE'],
    ['assignment', 'ASSIGNMENT_COVERAGE_GAP'],
  ] as const)('keeps APPROVED and the active chain unchanged when %s drifts after approval', async (dependency, issueCode) => {
    const fixture = await academicFixture();
    await markCalendarActive(fixture.calendar.id);
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const approved = await prepareApproved(manager, fixture);
    if (dependency === 'slot') await h.prisma.timeSlotDefinition.update({ where: { id: fixture.slot.id }, data: { isActive: false } });
    if (dependency === 'class') await h.prisma.schoolClass.update({ where: { id: fixture.schoolClass.id }, data: { status: CatalogStatus.INACTIVE } });
    if (dependency === 'subject') await h.prisma.subject.update({ where: { id: fixture.subject.id }, data: { status: CatalogStatus.INACTIVE } });
    if (dependency === 'teacher') await h.prisma.user.update({ where: { id: fixture.teacher.id }, data: { status: UserStatus.DISABLED } });
    if (dependency === 'assignment') await h.prisma.teachingAssignment.update({
      where: { id: fixture.assignment.id }, data: { validUntil: new Date('2026-12-31Z') },
    });
    const report = await manager.agent.post(`/api/timetable-versions/${approved.body.id}/activate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: approved.body.updatedAt, expectedActiveVersionId: null });
    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({ activated: false, statusAfter: 'APPROVED', supersededVersion: null });
    expect(report.body.issues.map((item: { code: string }) => item.code)).toContain(issueCode);
    expect(await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: approved.body.id } })).toMatchObject({
      status: 'APPROVED', activatedByUserId: null, activatedAt: null, supersededAt: null,
    });
    expect(await h.prisma.auditEvent.count({ where: { entityId: approved.body.id, action: 'TIMETABLE_VERSION_ACTIVATED' } })).toBe(0);
  });

  it('reports inactive target calendar only at activation and never silently retargets', async () => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const approved = await prepareApproved(manager, fixture);
    const report = await manager.agent.post(`/api/timetable-versions/${approved.body.id}/activate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: approved.body.updatedAt, expectedActiveVersionId: null });
    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({ activated: false, statusAfter: 'APPROVED' });
    expect(report.body.issues.map((item: { code: string }) => item.code)).toContain('TARGET_CALENDAR_NOT_ACTIVE');
    expect(report.body.version.calendarVersionId).toBe(fixture.calendar.id);
  });

  it('rejects malformed resolution dates and ignores non-effective states', async () => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    await prepareApproved(manager, fixture);
    for (const value of ['2026-02-30', '2026-13-01', '2026-09-01T00:00:00Z', '01/09/2026']) {
      expect((await manager.agent.get(`/api/academic-years/${fixture.year.id}/timetable-resolution?date=${encodeURIComponent(value)}`)).status).toBe(400);
    }
    const response = await manager.agent.get(`/api/academic-years/${fixture.year.id}/timetable-resolution?date=2026-09-07`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ academicYearId: fixture.year.id, date: '2026-09-07', version: null });
  });

  it('requires the exact chain-head token and rejects non-forward successor chronology atomically', async () => {
    const fixture = await academicFixture();
    await markCalendarActive(fixture.calendar.id);
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const firstWeek = await createWeek(fixture, '2026-09-01', 1);
    const first = await prepareApproved(manager, fixture, firstWeek);
    const active = await manager.agent.post(`/api/timetable-versions/${first.body.id}/activate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: first.body.updatedAt, expectedActiveVersionId: null });
    expect(active.body.activated).toBe(true);

    const successor = await prepareApproved(manager, fixture, firstWeek);
    const wrongId = await manager.agent.post(`/api/timetable-versions/${successor.body.id}/activate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: successor.body.updatedAt, expectedActiveVersionId: crypto.randomUUID() });
    expect(wrongId.status).toBe(409);
    let stored = await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: successor.body.id } });
    const refreshedToken = stored.updatedAt.toISOString();
    const omitted = await manager.agent.post(`/api/timetable-versions/${successor.body.id}/activate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: refreshedToken });
    expect(omitted.status).toBe(409);
    stored = await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: successor.body.id } });
    const chronology = await manager.agent.post(`/api/timetable-versions/${successor.body.id}/activate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: stored.updatedAt.toISOString(), expectedActiveVersionId: first.body.id });
    expect(chronology.status).toBe(409);
    expect(await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: first.body.id } })).toMatchObject({ status: 'ACTIVE', effectiveUntil: null });
    expect(await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: successor.body.id } })).toMatchObject({ status: 'APPROVED' });
    expect(await h.prisma.auditEvent.count({ where: { action: 'TIMETABLE_VERSION_SUPERSEDED' } })).toBe(0);
  });

  it('allows at most one concurrent approval and one concurrent activation from the same lifecycle snapshots', async () => {
    const fixture = await academicFixture();
    await markCalendarActive(fixture.calendar.id);
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await createDraft(manager, fixture.year.id);
    const targeted = await targetDraft(manager, created, fixture);
    const authored = await authorDraft(manager, created.body.id, targeted.body.updatedAt, [entryPayload(fixture)]);
    const validated = await manager.agent.post(`/api/timetable-versions/${created.body.id}/validate`)
      .set('Origin', testOrigin).send({ expectedUpdatedAt: authored.body.version.updatedAt });
    const approvalPayload = { expectedUpdatedAt: validated.body.version.updatedAt };
    const approvals = await Promise.all([
      manager.agent.post(`/api/timetable-versions/${created.body.id}/approve`).set('Origin', testOrigin).send(approvalPayload),
      manager.agent.post(`/api/timetable-versions/${created.body.id}/approve`).set('Origin', testOrigin).send(approvalPayload),
    ]);
    expect(approvals.filter((item) => item.status === 200)).toHaveLength(1);
    expect(approvals.filter((item) => item.status === 409)).toHaveLength(1);
    const approved = approvals.find((item) => item.status === 200)!;
    const activationPayload = { expectedUpdatedAt: approved.body.updatedAt, expectedActiveVersionId: null };
    const activations = await Promise.all([
      manager.agent.post(`/api/timetable-versions/${created.body.id}/activate`).set('Origin', testOrigin).send(activationPayload),
      manager.agent.post(`/api/timetable-versions/${created.body.id}/activate`).set('Origin', testOrigin).send(activationPayload),
    ]);
    expect(activations.filter((item) => item.status === 200 && item.body.activated)).toHaveLength(1);
    expect(activations.filter((item) => item.status === 409)).toHaveLength(1);
    expect(await h.prisma.auditEvent.count({ where: { entityId: created.body.id, action: 'TIMETABLE_VERSION_ACTIVATED' } })).toBe(1);
  });

  it('does not let different approved candidates independently activate from the same empty chain snapshot', async () => {
    const fixture = await academicFixture();
    await markCalendarActive(fixture.calendar.id);
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const first = await prepareApproved(manager, fixture);
    const second = await prepareApproved(manager, fixture);
    const responses = await Promise.all([
      manager.agent.post(`/api/timetable-versions/${first.body.id}/activate`).set('Origin', testOrigin)
        .send({ expectedUpdatedAt: first.body.updatedAt, expectedActiveVersionId: null }),
      manager.agent.post(`/api/timetable-versions/${second.body.id}/activate`).set('Origin', testOrigin)
        .send({ expectedUpdatedAt: second.body.updatedAt, expectedActiveVersionId: null }),
    ]);
    expect(responses.filter((item) => item.status === 200 && item.body.activated)).toHaveLength(1);
    expect(responses.filter((item) => item.status === 409)).toHaveLength(1);
    expect(await h.prisma.timetableVersion.count({ where: { academicYearId: fixture.year.id, status: 'ACTIVE' } })).toBe(1);
  });

  it('allocates unique version numbers under concurrent create requests', async () => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const responses = await Promise.all([
      createDraft(manager, fixture.year.id), createDraft(manager, fixture.year.id),
    ]);
    expect(responses.every((response) => [201, 409].includes(response.status))).toBe(true);
    expect(responses.filter((response) => response.status === 201).length).toBeGreaterThanOrEqual(1);
    const rows = await h.prisma.timetableVersion.findMany({ where: { academicYearId: fixture.year.id } });
    expect(new Set(rows.map((row) => row.versionNumber)).size).toBe(rows.length);
  });

  it('allows at most one target or replacement command to claim the same draft token', async () => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await createDraft(manager, fixture.year.id);
    const [target, replacement] = await Promise.all([
      targetDraft(manager, created, fixture),
      authorDraft(manager, created.body.id, created.body.updatedAt, []),
    ]);
    expect([target.status, replacement.status].filter((status) => status === 200)).toHaveLength(1);
    expect([target.status, replacement.status].filter((status) => status === 409)).toHaveLength(1);
  });

  it('allows at most one concurrent validate or entry replacement to commit with one draft token', async () => {
    const fixture = await academicFixture();
    const manager = await h.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
    const created = await manager.agent.post(`/api/academic-years/${fixture.year.id}/timetable-versions`).set('Origin', testOrigin).send({});
    const targeted = await manager.agent.post(`/api/timetable-versions/${created.body.id}/target`).set('Origin', testOrigin).send({
      expectedUpdatedAt: created.body.updatedAt, calendarVersionId: fixture.calendar.id, effectiveAcademicWeekId: fixture.week.id,
    });
    const authored = await manager.agent.put(`/api/timetable-versions/${created.body.id}/entries`).set('Origin', testOrigin).send({
      expectedUpdatedAt: targeted.body.updatedAt,
      entries: [{
        weekday: 'MONDAY', timeSlotDefinitionId: fixture.slot.id, schoolClassId: fixture.schoolClass.id,
        subjectId: fixture.subject.id, teachingAssignmentId: fixture.assignment.id,
      }],
    });
    const token = authored.body.version.updatedAt as string;
    const [validation, replacement] = await Promise.all([
      manager.agent.post(`/api/timetable-versions/${created.body.id}/validate`).set('Origin', testOrigin).send({ expectedUpdatedAt: token }),
      manager.agent.put(`/api/timetable-versions/${created.body.id}/entries`).set('Origin', testOrigin).send({ expectedUpdatedAt: token, entries: [] }),
    ]);
    expect([validation.status, replacement.status].filter((status) => status === 200)).toHaveLength(1);
    expect([validation.status, replacement.status].filter((status) => status === 409)).toHaveLength(1);
    const final = await h.prisma.timetableVersion.findUniqueOrThrow({ where: { id: created.body.id } });
    const entryCount = await h.prisma.timetableEntry.count({ where: { timetableVersionId: created.body.id } });
    if (final.status === 'VALIDATED') expect(entryCount).toBe(1);
    else expect(entryCount).toBe(0);
  });
});
