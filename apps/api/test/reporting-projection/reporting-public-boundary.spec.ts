import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthenticatedRequest } from '../../src/auth/auth.types';
import { ReportingAccessService } from '../../src/reporting-projection/reporting-access.service';
import { ReportingProjectionController } from '../../src/reporting-projection/reporting-projection.controller';
import { ResolveReportingProjectionDto } from '../../src/reporting-projection/reporting-projection.dto';

const id = (tail: string) => `00000000-0000-4000-8000-00000000000${tail}`;
const authRequest = (mustChangePassword = false): AuthenticatedRequest => ({
  auth: { user: { id: id('1'), mustChangePassword } }, headers: {}, method: 'POST', path: '/api/reporting/projection', route: { path: '/api/reporting/projection' },
} as unknown as AuthenticatedRequest);
const dto = (): ResolveReportingProjectionDto => Object.assign(new ResolveReportingProjectionDto(), {
  academicYearId: id('2'), roots: [{ schoolClassId: id('3'), subjectId: id('4') }], fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', asOfInstant: '2026-08-10T00:00:00.000Z',
});

describe('ReportingAccessService', () => {
  it('authorizes each distinct subject exactly once with REPORTING_READ SUBJECT', async () => {
    const authorization = { evaluate: jest.fn().mockResolvedValue({ allowed: true, reasonCode: 'ALLOWED' }) };
    const service = new ReportingAccessService(authorization as never, { write: jest.fn() } as never);
    await service.requireSubjects(authRequest(), [id('4'), id('4'), id('5')]);
    expect(authorization.evaluate).toHaveBeenCalledTimes(2);
    expect(authorization.evaluate).toHaveBeenNthCalledWith(1, { userId: id('1'), capabilityKey: 'REPORTING_READ', requestedScope: 'SUBJECT', resourceId: id('4') });
    expect(authorization.evaluate).toHaveBeenNthCalledWith(2, { userId: id('1'), capabilityKey: 'REPORTING_READ', requestedScope: 'SUBJECT', resourceId: id('5') });
  });

  it('fails closed at the first denied subject, audits the denial, and does not continue', async () => {
    const authorization = { evaluate: jest.fn().mockResolvedValueOnce({ allowed: true, reasonCode: 'ALLOWED' }).mockResolvedValueOnce({ allowed: false, reasonCode: 'GRANT_NOT_FOUND' }) };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new ReportingAccessService(authorization as never, audit as never);
    await expect(service.requireSubjects(authRequest(), [id('4'), id('5'), id('6')])).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorization.evaluate).toHaveBeenCalledTimes(2);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTHORIZATION_DENIED', entityId: 'REPORTING_READ', result: 'DENIED', metadata: expect.objectContaining({ scope: 'SUBJECT', resourceId: id('5') }) }));
  });

  it('rejects password-change-required without evaluating grants', async () => {
    const authorization = { evaluate: jest.fn() };
    const service = new ReportingAccessService(authorization as never, { write: jest.fn() } as never);
    await expect(service.requireSubjects(authRequest(true), [id('4')])).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorization.evaluate).not.toHaveBeenCalled();
  });
});

describe('ReportingProjectionController and DTO', () => {
  it('passes the exact request boundary to projection after authorization and converts asOf once', async () => {
    const access = { requireSubjects: jest.fn().mockResolvedValue(undefined) };
    const result = { status: 'PASS', counts: {}, roots: [], evaluatedAt: '2026-08-10T00:00:00.000Z' };
    const projection = { resolve: jest.fn().mockResolvedValue(result) };
    const controller = new ReportingProjectionController(access as never, projection as never);
    await expect(controller.resolve(dto(), authRequest())).resolves.toBe(result);
    expect(access.requireSubjects).toHaveBeenCalledWith(authRequest(), [id('4')]);
    expect(projection.resolve).toHaveBeenCalledWith(expect.objectContaining({ academicYearId: id('2'), roots: [{ schoolClassId: id('3'), subjectId: id('4') }], fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', asOfInstant: new Date('2026-08-10T00:00:00.000Z') }));
  });

  it('rejects empty/duplicate roots and malformed UUID, civil date, or as-of instant', async () => {
    const invalid = [
      { ...dto(), roots: [] },
      { ...dto(), roots: [{ schoolClassId: id('3'), subjectId: id('4') }, { schoolClassId: id('3'), subjectId: id('4') }] },
      { ...dto(), academicYearId: 'bad' },
      { ...dto(), fromCivilDate: '2026-02-30' },
      { ...dto(), asOfInstant: '2026-08-10' },
    ];
    for (const value of invalid) expect(await validate(plainToInstance(ResolveReportingProjectionDto, value))).not.toHaveLength(0);
  });
});
