import { AcademicWeekKind, AcademicWeekday, CatalogStatus } from '@prisma/client';
import request, { Agent } from 'supertest';
import { Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';

const capability = 'ACADEMIC_STRUCTURE_MANAGE';
const origin = { Origin: testOrigin };

function calendarPayload(note = 'Phiên chuẩn'): Record<string, unknown> {
  return {
    startDate: '2026-08-03', endDate: '2026-09-18', officialWeekCount: 5, reserveWeekCount: 1,
    teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], note,
    semesters: [{ code: ' hk1 ', name: ' Học kỳ Một ', ordinal: 1, startDate: '2026-08-03', endDate: '2026-09-18' }],
    weeks: [
      { kind: 'OFFICIAL', officialWeekNumber: 1, displayLabel: ' Tuần 1 ', sortOrder: 1, segments: [{ label: ' 1 ', segmentOrder: 1, startDate: '2026-08-03', endDate: '2026-08-07' }] },
      { kind: 'OFFICIAL', officialWeekNumber: 2, displayLabel: 'Tuần 2', sortOrder: 2, segments: [{ label: '2', segmentOrder: 1, startDate: '2026-08-10', endDate: '2026-08-14' }] },
      { kind: 'OFFICIAL', officialWeekNumber: 3, displayLabel: 'Tuần 3', sortOrder: 3, segments: [{ label: '3', segmentOrder: 1, startDate: '2026-08-17', endDate: '2026-08-21' }] },
      { kind: 'OFFICIAL', officialWeekNumber: 4, displayLabel: 'Tuần 4', sortOrder: 4, segments: [{ label: '4', segmentOrder: 1, startDate: '2026-08-24', endDate: '2026-08-28' }] },
      { kind: 'OFFICIAL', officialWeekNumber: 5, displayLabel: 'Tuần 5', sortOrder: 5, segments: [
        { label: '5a', segmentOrder: 1, startDate: '2026-08-31', endDate: '2026-09-01' },
        { label: '5b', segmentOrder: 2, startDate: '2026-09-07', endDate: '2026-09-11' },
      ] },
      { kind: 'RESERVE', reserveWeekNumber: 1, displayLabel: ' DP1 ', sortOrder: 6, segments: [{ label: 'DP1', segmentOrder: 1, startDate: '2026-09-14', endDate: '2026-09-18' }] },
    ],
    interruptions: [{ code: ' pause ', name: ' Tạm nghỉ ', startDate: '2026-09-02', endDate: '2026-09-06' }],
  };
}

