import { CatalogStatus } from '@prisma/client';
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

  async function createPlanAndDraft(actor: Awaited<ReturnType<typeof h.actor>>, f: Awaited<ReturnType<typeof fixture>>) {
    const plan = await actor.agent.post(`/api/academic-years/${f.year.id}/ppct-plans`).set('Origin', testOrigin)
      .send({ subjectId: f.subject.id, gradeLevel: 10 });
    const draft = await actor.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`).set('Origin', testOrigin).send({});
    return { plan, draft };
  }

  const contentItem = (itemId: string, sequence: number, overrides: Record<string, unknown> = {}) => ({
    itemId, identityMode: 'NEW', sequence, title: ` Bài ${sequence} `, lessonType: ' Lý thuyết ', ...overrides,
  });

  it('enforces exact SUBJECT/SCHOOL_WIDE authorization, password-change denial, session, CSRF, and denial audit', async () => {
    const f = await fixture();
    const exact = await subjectManager(f.subject.id);
    const school = await h.actor({ grants: [{ capabilityKey: 'PPCT_MANAGE' }] });
    const other = await subjectManager(f.otherSubject.id);
    const systemAdmin = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    const groupLead = await h.actor({ grants: [{ capabilityKey: 'SUBJECT_GROUP_LEAD', scopeType: 'SUBJECT_GROUP', scopeResourceId: crypto.randomUUID() }] });
    const wrongScope = await h.actor({ grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT_GROUP', scopeResourceId: crypto.randomUUID() }] });
    const firstLogin = await h.actor({
      grants: [{ capabilityKey: 'PPCT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: f.subject.id }],
      mustChangePassword: true,
    });
    const route = `/api/academic-years/${f.year.id}/ppct-plans?subjectId=${f.subject.id}`;

    expect((await exact.agent.get(route)).status).toBe(200);
    expect((await school.agent.get(route)).status).toBe(200);
    for (const denied of [other, systemAdmin, groupLead, wrongScope, firstLogin]) expect((await denied.agent.get(route)).status).toBe(403);
    expect((await exact.agent.post(`/api/academic-years/${f.year.id}/ppct-plans`).send({ subjectId: f.subject.id, gradeLevel: 10 })).status).toBe(403);
    expect((await exact.agent.get(`/api/academic-years/${f.year.id}/ppct-plans?subjectId=${f.otherSubject.id}`)).status).toBe(403);
    expect(await h.prisma.auditEvent.count({ where: { action: 'AUTHORIZATION_DENIED', entityId: 'PPCT_MANAGE', result: 'DENIED' } })).toBeGreaterThanOrEqual(6);
  });

  it('creates shared plans and drafts, validates full replacement identity, preserves atomicity, and arbitrates same-token writers', async () => {
    const f = await fixture();
    const manager = await subjectManager(f.subject.id);
    const { plan, draft } = await createPlanAndDraft(manager, f);
    expect(plan.status).toBe(201);
    expect(plan.body).toMatchObject({ academicYearId: f.year.id, subjectId: f.subject.id, gradeLevel: 10 });
    expect(draft.body).toMatchObject({ versionNumber: 1, status: 'DRAFT', itemCount: 0 });
    expect((await manager.agent.post(`/api/academic-years/${f.year.id}/ppct-plans`).set('Origin', testOrigin)
      .send({ subjectId: f.subject.id, gradeLevel: 10 })).status).toBe(409);

    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const duplicateSequence = await manager.agent.put(`/api/ppct-versions/${draft.body.id as string}/content`).set('Origin', testOrigin).send({
      expectedUpdatedAt: draft.body.updatedAt,
      items: [contentItem(a, 1), contentItem(b, 1)],
    });
    expect(duplicateSequence.status).toBe(400);
    expect(await h.prisma.ppctItemRevision.count()).toBe(0);
    expect((await manager.agent.put(`/api/ppct-versions/${draft.body.id as string}/content`).set('Origin', testOrigin).send({
      expectedUpdatedAt: draft.body.updatedAt,
      items: [contentItem(a, 1), contentItem(a, 2)],
    })).status).toBe(400);
    expect((await manager.agent.put(`/api/ppct-versions/${draft.body.id as string}/content`).set('Origin', testOrigin).send({
      expectedUpdatedAt: draft.body.updatedAt,
      items: [contentItem(a, 1, { title: ' ' })],
    })).status).toBe(400);

    const first = await manager.agent.put(`/api/ppct-versions/${draft.body.id as string}/content`).set('Origin', testOrigin).send({
      expectedUpdatedAt: draft.body.updatedAt,
      items: [contentItem(b, 2), contentItem(a, 1)],
    });
    expect(first.status).toBe(200);
    expect(first.body.items.map((row: { itemId: string }) => row.itemId)).toEqual([a, b]);
    expect(first.body.items[0]).toMatchObject({ title: 'Bài 1', lessonType: 'Lý thuyết' });
    expect((await manager.agent.put(`/api/ppct-versions/${draft.body.id as string}/content`).set('Origin', testOrigin).send({
      expectedUpdatedAt: draft.body.updatedAt, items: [],
    })).status).toBe(409);
    expect(await h.prisma.ppctItemRevision.count()).toBe(2);

    const [winner, loser] = await Promise.all([
      manager.agent.put(`/api/ppct-versions/${draft.body.id as string}/content`).set('Origin', testOrigin).send({
        expectedUpdatedAt: first.body.version.updatedAt, items: [contentItem(a, 1), contentItem(b, 2)],
      }),
      manager.agent.put(`/api/ppct-versions/${draft.body.id as string}/content`).set('Origin', testOrigin).send({
        expectedUpdatedAt: first.body.version.updatedAt, items: [contentItem(a, 1)],
      }),
    ]);
    expect([winner.status, loser.status].sort()).toEqual([200, 409]);
    expect(await h.prisma.ppctVersion.count({ where: { ppctPlanId: plan.body.id } })).toBe(1);
  });

  it('clones correction history, enforces NEW/CARRY_FORWARD lineage rules, publishes atomically, and freezes retained content', async () => {
    const f = await fixture();
    const manager = await subjectManager(f.subject.id);
    const { plan, draft } = await createPlanAndDraft(manager, f);
    const originalItem = crypto.randomUUID();
    const authored = await manager.agent.put(`/api/ppct-versions/${draft.body.id as string}/content`).set('Origin', testOrigin).send({
      expectedUpdatedAt: draft.body.updatedAt,
      items: [contentItem(originalItem, 1)],
    });
    expect((await manager.agent.post(`/api/ppct-versions/${draft.body.id as string}/publish`).set('Origin', testOrigin).send({
      expectedUpdatedAt: authored.body.version.updatedAt,
      expectedPublishedVersionId: null,
    })).status).toBe(200);
    expect((await manager.agent.put(`/api/ppct-versions/${draft.body.id as string}/content`).set('Origin', testOrigin).send({
      expectedUpdatedAt: authored.body.version.updatedAt, items: [],
    })).status).toBe(409);

    const correction = await manager.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`).set('Origin', testOrigin)
      .send({ sourceVersionId: draft.body.id });
    expect(correction.body).toMatchObject({ versionNumber: 2, status: 'DRAFT', itemCount: 1 });
    const cloned = await manager.agent.get(`/api/ppct-versions/${correction.body.id as string}/content`);
    expect(cloned.body.items[0].itemId).toBe(originalItem);
    expect(cloned.body.lineage).toEqual([]);
    expect((await manager.agent.put(`/api/ppct-versions/${correction.body.id as string}/content`).set('Origin', testOrigin).send({
      expectedUpdatedAt: correction.body.updatedAt,
      items: [contentItem(originalItem, 1, { identityMode: 'NEW' })],
    })).status).toBe(409);
    expect((await manager.agent.put(`/api/ppct-versions/${correction.body.id as string}/content`).set('Origin', testOrigin).send({
      expectedUpdatedAt: correction.body.updatedAt,
      items: [contentItem(originalItem, 1, { identityMode: 'CARRY_FORWARD', predecessors: [{ versionId: draft.body.id, itemId: originalItem }] })],
    })).status).toBe(409);

    const childA = crypto.randomUUID();
    const childB = crypto.randomUUID();
    const replaced = await manager.agent.put(`/api/ppct-versions/${correction.body.id as string}/content`).set('Origin', testOrigin).send({
      expectedUpdatedAt: correction.body.updatedAt,
      items: [
        contentItem(childA, 1, { predecessors: [{ versionId: draft.body.id, itemId: originalItem }] }),
        contentItem(childB, 2, { predecessors: [{ versionId: draft.body.id, itemId: originalItem }] }),
      ],
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.lineage).toHaveLength(2);
    const published = await manager.agent.post(`/api/ppct-versions/${correction.body.id as string}/publish`).set('Origin', testOrigin).send({
      expectedUpdatedAt: replaced.body.version.updatedAt,
      expectedPublishedVersionId: draft.body.id,
    });
    expect(published.status).toBe(200);
    expect((await h.prisma.ppctVersion.findUniqueOrThrow({ where: { id: draft.body.id } })).status).toBe('SUPERSEDED');
    expect(await h.prisma.ppctVersion.count({ where: { ppctPlanId: plan.body.id, status: 'PUBLISHED' } })).toBe(1);
    expect((await h.prisma.ppctVersion.findUniqueOrThrow({ where: { id: draft.body.id } })).publishedByUserId).toBe(manager.id);
    expect((await manager.agent.post(`/api/ppct-versions/${correction.body.id as string}/publish`).set('Origin', testOrigin).send({
      expectedUpdatedAt: published.body.updatedAt,
      expectedPublishedVersionId: correction.body.id,
    })).status).toBe(409);
    const actions = await h.prisma.auditEvent.findMany({ where: { actorUserId: manager.id }, select: { action: true } });
    expect(actions.map((row) => row.action)).toEqual(expect.arrayContaining([
      'PPCT_PLAN_CREATED', 'PPCT_VERSION_DRAFT_CREATED', 'PPCT_DRAFT_CONTENT_REPLACED',
      'PPCT_VERSION_PUBLISHED', 'PPCT_VERSION_SUPERSEDED',
    ]));
  });

  it('switches class bindings with CAS and forward chronology while historical resolution retains superseded versions and gaps', async () => {
    const f = await fixture();
    const manager = await subjectManager(f.subject.id);
    const { plan, draft } = await createPlanAndDraft(manager, f);
    const item = crypto.randomUUID();
    const authored = await manager.agent.put(`/api/ppct-versions/${draft.body.id as string}/content`).set('Origin', testOrigin).send({
      expectedUpdatedAt: draft.body.updatedAt, items: [contentItem(item, 1)],
    });
    await manager.agent.post(`/api/ppct-versions/${draft.body.id as string}/publish`).set('Origin', testOrigin).send({
      expectedUpdatedAt: authored.body.version.updatedAt, expectedPublishedVersionId: null,
    });
    const stream = `/api/academic-years/${f.year.id}/classes/${f.schoolClass.id}/subjects/${f.subject.id}`;
    const initial = await manager.agent.post(`${stream}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: draft.body.id, effectiveFrom: '2026-09-01', expectedLatestAssociationId: null,
    });
    expect(initial.status).toBe(201);
    expect((await manager.agent.post(`${stream}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: draft.body.id, effectiveFrom: '2026-09-02', expectedLatestAssociationId: null,
    })).status).toBe(409);

    const correction = await manager.agent.post(`/api/ppct-plans/${plan.body.id as string}/versions`).set('Origin', testOrigin)
      .send({ sourceVersionId: draft.body.id });
    const corrected = await manager.agent.put(`/api/ppct-versions/${correction.body.id as string}/content`).set('Origin', testOrigin).send({
      expectedUpdatedAt: correction.body.updatedAt,
      items: [contentItem(item, 1, { identityMode: 'CARRY_FORWARD', title: 'Bài sửa' })],
    });
    await manager.agent.post(`/api/ppct-versions/${correction.body.id as string}/publish`).set('Origin', testOrigin).send({
      expectedUpdatedAt: corrected.body.version.updatedAt, expectedPublishedVersionId: draft.body.id,
    });
    expect((await manager.agent.get(`${stream}/ppct-associations`)).body.items[0]).toMatchObject({
      ppctVersionId: draft.body.id, ppctVersionStatus: 'SUPERSEDED', effectiveUntil: null,
    });
    expect((await manager.agent.post(`${stream}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: draft.body.id, effectiveFrom: '2026-09-20', expectedLatestAssociationId: initial.body.association.id,
    })).status).toBe(409);

    await h.prisma.ppctClassAssociation.update({ where: { id: initial.body.association.id }, data: { effectiveUntil: new Date('2026-09-10Z') } });
    const switched = await manager.agent.post(`${stream}/ppct-associations/switch`).set('Origin', testOrigin).send({
      ppctVersionId: correction.body.id, effectiveFrom: '2026-09-20', expectedLatestAssociationId: initial.body.association.id,
    });
    expect(switched.status).toBe(201);
    expect(switched.body.previousAssociation).toMatchObject({
      id: initial.body.association.id, effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-10', ppctVersionId: draft.body.id,
    });
    const old = await manager.agent.get(`${stream}/ppct-resolution?date=2026-09-05`);
    const gap = await manager.agent.get(`${stream}/ppct-resolution?date=2026-09-15`);
    const current = await manager.agent.get(`${stream}/ppct-resolution?date=2026-09-20`);
    expect(old.body).toMatchObject({ resolved: true, version: { id: draft.body.id, status: 'SUPERSEDED' } });
    expect(gap.body).toEqual({ resolved: false, academicYearId: f.year.id, schoolClassId: f.schoolClass.id, subjectId: f.subject.id, date: '2026-09-15' });
    expect(current.body).toMatchObject({ resolved: true, version: { id: correction.body.id, status: 'PUBLISHED' } });
    expect(current.body.items[0].title).toBe('Bài sửa');
    expect(await h.prisma.auditEvent.count({ where: { action: 'PPCT_CLASS_ASSOCIATION_SWITCHED' } })).toBe(2);
  });
});
