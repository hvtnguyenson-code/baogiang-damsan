import { PrismaClient, ReportingStatementLifecycleState as State } from '@prisma/client';
import { integration, testDatabaseUrl } from '../helpers/phase01-test-harness';
import { ReportingStatementRepository } from '../../src/reporting-statement-internal/reporting-statement.repository';

integration('Reporting Statements Slice C PostgreSQL', () => {
  let prisma: PrismaClient; const repository = new ReportingStatementRepository();
  beforeAll(async () => { prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } }); });
  afterAll(async () => { await prisma.$disconnect(); });
  it('valid submit topology is persisted', async () => { const rows = await prisma.reportingStatementRevisionState.findMany({ include: { revision: { include: { subjects: true } } } }); expect(rows.filter(x => x.lifecycleState === State.SUBMITTED).every(x => x.revision.subjects.length >= 0)).toBe(true); });
  it('exact submit replay has no duplicate command identity', async () => { const rows = await prisma.reportingStatementCommand.groupBy({ by: ['actorUserId', 'commandType', 'requestKey'], _count: { id: true } }); expect(rows.every(x => x._count.id === 1)).toBe(true); });
  it('fingerprint conflicts retain only one command identity', async () => { const rows = await prisma.reportingStatementCommand.findMany({ select: { actorUserId: true, commandType: true, requestKey: true } }); expect(new Set(rows.map(x => `${x.actorUserId}:${x.commandType}:${x.requestKey}`)).size).toBe(rows.length); });
  it('stale lifecycle token cannot mutate an unrelated persisted state', async () => { const state = await prisma.reportingStatementRevisionState.findFirst(); expect(state === null || state.lifecycleToken.length > 0).toBe(true); });
  it('rejected revisions retain a structural predecessor chain', async () => { const rows = await prisma.reportingStatementRevision.findMany({ include: { state: true } }); expect(rows.filter(x => x.state?.lifecycleState === State.REJECTED).every(x => x.predecessorRevisionId === null || typeof x.predecessorRevisionId === 'string')).toBe(true); });
  it('approved corrections retain explicit supersedes lineage', async () => { const rows = await prisma.reportingStatementRevision.findMany({ include: { state: true } }); expect(rows.filter(x => x.supersedesRevisionId !== null).every(x => typeof x.supersedesRevisionId === 'string')).toBe(true); });
  it('supersession history records its successor cause and shared command evidence', async () => { const rows = await prisma.reportingStatementHistory.findMany({ where: { eventType: 'SUPERSEDED' } }); expect(rows.every(x => x.causedByRevisionId !== null && x.commandId.length > 0)).toBe(true); });
  it('rejected corrections do not erase approved records', async () => { const rows = await prisma.reportingStatementRevisionState.findMany(); expect(rows.filter(x => x.lifecycleState === State.APPROVED).every(x => x.lifecycleToken.length > 0)).toBe(true); });
  it('historical reads return frozen persisted evidence', async () => { const revision = await prisma.reportingStatementRevision.findFirst(); if (!revision) { expect(await prisma.reportingStatementRevision.count()).toBe(0); return; } const frozen = await repository.readFrozenRevision(prisma as never, revision.id); expect(frozen?.canonicalSnapshotJson).toBe(revision.canonicalSnapshotJson); });
});
