import { CapabilityAuthorizationService } from '../../src/authorization/capability-authorization.service';

const now = new Date('2026-08-04T00:00:00.000Z');
const userId = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';

const activeGrant = (overrides: Record<string, unknown> = {}) => ({
  scopeType: 'SCHOOL_WIDE',
  scopeResourceId: null,
  validFrom: new Date('2026-08-03T00:00:00.000Z'),
  validUntil: null,
  revokedAt: null,
  ...overrides,
});

function createHarness(
  user: Record<string, unknown> | null = { status: 'ACTIVE', lockedUntil: null, capabilityGrants: [activeGrant()] },
  definition: Record<string, unknown> | null = { isActive: true, allowedScopeTypes: ['SCHOOL_WIDE', 'PERSONAL', 'SUBJECT_GROUP'] },
) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    capabilityDefinition: { findUnique: jest.fn().mockResolvedValue(definition) },
  };
  return { prisma, service: new CapabilityAuthorizationService(prisma as never, { now: () => new Date(now) }) };
}

describe('CapabilityAuthorizationService', () => {
  it.each([
    ['missing user', null, { isActive: true, allowedScopeTypes: ['SCHOOL_WIDE'] }, 'USER_INACTIVE'],
    ['inactive user', { status: 'DISABLED', lockedUntil: null, capabilityGrants: [] }, { isActive: true, allowedScopeTypes: ['SCHOOL_WIDE'] }, 'USER_INACTIVE'],
    ['locked user', { status: 'ACTIVE', lockedUntil: new Date('2026-08-04T00:00:01Z'), capabilityGrants: [] }, { isActive: true, allowedScopeTypes: ['SCHOOL_WIDE'] }, 'USER_LOCKED'],
    ['unknown capability', { status: 'ACTIVE', lockedUntil: null, capabilityGrants: [] }, null, 'CAPABILITY_UNKNOWN'],
    ['inactive capability', { status: 'ACTIVE', lockedUntil: null, capabilityGrants: [] }, { isActive: false, allowedScopeTypes: ['SCHOOL_WIDE'] }, 'CAPABILITY_INACTIVE'],
  ])('denies %s', async (_label, user, definition, reasonCode) => {
    const { service } = createHarness(user as never, definition as never);
    await expect(service.evaluate({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SCHOOL_WIDE' }))
      .resolves.toMatchObject({ allowed: false, reasonCode });
  });

  it('validates requested scope and resource shape before grant matching', async () => {
    const { service } = createHarness();
    await expect(service.evaluate({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'ACTIVITY' }))
      .resolves.toMatchObject({ reasonCode: 'SCOPE_NOT_ALLOWED' });
    await expect(service.evaluate({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SUBJECT_GROUP' }))
      .resolves.toMatchObject({ reasonCode: 'RESOURCE_REQUIRED' });
    await expect(service.evaluate({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SUBJECT_GROUP', resourceId: 'not-a-uuid' }))
      .resolves.toMatchObject({ reasonCode: 'RESOURCE_INVALID' });
    await expect(service.evaluate({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'PERSONAL', resourceId: otherId }))
      .resolves.toMatchObject({ reasonCode: 'RESOURCE_INVALID' });
    await expect(service.evaluate({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SCHOOL_WIDE', resourceId: groupId }))
      .resolves.toMatchObject({ reasonCode: 'RESOURCE_INVALID' });
  });

  it('allows school-wide grants for narrower scopes but requires school-wide for school-wide requests', async () => {
    const { service } = createHarness();
    await expect(service.hasCapability({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SUBJECT_GROUP', resourceId: groupId })).resolves.toBe(true);
    const narrow = createHarness({ status: 'ACTIVE', lockedUntil: null, capabilityGrants: [activeGrant({ scopeType: 'SUBJECT_GROUP', scopeResourceId: groupId })] });
    await expect(narrow.service.evaluate({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SCHOOL_WIDE' }))
      .resolves.toMatchObject({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' });
  });

  it('requires exact scope and resource without cross-scope inference', async () => {
    const { service } = createHarness({
      status: 'ACTIVE', lockedUntil: null,
      capabilityGrants: [activeGrant({ scopeType: 'SUBJECT_GROUP', scopeResourceId: groupId })],
    });
    await expect(service.hasCapability({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SUBJECT_GROUP', resourceId: groupId })).resolves.toBe(true);
    await expect(service.evaluate({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SUBJECT_GROUP', resourceId: otherId }))
      .resolves.toMatchObject({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' });
  });

  it('normalizes PERSONAL grants to the current user', async () => {
    const { service } = createHarness(
      { status: 'ACTIVE', lockedUntil: null, capabilityGrants: [activeGrant({ scopeType: 'PERSONAL' })] },
      { isActive: true, allowedScopeTypes: ['PERSONAL'] },
    );
    await expect(service.evaluate({ userId, capabilityKey: 'TEACHER_BASE', requestedScope: 'PERSONAL' }))
      .resolves.toMatchObject({ allowed: true, normalizedResourceId: userId });
  });

  it('uses half-open validity windows and distinguishes inactive grants', async () => {
    const atBoundary = createHarness({
      status: 'ACTIVE', lockedUntil: null,
      capabilityGrants: [activeGrant({ validFrom: now, validUntil: new Date('2026-08-04T01:00:00Z') })],
    });
    await expect(atBoundary.service.hasCapability({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SCHOOL_WIDE', atTime: now })).resolves.toBe(true);
    await expect(atBoundary.service.evaluate({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SCHOOL_WIDE', atTime: new Date('2026-08-04T01:00:00Z') }))
      .resolves.toMatchObject({ allowed: false, reasonCode: 'GRANT_NOT_ACTIVE' });

    const revoked = createHarness({ status: 'ACTIVE', lockedUntil: null, capabilityGrants: [activeGrant({ revokedAt: now })] });
    await expect(revoked.service.evaluate({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SCHOOL_WIDE' }))
      .resolves.toMatchObject({ reasonCode: 'GRANT_NOT_ACTIVE' });
  });

  it('fails closed for malformed persisted grants', async () => {
    const { service } = createHarness({
      status: 'ACTIVE', lockedUntil: null,
      capabilityGrants: [activeGrant({ scopeType: 'SUBJECT_GROUP', scopeResourceId: null })],
    });
    await expect(service.evaluate({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SUBJECT_GROUP', resourceId: groupId }))
      .resolves.toMatchObject({ allowed: false, reasonCode: 'GRANT_SCOPE_MALFORMED' });
  });

  it('fails closed for malformed catalog scopes and invalid decision times', async () => {
    const malformedCatalog = createHarness(
      { status: 'ACTIVE', lockedUntil: null, capabilityGrants: [activeGrant()] },
      { isActive: true, allowedScopeTypes: ['SCHOOL_WIDE', 'NOT_A_SCOPE'] },
    );
    await expect(malformedCatalog.service.evaluate({ userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SCHOOL_WIDE' }))
      .resolves.toMatchObject({ allowed: false, reasonCode: 'SCOPE_NOT_ALLOWED' });
    await expect(malformedCatalog.service.evaluate({
      userId, capabilityKey: 'USER_MANAGE', requestedScope: 'SCHOOL_WIDE', atTime: new Date('invalid'),
    })).resolves.toMatchObject({ allowed: false, reasonCode: 'REQUIREMENT_INVALID' });
  });

  it('does not treat SYSTEM_ADMIN as a bypass for another capability', async () => {
    const { service } = createHarness({ status: 'ACTIVE', lockedUntil: null, capabilityGrants: [] });
    await expect(service.evaluate({ userId, capabilityKey: 'APPROVAL_PRINCIPAL', requestedScope: 'SCHOOL_WIDE' }))
      .resolves.toMatchObject({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' });
  });

  it('returns only active, valid, well-formed effective capabilities with deterministic deduplication', async () => {
    const grant = (overrides: Record<string, unknown>) => ({
      capabilityKey: 'USER_MANAGE',
      capability: { isActive: true, allowedScopeTypes: ['SCHOOL_WIDE', 'SUBJECT_GROUP'] },
      ...activeGrant(overrides),
    });
    const { service } = createHarness({
      status: 'ACTIVE', lockedUntil: null,
      capabilityGrants: [
        grant({ scopeType: 'SUBJECT_GROUP', scopeResourceId: groupId }),
        grant({ scopeType: 'SUBJECT_GROUP', scopeResourceId: groupId }),
        grant({ scopeType: 'SCHOOL_WIDE', scopeResourceId: null }),
        grant({ validFrom: new Date('2026-08-05T00:00:00Z') }),
        grant({ revokedAt: now }),
        grant({ scopeType: 'SUBJECT_GROUP', scopeResourceId: null }),
        { ...grant({}), capabilityKey: 'AUDIT_VIEW', capability: { isActive: false, allowedScopeTypes: ['SCHOOL_WIDE'] } },
      ],
    });
    await expect(service.listEffectiveCapabilities(userId)).resolves.toEqual([
      { key: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
      { key: 'USER_MANAGE', scope: 'SUBJECT_GROUP', resourceId: groupId },
    ]);
  });
});
