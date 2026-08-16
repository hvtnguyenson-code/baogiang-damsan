import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedRequest } from '../../src/auth/auth.types';
import { TeachingExecutionAccessService } from '../../src/teaching-executions/teaching-execution-access.service';

const request = (id = 'teacher', mustChangePassword = false) => ({ auth: { user: { id, mustChangePassword } }, method: 'POST', path: '/api/teaching-executions', route: { path: '/api/teaching-executions' } } as unknown as AuthenticatedRequest);
const denied = { allowed: false, reasonCode: 'GRANT_NOT_FOUND' };

describe('TeachingExecutionAccessService', () => {
  it('allows exact PERSONAL curricular authority only for the persisted actual teacher', async () => {
    const authorization = { evaluate: jest.fn().mockResolvedValue({ allowed: true }) };
    const sut = new TeachingExecutionAccessService(authorization as never, { write: jest.fn() } as never);
    await expect(sut.requireCurricular(request(), 'teacher', 'subject')).resolves.toBe('PERSONAL');
    expect(authorization.evaluate).toHaveBeenCalledWith({ userId: 'teacher', capabilityKey: 'TEACHING_EXECUTION_RECORD', requestedScope: 'PERSONAL' });
  });
  it('allows exact SUBJECT and SCHOOL_WIDE curricular grants, but never infers them', async () => {
    const authorization = { evaluate: jest.fn().mockResolvedValueOnce(denied).mockResolvedValueOnce({ allowed: true }) };
    const sut = new TeachingExecutionAccessService(authorization as never, { write: jest.fn() } as never);
    await expect(sut.requireCurricular(request('manager'), 'teacher', 'subject')).resolves.toBe('SUBJECT');
    expect(authorization.evaluate).toHaveBeenLastCalledWith({ userId: 'manager', capabilityKey: 'TEACHING_EXECUTION_MANAGE', requestedScope: 'SUBJECT', resourceId: 'subject' });
  });
  it('allows curricular SCHOOL_WIDE before SUBJECT evaluation', async () => {
    const authorization = { evaluate: jest.fn().mockResolvedValue({ allowed: true }) };
    await expect(new TeachingExecutionAccessService(authorization as never, { write: jest.fn() } as never).requireCurricular(request('manager'), 'teacher', 'subject')).resolves.toBe('SCHOOL_WIDE');
    expect(authorization.evaluate).toHaveBeenCalledTimes(1);
  });
  it('denies a wrong PERSONAL actor and a wrong SUBJECT resource when explicit manage checks fail', async () => {
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const authorization = { evaluate: jest.fn().mockResolvedValue(denied) };
    await expect(new TeachingExecutionAccessService(authorization as never, audit as never).requireCurricular(request('other'), 'teacher', 'subject')).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorization.evaluate).toHaveBeenCalledWith({ userId: 'other', capabilityKey: 'TEACHING_EXECUTION_MANAGE', requestedScope: 'SUBJECT', resourceId: 'subject' });
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ capabilityKey: 'TEACHING_EXECUTION_MANAGE', scope: 'SUBJECT', resourceId: 'subject', reasonCode: 'GRANT_NOT_FOUND' }) }));
  });
  it('allows activity PERSONAL exact teacher and SCHOOL_WIDE manager', async () => {
    const personalAuth = { evaluate: jest.fn().mockResolvedValue({ allowed: true }) };
    await expect(new TeachingExecutionAccessService(personalAuth as never, { write: jest.fn() } as never).requireActivity(request(), 'teacher')).resolves.toBe('PERSONAL');
    const managerAuth = { evaluate: jest.fn().mockResolvedValue({ allowed: true }) };
    await expect(new TeachingExecutionAccessService(managerAuth as never, { write: jest.fn() } as never).requireActivity(request('manager'), 'teacher')).resolves.toBe('SCHOOL_WIDE');
  });
  it('does not give SUBJECT semantics to activities', async () => {
    const authorization = { evaluate: jest.fn().mockResolvedValue(denied) }; const audit = { write: jest.fn().mockResolvedValue(undefined) };
    await expect(new TeachingExecutionAccessService(authorization as never, audit as never).requireActivity(request('manager'), 'teacher')).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorization.evaluate).toHaveBeenCalledWith({ userId: 'manager', capabilityKey: 'TEACHING_EXECUTION_MANAGE', requestedScope: 'SCHOOL_WIDE' });
  });
  it('fails closed for mustChangePassword before evaluating a grant', async () => {
    const authorization = { evaluate: jest.fn() }; const audit = { write: jest.fn().mockResolvedValue(undefined) };
    await expect(new TeachingExecutionAccessService(authorization as never, audit as never).requireActivity(request('teacher', true), 'teacher')).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorization.evaluate).not.toHaveBeenCalled();
  });
  it.each(['TEACHER_BASE','SYSTEM_ADMIN','TIMETABLE_MANAGE','PPCT_MANAGE','TEACHING_OPERATION_MANAGE','SPECIAL_ACTIVITY_MANAGE','role/title/assignment/membership/duty'])('never infers execution authority from %s', async () => {
    const audit = { write: jest.fn().mockResolvedValue(undefined) }; const authorization = { evaluate: jest.fn().mockResolvedValue(denied) };
    await expect(new TeachingExecutionAccessService(authorization as never, audit as never).requireActivity(request('other'), 'teacher')).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorization.evaluate).toHaveBeenCalledWith(expect.objectContaining({ capabilityKey: 'TEACHING_EXECUTION_MANAGE', requestedScope: 'SCHOOL_WIDE' }));
  });
});
