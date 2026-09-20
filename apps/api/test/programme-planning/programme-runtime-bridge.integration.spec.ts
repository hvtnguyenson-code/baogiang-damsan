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

      const { occ: occ1 } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      const { occ: occ2 } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-14T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      const res1 = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ1.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-diff-payload' });
      expect(res1.status).toBe(HttpStatus.OK);

      // Same actor (coordinatorGddp), same commandId, but different target/payload (occ2) -> fingerprint conflict
      const res2 = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ2.id}/materialize`)
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
    it('58. P4-050 negative boundary: P4-040 materialization, attestation, and reversal never mutate reporting statements or produce workload credit', async () => {
      const f = await setupBaseFixture();

      // 1. Snapshot initial state of all reporting statement tables
      const initialSeries = await h.prisma.reportingStatementSeries.count();
      const initialRevisions = await h.prisma.reportingStatementRevision.count();
      const initialHistories = await h.prisma.reportingStatementHistory.count();
      const initialCommands = await h.prisma.reportingStatementCommand.count();

      // 2. Setup published occurrence
      const { occ } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-07',
        creatorId: f.coordinatorGddp.id,
        status: 'PUBLISHED',
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      // 3. Operation A: Materialization
      const matRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-p4050-neg-mat' });
      expect(matRes.status).toBe(HttpStatus.OK);

      // 4. Operation B: Attestation
      const attRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/attestations`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-p4050-neg-att' });
      expect(attRes.status).toBe(HttpStatus.OK);
      const attId = attRes.body.id;

      // 5. Operation C: Reversal
      const attDb = await h.prisma.programmeOccurrenceAttestation.findUniqueOrThrow({
        where: { id: attId },
      });
      const revRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/attestations/${attId}/reverse`)
        .set('Origin', testOrigin)
        .send({
          commandId: 'cmd-p4050-neg-rev',
          expectedUpdatedAt: attDb.updatedAt.toISOString(),
          reversalReason: 'Kiểm tra P4-050 negative boundary: đảo ngược không chạm reporting',
        });
      expect(revRes.status).toBe(HttpStatus.OK);

      // 6. Prove zero change to any reporting statement tables
      expect(await h.prisma.reportingStatementSeries.count()).toBe(initialSeries);
      expect(await h.prisma.reportingStatementRevision.count()).toBe(initialRevisions);
      expect(await h.prisma.reportingStatementHistory.count()).toBe(initialHistories);
      expect(await h.prisma.reportingStatementCommand.count()).toBe(initialCommands);

      // 7. Verify physical absence: no workload projection or credit models exist in repository (P4-050 PLANNED)
      const prismaDelegateKeys = Object.keys(h.prisma).filter((k) => !k.startsWith('$') && !k.startsWith('_'));
      expect(prismaDelegateKeys.some((k) => /workload/i.test(k))).toBe(false);
      expect(prismaDelegateKeys.some((k) => /credit/i.test(k))).toBe(false);
    });

    it('59. Authorization Separation: Programme Coordinator cannot call generic SpecialActivity mutation endpoints', async () => {
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

    it('60: HĐTN CLASS uses resolved effective GVCN for SpecialActivityStaffing without rewriting planned staffing', async () => {
      const f = await setupBaseFixture();

      const hdtnMaster = await h.prisma.programmeMaster.create({
        data: {
          academicYearId: f.year.id,
          kind: 'HDTN_HN',
          gradeLevel: null,
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const coordinatorHdtn = await h.actor({
        usernamePrefix: 'coord-hdtn-staffing',
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
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const hdtnTopic = await h.prisma.programmeTopicItem.create({
        data: {
          programmePlanVersionId: hdtnPlan.id,
          sequence: 1,
          title: 'Chủ đề HĐTN Lớp 10',
          requiredPeriods: 1,
          guidelineWeekFrom: 1,
          guidelineWeekTo: 2,
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

      // Homeroom assignment: Teacher Y (f.teacherB) is effective GVCN for activeClass10
      const gvcnAssignment = await h.prisma.homeroomAssignment.create({
        data: {
          academicYearId: f.year.id,
          schoolClassId: f.activeClass10.id,
          teacherUserId: f.teacherB.id,
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validUntil: null,
          status: 'ACTIVE',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      // Planning slot staffing = Teacher X (f.teacherA)
      const { occ, slots } = await createOccurrenceWithStaffing(f, {
        masterId: hdtnMaster.id,
        planVersionId: hdtnPlan.id,
        topicItemId: hdtnTopic.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        mode: 'CLASS',
        schoolClassId: f.activeClass10.id,
        creatorId: coordinatorHdtn.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      // Materialize occurrence
      const res = await coordinatorHdtn.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-hdtn-gvcn-staffing' });
      expect(res.status).toBe(HttpStatus.OK);

      // Verify SpecialActivityStaffing contains Teacher Y (f.teacherB), NOT Teacher X (f.teacherA)
      const matRow = await h.prisma.programmeMaterializedActivity.findFirstOrThrow({
        where: { plannedProgrammeOccurrenceId: occ.id },
      });
      expect(matRow.homeroomAssignmentId).toBe(gvcnAssignment.id);
      expect(matRow.homeroomTeacherUserId).toBe(f.teacherB.id);

      const staffings = await h.prisma.specialActivityStaffing.findMany({
        where: { specialActivityId: matRow.specialActivityId },
      });
      expect(staffings).toHaveLength(1);
      expect(staffings[0].scheduledTeacherUserId).toBe(f.teacherB.id);
      expect(staffings[0].scheduledTeacherUserId).not.toBe(f.teacherA.id);

      // Planned rows must NOT be updated or rewritten
      const plannedStaffing = await h.prisma.plannedSlotStaffing.findMany({
        where: { plannedOccurrenceSlotId: slots[0].id },
      });
      expect(plannedStaffing).toHaveLength(1);
      expect(plannedStaffing[0].teacherUserId).toBe(f.teacherA.id);
    });

    it('61: Retrospective HĐTN CLASS allows historical inactive GVCN but fails closed for current/future', async () => {
      const f = await setupBaseFixture();

      const hdtnMaster = await h.prisma.programmeMaster.create({
        data: {
          academicYearId: f.year.id,
          kind: 'HDTN_HN',
          gradeLevel: null,
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const coordinatorHdtn = await h.actor({
        usernamePrefix: 'coord-hdtn-retro',
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
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const hdtnTopic = await h.prisma.programmeTopicItem.create({
        data: {
          programmePlanVersionId: hdtnPlan.id,
          sequence: 1,
          title: 'Chủ đề HĐTN Retro',
          requiredPeriods: 1,
          guidelineWeekFrom: 1,
          guidelineWeekTo: 2,
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

      // Create an inactive teacher (formerly active GVCN)
      const inactiveTeacher = await h.actor({ usernamePrefix: 'inactive-gvcn' });
      await h.prisma.user.update({
        where: { id: inactiveTeacher.id },
        data: { status: 'DISABLED' },
      });

      // Bounded historical homeroom assignment with inactive teacher (historical GVCN)
      const retroAssignment = await h.prisma.homeroomAssignment.create({
        data: {
          academicYearId: f.year.id,
          schoolClassId: f.activeClass10.id,
          teacherUserId: inactiveTeacher.id,
          validFrom: new Date('2026-08-01T00:00:00.000Z'),
          validUntil: new Date('2026-08-31T00:00:00.000Z'),
          status: 'ACTIVE',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      // Current/future homeroom assignment with inactive teacher
      await h.prisma.homeroomAssignment.create({
        data: {
          academicYearId: f.year.id,
          schoolClassId: f.activeClass10.id,
          teacherUserId: inactiveTeacher.id,
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validUntil: null,
          status: 'ACTIVE',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      // Case 1: Future occurrence with inactive GVCN => fail closed
      const { occ: futureOcc } = await createOccurrenceWithStaffing(f, {
        masterId: hdtnMaster.id,
        planVersionId: hdtnPlan.id,
        topicItemId: hdtnTopic.id,
        civilDate: '2026-11-09T00:00:00.000Z',
        mode: 'CLASS',
        schoolClassId: f.activeClass10.id,
        creatorId: coordinatorHdtn.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      const futureRes = await coordinatorHdtn.agent
        .post(`/api/programme-planning/occurrences/${futureOcc.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-hdtn-future-inactive' });
      expect(futureRes.status).toBe(HttpStatus.CONFLICT);

      // Case 2: Past occurrence with historical assignment and inactive teacher => succeeds
      // Update calendar to cover past date
      await h.prisma.academicCalendarVersion.update({
        where: { id: f.calendarVersion.id },
        data: { startDate: new Date('2026-08-01T00:00:00.000Z') },
      });

      const { occ: pastOcc } = await createOccurrenceWithStaffing(f, {
        masterId: hdtnMaster.id,
        planVersionId: hdtnPlan.id,
        topicItemId: hdtnTopic.id,
        civilDate: '2026-08-10T00:00:00.000Z',
        mode: 'CLASS',
        schoolClassId: f.activeClass10.id,
        creatorId: coordinatorHdtn.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      const pastRes = await coordinatorHdtn.agent
        .post(`/api/programme-planning/occurrences/${pastOcc.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-hdtn-past-inactive' });
      expect(pastRes.status).toBe(HttpStatus.OK);

      const pastMatRow = await h.prisma.programmeMaterializedActivity.findFirstOrThrow({
        where: { plannedProgrammeOccurrenceId: pastOcc.id },
      });
      expect(pastMatRow.homeroomAssignmentId).toBe(retroAssignment.id);
      expect(pastMatRow.homeroomTeacherUserId).toBe(inactiveTeacher.id);

      const pastStaffing = await h.prisma.specialActivityStaffing.findFirstOrThrow({
        where: { specialActivityId: pastMatRow.specialActivityId },
      });
      expect(pastStaffing.scheduledTeacherUserId).toBe(inactiveTeacher.id);
      expect(pastStaffing.eligibilityWasActive).toBe(false);
      expect(pastStaffing.historicalHomeroomAssignmentId).toBe(retroAssignment.id);

      // Case 3: Public SpecialActivity creation with inactive teacher fails
      const saMgr = await h.actor({
        usernamePrefix: 'sa-mgr-61',
        grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }],
      });
      const publicRes = await saMgr.agent
        .post('/api/special-activities')
        .set('Origin', testOrigin)
        .send({
          academicYearId: f.year.id,
          academicCalendarVersionId: f.calendarVersion.id,
          civilDate: '2026-09-07',
          scope: 'GRADE',
          gradeLevel: 10,
          title: 'Adhoc activity with inactive teacher',
          exactTimeSlotDefinitionIds: [f.slotDef1.id],
          scheduledTeacherUserIds: [inactiveTeacher.id],
          requestKey: 'req-public-inactive-attempt',
        });
      expect(publicRes.status).toBe(HttpStatus.CONFLICT);
    });

    it('62: Attestation request keys are actor-scoped so different actors can reuse same commandId', async () => {
      const f = await setupBaseFixture();

      const { occ: occ1 } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      const { occ: occ2 } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-14T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      const sharedCommandId = 'cmd-shared-attest-key';

      // Actor A (coordinator) attests occ1 with sharedCommandId
      const resA = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ1.id}/attestations`)
        .set('Origin', testOrigin)
        .send({ commandId: sharedCommandId });
      expect(resA.status).toBe(HttpStatus.OK);

      // Actor B (principal) attests SAME occ1 with SAME sharedCommandId -> succeeds due to actor scoping
      const resB = await f.bghPrincipal.agent
        .post(`/api/programme-planning/occurrences/${occ1.id}/attestations`)
        .set('Origin', testOrigin)
        .send({ commandId: sharedCommandId });
      expect(resB.status).toBe(HttpStatus.OK);

      // Replay Actor A with same payload is idempotent
      const replayA = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ1.id}/attestations`)
        .set('Origin', testOrigin)
        .send({ commandId: sharedCommandId });
      expect(replayA.status).toBe(HttpStatus.OK);
      expect(replayA.body.id).toBe(resA.body.id);

      // Actor A reusing sharedCommandId for DIFFERENT occurrence produces conflict
      const conflictA = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ2.id}/attestations`)
        .set('Origin', testOrigin)
        .send({ commandId: sharedCommandId });
      expect(conflictA.status).toBe(HttpStatus.CONFLICT);

      // Reversal: Actor A and Actor B can both use same reversal commandId
      const sharedRevCommandId = 'cmd-shared-reverse-key';
      const revA = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/attestations/${resA.body.id}/reverse`)
        .set('Origin', testOrigin)
        .send({
          commandId: sharedRevCommandId,
          expectedUpdatedAt: resA.body.updatedAt,
          reversalReason: 'Đảo ngược A',
        });
      expect(revA.status).toBe(HttpStatus.OK);

      const revB = await f.bghPrincipal.agent
        .post(`/api/programme-planning/attestations/${resB.body.id}/reverse`)
        .set('Origin', testOrigin)
        .send({
          commandId: sharedRevCommandId,
          expectedUpdatedAt: resB.body.updatedAt,
          reversalReason: 'Đảo ngược B',
        });
      expect(revB.status).toBe(HttpStatus.OK);
    });

    it('63: Materialization rejects DRAFT and future SUPERSEDED plans, but allows historical retained SUPERSEDED', async () => {
      const f = await setupBaseFixture();

      const master63 = await h.prisma.programmeMaster.create({
        data: {
          academicYearId: f.year.id,
          kind: 'GDDP',
          gradeLevel: 12,
          createdByUserId: f.bghPrincipal.id,
        },
      });

      await h.prisma.schoolClass.create({
        data: {
          academicYearId: f.year.id,
          code: '12A_BASE',
          name: 'Lớp 12A Cơ Bản',
          gradeLevel: 12,
          status: 'ACTIVE',
        },
      });

      const coordinator63 = await h.actor({
        usernamePrefix: 'coord-63',
        grants: [
          {
            capabilityKey: 'GDDDP_COORDINATOR',
            scopeType: 'ACTIVITY',
            scopeResourceId: master63.id,
          },
        ],
      });

      // DRAFT plan version
      const draftPlan = await h.prisma.programmePlanVersion.create({
        data: {
          programmeMasterId: master63.id,
          versionNumber: 1,
          status: 'DRAFT',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const draftTopic = await h.prisma.programmeTopicItem.create({
        data: {
          programmePlanVersionId: draftPlan.id,
          sequence: 1,
          title: 'Topic in draft plan',
          requiredPeriods: 1,
          guidelineWeekFrom: 1,
          guidelineWeekTo: 2,
        },
      });

      // Temporarily publish to allow occurrence creation through DB trigger
      await h.prisma.programmePlanVersion.update({
        where: { id: draftPlan.id },
        data: { status: 'PUBLISHED', publishedByUserId: f.bghPrincipal.id, publishedAt: new Date() },
      });

      const { occ: draftOcc } = await createOccurrenceWithStaffing(f, {
        masterId: master63.id,
        planVersionId: draftPlan.id,
        topicItemId: draftTopic.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        gradeLevel: 12,
        creatorId: coordinator63.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      // Revert plan back to DRAFT to test materialization guard
      await h.prisma.$executeRawUnsafe(
        'ALTER TABLE programme_plan_versions DISABLE TRIGGER "programme_plan_version_immutability_guard"',
      );
      await h.prisma.$executeRawUnsafe(
        `UPDATE programme_plan_versions SET status = 'DRAFT', published_at = null, published_by_user_id = null WHERE id = '${draftPlan.id}'`,
      );
      await h.prisma.$executeRawUnsafe(
        'ALTER TABLE programme_plan_versions ENABLE TRIGGER "programme_plan_version_immutability_guard"',
      );

      // Occurrence on DRAFT plan cannot materialize
      const draftRes = await coordinator63.agent
        .post(`/api/programme-planning/occurrences/${draftOcc.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-mat-draft-plan' });
      expect(draftRes.status).toBe(HttpStatus.CONFLICT);

      // Set draftPlan to SUPERSEDED with full lifecycle evidence so master63 has no active DRAFT or PUBLISHED plan
      await h.prisma.$executeRawUnsafe(
        'ALTER TABLE programme_plan_versions DISABLE TRIGGER "programme_plan_version_immutability_guard"',
      );
      await h.prisma.$executeRawUnsafe(
        `UPDATE programme_plan_versions SET status = 'SUPERSEDED', published_by_user_id = '${f.bghPrincipal.id}', published_at = NOW(), superseded_by_user_id = '${f.bghPrincipal.id}', superseded_at = NOW() WHERE id = '${draftPlan.id}'`,
      );
      await h.prisma.$executeRawUnsafe(
        'ALTER TABLE programme_plan_versions ENABLE TRIGGER "programme_plan_version_immutability_guard"',
      );

      // Now Plan 2: SUPERSEDED plan with publication evidence
      const supersededPlan = await h.prisma.programmePlanVersion.create({
        data: {
          programmeMasterId: master63.id,
          versionNumber: 2,
          status: 'DRAFT',
          predecessorVersionId: draftPlan.id,
          changeReason: 'Lý do cập nhật phiên bản 2',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const supersededTopic = await h.prisma.programmeTopicItem.create({
        data: {
          programmePlanVersionId: supersededPlan.id,
          sequence: 1,
          title: 'Topic in superseded plan',
          requiredPeriods: 1,
          guidelineWeekFrom: 1,
          guidelineWeekTo: 2,
        },
      });

      await h.prisma.programmePlanVersion.update({
        where: { id: supersededPlan.id },
        data: {
          status: 'PUBLISHED',
          publishedByUserId: f.bghPrincipal.id,
          publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      });

      // Future occurrence on SUPERSEDED plan -> rejected
      const { occ: futureSuperOcc } = await createOccurrenceWithStaffing(f, {
        masterId: master63.id,
        planVersionId: supersededPlan.id,
        topicItemId: supersededTopic.id,
        civilDate: '2026-11-09T00:00:00.000Z',
        gradeLevel: 12,
        creatorId: coordinator63.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      // Update calendar to cover past date
      await h.prisma.academicCalendarVersion.update({
        where: { id: f.calendarVersion.id },
        data: { startDate: new Date('2026-08-01T00:00:00.000Z') },
      });

      const { occ: pastSuperOcc } = await createOccurrenceWithStaffing(f, {
        masterId: master63.id,
        planVersionId: supersededPlan.id,
        topicItemId: supersededTopic.id,
        civilDate: '2026-08-10T00:00:00.000Z',
        gradeLevel: 12,
        creatorId: coordinator63.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      // Now set supersededPlan to SUPERSEDED with retained evidence
      await h.prisma.$executeRawUnsafe(
        `UPDATE programme_plan_versions SET status = 'SUPERSEDED', superseded_by_user_id = '${f.bghPrincipal.id}', superseded_at = NOW() WHERE id = '${supersededPlan.id}'`,
      );

      const futureSuperRes = await coordinator63.agent
        .post(`/api/programme-planning/occurrences/${futureSuperOcc.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-mat-future-superseded' });
      expect(futureSuperRes.status).toBe(HttpStatus.CONFLICT);

      const pastSuperRes = await coordinator63.agent
        .post(`/api/programme-planning/occurrences/${pastSuperOcc.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-mat-past-superseded' });
      expect(pastSuperRes.status).toBe(HttpStatus.OK);
    });

    it('64: DB trigger enforces coherent provenance, homeroom pairing, immutable history, and active root exclusivity', async () => {
      const f = await setupBaseFixture();

      const { occ, slots } = await createOccurrenceWithStaffing(f, {
        masterId: f.gddpMaster.id,
        planVersionId: f.planVersion.id,
        topicItemId: f.topicItem.id,
        civilDate: '2026-09-07T00:00:00.000Z',
        creatorId: f.coordinatorGddp.id,
        slots: [{ slotDefId: f.slotDef1.id, teacherIds: [f.teacherA.id] }],
      });

      // Materialize legitimate occurrence
      const matRes = await f.coordinatorGddp.agent
        .post(`/api/programme-planning/occurrences/${occ.id}/materialize`)
        .set('Origin', testOrigin)
        .send({ commandId: 'cmd-db-guard-legit' });
      expect(matRes.status).toBe(HttpStatus.OK);

      const matRow = await h.prisma.programmeMaterializedActivity.findFirstOrThrow({
        where: { plannedProgrammeOccurrenceId: occ.id },
      });

      // A. Direct UPDATE on programme_materialized_activities is prohibited
      await expect(
        h.prisma.$executeRawUnsafe(
          `UPDATE programme_materialized_activities SET materialized_by_user_id = '${f.bghPrincipal.id}' WHERE id = '${matRow.id}'`,
        ),
      ).rejects.toThrow(/immutable and cannot be updated/i);

      // B. Direct DELETE on programme_materialized_activities is prohibited
      await expect(
        h.prisma.$executeRawUnsafe(
          `DELETE FROM programme_materialized_activities WHERE id = '${matRow.id}'`,
        ),
      ).rejects.toThrow(/cannot be deleted; retained history must be preserved/i);

      // C. Mismatched provenance tuple (plan does not belong to master)
      const otherPlan = await h.prisma.programmePlanVersion.create({
        data: {
          programmeMasterId: f.otherMaster.id,
          versionNumber: 1,
          status: 'DRAFT',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      await h.prisma.programmeTopicItem.create({
        data: {
          programmePlanVersionId: otherPlan.id,
          sequence: 1,
          title: 'Other topic',
          requiredPeriods: 1,
          guidelineWeekFrom: 1,
          guidelineWeekTo: 2,
        },
      });

      await h.prisma.programmePlanVersion.update({
        where: { id: otherPlan.id },
        data: {
          status: 'PUBLISHED',
          publishedByUserId: f.bghPrincipal.id,
          publishedAt: new Date(),
        },
      });

      const fakeSpecialActivity = await h.prisma.specialActivity.create({
        data: {
          academicYearId: f.year.id,
          academicCalendarVersionId: f.calendarVersion.id,
          civilDate: new Date('2026-09-07'),
          scope: 'GRADE',
          gradeLevel: 10,
          title: 'Fake SpecialActivity for test',
          createRequestKey: 'fake-sa-key-1',
          createRequestFingerprint: 'fp-1',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      await expect(
        h.prisma.$executeRawUnsafe(
          `INSERT INTO programme_materialized_activities (
            id, programme_master_id, programme_plan_version_id, programme_topic_item_id,
            planned_programme_occurrence_id, planned_occurrence_slot_id, special_activity_id,
            materialized_by_user_id
          ) VALUES (
            gen_random_uuid(), '${f.gddpMaster.id}', '${otherPlan.id}', '${f.topicItem.id}',
            '${occ.id}', '${slots[0].id}', '${fakeSpecialActivity.id}', '${f.bghPrincipal.id}'
          )`,
        ),
      ).rejects.toThrow(/Coherent provenance check failed/i);

      // D. Mismatched homeroom pair (teacher does not match homeroom_assignment)
      const hrAssignment = await h.prisma.homeroomAssignment.create({
        data: {
          academicYearId: f.year.id,
          schoolClassId: f.activeClass10.id,
          teacherUserId: f.teacherB.id,
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validUntil: null,
          status: 'ACTIVE',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      const fakeSpecialActivity2 = await h.prisma.specialActivity.create({
        data: {
          academicYearId: f.year.id,
          academicCalendarVersionId: f.calendarVersion.id,
          civilDate: new Date('2026-09-07'),
          scope: 'GRADE',
          gradeLevel: 10,
          title: 'Fake SpecialActivity for test 2',
          createRequestKey: 'fake-sa-key-2',
          createRequestFingerprint: 'fp-2',
          createdByUserId: f.bghPrincipal.id,
        },
      });

      await expect(
        h.prisma.$executeRawUnsafe(
          `INSERT INTO programme_materialized_activities (
            id, programme_master_id, programme_plan_version_id, programme_topic_item_id,
            planned_programme_occurrence_id, planned_occurrence_slot_id, special_activity_id,
            homeroom_assignment_id, homeroom_teacher_user_id, materialized_by_user_id
          ) VALUES (
            gen_random_uuid(), '${f.gddpMaster.id}', '${f.planVersion.id}', '${f.topicItem.id}',
            '${occ.id}', '${slots[0].id}', '${fakeSpecialActivity2.id}',
            '${hrAssignment.id}', '${f.teacherA.id}', '${f.bghPrincipal.id}'
          )`,
        ),
      ).rejects.toThrow(/Homeroom pair check failed/i);

      // E. Duplicate active root rejected (planned slot already has ACTIVE root matRow.specialActivityId)
      await expect(
        h.prisma.$executeRawUnsafe(
          `INSERT INTO programme_materialized_activities (
            id, programme_master_id, programme_plan_version_id, programme_topic_item_id,
            planned_programme_occurrence_id, planned_occurrence_slot_id, special_activity_id,
            materialized_by_user_id
          ) VALUES (
            gen_random_uuid(), '${f.gddpMaster.id}', '${f.planVersion.id}', '${f.topicItem.id}',
            '${occ.id}', '${slots[0].id}', '${fakeSpecialActivity2.id}', '${f.bghPrincipal.id}'
          )`,
        ),
      ).rejects.toThrow(/Duplicate active root check failed/i);

      // F. Legitimate replacement succeeds when predecessor is REVERSED
      await h.prisma.specialActivity.update({
        where: { id: matRow.specialActivityId },
        data: {
          status: 'REVERSED',
          reversedByUserId: f.bghPrincipal.id,
          reversedAt: new Date(),
          reversalReason: 'Test replacement',
          reverseRequestKey: 'rev-key-test-64',
          reverseRequestFingerprint: 'rev-fp-test-64',
        },
      });

      const replaceResult = await h.prisma.$executeRawUnsafe(
        `INSERT INTO programme_materialized_activities (
          id, programme_master_id, programme_plan_version_id, programme_topic_item_id,
          planned_programme_occurrence_id, planned_occurrence_slot_id, special_activity_id,
          materialized_by_user_id
        ) VALUES (
          gen_random_uuid(), '${f.gddpMaster.id}', '${f.planVersion.id}', '${f.topicItem.id}',
          '${occ.id}', '${slots[0].id}', '${fakeSpecialActivity2.id}', '${f.bghPrincipal.id}'
        )`,
      );
      expect(replaceResult).toBe(1);
    });
  });
});
