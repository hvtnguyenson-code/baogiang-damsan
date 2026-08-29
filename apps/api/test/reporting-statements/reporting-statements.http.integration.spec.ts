import { AuditResult, PrismaClient, ReportingStatementLifecycleState as State } from '@prisma/client';
import request, { Agent } from 'supertest';
import { freezeReportingStatementSnapshot } from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';
import { ReportingStatementRepository } from '../../src/reporting-statement-internal/reporting-statement.repository';
import { PERSONAL_REPORTING_STATEMENT_PROFILE } from '../../src/reporting-statements/reporting-statement.policy';
import { Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';

const asOf = new Date('2026-08-24T01:02:03.004Z');

function frozen(ownerId: string, academicYearId: string, subjectIds: string[]) {
  return freezeReportingStatementSnapshot({
    statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE,
    submitterUserId: ownerId,
    asOfInstant: asOf,
    projection: {
      profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1',
      scope: { academicYearId, targetUserId: ownerId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', asOfInstant: asOf },
      responsibilityState: 'RESPONSIBILITY_PRESENT',
      status: 'PASS',
      counts: { distributedElapsedCount: 0, completedCount: 0, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 0 },
      responsibilityManifest: subjectIds.map((subjectId, index) => ({ teachingAssignmentId: `assignment-${index}`, schoolClassId: `class-${index}`, subjectId, validFrom: '2026-08-01', validUntil: null })),
      sections: [],
      findings: [],
      evaluatedAt: asOf.toISOString(),
    } as never,
  });
}

integration('Reporting Statement HTTP security boundary (isolated PostgreSQL)', () => {
  const harness = new Phase01Harness();
  const repository = new ReportingStatementRepository();
  let prisma: PrismaClient;
  let owner: { agent: Agent; id: string };
  let otherTeacher: { agent: Agent; id: string };
  let reader: { agent: Agent; id: string };
  let approver: { agent: Agent; id: string };
  let academicYearId: string;
  let subjectA: string;
  let subjectB: string;
  let seededSeriesIds: string[] = [];

  async function seedSubmittedRevision(submitterId = owner.id, subjects = [subjectA, subjectB]) {
    const persisted = await prisma.$transaction(tx => repository.persistSubmittedRevision(tx, {
      series: { statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE, submitterUserId: submitterId, academicYearId, fromCivilDate: new Date('2026-08-01'), toCivilDate: new Date('2026-08-31') },
      frozen: frozen(submitterId, academicYearId, subjects),
      lifecycleToken: crypto.randomUUID(),
      command: { actorUserId: submitterId, requestKey: crypto.randomUUID(), requestFingerprint: crypto.randomUUID() },
      history: { actorUserId: submitterId },
    }));
    seededSeriesIds.push(persisted.series.id);
    return persisted;
  }

  async function cleanupSeededReportingStatements() {
    if (!seededSeriesIds.length) return;
    const revisionIds = (await prisma.reportingStatementRevision.findMany({ where: { seriesId: { in: seededSeriesIds } }, select: { id: true } })).map(({ id }) => id);
    await prisma.reportingStatementHistory.deleteMany({ where: { seriesId: { in: seededSeriesIds } } });
    await prisma.reportingStatementCommand.deleteMany({ where: { seriesId: { in: seededSeriesIds } } });
    if (revisionIds.length) {
      await prisma.reportingStatementRevisionSubject.deleteMany({ where: { revisionId: { in: revisionIds } } });
      await prisma.reportingStatementRevisionState.deleteMany({ where: { revisionId: { in: revisionIds } } });
      await prisma.reportingStatementRevision.updateMany({ where: { id: { in: revisionIds } }, data: { predecessorRevisionId: null, supersedesRevisionId: null } });
      await prisma.reportingStatementRevision.deleteMany({ where: { id: { in: revisionIds } } });
    }
    await prisma.reportingStatementSeries.deleteMany({ where: { id: { in: seededSeriesIds } } });
    seededSeriesIds = [];
  }

  beforeAll(async () => {
    await harness.start();
    prisma = harness.prisma;
  });

  beforeEach(async () => {
    await harness.clean();
    seededSeriesIds = [];
    await harness.seedCapabilities([
      { key: 'REPORTING_STATEMENT_SUBMIT', scopes: ['PERSONAL'] },
      { key: 'REPORTING_STATEMENT_READ', scopes: ['PERSONAL', 'SUBJECT', 'SCHOOL_WIDE'] },
      { key: 'APPROVAL_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
      { key: 'APPROVAL_VICE_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
    ]);
    academicYearId = (await prisma.academicYear.create({ data: { code: `Y${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'Year' } })).id;
    subjectA = (await prisma.subject.create({ data: { code: `A${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'A' } })).id;
    subjectB = (await prisma.subject.create({ data: { code: `B${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'B' } })).id;
    owner = await harness.actor({ grants: [{ capabilityKey: 'REPORTING_STATEMENT_SUBMIT', scopeType: 'PERSONAL' }, { capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'PERSONAL' }] });
    otherTeacher = await harness.actor({ grants: [{ capabilityKey: 'REPORTING_STATEMENT_SUBMIT', scopeType: 'PERSONAL' }, { capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'PERSONAL' }] });
    reader = await harness.actor({ grants: [{ capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SUBJECT', scopeResourceId: subjectA }] });
    approver = await harness.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL', scopeType: 'SCHOOL_WIDE' }, { capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SCHOOL_WIDE' }] });
  });

  afterEach(async () => cleanupSeededReportingStatements());

  afterAll(async () => {
    try {
      await cleanupSeededReportingStatements();
    } finally {
      await harness.stop();
    }
  });

  it('denies every Statement route without an authenticated session', async () => {
    const server = harness.app.getHttpServer();
    const revisionId = crypto.randomUUID();
    const preview = { academicYearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31' };
    const submit = { academicYearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'unauthenticated' };

    expect((await request(server).post('/api/reporting-statements/preview').send(preview)).status).toBe(401);
    expect((await request(server).get('/api/reporting-statements/mine')).status).toBe(401);
    expect((await request(server).get('/api/reporting-statements/accessible')).status).toBe(401);
    expect((await request(server).get('/api/reporting-statements/pending-decision')).status).toBe(401);
    expect((await request(server).post('/api/reporting-statements').set('Origin', testOrigin).send(submit)).status).toBe(401);
    expect((await request(server).get(`/api/reporting-statements/${revisionId}`)).status).toBe(401);
    expect((await request(server).post(`/api/reporting-statements/${revisionId}/approve`).set('Origin', testOrigin).send({ expectedLifecycleToken: crypto.randomUUID(), requestKey: 'unauthenticated' })).status).toBe(401);
    expect((await request(server).post(`/api/reporting-statements/${revisionId}/reject`).set('Origin', testOrigin).send({ expectedLifecycleToken: crypto.randomUUID(), requestKey: 'unauthenticated' })).status).toBe(401);
  });

  it('validates preview DTO and forbids non-whitelisted fields', async () => {
    const validPreview = { academicYearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31' };

    expect((await owner.agent.post('/api/reporting-statements/preview').send({ ...validPreview, academicYearId: 'not-a-uuid' })).status).toBe(400);
    expect((await owner.agent.post('/api/reporting-statements/preview').send({ ...validPreview, fromCivilDate: '2026-08-32' })).status).toBe(400);
    expect((await owner.agent.post('/api/reporting-statements/preview').send({ ...validPreview, fromCivilDate: '2026-08-31', toCivilDate: '2026-08-01' })).status).toBe(400);

    // Forbid non-whitelisted parameters
    expect((await owner.agent.post('/api/reporting-statements/preview').send({ ...validPreview, targetUserId: otherTeacher.id })).status).toBe(400);
    expect((await owner.agent.post('/api/reporting-statements/preview').send({ ...validPreview, roots: [{ schoolClassId: 'c', subjectId: 's' }] })).status).toBe(400);
    expect((await owner.agent.post('/api/reporting-statements/preview').send({ ...validPreview, asOfInstant: '2026-08-01T00:00:00.000Z' })).status).toBe(400);
    expect((await owner.agent.post('/api/reporting-statements/preview').send({ ...validPreview, requestKey: 'key-1' })).status).toBe(400);
  });

  it('denies preview without REPORTING_STATEMENT_SUBMIT/PERSONAL capability', async () => {
    const validPreview = { academicYearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31' };
    expect((await reader.agent.post('/api/reporting-statements/preview').send(validPreview)).status).toBe(403);
  });

  it('evaluates real preview ZERO_RESPONSIBILITY and proves zero persistence', async () => {
    const validPreview = { academicYearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31' };

    const seriesCountBefore = await prisma.reportingStatementSeries.count();
    const revisionCountBefore = await prisma.reportingStatementRevision.count();
    const commandCountBefore = await prisma.reportingStatementCommand.count();
    const historyCountBefore = await prisma.reportingStatementHistory.count();

    const response = await owner.agent.post('/api/reporting-statements/preview').send(validPreview);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'PASS',
      responsibilityState: 'ZERO_RESPONSIBILITY',
      eligibleForSubmission: false,
      responsibilityManifest: [],
      sections: [],
      findings: [],
    });

    expect(await prisma.reportingStatementSeries.count()).toBe(seriesCountBefore);
    expect(await prisma.reportingStatementRevision.count()).toBe(revisionCountBefore);
    expect(await prisma.reportingStatementCommand.count()).toBe(commandCountBefore);
    expect(await prisma.reportingStatementHistory.count()).toBe(historyCountBefore);
  });

  it('proves submit recomputes projection independently and does not reuse stale preview (Correction B)', async () => {
    const validPreview = { academicYearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31' };

    // 1. Initial State A: Teacher has 0 assignments (ZERO_RESPONSIBILITY)
    const previewA = await owner.agent.post('/api/reporting-statements/preview').send(validPreview);
    expect(previewA.status).toBe(200);
    expect(previewA.body.responsibilityState).toBe('ZERO_RESPONSIBILITY');
    expect(previewA.body.eligibleForSubmission).toBe(false);

    // 2. Upstream mutation to State B: Teacher is assigned subject A in a class
    const schoolClass = await prisma.schoolClass.create({
      data: { academicYearId, code: `C${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'Class 1', gradeLevel: 10 },
    });
    await prisma.teachingAssignment.create({
      data: { academicYearId, schoolClassId: schoolClass.id, subjectId: subjectA, teacherUserId: owner.id, validFrom: new Date('2026-08-01') },
    });

    // 3. Official submit
    const submitPayload = {
      academicYearId,
      fromCivilDate: '2026-08-01',
      toCivilDate: '2026-08-31',
      requestKey: crypto.randomUUID(),
    };
    const submitRes = await owner.agent.post('/api/reporting-statements').set('Origin', testOrigin).send(submitPayload);
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.lifecycleState).toBe('SUBMITTED');

    // 4. Read frozen statement from DB
    const detailRes = await owner.agent.get(`/api/reporting-statements/${submitRes.body.revisionId}`);
    expect(detailRes.status).toBe(200);

    // 5. Prove frozen statement reflects State B (responsibility present with subject A), NOT stale preview A (zero responsibility)
    expect(detailRes.body.frozenSubjectIds).toEqual([subjectA]);
    expect(detailRes.body.responsibilityManifest).toHaveLength(1);
    expect(detailRes.body.responsibilityManifest[0]).toMatchObject({
      subjectId: subjectA,
      schoolClassId: schoolClass.id,
    });
    expect(detailRes.body.sections).toHaveLength(1);
    expect(detailRes.body.sections[0]).toMatchObject({
      subjectId: subjectA,
      schoolClassId: schoolClass.id,
    });
  });

  it('enforces discovery authorization for /mine, /accessible, and /pending-decision (Correction E)', async () => {
    const revOwner = await seedSubmittedRevision(owner.id, [subjectA, subjectB]);
    const revOther = await seedSubmittedRevision(otherTeacher.id, [subjectA, subjectB]);

    // /mine: owner sees only revOwner, not revOther
    const mineRes = await owner.agent.get('/api/reporting-statements/mine');
    expect(mineRes.status).toBe(200);
    expect(mineRes.body.total).toBe(1);
    expect(mineRes.body.items[0].revisionId).toBe(revOwner.revision.id);

    // /mine without capability -> 403
    expect((await reader.agent.get('/api/reporting-statements/mine')).status).toBe(403);

    // /accessible: reader with only subject A grant does NOT see revOwner (frozen subjects A+B)
    const accessiblePartial = await reader.agent.get('/api/reporting-statements/accessible');
    expect(accessiblePartial.status).toBe(200);
    expect(accessiblePartial.body.total).toBe(0);

    // Grant subject B to reader -> reader now sees revOwner and revOther
    await prisma.capabilityGrant.create({
      data: { userId: reader.id, capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SUBJECT', scopeResourceId: subjectB, validFrom: new Date(Date.now() - 1_000) },
    });
    const accessibleFull = await reader.agent.get('/api/reporting-statements/accessible');
    expect(accessibleFull.status).toBe(200);
    expect(accessibleFull.body.total).toBe(2);

    // /pending-decision: non-approver -> 403
    expect((await reader.agent.get('/api/reporting-statements/pending-decision')).status).toBe(403);

    // Approver sees SUBMITTED non-owner revisions
    const pendingRes = await approver.agent.get('/api/reporting-statements/pending-decision');
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.total).toBe(2);

    // If approver submits their own revision, it is EXCLUDED from approver's /pending-decision
    const revApprover = await seedSubmittedRevision(approver.id, [subjectA]);
    const pendingAfterSelf = await approver.agent.get('/api/reporting-statements/pending-decision');
    expect(pendingAfterSelf.body.total).toBe(2);
    expect(pendingAfterSelf.body.items.some((i: { revisionId: string }) => i.revisionId === revApprover.revision.id)).toBe(false);

    // Approve revOwner -> disappears from /pending-decision
    const approveRes = await approver.agent.post(`/api/reporting-statements/${revOwner.revision.id}/approve`).set('Origin', testOrigin).send({
      expectedLifecycleToken: revOwner.state.lifecycleToken,
      requestKey: crypto.randomUUID(),
    });
    expect(approveRes.status).toBe(201);
    const pendingAfterApprove = await approver.agent.get('/api/reporting-statements/pending-decision');
    expect(pendingAfterApprove.body.total).toBe(1);
    expect(pendingAfterApprove.body.items[0].revisionId).toBe(revOther.revision.id);
  });

  it('validates detail response contract and prevents internal leakage (Correction F)', async () => {
    const seeded = await seedSubmittedRevision(owner.id, [subjectA, subjectB]);

    const res = await owner.agent.get(`/api/reporting-statements/${seeded.revision.id}`);
    expect(res.status).toBe(200);

    // Public presentation fields exist
    expect(res.body).toMatchObject({
      revisionId: seeded.revision.id,
      seriesId: seeded.series.id,
      statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE,
      submitterUserId: owner.id,
      academicYearId,
      lifecycleState: 'SUBMITTED',
      counts: expect.any(Object),
      sections: expect.any(Array),
      frozenSubjectIds: [subjectA, subjectB].sort(),
      allowedActions: [], // Owner cannot approve own revision
    });

    // Never leak raw internal/persistence structures
    expect(res.body).not.toHaveProperty('canonicalSnapshotJson');
    expect(res.body).not.toHaveProperty('requestFingerprint');
    expect(res.body).not.toHaveProperty('requestKey');
    expect(res.body).not.toHaveProperty('commandId');

    // Approver sees allowedActions = ['APPROVE', 'REJECT']
    const approverRead = await approver.agent.get(`/api/reporting-statements/${seeded.revision.id}`);
    expect(approverRead.status).toBe(200);
    expect(approverRead.body.allowedActions).toEqual(['APPROVE', 'REJECT']);
  });

  it('validates pagination query parameters (Correction G)', async () => {
    expect((await owner.agent.get('/api/reporting-statements/mine?page=0')).status).toBe(400);
    expect((await owner.agent.get('/api/reporting-statements/mine?pageSize=0')).status).toBe(400);
    expect((await owner.agent.get('/api/reporting-statements/mine?pageSize=101')).status).toBe(400);
    expect((await owner.agent.get('/api/reporting-statements/mine?page=abc')).status).toBe(400);
    expect((await owner.agent.get('/api/reporting-statements/mine?pageSize=abc')).status).toBe(400);

    const validPage = await owner.agent.get('/api/reporting-statements/mine?page=1&pageSize=10');
    expect(validPage.status).toBe(200);
    expect(validPage.body.page).toBe(1);
    expect(validPage.body.pageSize).toBe(10);
  });

  it('enforces CSRF before submit and decision mutations, while historical GET has no Origin requirement', async () => {
    const seeded = await seedSubmittedRevision();
    const lifecycleToken = seeded.state.lifecycleToken;
    const submit = { academicYearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'csrf-submit' };
    expect((await owner.agent.post('/api/reporting-statements').send(submit)).status).toBe(403);
    expect((await approver.agent.post(`/api/reporting-statements/${seeded.revision.id}/approve`).send({ expectedLifecycleToken: lifecycleToken, requestKey: 'csrf-approve' })).status).toBe(403);
    expect((await approver.agent.post(`/api/reporting-statements/${seeded.revision.id}/reject`).send({ expectedLifecycleToken: lifecycleToken, requestKey: 'csrf-reject' })).status).toBe(403);
    expect(await prisma.reportingStatementRevision.count()).toBe(1);
    expect(await prisma.reportingStatementCommand.count({ where: { commandType: { in: ['APPROVE', 'REJECT'] } } })).toBe(0);
    expect(await prisma.reportingStatementHistory.count({ where: { revisionId: seeded.revision.id, eventType: { in: ['APPROVED', 'REJECTED'] } } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { entityId: seeded.revision.id, action: 'REPORTING_STATEMENT_REJECTED', result: AuditResult.SUCCESS } })).toBe(0);
    expect(await prisma.reportingStatementRevisionState.findUniqueOrThrow({ where: { revisionId: seeded.revision.id } })).toMatchObject({ lifecycleState: State.SUBMITTED, lifecycleToken });
    await prisma.capabilityGrant.create({ data: { userId: reader.id, capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SUBJECT', scopeResourceId: subjectB, validFrom: new Date(Date.now() - 1_000) } });
    expect((await reader.agent.get(`/api/reporting-statements/${seeded.revision.id}`)).status).toBe(200);
    expect((await owner.agent.post('/api/reporting-statements').set('Origin', testOrigin).send({ ...submit, fromCivilDate: 'invalid-date' })).status).toBe(400);
    expect((await approver.agent.post(`/api/reporting-statements/not-a-uuid/approve`).set('Origin', testOrigin).send({ expectedLifecycleToken: crypto.randomUUID(), requestKey: 'valid-origin' })).status).toBe(400);
  });

  it('rejects malformed UUIDs and DTO input before service semantics', async () => {
    const seeded = await seedSubmittedRevision();
    const invalidSubmitBodies = [
      { academicYearId: 'not-a-uuid', fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'bad-id' },
      { academicYearId, fromCivilDate: '2026-08-32', toCivilDate: '2026-08-31', requestKey: 'bad-date' },
      { academicYearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: '   ' },
      { academicYearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'x'.repeat(201) },
      { academicYearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'as-of', asOfInstant: '2000-01-01T00:00:00.000Z' },
    ];
    for (const body of invalidSubmitBodies) expect((await owner.agent.post('/api/reporting-statements').set('Origin', testOrigin).send(body)).status).toBe(400);
    for (const route of ['GET', 'APPROVE', 'REJECT'] as const) {
      const response = route === 'GET'
        ? await owner.agent.get('/api/reporting-statements/not-a-uuid')
        : await approver.agent.post(`/api/reporting-statements/not-a-uuid/${route.toLowerCase()}`).set('Origin', testOrigin).send({ expectedLifecycleToken: crypto.randomUUID(), requestKey: 'bad-route' });
      expect(response.status).toBe(400);
    }
    for (const body of [{ expectedLifecycleToken: 'not-a-uuid', requestKey: 'bad-token' }, { expectedLifecycleToken: crypto.randomUUID(), requestKey: '   ' }, { expectedLifecycleToken: crypto.randomUUID(), requestKey: 'x'.repeat(201) }]) {
      expect((await approver.agent.post(`/api/reporting-statements/${seeded.revision.id}/approve`).set('Origin', testOrigin).send(body)).status).toBe(400);
    }
    expect(await prisma.reportingStatementCommand.count({ where: { commandType: { in: ['APPROVE', 'REJECT'] } } })).toBe(0);
    expect(await prisma.reportingStatementRevisionState.findUniqueOrThrow({ where: { revisionId: seeded.revision.id } })).toMatchObject({ lifecycleState: State.SUBMITTED });
  });

  it('uses the persisted frozen subject set, never current teaching assignment, for non-owner reads', async () => {
    const seeded = await seedSubmittedRevision();
    const schoolClass = await prisma.schoolClass.create({ data: { academicYearId, code: `C${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'Class', gradeLevel: 10 } });
    await prisma.teachingAssignment.create({ data: { academicYearId, schoolClassId: schoolClass.id, subjectId: subjectB, teacherUserId: reader.id, validFrom: new Date('2026-08-01') } });
    expect((await reader.agent.get(`/api/reporting-statements/${seeded.revision.id}`)).status).toBe(403);
    await prisma.capabilityGrant.create({ data: { userId: reader.id, capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SUBJECT', scopeResourceId: subjectB, validFrom: new Date(Date.now() - 1_000) } });
    expect((await reader.agent.get(`/api/reporting-statements/${seeded.revision.id}`)).status).toBe(200);
  });
});
