import { CapabilityAuthorizationService } from '../../src/authorization/capability-authorization.service';
import { NotificationActionRegistry } from '../../src/notifications/notification-action.registry';

describe('NotificationActionRegistry (unit)', () => {
  let capabilityAuth: jest.Mocked<CapabilityAuthorizationService>;
  let registry: NotificationActionRegistry;

  beforeEach(() => {
    capabilityAuth = {
      hasCapability: jest.fn(),
    } as unknown as jest.Mocked<CapabilityAuthorizationService>;

    registry = new NotificationActionRegistry(capabilityAuth);
  });

  describe('resolveAction', () => {
    it('returns default inbox path when actionKey is omitted', async () => {
      const res = await registry.resolveAction('user-1', null, null);
      expect(res).toEqual({ allowed: true, targetUrl: '/thong-bao' });
    });

    it('allows REPORTING_APPROVAL when user has APPROVAL_PRINCIPAL capability', async () => {
      capabilityAuth.hasCapability.mockImplementation(async ({ capabilityKey }) => {
        return capabilityKey === 'APPROVAL_PRINCIPAL';
      });

      const res = await registry.resolveAction('user-1', 'REPORTING_APPROVAL', { revisionId: 'rev-123' });
      expect(res.allowed).toBe(true);
      expect(res.targetUrl).toBe('/phe-duyet-bao-cao?revisionId=rev-123');
    });

    it('denies REPORTING_APPROVAL when user lacks approval capability', async () => {
      capabilityAuth.hasCapability.mockResolvedValue(false);

      const res = await registry.resolveAction('user-1', 'REPORTING_APPROVAL', { revisionId: 'rev-123' });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Không còn quyền truy cập');
    });

    it('allows REPORTING_VIEW when user has REPORTING_STATEMENT_READ capability', async () => {
      capabilityAuth.hasCapability.mockImplementation(async ({ capabilityKey, requestedScope }) => {
        return capabilityKey === 'REPORTING_STATEMENT_READ' && requestedScope === 'PERSONAL';
      });

      const res = await registry.resolveAction('user-1', 'REPORTING_VIEW', { revisionId: 'rev-456' });
      expect(res.allowed).toBe(true);
      expect(res.targetUrl).toBe('/bao-cao-ke-khai/rev-456');
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

    it('shows REPORTING_SUBMITTED notification if user has APPROVAL_VICE_PRINCIPAL', async () => {
      capabilityAuth.hasCapability.mockImplementation(async ({ capabilityKey }) => {
        return capabilityKey === 'APPROVAL_VICE_PRINCIPAL';
      });

      const visible = await registry.isNotificationVisible('user-1', {
        eventType: 'REPORTING_SUBMITTED',
        actionKey: 'REPORTING_APPROVAL',
      });
      expect(visible).toBe(true);
    });

    it('defaults to visible for general informational events', async () => {
      const visible = await registry.isNotificationVisible('user-1', {
        eventType: 'REPORTING_DECIDED',
        actionKey: 'REPORTING_VIEW',
      });
      expect(visible).toBe(true);
    });
  });
});

