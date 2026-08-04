import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CapabilityGuard } from '../../src/authorization/capability.guard';

const userId = '11111111-1111-4111-8111-111111111111';
const groupId = '22222222-2222-4222-8222-222222222222';

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

describe('CapabilityGuard', () => {
  function harness(metadata: unknown, decisions: Array<Record<string, unknown>> = []) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(metadata) };
    const authorization = { evaluate: jest.fn() };
    for (const decision of decisions) authorization.evaluate.mockResolvedValueOnce(decision);
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    return { guard: new CapabilityGuard(reflector as never, authorization as never, audit as never), authorization, audit };
  }

  it('defaults to deny when auth context or capability metadata is missing', async () => {
    const missingAuth = harness([{ capabilityKey: 'USER_MANAGE', scope: 'SCHOOL_WIDE' }]);
    await expect(missingAuth.guard.canActivate(context({ headers: {}, method: 'GET', path: '/x' }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(missingAuth.audit.write).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ reasonCode: 'AUTH_CONTEXT_MISSING' }) }));

    const missingMetadata = harness(undefined);
    await expect(missingMetadata.guard.canActivate(context({ auth: { user: { id: userId, mustChangePassword: false } }, headers: {}, method: 'GET', path: '/x' })))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(missingMetadata.authorization.evaluate).not.toHaveBeenCalled();
  });

  it('denies first-login users before capability evaluation and audits the reason', async () => {
    const { guard, authorization, audit } = harness([{ capabilityKey: 'USER_MANAGE', scope: 'SCHOOL_WIDE' }]);
    await expect(guard.canActivate(context({
      auth: { user: { id: userId, mustChangePassword: true } }, headers: {}, method: 'POST', path: '/protected',
    }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorization.evaluate).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ reasonCode: 'PASSWORD_CHANGE_REQUIRED' }) }));
  });

  it('uses only route parameters for scoped resources and audits denied decisions safely', async () => {
    const requirement = { capabilityKey: 'USER_MANAGE', scope: 'SUBJECT_GROUP', resourceParam: 'groupId' };
    const { guard, authorization, audit } = harness([requirement], [{ allowed: false, reasonCode: 'GRANT_NOT_FOUND', normalizedResourceId: groupId }]);
    await expect(guard.canActivate(context({
      auth: { user: { id: userId, mustChangePassword: false } },
      params: { groupId }, query: { groupId: 'attacker' }, body: { groupId: 'attacker' },
      headers: { 'x-request-id': 'request-1' }, method: 'POST', path: '/groups/:groupId',
    }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorization.evaluate).toHaveBeenCalledWith(expect.objectContaining({ userId, resourceId: groupId }));
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 'AUTHORIZATION_DENIED', result: 'DENIED',
      metadata: expect.objectContaining({ capabilityKey: 'USER_MANAGE', scope: 'SUBJECT_GROUP', resourceId: groupId, reasonCode: 'GRANT_NOT_FOUND' }),
    }));
  });

  it('requires every declared capability by default', async () => {
    const requirements = [
      { capabilityKey: 'USER_MANAGE', scope: 'SCHOOL_WIDE' },
      { capabilityKey: 'AUDIT_VIEW', scope: 'SCHOOL_WIDE' },
    ];
    const { guard, authorization } = harness(requirements, [
      { allowed: true, reasonCode: 'ALLOWED' },
      { allowed: false, reasonCode: 'GRANT_NOT_FOUND' },
    ]);
    await expect(guard.canActivate(context({
      auth: { user: { id: userId, mustChangePassword: false } }, params: {}, headers: {}, method: 'GET', path: '/x',
    }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorization.evaluate).toHaveBeenCalledTimes(2);
  });

  it('allows only after all declared capability decisions allow', async () => {
    const { guard } = harness([{ capabilityKey: 'USER_MANAGE', scope: 'SCHOOL_WIDE' }], [{ allowed: true, reasonCode: 'ALLOWED' }]);
    await expect(guard.canActivate(context({
      auth: { user: { id: userId, mustChangePassword: false } }, params: {}, headers: {}, method: 'GET', path: '/x',
    }))).resolves.toBe(true);
  });
});
