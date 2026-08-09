import request from 'supertest';
import { Phase01Harness, integration } from '../helpers/phase01-test-harness';

integration('Audit viewer API (isolated PostgreSQL integration)', () => {
  const h = new Phase01Harness();
  beforeAll(() => h.start());
  beforeEach(async () => {
    await h.clean();
    await h.seedCapabilities([
      { key: 'AUDIT_VIEW', scopes: ['SCHOOL_WIDE'] },
      { key: 'SYSTEM_ADMIN', scopes: ['SCHOOL_WIDE'] },
    ]);
  });
  afterAll(async () => {
    try {
      await h.clean();
    } finally {
      await h.stop();
    }
  });

  it('enforces session, AUDIT_VIEW, SYSTEM_ADMIN isolation and first-login denial', async () => {
    expect((await request(h.app.getHttpServer()).get('/api/audit-events')).status).toBe(401);
    expect((await (await h.actor()).agent.get('/api/audit-events')).status).toBe(403);
    expect((await (await h.actor({ grants: [{ capabilityKey: 'SYSTEM_ADMIN' }] })).agent.get('/api/audit-events')).status).toBe(403);
    expect((await (await h.actor({ grants: [{ capabilityKey: 'AUDIT_VIEW' }], mustChangePassword: true })).agent.get('/api/audit-events')).status).toBe(403);
    expect((await (await h.actor({ grants: [{ capabilityKey: 'AUDIT_VIEW' }] })).agent.get('/api/audit-events')).status).toBe(200);
  });

  it('supports every filter, combined filters, stable order, pagination and totals', async () => {
    const viewer = await h.actor({ grants: [{ capabilityKey: 'AUDIT_VIEW' }] });
    const other = await h.prisma.user.create({ data: { username: 'audit-other', passwordHash: 'fixture' } });
    await h.prisma.auditEvent.createMany({ data: [
      { actorUserId: other.id, action: 'ALPHA', entityType: 'Thing', entityId: 'one', requestId: 'req-1', result: 'SUCCESS', createdAt: new Date('2026-01-01T00:00:00Z') },
      { actorUserId: other.id, action: 'BETA', entityType: 'Thing', entityId: 'two', requestId: 'req-2', result: 'FAILURE', createdAt: new Date('2026-01-02T00:00:00Z') },
      { action: 'ALPHA', entityType: 'Other', entityId: 'three', requestId: 'req-3', result: 'DENIED', createdAt: new Date('2026-01-03T00:00:00Z') },
    ] });
    const cases = [
      [`actorUserId=${other.id}`, 2], ['action=ALPHA', 2], ['entityType=Thing', 2], ['entityId=two', 1], ['requestId=req-3', 1], ['result=FAILURE', 1],
      [`actorUserId=${other.id}&entityType=Thing&result=SUCCESS`, 1],
    ] as const;
    for (const [query, total] of cases) expect((await viewer.agent.get(`/api/audit-events?${query}`)).body.total).toBe(total);
    const page = await viewer.agent.get('/api/audit-events?page=1&pageSize=2');
    expect(page.body.total).toBeGreaterThanOrEqual(3);
    expect(page.body.items).toHaveLength(2);
    expect(new Date(page.body.items[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(page.body.items[1].createdAt).getTime());
  });

  it('uses half-open date boundaries and rejects invalid query matrices', async () => {
    const viewer = await h.actor({ grants: [{ capabilityKey: 'AUDIT_VIEW' }] });
    await h.prisma.auditEvent.createMany({ data: [
      { action: 'BOUNDARY', entityType: 'Thing', result: 'SUCCESS', createdAt: new Date('2026-02-01T00:00:00Z') },
      { action: 'BOUNDARY', entityType: 'Thing', result: 'SUCCESS', createdAt: new Date('2026-02-02T00:00:00Z') },
    ] });
    const response = await viewer.agent.get('/api/audit-events?action=BOUNDARY&createdFrom=2026-02-01T00:00:00Z&createdTo=2026-02-02T00:00:00Z');
    expect(response.body.total).toBe(1);
    for (const query of ['page=0', 'pageSize=101', 'result=UNKNOWN', 'actorUserId=nope', 'createdFrom=nope', 'createdFrom=2026-02-02&createdTo=2026-02-01', 'unknown=1']) {
      expect((await viewer.agent.get(`/api/audit-events?${query}`)).status).toBe(400);
    }
  });

  it('recursively strips exact sensitive keys without mutating stored PostgreSQL metadata', async () => {
    const viewer = await h.actor({ grants: [{ capabilityKey: 'AUDIT_VIEW' }] });
    const metadata = {
      safe: 'visible',
      nested: {
        password: 'x', passwordHash: 'x', token: 'x', tokenHash: 'x', cookie: 'x', secret: 'x', credential: 'x', apiKey: 'x', DATABASE_URL: 'x', authorization: 'x', authorizationHeader: 'x', sessionToken: 'x',
        tokenizedLabel: 'must remain',
      },
      array: [{ secret: 'x', safeChild: true }],
    };
    const stored = await h.prisma.auditEvent.create({ data: { action: 'SENSITIVE_TEST', entityType: 'Thing', result: 'SUCCESS', metadata } });
    const response = await viewer.agent.get('/api/audit-events?action=SENSITIVE_TEST');
    expect(response.body.items[0].metadata).toEqual({ safe: 'visible', nested: { tokenizedLabel: 'must remain' }, array: [{ safeChild: true }] });
    expect((await h.prisma.auditEvent.findUniqueOrThrow({ where: { id: stored.id } })).metadata).toEqual(metadata);
    expect(response.body.items[0]).not.toHaveProperty('actor');
  });
});
