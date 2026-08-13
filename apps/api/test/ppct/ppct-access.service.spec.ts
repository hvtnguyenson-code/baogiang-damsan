import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedRequest } from '../../src/auth/auth.types';
import { PpctAccessService } from '../../src/ppct/ppct-access.service';

function request(mustChangePassword = false): AuthenticatedRequest {
  return {
    auth: { user: { id: crypto.randomUUID(), mustChangePassword } },
    headers: { 'x-request-id': 'ppct-access-test' },
    method: 'GET',
    path: '/api/ppct-plans/test',
    route: { path: '/api/ppct-plans/:id' },
  } as unknown as AuthenticatedRequest;
}

describe('PpctAccessService', () => {
  it('requests exactly PPCT_MANAGE SUBJECT for the persisted subject', async () => {
    const authorization = { evaluate: jest.fn().mockResolvedValue({ allowed: true, reasonCode: 'ALLOWED' }) };
    const audit = { write: jest.fn() };
    const service = new PpctAccessService(authorization as never, audit as never);
    const subjectId = crypto.randomUUID();
    const req = request();

    await expect(service.requireSubject(req, subjectId)).resolves.toBeUndefined();
    expect(authorization.evaluate).toHaveBeenCalledWith({
      userId: req.auth!.user.id,
      capabilityKey: 'PPCT_MANAGE',
      requestedScope: 'SUBJECT',
      resourceId: subjectId,
    });
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('fails closed with a generic 403 and sanitized denial audit', async () => {
    const authorization = { evaluate: jest.fn().mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' }) };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new PpctAccessService(authorization as never, audit as never);
    const subjectId = crypto.randomUUID();

    await expect(service.requireSubject(request(), subjectId)).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 'AUTHORIZATION_DENIED',
      entityType: 'CapabilityDefinition',
      entityId: 'PPCT_MANAGE',
      result: 'DENIED',
      metadata: expect.objectContaining({ capabilityKey: 'PPCT_MANAGE', scope: 'SUBJECT', resourceId: subjectId }),
    }));
  });

  it('denies mustChangePassword without evaluating grants', async () => {
    const authorization = { evaluate: jest.fn() };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new PpctAccessService(authorization as never, audit as never);

    await expect(service.requireSubject(request(true), crypto.randomUUID())).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorization.evaluate).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ reasonCode: 'PASSWORD_CHANGE_REQUIRED' }),
    }));
  });

  it('still returns 403 when denial-audit persistence fails', async () => {
    const authorization = { evaluate: jest.fn().mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' }) };
    const audit = { write: jest.fn().mockRejectedValue(new Error('audit unavailable')) };
    const service = new PpctAccessService(authorization as never, audit as never);

    await expect(service.requireSubject(request(), crypto.randomUUID())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
