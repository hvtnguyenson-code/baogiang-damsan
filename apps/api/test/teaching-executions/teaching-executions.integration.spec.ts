import { Prisma } from '@prisma/client';
import { spawn } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import { OVERLAY_CLOCK } from '../../src/operational-overlays/operational-overlay-policy';
import { OperationalOverlaysService } from '../../src/operational-overlays/operational-overlays.service';
import { CalendarCandidateConsequenceService } from '../../src/operational-overlays/calendar-candidate-consequence.service';
import { OfficialWorkloadProjectionService } from '../../src/official-workload/official-workload-projection.service';
import { ResolvedLessonOccurrencesService } from '../../src/resolved-occurrences/resolved-occurrences.service';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

let overlayInstant = new Date('2026-08-31T12:00:00Z');

integration('Teaching Execution runtime relational invariants (PostgreSQL)', () => {
  const h = new Phase01Harness();
  beforeAll(async () => h.start([{ token: OVERLAY_CLOCK, value: { now: () => new Date(overlayInstant.getTime()) } }])); afterAll(async () => { try { await clean(); } finally { await h.stop(); } }); beforeEach(async () => { overlayInstant = new Date('2026-08-31T12:00:00Z'); await clean(); });
  async function clean() {
    await h.prisma.businessPolicyVersion.deleteMany(); await h.prisma.businessPolicyStream.deleteMany();
    await h.prisma.specialActivityParticipationExecution.deleteMany(); await h.prisma.curricularTeachingExecution.deleteMany();
    await h.prisma.specialActivityStaffing.deleteMany(); await h.prisma.specialActivityTimeSlot.deleteMany(); await h.prisma.specialActivityClassTarget.deleteMany(); await h.prisma.specialActivity.deleteMany();
    await h.prisma.makeupTeachingSchedule.deleteMany(); await h.prisma.operationalLessonDisposition.deleteMany(); await h.prisma.calendarExceptionTimeSlot.deleteMany(); await h.prisma.calendarException.deleteMany();
    await h.prisma.ppctItemLineage.deleteMany(); await h.prisma.ppctClassAssociation.deleteMany(); await h.prisma.ppctItemRevision.deleteMany(); await h.prisma.ppctItem.deleteMany(); await h.prisma.ppctVersion.deleteMany(); await h.prisma.ppctPlan.deleteMany(); await h.clean();
  }
  async function fixture(operationalStartDate = '2026-08-01') {
    await h.seedCapabilities([{ key: 'TEACHING_EXECUTION_RECORD', scopes: ['PERSONAL'] }, { key: 'TEACHING_EXECUTION_MANAGE', scopes: ['SUBJECT','SCHOOL_WIDE'] }]);
    const actor = await h.actor({ grants: [{ capabilityKey: 'TEACHING_EXECUTION_RECORD', scopeType: 'PERSONAL' }] });
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('EXEC'), name: 'Execution year' } });
    const calendar = await h.prisma.academicCalendarVersion.create({ data: { academicYearId: year.id, versionNumber: 1, startDate: new Date('2026-08-01Z'), endDate: new Date('2027-05-31Z'), officialWeekCount: 35, reserveWeekCount: 1, teachingWeekdays: ['MONDAY','TUESDAY'], isActive: true, activatedAt: new Date('2026-08-01Z') } });
    const week = await h.prisma.academicWeek.create({ data: { calendarVersionId: calendar.id, kind: 'OFFICIAL', officialWeekNumber: 1, displayLabel: 'Week 1', sortOrder: 1 } });
    const segment = await h.prisma.academicWeekSegment.create({ data: { academicWeekId: week.id, calendarVersionId: calendar.id, label: 'Week 1', segmentOrder: 1, startDate: new Date('2026-08-01Z'), endDate: new Date('2026-08-31Z') } });
    const schoolClass = await h.prisma.schoolClass.create({ data: { academicYearId: year.id, code: normalizedCode('C'), name: '10A', gradeLevel: 10 } });
    const subject = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Subject' } });
    const slot = await h.prisma.timeSlotDefinition.create({ data: { academicYearId: year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 1, revision: 1, displayLabel: 'One', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z'), allowRegularTeaching: true, allowMakeupTeaching: true } });
    const makeupSlot = await h.prisma.timeSlotDefinition.create({ data: { academicYearId: year.id, weekday: 'TUESDAY', session: 'MORNING', ordinal: 1, revision: 1, displayLabel: 'Makeup', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z'), allowRegularTeaching: false, allowMakeupTeaching: true } });
    const assignment = await h.prisma.teachingAssignment.create({ data: { academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: actor.id, validFrom: new Date('2026-08-01Z') } });
    const timetable = await h.prisma.timetableVersion.create({ data: { academicYearId: year.id, versionNumber: 1, status: 'ACTIVE', calendarVersionId: calendar.id, effectiveAcademicWeekId: week.id, effectiveFrom: new Date('2026-08-10Z'), createdByUserId: actor.id, validatedByUserId: actor.id, validatedAt: new Date('2026-08-01Z'), approvedByUserId: actor.id, approvedAt: new Date('2026-08-01Z'), activatedByUserId: actor.id, activatedAt: new Date('2026-08-01Z') } });
    const entry = await h.prisma.timetableEntry.create({ data: { timetableVersionId: timetable.id, academicYearId: year.id, weekday: 'MONDAY', timeSlotDefinitionId: slot.id, schoolClassId: schoolClass.id, subjectId: subject.id, teachingAssignmentId: assignment.id, teacherUserId: actor.id } });
    const plan = await h.prisma.ppctPlan.create({ data: { academicYearId: year.id, subjectId: subject.id, gradeLevel: 10 } }); const version = await h.prisma.ppctVersion.create({ data: { ppctPlanId: plan.id, versionNumber: 1, status: 'PUBLISHED', createdByUserId: actor.id, publishedByUserId: actor.id, publishedAt: new Date('2026-08-01Z') } }); const item = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id, component: 'CORE' } }); const revision = await h.prisma.ppctItemRevision.create({ data: { ppctVersionId: version.id, ppctPlanId: plan.id, ppctItemId: item.id, component: 'CORE', sequence: 1, title: 'Lesson', lessonType: 'LESSON' } }); const association = await h.prisma.ppctClassAssociation.create({ data: { academicYearId: year.id, schoolClassId: schoolClass.id, subjectId: subject.id, gradeLevel: 10, ppctPlanId: plan.id, ppctVersionId: version.id, curricularProfile: 'CORE_ONLY', effectiveFrom: new Date('2026-08-01Z'), createdByUserId: actor.id } });
    const staffSubject = await h.prisma.staffSubject.create({ data: { userId: actor.id, subjectId: subject.id, validFrom: new Date('2026-08-01Z') } });
    const makeup = await h.prisma.makeupTeachingSchedule.create({ data: { academicYearId: year.id, originalTimetableVersionId: timetable.id, originalTimetableEntryId: entry.id, originalCivilDate: new Date('2026-08-10Z'), originalAcademicCalendarVersionId: calendar.id, originalTimeSlotDefinitionId: slot.id, schoolClassId: schoolClass.id, subjectId: subject.id, originalTeachingAssignmentId: assignment.id, responsibleTeacherUserId: actor.id, ppctClassAssociationId: association.id, ppctPlanId: plan.id, ppctVersionId: version.id, ppctItemId: item.id, targetCivilDate: new Date('2026-08-11Z'), targetAcademicCalendarVersionId: calendar.id, targetTimeSlotDefinitionId: makeupSlot.id, scheduledTeacherUserId: actor.id, eligibilityCheckedAt: new Date('2026-08-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true, eligibilitySameSubject: true, eligibilityStaffSubjectId: staffSubject.id, createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: actor.id } });
    const activity = await h.prisma.specialActivity.create({ data: { academicYearId: year.id, academicCalendarVersionId: calendar.id, civilDate: new Date('2026-08-10Z'), scope: 'SCHOOL_WIDE', title: 'Activity', createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: actor.id, timeSlots: { create: { timeSlotDefinitionId: slot.id } }, staffing: { create: { scheduledTeacherUserId: actor.id, staffProfileId: (await h.prisma.staffProfile.findUniqueOrThrow({ where: { userId: actor.id } })).id, eligibilityCheckedAt: new Date('2026-08-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true } } }, include: { timeSlots: true, staffing: true } });

    const stream = await h.prisma.businessPolicyStream.create({
      data: {
        familyKey: 'OPERATIONAL_START',
        resourceKind: 'ACADEMIC_YEAR',
        academicYearId: year.id,
      },
    });
    const policyVersion = await h.prisma.businessPolicyVersion.create({
      data: {
        streamId: stream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: { operationalStartDate },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00Z'),
        effectiveUntil: null,
        publishedAt: new Date('2026-08-01T00:00:00Z'),
        publishedByUserId: actor.id,
        createdByUserId: actor.id,
      },
    });

    return { actor, year, calendar, week, segment, schoolClass, subject, slot, makeupSlot, assignment, timetable, entry, plan, version, item, revision, association, makeup, activity, stream, policyVersion };
  }
  const normalBody = (f: Awaited<ReturnType<typeof fixture>>, requestKey = crypto.randomUUID(), replacesId?: string) => ({ academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, timetableEntryId: f.entry.id, sourceCivilDate: '2026-08-10', requestKey, replacesId });
  const activityBody = (f: Awaited<ReturnType<typeof fixture>>, requestKey = crypto.randomUUID(), replacesId?: string) => ({ specialActivityId: f.activity.id, specialActivityStaffingId: f.activity.staffing[0]!.id, specialActivityTimeSlotId: f.activity.timeSlots[0]!.id, requestKey, replacesId });

  async function workloadPolicy(f: Awaited<ReturnType<typeof fixture>>) {
    const stream = await h.prisma.businessPolicyStream.create({ data: { familyKey: 'WORKLOAD_ADJUSTMENT', resourceKind: 'ACADEMIC_YEAR', academicYearId: f.year.id } });
    await h.prisma.businessPolicyVersion.create({ data: { streamId: stream.id, versionNumber: 1, status: 'PUBLISHED',
      payload: { baseWeeklyNorm: 18, rules: [] }, validatorVersion: 'v1', effectiveFrom: new Date('2026-08-01Z'),
      publishedAt: new Date('2026-08-01Z'), publishedByUserId: f.actor.id, createdByUserId: f.actor.id } });
  }

  async function scopeFixture() {
    const f = await fixture();
    await h.prisma.makeupTeachingSchedule.delete({ where: { id: f.makeup.id } });
    await h.prisma.specialActivityStaffing.deleteMany();
    await h.prisma.specialActivityTimeSlot.deleteMany();
    await h.prisma.specialActivity.delete({ where: { id: f.activity.id } });
    await h.prisma.academicCalendarVersion.update({ where: { id: f.calendar.id }, data: { endDate: new Date('2026-08-31Z') } });
    for (let sequence = 2; sequence <= 4; sequence++) {
      const item = await h.prisma.ppctItem.create({ data: { ppctPlanId: f.plan.id, component: 'CORE' } });
      await h.prisma.ppctItemRevision.create({ data: { ppctVersionId: f.version.id, ppctPlanId: f.plan.id,
        ppctItemId: item.id, sequence, component: 'CORE', title: `Lesson ${sequence}`, lessonType: 'LESSON' } });
    }
    const class10B = await h.prisma.schoolClass.create({ data: { academicYearId: f.year.id,
      code: normalizedCode('C'), name: '10B', gradeLevel: 10 } });
    const class11 = await h.prisma.schoolClass.create({ data: { academicYearId: f.year.id,
      code: normalizedCode('C'), name: '11A', gradeLevel: 11 } });
    const subject2 = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Second subject' } });
    const slot2 = await h.prisma.timeSlotDefinition.create({ data: { academicYearId: f.year.id,
      weekday: 'MONDAY', session: 'MORNING', ordinal: 2, revision: 1, displayLabel: 'Two',
      startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T08:45:00Z'), allowRegularTeaching: true } });
    for (const [schoolClass, subject, slot] of [[class10B, f.subject, f.slot], [f.schoolClass, subject2, slot2], [class11, f.subject, f.slot]] as const) {
      const teacher = await h.actor();
      const assignment = await h.prisma.teachingAssignment.create({ data: { academicYearId: f.year.id,
        schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: teacher.id, validFrom: new Date('2026-08-01Z') } });
      await h.prisma.timetableEntry.create({ data: { academicYearId: f.year.id, timetableVersionId: f.timetable.id,
        weekday: 'MONDAY', schoolClassId: schoolClass.id, subjectId: subject.id, teacherUserId: teacher.id,
        teachingAssignmentId: assignment.id, timeSlotDefinitionId: slot.id } });
      let plan = f.plan;
      let version = f.version;
      if (subject.id !== f.subject.id || schoolClass.gradeLevel !== 10) {
        plan = await h.prisma.ppctPlan.create({ data: { academicYearId: f.year.id, subjectId: subject.id, gradeLevel: schoolClass.gradeLevel } });
        version = await h.prisma.ppctVersion.create({ data: { ppctPlanId: plan.id, versionNumber: 1,
          status: 'PUBLISHED', createdByUserId: f.actor.id, publishedByUserId: f.actor.id, publishedAt: new Date('2026-08-01Z') } });
        for (let sequence = 1; sequence <= 4; sequence++) {
          const item = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id, component: 'CORE' } });
          await h.prisma.ppctItemRevision.create({ data: { ppctVersionId: version.id, ppctPlanId: plan.id,
            ppctItemId: item.id, sequence, component: 'CORE', title: `Lesson ${sequence}`, lessonType: 'LESSON' } });
        }
      }
      await h.prisma.ppctClassAssociation.create({ data: { academicYearId: f.year.id,
        schoolClassId: schoolClass.id, subjectId: subject.id, gradeLevel: schoolClass.gradeLevel,
        ppctPlanId: plan.id, ppctVersionId: version.id, curricularProfile: 'CORE_ONLY',
        effectiveFrom: new Date('2026-08-01Z'), createdByUserId: f.actor.id } });
    }
    await workloadPolicy(f);
    return { ...f, class10B, class11 };
  }

  it.each(['SCHOOL_WIDE', 'GRADE', 'CLASS'] as const)('T53-B DB %s replays ALL affected class-subjects and authoritative workload in one read-only snapshot', async (scope) => {
    const f = await scopeFixture();
    const auditCount = await h.prisma.auditEvent.count();
    const result = await h.app.get(CalendarCandidateConsequenceService).resolve({
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: '2026-08-10',
      scope, ...(scope === 'GRADE' ? { gradeLevel: 10 } : scope === 'CLASS' ? { schoolClassId: f.class10B.id } : {}),
      timeSelector: 'WHOLE_DAY', note: 'T53-B all-stream read-only PostgreSQL proof',
    }, new Date('2026-08-31T12:00:00Z'));
    expect(result.status).toBe('PASS');
    expect(result.streams).toHaveLength(scope === 'SCHOOL_WIDE' ? 4 : scope === 'GRADE' ? 3 : 1);
    expect(result.teachers).toHaveLength(result.streams.length);
    for (const stream of result.streams) {
      expect(stream.ppct.status).toBe('PASS');
      expect(stream.ppct.before.normalAllocations.map((r) => r.expectedPpctItem?.sequence)).toEqual([1, 2, 3, 4]);
      expect(stream.ppct.after.normalAllocations.map((r) => r.expectedPpctItem?.sequence ?? null)).toEqual([null, 1, 2, 3]);
      expect(stream.progress.before.counts).toMatchObject({ distributedElapsedCount: 4, openDebtCount: 0, completedCount: 0 });
      expect(stream.progress.after.counts).toMatchObject({ distributedElapsedCount: 3, openDebtCount: 0, completedCount: 0 });
    }
    for (const teacher of result.teachers) {
      expect(teacher).toMatchObject({ status: 'PASS', before: { status: 'PASS', earnedCredit: 0, requiredCredit: 63 }, after: { status: 'PASS' }, delta: { earnedCredit: 0, requiredCredit: 0 } });
    }
    expect(result.limitations).toContain('PREVIEW_CANNOT_AUTHORIZE_MUTATION');
    expect(await h.prisma.calendarException.count()).toBe(0);
    expect(await h.prisma.curricularTeachingExecution.count()).toBe(0);
    expect(await h.prisma.auditEvent.count()).toBe(auditCount);
  }, 60000);

  it('T53-B DB PostgreSQL prevents callback persistence in the internal preview transaction', async () => {
    const f = await fixture();
    await h.prisma.makeupTeachingSchedule.delete({ where: { id: f.makeup.id } });
    await expect(h.app.get(OperationalOverlaysService).withCalendarPreviewReplay({
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: '2026-08-17',
      scope: 'CLASS', schoolClassId: f.schoolClass.id, timeSelector: 'WHOLE_DAY', note: 'Read-only boundary proof',
    }, async (_replay, tx) => tx.schoolClass.update({ where: { id: f.schoolClass.id }, data: { name: 'MUST NOT WRITE' } })))
      .rejects.toThrow('read-only transaction');
    expect((await h.prisma.schoolClass.findUniqueOrThrow({ where: { id: f.schoolClass.id } })).name).toBe('10A');
  });

  it('T53-B DB missing official norm blocks all teacher assessments even when every PPCT stream replays', async () => {
    const f = await scopeFixture();
    const stream = await h.prisma.businessPolicyStream.findFirstOrThrow({ where: { academicYearId: f.year.id, familyKey: 'WORKLOAD_ADJUSTMENT' } });
    await h.prisma.businessPolicyVersion.deleteMany({ where: { streamId: stream.id } });
    const result = await h.app.get(CalendarCandidateConsequenceService).resolve({
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: '2026-08-10',
      scope: 'SCHOOL_WIDE', timeSelector: 'WHOLE_DAY', note: 'Missing norm must never become candidate PASS',
    }, new Date('2026-08-31T12:00:00Z'));
    expect(result.status).toBe('BLOCKED');
    expect(result.streams).toHaveLength(4);
    expect(result.streams.every((stream) => stream.ppct.status === 'PASS')).toBe(true);
    expect(result.teachers).toHaveLength(4);
    for (const teacher of result.teachers) {
      expect(teacher).toMatchObject({ status: 'BLOCKED', before: { earnedCredit: null, requiredCredit: null }, after: null, delta: null });
    }
    expect(await h.prisma.calendarException.count()).toBe(0);
  }, 60000);

  it('T53-B DB complete scope replay and retained official workload cannot see a concurrent execution committed after their snapshot', async () => {
    const f = await scopeFixture();
    const structural = h.app.get(ResolvedLessonOccurrencesService);
    const resolve = structural.resolveInTransaction.bind(structural);
    let release!: () => void;
    let signal!: () => void;
    let paused = false;
    const resume = new Promise<void>((done) => { release = done; });
    const ready = new Promise<void>((done) => { signal = done; });
    const spy = jest.spyOn(structural, 'resolveInTransaction').mockImplementation(async (tx, input) => {
      const source = await resolve(tx, input);
      if (!paused) { paused = true; signal(); await resume; }
      return source;
    });
    const preview = h.app.get(CalendarCandidateConsequenceService).resolve({
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: '2026-08-10',
      scope: 'SCHOOL_WIDE', timeSelector: 'WHOLE_DAY', note: 'Concurrent execution is invisible to read snapshot',
    }, new Date('2026-08-31T12:00:00Z'));
    // A preview failure also releases the barrier so the test cannot hang waiting
    // for a callback which never started.
    void preview.catch(() => signal());
    try {
      await ready;
      const created = await f.actor.agent.post('/api/teaching-executions/curricular/normal')
        .set('Origin', testOrigin).send(normalBody(f));
      expect(created.status).toBe(201);
      release();
      const result = await preview;
      expect(result.status).toBe('PASS');
      expect(result.streams).toHaveLength(4);
      expect(result.streams.every((stream) => stream.progress.before.counts?.completedCount === 0)).toBe(true);
      expect(result.teachers.every((teacher) => teacher.before.earnedCredit === 0 && teacher.after?.earnedCredit === 0 && teacher.delta?.earnedCredit === 0)).toBe(true);
      expect(result.limitations).toContain('PREVIEW_CANNOT_AUTHORIZE_MUTATION');
      expect(await h.app.get(OfficialWorkloadProjectionService).resolve({ academicYearId: f.year.id,
        targetUserId: f.actor.id, fromCivilDate: '2026-08-10', toCivilDate: '2026-08-31',
        asOfInstant: new Date('2026-08-31T12:00:00Z') })).toMatchObject({ status: 'PASS', earnedCredit: 1, requiredCredit: 63 });
      expect(await h.prisma.calendarException.count()).toBe(0);
    } finally {
      release();
      await preview.catch(() => undefined);
      spy.mockRestore();
    }
  }, 60000);

  it('T53-B DB official retained workload includes a candidate teacher actual substitution credit from another class', async () => {
    const f = await scopeFixture();
    const candidateEntry = await h.prisma.timetableEntry.findFirstOrThrow({ where: { schoolClassId: f.class10B.id } });
    const proof = await h.prisma.staffSubject.create({ data: { userId: candidateEntry.teacherUserId, subjectId: f.subject.id, validFrom: new Date('2026-08-01Z') } });
    await h.prisma.operationalLessonDisposition.create({ data: {
      academicYearId: f.year.id, timetableVersionId: f.timetable.id, timetableEntryId: f.entry.id,
      sourceCivilDate: new Date('2026-08-10Z'), academicCalendarVersionId: f.calendar.id,
      timeSlotDefinitionId: f.slot.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id,
      teachingAssignmentId: f.assignment.id, responsibleTeacherUserId: f.actor.id,
      dispositionType: 'SAME_SUBJECT_SUBSTITUTION', assignedTeacherUserId: candidateEntry.teacherUserId,
      eligibilityCheckedAt: new Date('2026-08-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true,
      eligibilitySameSubject: true, eligibilityStaffSubjectId: proof.id,
      createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: f.actor.id,
    } });
    // Record through the existing management service's validated runtime; the
    // actor remains distinct from the server-derived actual substitute.
    await h.prisma.capabilityGrant.create({ data: { userId: f.actor.id,
      capabilityKey: 'TEACHING_EXECUTION_MANAGE', scopeType: 'SCHOOL_WIDE', validFrom: new Date('2026-08-01Z') } });
    const created = await f.actor.agent.post('/api/teaching-executions/curricular/normal')
      .set('Origin', testOrigin).send(normalBody(f));
    expect(created.status).toBe(201);
    const result = await h.app.get(CalendarCandidateConsequenceService).resolve({
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: '2026-08-10',
      scope: 'CLASS', schoolClassId: f.class10B.id, timeSelector: 'WHOLE_DAY', note: 'Retained actual-teacher substitution workload proof',
    }, new Date('2026-08-31T12:00:00Z'));
    expect(result.status).toBe('PASS');
    expect(result.teachers).toHaveLength(1);
    expect(result.teachers[0]).toMatchObject({ targetUserId: candidateEntry.teacherUserId,
      before: { status: 'PASS', earnedCredit: 1, requiredCredit: 63, curricularWorkload: {
        contributions: [expect.objectContaining({ executionId: created.body.item.id, actualTeacherUserId: candidateEntry.teacherUserId,
          schoolClassId: f.schoolClass.id, executionCivilDate: '2026-08-10' })],
      } }, after: { status: 'PASS' }, delta: { earnedCredit: 0, requiredCredit: 0 } });
    expect(await h.prisma.curricularTeachingExecution.count({ where: { status: 'ACTIVE' } })).toBe(1);
    expect(await h.prisma.calendarException.count()).toBe(0);
  }, 60000);

  it('T53-B DB independent activity retains staffing and suppression; calendar replay neither cancels it nor invents special-programme credit', async () => {
    const f = await scopeFixture();
    const teacher = await h.actor();
    const activity = await h.prisma.specialActivity.create({ data: {
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: new Date('2026-08-17Z'),
      scope: 'SCHOOL_WIDE', title: 'Independent retained activity', createRequestKey: crypto.randomUUID(),
      createRequestFingerprint: crypto.randomUUID(), createdByUserId: f.actor.id,
      classTargets: { create: { schoolClassId: f.schoolClass.id } },
      timeSlots: { create: { timeSlotDefinitionId: f.slot.id } },
      staffing: { create: { scheduledTeacherUserId: teacher.id,
        staffProfileId: (await h.prisma.staffProfile.findUniqueOrThrow({ where: { userId: teacher.id } })).id,
        eligibilityCheckedAt: new Date('2026-08-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true } },
    }, include: { classTargets: true, staffing: true, timeSlots: true } });
    const input = { academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate: '2026-08-10' as const,
      scope: 'CLASS' as const, schoolClassId: f.schoolClass.id, timeSelector: 'WHOLE_DAY' as const,
      note: 'Calendar candidate must preserve independent activity and P4-050 credit authority' };
    const service = h.app.get(CalendarCandidateConsequenceService);
    const result = await service.resolve(input, new Date('2026-08-31T12:00:00Z'));
    expect(result.status).toBe('PASS');
    expect(result.streams).toHaveLength(2);
    const stream = result.streams.find((row) => row.scope.subjectId === f.subject.id)!;
    expect(stream.ppct.after.normalAllocations.map((row) => row.expectedPpctItem?.sequence ?? null)).toEqual([null, null, 1, 2]);
    expect(stream.progress.after.counts).toMatchObject({ openDebtCount: 0, completedCount: 0 });
    expect(result.teachers.find((row) => row.targetUserId === teacher.id)).toMatchObject({
      before: { status: 'PASS', earnedCredit: 0, requiredCredit: 63,
        specialProgrammeWorkload: { status: 'PASS', totalCredit: 0, contributions: [] } }, after: { status: 'PASS' }, delta: { earnedCredit: 0, requiredCredit: 0 },
    });
    // ADR-036: normal suppression precedence changes, the independent activity does not.
    const sameDate = await service.resolve({ ...input, civilDate: '2026-08-17' }, new Date('2026-08-31T12:00:00Z'));
    expect(sameDate.status).toBe('PASS');
    expect(sameDate.teachers.every((t) => t.after?.earnedCredit === t.before.earnedCredit)).toBe(true);
    expect(await h.prisma.specialActivity.findUniqueOrThrow({ where: { id: activity.id },
      include: { classTargets: true, staffing: true, timeSlots: true } })).toEqual(activity);
    expect(await h.prisma.specialActivityParticipationExecution.count()).toBe(0);
    expect(await h.prisma.calendarException.count()).toBe(0);
  }, 60000);

  const cancellation = (f: Awaited<ReturnType<typeof scopeFixture>>, civilDate = '2026-08-17') => ({
    academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id, civilDate,
    scope: 'CLASS' as const, schoolClassId: f.schoolClass.id, timeSelector: 'WHOLE_DAY' as const,
    note: 'Đối soát hồi tố theo T53-B',
  });
  async function calendarGrant(f: Awaited<ReturnType<typeof scopeFixture>>) {
    await h.seedCapabilities([{ key: 'CALENDAR_EXCEPTION_MANAGE', scopes: ['SCHOOL_WIDE'] }]);
    await h.prisma.capabilityGrant.create({ data: { userId: f.actor.id, capabilityKey: 'CALENDAR_EXCEPTION_MANAGE',
      scopeType: 'SCHOOL_WIDE', validFrom: new Date('2026-08-01Z') } });
  }

  it('T53-B reconciles unrelated completed NORMAL work; public preview and SERIALIZABLE create/reverse preserve actual credit and norm', async () => {
    const f = await scopeFixture();
    await calendarGrant(f);
    const done = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f));
    expect(done.status).toBe(201);
    const input = cancellation(f);
    const preview = await f.actor.agent.post('/api/operational-overlays/workspace/calendar-preview').set('Origin', testOrigin).send(input);
    expect(preview.status).toBe(201);
    expect(preview.body).toMatchObject({ status: 'PASS', coverage: { ppctItemAllocation: 'ASSESSED', debt: 'ASSESSED', workload: 'ASSESSED' } });
    const evidence = preview.body.consequences;
    expect(evidence.retainedFindings).toEqual([]);
    expect(evidence.streams.find((r: { scope: { subjectId: string } }) => r.scope.subjectId === f.subject.id).retained.executionIds).toEqual([done.body.item.id]);
    const teacher = evidence.teachers.find((t: { targetUserId: string }) => t.targetUserId === f.actor.id);
    expect(teacher.before).toMatchObject({ earnedCredit: 1, requiredCredit: 63 });
    expect(teacher.after).toEqual(teacher.before);
    expect(teacher.reconciliation.executionIds).toEqual([done.body.item.id]);
    const created = await f.actor.agent.post('/api/operational-overlays/calendar-exceptions').set('Origin', testOrigin)
      .send({ ...input, expectedConsequenceFingerprint: preview.body.consequenceFingerprint, requestKey: crypto.randomUUID() });
    expect(created.status).toBe(201);
    expect(created.body.outcome).toBe('CREATED');
    const reversed = await f.actor.agent.post(`/api/operational-overlays/calendar-exceptions/${created.body.record.id}/reverse`).set('Origin', testOrigin)
      .send({ requestKey: crypto.randomUUID(), expectedUpdatedAt: created.body.record.updatedAt, reversalReason: 'Khôi phục lịch đúng thẩm quyền' });
    expect(reversed.status).toBe(200);
    expect(reversed.body.record.status).toBe('REVERSED');
    expect(await h.prisma.curricularTeachingExecution.findUniqueOrThrow({ where: { id: done.body.item.id } })).toMatchObject({ status: 'ACTIVE' });
    expect(await h.app.get(OfficialWorkloadProjectionService).resolve({ academicYearId: f.year.id, targetUserId: f.actor.id,
      fromCivilDate: '2026-08-10', toCivilDate: '2026-08-31', asOfInstant: new Date('2026-08-31T12:00:00Z') }))
      .toMatchObject({ status: 'PASS', earnedCredit: 1, requiredCredit: 63 });
  }, 60000);

  it.each(['suppressed', 'rebound'] as const)('T53-B blocks %s fulfilled NORMAL by exact identity without losing accepted credit', async (mode) => {
    const f = await scopeFixture();
    await calendarGrant(f);
    const done = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin)
      .send({ ...normalBody(f), sourceCivilDate: mode === 'suppressed' ? '2026-08-10' : '2026-08-17' });
    expect(done.status).toBe(201);
    const input = cancellation(f, '2026-08-10');
    const result = await h.app.get(CalendarCandidateConsequenceService).resolveNow(input);
    expect(result.status).toBe('BLOCKED');
    expect(result.retainedFindings).toEqual(expect.arrayContaining([expect.objectContaining({ retainedEntityId: done.body.item.id, code: 'RECONCILIATION_REQUIRED' })]));
    expect(result.teachers.every((t) => t.after === null && t.delta === null)).toBe(true);
    const audits = await h.prisma.auditEvent.count();
    expect((await f.actor.agent.post('/api/operational-overlays/calendar-exceptions').set('Origin', testOrigin)
      .send({ ...input, requestKey: crypto.randomUUID() })).status).toBe(409);
    expect(await h.prisma.calendarException.count()).toBe(0);
    expect(await h.prisma.auditEvent.count()).toBe(audits);
    expect(await h.prisma.curricularTeachingExecution.findUniqueOrThrow({ where: { id: done.body.item.id } })).toMatchObject({ status: 'ACTIVE', ppctItemRevisionId: done.body.item.ppctItemRevisionId });
  }, 60000);

  it('T53-B reconciles both ends of an ACTIVE completed make-up while rejecting its exact source and target', async () => {
    const f = await scopeFixture();
    await calendarGrant(f);
    const disposition = await h.prisma.operationalLessonDisposition.create({ data: {
      academicYearId: f.year.id, timetableVersionId: f.timetable.id, timetableEntryId: f.entry.id,
      sourceCivilDate: new Date('2026-08-10Z'), academicCalendarVersionId: f.calendar.id, timeSlotDefinitionId: f.slot.id,
      schoolClassId: f.schoolClass.id, subjectId: f.subject.id, teachingAssignmentId: f.assignment.id,
      responsibleTeacherUserId: f.actor.id, dispositionType: 'ABSENCE_NO_REPLACEMENT',
      createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: f.actor.id,
    } });
    const schedule = await h.prisma.makeupTeachingSchedule.create({ data: { ...f.makeup, sourceDispositionId: disposition.id } });
    const done = await f.actor.agent.post('/api/teaching-executions/curricular/makeup').set('Origin', testOrigin)
      .send({ makeupTeachingScheduleId: schedule.id, requestKey: crypto.randomUUID() });
    expect(done.status).toBe(201);
    const service = h.app.get(CalendarCandidateConsequenceService);
    const result = await service.resolveNow(cancellation(f));
    expect(result.status).toBe('PASS');
    expect(result.retainedFindings).toEqual([]);
    expect(result.teachers.find((t) => t.targetUserId === f.actor.id)).toMatchObject({ before: { earnedCredit: 1 }, after: { earnedCredit: 1 }, delta: { earnedCredit: 0, requiredCredit: 0 } });
    const safeTarget = await service.resolveNow({ ...cancellation(f, '2026-08-11'), timeSelector: 'SESSION', session: 'AFTERNOON' });
    expect(safeTarget.status).toBe('PASS');
    for (const civilDate of ['2026-08-10', '2026-08-11']) {
      const blocked = await f.actor.agent.post('/api/operational-overlays/calendar-exceptions').set('Origin', testOrigin)
        .send({ ...cancellation(f, civilDate), requestKey: crypto.randomUUID() });
      expect(blocked.status).toBe(409);
    }
    expect(await h.prisma.calendarException.count()).toBe(0);
    expect(await h.prisma.curricularTeachingExecution.findUniqueOrThrow({ where: { id: done.body.item.id } })).toMatchObject({ status: 'ACTIVE', executionCivilDate: new Date('2026-08-11Z') });
  }, 60000);

  it('T53-B stale preview fingerprint rejects safe but changed actual workload with no calendar mutation or audit', async () => {
    const f = await scopeFixture();
    await calendarGrant(f);
    const input = cancellation(f);
    const evidence = await h.app.get(CalendarCandidateConsequenceService).resolveNow(input);
    expect(evidence.status).toBe('PASS');
    const execution = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f));
    expect(execution.status).toBe(201);
    const audits = await h.prisma.auditEvent.count();
    const response = await f.actor.agent.post('/api/operational-overlays/calendar-exceptions').set('Origin', testOrigin)
      .send({ ...input, expectedConsequenceFingerprint: evidence.consequenceFingerprint, requestKey: crypto.randomUUID() });
    expect(response.status).toBe(409);
    expect(response.body.message).toContain('sau khi xem trước');
    expect(await h.prisma.calendarException.count()).toBe(0);
    expect(await h.prisma.auditEvent.count()).toBe(audits);
  }, 60000);

  it('T53-B SERIALIZABLE consequence race rolls back calendar and audit after a competing execution commits', async () => {
    const f = await scopeFixture();
    await calendarGrant(f);
    const service = h.app.get(CalendarCandidateConsequenceService);
    const evaluate = service.evaluate.bind(service);
    let release!: () => void;
    let signal!: () => void;
    const ready = new Promise<void>((done) => { signal = done; });
    const resume = new Promise<void>((done) => { release = done; });
    let paused = false;
    const spy = jest.spyOn(service, 'evaluate').mockImplementation(async (...args) => {
      const result = await evaluate(...args);
      if (!paused) { paused = true; signal(); await resume; }
      return result;
    });
    const input = cancellation(f, '2026-08-10');
    const mutation = f.actor.agent.post('/api/operational-overlays/calendar-exceptions').set('Origin', testOrigin)
      .send({ ...input, requestKey: crypto.randomUUID() }).then((r) => { signal(); return r; });
    void mutation.catch(() => signal());
    try {
      await ready;
      const done = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f));
      expect(done.status).toBe(201);
      release();
      expect((await mutation).status).toBe(409);
      expect(await h.prisma.calendarException.count()).toBe(0);
      expect(await h.prisma.auditEvent.count({ where: { action: 'CALENDAR_EXCEPTION_CREATED' } })).toBe(0);
      expect(await h.prisma.curricularTeachingExecution.count({ where: { status: 'ACTIVE' } })).toBe(1);
    } finally { release(); await mutation.catch(() => undefined); spy.mockRestore(); }
  }, 60000);

  it.each(['AUTHORIZED_CANCELLATION', 'ABSENCE_NO_REPLACEMENT', 'SAME_SUBJECT_SUBSTITUTION', 'DIFFERENT_SUBJECT_SUPERVISION'] as const)(
    'T53-B/C public %s assesses real V2 consequences and revalidates the exact teacher without granting completion', async (dispositionType) => {
    const f = await scopeFixture();
    await h.seedCapabilities([{ key: 'TEACHING_OPERATION_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] }]);
    await h.prisma.capabilityGrant.create({ data: { userId: f.actor.id, capabilityKey: 'TEACHING_OPERATION_MANAGE', scopeType: 'SCHOOL_WIDE', validFrom: new Date('2026-08-01Z') } });
    const substitute = await h.actor();
    await h.prisma.staffProfile.update({ where: { userId: substitute.id }, data: { isTeachingStaff: true } });
    const assigned = dispositionType === 'SAME_SUBJECT_SUBSTITUTION' || dispositionType === 'DIFFERENT_SUBJECT_SUPERVISION';
    if (dispositionType === 'SAME_SUBJECT_SUBSTITUTION') await h.prisma.staffSubject.create({ data: { userId: substitute.id, subjectId: f.subject.id, validFrom: new Date('2026-08-01Z') } });
    const input = { academicYearId: f.year.id, subjectId: f.subject.id, timetableEntryId: f.entry.id, sourceCivilDate: '2026-08-10', dispositionType,
      ...(assigned ? { assignedTeacherUserId: substitute.id } : {}), note: 'Kiểm tra hệ quả điều hành đúng môn nguồn' };
    const preview = await f.actor.agent.post('/api/operational-overlays/workspace/disposition-preview').set('Origin', testOrigin).send(input);
    expect(preview.status).toBe(201);
    expect(preview.body).toMatchObject({ status: 'PASS', coverage: { ppctItemAllocation: 'ASSESSED', workload: 'ASSESSED', debt: 'ASSESSED' } });
    expect(preview.body.consequences.streams[0].after).toMatchObject({ completedCount: 0,
      openDebtCount: dispositionType === 'ABSENCE_NO_REPLACEMENT' || dispositionType === 'DIFFERENT_SUBJECT_SUPERVISION' ? 1 : 0 });
    expect(JSON.stringify(preview.body)).not.toContain('adjustmentSegments');
    const command = { timetableEntryId: input.timetableEntryId, sourceCivilDate: input.sourceCivilDate, dispositionType: input.dispositionType, assignedTeacherUserId: input.assignedTeacherUserId, note: input.note };
    const created = await f.actor.agent.post('/api/operational-overlays/lesson-dispositions').set('Origin', testOrigin)
      .send({ ...command, expectedConsequenceFingerprint: preview.body.consequenceFingerprint, requestKey: crypto.randomUUID() });
    expect(created.status).toBe(201);
    expect(await h.prisma.curricularTeachingExecution.count()).toBe(0);
    const reversed = await f.actor.agent.post(`/api/operational-overlays/lesson-dispositions/${created.body.record.id}/reverse`).set('Origin', testOrigin)
      .send({ requestKey: crypto.randomUUID(), expectedUpdatedAt: created.body.record.updatedAt, reversalReason: 'Khôi phục theo kiểm tra hệ quả' });
    expect(reversed.status).toBe(200);
    expect(await h.prisma.operationalLessonDisposition.count({ where: { status: 'REVERSED' } })).toBe(1);
  }, 60000);

  it('T53-B/C selected public make-up preview/create/reverse preserve PPCT, open debt and workload; stale identity is rejected', async () => {
    const f = await scopeFixture();
    overlayInstant = new Date('2026-08-12T12:00:00Z');
    await h.seedCapabilities([{ key: 'TEACHING_OPERATION_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] }]);
    await h.prisma.capabilityGrant.create({ data: { userId: f.actor.id, capabilityKey: 'TEACHING_OPERATION_MANAGE', scopeType: 'SCHOOL_WIDE', validFrom: new Date('2026-08-01Z') } });
    await h.prisma.staffProfile.update({ where: { userId: f.actor.id }, data: { isTeachingStaff: true } });
    const absence = await f.actor.agent.post('/api/operational-overlays/lesson-dispositions').set('Origin', testOrigin).send({ timetableEntryId: f.entry.id,
      sourceCivilDate: '2026-08-10', dispositionType: 'ABSENCE_NO_REPLACEMENT', note: 'Vắng có thẩm quyền', requestKey: crypto.randomUUID() });
    expect(absence.status).toBe(201);
    const input = { academicYearId: f.year.id, sourceNormalOccurrenceKey: `NORMAL:${f.entry.id}:2026-08-10`,
      targetCivilDate: '2026-08-18', targetTimeSlotDefinitionId: f.makeupSlot.id, scheduledTeacherUserId: f.actor.id, requestKey: crypto.randomUUID() };
    const preview = await f.actor.agent.post('/api/operational-overlays/makeup-schedules/preview').set('Origin', testOrigin).send(input);
    expect(preview.status).toBe(201);
    expect(preview.body).toMatchObject({ status: 'PASS', consumesNewPpctItem: false, createsExecution: false, before: { openDebtCount: 1, completedCount: 0 }, after: { openDebtCount: 1, completedCount: 0 } });
    const created = await f.actor.agent.post('/api/operational-overlays/makeup-schedules').set('Origin', testOrigin)
      .send({ ...input, expectedConsequenceFingerprint: preview.body.consequenceFingerprint });
    expect(created.status).toBe(201);
    expect(await h.prisma.curricularTeachingExecution.count()).toBe(0);
    const conflicting = await f.actor.agent.post('/api/operational-overlays/makeup-schedules').set('Origin', testOrigin).send({ ...input, requestKey: crypto.randomUUID() });
    expect(conflicting.status).toBe(409);
    const reversed = await f.actor.agent.post(`/api/operational-overlays/makeup-schedules/${created.body.record.id}/reverse`).set('Origin', testOrigin)
      .send({ requestKey: crypto.randomUUID(), expectedUpdatedAt: created.body.record.updatedAt, reversalReason: 'Điều chỉnh lịch dạy bù' });
    expect(reversed.status).toBe(200);
    expect(await h.prisma.curricularTeachingExecution.count()).toBe(0);
  }, 60000);

  it('T53-B calendar reversal refuses PPCT rebinding after a later accepted execution and rolls back history/audit', async () => {
    const f = await scopeFixture();
    await calendarGrant(f);
    const created = await f.actor.agent.post('/api/operational-overlays/calendar-exceptions').set('Origin', testOrigin)
      .send({ ...cancellation(f), requestKey: crypto.randomUUID() });
    expect(created.status).toBe(201);
    const done = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin)
      .send({ ...normalBody(f), sourceCivilDate: '2026-08-24' });
    expect(done.status).toBe(201);
    const audits = await h.prisma.auditEvent.count();
    const reversed = await f.actor.agent.post(`/api/operational-overlays/calendar-exceptions/${created.body.record.id}/reverse`).set('Origin', testOrigin)
      .send({ requestKey: crypto.randomUUID(), expectedUpdatedAt: created.body.record.updatedAt, reversalReason: 'Không được đổi PPCT đã thực hiện' });
    expect(reversed.status).toBe(409);
    expect(await h.prisma.auditEvent.count()).toBe(audits);
    expect(await h.prisma.calendarException.findUniqueOrThrow({ where: { id: created.body.record.id } })).toMatchObject({ status: 'ACTIVE' });
    expect(await h.prisma.curricularTeachingExecution.findUniqueOrThrow({ where: { id: done.body.item.id } }))
      .toMatchObject({ status: 'ACTIVE', ppctItemRevisionId: done.body.item.ppctItemRevisionId });
  }, 60000);

  it.each(['AUTHORIZED_CANCELLATION', 'ABSENCE_NO_REPLACEMENT', 'SAME_SUBJECT_SUBSTITUTION', 'DIFFERENT_SUBJECT_SUPERVISION'] as const)(
    'T53-B %s cannot invalidate a fulfilled source or remove its actual-teacher credit', async (dispositionType) => {
    const f = await scopeFixture();
    await h.seedCapabilities([{ key: 'TEACHING_OPERATION_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] }]);
    await h.prisma.capabilityGrant.create({ data: { userId: f.actor.id, capabilityKey: 'TEACHING_OPERATION_MANAGE', scopeType: 'SCHOOL_WIDE', validFrom: new Date('2026-08-01Z') } });
    const substitute = await h.actor();
    await h.prisma.staffProfile.update({ where: { userId: substitute.id }, data: { isTeachingStaff: true } });
    await h.prisma.staffSubject.create({ data: { userId: substitute.id, subjectId: f.subject.id, validFrom: new Date('2026-08-01Z') } });
    const done = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f));
    expect(done.status).toBe(201);
    const teacherType = dispositionType === 'SAME_SUBJECT_SUBSTITUTION' || dispositionType === 'DIFFERENT_SUBJECT_SUPERVISION';
    const input = { timetableEntryId: f.entry.id, sourceCivilDate: '2026-08-10', dispositionType,
      ...(teacherType ? { assignedTeacherUserId: substitute.id } : {}), note: 'Không thay nghĩa vụ đã có minh chứng' };
    const preview = await f.actor.agent.post('/api/operational-overlays/workspace/disposition-preview').set('Origin', testOrigin)
      .send({ ...input, academicYearId: f.year.id, subjectId: f.subject.id });
    expect(preview.body).toMatchObject({ status: 'BLOCKED', coverage: { workload: 'NOT_ASSESSED' } });
    const audits = await h.prisma.auditEvent.count();
    expect((await f.actor.agent.post('/api/operational-overlays/lesson-dispositions').set('Origin', testOrigin)
      .send({ ...input, requestKey: crypto.randomUUID() })).status).toBe(409);
    expect(await h.prisma.operationalLessonDisposition.count()).toBe(0);
    expect(await h.prisma.auditEvent.count()).toBe(audits);
    expect(await h.app.get(OfficialWorkloadProjectionService).resolve({ academicYearId: f.year.id, targetUserId: f.actor.id,
      fromCivilDate: '2026-08-10', toCivilDate: '2026-08-31', asOfInstant: new Date('2026-08-31T12:00:00Z') })).toMatchObject({ earnedCredit: 1, requiredCredit: 63 });
  }, 60000);

  it('T53-B PostgreSQL enforces read-only on the full public consequence path, not only the legacy seam', async () => {
    const f = await scopeFixture();
    const structural = h.app.get(ResolvedLessonOccurrencesService);
    const read = structural.resolveInTransaction.bind(structural);
    const audits = await h.prisma.auditEvent.count();
    const spy = jest.spyOn(structural, 'resolveInTransaction').mockImplementation(async (tx, input) => {
      const source = await read(tx, input);
      await tx.schoolClass.update({ where: { id: f.schoolClass.id }, data: { name: 'PREVIEW MUST NEVER WRITE' } });
      return source;
    });
    try {
      await expect(h.app.get(CalendarCandidateConsequenceService).resolveNow(cancellation(f))).rejects.toThrow('read-only transaction');
      expect((await h.prisma.schoolClass.findUniqueOrThrow({ where: { id: f.schoolClass.id } })).name).toBe('10A');
      expect(await h.prisma.auditEvent.count()).toBe(audits);
      expect(await h.prisma.calendarException.count()).toBe(0);
    } finally { spy.mockRestore(); }
  }, 60000);

  const liveBrowser = process.env['P5054_LIVE_BROWSER'] === '1' ? it : it.skip;
  liveBrowser('T53-C/D actual Playwright UI against isolated PostgreSQL and real Nest API', async () => {
    const f = await scopeFixture();
    overlayInstant = new Date('2026-08-12T12:00:00Z');
    await calendarGrant(f);
    await h.seedCapabilities([{ key: 'TEACHING_OPERATION_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] }]);
    await h.prisma.capabilityGrant.createMany({ data: ['TEACHING_OPERATION_MANAGE', 'TEACHING_EXECUTION_MANAGE'].map((capabilityKey) =>
      ({ userId: f.actor.id, capabilityKey, scopeType: 'SCHOOL_WIDE', validFrom: new Date('2026-08-01Z') })) });
    await h.prisma.staffProfile.update({ where: { userId: f.actor.id }, data: { isTeachingStaff: true, displayName: 'Cán bộ điều hành kiểm thử' } });
    const substitute = await h.actor();
    await h.prisma.staffProfile.update({ where: { userId: substitute.id }, data: { isTeachingStaff: true, displayName: 'Giáo viên kiểm thử thay thế' } });
    await h.prisma.staffSubject.create({ data: { userId: substitute.id, subjectId: f.subject.id, validFrom: new Date('2026-08-01Z') } });
    const concurrentEntry = await h.prisma.timetableEntry.findFirstOrThrow({ where: { schoolClassId: f.class11.id } });
    const done = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f));
    expect(done.status).toBe(201);
    const denied = await h.actor();
    const username = (await h.prisma.user.findUniqueOrThrow({ where: { id: f.actor.id } })).username;
    const deniedUsername = (await h.prisma.user.findUniqueOrThrow({ where: { id: denied.id } })).username;
    const server = await h.app.listen(0, '127.0.0.1');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Isolated API HTTP address unavailable');
    const result = await new Promise<{ code: number | null; output: string }>((finish, reject) => {
      const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', 'specs/p5-054-calendar-live.spec.ts'], {
        cwd: resolvePath(__dirname, '../../../../tests/e2e'),
        env: { ...process.env, JEST_WORKER_ID: undefined, P5054_API_URL: `http://127.0.0.1:${address.port}`, P5054_TEST_USERNAME: username,
          P5054_DENIED_USERNAME: deniedUsername, P5054_NORMAL_JSON: JSON.stringify({ ...normalBody(f), schoolClassId: f.class11.id, timetableEntryId: concurrentEntry.id }),
          P5054_CALENDAR_JSON: JSON.stringify(cancellation(f)) },
        windowsHide: true,
      });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => finish({ code, output }));
    });
    if (result.code !== 0) throw new Error(result.output);
    process.stdout.write(result.output);
    expect(await h.prisma.calendarException.count()).toBe(1);
    expect(await h.prisma.calendarException.count({ where: { status: 'REVERSED' } })).toBe(1);
    expect(await h.prisma.curricularTeachingExecution.count({ where: { status: 'ACTIVE' } })).toBe(2);
    expect(await h.prisma.auditEvent.count({ where: { action: 'CALENDAR_EXCEPTION_CREATED' } })).toBe(1);
    expect(await h.prisma.makeupTeachingSchedule.count()).toBe(2);
    expect(await h.prisma.makeupTeachingSchedule.count({ where: { status: 'ACTIVE' } })).toBe(1);
    const replacement = await h.prisma.makeupTeachingSchedule.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    expect(replacement.replacesId).not.toBeNull();
  }, 180000);

  it.each(['source', 'target'] as const)('T53-B DB retained MAKEUP %s date outside candidate selector remains guarded with actual-teacher/date credit intact', async (end) => {
    const f = await fixture();
    const created = await f.actor.agent.post('/api/teaching-executions/curricular/makeup')
      .set('Origin', testOrigin).send({ makeupTeachingScheduleId: f.makeup.id, requestKey: crypto.randomUUID() });
    expect(created.status).toBe(201);
    await workloadPolicy(f);
    const official = h.app.get(OfficialWorkloadProjectionService);
    const input = { academicYearId: f.year.id, targetUserId: f.actor.id, fromCivilDate: '2026-08-11' as const,
      toCivilDate: '2026-08-11' as const, asOfInstant: new Date('2026-08-31T12:00:00Z') };
    const before = await official.resolve(input);
    expect(before).toMatchObject({ status: 'PASS', earnedCredit: 1, requiredCredit: 9,
      curricularWorkload: { contributions: [expect.objectContaining({ executionId: created.body.item.id,
        actualTeacherUserId: f.actor.id, executionCivilDate: '2026-08-11', sourceCivilDate: '2026-08-10', kind: 'MAKEUP' })] } });
    expect(await official.resolve({ ...input, fromCivilDate: '2026-08-10', toCivilDate: '2026-08-10' }))
      .toMatchObject({ status: 'PASS', earnedCredit: 0, requiredCredit: 9 });
    await expect(h.app.get(OperationalOverlaysService).withCalendarPreviewReplay({
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id,
      civilDate: end === 'source' ? '2026-08-10' : '2026-08-11', scope: 'CLASS', schoolClassId: f.schoolClass.id,
      timeSelector: 'SESSION', session: 'AFTERNOON', note: 'Both retained ends require reconciliation regardless of selector',
    }, async () => { throw new Error('Callback must not run'); })).rejects.toMatchObject({
      code: 'CALENDAR_REPLAY_EXECUTION_RECONCILIATION_REQUIRED', retainedEntityId: created.body.item.id,
    });
    const retained = await h.prisma.curricularTeachingExecution.findUniqueOrThrow({ where: { id: created.body.item.id } });
    expect(retained).toMatchObject({ status: 'ACTIVE', actualTeacherUserId: f.actor.id,
      sourceCivilDate: new Date('2026-08-10Z'), executionCivilDate: new Date('2026-08-11Z') });
    const after = await official.resolve(input);
    expect(after.curricularWorkload).toEqual(before.curricularWorkload);
    expect(after).toMatchObject({ earnedCredit: 1, requiredCredit: 9 });
    expect(await h.prisma.calendarException.count()).toBe(0);
  });

  it('T53-B DB retained ACTIVE makeup rejects candidate in real RepeatableRead without persistence', async () => {
    const f = await fixture();
    const service = h.app.get(OperationalOverlaysService);
    const input = {
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id,
      civilDate: '2026-08-17' as const, scope: 'CLASS' as const,
      schoolClassId: f.schoolClass.id, timeSelector: 'WHOLE_DAY' as const,
      note: 'T53-B isolated PostgreSQL retrospective replay validation',
    };
    const before = {
      makeup: await h.prisma.makeupTeachingSchedule.count(),
      exceptions: await h.prisma.calendarException.count(),
      audits: await h.prisma.auditEvent.count(),
    };
    const attempt = service.withCalendarPreviewReplay(input, async (replay, tx) => {
      await replay.assertStream(tx, { academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id });
    });
    await expect(attempt).rejects.toMatchObject({
      code: 'CALENDAR_REPLAY_MAKEUP_RECONCILIATION_REQUIRED',
      retainedEntityId: f.makeup.id,
      missingAuthority: 'CANDIDATE_RETAINED_EXECUTION_AND_OFFICIAL_WORKLOAD_RECONCILIATION',
    });
    expect(await h.prisma.makeupTeachingSchedule.count()).toBe(before.makeup);
    expect(await h.prisma.calendarException.count()).toBe(before.exceptions);
    expect(await h.prisma.auditEvent.count()).toBe(before.audits);
  });

  it('T53-B DB retained ACTIVE execution is prioritized over makeup and survives candidate rejection', async () => {
    const f = await fixture();
    const made = await f.actor.agent.post('/api/teaching-executions/curricular/normal')
      .set('Origin', testOrigin).send(normalBody(f));
    expect(made.status).toBe(201);
    const service = h.app.get(OperationalOverlaysService);
    const input = {
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id,
      civilDate: '2026-08-17' as const, scope: 'CLASS' as const,
      schoolClassId: f.schoolClass.id, timeSelector: 'WHOLE_DAY' as const,
      note: 'T53-B isolated PostgreSQL retrospective replay validation',
    };
    const beforeAudit = await h.prisma.auditEvent.count();
    const attempt = service.withCalendarPreviewReplay(input, async (replay, tx) => {
      await replay.assertStream(tx, { academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id });
    });
    await expect(attempt).rejects.toMatchObject({
      code: 'CALENDAR_REPLAY_EXECUTION_RECONCILIATION_REQUIRED',
      retainedEntityId: made.body.item.id,
      missingAuthority: 'CANDIDATE_RETAINED_EXECUTION_AND_OFFICIAL_WORKLOAD_RECONCILIATION',
    });
    expect(await h.prisma.curricularTeachingExecution.findUniqueOrThrow({ where: { id: made.body.item.id } }))
      .toMatchObject({ status: 'ACTIVE', ppctItemId: f.item.id, sourceNormalOccurrenceKey: `NORMAL:${f.entry.id}:2026-08-10` });
    expect(await h.prisma.makeupTeachingSchedule.findUniqueOrThrow({ where: { id: f.makeup.id } }))
      .toMatchObject({ status: 'ACTIVE' });
    expect(await h.prisma.calendarException.count()).toBe(0);
    expect(await h.prisma.auditEvent.count()).toBe(beforeAudit);
  });

  it('T53-B DB RepeatableRead preview remains NOT_ASSESSED if execution commits after snapshot', async () => {
    const f = await fixture();
    // This fixture's schedule is irrelevant to the race and has no execution references.
    await h.prisma.makeupTeachingSchedule.delete({ where: { id: f.makeup.id } });
    const service = h.app.get(OperationalOverlaysService);
    let releaseSnapshot!: () => void;
    let snapshotReady!: () => void;
    const resume = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
    const ready = new Promise<void>((resolve) => { snapshotReady = resolve; });
    const input = {
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id,
      civilDate: '2026-08-17' as const, scope: 'CLASS' as const,
      schoolClassId: f.schoolClass.id, timeSelector: 'WHOLE_DAY' as const,
      note: 'T53-B isolated race diagnostics without mutation authorization',
    };
    const preview = service.withCalendarPreviewReplay(input, async (replay, tx) => {
      // Force a real PostgreSQL RepeatableRead snapshot before a competing commit.
      expect(await tx.curricularTeachingExecution.count({ where: { academicYearId: f.year.id } })).toBe(0);
      snapshotReady();
      await resume;
      await replay.assertStream(tx, { academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id });
      return replay.evidence(tx, { status: 'PASS' as const });
    });
    try {
      await ready;
      const created = await f.actor.agent.post('/api/teaching-executions/curricular/normal')
        .set('Origin', testOrigin).send(normalBody(f));
      expect(created.status).toBe(201);
    } finally {
      releaseSnapshot();
    }
    const evidence = await preview;
    expect(evidence.status).toBe('NOT_ASSESSED');
    expect(evidence.coverage).toEqual({ ppctItemAllocation: 'NOT_ASSESSED', debt: 'NOT_ASSESSED', workload: 'NOT_ASSESSED' });
    expect(evidence.limitations).toContain('MUTATION_REVALIDATION_UNAVAILABLE');
    expect(await h.prisma.curricularTeachingExecution.count({ where: { academicYearId: f.year.id, status: 'ACTIVE' } })).toBe(1);
    expect(await h.prisma.calendarException.count()).toBe(0);
  });

  it('T53-B DB school-wide candidate must not infer all-stream clearance from a different class', async () => {
    const f = await fixture();
    const secondClass = await h.prisma.schoolClass.create({
      data: { academicYearId: f.year.id, code: normalizedCode('C'), name: '10B', gradeLevel: 10 },
    });
    const service = h.app.get(OperationalOverlaysService);
    const input = {
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id,
      civilDate: '2026-08-17' as const, scope: 'SCHOOL_WIDE' as const,
      timeSelector: 'WHOLE_DAY' as const, note: 'T53-B school-wide multi-stream coverage evidence',
    };
    // The candidate-wide gate runs before the callback can approve a clear stream.
    await expect(service.withCalendarPreviewReplay(input, async (replay, tx) => {
      await replay.assertStream(tx, {
        academicYearId: f.year.id, schoolClassId: secondClass.id, subjectId: f.subject.id,
      });
      return replay.evidence(tx, { status: 'PASS' as const });
    })).rejects.toMatchObject({
      code: 'CALENDAR_REPLAY_MAKEUP_RECONCILIATION_REQUIRED',
      retainedEntityId: f.makeup.id,
    });
    expect(await h.prisma.calendarException.count()).toBe(0);
    expect(await h.prisma.makeupTeachingSchedule.findUniqueOrThrow({ where: { id: f.makeup.id } }))
      .toMatchObject({ status: 'ACTIVE' });
  });

  it('T53-B DB candidate-wide gate respects GRADE and CLASS isolation with retained evidence', async () => {
    const f = await fixture();
    const otherClass = await h.prisma.schoolClass.create({
      data: { academicYearId: f.year.id, code: normalizedCode('C'), name: '11A', gradeLevel: 11 },
    });
    const service = h.app.get(OperationalOverlaysService);
    const baseline = {
      academicYearId: f.year.id, academicCalendarVersionId: f.calendar.id,
      civilDate: '2026-08-17' as const, timeSelector: 'WHOLE_DAY' as const,
      note: 'T53-B candidate-wide scope protection without publication',
    };
    const evaluate = async (replay: import('../../src/resolved-occurrences/calendar-exception-replay').CalendarExceptionReplay,
      tx: Prisma.TransactionClient) => replay.evidence(tx, { status: 'PASS' as const });
    await expect(service.withCalendarPreviewReplay({
      ...baseline, scope: 'GRADE', gradeLevel: 10,
    }, evaluate)).rejects.toMatchObject({
      code: 'CALENDAR_REPLAY_MAKEUP_RECONCILIATION_REQUIRED', retainedEntityId: f.makeup.id,
    });
    const grade11 = await service.withCalendarPreviewReplay({
      ...baseline, scope: 'GRADE', gradeLevel: 11,
    }, evaluate);
    expect(grade11.status).toBe('NOT_ASSESSED');
    expect(grade11.coverage.workload).toBe('NOT_ASSESSED');
    const class11 = await service.withCalendarPreviewReplay({
      ...baseline, scope: 'CLASS', schoolClassId: otherClass.id,
    }, evaluate);
    expect(class11.status).toBe('NOT_ASSESSED');
    expect(class11.coverage.ppctItemAllocation).toBe('NOT_ASSESSED');
    expect(await h.prisma.makeupTeachingSchedule.count({ where: { id: f.makeup.id, status: 'ACTIVE' } })).toBe(1);
    expect(await h.prisma.calendarException.count()).toBe(0);
  });

  it('DB1 NORMAL persists complete relational provenance and execution+audit atomically', async () => { const f = await fixture(); const response = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f)); expect(response.status).toBe(201); expect(response.body.outcome).toBe('CREATED'); const row = await h.prisma.curricularTeachingExecution.findUniqueOrThrow({ where: { id: response.body.item.id } }); expect(row).toMatchObject({ originalTimetableEntryId: f.entry.id, originalTeachingAssignmentId: f.assignment.id, ppctItemRevisionId: f.revision.id, actualTeacherUserId: f.actor.id }); expect(await h.prisma.auditEvent.count({ where: { entityId: row.id, action: 'TEACHING_EXECUTION_CONFIRMED', result: 'SUCCESS' } })).toBe(1); });
  it('DB2 SAME_SUBJECT_SUBSTITUTION persists exact disposition and assigned-teacher relational provenance', async () => { const f = await fixture(); const substitute = await h.actor({ grants: [{ capabilityKey: 'TEACHING_EXECUTION_RECORD', scopeType: 'PERSONAL' }] }); const proof = await h.prisma.staffSubject.create({ data: { userId: substitute.id, subjectId: f.subject.id, validFrom: new Date('2026-08-01Z') } }); const disposition = await h.prisma.operationalLessonDisposition.create({ data: { academicYearId: f.year.id, timetableVersionId: f.timetable.id, timetableEntryId: f.entry.id, sourceCivilDate: new Date('2026-08-10Z'), academicCalendarVersionId: f.calendar.id, timeSlotDefinitionId: f.slot.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, teachingAssignmentId: f.assignment.id, responsibleTeacherUserId: f.actor.id, dispositionType: 'SAME_SUBJECT_SUBSTITUTION', assignedTeacherUserId: substitute.id, eligibilityCheckedAt: new Date('2026-08-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true, eligibilitySameSubject: true, eligibilityStaffSubjectId: proof.id, createRequestKey: crypto.randomUUID(), createRequestFingerprint: crypto.randomUUID(), createdByUserId: f.actor.id } }); const response = await substitute.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f)); expect(response.status).toBe(201); expect(response.body.outcome).toBe('CREATED'); expect(await h.prisma.curricularTeachingExecution.findUniqueOrThrow({ where: { id: response.body.item.id } })).toMatchObject({ operationalLessonDispositionId: disposition.id, actualTeacherUserId: substitute.id, originalTeachingAssignmentId: f.assignment.id }); });
  it('DB3 MAKEUP retains separate original and target FK-consistent bundles', async () => { const f = await fixture(); const response = await f.actor.agent.post('/api/teaching-executions/curricular/makeup').set('Origin', testOrigin).send({ makeupTeachingScheduleId: f.makeup.id, requestKey: crypto.randomUUID() }); expect(response.status).toBe(201); expect(response.body.outcome).toBe('CREATED'); expect(await h.prisma.curricularTeachingExecution.findUniqueOrThrow({ where: { id: response.body.item.id } })).toMatchObject({ sourceCivilDate: new Date('2026-08-10Z'), sourceTimeSlotDefinitionId: f.slot.id, executionCivilDate: new Date('2026-08-11Z'), executionTimeSlotDefinitionId: f.makeupSlot.id, makeupTeachingScheduleId: f.makeup.id }); });
  it('DB4a NORMAL/NORMAL obligation concurrency with different request keys creates exactly one ACTIVE survivor', async () => { const f = await fixture(); const responses = await Promise.all([f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f, crypto.randomUUID())), f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f, crypto.randomUUID()))]); expect(responses.map((x) => x.status).every((x) => [201,409].includes(x))).toBe(true); expect(responses.some((x) => x.status === 201 && x.body.outcome === 'CREATED')).toBe(true); expect(await h.prisma.curricularTeachingExecution.count({ where: { status: 'ACTIVE' } })).toBe(1); });
  it('DB4b same-key semantic concurrency converges on one curricular execution identity', async () => { const f = await fixture(); const key = crypto.randomUUID(); const responses = await Promise.all([f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f, key)), f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f, key))]); expect(responses.map((x) => x.status)).toEqual([201,201]); expect(responses.map((x) => x.body.outcome).sort()).toEqual(['CREATED','IDEMPOTENT_REPLAY']); expect(new Set(responses.map((x) => x.body.item.id)).size).toBe(1); expect(await h.prisma.curricularTeachingExecution.count({ where: { status: 'ACTIVE' } })).toBe(1); });
  it('DB5 independently valid NORMAL/MAKEUP concurrency with different keys creates exactly one ACTIVE obligation owner', async () => { const f = await fixture(); const responses = await Promise.all([f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f, crypto.randomUUID())), f.actor.agent.post('/api/teaching-executions/curricular/makeup').set('Origin', testOrigin).send({ makeupTeachingScheduleId: f.makeup.id, requestKey: crypto.randomUUID() })]); expect(responses.map((x) => x.status).every((x) => [201,409].includes(x))).toBe(true); expect(responses.some((x) => x.status === 201 && x.body.outcome === 'CREATED')).toBe(true); expect(await h.prisma.curricularTeachingExecution.count({ where: { status: 'ACTIVE' } })).toBe(1); });
  it('DB6 duplicate activity concurrency with different keys creates exactly one ACTIVE survivor', async () => { const f = await fixture(); const responses = await Promise.all([f.actor.agent.post('/api/teaching-executions/activity-participations').set('Origin', testOrigin).send(activityBody(f, crypto.randomUUID())), f.actor.agent.post('/api/teaching-executions/activity-participations').set('Origin', testOrigin).send(activityBody(f, crypto.randomUUID()))]); expect(responses.map((x) => x.status).every((x) => [201,409].includes(x))).toBe(true); expect(responses.some((x) => x.status === 201 && x.body.outcome === 'CREATED')).toBe(true); expect(await h.prisma.specialActivityParticipationExecution.count({ where: { status: 'ACTIVE' } })).toBe(1); });
  it('DB7 failed validation leaves neither execution nor success audit', async () => { const f = await fixture(); const response = await f.actor.agent.post('/api/teaching-executions/activity-participations').set('Origin', testOrigin).send({ ...activityBody(f), specialActivityStaffingId: crypto.randomUUID() }); expect(response.status).toBe(409); expect(await h.prisma.specialActivityParticipationExecution.count()).toBe(0); expect(await h.prisma.auditEvent.count({ where: { action: 'TEACHING_EXECUTION_CONFIRMED', result: 'SUCCESS' } })).toBe(0); });
  it('DB8 curricular and activity replacement topology FKs reject existing cross-unit linkage', async () => {
    const f = await fixture();
    const firstNormal = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f));
    expect(firstNormal.status).toBe(201);
    const secondItem = await h.prisma.ppctItem.create({ data: { ppctPlanId: f.plan.id, component: 'CORE' } });
    await h.prisma.ppctItemRevision.create({ data: { ppctVersionId: f.version.id, ppctPlanId: f.plan.id, ppctItemId: secondItem.id, component: 'CORE', sequence: 2, title: 'Lesson 2', lessonType: 'LESSON' } });
    const secondSlot = await h.prisma.timeSlotDefinition.create({ data: { academicYearId: f.year.id, weekday: 'MONDAY', session: 'MORNING', ordinal: 2, revision: 1, displayLabel: 'Two', startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T08:45:00Z'), allowRegularTeaching: true, allowMakeupTeaching: true } });
    const secondEntry = await h.prisma.timetableEntry.create({ data: { timetableVersionId: f.timetable.id, academicYearId: f.year.id, weekday: 'MONDAY', timeSlotDefinitionId: secondSlot.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, teachingAssignmentId: f.assignment.id, teacherUserId: f.actor.id } });
    const secondNormal = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send({ ...normalBody(f), timetableEntryId: secondEntry.id });
    expect(secondNormal.status).toBe(201);
    expect(secondNormal.body.item.id).not.toBe(firstNormal.body.item.id);
    expect(secondNormal.body.item.ppctItemId).not.toBe(firstNormal.body.item.ppctItemId);
    await expect(h.prisma.curricularTeachingExecution.update({ where: { id: firstNormal.body.item.id }, data: { replacesId: secondNormal.body.item.id } })).rejects.toMatchObject({ code: 'P2003' });

    const firstActivity = await f.actor.agent.post('/api/teaching-executions/activity-participations').set('Origin', testOrigin).send(activityBody(f));
    expect(firstActivity.status).toBe(201);
    const secondActor = await h.actor({ grants: [{ capabilityKey: 'TEACHING_EXECUTION_RECORD', scopeType: 'PERSONAL' }] });
    const secondStaffing = await h.prisma.specialActivityStaffing.create({ data: { specialActivityId: f.activity.id, scheduledTeacherUserId: secondActor.id, staffProfileId: (await h.prisma.staffProfile.findUniqueOrThrow({ where: { userId: secondActor.id } })).id, eligibilityCheckedAt: new Date('2026-08-01Z'), eligibilityWasActive: true, eligibilityWasTeachingStaff: true } });
    const secondActivity = await secondActor.agent.post('/api/teaching-executions/activity-participations').set('Origin', testOrigin).send({ specialActivityId: f.activity.id, specialActivityStaffingId: secondStaffing.id, specialActivityTimeSlotId: f.activity.timeSlots[0]!.id, requestKey: crypto.randomUUID() });
    expect(secondActivity.status).toBe(201);
    expect(secondActivity.body.item.id).not.toBe(firstActivity.body.item.id);
    expect(secondActivity.body.item.specialActivityStaffingId).not.toBe(firstActivity.body.item.specialActivityStaffingId);
    await expect(h.prisma.specialActivityParticipationExecution.update({ where: { id: firstActivity.body.item.id }, data: { replacesId: secondActivity.body.item.id } })).rejects.toMatchObject({ code: 'P2003' });
  });
  it('DB9 reversal retains immutable history and permits separately validated replacements in both families', async () => { const f = await fixture(); const made = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f)); expect(made.status).toBe(201); expect(made.body.outcome).toBe('CREATED'); const reversed = await f.actor.agent.post(`/api/teaching-executions/curricular/${made.body.item.id}/reverse`).set('Origin', testOrigin).send({ requestKey: crypto.randomUUID(), expectedUpdatedAt: made.body.item.updatedAt, reversalReason: 'Correction' }); expect(reversed.status).toBe(200); const replacement = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f, crypto.randomUUID(), made.body.item.id)); expect(replacement.status).toBe(201); expect(await h.prisma.curricularTeachingExecution.count()).toBe(2); const activity = await f.actor.agent.post('/api/teaching-executions/activity-participations').set('Origin', testOrigin).send(activityBody(f)); expect(activity.status).toBe(201); expect(activity.body.outcome).toBe('CREATED'); const activityReversed = await f.actor.agent.post(`/api/teaching-executions/activity-participations/${activity.body.item.id}/reverse`).set('Origin', testOrigin).send({ requestKey: crypto.randomUUID(), expectedUpdatedAt: activity.body.item.updatedAt, reversalReason: 'Correction' }); expect(activityReversed.status).toBe(200); expect((await f.actor.agent.post('/api/teaching-executions/activity-participations').set('Origin', testOrigin).send(activityBody(f, crypto.randomUUID(), activity.body.item.id))).status).toBe(201); });
  it('DB10 database uniqueness indexes are present for curricular obligations and activity participation', async () => { const indexes = await h.prisma.$queryRaw<Array<{ indexname: string }>>(Prisma.sql`SELECT indexname FROM pg_indexes WHERE indexname IN ('curricular_exec_one_active_obligation_key','activity_participation_one_active_key') ORDER BY indexname`); expect(indexes.map((x) => x.indexname)).toEqual(['activity_participation_one_active_key','curricular_exec_one_active_obligation_key']); });

  it('DB11 NORMAL pre-op new confirmation rejects CANNOT_CONFIRM_PRE_OPERATIONAL_EXECUTION (409)', async () => {
    const f = await fixture('2026-08-15'); // OSD is Aug 15
    // sourceCivilDate in normalBody is 2026-08-10, which is < 2026-08-15
    const response = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f));
    expect(response.status).toBe(409);
    expect(response.body.message).toContain('CANNOT_CONFIRM_PRE_OPERATIONAL_EXECUTION');
    expect(await h.prisma.curricularTeachingExecution.count()).toBe(0);
  });

  it('DB12 NORMAL boundary sourceCivilDate === OSD succeeds (201)', async () => {
    const f = await fixture('2026-08-10'); // OSD matches sourceCivilDate 2026-08-10
    const response = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f));
    expect(response.status).toBe(201);
    expect(response.body.outcome).toBe('CREATED');
  });

  it('DB13 MAKEUP original pre-op + target post-op rejects CANNOT_CONFIRM_PRE_OPERATIONAL_MAKEUP_OBLIGATION (409)', async () => {
    const f = await fixture('2026-08-11'); // original is 2026-08-10 (< 11), target is 2026-08-11 (>= 11)
    const response = await f.actor.agent.post('/api/teaching-executions/curricular/makeup').set('Origin', testOrigin).send({ makeupTeachingScheduleId: f.makeup.id, requestKey: crypto.randomUUID() });
    expect(response.status).toBe(409);
    expect(response.body.message).toContain('CANNOT_CONFIRM_PRE_OPERATIONAL_MAKEUP_OBLIGATION');
    expect(await h.prisma.curricularTeachingExecution.count()).toBe(0);
  });

  it('DB14 MAKEUP original boundary originalCivilDate === OSD succeeds (201)', async () => {
    const f = await fixture('2026-08-10'); // original is 2026-08-10 === OSD
    const response = await f.actor.agent.post('/api/teaching-executions/curricular/makeup').set('Origin', testOrigin).send({ makeupTeachingScheduleId: f.makeup.id, requestKey: crypto.randomUUID() });
    expect(response.status).toBe(201);
    expect(response.body.outcome).toBe('CREATED');
  });

  it('DB15 without configured OPERATIONAL_START rejects POLICY_NOT_CONFIGURED (409)', async () => {
    const f = await fixture();
    // delete policy to simulate unconfigured policy
    await h.prisma.businessPolicyVersion.deleteMany();
    await h.prisma.businessPolicyStream.deleteMany();
    const response = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f));
    expect(response.status).toBe(409);
    expect(response.body.message).toContain('POLICY_NOT_CONFIGURED');
  });

  it('DB16 reverse retained curricular execution succeeds without policy dependency', async () => {
    const f = await fixture('2026-08-01');
    const made = await f.actor.agent.post('/api/teaching-executions/curricular/normal').set('Origin', testOrigin).send(normalBody(f));
    expect(made.status).toBe(201);

    // Delete policy after creation to prove reversal does not require policy resolution
    await h.prisma.businessPolicyVersion.deleteMany();
    await h.prisma.businessPolicyStream.deleteMany();

    const reversed = await f.actor.agent.post(`/api/teaching-executions/curricular/${made.body.item.id}/reverse`).set('Origin', testOrigin).send({
      requestKey: crypto.randomUUID(),
      expectedUpdatedAt: made.body.item.updatedAt,
      reversalReason: 'Historical correction after policy deletion',
    });
    expect(reversed.status).toBe(200);
    expect(reversed.body.outcome).toBe('REVERSED');
  });
});
