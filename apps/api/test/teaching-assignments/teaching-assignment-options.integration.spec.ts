import { CatalogStatus, UserStatus } from '@prisma/client';
import { CivilDateString } from '@baogiang/contracts';
import request, { Agent } from 'supertest';
import { parseCivilDate } from '../../src/common/validation/civil-date';
import { businessMidnight } from '../../src/teaching-assignments/teaching-assignment-policy';
import {
  integration,
  normalizedCode,
  Phase01Harness,
} from '../helpers/phase01-test-harness';

const capability = 'SUBJECT_MANAGE';
const calendarStart: CivilDateString = '2026-08-03';
const calendarEnd: CivilDateString = '2026-09-18';

integration('Teaching assignment workspace options (isolated PostgreSQL integration)', () => {
  const h = new Phase01Harness();

  beforeAll(async () => h.start());
  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities([
      { key: capability, scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'ACADEMIC_STRUCTURE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'USER_MANAGE', scopes: ['SCHOOL_WIDE'] },
    ]);
  });
  afterAll(async () => {
    await h.clean();
    await h.stop();
  });

  async function actor(capabilityKey = capability): Promise<Agent> {
    return (await h.actor({ grants: [{ capabilityKey }] })).agent;
  }

  async function year(activeCalendar = true, createdAt?: Date) {
    const academicYear = await h.prisma.academicYear.create({
      data: {
        code: normalizedCode('Y', 6),
        name: 'Academic year',
        ...(createdAt ? { createdAt } : {}),
      },
    });
    if (activeCalendar) {
      await h.prisma.academicCalendarVersion.create({
        data: {
          academicYearId: academicYear.id,
          versionNumber: 1,
          startDate: parseCivilDate(calendarStart),
          endDate: parseCivilDate(calendarEnd),
          officialWeekCount: 7,
          reserveWeekCount: 0,
          teachingWeekdays: ['MONDAY'],
          isActive: true,
          activatedAt: new Date(),
        },
      });
    }
    return academicYear;
  }

  async function subject(status: CatalogStatus = CatalogStatus.ACTIVE) {
    return h.prisma.subject.create({
      data: { code: normalizedCode('S', 6), name: normalizedCode('Subject', 4), status },
    });
  }

  async function teacher(options: {
    status?: UserStatus;
    profile?: boolean;
    teaching?: boolean;
    name?: string;
  } = {}) {
    return h.prisma.user.create({
      data: {
        username: normalizedCode('teacher-', 8).toLowerCase(),
        passwordHash: 'integration-only',
        status: options.status ?? UserStatus.ACTIVE,
        mustChangePassword: false,
        ...(options.profile === false ? {} : {
          profile: { create: {
            displayName: options.name ?? 'Teacher',
            staffCode: normalizedCode('GV', 5),
            isTeachingStaff: options.teaching ?? true,
          } },
        }),
      },
    });
  }

  async function coverage(
    userId: string,
    subjectId: string,
    start: CivilDateString = calendarStart,
    endExclusive?: CivilDateString,
  ) {
    return h.prisma.staffSubject.create({
      data: {
        userId,
        subjectId,
        validFrom: businessMidnight(start),
        validUntil: endExclusive ? businessMidnight(endExclusive) : null,
      },
    });
  }

  function eligibleUrl(yearId: string, subjectId: string, extra = ''): string {
    return `/api/teaching-assignment-options/academic-years/${yearId}/eligible-teachers` +
      `?subjectId=${subjectId}&validFrom=${calendarStart}${extra}`;
  }

  it('enforces the dedicated capability without CSRF or generic privilege expansion and writes no audit', async () => {
    const academicYear = await year();
    const route = '/api/teaching-assignment-options/academic-years';
    expect((await request(h.app.getHttpServer()).get(route)).status).toBe(401);
    const unrelatedActors: Agent[] = [];
    for (const other of ['SYSTEM_ADMIN', 'ACADEMIC_STRUCTURE_MANAGE', 'USER_MANAGE']) {
      unrelatedActors.push(await actor(other));
    }
    const manager = await actor();
    for (const unrelated of unrelatedActors) {
      expect((await unrelated.get(route)).status).toBe(403);
    }
    const before = await h.prisma.auditEvent.count();
    expect((await manager.get(route)).status).toBe(200);
    expect((await manager.get(`/api/teaching-assignment-options/academic-years/${academicYear.id}`)).status).toBe(200);
    expect(await h.prisma.auditEvent.count()).toBe(before);
    expect((await manager.get('/api/users')).status).toBe(403);
    expect((await manager.get('/api/academic-years')).status).toBe(403);
  });

  it('paginates safe academic-year projections newest first without requiring a calendar', async () => {
    const oldest = await year(false, new Date('2026-01-01T00:00:00.000Z'));
    const middle = await year(true, new Date('2026-02-01T00:00:00.000Z'));
    const newest = await year(false, new Date('2026-03-01T00:00:00.000Z'));
    const response = await (await actor()).get('/api/teaching-assignment-options/academic-years?page=1&pageSize=2');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([newest.id, middle.id]);
    expect(Object.keys(response.body.items[0]).sort()).toEqual(['code', 'id', 'name']);
    expect(response.body.items.some((item: { id: string }) => item.id === oldest.id)).toBe(false);
  });

  it('returns a bounded workspace projection, including historical teachers and a nullable calendar', async () => {
    const academicYear = await year();
    const otherYear = await year(false);
    const activeClass = await h.prisma.schoolClass.create({
      data: { academicYearId: academicYear.id, code: normalizedCode('C', 5), name: 'Active', gradeLevel: 10 },
    });
    const inactiveClass = await h.prisma.schoolClass.create({
      data: { academicYearId: academicYear.id, code: normalizedCode('C', 5), name: 'Inactive', gradeLevel: 11, status: CatalogStatus.INACTIVE },
    });
    const otherClass = await h.prisma.schoolClass.create({
      data: { academicYearId: otherYear.id, code: normalizedCode('C', 5), name: 'Other', gradeLevel: 12 },
    });
    const activeSubject = await subject();
    const inactiveSubject = await subject(CatalogStatus.INACTIVE);
    const historical = await teacher({ status: UserStatus.DISABLED, name: 'Disabled historical' });
    const noProfile = await teacher({ profile: false });
    const otherTeacher = await teacher({ name: 'Other year' });
    for (const [schoolClassId, academicYearId, subjectId, teacherUserId] of [
      [activeClass.id, academicYear.id, activeSubject.id, historical.id],
      [inactiveClass.id, academicYear.id, activeSubject.id, historical.id],
      [activeClass.id, academicYear.id, inactiveSubject.id, noProfile.id],
      [otherClass.id, otherYear.id, activeSubject.id, otherTeacher.id],
    ]) {
      await h.prisma.teachingAssignment.create({ data: {
        schoolClassId,
        academicYearId,
        subjectId,
        teacherUserId,
        validFrom: parseCivilDate(calendarStart),
      } });
    }
    const manager = await actor();
    const response = await manager.get(`/api/teaching-assignment-options/academic-years/${academicYear.id}`);
    expect(response.status).toBe(200);
    expect(response.body.activeCalendar).toEqual(expect.objectContaining({
      versionNumber: 1, startDate: calendarStart, endDate: calendarEnd,
    }));
    expect(Object.keys(response.body.activeCalendar).sort()).toEqual(['endDate', 'id', 'startDate', 'versionNumber']);
    expect(response.body.classes).toHaveLength(2);
    expect(response.body.subjects).toHaveLength(2);
    expect(response.body.historicalTeachers.map((item: { userId: string }) => item.userId).sort())
      .toEqual([historical.id, noProfile.id].sort());
    expect(response.body.historicalTeachers.find((item: { userId: string }) => item.userId === noProfile.id))
      .toMatchObject({ displayName: noProfile.username, staffCode: null, isTeachingStaff: null });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|mustChangePassword|calendarVersionId/);
    expect((await manager.get(`/api/teaching-assignment-options/academic-years/${otherYear.id}`)).body.activeCalendar).toBeNull();
    expect((await manager.get(`/api/teaching-assignment-options/academic-years/${crypto.randomUUID()}`)).status).toBe(404);
  });

  it('requires one active teaching profile with one full exact half-open subject coverage row', async () => {
    const academicYear = await year();
    const target = await subject();
    const otherSubject = await subject();
    const exact = await teacher({ name: 'A exact' });
    const open = await teacher({ name: 'B open' });
    const disabled = await teacher({ status: UserStatus.DISABLED, name: 'C disabled' });
    const noProfile = await teacher({ profile: false });
    const nonTeaching = await teacher({ teaching: false });
    const wrongSubject = await teacher();
    const late = await teacher();
    const early = await teacher();
    const stitched = await teacher();
    await coverage(exact.id, target.id, calendarStart, '2026-09-19');
    await coverage(open.id, target.id);
    await coverage(disabled.id, target.id);
    await coverage(noProfile.id, target.id);
    await coverage(nonTeaching.id, target.id);
    await coverage(wrongSubject.id, otherSubject.id);
    await coverage(late.id, target.id, '2026-08-04');
    await coverage(early.id, target.id, calendarStart, '2026-09-18');
    await coverage(stitched.id, target.id, calendarStart, '2026-08-06');
    await coverage(stitched.id, target.id, '2026-08-06', '2026-09-19');

    const manager = await actor();
    const full = await manager.get(eligibleUrl(academicYear.id, target.id));
    expect(full.status).toBe(200);
    expect(full.body.total).toBe(2);
    expect(full.body.items.map((item: { userId: string }) => item.userId)).toEqual([exact.id, open.id]);

    const short = await manager.get(eligibleUrl(academicYear.id, target.id, '&validUntil=2026-08-05'));
    expect(short.status).toBe(200);
    expect(short.body.items.some((item: { userId: string }) => item.userId === stitched.id)).toBe(true);
    const page = await manager.get(eligibleUrl(academicYear.id, target.id, '&page=2&pageSize=1'));
    expect(page.body).toMatchObject({ page: 2, pageSize: 1, total: 2 });
  });

  it('returns empty results and the complete validation/error matrix', async () => {
    const academicYear = await year();
    const target = await subject();
    const inactive = await subject(CatalogStatus.INACTIVE);
    const manager = await actor();
    expect((await manager.get(eligibleUrl(academicYear.id, target.id))).body).toMatchObject({ items: [], total: 0 });
    expect((await manager.get(eligibleUrl(academicYear.id, inactive.id))).status).toBe(409);
    expect((await manager.get(eligibleUrl(academicYear.id, crypto.randomUUID()))).status).toBe(404);
    expect((await manager.get(eligibleUrl(crypto.randomUUID(), target.id))).status).toBe(404);
    expect((await manager.get(eligibleUrl(academicYear.id, target.id).replace(calendarStart, '2026-02-30'))).status).toBe(400);
    expect((await manager.get(eligibleUrl(academicYear.id, target.id, '&validUntil=2026-08-02'))).status).toBe(400);
    expect((await manager.get(eligibleUrl(academicYear.id, target.id).replace(calendarStart, '2026-08-02'))).status).toBe(400);
    expect((await manager.get(eligibleUrl(academicYear.id, target.id, '&validUntil=2026-09-19'))).status).toBe(400);
    expect((await manager.get(`/api/teaching-assignment-options/academic-years/not-a-uuid`)).status).toBe(400);
    const noCalendar = await year(false);
    expect((await manager.get(eligibleUrl(noCalendar.id, target.id))).status).toBe(409);
  });
});
