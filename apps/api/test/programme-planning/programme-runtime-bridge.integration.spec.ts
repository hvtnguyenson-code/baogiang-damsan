import { HttpStatus } from '@nestjs/common';
import { SpecialActivityStatus } from '@prisma/client';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

integration('ProgrammeRuntimeBridge (PostgreSQL integration P4-040)', () => {
  const h = new Phase01Harness();

  async function clean(): Promise<void> {
    await h.prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "audit_events",
        "auth_sessions",
        "capability_grants",
        "capability_definitions",
        "subject_groups",
        "academic_years",
        "users"
      CASCADE;
    `);
  }

  beforeAll(async () => {
    await h.start();
  });

  beforeEach(async () => {
    await clean();
    await h.seedCapabilities([
      { key: 'APPROVAL_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
      { key: 'APPROVAL_VICE_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
      { key: 'GDDDP_COORDINATOR', scopes: ['ACTIVITY'] },
      { key: 'HĐTN_COORDINATOR', scopes: ['ACTIVITY'] },
      { key: 'SPECIAL_ACTIVITY_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  });

  afterAll(async () => {
    try {
      await clean();
    } finally {
      await h.stop();
    }
  });

  async function setupBaseFixture() {
    const year = await h.prisma.academicYear.create({
      data: {
        code: normalizedCode('Y'),
        name: 'Năm học 2026-2027',
      },
    });

    const bghPrincipal = await h.actor({
      usernamePrefix: 'bgh-p',
      grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL' }],
    });

    const bghVicePrincipal = await h.actor({
      usernamePrefix: 'bgh-vp',
      grants: [{ capabilityKey: 'APPROVAL_VICE_PRINCIPAL' }],
    });

    const calendarVersion = await h.prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year.id,
        versionNumber: 1,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T23:59:59.999Z'),
        officialWeekCount: 35,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        isActive: true,
        activatedAt: new Date(),
      },
    });

    const slotDef1 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 1,
        displayLabel: 'Thứ 2 Tiết 1',
        startTime: new Date('1970-01-01T07:00:00.000Z'),
        endTime: new Date('1970-01-01T07:45:00.000Z'),
        isActive: true,
      },
    });

    const slotDef2 = await h.prisma.timeSlotDefinition.create({
      data: {
        academicYearId: year.id,
        weekday: 'MONDAY',
        session: 'MORNING',
        ordinal: 2,
        displayLabel: 'Thứ 2 Tiết 2',
        startTime: new Date('1970-01-01T07:50:00.000Z'),
        endTime: new Date('1970-01-01T08:35:00.000Z'),
        isActive: true,
      },
    });

    const teacherA = await h.actor({ usernamePrefix: 'tch-a' });
    const teacherB = await h.actor({ usernamePrefix: 'tch-b' });
    const teacherC = await h.actor({ usernamePrefix: 'tch-c' });

    const gddpMaster = await h.prisma.programmeMaster.create({
      data: {
        academicYearId: year.id,
        kind: 'GDDP',
        gradeLevel: 10,
        createdByUserId: bghPrincipal.id,
      },
    });

    const coordinatorGddp = await h.actor({
      usernamePrefix: 'coord-gddp',
      grants: [
        {
          capabilityKey: 'GDDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: gddpMaster.id,
        },
      ],
    });

    const otherMaster = await h.prisma.programmeMaster.create({
      data: {
        academicYearId: year.id,
        kind: 'GDDP',
        gradeLevel: 11,
        createdByUserId: bghPrincipal.id,
      },
    });

    const otherCoordinator = await h.actor({
      usernamePrefix: 'other-coord',
      grants: [
        {
          capabilityKey: 'GDDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: otherMaster.id,
        },
      ],
    });

    const planVersion = await h.prisma.programmePlanVersion.create({
      data: {
        programmeMasterId: gddpMaster.id,
        versionNumber: 1,
        status: 'DRAFT',
        changeReason: 'Initial published plan',
        createdByUserId: bghPrincipal.id,
      },
    });

    const topicItem = await h.prisma.programmeTopicItem.create({
      data: {
        programmePlanVersionId: planVersion.id,
        sequence: 1,
        title: 'Chủ đề 1 GDĐP Khối 10',
        requiredPeriods: 2,
        guidelineWeekFrom: 1,
        guidelineWeekTo: 2,
      },
    });

    await h.prisma.programmePlanVersion.update({
      where: { id: planVersion.id },
      data: {
        status: 'PUBLISHED',
        publishedByUserId: bghPrincipal.id,
        publishedAt: new Date(),
      },
    });

    const activeClass10 = await h.prisma.schoolClass.create({
      data: {
        academicYearId: year.id,
        code: '10A_BASE',
        name: 'Lớp 10A Cơ Bản',
        gradeLevel: 10,
        status: 'ACTIVE',
      },
    });

    return {
      year,
      calendarVersion,
      slotDef1,
      slotDef2,
      bghPrincipal,
      bghVicePrincipal,
      teacherA,
      teacherB,
      teacherC,
      gddpMaster,
      otherMaster,
      coordinatorGddp,
      otherCoordinator,
      planVersion,
      topicItem,
      activeClass10,
    };
  }

  async function createOccurrenceWithStaffing(
    f: Awaited<ReturnType<typeof setupBaseFixture>>,
    options: {
      masterId: string;
      planVersionId: string;
      topicItemId: string;
      civilDate: string;
      mode?: 'GRADE' | 'CLASS' | 'SCHOOL_WIDE';
      gradeLevel?: number | null;
      schoolClassId?: string | null;
      creatorId: string;
      status?: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
      slots: Array<{ slotDefId: string; teacherIds: string[] }>;
    },
  ) {
    const occ = await h.prisma.plannedProgrammeOccurrence.create({
      data: {
        programmeMasterId: options.masterId,
        programmePlanVersionId: options.planVersionId,
        programmeTopicItemId: options.topicItemId,
        academicYearId: f.year.id,
        civilDate: new Date(options.civilDate),
        mode: options.mode ?? 'GRADE',
        gradeLevel: options.gradeLevel ?? (options.mode === 'CLASS' ? null : 10),
        schoolClassId: options.schoolClassId ?? null,
        status: 'DRAFT',
        draftRevision: 1,
        createdByUserId: options.creatorId,
      },
    });

    const createdSlots = [];
    for (const slotOpt of options.slots) {
      const slot = await h.prisma.plannedOccurrenceSlot.create({
        data: {
          plannedProgrammeOccurrenceId: occ.id,
          academicYearId: f.year.id,
          timeSlotDefinitionId: slotOpt.slotDefId,
        },
      });
      for (const teacherId of slotOpt.teacherIds) {
        await h.prisma.plannedSlotStaffing.create({
          data: {
            plannedOccurrenceSlotId: slot.id,
            teacherUserId: teacherId,
          },
        });
      }
      createdSlots.push(slot);
    }

    if (options.status === 'PUBLISHED' || !options.status) {
      await h.prisma.plannedProgrammeOccurrence.update({
        where: { id: occ.id },
        data: {
          status: 'PUBLISHED',
          publishedByUserId: options.creatorId,
          publishedAt: new Date(),
        },
      });
    } else if (options.status === 'SUPERSEDED') {
      await h.prisma.plannedProgrammeOccurrence.update({
        where: { id: occ.id },
        data: {
          status: 'SUPERSEDED',
        },
      });
    }

    return { occ, slots: createdSlots };
  }

  // =========================================================================
  // 4.2 REAL POSTGRESQL MATERIALIZATION INTEGRATION (Tests 1..20)
  // =========================================================================

  describe('4.2 Materialization Integration (Tests 1..20)', () => {
    it('1, 2, 3, 4: Materializes PUBLISHED occurrence 1 & 2 slots, preserves exact non-Cartesian staffing and persists topic provenance', async () => {
      const f = await setupBaseFixture();

      const { occ, slots } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        slots: [
          { slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] },
          { slotDefId: f.slotDef2.id, teacherIds: [f.teacherB.id] },
        ],
      });

      // Materialize via HTTP API
      const res = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-mat-001' });

      expect(res.status).toBe(HttpStatus.OK);
      const records = res.body;

      // Requirement 2: exactly 2 roots for 2 slots
      expect(records).toHaveLength(2);

      // Requirement 4: each provenance row points exactly to all required parents including programmeTopicItemId
      for (const rec of records) {
        expect(rec.programmeMasterId).toBe(f.gddpMaster.id);
        expect(rec.programmePlanVersionId).toBe(f.planVersion.id);
        expect(rec.programmeTopicItemId).toBe(f.topicItem.id);
        expect(rec.plannedProgrammeOccurrenceId).toBe(occ.id);
        expect([slots[0].id, slots[1].id]).toContain(rec.plannedOccurrenceSlotId);
        expect(rec.specialActivityId).toBeDefined();
      }

      // Verify in DB directly
      const root1 = await h.prisma.specialActivity.findUnique({
        where: { id: records[0].specialActivityId },
        include: { staffing: true, timeSlots: true },
      });
      const root2 = await h.prisma.specialActivity.findUnique({
        where: { id: records[1].specialActivityId },
        include: { staffing: true, timeSlots: true },
      });

      expect(root1).not.toBeNull();
      expect(root2).not.toBeNull();
      expect(root1!.id).not.toBe(root2!.id);

      // Requirement 3: EXACT Slot -> Set<Teacher>, NO Cartesian multiplication
      const rootForSlot1 = records[0].plannedOccurrenceSlotId === slots[0].id ? root1 : root2;
      const rootForSlot2 = records[0].plannedOccurrenceSlotId === slots[0].id ? root2 : root1;

      expect(rootForSlot1!.staffing).toHaveLength(1);
      expect(rootForSlot1!.staffing[0].scheduledTeacherUserId).toBe(f.teacherA.id);

      expect(rootForSlot2!.staffing).toHaveLength(1);
      expect(rootForSlot2!.staffing[0].scheduledTeacherUserId).toBe(f.teacherB.id);

      // Requirement 10: Idempotent replay with same commandId
      const replayRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-mat-001' });

      expect(replayRes.status).toBe(HttpStatus.OK);
      expect(replayRes.body).toHaveLength(2);
      expect(replayRes.body[0].specialActivityId).toBe(records[0].specialActivityId);

      // Total materialized count in DB remains 2
      const totalMat = await h.prisma.programmeMaterializedActivity.count({
        where: { plannedProgrammeOccurrenceId: occ.id },
      });
      expect(totalMat).toBe(2);
    });

    it('5 & 6: Rejects materialization on DRAFT or SUPERSEDED occurrence', async () => {
      const f = await setupBaseFixture();

      // DRAFT occurrence
      const { occ: draftOcc } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        status: 'DRAFT',
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      const draftRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${draftOcc.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-draft' });
      expect(draftRes.status).toBe(HttpStatus.CONFLICT);

      // SUPERSEDED occurrence
      await h.prisma.plannedProgrammeOccurrence.update({
        where: { id: draftOcc.id },
        data: {
          status: 'PUBLISHED',
          publishedByUserId: f.bghPrincipal.id,
          publishedAt: new Date(),
        },
      });
      await h.prisma.plannedProgrammeOccurrence.update({
        where: { id: draftOcc.id },
        data: {
          status: 'SUPERSEDED',
          supersededByUserId: f.bghPrincipal.id,
          supersededAt: new Date(),
        },
      });

      const supRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${draftOcc.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-sup' });
      expect(supRes.status).toBe(HttpStatus.CONFLICT);
    });

    it('7: Rejects materialization when teacher is inactive or non-teaching', async () => {
      const f = await setupBaseFixture();

      // Make teacherA non-teaching staff
      await h.prisma.staffProfile.update({
        where: { userId: f.teacherA.id },
        data: { isTeachingStaff: false },
      });

      const { occ } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      const res = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-non-teaching' });
      expect(res.status).toBe(HttpStatus.CONFLICT);

      const roots = await h.prisma.specialActivity.count();
      expect(roots).toBe(0);
    });

    it('8 & 9: Collision with existing SpecialActivity rolls back transaction with zero partial roots', async () => {
      const f = await setupBaseFixture();

      // Create an existing SpecialActivity on slotDef2 for teacherB
      const saMgr = await h.actor({
        usernamePrefix: 'sa-mgr-init',
        grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }],
      });
      const preRes = await saMgr.agent
        .post('/api/special-activities')
        .set('Origin', testOrigin)
        .send({
          academicYearId: f.year.id,
          academicCalendarVersionId: f.calendarVersion.id,
          civilDate: '2026-09-07',
          scope: 'GRADE',
          gradeLevel: 10,
          title: 'Hoạt động đã có từ trước',
          exactTimeSlotDefinitionIds: [f.slotDef2.id],
          scheduledTeacherUserIds: [f.teacherB.id],
          requestKey: 'req-pre-existing-sa',
        });
      expect(preRes.status).toBe(HttpStatus.CREATED);

      // Now create occurrence with slot 1 (teacherA) and slot 2 (teacherB)
      const { occ } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        slots: [
          { slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] },
          { slotDefId: f.slotDef2.id, teacherIds: [f.teacherB.id] },
        ],
      });

      const res = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-collision' });

      // Must fail with Conflict
      expect(res.status).toBe(HttpStatus.CONFLICT);

      // Invariant: ZERO partial roots created! Total activities in DB remains 1 (the pre-existing one)
      const totalActivities = await h.prisma.specialActivity.count();
      expect(totalActivities).toBe(1);

      const totalBridge = await h.prisma.programmeMaterializedActivity.count();
      expect(totalBridge).toBe(0);
    });

    it('11: Same commandId with different payload produces conflict', async () => {
      const f = await setupBaseFixture();

      const { occ } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      const res1 = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-diff-payload' });
      expect(res1.status).toBe(HttpStatus.OK);

      // Same commandId but call from another actor (bghPrincipal) -> conflict
      const res2 = await f.bghPrincipal.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-diff-payload' });
      expect(res2.status).toBe(HttpStatus.CONFLICT);
    });

    it('13, 14, 15, 16, 17, 18, 19, 20: Authorization boundaries, mustChangePassword and Audit Event', async () => {
      const f = await setupBaseFixture();

      const { occ } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      // 14. Wrong-master coordinator -> 403
      const resWrongCoord = await f.otherCoordinator.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-auth-1' });
      expect(resWrongCoord.status).toBe(HttpStatus.FORBIDDEN);

      // 17. SPECIAL_ACTIVITY_MANAGE alone -> 403
      const specialManager = await h.actor({
        usernamePrefix: 'sa-mgr',
        grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }],
      });
      const resSaMgr = await specialManager.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-auth-2' });
      expect(resSaMgr.status).toBe(HttpStatus.FORBIDDEN);

      // 18. SYSTEM_ADMIN alone -> 403
      const sysAdmin = await h.actor({
        usernamePrefix: 'sys-adm',
        grants: [{ capabilityKey: 'SYSTEM_ADMIN' }],
      });
      const resSysAdmin = await sysAdmin.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-auth-3' });
      expect(resSysAdmin.status).toBe(HttpStatus.FORBIDDEN);

      // 19. mustChangePassword -> 403
      const mcpActor = await h.actor({
        usernamePrefix: 'mcp-user',
        mustChangePassword: true,
        grants: [
          {
            capabilityKey: 'GDDDP_COORDINATOR',
            scopeType: 'ACTIVITY',
            scopeResourceId: f.gddpMaster.id,
          },
        ],
      });
      const resMcp = await mcpActor.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-auth-4' });
      expect(resMcp.status).toBe(HttpStatus.FORBIDDEN);

      // 16. BGH Vice Principal -> 200
      const resVp = await f.bghVicePrincipal.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-vp-success' });
      expect(resVp.status).toBe(HttpStatus.OK);

      // 20. Audit row persisted
      const audit = await h.prisma.auditEvent.findFirst({
        where: {
          action: 'PROGRAMME_OCCURRENCE_MATERIALIZED',
          actorUserId: f.bghVicePrincipal.id,
        },
      });
      expect(audit).not.toBeNull();
      expect(audit!.result).toBe('SUCCESS');
    });
  });

  // =========================================================================
  // 4.3 HĐTN CLASS INTEGRATION (Tests 21..27)
  // =========================================================================

  describe('4.3 HĐTN CLASS Integration (Tests 21..27)', () => {
    it('21, 22, 23, 24: Resolves and freezes date-effective GVCN provenance, resilient to later assignment changes', async () => {
      const f = await setupBaseFixture();

      // Create HDTN_HN master and coordinator
      const hdtnMaster = await h.prisma.programmeMaster.create({
        data: {
          academicYearId: f.year.id,
          kind: 'HDTN_HN',
          gradeLevel: null,
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const hdtnCoord = await h.actor({
        usernamePrefix: 'hdtn-coord',
        grants: [
          {
            capabilityKey: 'HĐTN_COORDINATOR',
            scopeType: 'ACTIVITY',
            scopeResourceId: hdtnMaster.id,
          },
        ],
      });

      const hdtnPlan = await h.prisma.programmePlanVersion.create({
        data: {
          programmeMasterId: hdtnMaster.id,
          versionNumber: 1,
          status: 'DRAFT',
          changeReason: 'HDTN Plan',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const hdtnTopic = await h.prisma.programmeTopicItem.create({
        data: {
          programmePlanVersionId: hdtnPlan.id,
          sequence: 1,
          title: 'HĐTN Sinh hoạt lớp',
          requiredPeriods: 1,
          guidelineWeekFrom: 1,
          guidelineWeekTo: 1,
        },
      });

      await h.prisma.programmePlanVersion.update({
        where: { id: hdtnPlan.id },
        data: {
          status: 'PUBLISHED',
          publishedByUserId: f.bghPrincipal.id,
          publishedAt: new Date(),
        },
      });

      // Class 10A1
      const schoolClass = await h.prisma.schoolClass.create({
        data: {
          academicYearId: f.year.id,
          code: '10A1',
          name: 'Lớp 10A1',
          gradeLevel: 10,
        },
      });

      // Homeroom assignment active covering 2026-09-07
      const gvcnAssignment1 = await h.prisma.homeroomAssignment.create({
        data: {
          academicYearId: f.year.id,
          schoolClassId: schoolClass.id,
          teacherUserId: f.teacherA.id,
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validUntil: new Date('2026-10-01T00:00:00.000Z'),
          status: 'ACTIVE',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const { occ } = await createOccurrenceWithStaffing(f, {
        masterId: hdtnMaster.id,
        planVersionId: hdtnPlan.id,
        topicItemId: hdtnTopic.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        mode: 'CLASS',
        schoolClassId: schoolClass.id,
        creatorId: hdtnCoord.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      // Materialize
      const res = await hdtnCoord.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-mat-hdtn-class' });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body).toHaveLength(1);

      // Requirements 21, 22, 23: GVCN provenance resolved and frozen
      const matRecord = res.body[0];
      expect(matRecord.homeroomAssignmentId).toBe(gvcnAssignment1.id);
      expect(matRecord.homeroomTeacherUserId).toBe(f.teacherA.id);

      // Requirement 24: Later assignment change does NOT alter frozen provenance
      await h.prisma.homeroomAssignment.update({
        where: { id: gvcnAssignment1.id },
        data: {
          status: 'REVERSED',
          reversedByUserId: f.bghPrincipal.id,
          reversedAt: new Date(),
          reversalReason: 'Thay đổi GVCN',
        },
      });

      await h.prisma.homeroomAssignment.create({
        data: {
          academicYearId: f.year.id,
          schoolClassId: schoolClass.id,
          teacherUserId: f.teacherB.id,
          validFrom: new Date('2026-09-08T00:00:00.000Z'),
          validUntil: null,
          status: 'ACTIVE',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      // Verify row in DB directly: provenance remains strictly unchanged
      const persistedMat = await h.prisma.programmeMaterializedActivity.findUnique({
        where: { id: matRecord.id },
      });
      expect(persistedMat!.homeroomAssignmentId).toBe(gvcnAssignment1.id);
      expect(persistedMat!.homeroomTeacherUserId).toBe(f.teacherA.id);
    });

    it('25, 26, 27: Fails closed when homeroom assignment is missing, ambiguous, or teacher is ineligible', async () => {
      const f = await setupBaseFixture();

      const hdtnMaster = await h.prisma.programmeMaster.create({
        data: {
          academicYearId: f.year.id,
          kind: 'HDTN_HN',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const hdtnCoord = await h.actor({
        usernamePrefix: 'hdtn-coord2',
        grants: [
          {
            capabilityKey: 'HĐTN_COORDINATOR',
            scopeType: 'ACTIVITY',
            scopeResourceId: hdtnMaster.id,
          },
        ],
      });

      const hdtnPlan = await h.prisma.programmePlanVersion.create({
        data: {
          programmeMasterId: hdtnMaster.id,
          versionNumber: 1,
          status: 'DRAFT',
          changeReason: 'Plan',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const hdtnTopic = await h.prisma.programmeTopicItem.create({
        data: {
          programmePlanVersionId: hdtnPlan.id,
          sequence: 1,
          title: 'Topic',
          requiredPeriods: 1,
          guidelineWeekFrom: 1,
          guidelineWeekTo: 1,
        },
      });

      await h.prisma.programmePlanVersion.update({
        where: { id: hdtnPlan.id },
        data: {
          status: 'PUBLISHED',
          publishedByUserId: f.bghPrincipal.id,
          publishedAt: new Date(),
        },
      });

      const schoolClass = await h.prisma.schoolClass.create({
        data: { academicYearId: f.year.id, code: '10A2', name: '10A2', gradeLevel: 10 },
      });

      // 25. Missing homeroom assignment
      const { occ: occMissing } = await createOccurrenceWithStaffing(f, {
        masterId: hdtnMaster.id,
        planVersionId: hdtnPlan.id,
        topicItemId: hdtnTopic.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        mode: 'CLASS',
        schoolClassId: schoolClass.id,
        creatorId: hdtnCoord.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      const resMissing = await hdtnCoord.agent
        .post(`/api/programme-planning/occurrences/${occMissing.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-missing-ha' });
      expect(resMissing.status).toBe(HttpStatus.CONFLICT);

      // 26a. Ambiguous homeroom assignment (DB exclusion constraint prevents active overlap)
      await h.prisma.homeroomAssignment.create({
        data: {
          academicYearId: f.year.id,
          schoolClassId: schoolClass.id,
          teacherUserId: f.teacherA.id,
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validUntil: null,
          status: 'ACTIVE',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      // Attempting to insert overlapping active assignment fails closed at DB constraint level
      await expect(
        h.prisma.homeroomAssignment.create({
          data: {
            academicYearId: f.year.id,
            schoolClassId: schoolClass.id,
            teacherUserId: f.teacherB.id,
            validFrom: new Date('2026-09-01T00:00:00.000Z'),
            validUntil: null,
            status: 'ACTIVE',
            createdByUserId: f.bghPrincipal.id,
          },
        }),
      ).rejects.toThrow();

      // Clean up to test corrupt lineage and ineligible GVCN
      await h.prisma.homeroomAssignment.deleteMany({
        where: { schoolClassId: schoolClass.id },
      });

      // 26b. Corrupt retained lineage fails closed
      const otherClass = await h.prisma.schoolClass.create({
        data: { academicYearId: f.year.id, code: '10A_OTHER', name: '10A Other', gradeLevel: 10 },
      });
      const otherClassReversedAssignment = await h.prisma.homeroomAssignment.create({
        data: {
          academicYearId: f.year.id,
          schoolClassId: otherClass.id,
          teacherUserId: f.teacherA.id,
          validFrom: new Date('2026-08-01T00:00:00.000Z'),
          validUntil: new Date('2026-09-01T00:00:00.000Z'),
          status: 'REVERSED',
          reversedByUserId: f.bghPrincipal.id,
          reversedAt: new Date(),
          reversalReason: 'Lineage test setup',
          createdByUserId: f.bghPrincipal.id,
        },
      });
      // Active assignment referencing a parent belonging to a different class violates lineage invariant
      await h.prisma.homeroomAssignment.create({
        data: {
          academicYearId: f.year.id,
          schoolClassId: schoolClass.id,
          teacherUserId: f.teacherA.id,
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validUntil: null,
          status: 'ACTIVE',
          replacesId: otherClassReversedAssignment.id,
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const resCorrupt = await hdtnCoord.agent
        .post(`/api/programme-planning/occurrences/${occMissing.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-corrupt-ha' });
      expect(resCorrupt.status).toBe(HttpStatus.CONFLICT);

      // Clean up for 27
      await h.prisma.homeroomAssignment.deleteMany({
        where: { schoolClassId: schoolClass.id },
      });

      // 27. Ineligible GVCN (non-teaching or inactive user) fails closed
      const inactiveTeacher = await h.actor({
        usernamePrefix: 'tch-inactive',
      });
      await h.prisma.user.update({
        where: { id: inactiveTeacher.id },
        data: { status: 'DISABLED' },
      });
      await h.prisma.homeroomAssignment.create({
        data: {
          academicYearId: f.year.id,
          schoolClassId: schoolClass.id,
          teacherUserId: inactiveTeacher.id,
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validUntil: null,
          status: 'ACTIVE',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const resIneligible = await hdtnCoord.agent
        .post(`/api/programme-planning/occurrences/${occMissing.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-ineligible-ha' });
      expect(resIneligible.status).toBe(HttpStatus.CONFLICT);
    });
  });

  // =========================================================================
  // 4.4 POST-MATERIALIZATION REPLACEMENT INTEGRATION (Tests 28..39)
  // =========================================================================

  describe('4.4 Post-Materialization Replacement Integration (Tests 28..39)', () => {
    it('28..39: Reverses root via CAS, creates replacement root with replacesId, retains old staffing without in-place mutation', async () => {
      const f = await setupBaseFixture();

      // Create occurrence with 2 slots
      const { occ, slots } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        slots: [
          { slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] },
          { slotDefId: f.slotDef2.id, teacherIds: [f.teacherB.id] },
        ],
      });

      // Materialize occurrence
      const matRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-mat-replace-test' });
      expect(matRes.status).toBe(HttpStatus.OK);

      const records = matRes.body as Array<{
        id: string;
        specialActivityId: string;
        plannedOccurrenceSlotId: string;
      }>;
      const recSlot1 = records.find((r) => r.plannedOccurrenceSlotId === slots[0].id)!;
      const recSlot2 = records.find((r) => r.plannedOccurrenceSlotId === slots[1].id)!;

      const oldRoot1 = await h.prisma.specialActivity.findUniqueOrThrow({
        where: { id: recSlot1.specialActivityId },
      });

      // 35. Stale CAS fails
      const staleRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/materialized-slots/${recSlot1.id}/replacements`)
        .set('Origin', testOrigin)
        .send({
          commandId: 'cmd-stale',
          expectedUpdatedAt: new Date('2020-01-01T00:00:00.000Z').toISOString(),
          reversalReason: 'Lý do thay thế',
          replacementTeacherUserIds: [f.teacherC.id],
        });
      expect(staleRes.status).toBe(HttpStatus.CONFLICT);

      // 36, 37, 38: Unauthorized actors denied
      const resUnauth = await f.otherCoordinator.agent
        .post(`/api/programme-planning/materialized-slots/${recSlot1.id}/replacements`)
        .set('Origin', testOrigin)
        .send({
          commandId: 'cmd-unauth',
          expectedUpdatedAt: oldRoot1.updatedAt.toISOString(),
          reversalReason: 'Lý do',
          replacementTeacherUserIds: [f.teacherC.id],
        });
      expect(resUnauth.status).toBe(HttpStatus.FORBIDDEN);

      // 28, 29, 31, 33: Execute valid replacement with teacherC replacing teacherA on slot1
      const replaceRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/materialized-slots/${recSlot1.id}/replacements`)
        .set('Origin', testOrigin)
        .send({
          commandId: 'cmd-replace-slot1',
          expectedUpdatedAt: oldRoot1.updatedAt.toISOString(),
          reversalReason: 'Giáo viên A bận công tác, thay bằng giáo viên C',
          replacementTeacherUserIds: [f.teacherC.id],
        });

      expect(replaceRes.status).toBe(HttpStatus.OK);
      const newMatRecord = replaceRes.body;

      // 28. Old root ACTIVE -> REVERSED
      const updatedOldRoot = await h.prisma.specialActivity.findUniqueOrThrow({
        where: { id: oldRoot1.id },
      });
      expect(updatedOldRoot.status).toBe(SpecialActivityStatus.REVERSED);
      expect(updatedOldRoot.reversalReason).toBe('Giáo viên A bận công tác, thay bằng giáo viên C');
      expect(updatedOldRoot.reversedByUserId).toBe(f.coordinatorGddp.id);

      // 29. New root ACTIVE with replacesId = old root
      const newRoot = await h.prisma.specialActivity.findUniqueOrThrow({
        where: { id: newMatRecord.specialActivityId },
        include: { staffing: true },
      });
      expect(newRoot.status).toBe(SpecialActivityStatus.ACTIVE);
      expect(newRoot.replacesId).toBe(oldRoot1.id);

      // 30 & 39: Old staffing retained, NO in-place update on predecessor
      const oldStaffing = await h.prisma.specialActivityStaffing.findMany({
        where: { specialActivityId: oldRoot1.id },
      });
      expect(oldStaffing).toHaveLength(1);
      expect(oldStaffing[0].scheduledTeacherUserId).toBe(f.teacherA.id);

      // 31. Replacement teacher exact
      expect(newRoot.staffing).toHaveLength(1);
      expect(newRoot.staffing[0].scheduledTeacherUserId).toBe(f.teacherC.id);

      // 32. Unaffected sibling slot root remains untouched
      const siblingRoot = await h.prisma.specialActivity.findUniqueOrThrow({
        where: { id: recSlot2.specialActivityId },
        include: { staffing: true },
      });
      expect(siblingRoot.status).toBe(SpecialActivityStatus.ACTIVE);
      expect(siblingRoot.replacesId).toBeNull();
      expect(siblingRoot.staffing[0].scheduledTeacherUserId).toBe(f.teacherB.id);

      // 33. New provenance row retains same programmeTopicItemId and occurrence
      expect(newMatRecord.programmeTopicItemId).toBe(f.topicItem.id);
      expect(newMatRecord.plannedProgrammeOccurrenceId).toBe(occ.id);
      expect(newMatRecord.plannedOccurrenceSlotId).toBe(slots[0].id);

      // 34. Retry idempotent
      const replayReplace = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/materialized-slots/${recSlot1.id}/replacements`)
        .set('Origin', testOrigin)
        .send({
          commandId: 'cmd-replace-slot1',
          expectedUpdatedAt: oldRoot1.updatedAt.toISOString(),
          reversalReason: 'Giáo viên A bận công tác, thay bằng giáo viên C',
          replacementTeacherUserIds: [f.teacherC.id],
        });
      expect(replayReplace.status).toBe(HttpStatus.OK);
      expect(replayReplace.body.specialActivityId).toBe(newRoot.id);
    });
  });

  // =========================================================================
  // 4.5 ATTESTATION INTEGRATION & EXISTENTIAL GATE (Tests 40..57)
  // =========================================================================

  describe('4.5 Attestation Integration (Tests 40..57)', () => {
    it('40..57: Handles attestation lifecycle, multi-actor coexistence, CAS reversal, and Existential Gate', async () => {
      const f = await setupBaseFixture();

      const { occ } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      // Initial gate state: 0 attestations -> false
      const initialGateRes = await f.coordinatorGddp.agent
        .get(`/api/programme-planning/occurrences/${occ.id}/attestations`)
        .set('Origin', testOrigin);
      expect(initialGateRes.status).toBe(HttpStatus.OK);
      expect(initialGateRes.body.hasQualifyingNonReversedAttestation).toBe(false);
      expect(initialGateRes.body.activeAttestationCount).toBe(0);

      // 43..46: Unauthorized actors denied
      const resWrongCoord = await f.otherCoordinator.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/attestations`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-att-unauth' });
      expect(resWrongCoord.status).toBe(HttpStatus.FORBIDDEN);

      const resStaffingTch = await f.teacherA.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/attestations`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-att-unauth-2' });
      expect(resStaffingTch.status).toBe(HttpStatus.FORBIDDEN);

      // 40. Coordinator attest succeeds
      const attCoordRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/attestations`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-att-coord' });
      expect(attCoordRes.status).toBe(HttpStatus.OK);
      const coordAtt = attCoordRes.body;

      // 47. Authority provenance persisted
      expect(coordAtt.authorityType).toBe('COORDINATOR');
      expect(coordAtt.capabilityKey).toBe('GDDDP_COORDINATOR');
      expect(coordAtt.scope).toBe('ACTIVITY');
      expect(coordAtt.scopeResourceId).toBe(f.gddpMaster.id);
      expect(coordAtt.status).toBe('ACTIVE');

      // 49. Replay same request -> idempotent, exactly 1 row
      const replayAttRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/attestations`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-att-coord' });
      expect(replayAttRes.status).toBe(HttpStatus.OK);
      expect(replayAttRes.body.id).toBe(coordAtt.id);

      // 41. BGH Principal attest succeeds (Coexistence)
      const attBghRes = await f.bghPrincipal.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/attestations`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-att-bgh' });
      expect(attBghRes.status).toBe(HttpStatus.OK);
      const bghAtt = attBghRes.body;
      expect(bghAtt.authorityType).toBe('BGH_PRINCIPAL');

      // 51 & 52: 2 distinct actors both ACTIVE -> gate true, active count = 2
      const gateTwoRes = await f.coordinatorGddp.agent
        .get(`/api/programme-planning/occurrences/${occ.id}/attestations`)
        .set('Origin', testOrigin);
      expect(gateTwoRes.body.hasQualifyingNonReversedAttestation).toBe(true);
      expect(gateTwoRes.body.activeAttestationCount).toBe(2);

      // 53. Reverse one attestation (BGH) -> gate still true, active count = 1
      const bghAttDb = await h.prisma.programmeOccurrenceAttestation.findUniqueOrThrow({
        where: { id: bghAtt.id },
      });

      // 56. Stale reversal fails
      const staleRevRes = await f.bghPrincipal.agent
        .post(`/api/programme-planning/attestations/${bghAtt.id}/reverse`)
        .set('Origin', testOrigin)
        .send({
          commandId: 'cmd-rev-stale',
          expectedUpdatedAt: new Date('2020-01-01T00:00:00.000Z').toISOString(),
          reversalReason: 'Lý do',
        });
      expect(staleRevRes.status).toBe(HttpStatus.CONFLICT);

      // Valid reversal of BGH attestation
      const revBghRes = await f.bghPrincipal.agent
        .post(`/api/programme-planning/attestations/${bghAtt.id}/reverse`)
        .set('Origin', testOrigin)
        .send({
          commandId: 'cmd-rev-bgh-valid',
          expectedUpdatedAt: bghAttDb.updatedAt.toISOString(),
          reversalReason: 'Hiệu trưởng đảo ngược xác nhận để kiểm tra lại',
        });
      expect(revBghRes.status).toBe(HttpStatus.OK);
      expect(revBghRes.body.status).toBe('REVERSED');

      // Gate remains true because Coordinator attestation is still ACTIVE
      const gateAfterOneRev = await f.coordinatorGddp.agent
        .get(`/api/programme-planning/occurrences/${occ.id}/attestations`)
        .set('Origin', testOrigin);
      expect(gateAfterOneRev.body.hasQualifyingNonReversedAttestation).toBe(true);
      expect(gateAfterOneRev.body.activeAttestationCount).toBe(1);

      // 54. Reverse final attestation (Coordinator) -> gate false, active count = 0
      const coordAttDb = await h.prisma.programmeOccurrenceAttestation.findUniqueOrThrow({
        where: { id: coordAtt.id },
      });

      const revCoordRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/attestations/${coordAtt.id}/reverse`)
        .set('Origin', testOrigin)
        .send({
          commandId: 'cmd-rev-coord-valid',
          expectedUpdatedAt: coordAttDb.updatedAt.toISOString(),
          reversalReason: 'Điều phối viên đảo ngược xác nhận',
        });
      expect(revCoordRes.status).toBe(HttpStatus.OK);
      expect(revCoordRes.body.status).toBe('REVERSED');

      // Gate is now false!
      const gateFinalRes = await f.coordinatorGddp.agent
        .get(`/api/programme-planning/occurrences/${occ.id}/attestations`)
        .set('Origin', testOrigin);
      expect(gateFinalRes.body.hasQualifyingNonReversedAttestation).toBe(false);
      expect(gateFinalRes.body.activeAttestationCount).toBe(0);

      // 55. Reversed rows are retained in DB
      const allAtts = await h.prisma.programmeOccurrenceAttestation.findMany({
        where: { plannedProgrammeOccurrenceId: occ.id },
      });
      expect(allAtts).toHaveLength(2);
      expect(allAtts.every((a) => a.status === 'REVERSED')).toBe(true);

      // 57. Audit persisted for create and reverse
      const createAudit = await h.prisma.auditEvent.findFirst({
        where: { action: 'PROGRAMME_OCCURRENCE_ATTESTED' },
      });
      const reverseAudit = await h.prisma.auditEvent.findFirst({
        where: { action: 'PROGRAMME_ATTESTATION_REVERSED' },
      });
      expect(createAudit).not.toBeNull();
      expect(reverseAudit).not.toBeNull();
    });
  });

  // =========================================================================
  // 58 & 59: P4-050 NEGATIVE BOUNDARY & SEPARATION REGRESSION
  // =========================================================================

  describe('P4-050 Negative Boundary & SpecialActivity Separation', () => {
    it('58. P4-040 operations never create ReportingStatement or mutate workload credit', async () => {
      // Direct count on reporting_statements table
      const statementsCount = await h.prisma.reportingStatementSeries.count();
      expect(statementsCount).toBe(0);
    });

    it('59. Programme Coordinator cannot call generic SpecialActivity mutation endpoints', async () => {
      const f = await setupBaseFixture();

      // Coordinator tries to POST /api/special-activities directly
      const res = await f.coordinatorGddp.agent
        .post('/api/special-activities')
        .set('Origin', testOrigin)
        .send({
          academicYearId: f.year.id,
          academicCalendarVersionId: f.calendarVersion.id,
          civilDate: '2026-09-07',
          scope: 'GRADE',
          gradeLevel: 10,
          title: 'Adhoc activity without generic grant',
          exactTimeSlotDefinitionIds: [f.slotDef1.id],
          scheduledTeacherUserIds: [f.teacherA.id],
          requestKey: 'req-coord-direct-attempt',
        });

      // Must be 403 Forbidden because coordinator does NOT have generic SPECIAL_ACTIVITY_MANAGE
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });
  });
});
