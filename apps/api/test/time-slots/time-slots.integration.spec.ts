import { AcademicWeekday, TimeSlotSession, UserStatus } from '@prisma/client';
import { Phase01Harness, integration, normalizedCode, testOrigin } from '../helpers/phase01-test-harness';

const baseSlot = (overrides: Record<string, unknown> = {}) => ({
  weekday: 'MONDAY',
  session: 'MORNING',
  ordinal: 1,
  displayLabel: 'Tiết 1',
  startTime: '07:00:00',
  endTime: '07:45:00',
  ...overrides,
});

integration('time-slot control plane integration', () => {
  const harness = new Phase01Harness();

  beforeAll(async () => harness.start());
  beforeEach(async () => {
    await harness.clean();
    await harness.seedCapabilities([
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'ACADEMIC_STRUCTURE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'USER_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'CAPABILITY_GRANT', scopes: ['SCHOOL_WIDE'] },
    ]);
  });
  afterAll(async () => harness.stop());

  async function year() {
    return harness.prisma.academicYear.create({
      data: { code: normalizedCode('Y'), name: 'Năm học kiểm thử' },
    });
  }

  async function manager() {
    return harness.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE' }] });
  }

  it('allows an explicit manager to read and mutate with valid CSRF', async () => {
    const academicYear = await year();
    const actor = await manager();
    const created = await actor.agent.post(`/api/academic-years/${academicYear.id}/time-slots`)
      .set('Origin', testOrigin).set('X-Request-Id', 'slot-create').send(baseSlot());
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ revision: 1, isActive: true, startTime: '07:00:00', endTime: '07:45:00' });

    const listed = await actor.agent.get(`/api/academic-years/${academicYear.id}/time-slots`);
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
  });

  it.each([
    ['no capability', []],
    ['SYSTEM_ADMIN alone', [{ capabilityKey: 'SYSTEM_ADMIN' }]],
    ['ACADEMIC_STRUCTURE_MANAGE alone', [{ capabilityKey: 'ACADEMIC_STRUCTURE_MANAGE' }]],
    ['SUBJECT_MANAGE alone', [{ capabilityKey: 'SUBJECT_MANAGE' }]],
    ['USER_MANAGE alone', [{ capabilityKey: 'USER_MANAGE' }]],
    ['CAPABILITY_GRANT alone', [{ capabilityKey: 'CAPABILITY_GRANT' }]],
  ])('denies read and mutation for %s', async (_label, grants) => {
    const academicYear = await year();
    const actor = await harness.actor({ grants });
    expect((await actor.agent.get(`/api/academic-years/${academicYear.id}/time-slots`)).status).toBe(403);
    expect((await actor.agent.post(`/api/academic-years/${academicYear.id}/time-slots`).set('Origin', testOrigin).send(baseSlot())).status).toBe(403);
  });

  it('denies a wrong-scope TIMETABLE_MANAGE grant and rejects missing CSRF', async () => {
    const academicYear = await year();
    const wrongScope = await harness.actor({ grants: [{ capabilityKey: 'TIMETABLE_MANAGE', scopeType: 'SUBJECT', scopeResourceId: crypto.randomUUID() }] });
    expect((await wrongScope.agent.get(`/api/academic-years/${academicYear.id}/time-slots`)).status).toBe(403);
    const actor = await manager();
    expect((await actor.agent.post(`/api/academic-years/${academicYear.id}/time-slots`).send(baseSlot())).status).toBe(403);
  });

  it('enforces real wall-clock overlap across sessions while allowing boundaries and other weekdays', async () => {
    const academicYear = await year();
    const actor = await manager();
    const create = (body: Record<string, unknown>) => actor.agent.post(`/api/academic-years/${academicYear.id}/time-slots`).set('Origin', testOrigin).send(body);
    expect((await create(baseSlot())).status).toBe(201);
    expect((await create(baseSlot({ ordinal: 2, displayLabel: 'Tiết 2', startTime: '07:45:00', endTime: '08:30:00' }))).status).toBe(201);
    expect((await create(baseSlot({ ordinal: 3, displayLabel: 'Trùng buổi', startTime: '07:30:00', endTime: '08:00:00' }))).status).toBe(409);
    expect((await create(baseSlot({ session: 'AFTERNOON', ordinal: 1, displayLabel: 'Trùng nhãn buổi', startTime: '07:15:00', endTime: '07:30:00' }))).status).toBe(409);
    expect((await create(baseSlot({ weekday: 'TUESDAY', displayLabel: 'Tiết 1 thứ Ba' }))).status).toBe(201);
  });

  it('preserves immutable history across revise, stale rejection, retire, and restoration', async () => {
    const academicYear = await year();
    const actor = await manager();
    const originalResponse = await actor.agent.post(`/api/academic-years/${academicYear.id}/time-slots`)
      .set('Origin', testOrigin).send(baseSlot());
    const originalId = originalResponse.body.id as string;
    const revise = await actor.agent.post(`/api/time-slots/${originalId}/revise`).set('Origin', testOrigin).send({
      displayLabel: 'Tiết 1 mới', startTime: '07:05:00', endTime: '07:50:00',
      allowRegularTeaching: true, allowMakeupTeaching: true, allowSelfStudy: false,
    });
    expect(revise.status).toBe(200);
    expect(revise.body).toMatchObject({ previous: { id: originalId, revision: 1, isActive: false, startTime: '07:00:00' }, replacement: { revision: 2, isActive: true, startTime: '07:05:00' } });
    const secondId = revise.body.replacement.id as string;
    expect((await actor.agent.get(`/api/time-slots/${originalId}`)).body).toMatchObject({ revision: 1, isActive: false, displayLabel: 'Tiết 1', startTime: '07:00:00' });
    expect((await actor.agent.post(`/api/time-slots/${originalId}/revise`).set('Origin', testOrigin).send({ displayLabel: 'Nhánh sai', startTime: '08:00:00', endTime: '08:45:00', allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false })).status).toBe(409);
    expect((await actor.agent.post(`/api/time-slots/${secondId}/retire`).set('Origin', testOrigin).send({})).body).toMatchObject({ revision: 2, isActive: false });
    const restored = await actor.agent.post(`/api/time-slots/${secondId}/revise`).set('Origin', testOrigin).send({
      displayLabel: 'Tiết 1 phục hồi', startTime: '07:10:00', endTime: '07:55:00',
      allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false,
    });
    expect(restored.body).toMatchObject({ previous: { revision: 2, isActive: false }, replacement: { revision: 3, isActive: true } });
    expect(await harness.prisma.timeSlotDefinition.count({ where: { academicYearId: academicYear.id } })).toBe(3);
  });

  it('returns both active and inactive revisions by default and supports filters', async () => {
    const academicYear = await year();
    const actor = await manager();
    const created = await actor.agent.post(`/api/academic-years/${academicYear.id}/time-slots`).set('Origin', testOrigin).send(baseSlot());
    await actor.agent.post(`/api/time-slots/${created.body.id as string}/retire`).set('Origin', testOrigin).send({});
    const all = await actor.agent.get(`/api/academic-years/${academicYear.id}/time-slots?page=1&pageSize=20`);
    const active = await actor.agent.get(`/api/academic-years/${academicYear.id}/time-slots?isActive=true`);
    const inactive = await actor.agent.get(`/api/academic-years/${academicYear.id}/time-slots?weekday=MONDAY&session=MORNING&isActive=false`);
    expect(all.body.total).toBe(1);
    expect(active.body.total).toBe(0);
    expect(inactive.body.total).toBe(1);
    expect((await actor.agent.get(`/api/academic-years/${academicYear.id}/time-slots?isActive=not-a-boolean`)).status).toBe(400);
  });

  it('audits create, revise, retire and no-op retire in their successful transactions only', async () => {
    const academicYear = await year();
    const actor = await manager();
    const created = await actor.agent.post(`/api/academic-years/${academicYear.id}/time-slots`).set('Origin', testOrigin).set('X-Request-Id', 'create-request').send(baseSlot());
    const revised = await actor.agent.post(`/api/time-slots/${created.body.id as string}/revise`).set('Origin', testOrigin).send({ displayLabel: 'Mới', startTime: '07:05:00', endTime: '07:50:00', allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false });
    const replacementId = revised.body.replacement.id as string;
    await actor.agent.post(`/api/time-slots/${replacementId}/retire`).set('Origin', testOrigin).send({});
    await actor.agent.post(`/api/time-slots/${replacementId}/retire`).set('Origin', testOrigin).send({});
    await actor.agent.get(`/api/time-slots/${replacementId}`);

    const events = await harness.prisma.auditEvent.findMany({ where: { entityType: 'TimeSlotDefinition' }, orderBy: { createdAt: 'asc' } });
    expect(events.map((event) => event.action)).toEqual(['TIME_SLOT_CREATED', 'TIME_SLOT_REVISED', 'TIME_SLOT_RETIRED', 'TIME_SLOT_RETIRED']);
    expect(events[0]?.requestId).toBe('create-request');
    expect(events[1]?.metadata).toMatchObject({ previousRevisionId: created.body.id, replacementRevisionId: replacementId });
    expect(events[3]?.metadata).toMatchObject({ noOp: true });
  });

  it('permits retirement of a referenced slot and preserves the exact TimetableEntry reference', async () => {
    const academicYear = await year();
    const actor = await manager();
    const created = await actor.agent.post(`/api/academic-years/${academicYear.id}/time-slots`).set('Origin', testOrigin).send(baseSlot());
    const slotId = created.body.id as string;
    const teacher = await harness.prisma.user.create({ data: { username: `teacher-${crypto.randomUUID()}`, passwordHash: 'fixture', status: UserStatus.ACTIVE, mustChangePassword: false } });
    const schoolClass = await harness.prisma.schoolClass.create({ data: { academicYearId: academicYear.id, code: normalizedCode('C'), name: 'Lớp 10A', gradeLevel: 10 } });
    const subject = await harness.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Môn kiểm thử' } });
    const assignment = await harness.prisma.teachingAssignment.create({ data: { academicYearId: academicYear.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: teacher.id, validFrom: new Date('2026-08-01T00:00:00.000Z') } });
    const version = await harness.prisma.timetableVersion.create({ data: { academicYearId: academicYear.id, versionNumber: 1, createdByUserId: actor.id } });
    const entry = await harness.prisma.timetableEntry.create({ data: { timetableVersionId: version.id, academicYearId: academicYear.id, weekday: AcademicWeekday.MONDAY, timeSlotDefinitionId: slotId, schoolClassId: schoolClass.id, subjectId: subject.id, teachingAssignmentId: assignment.id, teacherUserId: teacher.id } });

    expect((await actor.agent.post(`/api/time-slots/${slotId}/retire`).set('Origin', testOrigin).send({})).status).toBe(200);
    const persisted = await harness.prisma.timetableEntry.findUnique({ where: { id: entry.id }, include: { timeSlotDefinition: true } });
    expect(persisted).toMatchObject({ timeSlotDefinitionId: slotId, timeSlotDefinition: { id: slotId, displayLabel: 'Tiết 1', isActive: false } });
  });

  it('allows exactly one concurrent revision and leaves one active replacement', async () => {
    const academicYear = await year();
    const actor = await manager();
    const created = await actor.agent.post(`/api/academic-years/${academicYear.id}/time-slots`).set('Origin', testOrigin).send(baseSlot());
    const sourceId = created.body.id as string;
    const payload = { displayLabel: 'Đồng thời', startTime: '07:05:00', endTime: '07:50:00', allowRegularTeaching: true, allowMakeupTeaching: false, allowSelfStudy: false };
    const [first, second] = await Promise.all([
      actor.agent.post(`/api/time-slots/${sourceId}/revise`).set('Origin', testOrigin).send(payload),
      actor.agent.post(`/api/time-slots/${sourceId}/revise`).set('Origin', testOrigin).send(payload),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const rows = await harness.prisma.timeSlotDefinition.findMany({ where: { academicYearId: academicYear.id, weekday: AcademicWeekday.MONDAY, session: TimeSlotSession.MORNING, ordinal: 1 } });
    expect(rows).toHaveLength(2);
    expect(rows.filter((slot) => slot.isActive)).toHaveLength(1);
    expect(rows.filter((slot) => slot.revision === 2)).toHaveLength(1);
  });
});
