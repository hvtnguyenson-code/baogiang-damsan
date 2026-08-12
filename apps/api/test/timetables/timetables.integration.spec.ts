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
