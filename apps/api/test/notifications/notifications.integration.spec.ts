import request from 'supertest';
import { createECDH, randomBytes } from 'node:crypto';
import { Prisma, WebPushDeliveryStatus } from '@prisma/client';
import { appConfig } from '../../src/config/app.config';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { WebPushHttpAdapter } from '../../src/notifications/web-push-http.adapter';
import { WebPushTransportPort } from '../../src/notifications/web-push-transport.port';
import { computeEndpointDigest } from '../../src/notifications/web-push-encryption.util';
import { inspectUserDeletionSchema } from '../../src/users/user-delete-schema';
import { Phase01Harness, integration, testDatabaseUrl, testOrigin, testPassword } from '../helpers/phase01-test-harness';
import { verifyReleaseSchema } from '../../../../scripts/deploy/node/verify-release-schema.cjs';

function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

jest.setTimeout(30000);

integration('P5-056 notifications security and concurrency (isolated PostgreSQL)', () => {
  const receiver = createECDH('prime256v1'); receiver.generateKeys();
  const keys = { p256dh: receiver.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
  const h = new Phase01Harness();
  const transport: jest.Mocked<WebPushTransportPort> = { sendNotification: jest.fn() };
  let service: NotificationsService;
  let a: Awaited<ReturnType<Phase01Harness['actor']>>;
  let b: typeof a;
  let approver: typeof a;
  let sessionA: string;
  let sessionB: string;
  let revisionId: string;

  beforeAll(async () => {
    process.env['DATABASE_URL'] = testDatabaseUrl!;
    const config = appConfig();
    await h.start([
      { token: 'APP_CONFIG', value: { ...config, webPush: { enabled: true, encryptionKey: 'isolated-push-test-key-not-a-runtime-secret' } } },
      { token: WebPushHttpAdapter, value: transport },
    ]);
    service = h.app.get(NotificationsService);
    service.onModuleDestroy(); // Deterministic manual worker ticks; no network/provider used.
  });
  afterAll(async () => { await h.clean(); await h.stop(); });
  beforeEach(async () => {
    await h.clean();
    transport.sendNotification.mockReset().mockResolvedValue({ success: true });
    await h.seedCapabilities([
      { key: 'REPORTING_STATEMENT_READ', scopes: ['PERSONAL', 'SCHOOL_WIDE'] },
      { key: 'APPROVAL_PRINCIPAL', scopes: ['SCHOOL_WIDE'] },
    ]);
    a = await h.actor({ grants: [{ capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'PERSONAL' }] });
    b = await h.actor({ grants: [{ capabilityKey: 'REPORTING_STATEMENT_READ', scopeType: 'PERSONAL' }] });
    approver = await h.actor({ grants: [{ capabilityKey: 'APPROVAL_PRINCIPAL' }] });
    sessionA = (await h.prisma.authSession.findFirstOrThrow({ where: { userId: a.id } })).id;
    sessionB = (await h.prisma.authSession.findFirstOrThrow({ where: { userId: b.id } })).id;
    const year = await h.prisma.academicYear.create({ data: { code: `N${crypto.randomUUID().slice(0, 8).toUpperCase()}`, name: 'Notification fixture' } });
    const series = await h.prisma.reportingStatementSeries.create({ data: {
      submitterUserId: a.id, academicYearId: year.id, statementProfile: 'PERSONAL_TEACHING_REPORTING_STATEMENT_V1',
      fromCivilDate: new Date('2026-08-01'), toCivilDate: new Date('2026-08-31'),
    } });
    const revision = await h.prisma.reportingStatementRevision.create({ data: {
      seriesId: series.id, snapshotProfile: 'REPORTING_STATEMENT_SNAPSHOT_V4', serializerVersion: 'v1',
      canonicalSnapshotJson: '{}', semanticHash: 'a'.repeat(64), asOfInstant: new Date(),
    } });
    revisionId = revision.id;
    await h.prisma.reportingStatementRevisionState.create({ data: {
      revisionId, seriesId: series.id, lifecycleState: 'APPROVED', lifecycleToken: crypto.randomUUID(),
    } });
  });

  const dto = (suffix: string) => ({ endpoint: `http://127.0.0.1:8088/push/${suffix}`, keys });
  async function subscribe(actor = a, suffix = 'device', session = sessionA) {
    const response = await actor.agent.post('/api/notifications/subscriptions').set('Origin', testOrigin).send(dto(suffix));
    expect(response.status).toBe(201);
    const sub = await h.prisma.webPushSubscription.findUniqueOrThrow({ where: { id: response.body.id as string } });
    expect(sub.authSessionId).toBe(session);
    return sub;
  }
  function notification(recipientUserId = a.id) {
    const key = crypto.randomUUID();
    return { recipientUserId, eventType: 'REPORTING_DECIDED', category: 'INFORMATION' as const,
      sourceKind: 'ReportingStatementRevision', sourceId: revisionId, sourceEventId: key, dedupeKey: key,
      title: 'Private source title', bodySafe: 'Private business text', actionKey: 'REPORTING_VIEW', actionParamsJson: { revisionId } };
  }
  async function publish() {
    return h.prisma.$transaction(tx => service.publishInAppNotification(tx, notification()));
  }

  it('proves fingerprint, enforcement and complete FK inventory separately', async () => {
    await expect(verifyReleaseSchema(h.prisma, inspectUserDeletionSchema)).resolves.toBeUndefined();
    expect(await inspectUserDeletionSchema(h.prisma)).toMatchObject({ fingerprintMatches: true, enforced: true, inventoryMatches: true, foreignKeyCount: 78 });
    await h.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('ALTER TABLE public.web_push_subscriptions ADD COLUMN unexpected_identity uuid');
      expect(await inspectUserDeletionSchema(tx)).toMatchObject({ fingerprintMatches: false, inventoryMatches: true });
      await expect(verifyReleaseSchema(tx, inspectUserDeletionSchema)).rejects.toThrow('RELEASE_SCHEMA_NOT_VERIFIED');
      throw new Error('rollback schema probe');
    }).catch(error => { expect((error as Error).message).toBe('rollback schema probe'); });
    await h.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY');
      expect(await inspectUserDeletionSchema(tx)).toMatchObject({ fingerprintMatches: true, enforced: false });
      throw new Error('rollback enforcement probe');
    }).catch(error => { expect((error as Error).message).toBe('rollback enforcement probe'); });
    await h.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('ALTER TABLE public.web_push_subscriptions DROP CONSTRAINT web_push_subscriptions_user_id_fkey');
      expect(await inspectUserDeletionSchema(tx)).toMatchObject({ fingerprintMatches: true, inventoryMatches: false });
      await expect(verifyReleaseSchema(tx, inspectUserDeletionSchema)).rejects.toThrow('RELEASE_SCHEMA_NOT_VERIFIED');
      throw new Error('rollback FK probe');
    }).catch(error => { expect((error as Error).message).toBe('rollback FK probe'); });
    await h.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('DROP INDEX public.web_push_subscriptions_endpoint_digest_key');
      await tx.$executeRawUnsafe('CREATE UNIQUE INDEX web_push_subscriptions_endpoint_digest_key ON public.web_push_subscriptions(endpoint_digest) WHERE revoked_at IS NULL');
      await expect(verifyReleaseSchema(tx, inspectUserDeletionSchema)).rejects.toThrow('RELEASE_NOTIFICATION_CONSTRAINTS_NOT_VERIFIED');
      throw new Error('rollback unique probe');
    }).catch(error => { expect((error as Error).message).toBe('rollback unique probe'); });
  });

  it('concurrent publication is idempotent for both inbox and outbox', async () => {
    await subscribe();
    for (let round = 1; round <= 3; round++) {
      const params = notification();
      const rows = await Promise.all(Array.from({ length: 8 }, () => h.prisma.$transaction(tx => service.publishInAppNotification(tx, params))));
      expect(rows.every(row => row !== null)).toBe(true);
      expect(new Set(rows.map(n => n!.id)).size).toBe(1);
      expect(await h.prisma.inAppNotification.count()).toBe(round);
      expect(await h.prisma.webPushDelivery.count()).toBe(round);
    }
  });

  it('rejects malformed/oversized subscription fields without storing credentials', async () => {
    for (const invalid of [
      { ...dto('bad'), endpoint: 'https://fcm.googleapis.com/' + 'x'.repeat(4096) },
      { ...dto('bad'), keys: { p256dh: { invalid: true }, auth: 'a' } },
      { ...dto('bad'), keys: { p256dh: 'x'.repeat(129), auth: 'a' } },
      { ...dto('bad'), keys: { ...keys, p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString('base64url') } },
    ]) {
      expect((await a.agent.post('/api/notifications/subscriptions').set('Origin', testOrigin).send(invalid)).status).toBe(400);
    }
    expect(await h.prisma.webPushSubscription.count()).toBe(0);
  });

  it('direct HTTP logout revokes exactly this session even without browser unsubscribe', async () => {
    const first = await subscribe();
    const user = await h.prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    const secondAgent = request.agent(h.app.getHttpServer());
    expect((await secondAgent.post('/api/auth/login').send({ username: user.username, password: testPassword })).status).toBe(200);
    const secondSession = await h.prisma.authSession.findFirstOrThrow({ where: { userId: a.id, id: { not: sessionA } } });
    const otherDevice = await subscribe({ id: a.id, agent: secondAgent }, 'other-device', secondSession.id);
    await publish();
    expect((await a.agent.post('/api/auth/logout').set('Origin', testOrigin)).status).toBe(200);
    expect((await h.prisma.webPushSubscription.findUniqueOrThrow({ where: { id: first.id } })).revokedAt).not.toBeNull();
    expect((await h.prisma.webPushSubscription.findUniqueOrThrow({ where: { id: otherDevice.id } })).revokedAt).toBeNull();
    expect(await h.prisma.webPushDelivery.count({ where: { subscriptionId: first.id, status: 'DEAD' } })).toBe(1);
    await service.processPendingDeliveries();
    expect(transport.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('logout-all leaves the other user subscriptions and deliveries intact', async () => {
    await subscribe();
    const foreign = await subscribe(b, 'foreign', sessionB);
    await publish();
    expect((await a.agent.post('/api/auth/logout-all').set('Origin', testOrigin)).status).toBe(200);
    expect(await h.prisma.webPushSubscription.count({ where: { userId: a.id, revokedAt: null } })).toBe(0);
    expect((await h.prisma.webPushSubscription.findUniqueOrThrow({ where: { id: foreign.id } })).revokedAt).toBeNull();
    expect(await h.prisma.webPushDelivery.count({ where: { notification: { recipientUserId: a.id }, status: 'DEAD' } })).toBe(1);
  });

  it('successful cookie replacement revokes old installation; failed login preserves it', async () => {
    const sub = await subscribe(); await publish();
    const nextUser = await h.prisma.user.findUniqueOrThrow({ where: { id: b.id } });
    expect((await a.agent.post('/api/auth/login').send({ username: nextUser.username, password: 'WrongPassword9' })).status).toBe(401);
    expect((await h.prisma.webPushSubscription.findUniqueOrThrow({ where: { id: sub.id } })).revokedAt).toBeNull();
    expect((await a.agent.post('/api/auth/login').send({ username: nextUser.username, password: testPassword })).status).toBe(200);
    expect((await h.prisma.webPushSubscription.findUniqueOrThrow({ where: { id: sub.id } })).revokedAt).not.toBeNull();
    expect(await h.prisma.webPushDelivery.findFirst({ where: { subscriptionId: sub.id } })).toMatchObject({ status: 'DEAD', lastErrorCode: 'SESSION_REPLACED' });
    expect((await a.agent.get('/api/notifications')).body.items).toEqual([]);
  });

  it('expires offline sessions and denies subscription creation with stale session identity', async () => {
    const sub = await subscribe();
    await publish();
    await h.prisma.authSession.update({ where: { id: sessionA }, data: {
      createdAt: new Date(Date.now() - 60000), lastSeenAt: new Date(Date.now() - 10000), expiresAt: new Date(Date.now() - 1000),
    } });
    await service.processPendingDeliveries();
    expect(transport.sendNotification).not.toHaveBeenCalled();
    expect((await h.prisma.webPushSubscription.findUniqueOrThrow({ where: { id: sub.id } })).revokedAt).not.toBeNull();
    await expect(service.createSubscription(a.id, dto('stale'), sessionA)).rejects.toThrow();
    expect((await a.agent.get('/api/notifications')).status).toBe(401);
  });

  it.each(['PENDING', 'LEASED', 'RETRY_WAIT'] as WebPushDeliveryStatus[])('handoff cancels %s without revoking another device', async status => {
    const shared = await subscribe();
    const independent = await subscribe(a, 'independent');
    await publish();
    await h.prisma.webPushDelivery.updateMany({ where: { subscriptionId: shared.id }, data: { status, leaseOwner: 'old-worker', leaseUntil: new Date(0) } });
    await subscribe(b, 'device', sessionB);
    const delivery = await h.prisma.webPushDelivery.findFirstOrThrow({ where: { subscriptionId: shared.id } });
    expect(delivery).toMatchObject({ status: 'DEAD', leaseOwner: null, leaseUntil: null });
    expect((await h.prisma.webPushSubscription.findUniqueOrThrow({ where: { id: independent.id } })).revokedAt).toBeNull();
    await service.processPendingDeliveries();
    expect(transport.sendNotification).toHaveBeenCalledTimes(1);
  });

  it.each([201, 410])('delayed transport %i cannot resurrect old lease or invalidate new ownership', async statusCode => {
    const sub = await subscribe();
    await publish();
    const entered = latch(); const resume = latch();
    transport.sendNotification.mockImplementation(async params => {
      expect(params.payload).toEqual({ title: 'Báo giảng Đam San', body: 'Bạn có thông báo mới trong hệ thống.', clickUrl: '/thong-bao' });
      entered.release(); await resume.promise;
      return { success: statusCode === 201, statusCode };
    });
    const tick = service.processPendingDeliveries();
    try { await entered.promise; await subscribe(b, 'device', sessionB); }
    finally { resume.release(); }
    const stats = await tick;
    expect(stats.sent).toBe(0);
    expect(await h.prisma.webPushDelivery.findFirst({ where: { subscriptionId: sub.id } })).toMatchObject({ status: 'DEAD', sentAt: null });
    expect(await h.prisma.webPushSubscription.findUnique({ where: { id: sub.id } })).toMatchObject({ userId: b.id, generation: 2, revokedAt: null, invalidatedAt: null });
    expect((await b.agent.get('/api/notifications')).body.items).toEqual([]);
  });

  it('concurrent admission never exceeds five and duplicate endpoint rebind has one row', async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => service.createSubscription(a.id, dto(`parallel-${i}`), sessionA)));
    expect(await h.prisma.webPushSubscription.count({ where: { userId: a.id, revokedAt: null } })).toBe(5);
    await Promise.all([service.createSubscription(a.id, dto('same'), sessionA), service.createSubscription(b.id, dto('same'), sessionB)]);
    const rebound = await h.prisma.webPushSubscription.findMany({ where: { endpointDigest: computeEndpointDigest(dto('same').endpoint) } });
    expect(rebound).toHaveLength(1);
    expect([a.id, b.id]).toContain(rebound[0].userId);
    expect(rebound[0]).toMatchObject({ generation: 2, authSessionId: rebound[0].userId === a.id ? sessionA : sessionB });
    expect(await h.prisma.webPushSubscription.count({ where: { userId: a.id, revokedAt: null } })).toBeLessThanOrEqual(5);
  });

  it('recovers expired lease, contenders send once, retry remains durable', async () => {
    const sub = await subscribe(); await publish();
    await h.prisma.webPushDelivery.updateMany({ data: { status: 'LEASED', leaseOwner: 'crashed', leaseUntil: new Date(0) } });
    transport.sendNotification.mockResolvedValue({ success: false, statusCode: 429, retryAfterSeconds: 60 });
    await Promise.all([service.processPendingDeliveries(), service.processPendingDeliveries()]);
    expect(transport.sendNotification).toHaveBeenCalledTimes(1);
    expect(await h.prisma.webPushDelivery.findFirst({ where: { subscriptionId: sub.id } })).toMatchObject({ status: 'RETRY_WAIT', attemptCount: 1, leaseOwner: null });
    await service.processPendingDeliveries(); expect(transport.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('source/capability revocation and cross-user access fail closed at every boundary', async () => {
    await subscribe(); const n = await publish(); expect(n).not.toBeNull();
    expect((await a.agent.get('/api/notifications/unread-count')).body.count).toBe(1);
    expect((await b.agent.post(`/api/notifications/${n!.id}/read`).set('Origin', testOrigin)).status).toBe(404);
    expect((await b.agent.get(`/api/notifications/${n!.id}/action`)).status).toBe(404);
    await h.prisma.capabilityGrant.updateMany({ where: { userId: a.id }, data: { revokedAt: new Date() } });
    expect((await a.agent.get('/api/notifications')).body.items).toEqual([]);
    expect((await a.agent.get('/api/notifications/unread-count')).body.count).toBe(0);
    expect((await a.agent.post(`/api/notifications/${n!.id}/read`).set('Origin', testOrigin)).status).toBe(404);
    expect((await a.agent.get(`/api/notifications/${n!.id}/action`)).status).toBe(404);
    expect(await publish()).toBeNull();
    await service.processPendingDeliveries(); expect(transport.sendNotification).not.toHaveBeenCalled();
  });

  it('a source removed after publication hides list/count/read/action and cancels Push', async () => {
    await subscribe(); const n = await publish();
    await h.prisma.reportingStatementRevisionState.delete({ where: { revisionId } });
    await h.prisma.reportingStatementRevision.delete({ where: { id: revisionId } });
    expect((await a.agent.get('/api/notifications')).body.items).toEqual([]);
    expect((await a.agent.get('/api/notifications/unread-count')).body.count).toBe(0);
    expect((await a.agent.post(`/api/notifications/${n!.id}/read`).set('Origin', testOrigin)).status).toBe(404);
    expect((await a.agent.get(`/api/notifications/${n!.id}/action`)).status).toBe(404);
    await service.processPendingDeliveries(); expect(transport.sendNotification).not.toHaveBeenCalled();
  });

  it('concurrent logout and admission cannot leave a subscription active on the revoked session', async () => {
    const results = await Promise.allSettled([
      service.createSubscription(a.id, dto('logout-race'), sessionA),
      a.agent.post('/api/auth/logout').set('Origin', testOrigin).then(response => expect(response.status).toBe(200)),
    ]);
    expect(results[1].status).toBe('fulfilled');
    expect(await h.prisma.webPushSubscription.count({ where: { authSessionId: sessionA, revokedAt: null } })).toBe(0);
  });

  it('rejects unregistered events, mismatched action/source and uncommitted publication', async () => {
    for (const changes of [{ eventType: 'SYSTEM_FORGED' }, { eventType: 'TIMETABLE_FORGED' }, { actionKey: 'REPORTING_APPROVAL' },
      { sourceKind: 'Unknown' }, { sourceId: crypto.randomUUID() }, { actionParamsJson: { revisionId: crypto.randomUUID() } }]) {
      expect(await h.prisma.$transaction(tx => service.publishInAppNotification(tx, { ...notification(), ...changes }))).toBeNull();
    }
    expect(await h.prisma.$transaction(tx => service.publishInAppNotification(tx, notification(b.id)))).toBeNull();
    await expect(h.prisma.$transaction(async tx => { await service.publishInAppNotification(tx, notification()); throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect(await h.prisma.inAppNotification.count()).toBe(0);
    await h.prisma.reportingStatementRevisionState.update({ where: { revisionId }, data: { lifecycleState: 'SUBMITTED' } });
    const params = { ...notification(approver.id), eventType: 'REPORTING_SUBMITTED', actionKey: 'REPORTING_APPROVAL' };
    expect(await h.prisma.$transaction(tx => service.publishInAppNotification(tx, params))).not.toBeNull();
    await h.prisma.reportingStatementRevisionState.update({ where: { revisionId }, data: { lifecycleState: 'REJECTED' } });
    expect((await approver.agent.get('/api/notifications')).body.items).toEqual([]);
  });

  it('progresses past more than 200 hidden records without losing or duplicating visible results', async () => {
    const valid = await publish();
    const now = Date.now();
    const hidden: Prisma.InAppNotificationCreateManyInput[] = Array.from({ length: 250 }, (_, i) => ({
      ...notification(), eventType: 'SYSTEM_UNREGISTERED', createdAt: new Date(now + i + 1),
    }));
    await h.prisma.inAppNotification.createMany({ data: hidden });
    const first = await service.listNotifications(a.id, undefined, '1');
    expect(first.items).toEqual([]); expect(first.nextCursor).not.toBeNull();
    const second = await service.listNotifications(a.id, first.nextCursor!, '1');
    expect(second.items.map(item => item.id)).toEqual([valid!.id]); expect(second.nextCursor).toBeNull();
    expect((await service.getUnreadCount(a.id)).count).toBe(1);
  });

  it('mixed visible and hidden pages preserve every authorized item exactly once', async () => {
    const now = Date.now();
    const rows = Array.from({ length: 60 }, (_, i) => ({ ...notification(), id: crypto.randomUUID(),
      eventType: i % 3 === 0 ? 'REPORTING_DECIDED' : 'SYSTEM_UNREGISTERED', createdAt: new Date(now - i) }));
    await h.prisma.inAppNotification.createMany({ data: rows });
    const ids: string[] = []; let cursor: string | undefined;
    do {
      const page = await service.listNotifications(a.id, cursor, '2');
      ids.push(...page.items.map(item => item.id)); cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toEqual(rows.filter(row => row.eventType === 'REPORTING_DECIDED').map(row => row.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
