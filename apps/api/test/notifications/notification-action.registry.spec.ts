import { CapabilityAuthorizationService } from '../../src/authorization/capability-authorization.service';
import { NotificationActionRegistry } from '../../src/notifications/notification-action.registry';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('NotificationActionRegistry (unit)', () => {
  let capabilityAuth: jest.Mocked<CapabilityAuthorizationService>;
  let prisma: {
    reportingStatementRevision: Record<string, jest.Mock>;
  };
  let registry: NotificationActionRegistry;

  beforeEach(() => {
    capabilityAuth = {
      hasCapability: jest.fn(),
    } as unknown as jest.Mocked<CapabilityAuthorizationService>;

    prisma = {
      reportingStatementRevision: {
        findUnique: jest.fn(),
      },
    };

    registry = new NotificationActionRegistry(
      capabilityAuth,
      prisma as unknown as PrismaService,
    );
  });

  describe('resolveAction', () => {
    it('returns default inbox path when actionKey is omitted', async () => {
      const res = await registry.resolveAction('user-1', null, null);
      expect(res).toEqual({ allowed: true, targetUrl: '/thong-bao' });
    });

    it('allows REPORTING_APPROVAL when user has APPROVAL_PRINCIPAL capability and revision is SUBMITTED', async () => {
      capabilityAuth.hasCapability.mockImplementation(async ({ capabilityKey }) => {
        return capabilityKey === 'APPROVAL_PRINCIPAL';
      });
      prisma.reportingStatementRevision.findUnique.mockResolvedValue({
        id: 'rev-123',
        state: { lifecycleState: 'SUBMITTED' },
      });

      const res = await registry.resolveAction('user-1', 'REPORTING_APPROVAL', { revisionId: 'rev-123' });
      expect(res.allowed).toBe(true);
      expect(res.targetUrl).toBe('/phe-duyet-bao-cao?revisionId=rev-123');
    });

    it('denies REPORTING_APPROVAL when revision is no longer SUBMITTED', async () => {
      capabilityAuth.hasCapability.mockImplementation(async ({ capabilityKey }) => {
        return capabilityKey === 'APPROVAL_PRINCIPAL';
      });
      prisma.reportingStatementRevision.findUnique.mockResolvedValue({
        id: 'rev-123',
        state: { lifecycleState: 'ACCEPTED' },
      });

      const res = await registry.resolveAction('user-1', 'REPORTING_APPROVAL', { revisionId: 'rev-123' });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('không còn ở trạng thái chờ duyệt');
    });

    it('denies REPORTING_APPROVAL when user lacks approval capability', async () => {
      capabilityAuth.hasCapability.mockResolvedValue(false);

      const res = await registry.resolveAction('user-1', 'REPORTING_APPROVAL', { revisionId: 'rev-123' });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Không còn quyền');
    });

    it('allows REPORTING_VIEW when user is the submitter and has PERSONAL read capability', async () => {
      capabilityAuth.hasCapability.mockImplementation(async ({ capabilityKey, requestedScope }) => {
        return capabilityKey === 'REPORTING_STATEMENT_READ' && requestedScope === 'PERSONAL';
      });
      prisma.reportingStatementRevision.findUnique.mockResolvedValue({
        id: 'rev-456',
        series: { submitterUserId: 'user-1' },
      });

      const res = await registry.resolveAction('user-1', 'REPORTING_VIEW', { revisionId: 'rev-456' });
      expect(res.allowed).toBe(true);
      expect(res.targetUrl).toBe('/bao-cao-ke-khai/rev-456');
    });

    it('denies REPORTING_VIEW when user is not submitter and lacks SCHOOL_WIDE read capability', async () => {
      capabilityAuth.hasCapability.mockResolvedValue(false);
      prisma.reportingStatementRevision.findUnique.mockResolvedValue({
        id: 'rev-456',
        series: { submitterUserId: 'user-other' },
      });

      const res = await registry.resolveAction('user-1', 'REPORTING_VIEW', { revisionId: 'rev-456' });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Không có quyền xem');
    });

    it('allows TIMETABLE_VIEW when user has TEACHER_BASE', async () => {
      capabilityAuth.hasCapability.mockImplementation(async ({ capabilityKey }) => {
        return capabilityKey === 'TEACHER_BASE';
      });

      const res = await registry.resolveAction('user-1', 'TIMETABLE_VIEW', null);
      expect(res.allowed).toBe(true);
      expect(res.targetUrl).toBe('/lich-day');
    });

    it('allows DATA_READINESS when user has any authorized school-wide capability', async () => {
      capabilityAuth.hasCapability.mockImplementation(async ({ capabilityKey, requestedScope }) => {
        return capabilityKey === 'TIMETABLE_MANAGE' && requestedScope === 'SCHOOL_WIDE';
      });

      const res = await registry.resolveAction('user-1', 'DATA_READINESS', null);
      expect(res.allowed).toBe(true);
      expect(res.targetUrl).toBe('/quan-tri/san-sang-du-lieu');
    });

    it('denies unknown action keys', async () => {
      const res = await registry.resolveAction('user-1', 'UNKNOWN_ACTION', null);
      expect(res.allowed).toBe(false);
    });
  });

  describe('isNotificationVisible', () => {
    it('hides REPORTING_SUBMITTED notification if user has no approver capability', async () => {
      capabilityAuth.hasCapability.mockResolvedValue(false);

      const visible = await registry.isNotificationVisible('user-1', {
        eventType: 'REPORTING_SUBMITTED',
        actionKey: 'REPORTING_APPROVAL',
      });
      expect(visible).toBe(false);
    });

    it('hides REPORTING_SUBMITTED notification if source revision is no longer SUBMITTED', async () => {
      capabilityAuth.hasCapability.mockImplementation(async ({ capabilityKey }) => {
        return capabilityKey === 'APPROVAL_PRINCIPAL';
      });
      prisma.reportingStatementRevision.findUnique.mockResolvedValue({
        id: 'rev-1',
        state: { lifecycleState: 'ACCEPTED' },
      });

      const visible = await registry.isNotificationVisible('user-1', {
        eventType: 'REPORTING_SUBMITTED',
        sourceKind: 'ReportingStatementRevision',
        sourceId: 'rev-1',
        actionKey: 'REPORTING_APPROVAL',
      });
      expect(visible).toBe(false);
    });

    it('shows REPORTING_SUBMITTED notification if user has approver capability and statement is SUBMITTED', async () => {
      capabilityAuth.hasCapability.mockImplementation(async ({ capabilityKey }) => {
        return capabilityKey === 'APPROVAL_VICE_PRINCIPAL';
      });
      prisma.reportingStatementRevision.findUnique.mockResolvedValue({
        id: 'rev-1',
        state: { lifecycleState: 'SUBMITTED' },
      });

      const visible = await registry.isNotificationVisible('user-1', {
        eventType: 'REPORTING_SUBMITTED',
        sourceKind: 'ReportingStatementRevision',
        sourceId: 'rev-1',
        actionKey: 'REPORTING_APPROVAL',
      });
      expect(visible).toBe(true);
    });

    it('hides REPORTING_DECIDED notification if user is not the submitter', async () => {
      prisma.reportingStatementRevision.findUnique.mockResolvedValue({
        id: 'rev-1',
        series: { submitterUserId: 'user-author' },
      });

      const visible = await registry.isNotificationVisible('user-other', {
        eventType: 'REPORTING_DECIDED',
        sourceKind: 'ReportingStatementRevision',
        sourceId: 'rev-1',
        actionKey: 'REPORTING_VIEW',
      });
      expect(visible).toBe(false);
    });

    it('shows REPORTING_DECIDED notification if user is the submitter and has read capability', async () => {
      capabilityAuth.hasCapability.mockImplementation(async ({ capabilityKey }) => {
        return capabilityKey === 'REPORTING_STATEMENT_READ';
      });
      prisma.reportingStatementRevision.findUnique.mockResolvedValue({
        id: 'rev-1',
        series: { submitterUserId: 'user-author' },
      });

      const visible = await registry.isNotificationVisible('user-author', {
        eventType: 'REPORTING_DECIDED',
        sourceKind: 'ReportingStatementRevision',
        sourceId: 'rev-1',
        actionKey: 'REPORTING_VIEW',
      });
      expect(visible).toBe(true);
    });

    it('hides REPORTING_SUBMITTED notification if sourceKind is not ReportingStatementRevision or sourceId is missing', async () => {
      capabilityAuth.hasCapability.mockResolvedValue(true);

      const visibleNoId = await registry.isNotificationVisible('user-approver', {
        eventType: 'REPORTING_SUBMITTED',
        actionKey: 'REPORTING_APPROVAL',
      });
      expect(visibleNoId).toBe(false);

      const visibleWrongKind = await registry.isNotificationVisible('user-approver', {
        eventType: 'REPORTING_SUBMITTED',
        sourceKind: 'UnknownEntity',
        sourceId: 'some-id',
        actionKey: 'REPORTING_APPROVAL',
      });
      expect(visibleWrongKind).toBe(false);
    });

    it('hides unrecognized notification eventType (fail-closed)', async () => {
      const visible = await registry.isNotificationVisible('user-1', {
        eventType: 'UNREGISTERED_EVENT_TYPE',
      });
      expect(visible).toBe(false);
    });
  });
});
