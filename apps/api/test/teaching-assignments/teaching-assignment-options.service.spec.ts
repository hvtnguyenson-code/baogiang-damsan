import { TeachingAssignmentOptionsService } from '../../src/teaching-assignments/teaching-assignment-options.service';
import { businessMidnight } from '../../src/teaching-assignments/teaching-assignment-policy';

describe('TeachingAssignmentOptionsService', () => {
  it('uses the active calendar end as the omitted validUntil eligibility horizon', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      academicYear: { findUnique: jest.fn().mockResolvedValue({ id: 'year' }) },
      academicCalendarVersion: { findFirst: jest.fn().mockResolvedValue({
        id: 'calendar',
        academicYearId: 'year',
        versionNumber: 1,
        startDate: new Date('2026-08-03T00:00:00.000Z'),
        endDate: new Date('2026-09-18T00:00:00.000Z'),
      }) },
      subject: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      user: { findMany, count },
      $transaction: jest.fn(async (queries: Array<Promise<unknown>>) => Promise.all(queries)),
    };
    const service = new TeachingAssignmentOptionsService(prisma as never);

    await service.listEligibleTeachers('year', {
      subjectId: 'subject',
      validFrom: '2026-08-03',
      page: 1,
      pageSize: 20,
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        staffSubjects: { some: expect.objectContaining({
          subjectId: 'subject',
          validFrom: { lte: businessMidnight('2026-08-03') },
          OR: [{ validUntil: null }, { validUntil: { gte: businessMidnight('2026-09-19') } }],
        }) },
      }),
    }));
  });
});
