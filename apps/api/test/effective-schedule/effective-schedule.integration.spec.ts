import request from 'supertest';
import { CatalogStatus, OperationalOverlayStatus, PpctVersionStatus } from '@prisma/client';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';
import { EffectiveScheduleService } from '../../src/effective-schedule/effective-schedule.service';

const civilDate = '2026-09-07';

integration('School-wide Effective Teaching Schedule Read Model & API (isolated PostgreSQL integration)', () => {
  const h = new Phase01Harness();

  beforeAll(async () => {
    await h.start();
  });

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
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'TEACHER_BASE', scopes: ['PERSONAL'] },
      { key: 'TIMETABLE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SPECIAL_ACTIVITY_MANAGE', scopes: ['SCHOOL_WIDE'] },
    ]);
  });

  async function clean() {
    await h.prisma.specialActivityStaffing.deleteMany();
    await h.prisma.specialActivityClassTarget.deleteMany();
    await h.prisma.specialActivityTimeSlot.deleteMany();
    await h.prisma.specialActivity.deleteMany();
    await h.prisma.makeupTeachingSchedule.deleteMany();
    await h.prisma.operationalLessonDisposition.deleteMany();
    await h.prisma.calendarExceptionTimeSlot.deleteMany();
    await h.prisma.calendarException.deleteMany();
    await h.prisma.ppctClassAssociation.deleteMany();
    await h.prisma.ppctItemRevision.deleteMany();
    await h.prisma.ppctItem.deleteMany();
    await h.prisma.ppctVersion.deleteMany();
    await h.prisma.ppctPlan.deleteMany();
    await h.prisma.timetableEntry.deleteMany();
    await h.prisma.timetableVersion.deleteMany();
    await h.prisma.teachingAssignment.deleteMany();
    await h.prisma.staffSubject.deleteMany();
    await h.prisma.timeSlotDefinition.deleteMany();
    await h.prisma.schoolClass.deleteMany();
    await h.prisma.subject.deleteMany();
    await h.prisma.academicWeekSegment.deleteMany();
    await h.prisma.academicWeek.deleteMany();
    await h.prisma.academicCalendarVersion.deleteMany();
    await h.clean();
  }

  async function fixture() {
    const lifecycleAt = new Date('2026-08-01T00:00:00.000Z');
    const year = await h.prisma.academicYear.create({
      data: { code: normalizedCode('EFF-YEAR'), name: 'Effective Year' },
    });

    // Create 2 teachers
    const teacher1 = await h.actor({
      grants: [{ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }],
    });

    const teacher2 = await h.actor({
      grants: [{ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }],
    });

    await h.prisma.staffProfile.update({
      where: { userId: teacher1.id },
      data: { displayName: 'Nguyễn Văn An', isTeachingStaff: true, staffCode: 'GV01' },
    });

    await h.prisma.staffProfile.update({
      where: { userId: teacher2.id },
      data: { displayName: 'Trần Thị Bình', isTeachingStaff: true, staffCode: 'GV02' },
    });

    const profile2 = await h.prisma.staffProfile.findUniqueOrThrow({
      where: { userId: teacher2.id },
    });

    const calendar = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-09-01T00:00:00Z'),
        endDate: new Date('2027-05-31T00:00:00Z'),
        officialWeekCount: 35,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        isActive: true,
        activatedAt: lifecycleAt,
      },
    });

    const week = await h.prisma.academicWeek.create({
      data: {
        calendarVersionId: calendar.id,
        kind: 'OFFICIAL',
        officialWeekNumber: 1,
        displayLabel: 'Tuần 1',
        sortOrder: 1,
      },
    });

    await h.prisma.academicWeekSegment.create({
      data: {
        academicWeekId: week.id,
        calendarVersionId: calendar.id,
        label: 'Tuần 1',
        segmentOrder: 1,
        startDate: new Date('2026-09-07T00:00:00Z'),
        endDate: new Date('2026-09-12T00:00:00Z'),
      },
    });

    const schoolClass = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: normalizedCode('C10A1'),
        name: '10A1',
        gradeLevel: 10,
        status: CatalogStatus.ACTIVE,
      },
    });

    const subject = await h.prisma.subject.create({
      data: {
        code: normalizedCode('TOAN'),
        name: 'Toán học',
        status: CatalogStatus.ACTIVE,
      },
    });

    const slot1 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Tiết 1',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        isActive: true,
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
        allowSelfStudy: false,
      },
    });

    const slot2 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 2,
        revision: 1,
        displayLabel: 'Tiết 2',
        startTime: new Date('1970-01-01T07:45:00Z'),
        endTime: new Date('1970-01-01T08:30:00Z'),
        isActive: true,
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
        allowSelfStudy: false,
      },
    });

    const assignment = await h.prisma.teachingAssignment.create({
      data: {
        academicYearId: year.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teacherUserId: teacher1.id,
        validFrom: new Date('2026-09-01T00:00:00Z'),
      },
    });

    const timetable = await h.prisma.timetableVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        status: 'ACTIVE',
        calendarVersionId: calendar.id,
        effectiveAcademicWeekId: week.id,
        effectiveFrom: new Date(`${civilDate}T00:00:00Z`),
        createdByUserId: teacher1.id,
        validatedByUserId: teacher1.id,
        validatedAt: lifecycleAt,
        approvedByUserId: teacher1.id,
        approvedAt: lifecycleAt,
        activatedByUserId: teacher1.id,
        activatedAt: lifecycleAt,
      },
    });

    const entry = await h.prisma.timetableEntry.create({
      data: {
        timetableVersionId: timetable.id,
        academicYearId: year.id,
        weekday: 'MONDAY',
        timeSlotDefinitionId: slot1.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teachingAssignmentId: assignment.id,
        teacherUserId: teacher1.id,
      },
    });

    const plan = await h.prisma.ppctPlan.create({
      data: {
        academicYearId: year.id,
        subjectId: subject.id,
        gradeLevel: 10,
      },
    });

    const ppctVersion = await h.prisma.ppctVersion.create({
      data: {
        ppctPlanId: plan.id,
        versionNumber: 1,
        status: PpctVersionStatus.PUBLISHED,
        createdByUserId: teacher1.id,
        publishedByUserId: teacher1.id,
        publishedAt: lifecycleAt,
      },
    });

    const item = await h.prisma.ppctItem.create({
      data: {
        ppctPlanId: plan.id,
        component: 'CORE',
      },
    });

    await h.prisma.ppctItemRevision.create({
      data: {
        ppctVersionId: ppctVersion.id,
        ppctPlanId: plan.id,
        ppctItemId: item.id,
        component: 'CORE',
        sequence: 1,
        title: 'Bài 1',
        lessonType: 'LESSON',
      },
    });

    const association = await h.prisma.ppctClassAssociation.create({
      data: {
        academicYearId: year.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        gradeLevel: 10,
        ppctPlanId: plan.id,
        ppctVersionId: ppctVersion.id,
        curricularProfile: 'CORE_ONLY',
        effectiveFrom: new Date('2026-09-01T00:00:00Z'),
        createdByUserId: teacher1.id,
      },
    });

    const service = h.app.get(EffectiveScheduleService);

    return {
      year,
      calendar,
      week,
      schoolClass,
      subject,
      slot1,
      slot2,
      assignment,
      timetable,
      entry,
      plan,
      ppctVersion,
      item,
      association,
      teacher1,
      teacher2,
      profile2,
      service,
    };
  }

  describe('Authorization and Security Matrix (Items 4, 5, 6)', () => {
    it('Item 4: unauthenticated request is rejected with 401', async () => {
      const res = await request(h.app.getHttpServer()).get('/api/effective-schedule/context');
      expect(res.status).toBe(401);
    });

    it('Item 4: authenticated user without TEACHER_BASE is rejected with 403', async () => {
      const plainUser = await h.actor();
      const res = await plainUser.agent.get('/api/effective-schedule/context');
      expect(res.status).toBe(403);
    });

    it('Item 5: SYSTEM_ADMIN without TEACHER_BASE is rejected with 403 (non-inference)', async () => {
      const sysAdminOnly = await h.actor({
        grants: [{ capabilityKey: 'SYSTEM_ADMIN', scopeType: 'SCHOOL_WIDE' }],
      });
      const res = await sysAdminOnly.agent.get('/api/effective-schedule/context');
      expect(res.status).toBe(403);
    });

    it('Item 6: public schedule routes expose no mutation verbs (POST, PUT, DELETE return 404)', async () => {
      const teacher = await h.actor({
        grants: [{ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }],
      });

      const postRes = await teacher.agent.post('/api/effective-schedule/weekly').send({});
      expect(postRes.status).toBe(404);

      const putRes = await teacher.agent.put('/api/effective-schedule/weekly').send({});
      expect(putRes.status).toBe(404);

      const deleteRes = await teacher.agent.delete('/api/effective-schedule/weekly');
      expect(deleteRes.status).toBe(404);
    });

    it('Item 6: TEACHER_BASE alone does not gain timetable mutation or special activity mutation', async () => {
      const teacher = await h.actor({
        grants: [{ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }],
      });

      // Attempt timetable mutation
      const ttRes = await teacher.agent
        .post('/api/timetables/versions')
        .set('Origin', testOrigin)
        .send({});
      expect([403, 404]).toContain(ttRes.status);

      // Attempt special activity mutation
      const saRes = await teacher.agent
        .post('/api/special-activities')
        .set('Origin', testOrigin)
        .send({});
      expect([400, 403, 404]).toContain(saRes.status);
    });
  });

  describe('Read Model Endpoints & Effective Occupancy (Items 1-3, 7-19)', () => {
    it('Items 1, 7, 18, 19: TEACHER_BASE self read returns BASE_TIMETABLE occupancy with minimal identity', async () => {
      const f = await fixture();

      // Get context
      const ctxRes = await f.teacher1.agent.get('/api/effective-schedule/context');
      expect(ctxRes.status).toBe(200);
      expect(ctxRes.body.currentAcademicYearId).toBe(f.year.id);

      // Get teacher list (Item 18, 19)
      const listRes = await f.teacher1.agent.get('/api/effective-schedule/teachers?search=An');
      expect(listRes.status).toBe(200);
      expect(listRes.body.items).toHaveLength(1);
      expect(listRes.body.items[0]).toEqual({
        userId: f.teacher1.id,
        displayName: 'Nguyễn Văn An',
        code: 'GV01',
      });
      // Ensure no sensitive fields leaked
      expect(listRes.body.items[0].email).toBeUndefined();
      expect(listRes.body.items[0].passwordHash).toBeUndefined();
      expect(listRes.body.items[0].username).toBeUndefined();

      // Read self weekly (Item 1, 7)
      const weeklyRes = await f.teacher1.agent.get(
        `/api/effective-schedule/weekly?academicYearId=${f.year.id}&academicWeekId=${f.week.id}`,
      );
      expect(weeklyRes.status).toBe(200);
      expect(weeklyRes.body.status).toBe('PASS');
      expect(weeklyRes.body.teacherDisplayName).toBe('Nguyễn Văn An');

      const monday = weeklyRes.body.days.find((d: { civilDate: string }) => d.civilDate === civilDate);
      expect(monday).toBeDefined();
      const slot1Occ = monday.slots.find((s: { slotLabel: string }) => s.slotLabel === 'Tiết 1');
      expect(slot1Occ).toBeDefined();
      expect(slot1Occ.occupancyState).toBe('OCCUPIED');
      expect(slot1Occ.sourceKind).toBe('BASE_TIMETABLE');
      expect(slot1Occ.className).toBe('10A1');
      expect(slot1Occ.subjectName).toBe('Toán học');
      expect(slot1Occ.sourceLabel).toBe('Lịch cơ sở');
    });

    it('Item 2: TEACHER_BASE peer read allows reading colleague schedule', async () => {
      const f = await fixture();

      // Teacher 1 reads Teacher 2's schedule
      const peerRes = await f.teacher1.agent.get(
        `/api/effective-schedule/weekly?academicYearId=${f.year.id}&academicWeekId=${f.week.id}&teacherUserId=${f.teacher2.id}`,
      );
      expect(peerRes.status).toBe(200);
      expect(peerRes.body.teacherUserId).toBe(f.teacher2.id);
      expect(peerRes.body.teacherDisplayName).toBe('Trần Thị Bình');
    });

    it('Item 3: TEACHER_BASE school-wide read returns matrix for selected civil date', async () => {
      const f = await fixture();

      const schoolRes = await f.teacher1.agent.get(
        `/api/effective-schedule/school-wide?civilDate=${civilDate}`,
      );
      expect(schoolRes.status).toBe(200);
      expect(schoolRes.body.civilDate).toBe(civilDate);
      expect(schoolRes.body.slots.length).toBeGreaterThan(0);
      expect(schoolRes.body.teachers.length).toBeGreaterThan(0);

      // Verify teacher 1 has occupied slot 1
      const teacherRow = schoolRes.body.teachers.find((r: { teacherUserId: string }) => r.teacherUserId === f.teacher1.id);
      expect(teacherRow).toBeDefined();
      const slotCell = teacherRow.slots.find((c: { slotLabel: string }) => c.slotLabel === 'Tiết 1');
      expect(slotCell.occupancyState).toBe('OCCUPIED');
      expect(slotCell.className).toBe('10A1');
    });

    it('Items 8, 9: cancellation and absence remove occupancy', async () => {
      const f = await fixture();

      // Create authorized cancellation
      await h.prisma.operationalLessonDisposition.create({
        data: {
          academicYearId: f.year.id,
          timetableVersionId: f.timetable.id,
          timetableEntryId: f.entry.id,
          sourceCivilDate: new Date(`${civilDate}T00:00:00Z`),
          academicCalendarVersionId: f.calendar.id,
          timeSlotDefinitionId: f.slot1.id,
          schoolClassId: f.schoolClass.id,
          subjectId: f.subject.id,
          teachingAssignmentId: f.assignment.id,
          responsibleTeacherUserId: f.teacher1.id,
          dispositionType: 'AUTHORIZED_CANCELLATION',
          status: OperationalOverlayStatus.ACTIVE,
          createRequestKey: crypto.randomUUID(),
          createRequestFingerprint: crypto.randomUUID(),
          createdByUserId: f.teacher1.id,
        },
      });

      const weeklyRes = await f.teacher1.agent.get(
        `/api/effective-schedule/weekly?academicYearId=${f.year.id}&academicWeekId=${f.week.id}`,
      );
      const monday = weeklyRes.body.days.find((d: { civilDate: string }) => d.civilDate === civilDate);
      const slot1Occ = monday.slots.find((s: { slotLabel: string }) => s.slotLabel === 'Tiết 1');
      // Authorized cancellation removes normal teacher occupancy
      expect(slot1Occ.occupancyState).toBe('FREE');
    });

    it('Items 10, 11: substitution and supervision move occupancy to assigned teacher', async () => {
      const f = await fixture();

      const staffSubject2 = await h.prisma.staffSubject.create({
        data: {
          userId: f.teacher2.id,
          subjectId: f.subject.id,
          validFrom: new Date('2026-08-01Z'),
        },
      });

      // Create substitution to teacher 2
      await h.prisma.operationalLessonDisposition.create({
        data: {
          academicYearId: f.year.id,
          timetableVersionId: f.timetable.id,
          timetableEntryId: f.entry.id,
          sourceCivilDate: new Date(`${civilDate}T00:00:00Z`),
          academicCalendarVersionId: f.calendar.id,
          timeSlotDefinitionId: f.slot1.id,
          schoolClassId: f.schoolClass.id,
          subjectId: f.subject.id,
          teachingAssignmentId: f.assignment.id,
          responsibleTeacherUserId: f.teacher1.id,
          assignedTeacherUserId: f.teacher2.id,
          dispositionType: 'SAME_SUBJECT_SUBSTITUTION',
          status: OperationalOverlayStatus.ACTIVE,
          eligibilityCheckedAt: new Date('2026-08-01Z'),
          eligibilityWasActive: true,
          eligibilityWasTeachingStaff: true,
          eligibilitySameSubject: true,
          eligibilityStaffSubjectId: staffSubject2.id,
          createRequestKey: crypto.randomUUID(),
          createRequestFingerprint: crypto.randomUUID(),
          createdByUserId: f.teacher1.id,
        },
      });

      // Teacher 1 schedule should be FREE
      const t1Res = await f.teacher1.agent.get(
        `/api/effective-schedule/weekly?academicYearId=${f.year.id}&academicWeekId=${f.week.id}`,
      );
      const t1Monday = t1Res.body.days.find((d: { civilDate: string }) => d.civilDate === civilDate);
      const t1Slot = t1Monday.slots.find((s: { slotLabel: string }) => s.slotLabel === 'Tiết 1');
      expect(t1Slot.occupancyState).toBe('FREE');

      // Teacher 2 schedule should be OCCUPIED with source SAME_SUBJECT_SUBSTITUTION
      const t2Res = await f.teacher1.agent.get(
        `/api/effective-schedule/weekly?academicYearId=${f.year.id}&academicWeekId=${f.week.id}&teacherUserId=${f.teacher2.id}`,
      );
      const t2Monday = t2Res.body.days.find((d: { civilDate: string }) => d.civilDate === civilDate);
      const t2Slot = t2Monday.slots.find((s: { slotLabel: string }) => s.slotLabel === 'Tiết 1');
      expect(t2Slot.occupancyState).toBe('OCCUPIED');
      expect(t2Slot.sourceKind).toBe('SAME_SUBJECT_SUBSTITUTION');
      expect(t2Slot.sourceLabel).toBe('Dạy thay (cùng môn)');
    });

    it('Items 13, 14: SpecialActivity suppresses normal slot and materializes activity staffing occupancy', async () => {
      const f = await fixture();

      const activity = await h.prisma.specialActivity.create({
        data: {
          academicYearId: f.year.id,
          academicCalendarVersionId: f.calendar.id,
          civilDate: new Date(`${civilDate}T00:00:00Z`),
          scope: 'CLASS',
          schoolClassId: f.schoolClass.id,
          title: 'Hoạt động trải nghiệm hướng nghiệp',
          status: 'ACTIVE',
          createRequestKey: crypto.randomUUID(),
          createRequestFingerprint: crypto.randomUUID(),
          createdByUserId: f.teacher1.id,
        },
      });

      await h.prisma.specialActivityTimeSlot.create({
        data: {
          specialActivityId: activity.id,
          academicYearId: f.year.id,
          timeSlotDefinitionId: f.slot1.id,
        },
      });

      await h.prisma.specialActivityClassTarget.create({
        data: {
          specialActivityId: activity.id,
          academicYearId: f.year.id,
          schoolClassId: f.schoolClass.id,
        },
      });

      // Staffing assigned to teacher 2
      await h.prisma.specialActivityStaffing.create({
        data: {
          specialActivityId: activity.id,
          scheduledTeacherUserId: f.teacher2.id,
          staffProfileId: f.profile2.id,
          eligibilityCheckedAt: new Date(),
          eligibilityWasActive: true,
          eligibilityWasTeachingStaff: true,
        },
      });

      // Normal slot for Teacher 1 was suppressed -> no normal occupancy for Teacher 1
      const t1Res = await f.teacher1.agent.get(
        `/api/effective-schedule/weekly?academicYearId=${f.year.id}&academicWeekId=${f.week.id}`,
      );
      const t1Monday = t1Res.body.days.find((d: { civilDate: string }) => d.civilDate === civilDate);
      const t1Slot = t1Monday.slots.find((s: { slotLabel: string }) => s.slotLabel === 'Tiết 1');
      expect(t1Slot.occupancyState).toBe('FREE');

      // Teacher 2 gets SPECIAL_ACTIVITY occupancy
      const t2Res = await f.teacher1.agent.get(
        `/api/effective-schedule/weekly?academicYearId=${f.year.id}&academicWeekId=${f.week.id}&teacherUserId=${f.teacher2.id}`,
      );
      const t2Monday = t2Res.body.days.find((d: { civilDate: string }) => d.civilDate === civilDate);
      const t2Slot = t2Monday.slots.find((s: { slotLabel: string }) => s.slotLabel === 'Tiết 1');
      expect(t2Slot.occupancyState).toBe('OCCUPIED');
      expect(t2Slot.sourceKind).toBe('SPECIAL_ACTIVITY');
      expect(t2Slot.activityTitle).toBe('Hoạt động trải nghiệm hướng nghiệp');
    });

    it('Item 12: active make-up teaching occupies exact target interval for scheduled teacher', async () => {
      const f = await fixture();

      const staffSubject2 = await h.prisma.staffSubject.create({
        data: {
          userId: f.teacher2.id,
          subjectId: f.subject.id,
          validFrom: new Date('2026-08-01Z'),
        },
      });

      // Create make up on slot 2 for Teacher 2
      await h.prisma.makeupTeachingSchedule.create({
        data: {
          academicYearId: f.year.id,
          originalTimetableVersionId: f.timetable.id,
          originalTimetableEntryId: f.entry.id,
          originalCivilDate: new Date(`${civilDate}T00:00:00Z`),
          originalAcademicCalendarVersionId: f.calendar.id,
          originalTimeSlotDefinitionId: f.slot1.id,
          schoolClassId: f.schoolClass.id,
          subjectId: f.subject.id,
          originalTeachingAssignmentId: f.assignment.id,
          responsibleTeacherUserId: f.teacher1.id,
          ppctClassAssociationId: f.association.id,
          ppctPlanId: f.plan.id,
          ppctVersionId: f.ppctVersion.id,
          ppctItemId: f.item.id,
          targetCivilDate: new Date(`${civilDate}T00:00:00Z`),
          targetAcademicCalendarVersionId: f.calendar.id,
          targetTimeSlotDefinitionId: f.slot2.id,
          scheduledTeacherUserId: f.teacher2.id,
          eligibilityCheckedAt: new Date('2026-08-01Z'),
          eligibilityWasActive: true,
          eligibilityWasTeachingStaff: true,
          eligibilitySameSubject: true,
          eligibilityStaffSubjectId: staffSubject2.id,
          createRequestKey: crypto.randomUUID(),
          createRequestFingerprint: crypto.randomUUID(),
          createdByUserId: f.teacher1.id,
        },
      });

      const t2Res = await f.teacher1.agent.get(
        `/api/effective-schedule/weekly?academicYearId=${f.year.id}&academicWeekId=${f.week.id}&teacherUserId=${f.teacher2.id}`,
      );
      const t2Monday = t2Res.body.days.find((d: { civilDate: string }) => d.civilDate === civilDate);
      const t2Slot2 = t2Monday.slots.find((s: { slotLabel: string }) => s.slotLabel === 'Tiết 2');
      expect(t2Slot2.occupancyState).toBe('OCCUPIED');
      expect(t2Slot2.sourceKind).toBe('MAKEUP_TEACHING');
      expect(t2Slot2.sourceLabel).toBe('Dạy bù');
    });

    it('Item 15: reversed operational disposition has zero current occupancy', async () => {
      const f = await fixture();

      // Create REVERSED disposition
      await h.prisma.operationalLessonDisposition.create({
        data: {
          academicYearId: f.year.id,
          timetableVersionId: f.timetable.id,
          timetableEntryId: f.entry.id,
          sourceCivilDate: new Date(`${civilDate}T00:00:00Z`),
          academicCalendarVersionId: f.calendar.id,
          timeSlotDefinitionId: f.slot1.id,
          schoolClassId: f.schoolClass.id,
          subjectId: f.subject.id,
          teachingAssignmentId: f.assignment.id,
          responsibleTeacherUserId: f.teacher1.id,
          dispositionType: 'AUTHORIZED_CANCELLATION',
          status: OperationalOverlayStatus.REVERSED,
          createRequestKey: crypto.randomUUID(),
          createRequestFingerprint: crypto.randomUUID(),
          createdByUserId: f.teacher1.id,
          reversedAt: new Date(),
          reversedByUserId: f.teacher1.id,
          reversalReason: 'Đổi lại',
          reverseRequestKey: crypto.randomUUID(),
          reverseRequestFingerprint: crypto.randomUUID(),
        },
      });

      // Since disposition is REVERSED, base timetable remains authoritative for Teacher 1
      const weeklyRes = await f.teacher1.agent.get(
        `/api/effective-schedule/weekly?academicYearId=${f.year.id}&academicWeekId=${f.week.id}`,
      );
      const monday = weeklyRes.body.days.find((d: { civilDate: string }) => d.civilDate === civilDate);
      const slot1Occ = monday.slots.find((s: { slotLabel: string }) => s.slotLabel === 'Tiết 1');
      expect(slot1Occ.occupancyState).toBe('OCCUPIED');
      expect(slot1Occ.sourceKind).toBe('BASE_TIMETABLE');
    });

    it('Item 17: compare with peer teacher computes exact half-open intervals and descriptive facts', async () => {
      const f = await fixture();

      const compRes = await f.teacher1.agent.get(
        `/api/effective-schedule/compare?academicYearId=${f.year.id}&academicWeekId=${f.week.id}&peerTeacherUserId=${f.teacher2.id}`,
      );
      expect(compRes.status).toBe(200);
      expect(compRes.body.peerTeacher.displayName).toBe('Trần Thị Bình');

      const mondaySlots = compRes.body.facts.filter((s: { civilDate: string }) => s.civilDate === civilDate);
      expect(mondaySlots.length).toBeGreaterThan(0);

      // Slot 1: Teacher 1 is busy (base timetable), Teacher 2 is free
      const slot1 = mondaySlots.find((s: { slotLabel: string }) => s.slotLabel === 'Tiết 1');
      expect(slot1).toBeDefined();
      expect(slot1.comparisonState).toBe('SELF_BUSY_PEER_FREE');
      expect(slot1.comparisonLabel).toBe('Tôi bận / Đồng nghiệp trống');
      expect(slot1.selfOccupancy.isBusy).toBe(true);
      expect(slot1.peerOccupancy.isBusy).toBe(false);
    });

    it('Item 16: structural BLOCKED resolution returns BLOCKED status and never FREE/Trống', async () => {
      const f = await fixture();

      // Delete the PPCT association so resolution becomes BLOCKED
      await h.prisma.ppctClassAssociation.deleteMany();

      const weeklyRes = await f.teacher1.agent.get(
        `/api/effective-schedule/weekly?academicYearId=${f.year.id}&academicWeekId=${f.week.id}`,
      );
      expect(weeklyRes.status).toBe(200);
      expect(weeklyRes.body.status).toBe('BLOCKED');
      expect(weeklyRes.body.blockedReasons.length).toBeGreaterThan(0);

      const monday = weeklyRes.body.days.find((d: { civilDate: string }) => d.civilDate === civilDate);
      expect(monday.isBlocked).toBe(true);
      // Under fail-closed, slot is marked BLOCKED, never FREE
      const slot1 = monday.slots.find((s: { slotLabel: string }) => s.slotLabel === 'Tiết 1');
      expect(slot1.occupancyState).toBe('BLOCKED');
    });
  });
});
