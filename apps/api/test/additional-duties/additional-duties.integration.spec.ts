import request from 'supertest';
import { AdditionalDutiesService } from '../../src/additional-duties/additional-duties.service';
import { Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';

integration('Additional duties API (isolated PostgreSQL integration)', () => {
  const h = new Phase01Harness();
  beforeAll(() => h.start());
  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities([
      { key: 'ADDITIONAL_DUTY_CATALOG_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', scopes: ['SUBJECT_GROUP', 'SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  });
  afterAll(() => h.stop());

  async function fixtures(): Promise<{ groupA: string; groupB: string; staffProfileId: string; definitionId: string }> {
    const [groupA, groupB] = await Promise.all([
      h.prisma.subjectGroup.create({ data: { code: `GA${crypto.randomUUID().slice(0, 5)}`, name: 'Group A' } }),
      h.prisma.subjectGroup.create({ data: { code: `GB${crypto.randomUUID().slice(0, 5)}`, name: 'Group B' } }),
    ]);
    const staff = await h.prisma.user.create({ data: { username: `staff-${crypto.randomUUID()}`, passwordHash: 'fixture', profile: { create: { displayName: 'Staff' } } }, include: { profile: true } });
    const definition = await h.prisma.additionalDutyDefinition.create({ data: { code: `D${crypto.randomUUID().slice(0, 6)}`, name: 'Duty', category: 'LEADERSHIP', validFrom: new Date('2026-01-01'), validUntil: new Date('2028-01-01') } });
    return { groupA: groupA.id, groupB: groupB.id, staffProfileId: staff.profile!.id, definitionId: definition.id };
  }

  it('enforces catalog authorization, SYSTEM_ADMIN isolation, first-login and CSRF', async () => {
    expect((await request(h.app.getHttpServer()).get('/api/additional-duty-definitions')).status).toBe(401);
    expect((await (await h.actor()).agent.get('/api/additional-duty-definitions')).status).toBe(403);
    expect((await (await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] })).agent.get('/api/additional-duty-definitions')).status).toBe(403);
    expect((await (await h.actor({ grants: [{ capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE' }], mustChangePassword: true })).agent.get('/api/additional-duty-definitions')).status).toBe(403);
    const manager = await h.actor({ grants: [{ capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE' }] });
    expect((await manager.agent.post('/api/additional-duty-definitions').send({ code: 'X', name: 'X', category: 'X' })).status).toBe(403);
    expect((await manager.agent.post('/api/additional-duty-definitions').set('Origin', testOrigin).send({ code: 'X', name: 'X', category: 'X' })).status).toBe(201);
  });

  it('implements options OR authorization without accepting admin-only filters', async () => {
    const refs = await fixtures();
    const catalog = await h.actor({ grants: [{ capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE' }] });
    const school = await h.actor({ grants: [{ capabilityKey: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE' }] });
    const group = await h.actor({ grants: [{ capabilityKey: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', scopeType: 'SUBJECT_GROUP', scopeResourceId: refs.groupA }] });
    for (const actor of [catalog, school, group]) expect((await actor.agent.get('/api/additional-duty-definitions/options?effectiveAt=2027-01-01')).status).toBe(200);
    expect((await (await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] })).agent.get('/api/additional-duty-definitions/options')).status).toBe(403);
    expect((await catalog.agent.get('/api/additional-duty-definitions/options?isActive=false')).status).toBe(400);
  });

  it('strictly filters definitions by false and effectiveAt and validates normalized fields', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE' }] });
    await h.prisma.additionalDutyDefinition.createMany({ data: [
      { code: 'OLD', name: 'Old', category: 'A', isActive: false, validFrom: new Date('2025-01-01'), validUntil: new Date('2026-01-01') },
      { code: 'CURRENT', name: 'Current', category: 'A', validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01') },
    ] });
    expect((await manager.agent.get('/api/additional-duty-definitions?isActive=false')).body.items.map((row: { code: string }) => row.code)).toEqual(['OLD']);
    expect((await manager.agent.get('/api/additional-duty-definitions?effectiveAt=2026-06-01')).body.items.map((row: { code: string }) => row.code)).toEqual(['CURRENT']);
    expect((await manager.agent.get('/api/additional-duty-definitions?isActive=0')).status).toBe(400);
    const created = await manager.agent.post('/api/additional-duty-definitions').set('Origin', testOrigin).set('X-Request-Id', 'definition-create').send({ code: '  leader  ', name: '  Leader  ', description: '  Desc  ', category: '  Management  ', sortOrder: 1 });
    expect(created.body).toMatchObject({ code: 'LEADER', name: 'Leader', description: 'Desc', category: 'Management', sortOrder: 1 });
    for (const body of [{ code: ' ', name: 'X', category: 'X' }, { code: 'X', name: ' ', category: 'X' }, { code: 'X', name: 'X', category: ' ' }, { code: 'X', name: 'X', category: 'X', sortOrder: -1 }, { code: 'X', name: 'X', category: 'X', description: null }, { code: 'X', name: 'X', category: 'X', validUntil: null }]) {
      expect((await manager.agent.post('/api/additional-duty-definitions').set('Origin', testOrigin).send(body)).status).toBe(400);
    }
  });

  it('protects definition history, handles duplicate PATCH and disables idempotently without ending assignments', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE' }] });
    const refs = await fixtures();
    const second = await h.prisma.additionalDutyDefinition.create({ data: { code: 'DUPLICATE', name: 'Second', category: 'X' } });
    await h.prisma.staffAdditionalDutyAssignment.create({ data: { staffProfileId: refs.staffProfileId, dutyDefinitionId: refs.definitionId, scopeType: 'SUBJECT_GROUP', scopeResourceId: refs.groupA, validFrom: new Date('2026-06-01'), validUntil: new Date('2026-07-01'), createdByUserId: manager.id } });
    expect((await manager.agent.patch(`/api/additional-duty-definitions/${refs.definitionId}`).set('Origin', testOrigin).send({ code: 'CHANGED' })).status).toBe(409);
    expect((await manager.agent.patch(`/api/additional-duty-definitions/${refs.definitionId}`).set('Origin', testOrigin).send({ name: '  Updated  ', description: null })).status).toBe(200);
    expect((await manager.agent.patch(`/api/additional-duty-definitions/${refs.definitionId}`).set('Origin', testOrigin).send({ name: ' ', category: ' ' })).status).toBe(400);
    expect((await manager.agent.patch(`/api/additional-duty-definitions/${second.id}`).set('Origin', testOrigin).send({ code: (await h.prisma.additionalDutyDefinition.findUniqueOrThrow({ where: { id: refs.definitionId } })).code })).status).toBe(409);
    const firstDisable = await manager.agent.post(`/api/additional-duty-definitions/${refs.definitionId}/disable`).set('Origin', testOrigin).set('X-Request-Id', 'definition-disable');
    const secondDisable = await manager.agent.post(`/api/additional-duty-definitions/${refs.definitionId}/disable`).set('Origin', testOrigin);
    expect(firstDisable.body.isActive).toBe(false);
    expect(secondDisable.body.isActive).toBe(false);
    expect(await h.prisma.staffAdditionalDutyAssignment.count({ where: { dutyDefinitionId: refs.definitionId } })).toBe(1);
    expect((await h.prisma.auditEvent.findFirstOrThrow({ where: { requestId: 'definition-disable' } })).metadata).toEqual({ previousIsActive: true, newIsActive: false });
  });

  it('supports school-wide and exact-group managers with DB-level list isolation and scoped detail denial', async () => {
    const refs = await fixtures();
    const school = await h.actor({ grants: [{ capabilityKey: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE' }] });
    const group = await h.actor({ grants: [{ capabilityKey: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', scopeType: 'SUBJECT_GROUP', scopeResourceId: refs.groupA }] });
    const groupA = await school.agent.post('/api/staff-additional-duty-assignments').set('Origin', testOrigin).send({ staffProfileId: refs.staffProfileId, dutyDefinitionId: refs.definitionId, scopeType: 'SUBJECT_GROUP', scopeResourceId: refs.groupA, validFrom: '2026-06-01', validUntil: '2026-07-01' });
    const groupB = await school.agent.post('/api/staff-additional-duty-assignments').set('Origin', testOrigin).send({ staffProfileId: refs.staffProfileId, dutyDefinitionId: refs.definitionId, scopeType: 'SUBJECT_GROUP', scopeResourceId: refs.groupB, validFrom: '2026-06-01', validUntil: '2026-07-01' });
    const schoolWide = await school.agent.post('/api/staff-additional-duty-assignments').set('Origin', testOrigin).send({ staffProfileId: refs.staffProfileId, dutyDefinitionId: refs.definitionId, scopeType: 'SCHOOL_WIDE', validFrom: '2026-06-01', validUntil: '2026-07-01' });
    expect(groupA.status).toBe(201); expect(groupB.status).toBe(201); expect(schoolWide.status).toBe(201);
    const isolated = await group.agent.get('/api/staff-additional-duty-assignments');
    expect(isolated.body.total).toBe(1);
    expect(isolated.body.items[0].scopeResourceId).toBe(refs.groupA);
    expect((await group.agent.get(`/api/staff-additional-duty-assignments?scopeResourceId=${refs.groupB}`)).status).toBe(403);
    expect((await group.agent.get(`/api/staff-additional-duty-assignments/${groupB.body.id as string}`)).status).toBe(403);
    expect((await group.agent.get(`/api/staff-additional-duty-assignments/${groupA.body.id as string}`)).status).toBe(200);
    expect((await group.agent.get(`/api/staff-additional-duty-assignments/${schoolWide.body.id as string}`)).status).toBe(403);
  });

  it('rejects overlap, permits adjacency, rolls back PATCH and ends after catalogs become inactive', async () => {
    const refs = await fixtures();
    const manager = await h.actor({ grants: [{ capabilityKey: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE' }] });
    const base = { staffProfileId: refs.staffProfileId, dutyDefinitionId: refs.definitionId, scopeType: 'SUBJECT_GROUP', scopeResourceId: refs.groupA };
    const first = await manager.agent.post('/api/staff-additional-duty-assignments').set('Origin', testOrigin).send({ ...base, validFrom: '2026-06-01', validUntil: '2026-07-01' });
    expect((await manager.agent.post('/api/staff-additional-duty-assignments').set('Origin', testOrigin).send({ ...base, validFrom: '2026-06-15', validUntil: '2026-06-20' })).status).toBe(409);
    const adjacent = await manager.agent.post('/api/staff-additional-duty-assignments').set('Origin', testOrigin).send({ ...base, validFrom: '2026-07-01' });
    expect(adjacent.status).toBe(201);
    expect((await manager.agent.patch(`/api/staff-additional-duty-assignments/${first.body.id as string}`).set('Origin', testOrigin).send({ validUntil: '2026-07-15' })).status).toBe(409);
    expect((await h.prisma.staffAdditionalDutyAssignment.findUniqueOrThrow({ where: { id: first.body.id as string } })).validUntil).toEqual(new Date('2026-07-01'));
    await h.prisma.subjectGroup.update({ where: { id: refs.groupA }, data: { status: 'INACTIVE' } });
    await h.prisma.additionalDutyDefinition.update({ where: { id: refs.definitionId }, data: { isActive: false } });
    const before = await h.prisma.capabilityGrant.count();
    const ended = await manager.agent.post(`/api/staff-additional-duty-assignments/${adjacent.body.id as string}/end`).set('Origin', testOrigin).set('X-Request-Id', 'duty-end').send({ endAt: '2026-08-01' });
    expect(ended.status).toBe(200);
    expect((await manager.agent.post(`/api/staff-additional-duty-assignments/${adjacent.body.id as string}/end`).set('Origin', testOrigin).send({ endAt: '2026-09-01' })).body.validUntil).toBe(ended.body.validUntil);
    expect(await h.prisma.capabilityGrant.count()).toBe(before);
  });

  it('rolls back definition create/disable and assignment create/end when audit writing fails', async () => {
    const refs = await fixtures();
    const failing = new AdditionalDutiesService(h.prisma as never, { write: jest.fn().mockRejectedValue(new Error('audit unavailable')) } as never);
    await expect(failing.createDefinition({ code: 'ROLLBACK', name: 'Rollback', category: 'X' }, 'actor', {})).rejects.toThrow('audit unavailable');
    expect(await h.prisma.additionalDutyDefinition.count({ where: { code: 'ROLLBACK' } })).toBe(0);
    await expect(failing.disableDefinition(refs.definitionId, 'actor', {})).rejects.toThrow('audit unavailable');
    expect((await h.prisma.additionalDutyDefinition.findUniqueOrThrow({ where: { id: refs.definitionId } })).isActive).toBe(true);
    const payload = { staffProfileId: refs.staffProfileId, dutyDefinitionId: refs.definitionId, scopeType: 'SUBJECT_GROUP' as const, scopeResourceId: refs.groupA, validFrom: '2026-06-01' };
    await expect(failing.createAssignment(payload, 'actor', {})).rejects.toThrow('audit unavailable');
    expect(await h.prisma.staffAdditionalDutyAssignment.count()).toBe(0);
    const assignment = await h.prisma.staffAdditionalDutyAssignment.create({ data: { staffProfileId: refs.staffProfileId, dutyDefinitionId: refs.definitionId, scopeType: 'SUBJECT_GROUP', scopeResourceId: refs.groupA, validFrom: new Date('2026-06-01'), createdByUserId: (await h.prisma.user.findFirstOrThrow()).id } });
    await expect(failing.endAssignment(assignment.id, { endAt: '2026-07-01' }, 'actor', {})).rejects.toThrow('audit unavailable');
    expect((await h.prisma.staffAdditionalDutyAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).validUntil).toBeNull();
  });
});
