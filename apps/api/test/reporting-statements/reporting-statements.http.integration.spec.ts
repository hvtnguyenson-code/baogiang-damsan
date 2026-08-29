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
  let reader: { agent: Agent; id: string };
  let approver: { agent: Agent; id: string };
  let academicYearId: string;
  let subjectA: string;
  let subjectB: string;

  async function seedSubmittedRevision() {
    return prisma.$transaction(tx => repository.persistSubmittedRevision(tx, {
      series: { statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE, submitterUserId: owner.id, academicYearId, fromCivilDate: new Date('2026-08-01'), toCivilDate: new Date('2026-08-31') },
      frozen: frozen(owner.id, academicYearId, [subjectA, subjectB]),
      lifecycleToken: crypto.randomUUID(),
      command: { actorUserId: owner.id, requestKey: crypto.randomUUID(), requestFingerprint: crypto.randomUUID() },
      history: { actorUserId: owner.id },
    }));
  }

  beforeAll(async () => {
    await harness.start();
    prisma = harness.prisma;
  });

  beforeEach(async () => {
    await harness.clean();
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
    reader = await harness.actor({ grants: [{ capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SUBJECT', scopeResourceId: subjectA }] });
    approver = await harness.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL' }] });
  });

  afterAll(async () => harness.stop());

  it('denies every Statement route without an authenticated session', async () => {
    const server = harness.app.getHttpServer();
    const revisionId = crypto.randomUUID();
    const submit = { academicYearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'unauthenticated' };
    expect((await request(server).post('/api/reporting-statements').set('Origin', testOrigin).send(submit)).status).toBe(401);
    expect((await request(server).get(`/api/reporting-statements/${revisionId}`)).status).toBe(401);
    expect((await request(server).post(`/api/reporting-statements/${revisionId}/approve`).set('Origin', testOrigin).send({ expectedLifecycleToken: crypto.randomUUID(), requestKey: 'unauthenticated' })).status).toBe(401);
    expect((await request(server).post(`/api/reporting-statements/${revisionId}/reject`).set('Origin', testOrigin).send({ expectedLifecycleToken: crypto.randomUUID(), requestKey: 'unauthenticated' })).status).toBe(401);
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
    const schoolClass = await prisma.schoolClass.create({ data: { academicYearId, code: `C${crypto.randomUUID().slice(0, 6)}`, name: 'Class', gradeLevel: 10 } });
    await prisma.teachingAssignment.create({ data: { academicYearId, schoolClassId: schoolClass.id, subjectId: subjectB, teacherUserId: reader.id, validFrom: new Date('2026-08-01') } });
    expect((await reader.agent.get(`/api/reporting-statements/${seeded.revision.id}`)).status).toBe(403);
    await prisma.capabilityGrant.create({ data: { userId: reader.id, capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SUBJECT', scopeResourceId: subjectB, validFrom: new Date(Date.now() - 1_000) } });
    expect((await reader.agent.get(`/api/reporting-statements/${seeded.revision.id}`)).status).toBe(200);
  });
});
