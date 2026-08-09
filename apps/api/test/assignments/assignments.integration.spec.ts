import request from 'supertest';
import { AssignmentsService } from '../../src/assignments/assignments.service';
import { normalizedCode, Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';

integration('Assignments API (isolated PostgreSQL integration)', () => {
  const h = new Phase01Harness();

  beforeAll(() => h.start());
  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities([
      { key: 'SUBJECT_GROUP_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SUBJECT_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  });
  afterAll(() => h.stop());

  async function references(): Promise<{ userId: string; groupId: string; subjectId: string }> {
    const user = await h.prisma.user.create({ data: { username: `target-${crypto.randomUUID()}`, passwordHash: 'fixture' } });
    const group = await h.prisma.subjectGroup.create({ data: { code: normalizedCode('G', 6), name: 'Group' } });
    const subject = await h.prisma.subject.create({ data: { code: normalizedCode('S', 6), name: 'Subject' } });
    return { userId: user.id, groupId: group.id, subjectId: subject.id };
  }

  it('enforces 401, capability isolation, SYSTEM_ADMIN denial, first-login and CSRF', async () => {
    expect((await request(h.app.getHttpServer()).get('/api/subject-group-memberships')).status).toBe(401);
    const none = await h.actor();
    expect((await none.agent.get('/api/subject-group-memberships')).status).toBe(403);
    const admin = await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] });
    expect((await admin.agent.get('/api/staff-subjects')).status).toBe(403);
    const firstLogin = await h.actor({ grants: [{ capabilityKey: 'SUBJECT_MANAGE' }], mustChangePassword: true });
    expect((await firstLogin.agent.get('/api/staff-subjects')).status).toBe(403);
    const manager = await h.actor({ grants: [{ capabilityKey: 'SUBJECT_GROUP_MANAGE' }] });
    const refs = await references();
    expect((await manager.agent.post('/api/subject-group-memberships').send({ userId: refs.userId, subjectGroupId: refs.groupId })).status).toBe(403);
    const created = await manager.agent.post('/api/subject-group-memberships').set('Origin', testOrigin).send({ userId: refs.userId, subjectGroupId: refs.groupId });
    expect(created.status).toBe(201);
    expect((await manager.agent.get(`/api/subject-group-memberships/${created.body.id as string}`)).status).toBe(200);
    expect((await manager.agent.get('/api/subject-group-memberships/not-a-uuid')).status).toBe(400);
    expect((await manager.agent.get('/api/subject-group-memberships/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('creates both public-safe assignment records without capability side effects', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SUBJECT_GROUP_MANAGE' }, { capabilityKey: 'SUBJECT_MANAGE' }] });
    const refs = await references();
    const before = await h.prisma.capabilityGrant.count();
    const membership = await manager.agent.post('/api/subject-group-memberships').set('Origin', testOrigin).set('X-Request-Id', 'membership-create').send({ userId: refs.userId, subjectGroupId: refs.groupId, isPrimary: true });
    const staffSubject = await manager.agent.post('/api/staff-subjects').set('Origin', testOrigin).set('X-Request-Id', 'staff-subject-create').send({ userId: refs.userId, subjectId: refs.subjectId, isPrimary: false });
    expect(membership.status).toBe(201);
    expect(staffSubject.status).toBe(201);
    expect(Object.keys(membership.body).sort()).toEqual(['id', 'isPrimary', 'subjectGroupId', 'userId', 'validFrom'].sort());
    expect(Object.keys(staffSubject.body).sort()).toEqual(['id', 'isPrimary', 'subjectId', 'userId', 'validFrom'].sort());
    expect(await h.prisma.capabilityGrant.count()).toBe(before);
    expect((await h.prisma.auditEvent.findFirstOrThrow({ where: { requestId: 'membership-create' } })).metadata).toEqual({ userId: refs.userId, subjectGroupId: refs.groupId });
    expect((await h.prisma.auditEvent.findFirstOrThrow({ where: { requestId: 'staff-subject-create' } })).metadata).toEqual({ userId: refs.userId, subjectId: refs.subjectId });
  });

  it('strictly parses true and false filters and rejects null and invalid boolean tokens', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SUBJECT_GROUP_MANAGE' }, { capabilityKey: 'SUBJECT_MANAGE' }] });
    const refs = await references();
    await h.prisma.subjectGroupMembership.createMany({ data: [
      { userId: refs.userId, subjectGroupId: refs.groupId, validFrom: new Date('2026-01-01'), validUntil: new Date('2026-02-01'), isPrimary: true },
      { userId: refs.userId, subjectGroupId: refs.groupId, validFrom: new Date('2026-02-01'), validUntil: new Date('2026-03-01'), isPrimary: false },
    ] });
    expect((await manager.agent.get('/api/subject-group-memberships?isPrimary=true')).body.items.every((row: { isPrimary: boolean }) => row.isPrimary)).toBe(true);
    expect((await manager.agent.get('/api/subject-group-memberships?isPrimary=false')).body.items.every((row: { isPrimary: boolean }) => !row.isPrimary)).toBe(true);
    for (const token of ['1', '0', 'yes', 'no', 'random']) expect((await manager.agent.get(`/api/subject-group-memberships?isPrimary=${token}`)).status).toBe(400);
    for (const body of [{ validFrom: null }, { validUntil: null }, { isPrimary: null }]) {
      expect((await manager.agent.post('/api/staff-subjects').set('Origin', testOrigin).send({ userId: refs.userId, subjectId: refs.subjectId, ...body })).status).toBe(400);
    }
    const inactive = await references();
    await h.prisma.subjectGroup.update({ where: { id: inactive.groupId }, data: { status: 'INACTIVE' } });
    await h.prisma.subject.update({ where: { id: inactive.subjectId }, data: { status: 'INACTIVE' } });
    expect((await manager.agent.post('/api/subject-group-memberships').set('Origin', testOrigin).send({ userId: inactive.userId, subjectGroupId: inactive.groupId })).status).toBe(409);
    expect((await manager.agent.post('/api/staff-subjects').set('Origin', testOrigin).send({ userId: inactive.userId, subjectId: inactive.subjectId })).status).toBe(409);
  });

  it('enforces overlap, permits adjacency and applies half-open activeAt boundaries', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SUBJECT_GROUP_MANAGE' }] });
    const refs = await references();
    const base = { userId: refs.userId, subjectGroupId: refs.groupId };
    expect((await manager.agent.post('/api/subject-group-memberships').set('Origin', testOrigin).send({ ...base, validFrom: '2026-01-01T00:00:00Z', validUntil: '2026-02-01T00:00:00Z' })).status).toBe(201);
    expect((await manager.agent.post('/api/subject-group-memberships').set('Origin', testOrigin).send({ ...base, validFrom: '2026-01-15T00:00:00Z', validUntil: '2026-01-20T00:00:00Z' })).status).toBe(409);
    expect((await manager.agent.post('/api/subject-group-memberships').set('Origin', testOrigin).send({ ...base, validFrom: '2026-02-01T00:00:00Z', validUntil: '2026-03-01T00:00:00Z' })).status).toBe(201);
    expect((await manager.agent.get('/api/subject-group-memberships?activeAt=2026-02-01T00:00:00Z')).body.total).toBe(1);
  });

  it('rolls back conflicting PATCH, ends idempotently and writes deterministic audits', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SUBJECT_MANAGE' }] });
    const refs = await references();
    const first = await h.prisma.staffSubject.create({ data: { userId: refs.userId, subjectId: refs.subjectId, validFrom: new Date('2026-01-01'), validUntil: new Date('2026-02-01') } });
    await h.prisma.staffSubject.create({ data: { userId: refs.userId, subjectId: refs.subjectId, validFrom: new Date('2026-02-01'), validUntil: new Date('2026-03-01') } });
    expect((await manager.agent.patch(`/api/staff-subjects/${first.id}`).set('Origin', testOrigin).send({ validUntil: '2026-02-15T00:00:00Z' })).status).toBe(409);
    expect((await h.prisma.staffSubject.findUniqueOrThrow({ where: { id: first.id } })).validUntil).toEqual(new Date('2026-02-01'));
    const open = await h.prisma.staffSubject.create({ data: { userId: refs.userId, subjectId: refs.subjectId, validFrom: new Date('2026-03-01') } });
    const ended = await manager.agent.post(`/api/staff-subjects/${open.id}/end`).set('Origin', testOrigin).set('X-Request-Id', 'staff-end').send({ endAt: '2026-04-01T00:00:00Z' });
    expect(ended.status).toBe(200);
    expect((await manager.agent.post(`/api/staff-subjects/${open.id}/end`).set('Origin', testOrigin).send({ endAt: '2026-05-01T00:00:00Z' })).body.validUntil).toBe(ended.body.validUntil);
    expect((await h.prisma.auditEvent.findFirstOrThrow({ where: { requestId: 'staff-end' } })).metadata).toEqual({ previousValidUntil: null, newValidUntil: '2026-04-01T00:00:00.000Z' });
  });

  it('rolls back both real PostgreSQL create transactions when audit writing fails', async () => {
    const refs = await references();
    const service = new AssignmentsService(h.prisma as never, { write: jest.fn().mockRejectedValue(new Error('audit unavailable')) } as never);
    await expect(service.createMembership({ userId: refs.userId, subjectGroupId: refs.groupId }, 'actor', {})).rejects.toThrow('audit unavailable');
    await expect(service.createStaffSubject({ userId: refs.userId, subjectId: refs.subjectId }, 'actor', {})).rejects.toThrow('audit unavailable');
    expect(await h.prisma.subjectGroupMembership.count()).toBe(0);
    expect(await h.prisma.staffSubject.count()).toBe(0);
  });

  it('writes all six deterministic audits with complete metadata and rejects mass assignment', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'SUBJECT_GROUP_MANAGE' }, { capabilityKey: 'SUBJECT_MANAGE' }] });
    const refs = await references();
    const membership = await manager.agent.post('/api/subject-group-memberships').set('Origin', testOrigin).set('X-Request-Id', 'm-create').send({ userId: refs.userId, subjectGroupId: refs.groupId, validFrom: '2026-01-01' });
    await manager.agent.patch(`/api/subject-group-memberships/${membership.body.id as string}`).set('Origin', testOrigin).set('X-Request-Id', 'm-update').send({ isPrimary: true });
    await manager.agent.post(`/api/subject-group-memberships/${membership.body.id as string}/end`).set('Origin', testOrigin).set('X-Request-Id', 'm-end').send({ endAt: '2026-02-01' });
    const staff = await manager.agent.post('/api/staff-subjects').set('Origin', testOrigin).set('X-Request-Id', 's-create').send({ userId: refs.userId, subjectId: refs.subjectId, validFrom: '2026-01-01' });
    await manager.agent.patch(`/api/staff-subjects/${staff.body.id as string}`).set('Origin', testOrigin).set('X-Request-Id', 's-update').send({ isPrimary: true });
    await manager.agent.post(`/api/staff-subjects/${staff.body.id as string}/end`).set('Origin', testOrigin).set('X-Request-Id', 's-end').send({ endAt: '2026-02-01' });
    const expected = [
      ['m-create', 'SUBJECT_GROUP_MEMBERSHIP_CREATED'], ['m-update', 'SUBJECT_GROUP_MEMBERSHIP_UPDATED'], ['m-end', 'SUBJECT_GROUP_MEMBERSHIP_ENDED'],
      ['s-create', 'STAFF_SUBJECT_CREATED'], ['s-update', 'STAFF_SUBJECT_UPDATED'], ['s-end', 'STAFF_SUBJECT_ENDED'],
    ] as const;
    for (const [requestId, action] of expected) expect(await h.prisma.auditEvent.count({ where: { requestId, action, actorUserId: manager.id, result: 'SUCCESS' } })).toBe(1);
    expect((await h.prisma.auditEvent.findFirstOrThrow({ where: { requestId: 'm-update' } })).metadata).toEqual({ changedFields: ['isPrimary'] });
    expect((await h.prisma.auditEvent.findFirstOrThrow({ where: { requestId: 's-update' } })).metadata).toEqual({ changedFields: ['isPrimary'] });
    for (const body of [{}, { userId: refs.userId }, { subjectId: refs.subjectId }, { id: staff.body.id }, { createdAt: 'x' }]) {
      expect((await manager.agent.patch(`/api/staff-subjects/${staff.body.id as string}`).set('Origin', testOrigin).send(body)).status).toBe(400);
    }
  });
});
