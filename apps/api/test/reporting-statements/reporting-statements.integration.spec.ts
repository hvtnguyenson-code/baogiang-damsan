import { AuditResult, PrismaClient, ReportingStatementLifecycleState as State, UserStatus } from '@prisma/client';
import { AuditService } from '../../src/audit/audit.service';
import { ReportingStatementsService } from '../../src/reporting-statements/reporting-statements.service';
import { PERSONAL_REPORTING_STATEMENT_PROFILE } from '../../src/reporting-statements/reporting-statement.policy';
import { ReportingStatementRepository } from '../../src/reporting-statement-internal/reporting-statement.repository';
import {
  REPORTING_STATEMENT_SNAPSHOT_V1,
  REPORTING_STATEMENT_SNAPSHOT_V2,
  REPORTING_STATEMENT_SERIALIZER_V1,
  freezeReportingStatementSnapshot,
  freezeReportingStatementSnapshotV1,
} from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';
import { BusinessConfigurationService } from '../../src/business-configuration/business-configuration.service';
import { PRODUCTION_BUSINESS_POLICY_FAMILIES } from '../../src/business-configuration/business-policy-registry';
import { presentReportingStatementDetail } from '../../src/reporting-statements/reporting-statement.presenter';
import { integration, testDatabaseUrl } from '../helpers/phase01-test-harness';

