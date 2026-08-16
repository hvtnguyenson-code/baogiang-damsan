import { ResolvedLessonOccurrencesService } from '../../src/resolved-occurrences/resolved-occurrences.service';
import { PpctAssociationReadService } from '../../src/ppct/ppct-association-read.service';
import { integration, normalizedCode, Phase01Harness } from '../helpers/phase01-test-harness';

integration('resolved lesson occurrences structural read model (PostgreSQL)', () => {
  const h = new Phase01Harness();
  beforeAll(async () => h.start());
  afterAll(async () => { try { await h.clean(); } finally { await h.stop(); } });
  beforeEach(async () => h.clean());

  it('performs a database-backed read without creating any rows', async () => {
    const year = await h.prisma.academicYear.create({ data: { code: normalizedCode('OCC'), name: 'Occurrence year' } });
    const service = new ResolvedLessonOccurrencesService(h.prisma as never, new PpctAssociationReadService(h.prisma as never));
    const before = await Promise.all([h.prisma.academicYear.count(), h.prisma.timetableVersion.count(), h.prisma.specialActivity.count(), h.prisma.makeupTeachingSchedule.count()]);
    const result = await service.resolve({ academicYearId: year.id, civilDate: '2026-08-17' });
    const after = await Promise.all([h.prisma.academicYear.count(), h.prisma.timetableVersion.count(), h.prisma.specialActivity.count(), h.prisma.makeupTeachingSchedule.count()]);
    expect(result).toMatchObject({ status: 'BLOCKED', coverage: { ppctItemAllocation: 'NOT_ASSESSED' }, findings: [expect.objectContaining({ code: 'TIMETABLE_EFFECTIVE_VERSION_MISSING' })] });
    expect(after).toEqual(before);
  });
});
