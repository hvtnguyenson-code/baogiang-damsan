import { randomUUID } from 'node:crypto';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

integration('P3-020 historical teaching runtime (PostgreSQL)', () => {
  const h = new Phase01Harness();
  const header = 'LOP,MON,NGAY_GOC,BUOI_GOC,TIET_GOC,GIAO_VIEN_THUC_DAY,LOAI,NGAY_DAY_THUC_TE,BUOI_THUC_TE,TIET_THUC_TE,GHI_CHU';

  beforeAll(async () => h.start());
  afterAll(async () => { try { await clean(); } finally { await h.stop(); } });
  beforeEach(async () => clean());

  async function clean() {
    await h.prisma.historicalTeachingImportRow.deleteMany();
    await h.prisma.historicalTeachingImportBatch.deleteMany();
    await h.prisma.businessPolicyVersion.deleteMany();
    await h.prisma.businessPolicyStream.deleteMany();
    await h.prisma.curricularTeachingExecution.deleteMany();
    await h.prisma.makeupTeachingSchedule.deleteMany();
    await h.prisma.operationalLessonDisposition.deleteMany();
    await h.prisma.ppctItemLineage.deleteMany();
    await h.prisma.ppctClassAssociation.deleteMany();
    await h.prisma.ppctItemRevision.deleteMany();
    await h.prisma.ppctItem.deleteMany();
    await h.prisma.ppctVersion.deleteMany();
    await h.prisma.ppctPlan.deleteMany();
    await h.clean();
  }

  async function fixture() {
    await h.seedCapabilities([
      { key: 'TEACHING_EXECUTION_RECORD', scopes: ['PERSONAL'] },
      { key: 'TEACHING_EXECUTION_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
    ]);
    const manager = await h.actor({ grants: [{ capabilityKey: 'TEACHING_EXECUTION_MANAGE', scopeType: 'SCHOOL_WIDE' }] });
    const managerCode = normalizedCode('GVHIST1');
    await h.prisma.staffProfile.update({
      where: { userId: manager.id },
      data: { staffCode: managerCode, displayName: 'Giáo viên lịch sử 1', isTeachingStaff: true },
    });
    const substitute = await h.actor();
    const substituteCode = normalizedCode('GVHIST2');
    await h.prisma.staffProfile.update({
      where: { userId: substitute.id },
      data: { staffCode: substituteCode, displayName: 'Giáo viên lịch sử 2', isTeachingStaff: true },
    });
    const outsider = await h.actor();

    const year = await h.prisma.academicYear.create({
      data: { code: normalizedCode('HIST'), name: 'Năm học lịch sử' },
    });
    const calendar = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-08-01Z'),
        endDate: new Date('2027-05-31Z'),
        officialWeekCount: 35,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'TUESDAY'],
        isActive: true,
        activatedAt: new Date('2026-08-01Z'),
      },
    });
    const week = await h.prisma.academicWeek.create({
      data: { calendarVersionId: calendar.id, kind: 'OFFICIAL', officialWeekNumber: 1, displayLabel: 'Tuần 1', sortOrder: 1 },
    });
    await h.prisma.academicWeekSegment.create({
      data: {
        academicWeekId: week.id,
        calendarVersionId: calendar.id,
        label: 'Tuần 1',
        segmentOrder: 1,
        startDate: new Date('2026-08-01Z'),
        endDate: new Date('2026-08-31Z'),
      },
    });

    const schoolClass = await h.prisma.schoolClass.create({
      data: { academicYearId: year.id, code: normalizedCode('10A1H'), name: '10A1', gradeLevel: 10 },
    });
    const subject = await h.prisma.subject.create({
      data: { code: normalizedCode('DIAH'), name: 'Địa lí' },
    });
    const sourceSlot = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Sáng tiết 1',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        allowRegularTeaching: true,
        allowMakeupTeaching: true,
      },
    });
    const makeupSlot = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'TUESDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 1,
        displayLabel: 'Sáng tiết 1 thứ ba',
        startTime: new Date('1970-01-01T07:00:00Z'),
        endTime: new Date('1970-01-01T07:45:00Z'),
        allowRegularTeaching: false,
        allowMakeupTeaching: true,
      },
    });

    const assignment = await h.prisma.teachingAssignment.create({
      data: {
        academicYearId: year.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teacherUserId: manager.id,
        validFrom: new Date('2026-08-01Z'),
      },
    });
    const timetable = await h.prisma.timetableVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        status: 'ACTIVE',
        calendarVersionId: calendar.id,
        effectiveAcademicWeekId: week.id,
        effectiveFrom: new Date('2026-08-10Z'),
        createdByUserId: manager.id,
        validatedByUserId: manager.id,
        validatedAt: new Date('2026-08-01Z'),
        approvedByUserId: manager.id,
        approvedAt: new Date('2026-08-01Z'),
        activatedByUserId: manager.id,
        activatedAt: new Date('2026-08-01Z'),
      },
    });
    const entry = await h.prisma.timetableEntry.create({
      data: {
        timetableVersionId: timetable.id,
        academicYearId: year.id,
        weekday: 'MONDAY',
        timeSlotDefinitionId: sourceSlot.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teachingAssignmentId: assignment.id,
        teacherUserId: manager.id,
      },
    });

    const plan = await h.prisma.ppctPlan.create({
      data: { academicYearId: year.id, subjectId: subject.id, gradeLevel: 10 },
    });
    const ppctVersion = await h.prisma.ppctVersion.create({
      data: {
        ppctPlanId: plan.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        createdByUserId: manager.id,
        publishedByUserId: manager.id,
        publishedAt: new Date('2026-08-01Z'),
      },
    });
    const item = await h.prisma.ppctItem.create({ data: { ppctPlanId: plan.id, component: 'CORE' } });
    const revision = await h.prisma.ppctItemRevision.create({
      data: {
        ppctVersionId: ppctVersion.id,
        ppctPlanId: plan.id,
        ppctItemId: item.id,
        component: 'CORE',
        sequence: 1,
        title: 'Bài lịch sử',
        lessonType: 'LESSON',
      },
    });
    await h.prisma.ppctClassAssociation.create({
      data: {
        academicYearId: year.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        gradeLevel: 10,
        ppctPlanId: plan.id,
        ppctVersionId: ppctVersion.id,
        curricularProfile: 'CORE_ONLY',
        effectiveFrom: new Date('2026-08-01Z'),
        createdByUserId: manager.id,
      },
    });

    await h.prisma.staffSubject.createMany({
      data: [
        { userId: manager.id, subjectId: subject.id, validFrom: new Date('2026-07-31T17:00:00Z') },
        { userId: substitute.id, subjectId: subject.id, validFrom: new Date('2026-07-31T17:00:00Z') },
      ],
    });

    const stream = await h.prisma.businessPolicyStream.create({
      data: { familyKey: 'OPERATIONAL_START', resourceKind: 'ACADEMIC_YEAR', academicYearId: year.id },
    });
    const policyVersion = await h.prisma.businessPolicyVersion.create({
      data: {
        streamId: stream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: { operationalStartDate: '2026-08-15' },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01Z'),
        publishedAt: new Date('2026-08-01Z'),
        publishedByUserId: manager.id,
        createdByUserId: manager.id,
      },
    });

    return {
      manager, substitute, outsider, year, calendar, schoolClass, subject, sourceSlot, makeupSlot,
      assignment, timetable, entry, revision, policyVersion,
      managerCode,
      substituteCode,
    };
  }

  function csv(f: Awaited<ReturnType<typeof fixture>>, kind: 'BINH_THUONG' | 'DAY_THAY' | 'DAY_BU') {
    const teacher = kind === 'BINH_THUONG' ? f.managerCode : f.substituteCode;
    const target = kind === 'DAY_BU' ? ',2026-08-11,SANG,1' : ',,,';
    return [
      header,
      `${f.schoolClass.code},${f.subject.code},2026-08-10,SANG,1,${teacher},${kind}${target},Lịch sử xác minh`,
    ].join('\n');
  }

  async function preview(f: Awaited<ReturnType<typeof fixture>>, sourceText: string) {
    return f.manager.agent
      .post('/api/historical-teaching/preview')
      .set('Origin', testOrigin)
      .send({ academicYearId: f.year.id, sourceText });
  }

  async function confirm(
    f: Awaited<ReturnType<typeof fixture>>,
    sourceText: string,
    previewResult: { batchRef: string; requestFingerprint: string },
    requestKey = randomUUID(),
  ) {
    return f.manager.agent
      .post('/api/historical-teaching/confirm')
      .set('Origin', testOrigin)
      .send({
        academicYearId: f.year.id,
        sourceText,
        batchRef: previewResult.batchRef,
        requestFingerprint: previewResult.requestFingerprint,
        requestKey,
      });
  }

  it('confirms NORMAL pre-operational evidence into canonical execution and retains provenance', async () => {
    const f = await fixture();
    const sourceText = csv(f, 'BINH_THUONG');
    const inspected = await preview(f, sourceText);
    expect(inspected.status).toBe(200);
    expect(inspected.body.canConfirm).toBe(true);
    expect(inspected.body.rows[0]).toMatchObject({
      kind: 'NORMAL',
      status: 'READY',
      ppct: { component: 'CORE', sequence: 1, title: 'Bài lịch sử' },
    });

    const requestKey = randomUUID();
    const committed = await confirm(f, sourceText, inspected.body, requestKey);
    expect(committed.status).toBe(200);
    expect(committed.body.outcome).toBe('CREATED');

    const execution = await h.prisma.curricularTeachingExecution.findUniqueOrThrow({
      where: { id: committed.body.rows[0].executionId },
    });
    expect(execution).toMatchObject({
      kind: 'NORMAL',
      originalTimetableEntryId: f.entry.id,
      ppctItemRevisionId: f.revision.id,
      actualTeacherUserId: f.manager.id,
      responsibleTeacherUserId: f.manager.id,
    });
    const provenance = await h.prisma.historicalTeachingImportRow.findUniqueOrThrow({
      where: { curricularTeachingExecutionId: execution.id },
      include: { batch: true },
    });
    expect(provenance.batch.operationalStartPolicyVersionId).toBe(f.policyVersion.id);
    expect(provenance.batch.sourceSha256).toMatch(/^[0-9a-f]{64}$/u);

    const replay = await confirm(f, sourceText, inspected.body, requestKey);
    expect(replay.status).toBe(200);
    expect(replay.body.outcome).toBe('IDEMPOTENT_REPLAY');
    expect(replay.body.rows[0].executionId).toBe(execution.id);

    const wrongBatchRef = inspected.body.batchRef.startsWith('0')
      ? `1${inspected.body.batchRef.slice(1)}`
      : `0${inspected.body.batchRef.slice(1)}`;
    const mismatchedReplay = await f.manager.agent
      .post('/api/historical-teaching/confirm')
      .set('Origin', testOrigin)
      .send({
        academicYearId: f.year.id,
        sourceText,
        batchRef: wrongBatchRef,
        requestFingerprint: inspected.body.requestFingerprint,
        requestKey,
      });
    expect(mismatchedReplay.status).toBe(409);
    expect(await h.prisma.curricularTeachingExecution.count()).toBe(1);
  });

  it('keeps ordinary pre-operational confirmation fail-closed', async () => {
    const f = await fixture();
    const response = await f.manager.agent
      .post('/api/teaching-executions/curricular/normal')
      .set('Origin', testOrigin)
      .send({
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        timetableEntryId: f.entry.id,
        sourceCivilDate: '2026-08-10',
        requestKey: randomUUID(),
      });
    expect(response.status).toBe(409);
    expect(response.body.message).toContain('CANNOT_CONFIRM_PRE_OPERATIONAL_EXECUTION');
  });

  it('creates exact historical substitution provenance for DAY_THAY', async () => {
    const f = await fixture();
    const sourceText = csv(f, 'DAY_THAY');
    const inspected = await preview(f, sourceText);
    expect(inspected.status).toBe(200);
    expect(inspected.body.canConfirm).toBe(true);

    const committed = await confirm(f, sourceText, inspected.body);
    expect(committed.status).toBe(200);
    const execution = await h.prisma.curricularTeachingExecution.findUniqueOrThrow({
      where: { id: committed.body.rows[0].executionId },
    });
    expect(execution.kind).toBe('NORMAL');
    expect(execution.actualTeacherUserId).toBe(f.substitute.id);
    expect(execution.operationalDispositionType).toBe('SAME_SUBJECT_SUBSTITUTION');
    const disposition = await h.prisma.operationalLessonDisposition.findUniqueOrThrow({
      where: { id: execution.operationalLessonDispositionId! },
    });
    expect(disposition).toMatchObject({
      assignedTeacherUserId: f.substitute.id,
      subjectId: f.subject.id,
      status: 'ACTIVE',
      eligibilitySameSubject: true,
    });
  });

  it('creates exact historical make-up provenance for DAY_BU', async () => {
    const f = await fixture();
    const sourceText = csv(f, 'DAY_BU');
    const inspected = await preview(f, sourceText);
    expect(inspected.status).toBe(200);
    expect(inspected.body.canConfirm).toBe(true);

    const committed = await confirm(f, sourceText, inspected.body);
    expect(committed.status).toBe(200);
    const execution = await h.prisma.curricularTeachingExecution.findUniqueOrThrow({
      where: { id: committed.body.rows[0].executionId },
    });
    expect(execution.kind).toBe('MAKEUP');
    expect(execution.executionCivilDate).toEqual(new Date('2026-08-11Z'));
    expect(execution.executionTimeSlotDefinitionId).toBe(f.makeupSlot.id);
    expect(execution.actualTeacherUserId).toBe(f.substitute.id);
    const schedule = await h.prisma.makeupTeachingSchedule.findUniqueOrThrow({
      where: { id: execution.makeupTeachingScheduleId! },
    });
    expect(schedule).toMatchObject({
      originalTimetableEntryId: f.entry.id,
      scheduledTeacherUserId: f.substitute.id,
      targetTimeSlotDefinitionId: f.makeupSlot.id,
      status: 'ACTIVE',
    });
  });

  it('reconciles confirmed/unconfirmed state and supports reverse then lineage replacement', async () => {
    const f = await fixture();
    const sourceText = csv(f, 'BINH_THUONG');

    const before = await f.manager.agent.get('/api/historical-teaching/reconciliation').query({
      academicYearId: f.year.id,
      schoolClassCode: f.schoolClass.code,
      subjectCode: f.subject.code,
    });
    expect(before.status).toBe(200);
    expect(before.body.counts.unconfirmed).toBe(1);
    expect(before.body.counts.confirmed).toBe(0);

    const inspected = await preview(f, sourceText);
    const committed = await confirm(f, sourceText, inspected.body);
    const executionId = committed.body.rows[0].executionId;

    const confirmed = await f.manager.agent.get('/api/historical-teaching/reconciliation').query({
      academicYearId: f.year.id,
      schoolClassCode: f.schoolClass.code,
      subjectCode: f.subject.code,
    });
    expect(confirmed.body.counts.confirmed).toBe(1);
    const confirmedRow = confirmed.body.rows.find((row: { executionId: string | null }) => row.executionId === executionId);
    expect(confirmedRow).toBeDefined();

    const reversed = await f.manager.agent
      .post(`/api/historical-teaching/executions/${executionId}/reverse`)
      .set('Origin', testOrigin)
      .send({
        requestKey: randomUUID(),
        expectedUpdatedAt: confirmedRow.executionUpdatedAt,
        reversalReason: 'Sửa minh chứng lịch sử',
      });
    expect(reversed.status).toBe(200);
    expect(reversed.body.outcome).toBe('REVERSED');

    const afterReverse = await f.manager.agent.get('/api/historical-teaching/reconciliation').query({
      academicYearId: f.year.id,
      schoolClassCode: f.schoolClass.code,
      subjectCode: f.subject.code,
    });
    expect(afterReverse.body.counts.unconfirmed).toBe(1);

    const rePreview = await preview(f, sourceText);
    expect(rePreview.body.rows[0].replacementCandidate).toBe(true);
    const replacement = await confirm(f, sourceText, rePreview.body);
    expect(replacement.status).toBe(200);
    const replacementExecution = await h.prisma.curricularTeachingExecution.findUniqueOrThrow({
      where: { id: replacement.body.rows[0].executionId },
    });
    expect(replacementExecution.replacesId).toBe(executionId);
    expect(await h.prisma.curricularTeachingExecution.count()).toBe(2);
  });

  it('fails closed when a DAY_BU coordinate has multiple retained slot revisions', async () => {
    const f = await fixture();
    await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: f.year.id,
        weekday: 'TUESDAY',
        session: 'MORNING',
        ordinal: 1,
        revision: 2,
        displayLabel: 'Tiết bù retained revision 2',
        startTime: new Date('1970-01-01T08:05:00Z'),
        endTime: new Date('1970-01-01T08:50:00Z'),
        isActive: false,
        allowRegularTeaching: false,
        allowMakeupTeaching: true,
        allowSelfStudy: false,
      },
    });

    const inspected = await preview(f, csv(f, 'DAY_BU'));
    expect(inspected.status).toBe(200);
    expect(inspected.body.canConfirm).toBe(false);
    expect(inspected.body.rows[0].issues.map((issue: { code: string }) => issue.code))
      .toContain('HISTORY_MAKEUP_TARGET_SLOT_AMBIGUOUS');
  });

  it('does not reverse an existing substitution overlay reused as historical provenance', async () => {
    const f = await fixture();
    const staffSubject = await h.prisma.staffSubject.findFirstOrThrow({
      where: { userId: f.substitute.id, subjectId: f.subject.id },
    });
    const disposition = await h.prisma.operationalLessonDisposition.create({
      data: {
        academicYearId: f.year.id,
        timetableVersionId: f.timetable.id,
        timetableEntryId: f.entry.id,
        sourceCivilDate: new Date('2026-08-10Z'),
        academicCalendarVersionId: f.calendar.id,
        timeSlotDefinitionId: f.sourceSlot.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        teachingAssignmentId: f.assignment.id,
        responsibleTeacherUserId: f.manager.id,
        dispositionType: 'SAME_SUBJECT_SUBSTITUTION',
        assignedTeacherUserId: f.substitute.id,
        eligibilityCheckedAt: new Date('2026-08-10T00:00:00Z'),
        eligibilityWasActive: true,
        eligibilityWasTeachingStaff: true,
        eligibilitySameSubject: true,
        eligibilityStaffSubjectId: staffSubject.id,
        createRequestKey: randomUUID(),
        createRequestFingerprint: randomUUID(),
        createdByUserId: f.manager.id,
      },
    });

    const sourceText = csv(f, 'DAY_THAY');
    const inspected = await preview(f, sourceText);
    expect(inspected.status).toBe(200);
    expect(inspected.body.canConfirm).toBe(true);
    const committed = await confirm(f, sourceText, inspected.body);
    expect(committed.status).toBe(200);

    const executionId = committed.body.rows[0].executionId;
    const provenance = await h.prisma.historicalTeachingImportRow.findUniqueOrThrow({
      where: { curricularTeachingExecutionId: executionId },
    });
    expect(provenance.operationalLessonDispositionId).toBe(disposition.id);
    expect(provenance.ownsOperationalLessonDisposition).toBe(false);

    const execution = await h.prisma.curricularTeachingExecution.findUniqueOrThrow({ where: { id: executionId } });
    const reversed = await f.manager.agent
      .post(`/api/historical-teaching/executions/${executionId}/reverse`)
      .set('Origin', testOrigin)
      .send({
        requestKey: randomUUID(),
        expectedUpdatedAt: execution.updatedAt.toISOString(),
        reversalReason: 'Sửa minh chứng P3, giữ nguyên disposition có sẵn',
      });
    expect(reversed.status).toBe(200);
    expect((await h.prisma.operationalLessonDisposition.findUniqueOrThrow({ where: { id: disposition.id } })).status).toBe('ACTIVE');
  });

  it('does not reverse an existing make-up schedule reused as historical provenance', async () => {
    const f = await fixture();
    const association = await h.prisma.ppctClassAssociation.findFirstOrThrow({
      where: {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
      },
    });
    const staffSubject = await h.prisma.staffSubject.findFirstOrThrow({
      where: { userId: f.substitute.id, subjectId: f.subject.id },
    });
    const schedule = await h.prisma.makeupTeachingSchedule.create({
      data: {
        academicYearId: f.year.id,
        originalTimetableVersionId: f.timetable.id,
        originalTimetableEntryId: f.entry.id,
        originalCivilDate: new Date('2026-08-10Z'),
        originalAcademicCalendarVersionId: f.calendar.id,
        originalTimeSlotDefinitionId: f.sourceSlot.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
        originalTeachingAssignmentId: f.assignment.id,
        responsibleTeacherUserId: f.manager.id,
        ppctClassAssociationId: association.id,
        ppctPlanId: f.revision.ppctPlanId,
        ppctVersionId: f.revision.ppctVersionId,
        ppctItemId: f.revision.ppctItemId,
        targetCivilDate: new Date('2026-08-11Z'),
        targetAcademicCalendarVersionId: f.calendar.id,
        targetTimeSlotDefinitionId: f.makeupSlot.id,
        scheduledTeacherUserId: f.substitute.id,
        eligibilityCheckedAt: new Date('2026-08-11T00:00:00Z'),
        eligibilityWasActive: true,
        eligibilityWasTeachingStaff: true,
        eligibilitySameSubject: true,
        eligibilityStaffSubjectId: staffSubject.id,
        createRequestKey: randomUUID(),
        createRequestFingerprint: randomUUID(),
        createdByUserId: f.manager.id,
      },
    });

    const sourceText = csv(f, 'DAY_BU');
    const inspected = await preview(f, sourceText);
    expect(inspected.status).toBe(200);
    expect(inspected.body.canConfirm).toBe(true);
    const committed = await confirm(f, sourceText, inspected.body);
    expect(committed.status).toBe(200);

    const executionId = committed.body.rows[0].executionId;
    const provenance = await h.prisma.historicalTeachingImportRow.findUniqueOrThrow({
      where: { curricularTeachingExecutionId: executionId },
    });
    expect(provenance.makeupTeachingScheduleId).toBe(schedule.id);
    expect(provenance.ownsMakeupTeachingSchedule).toBe(false);

    const execution = await h.prisma.curricularTeachingExecution.findUniqueOrThrow({ where: { id: executionId } });
    const reversed = await f.manager.agent
      .post(`/api/historical-teaching/executions/${executionId}/reverse`)
      .set('Origin', testOrigin)
      .send({
        requestKey: randomUUID(),
        expectedUpdatedAt: execution.updatedAt.toISOString(),
        reversalReason: 'Sửa minh chứng P3, giữ nguyên lịch dạy bù có sẵn',
      });
    expect(reversed.status).toBe(200);
    expect((await h.prisma.makeupTeachingSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).status).toBe('ACTIVE');
  });

  it('blocks DAY_THAY when the substitute already has another canonical lesson at the same time', async () => {
    const f = await fixture();
    const otherClass = await h.prisma.schoolClass.create({
      data: {
        academicYearId: f.year.id,
        code: normalizedCode('10A2H'),
        name: '10A2',
        gradeLevel: 10,
      },
    });
    const otherAssignment = await h.prisma.teachingAssignment.create({
      data: {
        academicYearId: f.year.id,
        schoolClassId: otherClass.id,
        subjectId: f.subject.id,
        teacherUserId: f.substitute.id,
        validFrom: new Date('2026-08-01Z'),
      },
    });
    await h.prisma.timetableEntry.create({
      data: {
        timetableVersionId: f.timetable.id,
        academicYearId: f.year.id,
        weekday: 'MONDAY',
        timeSlotDefinitionId: f.sourceSlot.id,
        schoolClassId: otherClass.id,
        subjectId: f.subject.id,
        teachingAssignmentId: otherAssignment.id,
        teacherUserId: f.substitute.id,
      },
    });
    const association = await h.prisma.ppctClassAssociation.findFirstOrThrow({
      where: {
        academicYearId: f.year.id,
        schoolClassId: f.schoolClass.id,
        subjectId: f.subject.id,
      },
    });
    await h.prisma.ppctClassAssociation.create({
      data: {
        academicYearId: f.year.id,
        schoolClassId: otherClass.id,
        subjectId: f.subject.id,
        gradeLevel: 10,
        ppctPlanId: association.ppctPlanId,
        ppctVersionId: association.ppctVersionId,
        curricularProfile: 'CORE_ONLY',
        effectiveFrom: new Date('2026-08-01Z'),
        createdByUserId: f.manager.id,
      },
    });

    const inspected = await preview(f, csv(f, 'DAY_THAY'));
    expect(inspected.status).toBe(200);
    expect(inspected.body.canConfirm).toBe(false);
    expect(inspected.body.rows[0].issues.map((issue: { code: string }) => issue.code))
      .toContain('HISTORY_SUBSTITUTION_TEACHER_COLLISION');
  });

  it('requires exact SCHOOL_WIDE execution-management authority', async () => {
    const f = await fixture();
    const response = await f.outsider.agent.get('/api/historical-teaching/options');
    expect(response.status).toBe(403);
  });
});
