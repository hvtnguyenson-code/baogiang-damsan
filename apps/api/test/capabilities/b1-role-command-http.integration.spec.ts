import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Phase01Harness, integration, testOrigin } from '../helpers/phase01-test-harness';
import { B1RoleCommandHttpService } from '../../src/capabilities/b1-role-command-http.service';

const gateKeys = [
  'B1_ROLE_COMMANDS_ENABLED',
  'B1_REJECT_GENERIC_SENSITIVE_WRITES',
  'B1_LEGACY_PROVENANCE_RECONCILED',
  'B1_PRINCIPAL_POLICY_APPROVED',
  'B1_AUDIT_SOURCE_POLICY_APPROVED',
  'B1_PHT_CATALOG_POLICY_APPROVED',
] as const;

integration('P5-057 WS1 B1 — source-aware HTTP command boundary', () => {
  const h = new Phase01Harness();
  const original = new Map<string, string | undefined>(gateKeys.map((key): [string, string | undefined] => [key, process.env[key]]));

  const restore = () => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  const unset = () => gateKeys.forEach((key) => delete process.env[key]);
  const command = (targetUserId: string, role = 'PRINCIPAL') => ({
    operation: 'APPOINT', role, targetUserId,
    expectedSeatVersion: '1', expectedAuthorizationEpoch: '0',
    requestKey: `http-b1-${randomUUID()}`,
  });

  beforeAll(async () => {
    unset();
    await h.start();
  });
  beforeEach(async () => {
    unset();
    await h.clean();
    await h.seedCapabilities([
      { key: 'USER_MANAGE', scopes: ['SCHOOL_WIDE'] },
      { key: 'CAPABILITY_GRANT', scopes: ['SCHOOL_WIDE'] },
      { key: 'APPROVAL_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
      { key: 'AUDIT_VIEW', scopes: ['SCHOOL_WIDE'] },
    ]);
  });
  afterAll(async () => {
    try {
      if (h.prisma) await h.clean();
    } finally {
      await h.stop();
      restore();
    }
  });

  it('denies anonymous callers, missing origin and an otherwise permitted Admin while cutover is OFF', async () => {
    const admin = await h.actor({ grants: [
      { capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' },
    ] });
    const target = await h.actor();
    const endpoint = '/api/role-appointments/commands';
    const input = command(target.id);

    expect((await request(h.app.getHttpServer())
      .post(endpoint).set('Origin', testOrigin).send(input)).status).toBe(401);
    expect((await admin.agent.post(endpoint).send(input)).status).toBe(403);
    expect((await admin.agent.post(endpoint).set('Origin', testOrigin).send(input)).status).toBe(403);
    expect(await h.prisma.accessCommand.count()).toBe(0);
    expect(await h.prisma.roleAppointment.count()).toBe(0);
  });

  it('requires BOTH technical capabilities, even when cutover flags have all been asserted', async () => {
    const adminWithOne = await h.actor({ grants: [{ capabilityKey: 'CAPABILITY_GRANT' }] });
    const target = await h.actor();
    for (const key of gateKeys) process.env[key] = 'true';
    const response = await adminWithOne.agent.post('/api/role-appointments/commands')
      .set('Origin', testOrigin).send(command(target.id));
    expect(response.status).toBe(403);
    expect(await h.prisma.accessCommand.count()).toBe(0);
  });

  it('refuses partial activation, including a missing role-specific policy approval', async () => {
    const admin = await h.actor({ grants: [
      { capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' },
    ] });
    const target = await h.actor();
    for (const key of gateKeys) process.env[key] = 'true';
    delete process.env.B1_AUDIT_SOURCE_POLICY_APPROVED;
    const principal = await admin.agent.post('/api/role-appointments/commands')
      .set('Origin', testOrigin).send(command(target.id));
    expect(principal.status).toBe(403);
    delete process.env.B1_PHT_CATALOG_POLICY_APPROVED;
    const vice = await admin.agent.post('/api/role-appointments/commands')
      .set('Origin', testOrigin).send(command(target.id, 'VICE_PRINCIPAL_ACADEMIC'));
    expect(vice.status).toBe(403);
    expect(await h.prisma.accessCommand.count()).toBe(0);
  });

  it('rejects actor spoofing and malformed concurrency tokens in request body', async () => {
    const admin = await h.actor({ grants: [
      { capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' },
    ] });
    const target = await h.actor();
    const endpoint = '/api/role-appointments/commands';
    expect((await admin.agent.post(endpoint).set('Origin', testOrigin)
      .send({ ...command(target.id), actorUserId: randomUUID() })).status).toBe(400);
    expect((await admin.agent.post(endpoint).set('Origin', testOrigin)
      .send({ ...command(target.id), expectedAuthorizationEpoch: '-1' })).status).toBe(400);
    expect(await h.prisma.accessCommand.count()).toBe(0);
  });

  it('does not trust generic capabilities as proof of a B1 technical authority seat', async () => {
    const admin = await h.actor({ grants: [
      { capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' },
    ] });
    const target = await h.actor();
    await h.prisma.staffProfile.update({
      where: { userId: target.id }, data: { isTeachingStaff: true },
    });
    const seat = await h.prisma.authoritySeat.create({ data: {
      key: 'PRINCIPAL', enabled: true, policyVersion: 1n,
    } });
    try {
      for (const key of gateKeys) process.env[key] = 'true';
      const response = await admin.agent.post('/api/role-appointments/commands')
        .set('Origin', testOrigin).send(command(target.id));
      expect(response.status).toBe(403);
      expect(await h.prisma.accessCommand.count()).toBe(0);
      expect(await h.prisma.roleAppointment.count()).toBe(0);
    } finally {
      await h.prisma.authoritySeat.delete({ where: { id: seat.id } });
    }
  });

  it('offers only read-only, role-scoped command context to authorized Admin', async () => {
    const admin = await h.actor({ grants: [
      { capabilityKey: 'USER_MANAGE' }, { capabilityKey: 'CAPABILITY_GRANT' },
    ] });
    const response = await admin.agent.get('/api/role-appointments/command-context')
      .query({ role: 'PRINCIPAL' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      mode: 'READ_ONLY', canConfirm: false, verifiedTechnicalSeat: false,
      seatEnabled: false, expectedSeatVersion: null,
      expectedAuthorizationEpoch: '0', activeAppointments: [],
    });
    expect(response.body.activationBlockers).toContain('B1_ROLE_COMMANDS_ENABLED');
    const invalid = await admin.agent.get('/api/role-appointments/command-context')
      .query({ role: 'SCHOOL_ADMIN' });
    expect(invalid.status).toBe(400);
    expect(await h.prisma.accessCommand.count()).toBe(0);
  });

  it('pure gate matrix stays fail-closed for every independently missing flag', () => {
    for (const role of ['PRINCIPAL', 'VICE_PRINCIPAL_ACADEMIC'] as const) {
      for (const required of gateKeys) {
        const env = Object.fromEntries(gateKeys.map((key) => [key, 'true']));
        delete env[required];
        const result = B1RoleCommandHttpService.activationBlockers(role, env);
        if (required !== 'B1_PRINCIPAL_POLICY_APPROVED' && required !== 'B1_AUDIT_SOURCE_POLICY_APPROVED'
            && required !== 'B1_PHT_CATALOG_POLICY_APPROVED') {
          expect(result).toContain(required);
        } else if (role === 'PRINCIPAL' && required !== 'B1_PHT_CATALOG_POLICY_APPROVED') {
          expect(result).toContain(required);
        } else if (role === 'VICE_PRINCIPAL_ACADEMIC' && required === 'B1_PHT_CATALOG_POLICY_APPROVED') {
          expect(result).toContain(required);
        } else {
          expect(result).not.toContain(required);
        }
      }
    }
  });
});
