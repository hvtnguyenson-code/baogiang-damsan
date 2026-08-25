import { ConflictException } from '@nestjs/common';
import { ReportingStatementsService } from '../../src/reporting-statements/reporting-statements.service';

const asOf = new Date('2026-08-25T00:00:00.000Z');
const request = { auth: { user: { id: 'actor', mustChangePassword: false } } } as never;
const dto = { academicYearId: 'year', fromCivilDate: '2026-08-01', toCivilDate: '2026-08-31', requestKey: 'key' };
function service(command: unknown[] = [{ kind: 'REPLAY', command: { resultRevisionId: 'revision', seriesId: 'series', resultLifecycleState: 'SUBMITTED', resultLifecycleToken: 'token', submissionAsOfInstant: asOf } }]) {
  const repository = { classifyAcceptedCommand: jest.fn().mockImplementation(() => Promise.resolve(command.shift() ?? { kind: 'MISS' })), findSeriesByLogicalKey: jest.fn(), lockSeries: jest.fn(), lineageTail: jest.fn(), loadCurrentApproved: jest.fn(), persistSubmittedRevision: jest.fn() };
  const projection = { resolveInTransaction: jest.fn() }; const authorization = { evaluate: jest.fn().mockResolvedValue({ allowed: true }) }; const clock = { now: jest.fn(() => asOf) };
  const prisma = { $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ ...repository, user: { findUnique: jest.fn() } })) };
  return { sut: new ReportingStatementsService(prisma as never, repository as never, projection as never, authorization as never, { write: jest.fn() } as never, clock), repository, projection, authorization, clock, prisma };
}
describe('ReportingStatementsService.submit', () => {
  it('replays after authorization without clock, projection, or persistence', async () => { const x = service(); await expect(x.sut.submit(dto as never, request)).resolves.toMatchObject({ replay: true }); expect(x.authorization.evaluate).toHaveBeenCalled(); expect(x.clock.now).not.toHaveBeenCalled(); expect(x.projection.resolveInTransaction).not.toHaveBeenCalled(); expect(x.repository.persistSubmittedRevision).not.toHaveBeenCalled(); });
  it('rejects a changed fingerprint before clock or projection', async () => { const x = service([{ kind: 'FINGERPRINT_CONFLICT', command: {} }]); await expect(x.sut.submit(dto as never, request)).rejects.toBeInstanceOf(ConflictException); expect(x.clock.now).not.toHaveBeenCalled(); expect(x.projection.resolveInTransaction).not.toHaveBeenCalled(); });
  it('pins one clock instant for a new submit', async () => { const x = service([{ kind: 'MISS' }, { kind: 'MISS' }]); x.repository.persistSubmittedRevision.mockResolvedValue({ revision: { id: 'r' }, series: { id: 's' }, state: { lifecycleState: 'SUBMITTED', lifecycleToken: 't' } }); x.projection.resolveInTransaction.mockResolvedValue({ responsibilityState: 'ZERO_RESPONSIBILITY' }); await expect(x.sut.submit(dto as never, request)).rejects.toThrow(); expect(x.clock.now).toHaveBeenCalledTimes(1); expect(x.projection.resolveInTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ asOfInstant: asOf })); });
  it('reuses one pinned instant across a retry attempt', async () => { const x = service([{ kind: 'MISS' }, { kind: 'MISS' }, { kind: 'MISS' }]); x.prisma.$transaction.mockRejectedValueOnce({ code: 'P2034', constructor: { name: 'PrismaClientKnownRequestError' } }); await expect(x.sut.submit(dto as never, request)).rejects.toThrow(); expect(x.clock.now).toHaveBeenCalledTimes(1); });
});
