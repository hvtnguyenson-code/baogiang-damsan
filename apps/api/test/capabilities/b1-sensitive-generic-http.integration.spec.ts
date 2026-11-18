import request from 'supertest';
import { SENSITIVE_CAPABILITY_KEYS } from '../../src/capabilities/sensitive-capability-policy';
import { Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';

integration('P5-057 WS1 B1 — actual HTTP sensitive generic writer cutover boundary', () => {
  const h = new Phase01Harness();
  const previousFlag = process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES;

  beforeAll(async () => {
    process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = 'true';
    await h.start();
  });

  beforeEach(async () => {
    process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = 'true';
    await h.clean();
    const keys = new Set<string>([...SENSITIVE_CAPABILITY_KEYS, 'TEACHER_BASE']);
    await h.seedCapabilities(
      [...keys].map((key) => ({ key, scopes: ['SCHOOL_WIDE', 'PERSONAL'] })),
    );
  });

  afterAll(async () => {
    try {
      if (h.prisma) await h.clean();
    } finally {
      await h.stop();
      if (previousFlag === undefined) delete process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES;
      else process.env.B1_REJECT_GENERIC_SENSITIVE_WRITES = previousFlag;
    }
  });

  it('enforces session and CSRF, denies all nine sensitive grants even to CAPABILITY_GRANT admin', async () => {
    const target = await h.actor({ usernamePrefix: 'b1-http-target' });
    const operator = await h.actor({
      usernamePrefix: 'b1-http-admin', grants: [{ capabilityKey: 'CAPABILITY_GRANT' }],
    });
    const endpoint = `/api/users/${target.id}/capability-grants`;
    const payload = { capabilityKey: 'APPROVAL_PRINCIPAL', scopeType: 'SCHOOL_WIDE' };

    expect((await request(h.app.getHttpServer())
      .post(endpoint).set('Origin', testOrigin).send(payload)).status).toBe(401);
    expect((await operator.agent.post(endpoint).send(payload)).status).toBe(403);

    for (const capabilityKey of SENSITIVE_CAPABILITY_KEYS) {
      const response = await operator.agent.post(endpoint).set('Origin', testOrigin)
        .send({ capabilityKey, scopeType: 'SCHOOL_WIDE' });
      expect(response.status).toBe(403);
    }

    expect(await h.prisma.capabilityGrant.count({ where: { userId: target.id } })).toBe(0);
    expect(await h.prisma.roleAppointment.count({ where: { userId: target.id } })).toBe(0);
    expect(await h.prisma.grantSource.count({ where: { userId: target.id } })).toBe(0);
  });

  it('rejects revocation of each sensitive grant without modifying it, including prior revocation', async () => {
    const target = await h.actor({ usernamePrefix: 'b1-http-revoke-target' });
    const operator = await h.actor({
      usernamePrefix: 'b1-http-revoke-admin', grants: [{ capabilityKey: 'CAPABILITY_GRANT' }],
    });

    for (const capabilityKey of SENSITIVE_CAPABILITY_KEYS) {
      const grant = await h.prisma.capabilityGrant.create({
        data: {
          userId: target.id, capabilityKey, scopeType: 'SCHOOL_WIDE',
          validFrom: new Date(Date.now() - 60_000),
        },
      });
      const response = await operator.agent.post(`/api/capability-grants/${grant.id}/revoke`)
        .set('Origin', testOrigin).send({ revokeReason: 'Denied by B1 cutover test' });
      expect(response.status).toBe(403);
      const retained = await h.prisma.capabilityGrant.findUniqueOrThrow({ where: { id: grant.id } });
      expect(retained.revokedAt).toBeNull();
    }

    const historical = await h.prisma.capabilityGrant.create({
      data: {
        userId: target.id, capabilityKey: 'AUDIT_VIEW', scopeType: 'SCHOOL_WIDE',
        validFrom: new Date(Date.now() - 180_000),
        validUntil: new Date(Date.now() - 130_000),
        revokedAt: new Date(Date.now() - 140_000),
      },
    });
    expect((await operator.agent.post(`/api/capability-grants/${historical.id}/revoke`)
      .set('Origin', testOrigin).send({})).status).toBe(403);
    expect((await h.prisma.capabilityGrant.findUniqueOrThrow({ where: { id: historical.id } }))
      .revokedAt).toEqual(historical.revokedAt);
  });

  it('rejects mixed leadership and technical responsibility templates atomically', async () => {
    const target = await h.actor({ usernamePrefix: 'b1-http-template-target' });
    const operator = await h.actor({
      usernamePrefix: 'b1-http-template-admin', grants: [{ capabilityKey: 'CAPABILITY_GRANT' }],
    });
    await h.prisma.staffProfile.update({
      where: { userId: target.id }, data: { isTeachingStaff: true },
    });

    for (const templateKey of [
      'PRINCIPAL', 'VICE_PRINCIPAL_ACADEMIC', 'TECHNICAL_ACCOUNT_ADMIN',
    ]) {
      const response = await operator.agent
        .post(`/api/users/${target.id}/responsibility-templates/apply`)
        .set('Origin', testOrigin).send({ templateKey });
      expect(response.status).toBe(403);
    }

    expect(await h.prisma.capabilityGrant.count({ where: { userId: target.id } })).toBe(0);
    expect(await h.prisma.grantSource.count({ where: { userId: target.id } })).toBe(0);
  });

  it('still permits unrelated TEACHER_BASE for a different user while sensitive guard is on', async () => {
    const target = await h.actor({ usernamePrefix: 'b1-http-teacher-target' });
    const operator = await h.actor({
      usernamePrefix: 'b1-http-teacher-admin', grants: [{ capabilityKey: 'CAPABILITY_GRANT' }],
    });
    const response = await operator.agent
      .post(`/api/users/${target.id}/capability-grants`)
      .set('Origin', testOrigin)
      .send({ capabilityKey: 'TEACHER_BASE', scopeType: 'PERSONAL' });
    expect(response.status).toBe(201);
    expect(await h.prisma.capabilityGrant.count({
      where: { userId: target.id, capabilityKey: 'TEACHER_BASE', revokedAt: null },
    })).toBe(1);
  });
});
