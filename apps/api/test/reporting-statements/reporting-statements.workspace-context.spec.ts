import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReportingStatementsService } from '../../src/reporting-statements/reporting-statements.service';

const request = {
  auth: { user: { id: 'actor-1', mustChangePassword: false } },
  headers: {},
} as never;

function setup(capabilities: Array<{ key: string; scope: string; resourceId?: string }> = []) {
  const prisma = {
    academicYear: { findMany: jest.fn().mockResolvedValue([]) },
    schoolClass: { findMany: jest.fn().mockResolvedValue([]) },
    subject: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const authorization = {
    listEffectiveCapabilities: jest.fn().mockResolvedValue(capabilities),
    evaluate: jest.fn(),
  };
  const audit = { write: jest.fn().mockResolvedValue(undefined) };
  const service = new ReportingStatementsService(
    prisma as never,
    {} as never,
    {} as never,
    authorization as never,
    audit as never,
    { now: jest.fn() },
  );
  return { service, prisma, authorization, audit };
}

describe('ReportingStatementsService.workspaceContext', () => {
  it.each([
    [{ key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' }],
    [{ key: 'REPORTING_STATEMENT_READ', scope: 'PERSONAL' }],
    [{ key: 'REPORTING_STATEMENT_READ', scope: 'SUBJECT', resourceId: 'subject-1' }],
    [{ key: 'REPORTING_STATEMENT_READ', scope: 'SCHOOL_WIDE' }],
  ])('allows an actor with a relevant effective Reporting Statement capability', async (...capabilities) => {
    const { service, authorization, audit } = setup(capabilities);

    await expect(service.workspaceContext({}, request)).resolves.toEqual({
      academicYears: [],
      selectedAcademicYear: null,
    });
    expect(authorization.listEffectiveCapabilities).toHaveBeenCalledWith('actor-1');
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('denies unrelated capabilities, including SYSTEM_ADMIN and academic management', async () => {
    const { service, prisma, audit } = setup([
      { key: 'SYSTEM_ADMIN', scope: 'SCHOOL_WIDE' },
      { key: 'ACADEMIC_STRUCTURE_MANAGE', scope: 'SCHOOL_WIDE' },
    ]);

    await expect(service.workspaceContext({}, request)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.academicYear.findMany).not.toHaveBeenCalled();
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
      action: 'AUTHORIZATION_DENIED',
      result: 'DENIED',
    }));
  });

  it('returns deterministic public-safe year, calendar, class, and subject context including inactive references', async () => {
    const { service, prisma, audit } = setup([
      { key: 'REPORTING_STATEMENT_SUBMIT', scope: 'PERSONAL' },
    ]);
    prisma.academicYear.findMany.mockResolvedValue([
      {
        id: 'year-1',
        code: '2025-2026',
        name: 'Năm học 2025-2026',
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        calendarVersions: [{
          startDate: new Date('2025-08-01T00:00:00.000Z'),
          endDate: new Date('2026-05-31T00:00:00.000Z'),
          note: 'not public',
        }],
      },
      {
        id: 'year-2',
        code: '2026-2027',
        name: 'Năm học 2026-2027',
        calendarVersions: [],
      },
    ]);
    prisma.schoolClass.findMany.mockResolvedValue([
      { id: 'class-a', code: '10A1', name: 'Lớp 10A1', status: 'ACTIVE' },
      { id: 'class-z', code: '12C1', name: 'Lớp 12C1', status: 'INACTIVE' },
    ]);
    prisma.subject.findMany.mockResolvedValue([
      { id: 'subject-a', code: 'ANH', name: 'Tiếng Anh', status: 'INACTIVE' },
      { id: 'subject-t', code: 'TOAN', name: 'Toán', status: 'ACTIVE' },
    ]);

    const result = await service.workspaceContext({ academicYearId: 'year-1' }, request);

    expect(prisma.academicYear.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    }));
    expect(prisma.schoolClass.findMany).toHaveBeenCalledWith({
      where: { academicYearId: 'year-1' },
      select: { id: true, code: true, name: true, status: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    expect(prisma.subject.findMany).toHaveBeenCalledWith({
      select: { id: true, code: true, name: true, status: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    expect(result).toEqual({
      academicYears: [
        {
          id: 'year-1',
          code: '2025-2026',
          name: 'Năm học 2025-2026',
          activeCalendar: { startDate: '2025-08-01', endDate: '2026-05-31' },
        },
        {
          id: 'year-2',
          code: '2026-2027',
          name: 'Năm học 2026-2027',
          activeCalendar: null,
        },
      ],
      selectedAcademicYear: {
        id: 'year-1',
        code: '2025-2026',
        name: 'Năm học 2025-2026',
        activeCalendar: { startDate: '2025-08-01', endDate: '2026-05-31' },
        schoolClasses: [
          { id: 'class-a', code: '10A1', name: 'Lớp 10A1', status: 'ACTIVE' },
          { id: 'class-z', code: '12C1', name: 'Lớp 12C1', status: 'INACTIVE' },
        ],
        subjects: [
          { id: 'subject-a', code: 'ANH', name: 'Tiếng Anh', status: 'INACTIVE' },
          { id: 'subject-t', code: 'TOAN', name: 'Toán', status: 'ACTIVE' },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/createdAt|updatedAt|note|audit|requestFingerprint/);
    expect(audit.write).not.toHaveBeenCalled();
  });

  it('returns 404 semantics for an explicit academic year that does not exist', async () => {
    const { service, prisma } = setup([
      { key: 'REPORTING_STATEMENT_READ', scope: 'PERSONAL' },
    ]);
    prisma.academicYear.findMany.mockResolvedValue([]);

    await expect(service.workspaceContext({ academicYearId: 'missing-year' }, request))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.schoolClass.findMany).not.toHaveBeenCalled();
    expect(prisma.subject.findMany).not.toHaveBeenCalled();
  });
});
