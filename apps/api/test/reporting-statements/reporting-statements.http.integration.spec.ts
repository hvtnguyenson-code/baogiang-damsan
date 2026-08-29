import { AuditResult, CatalogStatus, PrismaClient, ReportingStatementLifecycleState as State } from '@prisma/client';
import request, { Agent } from 'supertest';
import { freezeReportingStatementSnapshot } from '../../src/reporting-statement-internal/reporting-statement-canonicalizer';
import { ReportingStatementRepository } from '../../src/reporting-statement-internal/reporting-statement.repository';
import { PERSONAL_REPORTING_STATEMENT_PROFILE } from '../../src/reporting-statements/reporting-statement.policy';
import { PUBLIC_PRESENTATION_INTEGRITY_ERROR } from '../../src/reporting-statements/reporting-statement.presenter';
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
  let submitOnly: { agent: Agent; id: string };
  let readPersonal: { agent: Agent; id: string };
  let noReportingAuthority: { agent: Agent; id: string };
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
      { key: 'ACADEMIC_STRUCTURE_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
    academicYearId = (await prisma.academicYear.create({ data: { code: `Y${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'Year' } })).id;

    // Minimum valid active academic calendar fixture covering 2026-08-01 -> 2026-08-31
    await prisma.academicCalendarVersion.create({
      data: {
        academicYearId,
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

    subjectA = (await prisma.subject.create({ data: { code: `A${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'A' } })).id;
    subjectB = (await prisma.subject.create({ data: { code: `B${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'B' } })).id;
    owner = await harness.actor({ grants: [{ capabilityKey: 'REPORTING_STATEMENT_SUBMIT', scopeType: 'PERSONAL' }, { capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'PERSONAL' }] });
    otherTeacher = await harness.actor({ grants: [{ capabilityKey: 'REPORTING_STATEMENT_SUBMIT', scopeType: 'PERSONAL' }, { capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'PERSONAL' }] });
    reader = await harness.actor({ grants: [{ capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SUBJECT', scopeResourceId: subjectA }] });
    approver = await harness.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL', scopeType: 'SCHOOL_WIDE' }, { capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SCHOOL_WIDE' }] });
    submitOnly = await harness.actor({ grants: [{ capabilityKey: 'REPORTING_STATEMENT_SUBMIT', scopeType: 'PERSONAL' }] });
    readPersonal = await harness.actor({ grants: [{ capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'PERSONAL' }] });
    noReportingAuthority = await harness.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN', scopeType: 'SCHOOL_WIDE' }] });
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
    expect((await request(server).get('/api/reporting-statements/workspace-context')).status).toBe(401);
    expect((await request(server).get('/api/reporting-statements/mine')).status).toBe(401);
    expect((await request(server).get('/api/reporting-statements/accessible')).status).toBe(401);
    expect((await request(server).get('/api/reporting-statements/pending-decision')).status).toBe(401);
    expect((await request(server).post('/api/reporting-statements').set('Origin', testOrigin).send(submit)).status).toBe(401);
    expect((await request(server).get(`/api/reporting-statements/${revisionId}`)).status).toBe(401);
    expect((await request(server).post(`/api/reporting-statements/${revisionId}/approve`).set('Origin', testOrigin).send({ expectedLifecycleToken: crypto.randomUUID(), requestKey: 'unauthenticated' })).status).toBe(401);
    expect((await request(server).post(`/api/reporting-statements/${revisionId}/reject`).set('Origin', testOrigin).send({ expectedLifecycleToken: crypto.randomUUID(), requestKey: 'unauthenticated' })).status).toBe(401);
  });

  it('serves deterministic public product context without widening academic management or persisting data', async () => {
    const yearWithoutCalendar = await prisma.academicYear.create({
      data: { code: '0000-0000', name: 'Năm học chưa có lịch' },
    });
    const activeClass = await prisma.schoolClass.create({
      data: { academicYearId, code: '10A1', name: 'Lớp 10A1', gradeLevel: 10 },
    });
    const inactiveClass = await prisma.schoolClass.create({
      data: {
        academicYearId,
        code: '12C1',
        name: 'Lớp 12C1',
        gradeLevel: 12,
        status: CatalogStatus.INACTIVE,
      },
    });
    const inactiveSubject = await prisma.subject.create({
      data: { code: 'ZZZ-INACTIVE', name: 'Môn học ngừng hoạt động', status: CatalogStatus.INACTIVE },
    });

    const counts = async () => ({
      series: await prisma.reportingStatementSeries.count(),
      revision: await prisma.reportingStatementRevision.count(),
      state: await prisma.reportingStatementRevisionState.count(),
      revisionSubject: await prisma.reportingStatementRevisionSubject.count(),
      command: await prisma.reportingStatementCommand.count(),
      history: await prisma.reportingStatementHistory.count(),
      academicYear: await prisma.academicYear.count(),
      calendar: await prisma.academicCalendarVersion.count(),
      schoolClass: await prisma.schoolClass.count(),
      subject: await prisma.subject.count(),
    });
    const before = await counts();

    const noSelection = await submitOnly.agent.get('/api/reporting-statements/workspace-context');
    expect(noSelection.status).toBe(200);
    expect(noSelection.body.selectedAcademicYear).toBeNull();
    expect(noSelection.body.academicYears).toHaveLength(2);
    expect(noSelection.body.academicYears.map((year: { code: string }) => year.code)).toEqual([
      '0000-0000',
      expect.stringMatching(/^Y/u),
    ]);
    expect(noSelection.body.academicYears.find((year: { id: string }) => year.id === yearWithoutCalendar.id))
      .toMatchObject({ activeCalendar: null });

    expect((await readPersonal.agent.get('/api/reporting-statements/workspace-context')).status).toBe(200);
    expect((await reader.agent.get('/api/reporting-statements/workspace-context')).status).toBe(200);
    expect((await approver.agent.get('/api/reporting-statements/workspace-context')).status).toBe(200);
    expect((await noReportingAuthority.agent.get('/api/reporting-statements/workspace-context')).status).toBe(403);

    expect((await submitOnly.agent.get('/api/academic-years')).status).toBe(403);
    expect((await submitOnly.agent.get('/api/reporting-statements/workspace-context')).status).toBe(200);

    expect((await submitOnly.agent.get('/api/reporting-statements/workspace-context?academicYearId=not-a-uuid')).status).toBe(400);
    expect((await submitOnly.agent.get(`/api/reporting-statements/workspace-context?academicYearId=${crypto.randomUUID()}`)).status).toBe(404);

    const selected = await submitOnly.agent.get(`/api/reporting-statements/workspace-context?academicYearId=${academicYearId}`);
    expect(selected.status).toBe(200);
    expect(selected.body.selectedAcademicYear).toEqual(expect.objectContaining({
      id: academicYearId,
      activeCalendar: { startDate: '2026-08-01', endDate: '2027-05-31' },
      schoolClasses: [
        { id: activeClass.id, code: '10A1', name: 'Lớp 10A1', status: 'ACTIVE' },
        { id: inactiveClass.id, code: '12C1', name: 'Lớp 12C1', status: 'INACTIVE' },
      ],
    }));
    expect(selected.body.selectedAcademicYear.subjects.map((subject: { code: string }) => subject.code))
      .toEqual([...selected.body.selectedAcademicYear.subjects]
        .map((subject: { code: string }) => subject.code)
        .sort((left: string, right: string) => left < right ? -1 : left > right ? 1 : 0));
    expect(selected.body.selectedAcademicYear.subjects).toContainEqual({
      id: inactiveSubject.id,
      code: 'ZZZ-INACTIVE',
      name: 'Môn học ngừng hoạt động',
      status: 'INACTIVE',
    });
    expect(Object.keys(selected.body.selectedAcademicYear).sort()).toEqual([
      'activeCalendar', 'code', 'id', 'name', 'schoolClasses', 'subjects',
    ]);
    expect(JSON.stringify(selected.body)).not.toMatch(/createdAt|updatedAt|activatedAt|note|audit|grant|requestFingerprint|staff|user/i);
    expect(await counts()).toEqual(before);
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

  it('evaluates real preview ZERO_RESPONSIBILITY and PASS matrix with zero persistence across all 6 tables', async () => {
    const validPreview = { academicYearId, fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31' };

    // Capture initial counts of all 6 reporting statement tables
    const seriesBefore = await prisma.reportingStatementSeries.count();
    const revisionBefore = await prisma.reportingStatementRevision.count();
    const stateBefore = await prisma.reportingStatementRevisionState.count();
    const subjectBefore = await prisma.reportingStatementRevisionSubject.count();
    const commandBefore = await prisma.reportingStatementCommand.count();
    const historyBefore = await prisma.reportingStatementHistory.count();

    // 1. ZERO_RESPONSIBILITY preview (teacher has no teaching assignments)
    const zeroRes = await owner.agent.post('/api/reporting-statements/preview').send(validPreview);
    expect(zeroRes.status).toBe(200);
    expect(zeroRes.body).toMatchObject({
      status: 'PASS',
      responsibilityState: 'ZERO_RESPONSIBILITY',
      eligibleForSubmission: false,
      responsibilityManifest: [],
      sections: [],
      findings: [],
    });

    // 2. PASS + RESPONSIBILITY_PRESENT preview (teacher has valid assignment)
    const schoolClass1 = await prisma.schoolClass.create({
      data: { academicYearId, code: `C${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'Class 1', gradeLevel: 10 },
    });
    await prisma.teachingAssignment.create({
      data: { academicYearId, schoolClassId: schoolClass1.id, subjectId: subjectA, teacherUserId: owner.id, validFrom: new Date('2026-08-01') },
    });

    const passRes = await owner.agent.post('/api/reporting-statements/preview').send(validPreview);
    expect(passRes.status).toBe(200);
    expect(passRes.body).toMatchObject({
      status: 'PASS',
      responsibilityState: 'RESPONSIBILITY_PRESENT',
      eligibleForSubmission: true,
      findings: [],
    });
    expect(passRes.body.responsibilityManifest).toHaveLength(1);
    expect(passRes.body.sections).toHaveLength(1);

    // Zero-persistence assertion: verify all 6 tables remain completely unchanged before and after previews
    expect(await prisma.reportingStatementSeries.count()).toBe(seriesBefore);
    expect(await prisma.reportingStatementRevision.count()).toBe(revisionBefore);
    expect(await prisma.reportingStatementRevisionState.count()).toBe(stateBefore);
    expect(await prisma.reportingStatementRevisionSubject.count()).toBe(subjectBefore);
    expect(await prisma.reportingStatementCommand.count()).toBe(commandBefore);
    expect(await prisma.reportingStatementHistory.count()).toBe(historyBefore);
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

  it('enforces discovery authorization and queue lifecycle state filtering for /mine, /accessible, and /pending-decision (Correction E & Section 7)', async () => {
    // Seed prerequisite teaching assignment for owner so official replacement submit succeeds
    const schoolClass = await prisma.schoolClass.create({
      data: { academicYearId, code: `C${crypto.randomUUID().slice(0, 6).toUpperCase()}`, name: 'Class Owner', gradeLevel: 10 },
    });
    await prisma.teachingAssignment.create({
      data: { academicYearId, schoolClassId: schoolClass.id, subjectId: subjectA, teacherUserId: owner.id, validFrom: new Date('2026-08-01') },
    });

    const revOwner = await seedSubmittedRevision(owner.id, [subjectA]);
    const revOther = await seedSubmittedRevision(otherTeacher.id, [subjectA, subjectB]);

    // /mine: owner sees only revOwner, not revOther
    const mineRes = await owner.agent.get('/api/reporting-statements/mine');
    expect(mineRes.status).toBe(200);
    expect(mineRes.body.total).toBe(1);
    expect(mineRes.body.items[0].revisionId).toBe(revOwner.revision.id);

    // /mine without capability -> 403
    expect((await reader.agent.get('/api/reporting-statements/mine')).status).toBe(403);

    // /accessible: reader with only subject A grant sees revOwner (subject A) but NOT revOther (frozen subjects A+B)
    const accessiblePartial = await reader.agent.get('/api/reporting-statements/accessible');
    expect(accessiblePartial.status).toBe(200);
    expect(accessiblePartial.body.total).toBe(1);
    expect(accessiblePartial.body.items[0].revisionId).toBe(revOwner.revision.id);

    // Grant subject B to reader -> reader now sees both revOwner and revOther
    await prisma.capabilityGrant.create({
      data: { userId: reader.id, capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'SUBJECT', scopeResourceId: subjectB, validFrom: new Date(Date.now() - 1_000) },
    });
    const accessibleFull = await reader.agent.get('/api/reporting-statements/accessible');
    expect(accessibleFull.status).toBe(200);
    expect(accessibleFull.body.total).toBe(2);

    // /pending-decision: non-approver -> 403
    expect((await reader.agent.get('/api/reporting-statements/pending-decision')).status).toBe(403);

    // /pending-decision Terminal-State Matrix (Section 7):
    // 1. SUBMITTED non-owner revisions are visible
    const pendingRes = await approver.agent.get('/api/reporting-statements/pending-decision');
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.total).toBe(2);

    // 2. Own SUBMITTED revision is hidden
    const revApprover = await seedSubmittedRevision(approver.id, [subjectA]);
    const pendingAfterSelf = await approver.agent.get('/api/reporting-statements/pending-decision');
    expect(pendingAfterSelf.body.total).toBe(2);
    expect(pendingAfterSelf.body.items.some((i: { revisionId: string }) => i.revisionId === revApprover.revision.id)).toBe(false);

    // 3. APPROVED predecessor revision is hidden
    const approvePredecessorRes = await approver.agent.post(`/api/reporting-statements/${revOwner.revision.id}/approve`).set('Origin', testOrigin).send({
      expectedLifecycleToken: revOwner.state.lifecycleToken,
      requestKey: crypto.randomUUID(),
    });
    expect(approvePredecessorRes.status).toBe(201);
    expect(approvePredecessorRes.body.lifecycleState).toBe('APPROVED');

    const pendingAfterApprove = await approver.agent.get('/api/reporting-statements/pending-decision');
    expect(pendingAfterApprove.body.total).toBe(1);
    expect(pendingAfterApprove.body.items[0].revisionId).toBe(revOther.revision.id);

    // 4. REJECTED revisions are hidden
    const rejectRes = await approver.agent.post(`/api/reporting-statements/${revOther.revision.id}/reject`).set('Origin', testOrigin).send({
      expectedLifecycleToken: revOther.state.lifecycleToken,
      requestKey: crypto.randomUUID(),
    });
    expect(rejectRes.status).toBe(201);
    expect(rejectRes.body.lifecycleState).toBe('REJECTED');

    const pendingAfterReject = await approver.agent.get('/api/reporting-statements/pending-decision');
    expect(pendingAfterReject.body.total).toBe(0);

    // 5. Official HTTP replacement workflow for SUPERSEDED state (Correction Lineage):
    // Teacher submits a replacement revision for the same series
    const submitReplacementRes = await owner.agent.post('/api/reporting-statements').set('Origin', testOrigin).send({
      academicYearId,
      fromCivilDate: '2026-08-01',
      toCivilDate: '2026-08-31',
      requestKey: crypto.randomUUID(),
    });
    expect(submitReplacementRes.status).toBe(201);
    expect(submitReplacementRes.body.lifecycleState).toBe('SUBMITTED');

    // Pending decision queue now shows the submitted replacement revision
    const pendingWithReplacement = await approver.agent.get('/api/reporting-statements/pending-decision');
    expect(pendingWithReplacement.status).toBe(200);
    expect(pendingWithReplacement.body.total).toBe(1);
    expect(pendingWithReplacement.body.items[0].revisionId).toBe(submitReplacementRes.body.revisionId);

    // Approver approves the replacement revision
    const approveReplacementRes = await approver.agent.post(`/api/reporting-statements/${submitReplacementRes.body.revisionId}/approve`).set('Origin', testOrigin).send({
      expectedLifecycleToken: submitReplacementRes.body.lifecycleToken,
      requestKey: crypto.randomUUID(),
    });
    expect(approveReplacementRes.status).toBe(201);
    expect(approveReplacementRes.body.lifecycleState).toBe('APPROVED');

    // Verify DB states: predecessor is atomically SUPERSEDED, replacement is APPROVED with supersedesRevisionId
    const predecessorDb = await prisma.reportingStatementRevisionState.findUniqueOrThrow({ where: { revisionId: revOwner.revision.id } });
    expect(predecessorDb.lifecycleState).toBe('SUPERSEDED');

    const replacementDb = await prisma.reportingStatementRevision.findUniqueOrThrow({ where: { id: submitReplacementRes.body.revisionId } });
    expect(replacementDb.predecessorRevisionId).toBe(revOwner.revision.id);
    expect(replacementDb.supersedesRevisionId).toBe(revOwner.revision.id);

    // Pending decision queue is now empty (neither SUPERSEDED nor APPROVED revisions are visible)
    const finalPending = await approver.agent.get('/api/reporting-statements/pending-decision');
    expect(finalPending.status).toBe(200);
    expect(finalPending.body.total).toBe(0);
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

  it('sanitizes HTTP 500 error responses on integrity mismatch without leaking internal diagnostics (Section 9)', async () => {
    const seeded = await seedSubmittedRevision(owner.id, [subjectA, subjectB]);

    // Intentionally tamper with the stored semantic hash in DB
    await prisma.reportingStatementRevision.update({
      where: { id: seeded.revision.id },
      data: { semanticHash: 'f'.repeat(64) },
    });

    const response = await owner.agent.get(`/api/reporting-statements/${seeded.revision.id}`);
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      statusCode: 500,
      message: PUBLIC_PRESENTATION_INTEGRITY_ERROR,
    });

    const rawBody = JSON.stringify(response.body);
    expect(rawBody).not.toMatch(/semantic|hash|canonical|submitter|series|database|prisma|sql|unknown|profile|serializer/i);
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
