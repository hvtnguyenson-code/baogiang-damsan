import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedRequest } from '../../src/auth/auth.types';
import { OperationalOverlayAccessService } from '../../src/operational-overlays/operational-overlay-access.service';

function request(mustChangePassword = false): AuthenticatedRequest {
  return { auth: { user: { id: crypto.randomUUID(), mustChangePassword } }, headers: { 'x-request-id': 'overlay-test' }, method: 'POST', path: '/api/operational-overlays', route: { path: '/api/operational-overlays' } } as unknown as AuthenticatedRequest;
}

describe('OperationalOverlayAccessService', () => {
  it('requests only CALENDAR_EXCEPTION_MANAGE SCHOOL_WIDE for calendar operations', async () => {
    const authorization = { evaluate: jest.fn().mockResolvedValue({ allowed: true, reasonCode: 'ALLOWED' }) };
    const service = new OperationalOverlayAccessService(authorization as never, { write: jest.fn() } as never);
    const req = request();
    await service.requireCalendar(req);
    expect(authorization.evaluate).toHaveBeenCalledWith({ userId: req.auth!.user.id, capabilityKey: 'CALENDAR_EXCEPTION_MANAGE', requestedScope: 'SCHOOL_WIDE', resourceId: undefined });
  });

  it('requests exact TEACHING_OPERATION_MANAGE SUBJECT resource', async () => {
    const authorization = { evaluate: jest.fn().mockResolvedValue({ allowed: true, reasonCode: 'ALLOWED' }) };
    const service = new OperationalOverlayAccessService(authorization as never, { write: jest.fn() } as never);
    const req = request();
    await service.requireTeachingSubject(req, 'subject');
    expect(authorization.evaluate).toHaveBeenCalledWith({ userId: req.auth!.user.id, capabilityKey: 'TEACHING_OPERATION_MANAGE', requestedScope: 'SUBJECT', resourceId: 'subject' });
  });

  it('requests school-wide teaching authority for cancellation and broad lists', async () => {
    const authorization = { evaluate: jest.fn().mockResolvedValue({ allowed: true, reasonCode: 'ALLOWED' }) };
    const service = new OperationalOverlayAccessService(authorization as never, { write: jest.fn() } as never);
    await service.requireTeachingSchoolWide(request());
    expect(authorization.evaluate).toHaveBeenCalledWith(expect.objectContaining({ capabilityKey: 'TEACHING_OPERATION_MANAGE', requestedScope: 'SCHOOL_WIDE' }));
  });

  it.each(['TIMETABLE_MANAGE', 'PPCT_MANAGE', 'SYSTEM_ADMIN'])('does not infer overlay authority from %s', async () => {
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new OperationalOverlayAccessService({ evaluate: jest.fn().mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' }) } as never, audit as never);
    await expect(service.requireTeachingSubject(request(), 'subject')).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTHORIZATION_DENIED', entityId: 'TEACHING_OPERATION_MANAGE', result: 'DENIED' }));
  });

  it('denies forced-password-change before grant evaluation', async () => {
    const authorization = { evaluate: jest.fn() };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new OperationalOverlayAccessService(authorization as never, audit as never);
    await expect(service.requireCalendar(request(true))).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorization.evaluate).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ reasonCode: 'PASSWORD_CHANGE_REQUIRED' }) }));
  });

  it('returns generic 403 even when denial audit persistence fails', async () => {
    const service = new OperationalOverlayAccessService({ evaluate: jest.fn().mockResolvedValue({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' }) } as never, { write: jest.fn().mockRejectedValue(new Error('offline')) } as never);
    await expect(service.requireCalendar(request())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
