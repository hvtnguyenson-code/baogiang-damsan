import request from 'supertest';
import { AccessBaselineService } from '../../src/capabilities/access-baseline.service';
import { Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';

integration('P5-057 WS1 appointment preflight API (read-only)', () => {
  const h = new Phase01Harness();
  const previewTemplate = jest.fn(async (userId: string) => ({
    templateKey: 'VICE_PRINCIPAL_ACADEMIC', version: 'v1',
    targetUser: { id: userId, username: 'target', displayName: 'Target', isTeachingStaff: true, status: 'ACTIVE' },
    eligibility: { isEligible: true }, requiredResources: { kind: 'NONE', provided: true },
    grantsToAdd: [], alreadyPresent: [], conflicts: [], forbiddenDefaults: [], notes: [],
  }));

  beforeAll(() => h.start([{
    token: AccessBaselineService, value: { previewTemplate },
  }]));
  beforeEach(async () => {
    await h.clean();
    previewTemplate.mockClear();
    await h.seedCapabilities([
      { key: 'CAPABILITY_GRANT', scopes: ['SCHOOL_WIDE'] },
      { key: 'USER_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'APPROVAL_VICE_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
    ]);
  });
  afterAll(async () => { try { await h.clean(); } finally { await h.stop(); } });

  it('requires authenticated, CSRF-verified Admin and refuses self-appointment', async () => {
    const target = await h.actor({ usernamePrefix: 'preview-target' });
    const admin = await h.actor({ usernamePrefix: 'preview-admin', grants: [
      { capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' },
    ] });
    const payload = { templateKey: 'VICE_PRINCIPAL_ACADEMIC', targetUserId: target.id };
    const endpoint = '/api/role-appointments/preflight';
    expect((await request(h.app.getHttpServer()).post(endpoint).set('Origin', testOrigin).send(payload)).status).toBe(401);
    expect((await admin.agent.post(endpoint).send(payload)).status).toBe(403);
    expect((await admin.agent.post(endpoint).set('Origin', testOrigin).send({
      templateKey: 'VICE_PRINCIPAL_ACADEMIC', targetUserId: admin.id,
    })).status).toBe(403);
    const response = await admin.agent.post(endpoint).set('Origin', testOrigin).send(payload);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ mode: 'READ_ONLY', canConfirm: false,
      confirmationBlocker: 'B1_SOURCE_WRITER_NOT_ACTIVE',
      evidence: { activeGrantCount: 0, provenanceVerified: false, b1Advisory: {
        mode: 'ADVISORY_ONLY', state: 'NO_LINKED_GRANTS', inspectedGrantCount: 0,
        supportCandidateGrantCount: 0, unverifiedLinkedGrantCount: 0, deferredLinkedGrantCount: 0,
      } },
    });
    expect(await h.prisma.roleAppointment.count()).toBe(0);
    expect(await h.prisma.grantSource.count()).toBe(0);
  });

  it('denies PHT preview without approval and permits review with approval (no writes)', async () => {
    const target = await h.actor({ usernamePrefix: 'ttcm-target' });
    const noAuthority = await h.actor({ grants: [{ capabilityKey: 'USER_MANAGE' }] });
    const pht = await h.actor({ grants: [{ capabilityKey: 'APPROVAL_VICE_PRINCIPAL' }] });
    const endpoint = '/api/role-appointments/preflight';
    const payload = { templateKey: 'SUBJECT_LEADER', targetUserId: target.id, subjectGroupId: crypto.randomUUID() };
    expect((await noAuthority.agent.post(endpoint).set('Origin', testOrigin).send(payload)).status).toBe(403);
    const response = await pht.agent.post(endpoint).set('Origin', testOrigin).send(payload);
    expect(response.status).toBe(200);
    expect(response.body.canConfirm).toBe(false);
    expect(await h.prisma.roleAppointment.count()).toBe(0);
    expect(await h.prisma.grantSource.count()).toBe(0);
  });

  it('preserves active legacy grants and never activates their unsupported B1 history', async () => {
    const target = await h.actor({
      usernamePrefix: 'legacy-role-target',
      grants: [{ capabilityKey: 'USER_MANAGE' }],
    });
    const admin = await h.actor({
      usernamePrefix: 'legacy-role-admin',
      grants: [{ capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' }],
    });
    const endpoint = '/api/role-appointments/preflight';
    const before = await h.prisma.capabilityGrant.findMany({
      where: { userId: target.id }, select: { id: true, coordinateId: true, revokedAt: true },
    });
    expect(before).toHaveLength(1);
    expect(before[0].coordinateId).toBeNull();
    const response = await admin.agent.post(endpoint).set('Origin', testOrigin).send({
      templateKey: 'VICE_PRINCIPAL_ACADEMIC', targetUserId: target.id,
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      mode: 'READ_ONLY', canConfirm: false,
      confirmationBlocker: 'B1_SOURCE_WRITER_NOT_ACTIVE',
      evidence: {
        activeGrantCount: 1, legacyUnlinkedActiveGrantCount: 1, provenanceVerified: false,
        b1Advisory: { mode: 'ADVISORY_ONLY', state: 'NO_LINKED_GRANTS', inspectedGrantCount: 0 },
      },
    });
    expect(await h.prisma.capabilityGrant.findMany({
      where: { userId: target.id }, select: { id: true, coordinateId: true, revokedAt: true },
    })).toEqual(before);
    expect(await h.prisma.grantSource.count()).toBe(0);
    expect(await h.prisma.roleAppointment.count()).toBe(0);
  });
});
