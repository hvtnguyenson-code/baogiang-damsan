import { ResolvedLessonOccurrencesService } from '../../src/resolved-occurrences/resolved-occurrences.service';

describe('ResolvedLessonOccurrencesService', () => {
  it('uses one RepeatableRead interactive transaction and fails closed for no effective timetable', async () => {
    const tx = { timetableVersion: { findMany: jest.fn().mockResolvedValue([]) }, specialActivity: { findMany: jest.fn().mockResolvedValue([]) }, makeupTeachingSchedule: { findMany: jest.fn().mockResolvedValue([]) } };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new ResolvedLessonOccurrencesService(prisma as never, {} as never);
    const result = await service.resolve({ academicYearId: 'year', civilDate: '2026-08-16' });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    expect(result).toMatchObject({ status: 'BLOCKED', coverage: { ppctItemAllocation: 'NOT_ASSESSED' } });
    expect(result.findings).toEqual([expect.objectContaining({ code: 'TIMETABLE_EFFECTIVE_VERSION_MISSING' })]);
  });
});
