import { HttpStatus } from '@nestjs/common';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

integration('Programme Coordinator Authorization (PostgreSQL integration)', () => {
  const h = new Phase01Harness();

  async function clean(): Promise<void> {
    await h.prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "programme_planning_commands",
        "planned_slot_staffing",
        "planned_occurrence_slots",
        "planned_programme_occurrences",
        "programme_topic_items",
        "programme_plan_versions",
        "programme_masters"
      CASCADE;
    `);
    await h.clean();
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
      { key: 'CAPABILITY_GRANT', scopes: ['SCHOOL_WIDE'] },
      { key: 'AI_ACTIVE_USE_ACTIVITY', scopes: ['ACTIVITY'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'SPECIAL_ACTIVITY_MANAGE', scopes: ['SCHOOL_WIDE'] },
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

    // 2. Admin issues GDDDP_COORDINATOR grant for masterId to coordinator
    const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const coordinator = await h.actor();
    const wrongActor = await h.actor();

    const grantRes = await admin.agent
      .post(`/api/users/${coordinator.id}/capability-grants`)
      .set('Origin', testOrigin)
      .send({
        capabilityKey: 'GDDDP_COORDINATOR',
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
    it('25. GDDDP_COORDINATOR grant creation rejects nonexistent resource with 404', async () => {
      const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
      const targetUser = await h.actor();

      const res = await admin.agent
        .post(`/api/users/${targetUser.id}/capability-grants`)
        .set('Origin', testOrigin)
        .send({
          capabilityKey: 'GDDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: crypto.randomUUID(),
        });
      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('26. GDDDP_COORDINATOR grant creation rejects HDTN_HN master with 409', async () => {
      const year = await setupYear();
      const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
      const targetUser = await h.actor();

      // Create HDTN_HN master
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
          capabilityKey: 'GDDDP_COORDINATOR',
          scopeType: 'ACTIVITY',
          scopeResourceId: hdtnMaster.id,
        });
      expect(res.status).toBe(HttpStatus.CONFLICT);
    });

    it('27. HĐTN_COORDINATOR grant creation rejects GDDP master with 409', async () => {
      const year = await setupYear();
      const admin = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
      const targetUser = await h.actor();

      // Create GDDP master
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
          capabilityKey: 'GDDDP_COORDINATOR',
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
        grants: [{ capabilityKey: 'GDDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: crypto.randomUUID() }],
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
});
