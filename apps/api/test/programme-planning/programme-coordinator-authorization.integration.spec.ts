import { HttpStatus } from '@nestjs/common';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

integration('Programme Coordinator Authorization (PostgreSQL integration)', () => {
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
      { key: 'GDDP_COORDINATOR', scopes: ['ACTIVITY'] },
      { key: 'HĐTN_COORDINATOR', scopes: ['ACTIVITY'] },
      { key: 'CAPABILITY_GRANT', scopes: ['SCHOOL_WIDE'] },
      { key: 'AI_ACTIVE_USE_ACTIVITY', scopes: ['ACTIVITY'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'SPECIAL_ACTIVITY_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_GROUP_LEAD', scopes: ['SUBJECT_GROUP'] },
    ]);
  });

  afterAll(async () => {
    try {
      await clean();
    } finally {
      await h.stop();
    }
  });

  async function setupYear() {
    return h.prisma.academicYear.create({
      data: {
        code: normalizedCode('Y'),
        name: 'Năm học 2026-2027',
      },
    });
  }

  async function createMasterDirect(yearId: string, kind: 'GDDP' | 'HDTN_HN', gradeLevel = 10, creatorId?: string) {
    const creator = creatorId ?? (await h.actor()).id;
    return h.prisma.programmeMaster.create({
      data: {
        academicYearId: yearId,
        kind,
        gradeLevel: kind === 'GDDP' ? gradeLevel : null,
        createdByUserId: creator,
      },
    });
  }

  async function setupStaffedOccurrenceFixture() {
    const year = await setupYear();
    const bgh = await h.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL' }] });
    const teacher = await h.actor();

    const master = await h.prisma.programmeMaster.create({
      data: {
        academicYearId: year.id,
        kind: 'GDDP',
        gradeLevel: 10,
        createdByUserId: bgh.id,
      },
    });

    const plan = await h.prisma.programmePlanVersion.create({
      data: {
        programmeMasterId: master.id,
        versionNumber: 1,
        status: 'DRAFT',
        changeReason: 'Initial version',
        createdByUserId: bgh.id,
      },
    });

    const topic = await h.prisma.programmeTopicItem.create({
      data: {
        programmePlanVersionId: plan.id,
        sequence: 1,
        title: 'Chủ đề thử nghiệm',
        requiredPeriods: 2,
        guidelineWeekFrom: 1,
        guidelineWeekTo: 1,
      },
    });

    await h.prisma.programmePlanVersion.update({
      where: { id: plan.id },
      data: {
        status: 'PUBLISHED',
        publishedByUserId: bgh.id,
        publishedAt: new Date(),
      },
    });

    const slotDef = await h.prisma.timeSlotDefinition.create({
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

    const occ = await h.prisma.plannedProgrammeOccurrence.create({
      data: {
        programmeMasterId: master.id,
        programmePlanVersionId: plan.id,
        programmeTopicItemId: topic.id,
        academicYearId: year.id,
        civilDate: new Date('2026-09-07T00:00:00.000Z'),
        mode: 'GRADE',
        gradeLevel: 10,
        status: 'DRAFT',
        draftRevision: 1,
        createdByUserId: bgh.id,
      },
    });

    const occSlot = await h.prisma.plannedOccurrenceSlot.create({
      data: {
        plannedProgrammeOccurrenceId: occ.id,
        academicYearId: year.id,
        timeSlotDefinitionId: slotDef.id,
      },
    });

    const staffing = await h.prisma.plannedSlotStaffing.create({
      data: {
        plannedOccurrenceSlotId: occSlot.id,
        teacherUserId: teacher.id,
      },
    });

    return { year, bgh, teacher, master, plan, topic, occ, occSlot, staffing };
  }

  it('End-to-End Flow: BGH creates master -> grant coordinator -> coordinator mutates -> wrong actor denied -> revoke -> coordinator denied', async () => {
    const year = await setupYear();

    // 1. Principal creates GDDP master
    const principal = await h.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL' }] });
    const createMasterRes = await principal.agent
      .post('/api/programme-planning/masters')
      .set('Origin', testOrigin)
      .send({
        academicYearId: year.id,
        kind: 'GDDP',
        gradeLevel: 10,
        commandId: 'cmd-master-e2e',
      });
    expect(createMasterRes.status).toBe(HttpStatus.CREATED);
    const masterId = createMasterRes.body.id as string;
    expect(masterId).toBeDefined();

    // 2. Admin issues GDDP_COORDINATOR grant for masterId to coordinator
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const coordinator = await h.actor();
    const wrongActor = await h.actor();

    const grantRes = await admin.agent
      .post(`/api/users/${coordinator.id}/capability-grants`)
      .set('Origin', testOrigin)
      .send({
        capabilityKey: 'GDDP_COORDINATOR',
        scopeType: 'ACTIVITY',
        scopeResourceId: masterId,
      });
    expect(grantRes.status).toBe(HttpStatus.CREATED);
    const grantId = grantRes.body.id as string;

    // 3. Coordinator creates draft plan version on authorized master
    const createPlanRes = await coordinator.agent
      .post(`/api/programme-planning/masters/${masterId}/plan-versions`)
      .set('Origin', testOrigin)
      .send({
        programmeMasterId: masterId,
        commandId: 'cmd-plan-e2e-1',
        initialTopics: [
          { sequence: 1, title: 'Chủ đề 1', requiredPeriods: 4 },
        ],
      });
    expect(createPlanRes.status).toBe(HttpStatus.CREATED);
    const planId = createPlanRes.body.id as string;
    expect(planId).toBeDefined();

    // 4. Coordinator edits draft plan version
    const editPlanRes = await coordinator.agent
      .post(`/api/programme-planning/plan-versions/${planId}/edit`)
      .set('Origin', testOrigin)
      .send({
        expectedRevision: 1,
        commandId: 'cmd-plan-e2e-2',
        topics: [
          { sequence: 1, title: 'Chủ đề 1 cập nhật', requiredPeriods: 6 },
        ],
      });
    expect(editPlanRes.status).toBe(HttpStatus.OK);

    // 5. Wrong actor (no grant) attempts to edit plan version -> 403 Forbidden
    const wrongEditRes = await wrongActor.agent
      .post(`/api/programme-planning/plan-versions/${planId}/edit`)
      .set('Origin', testOrigin)
      .send({
        expectedRevision: 2,
        commandId: 'cmd-plan-e2e-wrong',
        topics: [{ sequence: 1, title: 'Hack', requiredPeriods: 1 }],
      });
    expect(wrongEditRes.status).toBe(HttpStatus.FORBIDDEN);

    // 6. Admin revokes coordinator grant
    const revokeRes = await admin.agent
      .post(`/api/capability-grants/${grantId}/revoke`)
      .set('Origin', testOrigin)
      .send({ revokeReason: 'End of assignment' });
    expect(revokeRes.status).toBe(HttpStatus.OK);

    // 7. Former coordinator is now denied -> 403 Forbidden
    const afterRevokeRes = await coordinator.agent
      .post(`/api/programme-planning/plan-versions/${planId}/edit`)
      .set('Origin', testOrigin)
      .send({
        expectedRevision: 2,
        commandId: 'cmd-plan-e2e-revoked',
        topics: [{ sequence: 1, title: 'Attempt', requiredPeriods: 2 }],
      });
    expect(afterRevokeRes.status).toBe(HttpStatus.FORBIDDEN);

    // 8. Verify denial audit in database
    const denialAudit = await h.prisma.auditEvent.findFirst({
      where: {
        actorUserId: coordinator.id,
        action: 'AUTHORIZATION_DENIED',
      },
    });
    expect(denialAudit).toBeDefined();
    expect(denialAudit?.result).toBe('DENIED');
  });

  describe('Coordinator Capability Grant Hardening (Tests 25-29)', () => {
    it('25. GDDP_COORDINATOR grant creation rejects nonexistent resource with 404', async () => {
      const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
      const targetUser = await h.actor();

      const res = await admin.agent
        .post(`/api/users/${targetUser.id}/capability-grants`)
        .set('Origin', testOrigin)
        .send({
          capabilityKey: 'GDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: crypto.randomUUID(),
        });
      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('26. GDDP_COORDINATOR grant creation rejects HDTN_HN master with 409', async () => {
      const year = await setupYear();
      const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
      const targetUser = await h.actor();

      const hdtnMaster = await h.prisma.programmeMaster.create({
        data: {
          academicYearId: year.id,
          kind: 'HDTN_HN',
          createdByUserId: admin.id,
        },
      });

      const res = await admin.agent
        .post(`/api/users/${targetUser.id}/capability-grants`)
        .set('Origin', testOrigin)
        .send({
          capabilityKey: 'GDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: hdtnMaster.id,
        });
      expect(res.status).toBe(HttpStatus.CONFLICT);
    });

    it('27. HĐTN_COORDINATOR grant creation rejects GDDP master with 409', async () => {
      const year = await setupYear();
      const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
      const targetUser = await h.actor();

      const gddpMaster = await h.prisma.programmeMaster.create({
        data: {
          academicYearId: year.id,
          kind: 'GDDP',
          gradeLevel: 11,
          createdByUserId: admin.id,
        },
      });

      const res = await admin.agent
        .post(`/api/users/${targetUser.id}/capability-grants`)
        .set('Origin', testOrigin)
        .send({
          capabilityKey: 'HĐTN_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: gddpMaster.id,
        });
      expect(res.status).toBe(HttpStatus.CONFLICT);
    });

    it('28. Valid exact coordinator grants succeed with 201', async () => {
      const year = await setupYear();
      const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
      const targetUser = await h.actor();

      const gddpMaster = await h.prisma.programmeMaster.create({
        data: {
          academicYearId: year.id,
          kind: 'GDDP',
          gradeLevel: 10,
          createdByUserId: admin.id,
        },
      });

      const res = await admin.agent
        .post(`/api/users/${targetUser.id}/capability-grants`)
        .set('Origin', testOrigin)
        .send({
          capabilityKey: 'GDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: gddpMaster.id,
        });
      expect(res.status).toBe(HttpStatus.CREATED);
    });

    it('29. Unrelated AI_ACTIVE_USE_ACTIVITY grant behavior remains unchanged', async () => {
      const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
      const targetUser = await h.actor();
      const randomId = crypto.randomUUID();

      const res = await admin.agent
        .post(`/api/users/${targetUser.id}/capability-grants`)
        .set('Origin', testOrigin)
        .send({
          capabilityKey: 'AI_ACTIVE_USE_ACTIVITY',
          scopeType: 'ACTIVITY',
          scopeResourceId: randomId,
        });
      expect(res.status).toBe(HttpStatus.CREATED);
    });
  });

  describe('Bootstrap Invariant & HTTP Boundary Protections (Tests 1-3, 22-23)', () => {
    it('1 & 2. BGH Principal and Vice Principal can create ProgrammeMaster via HTTP', async () => {
      const year = await setupYear();
      const principal = await h.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL' }] });
      const vicePrincipal = await h.actor({ grants: [{ capabilityKey: 'APPROVAL_VICE_PRINCIPAL' }] });

      const pRes = await principal.agent
        .post('/api/programme-planning/masters')
        .set('Origin', testOrigin)
        .send({
          academicYearId: year.id,
          kind: 'GDDP',
          gradeLevel: 10,
          commandId: 'cmd-bgh-p',
        });
      expect(pRes.status).toBe(HttpStatus.CREATED);

      const vpRes = await vicePrincipal.agent
        .post('/api/programme-planning/masters')
        .set('Origin', testOrigin)
        .send({
          academicYearId: year.id,
          kind: 'HDTN_HN',
          commandId: 'cmd-bgh-vp',
        });
      expect(vpRes.status).toBe(HttpStatus.CREATED);
    });

    it('3. Coordinator cannot bootstrap create ProgrammeMaster via HTTP', async () => {
      const year = await setupYear();
      const coordinator = await h.actor({
        grants: [{ capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: crypto.randomUUID() }],
      });

      const res = await coordinator.agent
        .post('/api/programme-planning/masters')
        .set('Origin', testOrigin)
        .send({
          academicYearId: year.id,
          kind: 'GDDP',
          gradeLevel: 12,
          commandId: 'cmd-coord-create',
        });
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('22. Body/route master ID mismatch is rejected before mutation with 400', async () => {
      const principal = await h.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL' }] });
      const routeMasterId = crypto.randomUUID();
      const bodyMasterId = crypto.randomUUID();

      const res = await principal.agent
        .post(`/api/programme-planning/masters/${routeMasterId}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: bodyMasterId,
          commandId: 'cmd-mismatch-1',
        });
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('23. Body/route replacement occurrence ID mismatch is rejected with 400', async () => {
      const principal = await h.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL' }] });
      const routeOccId = crypto.randomUUID();
      const bodyOccId = crypto.randomUUID();

      const res = await principal.agent
        .post(`/api/programme-planning/occurrences/${routeOccId}/replacements`)
        .set('Origin', testOrigin)
        .send({
          replacesOccurrenceId: bodyOccId,
          changeReason: 'test mismatch',
          commandId: 'cmd-mismatch-2',
        });
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('Exact Coordinator Isolation (Section 5.1, Tests 4-8)', () => {
    it('4. GDDP coordinator on exact Master A can read and mutate Master A', async () => {
      const year = await setupYear();
      const masterA = await createMasterDirect(year.id, 'GDDP', 10);
      const coord = await h.actor({
        grants: [{ capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: masterA.id }],
      });

      const readRes = await coord.agent.get(`/api/programme-planning/masters/${masterA.id}`);
      expect(readRes.status).toBe(HttpStatus.OK);
      expect(readRes.body.id).toBe(masterA.id);

      const mutateRes = await coord.agent
        .post(`/api/programme-planning/masters/${masterA.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: masterA.id,
          commandId: 'cmd-mutate-a',
          initialTopics: [{ sequence: 1, title: 'Chủ đề A', requiredPeriods: 2 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.CREATED);
    });

    it('5. Same GDDP coordinator cannot read or mutate different GDDP Master B', async () => {
      const year = await setupYear();
      const masterA = await createMasterDirect(year.id, 'GDDP', 10);
      const masterB = await createMasterDirect(year.id, 'GDDP', 11);
      const coord = await h.actor({
        grants: [{ capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: masterA.id }],
      });

      const readRes = await coord.agent.get(`/api/programme-planning/masters/${masterB.id}`);
      expect(readRes.status).toBe(HttpStatus.FORBIDDEN);

      const mutateRes = await coord.agent
        .post(`/api/programme-planning/masters/${masterB.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: masterB.id,
          commandId: 'cmd-mutate-b-attempt',
          initialTopics: [{ sequence: 1, title: 'Chủ đề B', requiredPeriods: 2 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('6. GDDP coordinator cannot read or mutate HDTN_HN master', async () => {
      const year = await setupYear();
      const gddpMaster = await createMasterDirect(year.id, 'GDDP', 10);
      const hdtnMaster = await createMasterDirect(year.id, 'HDTN_HN');
      const coord = await h.actor({
        grants: [{ capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: gddpMaster.id }],
      });

      const readRes = await coord.agent.get(`/api/programme-planning/masters/${hdtnMaster.id}`);
      expect(readRes.status).toBe(HttpStatus.FORBIDDEN);

      const mutateRes = await coord.agent
        .post(`/api/programme-planning/masters/${hdtnMaster.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: hdtnMaster.id,
          commandId: 'cmd-mutate-hdtn-attempt',
          initialTopics: [{ sequence: 1, title: 'Chủ đề HDTN', requiredPeriods: 2 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('7. HĐTN coordinator on exact HDTN master can read and mutate HDTN master', async () => {
      const year = await setupYear();
      const hdtnMaster = await createMasterDirect(year.id, 'HDTN_HN');
      const coord = await h.actor({
        grants: [{ capabilityKey: 'HĐTN_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: hdtnMaster.id }],
      });

      const readRes = await coord.agent.get(`/api/programme-planning/masters/${hdtnMaster.id}`);
      expect(readRes.status).toBe(HttpStatus.OK);
      expect(readRes.body.id).toBe(hdtnMaster.id);

      const mutateRes = await coord.agent
        .post(`/api/programme-planning/masters/${hdtnMaster.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: hdtnMaster.id,
          commandId: 'cmd-mutate-hdtn-success',
          initialTopics: [{ sequence: 1, title: 'Chủ đề HĐTN', requiredPeriods: 3 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.CREATED);
    });

    it('8. HĐTN coordinator cannot read or mutate GDDP master', async () => {
      const year = await setupYear();
      const hdtnMaster = await createMasterDirect(year.id, 'HDTN_HN');
      const gddpMaster = await createMasterDirect(year.id, 'GDDP', 12);
      const coord = await h.actor({
        grants: [{ capabilityKey: 'HĐTN_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: hdtnMaster.id }],
      });

      const readRes = await coord.agent.get(`/api/programme-planning/masters/${gddpMaster.id}`);
      expect(readRes.status).toBe(HttpStatus.FORBIDDEN);

      const mutateRes = await coord.agent
        .post(`/api/programme-planning/masters/${gddpMaster.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: gddpMaster.id,
          commandId: 'cmd-mutate-gddp-attempt',
          initialTopics: [{ sequence: 1, title: 'Chủ đề GDDP', requiredPeriods: 2 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('No-Inference Security Cases (Section 5.2, Tests 11-15)', () => {
    it('11. SYSTEM_ADMIN / SCHOOL_WIDE alone is denied with 403', async () => {
      const year = await setupYear();
      const master = await createMasterDirect(year.id, 'GDDP', 10);
      const sysAdmin = await h.actor({
        grants: [{ capabilityKey: 'SYSTEM_ADMIN' }],
      });

      const readRes = await sysAdmin.agent.get(`/api/programme-planning/masters/${master.id}`);
      expect(readRes.status).toBe(HttpStatus.FORBIDDEN);

      const mutateRes = await sysAdmin.agent
        .post(`/api/programme-planning/masters/${master.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: master.id,
          commandId: 'cmd-sysadmin-attempt',
          initialTopics: [{ sequence: 1, title: 'T1', requiredPeriods: 1 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('12. SPECIAL_ACTIVITY_MANAGE / SCHOOL_WIDE alone is denied with 403', async () => {
      const year = await setupYear();
      const master = await createMasterDirect(year.id, 'GDDP', 10);
      const activityManager = await h.actor({
        grants: [{ capabilityKey: 'SPECIAL_ACTIVITY_MANAGE' }],
      });

      const readRes = await activityManager.agent.get(`/api/programme-planning/masters/${master.id}`);
      expect(readRes.status).toBe(HttpStatus.FORBIDDEN);

      const mutateRes = await activityManager.agent
        .post(`/api/programme-planning/masters/${master.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: master.id,
          commandId: 'cmd-actman-attempt',
          initialTopics: [{ sequence: 1, title: 'T1', requiredPeriods: 1 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('13. SUBJECT_GROUP_LEAD alone with real SubjectGroup grant is denied with 403', async () => {
      const year = await setupYear();
      const master = await createMasterDirect(year.id, 'GDDP', 10);
      const sg = await h.prisma.subjectGroup.create({
        data: {
          code: normalizedCode('SG'),
          name: 'Tổ Chuyên môn Toán - Tin',
        },
      });
      const deptHead = await h.actor({
        grants: [{ capabilityKey: 'SUBJECT_GROUP_LEAD', scopeType: 'SUBJECT_GROUP', scopeResourceId: sg.id }],
      });

      const readRes = await deptHead.agent.get(`/api/programme-planning/masters/${master.id}`);
      expect(readRes.status).toBe(HttpStatus.FORBIDDEN);

      const mutateRes = await deptHead.agent
        .post(`/api/programme-planning/masters/${master.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: master.id,
          commandId: 'cmd-depthead-attempt',
          initialTopics: [{ sequence: 1, title: 'T1', requiredPeriods: 1 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('14a. StaffProfile positionTitle = "Hiệu trưởng" without APPROVAL grant is denied with 403', async () => {
      const year = await setupYear();
      const master = await createMasterDirect(year.id, 'GDDP', 10);
      const actorWithTitle = await h.actor();
      await h.prisma.staffProfile.update({
        where: { userId: actorWithTitle.id },
        data: { positionTitle: 'Hiệu trưởng' },
      });

      const readRes = await actorWithTitle.agent.get(`/api/programme-planning/masters/${master.id}`);
      expect(readRes.status).toBe(HttpStatus.FORBIDDEN);

      const mutateRes = await actorWithTitle.agent
        .post(`/api/programme-planning/masters/${master.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: master.id,
          commandId: 'cmd-title-principal-attempt',
          initialTopics: [{ sequence: 1, title: 'T1', requiredPeriods: 1 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('14b. StaffProfile positionTitle = "Phó Hiệu trưởng" without APPROVAL grant is denied with 403', async () => {
      const year = await setupYear();
      const master = await createMasterDirect(year.id, 'HDTN_HN');
      const actorWithTitle = await h.actor();
      await h.prisma.staffProfile.update({
        where: { userId: actorWithTitle.id },
        data: { positionTitle: 'Phó Hiệu trưởng' },
      });

      const readRes = await actorWithTitle.agent.get(`/api/programme-planning/masters/${master.id}`);
      expect(readRes.status).toBe(HttpStatus.FORBIDDEN);

      const mutateRes = await actorWithTitle.agent
        .post(`/api/programme-planning/masters/${master.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: master.id,
          commandId: 'cmd-title-vp-attempt',
          initialTopics: [{ sequence: 1, title: 'T1', requiredPeriods: 1 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('15. Ordinary active teaching user without qualifying grant is denied with 403', async () => {
      const year = await setupYear();
      const master = await createMasterDirect(year.id, 'GDDP', 10);
      const ordinaryTeacher = await h.actor();

      const readRes = await ordinaryTeacher.agent.get(`/api/programme-planning/masters/${master.id}`);
      expect(readRes.status).toBe(HttpStatus.FORBIDDEN);

      const mutateRes = await ordinaryTeacher.agent
        .post(`/api/programme-planning/masters/${master.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: master.id,
          commandId: 'cmd-ordinary-attempt',
          initialTopics: [{ sequence: 1, title: 'T1', requiredPeriods: 1 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('Staffing and Creator Non-Inference (Section 5.3, Tests 16-17)', () => {
    it('16. Teacher presence in planned slot staffing does not confer management authority', async () => {
      const fixture = await setupStaffedOccurrenceFixture();

      // Teacher is in PlannedSlotStaffing, but has no coordinator/BGH capability
      const readRes = await fixture.teacher.agent.get(`/api/programme-planning/occurrences/${fixture.occ.id}`);
      expect(readRes.status).toBe(HttpStatus.FORBIDDEN);

      const editRes = await fixture.teacher.agent
        .post(`/api/programme-planning/occurrences/${fixture.occ.id}/edit`)
        .set('Origin', testOrigin)
        .send({
          expectedRevision: 1,
          commandId: 'cmd-staffing-attempt',
          note: 'Unauthorized edit by scheduled teacher',
        });
      expect(editRes.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('17. Creator identity alone does not retain authority after grant is removed', async () => {
      const year = await setupYear();
      const principal = await h.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL' }] });

      // Principal creates master
      const createRes = await principal.agent
        .post('/api/programme-planning/masters')
        .set('Origin', testOrigin)
        .send({
          academicYearId: year.id,
          kind: 'GDDP',
          gradeLevel: 10,
          commandId: 'cmd-master-creator-test',
        });
      expect(createRes.status).toBe(HttpStatus.CREATED);
      const masterId = createRes.body.id as string;

      // Revoke the principal's capability grant
      await h.prisma.capabilityGrant.updateMany({
        where: { userId: principal.id },
        data: { revokedAt: new Date() },
      });

      // Creator attempts to manage the master they created -> 403 Forbidden
      const planRes = await principal.agent
        .post(`/api/programme-planning/masters/${masterId}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: masterId,
          commandId: 'cmd-plan-creator-attempt',
          initialTopics: [{ sequence: 1, title: 'T1', requiredPeriods: 2 }],
        });
      expect(planRes.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('Temporal Grant Lifecycle Integration (Section 6, Tests 18-20)', () => {
    it('18. Revoked coordinator grant is denied with 403', async () => {
      const year = await setupYear();
      const master = await createMasterDirect(year.id, 'GDDP', 10);
      const coord = await h.actor();

      await h.prisma.capabilityGrant.create({
        data: {
          userId: coord.id,
          capabilityKey: 'GDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: master.id,
          validFrom: new Date(Date.now() - 100_000),
          revokedAt: new Date(Date.now() - 1_000),
          revokeReason: 'Revoked for testing',
        },
      });

      const res = await coord.agent.get(`/api/programme-planning/masters/${master.id}`);
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('19. Expired coordinator grant is denied with 403', async () => {
      const year = await setupYear();
      const master = await createMasterDirect(year.id, 'GDDP', 10);
      const coord = await h.actor();

      await h.prisma.capabilityGrant.create({
        data: {
          userId: coord.id,
          capabilityKey: 'GDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: master.id,
          validFrom: new Date(Date.now() - 200_000),
          validUntil: new Date(Date.now() - 50_000),
        },
      });

      const res = await coord.agent.get(`/api/programme-planning/masters/${master.id}`);
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('20. Future-dated coordinator grant is denied with 403', async () => {
      const year = await setupYear();
      const master = await createMasterDirect(year.id, 'GDDP', 10);
      const coord = await h.actor();

      await h.prisma.capabilityGrant.create({
        data: {
          userId: coord.id,
          capabilityKey: 'GDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: master.id,
          validFrom: new Date(Date.now() + 100_000),
          validUntil: new Date(Date.now() + 200_000),
        },
      });

      const res = await coord.agent.get(`/api/programme-planning/masters/${master.id}`);
      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('Active exact coordinator grant within valid interval succeeds with 200', async () => {
      const year = await setupYear();
      const master = await createMasterDirect(year.id, 'GDDP', 10);
      const coord = await h.actor();

      await h.prisma.capabilityGrant.create({
        data: {
          userId: coord.id,
          capabilityKey: 'GDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: master.id,
          validFrom: new Date(Date.now() - 10_000),
          validUntil: new Date(Date.now() + 100_000),
        },
      });

      const res = await coord.agent.get(`/api/programme-planning/masters/${master.id}`);
      expect(res.status).toBe(HttpStatus.OK);
    });
  });

  describe('Account State: mustChangePassword Fail-Closed (Section 7, Test 21)', () => {
    it('21. Actor with valid coordinator grant but mustChangePassword=true is denied and raw mutation does not occur', async () => {
      const year = await setupYear();
      const master = await createMasterDirect(year.id, 'GDDP', 10);
      const coord = await h.actor({
        mustChangePassword: true,
        grants: [{ capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: master.id }],
      });

      const mutateRes = await coord.agent
        .post(`/api/programme-planning/masters/${master.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: master.id,
          commandId: 'cmd-mcp-mutation-blocked',
          initialTopics: [{ sequence: 1, title: 'Should Not Persist', requiredPeriods: 2 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.FORBIDDEN);

      // Verify that no plan version was persisted in the database
      const versionCount = await h.prisma.programmePlanVersion.count({
        where: { programmeMasterId: master.id },
      });
      expect(versionCount).toBe(0);

      const commandCount = await h.prisma.programmePlanningCommand.count({
        where: { commandId: 'cmd-mcp-mutation-blocked' },
      });
      expect(commandCount).toBe(0);
    });
  });

  describe('Query Isolation (Section 8, Test 24)', () => {
    it('24a. GET /api/programme-planning/masters returns only authorized masters and does not leak unauthorized ones', async () => {
      const year = await setupYear();
      const masterA = await createMasterDirect(year.id, 'GDDP', 10);
      const masterB = await createMasterDirect(year.id, 'GDDP', 11);

      const coord = await h.actor({
        grants: [{ capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: masterA.id }],
      });

      const listRes = await coord.agent.get(`/api/programme-planning/masters?academicYearId=${year.id}`);
      expect(listRes.status).toBe(HttpStatus.OK);
      expect(Array.isArray(listRes.body)).toBe(true);

      const ids = listRes.body.map((m: { id: string }) => m.id);
      expect(ids).toContain(masterA.id);
      expect(ids).not.toContain(masterB.id);
    });

    it('24b. GET /api/programme-planning/masters/:masterId/occurrences rejects unauthorized master with 403', async () => {
      const year = await setupYear();
      const masterA = await createMasterDirect(year.id, 'GDDP', 10);
      const masterB = await createMasterDirect(year.id, 'GDDP', 11);

      const coord = await h.actor({
        grants: [{ capabilityKey: 'GDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: masterA.id }],
      });

      const occRes = await coord.agent.get(`/api/programme-planning/masters/${masterB.id}/occurrences`);
      expect(occRes.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('Persisted Denial Audit Evidence (Section 9, Test 31)', () => {
    it('31. Real HTTP denial persists AuditEvent with exact context and zero sensitive credentials', async () => {
      const year = await setupYear();
      const master = await createMasterDirect(year.id, 'GDDP', 10);
      const unauthorizedActor = await h.actor();

      const mutateRes = await unauthorizedActor.agent
        .post(`/api/programme-planning/masters/${master.id}/plan-versions`)
        .set('Origin', testOrigin)
        .send({
          programmeMasterId: master.id,
          commandId: 'cmd-denial-audit-check',
          initialTopics: [{ sequence: 1, title: 'Hack', requiredPeriods: 1 }],
        });
      expect(mutateRes.status).toBe(HttpStatus.FORBIDDEN);

      const audit = await h.prisma.auditEvent.findFirst({
        where: {
          actorUserId: unauthorizedActor.id,
          action: 'AUTHORIZATION_DENIED',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(audit).toBeDefined();
      expect(audit?.result).toBe('DENIED');
      expect(audit?.entityType).toBe('CapabilityDefinition');
      expect(audit?.entityId).toBe('GDDP_COORDINATOR');

      const meta = audit?.metadata as Record<string, unknown>;
      expect(meta).toBeDefined();
      expect(meta.resourceId).toBe(master.id);
      expect(meta.capabilityKey).toBe('GDDP_COORDINATOR');
      expect(meta.scope).toBe('ACTIVITY');

      // Verify no sensitive keys exist anywhere in metadata
      const metaStr = JSON.stringify(meta).toLowerCase();
      expect(metaStr).not.toContain('password');
      expect(metaStr).not.toContain('passwordhash');
      expect(metaStr).not.toContain('token');
      expect(metaStr).not.toContain('cookie');
      expect(metaStr).not.toContain('secret');
      expect(metaStr).not.toContain('credential');
      expect(metaStr).not.toContain('database');
    });
  });
});
