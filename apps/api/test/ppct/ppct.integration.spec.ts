import { CatalogStatus } from '@prisma/client';
import request from 'supertest';
import { integration, normalizedCode, Phase01Harness, testOrigin } from '../helpers/phase01-test-harness';

integration('PPCT control plane and lifecycle (PostgreSQL)', () => {
  const h = new Phase01Harness();

  async function clean(): Promise<void> {
    await h.prisma.ppctItemLineage.deleteMany();
    await h.prisma.ppctClassAssociation.deleteMany();
    await h.prisma.ppctItemRevision.deleteMany();
    await h.prisma.ppctItem.deleteMany();
    await h.prisma.ppctVersion.deleteMany();
    await h.prisma.ppctPlan.deleteMany();
    await h.clean();
  }

  beforeAll(async () => h.start());
  afterAll(async () => {
    try { await clean(); } finally { await h.stop(); }
  });
  beforeEach(async () => {
    await clean();
    await h.seedCapabilities([
      { key: 'PPCT_MANAGE', scopes: ['SUBJECT', 'SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_GROUP_LEAD', scopes: ['SUBJECT_GROUP'] },
    ]);
  });

  async function fixture() {
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y'), name: '2026-2027' } });
    const schoolClass = await h.prisma.schoolClass.create({ data: {
      academicYearId: year.id, code: normalizedCode('C'), name: '10A1', gradeLevel: 10, status: CatalogStatus.ACTIVE,
    } });
    const subject = await h.prisma.subject.create({ data: { code: normalizedCode('S'), name: 'Toán' } });
    const otherSubject = await h.prisma.subject.create({ data: { code: normalizedCode('O'), name: 'Vật lý' } });
    return { year, schoolClass, subject, otherSubject };
  }

  async function subjectManager(subjectId: string) {
    return h.actor({ grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: subjectId }] });
  }

  async function createPlanAndDraft(
    actor: Awaited<ReturnType<typeof h.actor>>,
    f: Awaited<ReturnType<typeof fixture>>,
    options: { subjectId?: string; gradeLevel?: number } = {},
  ) {
    const subjectId = options.subjectId ?? f.subject.id;
    const gradeLevel = options.gradeLevel ?? 10;
    const plan = await actor.agent.post(`/api/academic-years/${f.year.id}/ppct-plans`).set('Origin', testOrigin)
      .send({ subjectId, gradeLevel });
    const draft = await actor.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`).set('Origin', testOrigin).send({});
    return { plan, draft };
  }

  const contentItem = (itemId: string, sequence: number, overrides: Record<string, unknown> = {}) => ({
    itemId, identityMode: 'NEW', sequence, title: ` Bài ${sequence} `, lessonType: ' Lý thuyết ', ...overrides,
  });

  async function author(
    actor: Awaited<ReturnType<typeof h.actor>>,
    versionId: string,
    expectedUpdatedAt: string,
    items: Array<Record<string, unknown>>,
  ) {
    return actor.agent.put(`/api/ppct-versions/${versionId}/content`).set('Origin', testOrigin)
      .send({ expectedUpdatedAt, items });
  }

  async function publish(
    actor: Awaited<ReturnType<typeof h.actor>>,
    versionId: string,
    expectedUpdatedAt: string,
    expectedPublishedVersionId: string | null,
  ) {
    return actor.agent.post(`/api/ppct-versions/${versionId}/publish`).set('Origin', testOrigin)
      .send({ expectedUpdatedAt, expectedPublishedVersionId });
  }

  it('enforces session, CSRF, exact subject access, school-wide access, password policy, and denial audit', async () => {
    const f = await fixture();
    const exact = await subjectManager(f.subject.id);
    const school = await h.actor({ grants: [{ capabilityKey: 'PPCT_MANAGE' }] });
    const other = await subjectManager(f.otherSubject.id);
    const systemAdmin = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    const groupLead = await h.actor({
      grants: [{ capabilityKey: 'SUBJECT_GROUP_LEAD', scopeType: 'SUBJECT_GROUP', scopeResourceId: crypto.randomUUID() }],
    });
    const wrongScope = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT_GROUP', scopeResourceId: crypto.randomUUID() }],
    });
    const firstLogin = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: f.subject.id }],
      mustChangePassword: true,
    });
    const route = `/api/academic-years/${f.year.id}/ppct-plans?subjectId=${f.subject.id}`;

    expect((await request(h.app.getHttpServer()).get(route)).status).toBe(401);
    expect((await exact.agent.post(`/api/academic-years/${f.year.id}/ppct-plans`)
      .send({ subjectId: f.subject.id, gradeLevel: 10 })).status).toBe(403);
    expect((await exact.agent.get(route)).status).toBe(200);
    expect((await school.agent.get(route)).status).toBe(200);
    expect((await other.agent.get(route)).status).toBe(403);
    expect((await systemAdmin.agent.get(route)).status).toBe(403);
    expect((await groupLead.agent.get(route)).status).toBe(403);
    expect((await wrongScope.agent.get(route)).status).toBe(403);
    expect((await firstLogin.agent.get(route)).status).toBe(403);
    expect((await exact.agent.get(
      `/api/academic-years/${f.year.id}/ppct-plans?subjectId=${f.otherSubject.id}`,
    )).status).toBe(403);
    expect(await h.prisma.auditEvent.count({
      where: { action: 'AUTHORIZATION_DENIED', entityId: 'PPCT_MANAGE', result: 'DENIED' },
    })).toBeGreaterThanOrEqual(6);
  });

  it('controls duplicate plans, monotonic and concurrent draft numbering, DTO bounds, CAS, and replacement atomicity', async () => {
    const f = await fixture();
    const manager = await subjectManager(f.subject.id);
    const { plan, draft } = await createPlanAndDraft(manager, f);
    expect(plan.status).toBe(201);
    expect(draft.body).toMatchObject({ versionNumber: 1, status: 'DRAFT', itemCount: 0 });
    expect((await manager.agent.post(`/api/academic-years/${f.year.id}/ppct-plans`).set('Origin', testOrigin)
      .send({ subjectId: f.subject.id, gradeLevel: 10 })).status).toBe(409);

    const second = await manager.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`)
      .set('Origin', testOrigin).send({});
    expect(second.status).toBe(201);
    expect(second.body.versionNumber).toBe(2);
    const concurrentDrafts = await Promise.all([
      manager.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`).set('Origin', testOrigin).send({}),
      manager.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`).set('Origin', testOrigin).send({}),
    ]);
    expect(concurrentDrafts.every((response) => [201, 409].includes(response.status))).toBe(true);
    expect(concurrentDrafts.filter((response) => response.status === 201).length).toBeGreaterThanOrEqual(1);
    const versions = await h.prisma.ppctVersion.findMany({
      where: { ppctPlanId: plan.body.id }, orderBy: { versionNumber: 'asc' }, select: { versionNumber: true },
    });
    expect(versions.map(({ versionNumber }) => versionNumber)).toEqual(
      Array.from({ length: versions.length }, (_value, index) => index + 1),
    );

    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    expect((await author(manager, draft.body.id, draft.body.updatedAt, [
      contentItem(a, 1, { title: 'x'.repeat(501) }),
    ])).status).toBe(400);
    expect((await author(manager, draft.body.id, draft.body.updatedAt, [
      contentItem(a, 1, { lessonType: 'x'.repeat(101) }),
    ])).status).toBe(400);
    expect((await author(manager, draft.body.id, draft.body.updatedAt, [contentItem(a, 1), contentItem(b, 1)])).status)
      .toBe(400);
    expect((await author(manager, draft.body.id, draft.body.updatedAt, [contentItem(a, 1), contentItem(a, 2)])).status)
      .toBe(400);
    expect(await h.prisma.ppctItemRevision.count({ where: { ppctVersionId: draft.body.id } })).toBe(0);

    const first = await author(manager, draft.body.id, draft.body.updatedAt, [contentItem(a, 1), contentItem(b, 2)]);
    expect(first.status).toBe(200);
    expect(first.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: a, title: 'Bài 1', lessonType: 'Lý thuyết' }),
      expect.objectContaining({ itemId: b }),
    ]));
    expect((await author(manager, draft.body.id, draft.body.updatedAt, [])).status).toBe(409);

    const retained = await author(manager, draft.body.id, first.body.version.updatedAt, [contentItem(a, 1)]);
    expect(retained.status).toBe(200);
    expect(retained.body.items[0].itemId).toBe(a);
    const beforeFailure = await h.prisma.ppctItemRevision.findMany({ where: { ppctVersionId: draft.body.id } });
    const failed = await author(manager, draft.body.id, retained.body.version.updatedAt, [
      contentItem(crypto.randomUUID(), 1, {
        predecessors: [{ versionId: crypto.randomUUID(), itemId: crypto.randomUUID() }],
      }),
    ]);
    expect(failed.status).toBe(404);
    expect(await h.prisma.ppctItemRevision.findMany({ where: { ppctVersionId: draft.body.id } })).toEqual(beforeFailure);
    expect(await h.prisma.ppctItemLineage.count({ where: { successorVersionId: draft.body.id } })).toBe(0);

    const concurrentNewItem = crypto.randomUUID();
    const [writerA, writerB] = await Promise.all([
      author(manager, draft.body.id, retained.body.version.updatedAt, [contentItem(a, 1), contentItem(concurrentNewItem, 2)]),
      author(manager, draft.body.id, retained.body.version.updatedAt, [contentItem(a, 1)]),
    ]);
    expect([writerA.status, writerB.status].sort()).toEqual([200, 409]);
    const winner = writerA.status === 200 ? writerA : writerB;
    const finalContent = await manager.agent.get(`/api/ppct-versions/${draft.body.id as string}/content`);
    expect(finalContent.body.items).toEqual(winner.body.items);
  });

  it('rejects a zero-revision orphan from another draft while leaving the target draft unchanged', async () => {
    const f = await fixture();
    const manager = await subjectManager(f.subject.id);
    const { plan, draft: draftA } = await createPlanAndDraft(manager, f);
    const orphanId = crypto.randomUUID();
    const authored = await author(manager, draftA.body.id, draftA.body.updatedAt, [contentItem(orphanId, 1)]);
    expect(authored.status).toBe(200);
    const removed = await author(manager, draftA.body.id, authored.body.version.updatedAt, []);
    expect(removed.status).toBe(200);
    expect(await h.prisma.ppctItem.findUnique({ where: { id: orphanId } })).not.toBeNull();
    expect(await h.prisma.ppctItemRevision.count({ where: { ppctItemId: orphanId } })).toBe(0);

    const draftB = await manager.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`)
      .set('Origin', testOrigin).send({});
    const claimed = await author(manager, draftB.body.id, draftB.body.updatedAt, [contentItem(orphanId, 1)]);
    expect(claimed.status).toBe(409);
    const unchanged = await manager.agent.get(`/api/ppct-versions/${draftB.body.id as string}/content`);
    expect(unchanged.body.items).toEqual([]);
    expect(unchanged.body.lineage).toEqual([]);
    expect(unchanged.body.version.updatedAt).toBe(draftB.body.updatedAt);
  });

  it('preserves clone identity and enforces carry-forward, split, merge, and predecessor domain rules', async () => {
    const f = await fixture();
    const manager = await subjectManager(f.subject.id);
    const { plan, draft } = await createPlanAndDraft(manager, f);
    const originalA = crypto.randomUUID();
    const originalB = crypto.randomUUID();
    const authored = await author(manager, draft.body.id, draft.body.updatedAt, [
      contentItem(originalA, 1), contentItem(originalB, 2),
    ]);
    const publishedV1 = await publish(manager, draft.body.id, authored.body.version.updatedAt, null);
    expect(publishedV1.status).toBe(200);

    const correction = await manager.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`)
      .set('Origin', testOrigin).send({ sourceVersionId: draft.body.id });
    expect(correction.body).toMatchObject({ versionNumber: 2, status: 'DRAFT', itemCount: 2 });
    const cloned = await manager.agent.get(`/api/ppct-versions/${correction.body.id as string}/content`);
    expect(cloned.body.items.map((item: { itemId: string }) => item.itemId)).toEqual([originalA, originalB]);
    expect(cloned.body.lineage).toEqual([]);

    expect((await author(manager, correction.body.id, correction.body.updatedAt, [
      contentItem(originalA, 1, { identityMode: 'NEW' }),
    ])).status).toBe(409);
    expect((await author(manager, correction.body.id, correction.body.updatedAt, [
      contentItem(originalA, 1, {
        identityMode: 'CARRY_FORWARD', predecessors: [{ versionId: draft.body.id, itemId: originalA }],
      }),
    ])).status).toBe(409);

    const cross = await createPlanAndDraft(manager, f, { gradeLevel: 11 });
    const crossItem = crypto.randomUUID();
    const crossAuthored = await author(manager, cross.draft.body.id, cross.draft.body.updatedAt, [contentItem(crossItem, 1)]);
    expect((await publish(manager, cross.draft.body.id, crossAuthored.body.version.updatedAt, null)).status).toBe(200);
    expect((await author(manager, correction.body.id, correction.body.updatedAt, [
      contentItem(crypto.randomUUID(), 1, {
        predecessors: [{ versionId: cross.draft.body.id, itemId: crossItem }],
      }),
    ])).status).toBe(409);

    const laterDraft = await manager.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`)
      .set('Origin', testOrigin).send({});
    const laterItem = crypto.randomUUID();
    const laterAuthored = await author(manager, laterDraft.body.id, laterDraft.body.updatedAt, [contentItem(laterItem, 1)]);
    expect((await author(manager, correction.body.id, correction.body.updatedAt, [
      contentItem(crypto.randomUUID(), 1, {
        predecessors: [{ versionId: laterDraft.body.id, itemId: laterItem }],
      }),
    ])).status).toBe(409);
    expect((await author(manager, correction.body.id, correction.body.updatedAt, [
      contentItem(crypto.randomUUID(), 1, {
        predecessors: [{ versionId: correction.body.id, itemId: originalA }],
      }),
    ])).status).toBe(409);
    expect((await publish(manager, laterDraft.body.id, laterAuthored.body.version.updatedAt, draft.body.id)).status).toBe(200);
    expect((await author(manager, correction.body.id, correction.body.updatedAt, [
      contentItem(crypto.randomUUID(), 1, {
        predecessors: [{ versionId: laterDraft.body.id, itemId: laterItem }],
      }),
    ])).status).toBe(409);
    expect((await author(manager, correction.body.id, correction.body.updatedAt, [
      contentItem(crypto.randomUUID(), 1, {
        predecessors: [
          { versionId: draft.body.id, itemId: originalA },
          { versionId: draft.body.id, itemId: originalA },
        ],
      }),
    ])).status).toBe(400);

    const newStandalone = crypto.randomUUID();
    const oneToOne = crypto.randomUUID();
    const splitA = crypto.randomUUID();
    const splitB = crypto.randomUUID();
    const merged = crypto.randomUUID();
    const replaced = await author(manager, correction.body.id, correction.body.updatedAt, [
      contentItem(originalA, 1, { identityMode: 'CARRY_FORWARD' }),
      contentItem(newStandalone, 2),
      contentItem(oneToOne, 3, { predecessors: [{ versionId: draft.body.id, itemId: originalA }] }),
      contentItem(splitA, 4, { predecessors: [{ versionId: draft.body.id, itemId: originalB }] }),
      contentItem(splitB, 5, { predecessors: [{ versionId: draft.body.id, itemId: originalB }] }),
      contentItem(merged, 6, { predecessors: [
        { versionId: draft.body.id, itemId: originalA },
        { versionId: draft.body.id, itemId: originalB },
      ] }),
    ]);
    expect(replaced.status).toBe(200);
    expect(replaced.body.items).toHaveLength(6);
    expect(replaced.body.lineage).toHaveLength(5);
    expect(replaced.body.lineage.some((edge: { successorItemId: string }) => edge.successorItemId === originalA)).toBe(false);
    expect(replaced.body.lineage.filter((edge: { successorItemId: string }) => edge.successorItemId === oneToOne))
      .toHaveLength(1);
    expect(replaced.body.lineage.filter((edge: { predecessorItemId: string }) => edge.predecessorItemId === originalB))
      .toHaveLength(3);
    expect(replaced.body.lineage.filter((edge: { successorItemId: string }) => edge.successorItemId === merged))
      .toHaveLength(2);
    expect(replaced.body.lineage.some((edge: { successorItemId: string }) => edge.successorItemId === newStandalone))
      .toBe(false);
  });

  it('publishes with CAS, preserves old publication provenance, and permits only one concurrent published head', async () => {
    const f = await fixture();
    const manager = await subjectManager(f.subject.id);
    const { plan, draft } = await createPlanAndDraft(manager, f);
    expect((await publish(manager, draft.body.id, draft.body.updatedAt, null)).status).toBe(409);
    const item = crypto.randomUUID();
    const authored = await author(manager, draft.body.id, draft.body.updatedAt, [contentItem(item, 1)]);
    expect((await publish(manager, draft.body.id, draft.body.updatedAt, null)).status).toBe(409);
    const initial = await publish(manager, draft.body.id, authored.body.version.updatedAt, null);
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({ status: 'PUBLISHED', publishedByUserId: manager.id });
    const originalPublication = await h.prisma.ppctVersion.findUniqueOrThrow({ where: { id: draft.body.id } });
    expect((await publish(manager, draft.body.id, initial.body.updatedAt, draft.body.id)).status).toBe(409);

    const correctionA = await manager.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`)
      .set('Origin', testOrigin).send({ sourceVersionId: draft.body.id });
    const correctionB = await manager.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`)
      .set('Origin', testOrigin).send({ sourceVersionId: draft.body.id });
    expect((await publish(manager, correctionA.body.id, correctionA.body.updatedAt, null)).status).toBe(409);
    const [attemptA, attemptB] = await Promise.all([
      publish(manager, correctionA.body.id, correctionA.body.updatedAt, draft.body.id),
      publish(manager, correctionB.body.id, correctionB.body.updatedAt, draft.body.id),
    ]);
    expect([attemptA.status, attemptB.status].sort()).toEqual([200, 409]);
    const winner = attemptA.status === 200 ? attemptA : attemptB;
    const loser = attemptA.status === 409 ? correctionA : correctionB;
    expect(await h.prisma.ppctVersion.count({ where: { ppctPlanId: plan.body.id, status: 'PUBLISHED' } })).toBe(1);
    expect(await h.prisma.ppctVersion.findUniqueOrThrow({ where: { id: winner.body.id } })).toMatchObject({
      status: 'PUBLISHED',
    });
    expect(await h.prisma.ppctVersion.findUniqueOrThrow({ where: { id: loser.body.id } })).toMatchObject({ status: 'DRAFT' });
    const superseded = await h.prisma.ppctVersion.findUniqueOrThrow({ where: { id: draft.body.id } });
    expect(superseded).toMatchObject({
      status: 'SUPERSEDED',
      publishedByUserId: originalPublication.publishedByUserId,
      publishedAt: originalPublication.publishedAt,
    });
    expect((await publish(manager, draft.body.id, superseded.updatedAt.toISOString(), winner.body.id)).status).toBe(409);
    expect((await publish(manager, winner.body.id, winner.body.updatedAt, winner.body.id)).status).toBe(409);
    expect((await author(manager, winner.body.id, winner.body.updatedAt, [])).status).toBe(409);
  });

  it('switches exact class bindings, preserves intervals, rejects invalid targets, and resolves retained history', async () => {
    const f = await fixture();
    const manager = await subjectManager(f.subject.id);
    const otherManager = await subjectManager(f.otherSubject.id);
    const { plan, draft } = await createPlanAndDraft(manager, f);
    const item = crypto.randomUUID();
    const authored = await author(manager, draft.body.id, draft.body.updatedAt, [contentItem(item, 1)]);
    expect((await publish(manager, draft.body.id, authored.body.version.updatedAt, null)).status).toBe(200);
    const stream = `/api/academic-years/${f.year.id}/classes/${f.schoolClass.id}/subjects/${f.subject.id}`;
    const initial = await manager.agent.post(`${stream}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: draft.body.id, effectiveFrom: '2026-09-01', expectedLatestAssociationId: null,
    });
    expect(initial.status).toBe(201);
    expect(initial.body.association).toMatchObject({
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      gradeLevel: 10,
      ppctPlanId: plan.body.id,
      ppctVersionId: draft.body.id,
      effectiveFrom: '2026-09-01',
      effectiveUntil: null,
    });
    const initialBeforeSwitch = await h.prisma.ppctClassAssociation.findUniqueOrThrow({
      where: { id: initial.body.association.id },
    });

    const otherYear = await h.prisma.academicYear.create({ data: { code: normalizedCode('Y2'), name: '2027-2028' } });
    const wrongTuple = `/api/academic-years/${otherYear.id}/classes/${f.schoolClass.id}/subjects/${f.subject.id}`;
    expect((await manager.agent.post(`${wrongTuple}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: draft.body.id, effectiveFrom: '2026-09-02', expectedLatestAssociationId: null,
    })).status).toBe(409);
    expect((await otherManager.agent.post(`${stream}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: draft.body.id, effectiveFrom: '2026-09-02', expectedLatestAssociationId: initial.body.association.id,
    })).status).toBe(403);

    const wrongGrade = await createPlanAndDraft(manager, f, { gradeLevel: 11 });
    const wrongGradeItem = crypto.randomUUID();
    const wrongGradeAuthored = await author(
      manager, wrongGrade.draft.body.id, wrongGrade.draft.body.updatedAt, [contentItem(wrongGradeItem, 1)],
    );
    expect((await publish(manager, wrongGrade.draft.body.id, wrongGradeAuthored.body.version.updatedAt, null)).status).toBe(200);
    expect((await manager.agent.post(`${stream}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: wrongGrade.draft.body.id,
      effectiveFrom: '2026-09-02',
      expectedLatestAssociationId: initial.body.association.id,
    })).status).toBe(409);

    const wrongSubject = await createPlanAndDraft(otherManager, f, { subjectId: f.otherSubject.id });
    const wrongSubjectItem = crypto.randomUUID();
    const wrongSubjectAuthored = await author(
      otherManager, wrongSubject.draft.body.id, wrongSubject.draft.body.updatedAt, [contentItem(wrongSubjectItem, 1)],
    );
    expect((await publish(
      otherManager, wrongSubject.draft.body.id, wrongSubjectAuthored.body.version.updatedAt, null,
    )).status).toBe(200);
    expect((await manager.agent.post(`${stream}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: wrongSubject.draft.body.id,
      effectiveFrom: '2026-09-02',
      expectedLatestAssociationId: initial.body.association.id,
    })).status).toBe(409);

    const correction = await manager.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`)
      .set('Origin', testOrigin).send({ sourceVersionId: draft.body.id });
    const corrected = await author(manager, correction.body.id, correction.body.updatedAt, [
      contentItem(item, 1, { identityMode: 'CARRY_FORWARD', title: 'Bài sửa' }),
    ]);
    expect((await publish(manager, correction.body.id, corrected.body.version.updatedAt, draft.body.id)).status).toBe(200);
    const unchangedAfterPublish = await h.prisma.ppctClassAssociation.findUniqueOrThrow({
      where: { id: initial.body.association.id },
    });
    expect(unchangedAfterPublish).toEqual(initialBeforeSwitch);
    expect((await manager.agent.post(`${stream}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: draft.body.id,
      effectiveFrom: '2026-09-10',
      expectedLatestAssociationId: initial.body.association.id,
    })).status).toBe(409);

    const switched = await manager.agent.post(`${stream}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: correction.body.id,
      effectiveFrom: '2026-09-10',
      expectedLatestAssociationId: initial.body.association.id,
    });
    expect(switched.status).toBe(201);
    expect(switched.body.previousAssociation).toMatchObject({
      id: initialBeforeSwitch.id,
      effectiveFrom: '2026-09-01',
      effectiveUntil: '2026-09-09',
      academicYearId: initialBeforeSwitch.academicYearId,
      schoolClassId: initialBeforeSwitch.schoolClassId,
      subjectId: initialBeforeSwitch.subjectId,
      gradeLevel: initialBeforeSwitch.gradeLevel,
      ppctPlanId: initialBeforeSwitch.ppctPlanId,
      ppctVersionId: initialBeforeSwitch.ppctVersionId,
    });
    const initialAfterSwitch = await h.prisma.ppctClassAssociation.findUniqueOrThrow({
      where: { id: initial.body.association.id },
    });
    expect(initialAfterSwitch).toMatchObject({
      id: initialBeforeSwitch.id,
      effectiveFrom: initialBeforeSwitch.effectiveFrom,
      academicYearId: initialBeforeSwitch.academicYearId,
      schoolClassId: initialBeforeSwitch.schoolClassId,
      subjectId: initialBeforeSwitch.subjectId,
      gradeLevel: initialBeforeSwitch.gradeLevel,
      ppctPlanId: initialBeforeSwitch.ppctPlanId,
      ppctVersionId: initialBeforeSwitch.ppctVersionId,
      createdByUserId: initialBeforeSwitch.createdByUserId,
      createdAt: initialBeforeSwitch.createdAt,
      effectiveUntil: new Date('2026-09-09T00:00:00.000Z'),
    });
    expect(initialAfterSwitch.updatedAt.getTime()).toBeGreaterThanOrEqual(initialBeforeSwitch.updatedAt.getTime());
    expect((await manager.agent.post(`${stream}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: correction.body.id,
      effectiveFrom: '2026-09-20',
      expectedLatestAssociationId: initial.body.association.id,
    })).status).toBe(409);

    await h.prisma.ppctClassAssociation.update({
      where: { id: switched.body.association.id }, data: { effectiveUntil: new Date('2026-09-20T00:00:00.000Z') },
    });
    const afterGap = await manager.agent.post(`${stream}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: correction.body.id,
      effectiveFrom: '2026-09-25',
      expectedLatestAssociationId: switched.body.association.id,
    });
    expect(afterGap.status).toBe(201);
    expect(afterGap.body.previousAssociation).toMatchObject({
      id: switched.body.association.id, effectiveUntil: '2026-09-20',
    });

    await expect(h.prisma.ppctClassAssociation.create({ data: {
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      gradeLevel: 10,
      ppctPlanId: plan.body.id,
      ppctVersionId: correction.body.id,
      effectiveFrom: new Date('2026-09-05T00:00:00.000Z'),
      effectiveUntil: new Date('2026-09-12T00:00:00.000Z'),
      createdByUserId: manager.id,
    } })).rejects.toThrow();
    const history = await h.prisma.ppctClassAssociation.findMany({
      where: { academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id },
      orderBy: { effectiveFrom: 'asc' },
    });
    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1]!;
      const current = history[index]!;
      expect(previous.effectiveUntil).not.toBeNull();
      expect(previous.effectiveUntil!.getTime()).toBeLessThan(current.effectiveFrom.getTime());
    }

    const old = await manager.agent.get(`${stream}/ppct-resolution?date=2026-09-05`);
    const newer = await manager.agent.get(`${stream}/ppct-resolution?date=2026-09-10`);
    const gap = await manager.agent.get(`${stream}/ppct-resolution?date=2026-09-22`);
    expect(old.body).toMatchObject({
      resolved: true,
      association: { id: initial.body.association.id, ppctVersionId: draft.body.id },
      version: { id: draft.body.id, status: 'SUPERSEDED' },
    });
    expect(newer.body).toMatchObject({
      resolved: true,
      association: { id: switched.body.association.id, ppctVersionId: correction.body.id },
      version: { id: correction.body.id, status: 'PUBLISHED' },
    });
    expect(newer.body.items[0]).toMatchObject({ itemId: item, title: 'Bài sửa' });
    expect(gap.body).toEqual({
      resolved: false,
      academicYearId: f.year.id,
      schoolClassId: f.schoolClass.id,
      subjectId: f.subject.id,
      date: '2026-09-22',
    });
    expect(old.body.version.id).not.toBe(newer.body.version.id);

    const actions = await h.prisma.auditEvent.findMany({ select: { action: true } });
    expect(actions.map(({ action }) => action)).toEqual(expect.arrayContaining([
      'PPCT_PLAN_CREATED',
      'PPCT_VERSION_DRAFT_CREATED',
      'PPCT_DRAFT_CONTENT_REPLACED',
      'PPCT_VERSION_PUBLISHED',
      'PPCT_VERSION_SUPERSEDED',
      'PPCT_CLASS_ASSOCIATION_SWITCHED',
    ]));
  });
});
