import { BadRequestException, ConflictException } from '@nestjs/common';
import { AcademicCalendarVersion } from '@prisma/client';
import {
  businessMidnight,
  ensureCalendarActivationCompatibility,
  intervalIsWithinCalendar,
  nextCivilDate,
  previousCivilDate,
  requireCalendarEnvelope,
  requireStaffSubjectCoverage,
  staffSubjectCoverageBounds,
  staffSubjectCoverageWhere,
} from '../../src/teaching-assignments/teaching-assignment-policy';

const calendar = {
  startDate: new Date('2026-08-03T00:00:00.000Z'),
  endDate: new Date('2026-09-18T00:00:00.000Z'),
} as Pick<AcademicCalendarVersion, 'startDate' | 'endDate'>;

describe('teaching-assignment civil-date policy', () => {
  it('accepts both inclusive calendar boundaries and keeps null validUntil unchanged', () => {
    expect(intervalIsWithinCalendar('2026-08-03', '2026-09-18', calendar)).toBe(true);
    expect(intervalIsWithinCalendar('2026-08-03', '2026-08-03', calendar)).toBe(true);
    expect(intervalIsWithinCalendar('2026-09-18', '2026-09-18', calendar)).toBe(true);
    expect(intervalIsWithinCalendar('2026-08-02', '2026-09-18', calendar)).toBe(false);
    expect(intervalIsWithinCalendar('2026-08-03', '2026-09-19', calendar)).toBe(false);
    expect(intervalIsWithinCalendar('2026-08-03', null, calendar)).toBe(true);
    expect(() => requireCalendarEnvelope('2026-08-03', null, calendar)).not.toThrow();
  });

  it('rejects validUntil before validFrom instead of treating it as a calendar-envelope failure', () => {
    expect(() => requireCalendarEnvelope('2026-08-10', '2026-08-09', calendar)).toThrow(BadRequestException);
  });

  it('rejects an incompatible candidate calendar before activation and rechecks open-ended coverage', async () => {
    const openEndedAssignment = {
      validFrom: new Date('2026-08-03T00:00:00.000Z'),
      validUntil: null,
      teacherUserId: '00000000-0000-0000-0000-000000000001',
      subjectId: '00000000-0000-0000-0000-000000000002',
    };
    const assignmentFindMany = jest.fn().mockResolvedValue([openEndedAssignment]);
    const coverageFindFirst = jest.fn().mockResolvedValue({ id: 'coverage' });
    await ensureCalendarActivationCompatibility({
      teachingAssignment: { findMany: assignmentFindMany },
      staffSubject: { findFirst: coverageFindFirst },
    } as never, {
      academicYearId: '00000000-0000-0000-0000-000000000003',
      startDate: new Date('2026-08-03T00:00:00.000Z'),
      endDate: new Date('2026-09-18T00:00:00.000Z'),
    });
    expect(coverageFindFirst).toHaveBeenCalled();

    assignmentFindMany.mockResolvedValue([{ ...openEndedAssignment, validFrom: new Date('2026-08-02T00:00:00.000Z') }]);
    await expect(ensureCalendarActivationCompatibility({
      teachingAssignment: { findMany: assignmentFindMany },
      staffSubject: { findFirst: coverageFindFirst },
    } as never, {
      academicYearId: '00000000-0000-0000-0000-000000000003',
      startDate: new Date('2026-08-03T00:00:00.000Z'),
      endDate: new Date('2026-09-18T00:00:00.000Z'),
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('performs civil-day arithmetic across month, leap-day and year boundaries', () => {
    expect(previousCivilDate('2026-03-01')).toBe('2026-02-28');
    expect(nextCivilDate('2026-01-31')).toBe('2026-02-01');
    expect(previousCivilDate('2028-03-01')).toBe('2028-02-29');
    expect(nextCivilDate('2028-02-28')).toBe('2028-02-29');
    expect(nextCivilDate('2028-02-29')).toBe('2028-03-01');
    expect(previousCivilDate('2027-01-01')).toBe('2026-12-31');
    expect(nextCivilDate('2026-12-31')).toBe('2027-01-01');
  });

  it('maps business midnight at +07:00 to the exact absolute instant', () => {
    expect(businessMidnight('2026-08-03').toISOString()).toBe('2026-08-02T17:00:00.000Z');
  });

  it('derives one canonical half-open StaffSubject predicate from inclusive civil dates', () => {
    const bounds = staffSubjectCoverageBounds('2028-02-29', '2028-03-01');
    expect(bounds.coverageStart.toISOString()).toBe('2028-02-28T17:00:00.000Z');
    expect(bounds.coverageEndExclusive.toISOString()).toBe('2028-03-01T17:00:00.000Z');
    const where = staffSubjectCoverageWhere('subject-id', '2028-02-29', '2028-03-01');
    expect(where).toEqual({
      subjectId: 'subject-id',
      validFrom: { lte: bounds.coverageStart },
      OR: [{ validUntil: null }, { validUntil: { gte: bounds.coverageEndExclusive } }],
    });
    expect(bounds.coverageEndExclusive >= bounds.coverageEndExclusive).toBe(true);
    expect(new Date(bounds.coverageEndExclusive.getTime() - 1) >= bounds.coverageEndExclusive).toBe(false);
  });

  it('queries StaffSubject with inclusive start and exact inclusive end-exclusive coverage', async () => {
    const validUntil = businessMidnight('2026-09-19');
    const findFirst = jest.fn().mockResolvedValue({ id: 'coverage' });
    await requireStaffSubjectCoverage(
      { staffSubject: { findFirst } } as never,
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      '2026-08-03',
      '2026-09-18',
    );
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        validFrom: { lte: businessMidnight('2026-08-03') },
        OR: [{ validUntil: null }, { validUntil: { gte: validUntil } }],
      }),
    }));
  });

  it('rejects a missing StaffSubject match while PostgreSQL integration proves the early-end boundary', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await expect(requireStaffSubjectCoverage(
      { staffSubject: { findFirst } } as never,
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      '2026-08-03',
      '2026-09-18',
    )).rejects.toBeInstanceOf(ConflictException);
  });
});