integration('Academic structure control plane (isolated PostgreSQL integration)', () => {
  const h = new Phase01Harness();

  beforeAll(async () => h.start());
  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities([
      { key: capability, scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  });
  afterAll(async () => h.stop());

  async function manager(): Promise<{ agent: Agent; id: string }> {
    return h.actor({ grants: [{ capabilityKey: capability }] });
  }
  async function createYear(agent: Agent, code = '2026-2027'): Promise<{ id: string; code: string }> {
    const response = await agent.post('/api/academic-years').set(origin).send({ code: ` ${code} `, name: ' Năm học thử nghiệm ' });
    expect(response.status).toBe(201);
    return response.body as { id: string; code: string };
  }

  it('enforces authentication, explicit capability, password-change and CSRF policy', async () => {
    expect((await request(h.app.getHttpServer()).get('/api/academic-years')).status).toBe(401);
    const none = await h.actor();
    expect((await none.agent.get('/api/academic-years')).status).toBe(403);
    expect(await h.prisma.auditEvent.count({ where: { actorUserId: none.id, action: 'AUTHORIZATION_DENIED' } })).toBe(1);
    const systemAdmin = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    expect((await systemAdmin.agent.get('/api/academic-years')).status).toBe(403);
    const firstLogin = await h.actor({ grants: [{ capabilityKey: capability }], mustChangePassword: true });
    expect((await firstLogin.agent.get('/api/academic-years')).status).toBe(403);
    const authorized = await manager();
    expect((await authorized.agent.get('/api/academic-years')).status).toBe(200);
    expect((await authorized.agent.post('/api/academic-years').send({ code: 'X', name: 'X' })).status).toBe(403);
    expect((await authorized.agent.post('/api/academic-years').set(origin).send({ code: 'X', name: 'X' })).status).toBe(201);
  });

  it('manages academic years with normalization, strict bodies, pagination and atomic audits', async () => {
    const { agent } = await manager();
    const first = await createYear(agent, ' b-year ');
    expect(first.code).toBe('B-YEAR');
    await createYear(agent, 'A-YEAR');
    expect((await agent.post('/api/academic-years').set(origin).send({ code: 'b-year', name: 'Duplicate' })).status).toBe(409);
    expect((await agent.post('/api/academic-years').set(origin).send({ code: 'C', name: 'C', unknown: true })).status).toBe(400);
    const list = await agent.get('/api/academic-years?page=1&pageSize=1');
    expect(list.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    expect(list.body.items[0].code).toBe('A-YEAR');
    expect((await agent.get('/api/academic-years/not-a-uuid')).status).toBe(400);
    expect((await agent.get(`/api/academic-years/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await agent.patch(`/api/academic-years/${first.id}`).set(origin).send({})).status).toBe(400);
    const updated = await agent.patch(`/api/academic-years/${first.id}`).set(origin).send({ code: ' c-year ', name: ' Tên sửa ' });
    expect(updated.body).toMatchObject({ code: 'C-YEAR', name: 'Tên sửa' });
    const before = await h.prisma.auditEvent.count({ where: { action: 'ACADEMIC_YEAR_UPDATED', result: 'SUCCESS' } });
    expect((await agent.patch(`/api/academic-years/${first.id}`).set(origin).set('X-Request-Id', 'duplicate-year-patch').send({ code: 'A-YEAR' })).status).toBe(409);
    expect(await h.prisma.auditEvent.count({ where: { action: 'ACADEMIC_YEAR_UPDATED', result: 'SUCCESS' } })).toBe(before);
  });

  it('creates immutable complete versions with server numbering and deterministic public-safe responses', async () => {
    const { agent } = await manager(); const year = await createYear(agent);
    const first = await agent.post(`/api/academic-years/${year.id}/calendar-versions`).set(origin).send(calendarPayload());
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ versionNumber: 1, isActive: false, startDate: '2026-08-03', endDate: '2026-09-18' });
    expect(first.body.startDate).not.toContain('T');
    expect(first.body.semesters.map((item: { code: string }) => item.code)).toEqual(['HK1']);
    expect(first.body.weeks.map((item: { sortOrder: number }) => item.sortOrder)).toEqual([1, 2, 3, 4, 5, 6]);
    const week5 = first.body.weeks.find((item: { officialWeekNumber: number }) => item.officialWeekNumber === 5);
    expect(week5.segments.map((item: { label: string }) => item.label)).toEqual(['5a', '5b']);
    expect(new Set(week5.segments.map((item: { id: string }) => item.id)).size).toBe(2);
    const storedWeek5 = await h.prisma.academicWeek.findFirstOrThrow({
      where: { calendarVersionId: first.body.id as string, officialWeekNumber: 5 }, include: { segments: true },
    });
    expect(storedWeek5.segments).toHaveLength(2);
    expect(storedWeek5.segments.every((segment) => segment.academicWeekId === storedWeek5.id)).toBe(true);
    const dp1 = first.body.weeks.find((item: { displayLabel: string }) => item.displayLabel === 'DP1');
    expect(dp1).toMatchObject({ kind: 'RESERVE', reserveWeekNumber: 1, officialWeekNumber: null });
    const second = await agent.post(`/api/academic-years/${year.id}/calendar-versions`).set(origin).send(calendarPayload('Phiên 2'));
    expect(second.body.versionNumber).toBe(2);
    const list = await agent.get(`/api/academic-years/${year.id}/calendar-versions?page=1&pageSize=1`);
    expect(list.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(list.body.items[0].versionNumber).toBe(2);
    expect(list.body.items[0]).not.toHaveProperty('weeks');
    expect((await agent.get(`/api/academic-calendar-versions/${first.body.id as string}`)).body.weeks).toHaveLength(6);
  });

  it('rejects client lifecycle fields, non-civil dates and invalid aggregate matrices without partial writes or success audits', async () => {
    const { agent } = await manager(); const year = await createYear(agent);
    const forbidden = { ...calendarPayload(), versionNumber: 7 };
    expect((await agent.post(`/api/academic-years/${year.id}/calendar-versions`).set(origin).send(forbidden)).status).toBe(400);
    for (const invalidDate of ['2026-8-03', '2026-02-29', '2026-08-03T00:00:00Z', ' 2026-08-03']) {
      const body = calendarPayload(); body.startDate = invalidDate;
      expect((await agent.post(`/api/academic-years/${year.id}/calendar-versions`).set(origin).send(body)).status).toBe(400);
    }
    const invalids: Array<Record<string, unknown>> = [];
    const duplicateDays = structuredClone(calendarPayload()); duplicateDays.teachingWeekdays = ['MONDAY', 'MONDAY']; invalids.push(duplicateDays);
    const semesterOutside = structuredClone(calendarPayload()); (semesterOutside.semesters as Array<Record<string, unknown>>)[0].endDate = '2026-09-19'; invalids.push(semesterOutside);
    const semesterOverlap = structuredClone(calendarPayload()); (semesterOverlap.semesters as Array<Record<string, unknown>>).push({ code: 'HK2', name: 'HK2', ordinal: 2, startDate: '2026-09-01', endDate: '2026-09-18' }); invalids.push(semesterOverlap);
    const officialGap = structuredClone(calendarPayload()); (officialGap.weeks as Array<Record<string, unknown>>)[1].officialWeekNumber = 3; invalids.push(officialGap);
    const reserveGap = structuredClone(calendarPayload()); reserveGap.reserveWeekCount = 2; invalids.push(reserveGap);
    const discriminator = structuredClone(calendarPayload()); (discriminator.weeks as Array<Record<string, unknown>>)[0].reserveWeekNumber = 1; invalids.push(discriminator);
    const segmentOverlap = structuredClone(calendarPayload()); ((segmentOverlap.weeks as Array<Record<string, unknown>>)[4].segments as Array<Record<string, unknown>>)[1].startDate = '2026-09-01'; invalids.push(segmentOverlap);
    const chronology = structuredClone(calendarPayload()); ((chronology.weeks as Array<Record<string, unknown>>)[1].segments as Array<Record<string, unknown>>)[0].startDate = '2026-08-06'; invalids.push(chronology);
    const interruptionOutside = structuredClone(calendarPayload()); (interruptionOutside.interruptions as Array<Record<string, unknown>>)[0].endDate = '2026-09-19'; invalids.push(interruptionOutside);
    const interruptionOverlap = structuredClone(calendarPayload()); (interruptionOverlap.interruptions as Array<Record<string, unknown>>)[0].startDate = '2026-09-01'; invalids.push(interruptionOverlap);
    const overlappingInterruptions = structuredClone(calendarPayload()); (overlappingInterruptions.interruptions as Array<Record<string, unknown>>).push({ code: 'SECOND', name: 'Second', startDate: '2026-09-04', endDate: '2026-09-06' }); invalids.push(overlappingInterruptions);
    for (const body of invalids) expect((await agent.post(`/api/academic-years/${year.id}/calendar-versions`).set(origin).send(body)).status).toBe(400);
    expect(await h.prisma.academicCalendarVersion.count({ where: { academicYearId: year.id } })).toBe(0);
    expect(await h.prisma.auditEvent.count({ where: { action: 'ACADEMIC_CALENDAR_VERSION_CREATED', result: 'SUCCESS' } })).toBe(0);
  });

  it('activates transactionally, preserves immutable history, audits no-op, and rejects corrupted stored aggregates safely', async () => {
    const { agent } = await manager(); const year = await createYear(agent);
    const first = await agent.post(`/api/academic-years/${year.id}/calendar-versions`).set(origin).send(calendarPayload('First'));
    const second = await agent.post(`/api/academic-years/${year.id}/calendar-versions`).set(origin).send(calendarPayload('Second'));
    expect((await agent.post(`/api/academic-calendar-versions/${first.body.id as string}/activate`).set(origin).send({})).status).toBe(200);
    expect((await agent.post(`/api/academic-calendar-versions/${second.body.id as string}/activate`).set(origin).send({})).status).toBe(200);
    expect(await h.prisma.academicCalendarVersion.count({ where: { academicYearId: year.id, isActive: true } })).toBe(1);
    expect((await h.prisma.academicCalendarVersion.findUniqueOrThrow({ where: { id: first.body.id as string } })).note).toBe('First');
    const noOp = await agent.post(`/api/academic-calendar-versions/${second.body.id as string}/activate`).set(origin).send({});
    expect(noOp.status).toBe(200);
    const noOpAudit = await h.prisma.auditEvent.findFirstOrThrow({ where: { action: 'ACADEMIC_CALENDAR_VERSION_ACTIVATED', entityId: second.body.id as string }, orderBy: { createdAt: 'desc' } });
    expect(noOpAudit.metadata).toMatchObject({ noOp: true });

    const corrupt = await h.prisma.academicCalendarVersion.create({ data: {
      academicYearId: year.id, versionNumber: 99, startDate: new Date('2026-10-01T00:00:00Z'), endDate: new Date('2026-10-31T00:00:00Z'),
      officialWeekCount: 2, reserveWeekCount: 0, teachingWeekdays: [AcademicWeekday.MONDAY],
    } });
    await h.prisma.semester.create({ data: { calendarVersionId: corrupt.id, code: 'ONLY', name: 'Only', ordinal: 1, startDate: corrupt.startDate, endDate: corrupt.endDate } });
    const corruptWeek = await h.prisma.academicWeek.create({ data: { calendarVersionId: corrupt.id, kind: AcademicWeekKind.OFFICIAL, officialWeekNumber: 1, displayLabel: 'One', sortOrder: 1 } });
    await h.prisma.academicWeekSegment.create({ data: { calendarVersionId: corrupt.id, academicWeekId: corruptWeek.id, label: 'One', segmentOrder: 1, startDate: new Date('2026-10-05T00:00:00Z'), endDate: new Date('2026-10-05T00:00:00Z') } });
    const failed = await agent.post(`/api/academic-calendar-versions/${corrupt.id}/activate`).set(origin).set('X-Request-Id', 'corrupt-activate').send({});
    expect(failed.status).toBe(400);
    expect((await h.prisma.academicCalendarVersion.findUniqueOrThrow({ where: { id: second.body.id as string } })).isActive).toBe(true);
    expect((await h.prisma.academicCalendarVersion.findUniqueOrThrow({ where: { id: corrupt.id } })).isActive).toBe(false);
    expect(await h.prisma.auditEvent.count({ where: { requestId: 'corrupt-activate', action: 'ACADEMIC_CALENDAR_VERSION_ACTIVATED', result: 'SUCCESS' } })).toBe(0);
  });

  it('manages year-scoped classes with filters, uniqueness, strict updates and idempotent status audits', async () => {
    const { agent } = await manager(); const firstYear = await createYear(agent, 'Y1'); const secondYear = await createYear(agent, 'Y2');
    const first = await agent.post(`/api/academic-years/${firstYear.id}/classes`).set(origin).send({ code: ' 10a1 ', name: ' Lớp 10A1 ', gradeLevel: 10 });
    expect(first.status).toBe(201); expect(first.body).toMatchObject({ code: '10A1', name: 'Lớp 10A1', gradeLevel: 10, status: 'ACTIVE' });
    expect((await agent.post(`/api/academic-years/${firstYear.id}/classes`).set(origin).send({ code: '10A1', name: 'Duplicate', gradeLevel: 10 })).status).toBe(409);
    expect((await agent.post(`/api/academic-years/${secondYear.id}/classes`).set(origin).send({ code: '10A1', name: 'Other year', gradeLevel: 10 })).status).toBe(201);
    expect((await agent.post(`/api/academic-years/${firstYear.id}/classes`).set(origin).send({ code: 'BAD', name: 'Bad', gradeLevel: 9 })).status).toBe(400);
    await agent.post(`/api/academic-years/${firstYear.id}/classes`).set(origin).send({ code: '11A1', name: '11A1', gradeLevel: 11 });
    await agent.post(`/api/school-classes/${first.body.id as string}/deactivate`).set(origin).send({});
    const filtered = await agent.get(`/api/academic-years/${firstYear.id}/classes?status=INACTIVE&gradeLevel=10`);
    expect(filtered.body.total).toBe(1); expect(filtered.body.items[0].id).toBe(first.body.id);
    expect((await agent.get(`/api/academic-years/${secondYear.id}/classes`)).body.total).toBe(1);
    expect((await agent.get(`/api/school-classes/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await agent.patch(`/api/school-classes/${first.body.id as string}`).set(origin).send({})).status).toBe(400);
    expect((await agent.patch(`/api/school-classes/${first.body.id as string}`).set(origin).send({ status: 'ACTIVE' })).status).toBe(400);
    const updated = await agent.patch(`/api/school-classes/${first.body.id as string}`).set(origin).send({ code: ' 12a ', name: ' 12A ', gradeLevel: 12 });
    expect(updated.body).toMatchObject({ code: '12A', name: '12A', gradeLevel: 12, status: CatalogStatus.INACTIVE });
    const duplicateAuditBefore = await h.prisma.auditEvent.count({ where: { action: 'SCHOOL_CLASS_UPDATED', result: 'SUCCESS' } });
    expect((await agent.patch(`/api/school-classes/${first.body.id as string}`).set(origin).send({ code: '11A1' })).status).toBe(409);
    expect(await h.prisma.auditEvent.count({ where: { action: 'SCHOOL_CLASS_UPDATED', result: 'SUCCESS' } })).toBe(duplicateAuditBefore);
    await agent.post(`/api/school-classes/${first.body.id as string}/activate`).set(origin).send({});
    await agent.post(`/api/school-classes/${first.body.id as string}/activate`).set(origin).send({});
    expect(await h.prisma.auditEvent.count({ where: { entityId: first.body.id as string, action: 'SCHOOL_CLASS_ACTIVATED', result: 'SUCCESS' } })).toBe(2);
  });
});