const asOf = new Date('2026-08-24T01:02:03.004Z');
const personalProjection = (subjectId: string, userId: string, yearId: string, projectionAsOf = asOf) => ({
  profile: 'PERSONAL_TEACHING_REPORTING_PROJECTION_V1',
  scope: { academicYearId: yearId, targetUserId: userId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', asOfInstant: projectionAsOf },
  responsibilityState: 'RESPONSIBILITY_PRESENT',
  status: 'PASS',
  counts: { distributedElapsedCount: 1, completedCount: 1, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 0 },
  responsibilityManifest: [{ teachingAssignmentId: 'a', schoolClassId: 'c', subjectId, validFrom: '2026-08-01', validUntil: null }],
  sections: [],
  findings: [],
  evaluatedAt: projectionAsOf.toISOString(),
});

integration('Reporting Statements control-plane PostgreSQL', () => {
  const repository = new ReportingStatementRepository();
  const projection = { resolveInTransaction: jest.fn() };
  let prisma: PrismaClient;
  let submitter = '';
  let approver = '';
  let subject = '';
  let year = '';
  let service: ReportingStatementsService;
  let businessConfiguration: BusinessConfigurationService;
  let operationalPolicyVersionId = '';
  let policyStreamId = '';

  const frozen = (subjectId: string, userId: string, yearId: string, policyVersionId = operationalPolicyVersionId || 'policy-v1') =>
    freezeReportingStatementSnapshot({
      statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE,
      submitterUserId: userId,
      asOfInstant: asOf,
      operationalStartPolicyVersionId: policyVersionId,
      operationalStartDate: '2026-08-15',
      projection: personalProjection(subjectId, userId, yearId) as never,
    });

  const request = (id: string) => ({ auth: { user: { id, mustChangePassword: false } }, headers: {} }) as never;

  const cleanupReportingStatements = async () => {
    await prisma.reportingStatementHistory.deleteMany();
    await prisma.reportingStatementCommand.deleteMany();
    await prisma.reportingStatementRevisionSubject.deleteMany();
    await prisma.reportingStatementRevisionState.deleteMany();
    await prisma.reportingStatementRevision.updateMany({ data: { predecessorRevisionId: null, supersedesRevisionId: null } });
    await prisma.reportingStatementRevision.deleteMany();
    await prisma.reportingStatementSeries.deleteMany();
  };

  const cleanupFixtureParents = async () => {
    const userIds = [submitter, approver].filter(Boolean);
    if (userIds.length) await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
    if (year) {
      const streams = await prisma.businessPolicyStream.findMany({ where: { academicYearId: year } });
      const streamIds = streams.map(s => s.id);
      if (streamIds.length) {
        await prisma.businessPolicyVersion.deleteMany({ where: { streamId: { in: streamIds } } });
        await prisma.businessPolicyStream.deleteMany({ where: { id: { in: streamIds } } });
      }
      await prisma.academicCalendarVersion.deleteMany({ where: { academicYearId: year } });
      await prisma.teachingAssignment.deleteMany({ where: { academicYearId: year } });
      await prisma.schoolClass.deleteMany({ where: { academicYearId: year } });
    }
    if (subject) await prisma.subject.delete({ where: { id: subject } });
    if (year) await prisma.academicYear.delete({ where: { id: year } });
    if (userIds.length) {
      await prisma.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    submitter = '';
    approver = '';
    subject = '';
    year = '';
  };

  const seed = async (input: { predecessorRevisionId?: string; supersedesRevisionId?: string } = {}) =>
    prisma.$transaction(tx =>
      repository.persistSubmittedRevision(tx, {
        series: { statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE, submitterUserId: submitter, academicYearId: year, fromCivilDate: new Date('2026-08-01'), toCivilDate: new Date('2026-08-31') },
        frozen: frozen(subject, submitter, year),
        revision: input,
        lifecycleToken: crypto.randomUUID(),
        command: { actorUserId: submitter, requestKey: crypto.randomUUID(), requestFingerprint: crypto.randomUUID() },
        history: { actorUserId: submitter },
      }),
    );

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    const auth = { evaluate: jest.fn().mockResolvedValue({ allowed: true }) };
    const auditService = new AuditService(prisma as never);
    businessConfiguration = new BusinessConfigurationService(prisma as never, auditService, PRODUCTION_BUSINESS_POLICY_FAMILIES);
    service = new ReportingStatementsService(
      prisma as never,
      repository,
      projection as never,
      auth as never,
      auditService,
      businessConfiguration,
      { now: jest.fn(() => asOf) },
    );
  });

  beforeEach(async () => {
    projection.resolveInTransaction.mockReset();
    await cleanupReportingStatements();
    await prisma.auditEvent.deleteMany();
    submitter = (await prisma.user.create({ data: { username: `s-${crypto.randomUUID()}`, passwordHash: 'x', status: UserStatus.ACTIVE, mustChangePassword: false } })).id;
    approver = (await prisma.user.create({ data: { username: `a-${crypto.randomUUID()}`, passwordHash: 'x', status: UserStatus.ACTIVE, mustChangePassword: false } })).id;
    year = (await prisma.academicYear.create({ data: { code: `Y${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'Y' } })).id;
    subject = (await prisma.subject.create({ data: { code: `S${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'S' } })).id;

    // Minimum active calendar covering 2026-08-01 -> 2027-05-31
    await prisma.academicCalendarVersion.create({
      data: {
        academicYearId: year,
        versionNumber: 1,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2027-05-31T00:00:00.000Z'),
        officialWeekCount: 35,
        reserveWeekCount: 1,
        teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
        isActive: true,
        activatedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    // Minimum published OPERATIONAL_START policy version
    const stream = await prisma.businessPolicyStream.create({
      data: {
        familyKey: 'OPERATIONAL_START',
        resourceKind: 'ACADEMIC_YEAR',
        academicYearId: year,
      },
    });
    policyStreamId = stream.id;

    const pv = await prisma.businessPolicyVersion.create({
      data: {
        streamId: stream.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        payload: { operationalStartDate: '2026-08-15' },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        effectiveUntil: null,
        publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        publishedByUserId: approver,
        createdByUserId: approver,
      },
    });
    operationalPolicyVersionId = pv.id;
  });

  afterEach(async () => {
    await cleanupReportingStatements();
    await cleanupFixtureParents();
  });

  afterAll(async () => {
    await cleanupReportingStatements();
    await cleanupFixtureParents();
    await prisma.$disconnect();
  });

  it('rejects seeded submitted revision with command, history and audit', async () => {
    const seeded = await seed();
    const before = seeded.state.lifecycleToken;
    await service.decide(seeded.revision.id, { expectedLifecycleToken: before, requestKey: 'reject' }, request(approver), 'REJECT');
    const state = await prisma.reportingStatementRevisionState.findUnique({ where: { revisionId: seeded.revision.id } });
    expect(state?.lifecycleState).toBe(State.REJECTED);
    expect(state?.lifecycleToken).not.toBe(before);
    expect(await prisma.reportingStatementCommand.count({ where: { commandType: 'REJECT', requestKey: 'reject' } })).toBe(1);
    expect(await prisma.reportingStatementHistory.count({ where: { revisionId: seeded.revision.id, eventType: 'REJECTED' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'REPORTING_STATEMENT_REJECTED', result: AuditResult.SUCCESS } })).toBe(1);
  });

  it('rejects stale token without decision artifacts', async () => {
    const seeded = await seed();
    await expect(service.decide(seeded.revision.id, { expectedLifecycleToken: crypto.randomUUID(), requestKey: 'stale' }, request(approver), 'REJECT')).rejects.toThrow();
    const state = await prisma.reportingStatementRevisionState.findUnique({ where: { revisionId: seeded.revision.id } });
    expect(state?.lifecycleToken).toBe(seeded.state.lifecycleToken);
    expect(await prisma.reportingStatementCommand.count({ where: { commandType: 'REJECT' } })).toBe(0);
  });

  it.each(['APPROVE', 'REJECT'] as const)('denies self %s without accepted decision artifacts', async command => {
    const seeded = await seed();
    const eventType = command === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await expect(service.decide(seeded.revision.id, { expectedLifecycleToken: seeded.state.lifecycleToken, requestKey: `self-${command}` }, request(submitter), command)).rejects.toThrow();
    expect(await prisma.reportingStatementRevisionState.findUniqueOrThrow({ where: { revisionId: seeded.revision.id } })).toMatchObject({ lifecycleState: State.SUBMITTED, lifecycleToken: seeded.state.lifecycleToken });
    expect(await prisma.reportingStatementCommand.count({ where: { commandType: command } })).toBe(0);
    expect(await prisma.reportingStatementHistory.count({ where: { revisionId: seeded.revision.id, eventType } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { result: AuditResult.SUCCESS } })).toBe(0);
  });

  it('rejects a non-idempotent submit while the series has an unresolved SUBMITTED revision', async () => {
    const first = await seed();
    projection.resolveInTransaction.mockResolvedValue(personalProjection(subject, submitter, year));
    await expect(service.submit({ academicYearId: year, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'second-submit' }, request(submitter))).rejects.toThrow();
    expect(projection.resolveInTransaction).not.toHaveBeenCalled();
    expect(await prisma.reportingStatementSeries.count()).toBe(1);
    expect(await prisma.reportingStatementRevision.count()).toBe(1);
    expect(await prisma.reportingStatementRevisionState.findUniqueOrThrow({ where: { revisionId: first.revision.id } })).toMatchObject({ lifecycleState: State.SUBMITTED });
    expect(await prisma.reportingStatementCommand.count({ where: { commandType: 'SUBMIT' } })).toBe(1);
    expect(await prisma.reportingStatementHistory.count({ where: { eventType: 'SUBMITTED' } })).toBe(1);
  });

  it('replays an accepted submit without a second projection, clock pin, or revision', async () => {
    projection.resolveInTransaction.mockResolvedValue(personalProjection(subject, submitter, year));
    const dto = { academicYearId: year, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'exact-replay' };
    const first = await service.submit(dto, request(submitter));
    const replay = await service.submit(dto, request(submitter));
    expect(replay).toMatchObject({ replay: true, revisionId: first.revisionId, seriesId: first.seriesId, asOfInstant: first.asOfInstant });
    expect(projection.resolveInTransaction).toHaveBeenCalledTimes(1);
    expect(await prisma.reportingStatementRevision.count()).toBe(1);
    expect(await prisma.reportingStatementCommand.count({ where: { commandType: 'SUBMIT' } })).toBe(1);
    expect(await prisma.reportingStatementHistory.count({ where: { eventType: 'SUBMITTED' } })).toBe(1);
  });

  it('retains frozen submitter and history display evidence after a current profile rename', async () => {
    await prisma.staffProfile.create({ data: { userId: submitter, displayName: 'Tên ban đầu', staffCode: 'GV-01' } });
    projection.resolveInTransaction.mockResolvedValue(personalProjection(subject, submitter, year));
    const submitted = await service.submit({ academicYearId: year, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'frozen-display' }, request(submitter));
    const before = await repository.readFrozenRevision(prisma, submitted.revisionId);
    await prisma.staffProfile.update({ where: { userId: submitter }, data: { displayName: 'Tên hiện tại', staffCode: 'GV-02' } });
    const current = await prisma.staffProfile.findUniqueOrThrow({ where: { userId: submitter } });
    const after = await repository.readFrozenRevision(prisma, submitted.revisionId);
    const history = await prisma.reportingStatementHistory.findFirstOrThrow({ where: { revisionId: submitted.revisionId, eventType: 'SUBMITTED' } });
    expect(current).toMatchObject({ userId: submitter, displayName: 'Tên hiện tại', staffCode: 'GV-02' });
    expect(before).toMatchObject({ submitterDisplayNameSnapshot: 'Tên ban đầu', submitterStaffCodeSnapshot: 'GV-01' });
    expect(after).toMatchObject({ canonicalSnapshotJson: before?.canonicalSnapshotJson, semanticHash: before?.semanticHash, submitterDisplayNameSnapshot: 'Tên ban đầu', submitterStaffCodeSnapshot: 'GV-01' });
    expect(history).toMatchObject({ actorDisplayNameSnapshot: 'Tên ban đầu', actorStaffCodeSnapshot: 'GV-01' });
  });

  it('allows only one real concurrent genuinely-new submit into a logical series', async () => {
    projection.resolveInTransaction.mockResolvedValue(personalProjection(subject, submitter, year));
    const submit = (requestKey: string) => service.submit({ academicYearId: year, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey }, request(submitter));
    const outcomes = await Promise.allSettled([submit('concurrent-submit-a'), submit('concurrent-submit-b')]);
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(x => x.status === 'rejected')).toHaveLength(1);
    expect(await prisma.reportingStatementSeries.count()).toBe(1);
    expect(await prisma.reportingStatementRevision.count()).toBe(1);
    expect(await prisma.reportingStatementRevisionState.count({ where: { lifecycleState: State.SUBMITTED } })).toBe(1);
    expect(await prisma.reportingStatementCommand.count({ where: { commandType: 'SUBMIT' } })).toBe(1);
    expect(await prisma.reportingStatementHistory.count({ where: { eventType: 'SUBMITTED' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'REPORTING_STATEMENT_SUBMITTED', result: AuditResult.SUCCESS } })).toBe(1);
  });

  it('retains an approved predecessor and accepts only one real concurrent successor submit', async () => {
    const predecessor = await seed();
    await service.decide(predecessor.revision.id, { expectedLifecycleToken: predecessor.state.lifecycleToken, requestKey: 'approve-predecessor' }, request(approver), 'APPROVE');
    projection.resolveInTransaction.mockResolvedValue(personalProjection(subject, submitter, year));
    const submit = (requestKey: string) => service.submit({ academicYearId: year, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey }, request(submitter));
    const outcomes = await Promise.allSettled([submit('successor-submit-a'), submit('successor-submit-b')]);
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(x => x.status === 'rejected')).toHaveLength(1);
    const revisions = await prisma.reportingStatementRevision.findMany({ where: { seriesId: predecessor.series.id }, include: { state: true }, orderBy: { submittedAt: 'asc' } });
    expect(revisions).toHaveLength(2);
    expect(revisions[0]).toMatchObject({ id: predecessor.revision.id, state: { lifecycleState: State.APPROVED } });
    expect(revisions[1]).toMatchObject({ predecessorRevisionId: predecessor.revision.id, supersedesRevisionId: predecessor.revision.id, state: { lifecycleState: State.SUBMITTED } });
    expect(await prisma.reportingStatementCommand.count({ where: { commandType: 'SUBMIT' } })).toBe(2);
    expect(await prisma.reportingStatementHistory.count({ where: { eventType: 'SUBMITTED' } })).toBe(2);
    expect(await prisma.reportingStatementRevisionState.count({ where: { lifecycleState: State.SUBMITTED } })).toBe(1);
    expect(await prisma.reportingStatementRevisionState.count({ where: { lifecycleState: State.APPROVED } })).toBe(1);
  });

  it('creates a readable immutable successor after a rejected predecessor', async () => {
    const rejected = await seed();
    await service.decide(rejected.revision.id, { expectedLifecycleToken: rejected.state.lifecycleToken, requestKey: 'reject-predecessor' }, request(approver), 'REJECT');
    projection.resolveInTransaction.mockResolvedValue(personalProjection(subject, submitter, year));
    const successor = await service.submit({ academicYearId: year, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'resubmit-after-rejection' }, request(submitter));
    const old = await repository.readFrozenRevision(prisma, rejected.revision.id);
    const next = await repository.readFrozenRevision(prisma, successor.revisionId);
    expect(old).toMatchObject({ state: { lifecycleState: State.REJECTED } });
    expect(next).toMatchObject({ seriesId: rejected.series.id, predecessorRevisionId: rejected.revision.id, supersedesRevisionId: null, state: { lifecycleState: State.SUBMITTED } });
  });

  it('keeps a frozen revision byte-stable after a real teaching-assignment drift', async () => {
    const schoolClass = await prisma.schoolClass.create({ data: { academicYearId: year, code: `C${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'Class', gradeLevel: 10 } });
    const assignment = await prisma.teachingAssignment.create({ data: { academicYearId: year, schoolClassId: schoolClass.id, subjectId: subject, teacherUserId: submitter, validFrom: new Date('2026-08-01') } });
    const projectionForAssignment = personalProjection(subject, submitter, year);
    projectionForAssignment.responsibilityManifest[0] = { teachingAssignmentId: assignment.id, schoolClassId: schoolClass.id, subjectId: subject, validFrom: '2026-08-01', validUntil: null };
    const saved = await prisma.$transaction(tx => repository.persistSubmittedRevision(tx, {
      series: { statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE, submitterUserId: submitter, academicYearId: year, fromCivilDate: new Date('2026-08-01'), toCivilDate: new Date('2026-08-31') },
      frozen: freezeReportingStatementSnapshot({
        statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE,
        submitterUserId: submitter,
        asOfInstant: asOf,
        operationalStartPolicyVersionId: operationalPolicyVersionId,
        operationalStartDate: '2026-08-15',
        projection: projectionForAssignment as never,
      }),
      lifecycleToken: crypto.randomUUID(),
      command: { actorUserId: submitter, requestKey: 'assignment-drift', requestFingerprint: 'assignment-drift-fingerprint' },
      history: { actorUserId: submitter },
    }));
    const before = await repository.readFrozenRevision(prisma, saved.revision.id);
    await prisma.teachingAssignment.update({ where: { id: assignment.id }, data: { validUntil: new Date('2026-08-15') } });
    const after = await repository.readFrozenRevision(prisma, saved.revision.id);
    expect(await prisma.teachingAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).toMatchObject({ validUntil: new Date('2026-08-15') });
    expect(after).toMatchObject({ canonicalSnapshotJson: before?.canonicalSnapshotJson, semanticHash: before?.semanticHash, asOfInstant: before?.asOfInstant });
    expect(after?.subjects.map(item => item.subjectId)).toEqual(before?.subjects.map(item => item.subjectId));
  });

  it('allows exactly one real concurrent terminal decision', async () => {
    const seeded = await seed();
    const decide = (command: 'APPROVE' | 'REJECT', requestKey: string) => service.decide(seeded.revision.id, { expectedLifecycleToken: seeded.state.lifecycleToken, requestKey }, request(approver), command);
    const outcomes = await Promise.allSettled([decide('APPROVE', 'decision-approve'), decide('REJECT', 'decision-reject')]);
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(x => x.status === 'rejected')).toHaveLength(1);
    const state = await prisma.reportingStatementRevisionState.findUniqueOrThrow({ where: { revisionId: seeded.revision.id } });
    expect([State.APPROVED, State.REJECTED]).toContain(state.lifecycleState);
    expect(await prisma.reportingStatementCommand.count({ where: { commandType: { in: ['APPROVE', 'REJECT'] } } })).toBe(1);
    expect(await prisma.reportingStatementHistory.count({ where: { revisionId: seeded.revision.id, eventType: { in: ['APPROVED', 'REJECTED'] } } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { entityId: seeded.revision.id, result: AuditResult.SUCCESS, action: { in: ['REPORTING_STATEMENT_APPROVED', 'REPORTING_STATEMENT_REJECTED'] } } })).toBe(1);
  });

  it('atomically supersedes approved predecessor when correction is approved', async () => {
    const old = await seed();
    await service.decide(old.revision.id, { expectedLifecycleToken: old.state.lifecycleToken, requestKey: 'approve-old' }, request(approver), 'APPROVE');
    const oldApproved = await prisma.reportingStatementRevisionState.findUniqueOrThrow({ where: { revisionId: old.revision.id } });
    const successor = await seed({ predecessorRevisionId: old.revision.id, supersedesRevisionId: old.revision.id });
    await service.decide(successor.revision.id, { expectedLifecycleToken: successor.state.lifecycleToken, requestKey: 'approve-correction' }, request(approver), 'APPROVE');
    const oldState = await prisma.reportingStatementRevisionState.findUniqueOrThrow({ where: { revisionId: old.revision.id } });
    const successorState = await prisma.reportingStatementRevisionState.findUniqueOrThrow({ where: { revisionId: successor.revision.id } });
    expect(oldState.lifecycleState).toBe(State.SUPERSEDED);
    expect(successorState.lifecycleState).toBe(State.APPROVED);
    expect(oldState.lifecycleToken).not.toBe(oldApproved.lifecycleToken);
    expect(successorState.lifecycleToken).not.toBe(successor.state.lifecycleToken);
    const command = await prisma.reportingStatementCommand.findFirstOrThrow({ where: { commandType: 'APPROVE', requestKey: 'approve-correction' } });
    const histories = await prisma.reportingStatementHistory.findMany({ where: { commandId: command.id } });
    expect(histories).toHaveLength(2);
    expect(histories.find(x => x.eventType === 'SUPERSEDED')).toMatchObject({ revisionId: old.revision.id, causedByRevisionId: successor.revision.id });
    expect(histories.find(x => x.eventType === 'APPROVED')).toMatchObject({ revisionId: successor.revision.id });
    expect(await prisma.auditEvent.count({ where: { action: 'REPORTING_STATEMENT_APPROVED', entityId: successor.revision.id, result: AuditResult.SUCCESS } })).toBe(1);
    expect(projection.resolveInTransaction).not.toHaveBeenCalled();
  });

  it('rejects correction without changing approved predecessor', async () => {
    const old = await seed();
    await service.decide(old.revision.id, { expectedLifecycleToken: old.state.lifecycleToken, requestKey: 'approve-old' }, request(approver), 'APPROVE');
    const before = await prisma.reportingStatementRevisionState.findUniqueOrThrow({ where: { revisionId: old.revision.id } });
    const successor = await seed({ predecessorRevisionId: old.revision.id, supersedesRevisionId: old.revision.id });
    await service.decide(successor.revision.id, { expectedLifecycleToken: successor.state.lifecycleToken, requestKey: 'reject-correction' }, request(approver), 'REJECT');
    const oldState = await prisma.reportingStatementRevisionState.findUniqueOrThrow({ where: { revisionId: old.revision.id } });
    const successorState = await prisma.reportingStatementRevisionState.findUniqueOrThrow({ where: { revisionId: successor.revision.id } });
    expect(oldState.lifecycleState).toBe(State.APPROVED);
    expect(oldState.lifecycleToken).toBe(before.lifecycleToken);
    expect(successorState.lifecycleState).toBe(State.REJECTED);
    expect(await prisma.auditEvent.count({ where: { action: 'REPORTING_STATEMENT_REJECTED', entityId: successor.revision.id, result: AuditResult.SUCCESS } })).toBe(1);
    expect(projection.resolveInTransaction).not.toHaveBeenCalled();
  });

  // =========================================================================
  // CHECKPOINT 5 INTEGRATION SUITE (Items 30 - 34)
  // =========================================================================

  // Item 30: INTEGRATION — NEW SUBMIT IS V2
  it('CP5-30 new submit persists SNAPSHOT_V2 with canonical provenance and pinned asOf', async () => {
    projection.resolveInTransaction.mockResolvedValue(personalProjection(subject, submitter, year));
    const dto = { academicYearId: year, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'cp5-submit-v2' };
    const result = await service.submit(dto, request(submitter));

    const row = await prisma.reportingStatementRevision.findUniqueOrThrow({
      where: { id: result.revisionId },
    });

    expect(row.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V2);
    expect(row.serializerVersion).toBe(REPORTING_STATEMENT_SERIALIZER_V1);
    expect(row.asOfInstant).toEqual(asOf);

    const parsed = JSON.parse(row.canonicalSnapshotJson);
    expect(parsed.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V2);
    expect(parsed.serializerVersion).toBe(REPORTING_STATEMENT_SERIALIZER_V1);
    expect(parsed.operationalStartPolicyVersionId).toBe(operationalPolicyVersionId);
    expect(parsed.operationalStartDate).toBe('2026-08-15');
    expect(parsed.asOfInstant).toBe(asOf.toISOString());
  });

  // Item 31: INTEGRATION — HCM ANCHOR
  it('CP5-31 HCM anchor resolves policy effective on 2026-09-13 when asOf is 2026-09-12T17:00:00.000Z', async () => {
    const boundaryAsOf = new Date('2026-09-12T17:00:00.000Z');
    // Mark version 1 as superseded/effectiveUntil 2026-09-12 before creating version 2
    await prisma.businessPolicyVersion.update({
      where: { id: operationalPolicyVersionId },
      data: { effectiveUntil: new Date('2026-09-12T00:00:00.000Z') },
    });
    // Policy version effective from 2026-09-13
    const pv13 = await prisma.businessPolicyVersion.create({
      data: {
        streamId: policyStreamId,
        versionNumber: 2,
        status: 'PUBLISHED',
        payload: { operationalStartDate: '2026-09-01' },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-09-13T00:00:00.000Z'),
        effectiveUntil: null,
        publishedAt: new Date('2026-09-13T00:00:00.000Z'),
        publishedByUserId: approver,
        createdByUserId: approver,
      },
    });

    // Create service instance with boundary clock
    const boundaryService = new ReportingStatementsService(
      prisma as never,
      repository,
      projection as never,
      { evaluate: jest.fn().mockResolvedValue({ allowed: true }) } as never,
      new AuditService(prisma as never),
      businessConfiguration,
      { now: jest.fn(() => boundaryAsOf) },
    );

    projection.resolveInTransaction.mockResolvedValue(personalProjection(subject, submitter, year, boundaryAsOf));

    const result = await boundaryService.submit(
      { academicYearId: year, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'boundary-submit' },
      request(submitter),
    );

    const row = await prisma.reportingStatementRevision.findUniqueOrThrow({
      where: { id: result.revisionId },
    });
    const parsed = JSON.parse(row.canonicalSnapshotJson);
    // HCM date is 2026-09-13, so it resolves pv13, NOT pv1
    expect(parsed.operationalStartPolicyVersionId).toBe(pv13.id);
    expect(parsed.operationalStartDate).toBe('2026-09-01');
  });

  // Item 32: INTEGRATION — IMMUTABILITY AFTER POLICY CHANGE
  it('CP5-32 frozen statement remains byte-stable and retains original provenance after later policy replacement', async () => {
    projection.resolveInTransaction.mockResolvedValue(personalProjection(subject, submitter, year));
    const submitted = await service.submit(
      { academicYearId: year, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'immutable-pre' },
      request(submitter),
    );

    const before = await repository.readFrozenRevision(prisma, submitted.revisionId);
    expect(before?.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V2);
    const beforeParsed = JSON.parse(before!.canonicalSnapshotJson);
    expect(beforeParsed.operationalStartPolicyVersionId).toBe(operationalPolicyVersionId);
    expect(beforeParsed.operationalStartDate).toBe('2026-08-15');

    // Simulate policy update: new version published after capping old version
    await prisma.businessPolicyVersion.update({
      where: { id: operationalPolicyVersionId },
      data: { effectiveUntil: new Date('2026-08-19T00:00:00.000Z') },
    });
    const pvNew = await prisma.businessPolicyVersion.create({
      data: {
        streamId: policyStreamId,
        versionNumber: 99,
        status: 'PUBLISHED',
        payload: { operationalStartDate: '2026-08-25' },
        validatorVersion: 'v1',
        effectiveFrom: new Date('2026-08-20T00:00:00.000Z'),
        effectiveUntil: null,
        publishedAt: new Date('2026-08-20T00:00:00.000Z'),
        publishedByUserId: approver,
        createdByUserId: approver,
      },
    });

    // Read old statement: MUST NOT query or be reinterpreted by pvNew
    const after = await repository.readFrozenRevision(prisma, submitted.revisionId);
    expect(after?.canonicalSnapshotJson).toBe(before?.canonicalSnapshotJson);
    expect(after?.semanticHash).toBe(before?.semanticHash);

    const afterParsed = JSON.parse(after!.canonicalSnapshotJson);
    expect(afterParsed.operationalStartPolicyVersionId).toBe(operationalPolicyVersionId);
    expect(afterParsed.operationalStartPolicyVersionId).not.toBe(pvNew.id);
    expect(afterParsed.operationalStartDate).toBe('2026-08-15');

    // Verify presenter verifies and presents cleanly
    const presented = presentReportingStatementDetail(after as never, []);
    expect(presented.revisionId).toBe(submitted.revisionId);
  });

  // Item 33: INTEGRATION — V1 BACKWARD COMPATIBILITY
  it('CP5-33 historical V1 revision is accepted, readable, and verified without V2 provenance', async () => {
    // Persist a genuine historical V1 revision using explicit V1 freeze helper
    const frozenV1 = freezeReportingStatementSnapshotV1({
      statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE,
      submitterUserId: submitter,
      asOfInstant: asOf,
      projection: personalProjection(subject, submitter, year) as never,
    });

    const persisted = await prisma.$transaction(tx =>
      repository.persistSubmittedRevision(tx, {
        series: { statementProfile: PERSONAL_REPORTING_STATEMENT_PROFILE, submitterUserId: submitter, academicYearId: year, fromCivilDate: new Date('2026-08-01'), toCivilDate: new Date('2026-08-31') },
        frozen: frozenV1,
        lifecycleToken: crypto.randomUUID(),
        command: { actorUserId: submitter, requestKey: 'v1-historical-key', requestFingerprint: 'v1-fingerprint' },
        history: { actorUserId: submitter },
      }),
    );

    const row = await repository.readFrozenRevision(prisma, persisted.revision.id);
    expect(row?.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V1);
    expect(row?.serializerVersion).toBe(REPORTING_STATEMENT_SERIALIZER_V1);

    const parsed = JSON.parse(row!.canonicalSnapshotJson);
    expect(parsed.snapshotProfile).toBe(REPORTING_STATEMENT_SNAPSHOT_V1);
    expect(parsed).not.toHaveProperty('operationalStartPolicyVersionId');
    expect(parsed).not.toHaveProperty('operationalStartDate');

    // Presenter presents V1 cleanly without error
    const presented = presentReportingStatementDetail(row as never, []);
    expect(presented.revisionId).toBe(persisted.revision.id);
    expect(presented.statementProfile).toBe(PERSONAL_REPORTING_STATEMENT_PROFILE);
    expect(presented.submitterUserId).toBe(submitter);
  });

  // Item 34: IDEMPOTENT REPLAY AFTER POLICY CHANGE
  it('CP5-34 idempotent replay succeeds even when current policy is deleted or unavailable', async () => {
    projection.resolveInTransaction.mockResolvedValue(personalProjection(subject, submitter, year));
    const dto = { academicYearId: year, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'replay-after-policy-gone' };

    const first = await service.submit(dto, request(submitter));
    expect(first.replay).toBe(false);

    // Make current policy unavailable by deleting policy versions and stream
    await prisma.businessPolicyVersion.deleteMany({ where: { streamId: policyStreamId } });
    await prisma.businessPolicyStream.deleteMany({ where: { id: policyStreamId } });

    // Replay with exact same requestKey
    const replay = await service.submit(dto, request(submitter));
    expect(replay).toMatchObject({
      replay: true,
      revisionId: first.revisionId,
      seriesId: first.seriesId,
      asOfInstant: first.asOfInstant,
    });

    // Verify no second revision was created
    expect(await prisma.reportingStatementRevision.count()).toBe(1);
  });
});
