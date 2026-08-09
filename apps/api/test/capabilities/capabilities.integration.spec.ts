import request from 'supertest';
import { CapabilitiesService } from '../../src/capabilities/capabilities.service';
import { CapabilityAuthorizationService } from '../../src/authorization/capability-authorization.service';
import { Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';

integration('Capability management API (isolated PostgreSQL integration)', () => {
  const h = new Phase01Harness();
  beforeAll(() => h.start());
  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities([
      { key: 'CAPABILITY_GRANT', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
      { key: 'TEACHER_BASE', scopes: ['PERSONAL'] },
      { key: 'SUBJECT_GROUP_LEAD', scopes: ['SUBJECT_GROUP'] },
      { key: 'SUBJECT_MANAGE', scopes: ['SUBJECT'] },
      { key: 'GDDDP_COORDINATOR', scopes: ['ACTIVITY'] },
    ]);
  });
  afterAll(() => h.stop());

  async function target(): Promise<string> {
    return (await h.prisma.user.create({ data: { username: `target-${crypto.randomUUID()}`, passwordHash: 'fixture', status: 'ACTIVE', mustChangePassword: false } })).id;
  }

  it('enforces the full authorization matrix and CSRF boundary', async () => {
    expect((await request(h.app.getHttpServer()).get('/api/capabilities')).status).toBe(401);
    expect((await (await h.actor()).agent.get('/api/capabilities')).status).toBe(403);
    expect((await (await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] })).agent.get('/api/capabilities')).status).toBe(403);
    expect((await (await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }], mustChangePassword: true })).agent.get('/api/capabilities')).status).toBe(403);
    const manager = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await target();
    expect((await manager.agent.post(`/api/users/${userId}/capability-grants`).send({ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' })).status).toBe(403);
    expect((await manager.agent.post(`/api/users/${userId}/capability-grants`).set('Origin', testOrigin).send({ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' })).status).toBe(201);
  });

  it('returns 404 for nonexistent target users on list and create', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await manager.agent.get(`/api/users/${missing}/capability-grants`)).status).toBe(404);
    expect((await manager.agent.post(`/api/users/${missing}/capability-grants`).set('Origin', testOrigin).send({ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' })).status).toBe(404);
  });

  it('strictly handles false filters and activeAt excludes revoked and validUntil boundary rows', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await target();
    await h.prisma.capabilityDefinition.update({ where: { key: 'GDDDP_COORDINATOR' }, data: { isActive: false } });
    const inactive = await manager.agent.get('/api/capabilities?isActive=false');
    expect(inactive.body.items.map((row: { key: string }) => row.key)).toEqual(['GDDDP_COORDINATOR']);
    expect((await manager.agent.get('/api/capabilities?isActive=0')).status).toBe(400);
    await h.prisma.capabilityGrant.createMany({ data: [
      { userId, capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', validFrom: new Date('2026-01-01'), validUntil: new Date('2026-02-01') },
      { userId, capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', validFrom: new Date('2026-02-01'), validUntil: new Date('2026-03-01'), revokedAt: new Date('2026-02-15') },
    ] });
    expect((await manager.agent.get(`/api/users/${userId}/capability-grants?revoked=false`)).body.total).toBe(1);
    expect((await manager.agent.get(`/api/users/${userId}/capability-grants?activeAt=2026-02-01T00:00:00Z`)).body.total).toBe(0);
    expect((await manager.agent.get(`/api/users/${userId}/capability-grants?revoked=zero`)).status).toBe(400);
  });

  it('creates all scope shapes, validates resources and maps only public fields', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const userId = await target();
    const group = await h.prisma.subjectGroup.create({ data: { code: 'CAP_GROUP', name: 'Group' } });
    const subject = await h.prisma.subject.create({ data: { code: 'CAP_SUBJECT', name: 'Subject' } });
    const activityId = crypto.randomUUID();
    const payloads = [
      { capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' },
      { capabilityKey: 'SUBJECT_GROUP_LEAD', scopeType: 'SUBJECT_GROUP', scopeResourceId: group.id },
      { capabilityKey: 'SUBJECT_MANAGE', scopeType: 'SUBJECT', scopeResourceId: subject.id },
      { capabilityKey: 'GDDDP_COORDINATOR', scopeType: 'ACTIVITY', scopeResourceId: activityId },
    ];
    await h.prisma.capabilityDefinition.update({ where: { key: 'GDDDP_COORDINATOR' }, data: { isActive: true } });
    for (const payload of payloads) {
      const response = await manager.agent.post(`/api/users/${userId}/capability-grants`).set('Origin', testOrigin).send(payload);
      expect(response.status).toBe(201);
      expect(response.body).not.toHaveProperty('createdAt');
      expect(response.body).not.toHaveProperty('updatedAt');
    }
    expect((await manager.agent.post(`/api/users/${userId}/capability-grants`).set('Origin', testOrigin).send({ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', scopeResourceId: userId })).status).toBe(400);
    expect((await manager.agent.post(`/api/users/${userId}/capability-grants`).set('Origin', testOrigin).send({ capabilityKey: 'SUBJECT_GROUP_LEAD', scopeType: 'SUBJECT_GROUP', scopeResourceId: crypto.randomUUID(), validFrom: '2027-01-01' })).status).toBe(404);
    expect((await manager.agent.post(`/api/users/${userId}/capability-grants`).set('Origin', testOrigin).send({ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', validUntil: null })).status).toBe(400);
    await h.prisma.subjectGroup.update({ where: { id: group.id }, data: { status: 'INACTIVE' } });
    expect((await manager.agent.post(`/api/users/${userId}/capability-grants`).set('Origin', testOrigin).send({ capabilityKey: 'SUBJECT_GROUP_LEAD', scopeType: 'SUBJECT_GROUP', scopeResourceId: group.id, validFrom: '2027-01-01' })).status).toBe(409);
  });

  it('permits adjacency, rejects overlap, integrates authorization and revokes idempotently', async () => {
    const manager = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const targetActor = await h.actor({ usernamePrefix: 'cap-target' });
    const userId = targetActor.id;
    const first = await manager.agent.post(`/api/users/${userId}/capability-grants`).set('Origin', testOrigin).set('X-Request-Id', 'grant-create').send({ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', validFrom: '2026-01-01', validUntil: '2026-02-01' });
    expect(first.status).toBe(201);
    expect((await manager.agent.post(`/api/users/${userId}/capability-grants`).set('Origin', testOrigin).send({ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', validFrom: '2026-01-15', validUntil: '2026-01-20' })).status).toBe(409);
    expect((await manager.agent.post(`/api/users/${userId}/capability-grants`).set('Origin', testOrigin).send({ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', validFrom: '2026-02-01', validUntil: '2026-03-01' })).status).toBe(201);
    const authorization = h.app.get(CapabilityAuthorizationService);
    expect(await authorization.hasCapability({ userId, capabilityKey: 'TEACHER_BASE', requestedScope: 'PERSONAL', atTime: new Date('2026-01-15') })).toBe(true);
    const effective = await manager.agent.post(`/api/users/${userId}/capability-grants`).set('Origin', testOrigin).send({ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' });
    expect((await targetActor.agent.get('/api/auth/me')).body.capabilities).toContainEqual({ key: 'TEACHER_BASE', scope: 'PERSONAL' });
    const revoked = await manager.agent.post(`/api/capability-grants/${effective.body.id as string}/revoke`).set('Origin', testOrigin).set('X-Request-Id', 'grant-revoke').send({ revokeReason: '  no longer needed  ' });
    expect((await targetActor.agent.get('/api/auth/me')).body.capabilities).not.toContainEqual({ key: 'TEACHER_BASE', scope: 'PERSONAL' });
    expect(revoked.body.revokeReason).toBe('no longer needed');
    const repeated = await manager.agent.post(`/api/capability-grants/${effective.body.id as string}/revoke`).set('Origin', testOrigin).send({ revokeReason: 'overwrite' });
    expect(repeated.body.revokedAt).toBe(revoked.body.revokedAt);
    expect(repeated.body.revokeReason).toBe('no longer needed');
    expect((await h.prisma.auditEvent.findFirstOrThrow({ where: { requestId: 'grant-create' } })).metadata).toMatchObject({ targetUserId: userId, capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' });
    expect((await h.prisma.auditEvent.findFirstOrThrow({ where: { requestId: 'grant-revoke' } })).metadata).toEqual({ targetUserId: userId, capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' });
    expect((await manager.agent.post(`/api/capability-grants/${first.body.id as string}/revoke`).set('Origin', testOrigin).send({ revokeReason: null })).status).toBe(400);
  });

  it('rolls back create and first revoke when audit writing fails', async () => {
    const userId = await target();
    const service = new CapabilitiesService(h.prisma as never, { write: jest.fn().mockRejectedValue(new Error('audit unavailable')) } as never);
    await expect(service.create(userId, { capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' }, userId, {})).rejects.toThrow('audit unavailable');
    expect(await h.prisma.capabilityGrant.count({ where: { userId } })).toBe(0);
    const grant = await h.prisma.capabilityGrant.create({ data: { userId, capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL', validFrom: new Date() } });
    await expect(service.revoke(grant.id, {}, userId, {})).rejects.toThrow('audit unavailable');
    expect((await h.prisma.capabilityGrant.findUniqueOrThrow({ where: { id: grant.id } })).revokedAt).toBeNull();
  });
});
