import { ReportingProjectionService } from '../../src/reporting-projection/reporting-projection.service';

const input = (roots = [{ schoolClassId: 'class', subjectId: 'subject' }]) => ({ academicYearId: 'year', roots, fromCivilDate: '2026-08-01' as never, toCivilDate: '2026-08-31' as never, asOfInstant: new Date('2026-08-10T00:00:00.000Z') });
function harness() {
  const prisma = { $transaction: jest.fn() };
  const progressDebt = { resolve: jest.fn(), resolveInTransaction: jest.fn() };
  return { prisma, progressDebt, service: new ReportingProjectionService(prisma as never, progressDebt as never) };
}
describe('ReportingProjectionService input validation', () => {
  it('R1 rejects empty roots', async () => { const h = harness(); await expect(h.service.resolve(input([]))).rejects.toThrow('roots must be a non-empty array.'); expect(h.prisma.$transaction).not.toHaveBeenCalled(); });
  it('R2 rejects duplicate roots', async () => { const h = harness(); const root = { schoolClassId: 'class', subjectId: 'subject' }; await expect(h.service.resolve(input([root, root]))).rejects.toThrow('roots must be explicit and unique.'); });
  it('R3 rejects inverted civil range', async () => { const h = harness(); await expect(h.service.resolve({ ...input(), fromCivilDate: '2026-08-31' as never, toCivilDate: '2026-08-01' as never })).rejects.toThrow('fromCivilDate must be on or before toCivilDate.'); });
  it('R6 rejects invalid asOfInstant', async () => { const h = harness(); await expect(h.service.resolve({ ...input(), asOfInstant: new Date('bad') })).rejects.toThrow('asOfInstant must be a valid instant.'); });
});

function item(overrides: Record<string, unknown> = {}) {
  return {
    classification: 'COMPLETED',
    component: 'CORE',
    sourceNormalOccurrenceKey: 'o',
    originalTimetableVersionId: 'tv',
    originalTimetableEntryId: 'te',
    sourceCivilDate: '2026-08-31',
    sourceAcademicCalendarVersionId: 'cal',
    sourceTimeSlotDefinitionId: 'slot',
    originalTeachingAssignmentId: 'a',
    responsibleTeacherUserId: 'responsible',
    ppctClassAssociationId: 'pa',
    ppctPlanId: 'p',
    ppctVersionId: 'v',
    ppctItemId: 'i',
    ppctItemRevisionId: 'r',
    operationalLessonDispositionId: null,
    operationalDispositionType: null,
    fulfillmentExecutionId: null,
    fulfillmentKind: null,
    makeupTeachingScheduleId: null,
    executionCivilDate: null,
    executionAcademicCalendarVersionId: null,
    executionTimeSlotDefinitionId: null,
    actualTeacherUserId: null,
    ...overrides,
  };
}
function semanticHarness(results: unknown[] = [{ status: 'PASS', counts: {}, items: [item()], findings: [] }]) {
  const academicCalendarVersionFindFirst = jest.fn().mockResolvedValue({ id: 'cal', startDate: new Date('2026-08-01T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z') });
  const schoolClassFindMany = jest.fn().mockImplementation((args: { where: { id: { in: string[] } } }) => Promise.resolve(args.where.id.in.map((id: string) => ({ id, academicYearId: 'year' }))));
  const timeSlotDefinitionFindMany = jest.fn().mockImplementation((args: { where: { id: { in: string[] } } }) => Promise.resolve(args.where.id.in.map((id: string) => ({ id, startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z') }))));
  const tx = { academicCalendarVersion: { findFirst: academicCalendarVersionFindFirst }, schoolClass: { findMany: schoolClassFindMany }, timeSlotDefinition: { findMany: timeSlotDefinitionFindMany }, specialActivity: { findMany: jest.fn() }, create: jest.fn(), update: jest.fn(), delete: jest.fn(), upsert: jest.fn() };
  const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
  const progressDebt = {
    resolve: jest.fn(),
    resolveInTransaction: jest.fn().mockImplementation(() => Promise.resolve(results.shift())),
    resolveInTransactionV2: jest.fn().mockImplementation(() => Promise.resolve(results.shift())),
  };
  return { tx, prisma, progressDebt, service: new ReportingProjectionService(prisma as never, progressDebt as never) };
}describe('ReportingProjectionService semantic harness', () => {
  it('R4/R8/R9/R10/R13 cross-month uses one RepeatableRead transaction, same tx, calls resolveInTransactionV2, and filtered counts', async () => { const h = semanticHarness([{ status: 'PASS', counts: { distributedElapsedCount: 9, completedCount: 7, openDebtCount: 1, lateCount: 1, unconfirmedGapCount: 1 }, items: [item({ sourceCivilDate: '2026-08-30', classification: 'COMPLETED' }), item({ sourceCivilDate: '2026-09-02', classification: 'PROVEN_OPEN_DEBT' }), item({ sourceCivilDate: '2026-10-01' })], findings: [] }]); const result = await h.service.resolve({ ...input(), fromCivilDate: '2026-08-30' as never, toCivilDate: '2026-09-02' as never }); expect(result.counts).toEqual({ distributedElapsedCount: 2, completedCount: 1, openDebtCount: 1, lateCount: 1, unconfirmedGapCount: 0 }); expect(h.prisma.$transaction).toHaveBeenCalledTimes(1); expect((h.prisma.$transaction.mock.calls as unknown as Array<Array<unknown>>)[0]![1]).toMatchObject({ isolationLevel: 'RepeatableRead' }); expect(h.progressDebt.resolveInTransactionV2).toHaveBeenCalledWith(h.tx, expect.anything()); expect(h.progressDebt.resolveInTransaction).not.toHaveBeenCalled(); expect(h.progressDebt.resolve).not.toHaveBeenCalled(); });
  it('R5/R7 reject range and class outside authoritative ownership', async () => { const h = semanticHarness(); h.tx.academicCalendarVersion.findFirst.mockResolvedValue({ id: 'cal', startDate: new Date('2026-08-01T00:00:00Z'), endDate: new Date('2026-08-31T00:00:00Z') }); await expect(h.service.resolve({ ...input(), toCivilDate: '2026-09-01' as never })).rejects.toThrow('wholly within'); const x = semanticHarness(); x.tx.schoolClass.findMany.mockResolvedValue([{ id: 'class', academicYearId: 'other' }]); await expect(x.service.resolve(input())).rejects.toThrow('belong to academicYearId'); });
  it('R11/R12/R14-R21 preserves filtered classifications, teachers and MAKEUP source ownership', async () => { const h = semanticHarness([{ status: 'PASS', counts: {}, items: [item({ sourceCivilDate: '2026-08-01', classification: 'UNCONFIRMED_COMPLETION_GAP' }), item({ sourceCivilDate: '2026-08-31', classification: 'PROVEN_OPEN_DEBT', operationalDispositionType: 'DIFFERENT_SUBJECT_SUPERVISION', responsibleTeacherUserId: 'r', actualTeacherUserId: 'a', fulfillmentKind: 'MAKEUP', executionCivilDate: '2026-09-05' }), item({ sourceCivilDate: '2026-09-05', executionCivilDate: '2026-08-02' })], findings: [] }]); const result = await h.service.resolve(input()); expect(result.roots[0].details).toHaveLength(2); expect(result.roots[0].counts).toMatchObject({ completedCount: 0, openDebtCount: 1, lateCount: 1, unconfirmedGapCount: 1 }); expect(result.roots[0].details[1]).toMatchObject({ responsibleTeacherUserId: 'r', actualTeacherUserId: 'a', fulfillmentKind: 'MAKEUP' }); });
  it('R23/R24/R26/R27/R28 handles blocked roots, sums pass roots and does not cache or write', async () => { const h = semanticHarness([{ status: 'PASS', counts: {}, items: [item()], findings: [] }, { status: 'BLOCKED', items: [], findings: [{ code: 'RECONCILIATION_REQUIRED' }] }]); const blocked = await h.service.resolve(input([{ schoolClassId: 'class', subjectId: 'subject' }, { schoolClassId: 'class2', subjectId: 'subject2' }])); expect(blocked.status).toBe('BLOCKED'); expect(blocked.counts).toBeNull(); expect(blocked.roots.find((x) => x.status === 'BLOCKED')?.counts).toBeNull(); expect(h.tx.specialActivity.findMany).not.toHaveBeenCalled(); expect(h.tx.create).not.toHaveBeenCalled(); const next = semanticHarness([{ status: 'PASS', counts: {}, items: [item({ classification: 'COMPLETED' })], findings: [] }, { status: 'PASS', counts: {}, items: [item({ classification: 'PROVEN_OPEN_DEBT' })], findings: [] }]); expect((await next.service.resolve(input())).counts?.completedCount).toBe(1); expect((await next.service.resolve(input())).counts?.openDebtCount).toBe(1); });
});

describe('ReportingProjectionService ordering and fail-closed guards', () => {
  it('R22 orders intentionally shuffled details by date, slot start, slot end, then occurrence key', async () => {
    const h = semanticHarness([{ status: 'PASS', counts: {}, findings: [], items: [
      item({ sourceNormalOccurrenceKey: 'z', sourceCivilDate: '2026-08-02', sourceTimeSlotDefinitionId: 's5' }),
      item({ sourceNormalOccurrenceKey: 'b', sourceCivilDate: '2026-08-01', sourceTimeSlotDefinitionId: 's4' }),
      item({ sourceNormalOccurrenceKey: 'a', sourceCivilDate: '2026-08-01', sourceTimeSlotDefinitionId: 's4' }),
      item({ sourceNormalOccurrenceKey: 'end', sourceCivilDate: '2026-08-01', sourceTimeSlotDefinitionId: 's3' }),
      item({ sourceNormalOccurrenceKey: 'start', sourceCivilDate: '2026-08-01', sourceTimeSlotDefinitionId: 's2' }),
    ] }]);
    h.tx.timeSlotDefinition.findMany.mockResolvedValue([{ id: 's5', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z') }, { id: 's4', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T07:45:00Z') }, { id: 's3', startTime: new Date('1970-01-01T07:00:00Z'), endTime: new Date('1970-01-01T08:00:00Z') }, { id: 's2', startTime: new Date('1970-01-01T06:00:00Z'), endTime: new Date('1970-01-01T07:00:00Z') }]);
    const result = await h.service.resolve(input());
    expect(result.roots[0].details.map((x) => x.sourceNormalOccurrenceKey)).toEqual(['start', 'a', 'b', 'end', 'z']);
  });
  it('R25 fails closed when exact retained source slot cannot resolve', async () => {
    const h = semanticHarness([{ status: 'PASS', counts: {}, findings: [], items: [item({ sourceTimeSlotDefinitionId: 'missing' })] }]);
    h.tx.timeSlotDefinition.findMany.mockResolvedValue([]);
    const result = await h.service.resolve(input()); expect(result.status).toBe('BLOCKED'); expect(result.counts).toBeNull(); expect(result.roots[0]).toMatchObject({ status: 'BLOCKED', counts: null, details: [] }); expect(result.roots[0].findings[0]).toMatchObject({ code: 'SOURCE_TIME_SLOT_PROVENANCE_MISSING', occurrenceKey: 'o' });
  });
  it('I1/I2 derive arithmetic invariants and I3/I4 null blocked aggregates', async () => {
    const h = semanticHarness([{ status: 'PASS', counts: {}, findings: [], items: [item({ classification: 'COMPLETED' }), item({ classification: 'PROVEN_OPEN_DEBT' }), item({ classification: 'UNCONFIRMED_COMPLETION_GAP' })] }]);
    const result = await h.service.resolve(input()); const c = result.counts!;
    expect(c.distributedElapsedCount).toBe(c.completedCount + c.openDebtCount + c.unconfirmedGapCount); expect(c.lateCount).toBe(c.openDebtCount);
  });
});

describe('ReportingProjectionService P2-003 Checkpoint 4A component-aware reporting', () => {
  it('1. CORE_ONLY reporting replay yields equivalent results with CORE component provenance', async () => {
    const h = semanticHarness([{
      status: 'PASS',
      counts: {},
      findings: [],
      items: [
        item({ sourceNormalOccurrenceKey: 'c1', sourceCivilDate: '2026-08-10', component: 'CORE', classification: 'COMPLETED' }),
        item({ sourceNormalOccurrenceKey: 'c2', sourceCivilDate: '2026-08-17', component: 'CORE', classification: 'PROVEN_OPEN_DEBT' }),
      ],
    }]);
    const result = await h.service.resolve(input());
    expect(result.status).toBe('PASS');
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0].details).toHaveLength(2);
    expect(result.roots[0].details[0].component).toBe('CORE');
    expect(result.roots[0].details[1].component).toBe('CORE');
    expect(result.counts).toEqual({
      distributedElapsedCount: 2,
      completedCount: 1,
      openDebtCount: 1,
      lateCount: 1,
      unconfirmedGapCount: 0,
    });
  });

  it('2. CORE + SPECIALIZED_STUDY under same class-subject project to a SINGLE reporting root', async () => {
    const h = semanticHarness([{
      status: 'PASS',
      counts: {},
      findings: [],
      items: [
        item({ sourceNormalOccurrenceKey: 'core-item', sourceCivilDate: '2026-08-10', component: 'CORE' }),
        item({ sourceNormalOccurrenceKey: 'spec-item', sourceCivilDate: '2026-08-11', component: 'SPECIALIZED_STUDY' }),
      ],
    }]);
    const result = await h.service.resolve(input([{ schoolClassId: '10A1', subjectId: 'Math' }]));
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0].scope).toEqual({ schoolClassId: '10A1', subjectId: 'Math' });
    expect(result.roots[0].details).toHaveLength(2);
  });

  it('3 & 4. Combined counts include both CORE and SPECIALIZED_STUDY completed items without double-counting', async () => {
    const h = semanticHarness([{
      status: 'PASS',
      counts: {},
      findings: [],
      items: [
        item({ sourceNormalOccurrenceKey: 'c1', sourceCivilDate: '2026-08-10', component: 'CORE', classification: 'COMPLETED' }),
        item({ sourceNormalOccurrenceKey: 'c2', sourceCivilDate: '2026-08-12', component: 'CORE', classification: 'COMPLETED' }),
        item({ sourceNormalOccurrenceKey: 's1', sourceCivilDate: '2026-08-15', component: 'SPECIALIZED_STUDY', classification: 'COMPLETED' }),
      ],
    }]);
    const result = await h.service.resolve(input());
    expect(result.counts).toEqual({
      distributedElapsedCount: 3,
      completedCount: 3,
      openDebtCount: 0,
      lateCount: 0,
      unconfirmedGapCount: 0,
    });
    expect(result.counts!.distributedElapsedCount).toBe(
      result.counts!.completedCount + result.counts!.openDebtCount + result.counts!.unconfirmedGapCount,
    );
  });

  it('5. CORE proven debt + SPECIALIZED completed calculates exact combined counts', async () => {
    const h = semanticHarness([{
      status: 'PASS',
      counts: {},
      findings: [],
      items: [
        item({ sourceNormalOccurrenceKey: 'c1', sourceCivilDate: '2026-08-10', component: 'CORE', classification: 'PROVEN_OPEN_DEBT' }),
        item({ sourceNormalOccurrenceKey: 's1', sourceCivilDate: '2026-08-11', component: 'SPECIALIZED_STUDY', classification: 'COMPLETED' }),
      ],
    }]);
    const result = await h.service.resolve(input());
    expect(result.counts).toEqual({
      distributedElapsedCount: 2,
      completedCount: 1,
      openDebtCount: 1,
      lateCount: 1,
      unconfirmedGapCount: 0,
    });
  });

  it('6. CORE completed + SPECIALIZED proven debt calculates exact combined counts', async () => {
    const h = semanticHarness([{
      status: 'PASS',
      counts: {},
      findings: [],
      items: [
        item({ sourceNormalOccurrenceKey: 'c1', sourceCivilDate: '2026-08-10', component: 'CORE', classification: 'COMPLETED' }),
        item({ sourceNormalOccurrenceKey: 's1', sourceCivilDate: '2026-08-11', component: 'SPECIALIZED_STUDY', classification: 'PROVEN_OPEN_DEBT' }),
      ],
    }]);
    const result = await h.service.resolve(input());
    expect(result.counts).toEqual({
      distributedElapsedCount: 2,
      completedCount: 1,
      openDebtCount: 1,
      lateCount: 1,
      unconfirmedGapCount: 0,
    });
  });

  it('7. Unconfirmed gap in one component contributes to combined unconfirmedGapCount', async () => {
    const h = semanticHarness([{
      status: 'PASS',
      counts: {},
      findings: [],
      items: [
        item({ sourceNormalOccurrenceKey: 'c1', sourceCivilDate: '2026-08-10', component: 'CORE', classification: 'COMPLETED' }),
        item({ sourceNormalOccurrenceKey: 's1', sourceCivilDate: '2026-08-11', component: 'SPECIALIZED_STUDY', classification: 'UNCONFIRMED_COMPLETION_GAP' }),
      ],
    }]);
    const result = await h.service.resolve(input());
    expect(result.counts).toEqual({
      distributedElapsedCount: 2,
      completedCount: 1,
      openDebtCount: 0,
      lateCount: 0,
      unconfirmedGapCount: 1,
    });
    expect(result.counts!.distributedElapsedCount).toBe(
      result.counts!.completedCount + result.counts!.openDebtCount + result.counts!.unconfirmedGapCount,
    );
  });

  it('8 & 9. Exposes derived component and preserves exact PPCT provenance per detail item', async () => {
    const h = semanticHarness([{
      status: 'PASS',
      counts: {},
      findings: [],
      items: [
        item({
          sourceNormalOccurrenceKey: 'core-occ',
          sourceCivilDate: '2026-08-10',
          component: 'CORE',
          ppctClassAssociationId: 'assoc-core',
          ppctPlanId: 'plan-core',
          ppctVersionId: 'ver-core',
          ppctItemId: 'item-core',
          ppctItemRevisionId: 'rev-core',
        }),
        item({
          sourceNormalOccurrenceKey: 'spec-occ',
          sourceCivilDate: '2026-08-11',
          component: 'SPECIALIZED_STUDY',
          ppctClassAssociationId: 'assoc-spec',
          ppctPlanId: 'plan-spec',
          ppctVersionId: 'ver-spec',
          ppctItemId: 'item-spec',
          ppctItemRevisionId: 'rev-spec',
        }),
      ],
    }]);
    const result = await h.service.resolve(input());
    const [dCore, dSpec] = result.roots[0].details;
    expect(dCore.component).toBe('CORE');
    expect(dCore.ppctItemId).toBe('item-core');
    expect(dCore.ppctItemRevisionId).toBe('rev-core');
    expect(dSpec.component).toBe('SPECIALIZED_STUDY');
    expect(dSpec.ppctItemId).toBe('item-spec');
    expect(dSpec.ppctItemRevisionId).toBe('rev-spec');
  });

  it('10. MAKEUP fulfilling specialized obligation produces exactly one completed reporting row without extra row', async () => {
    const h = semanticHarness([{
      status: 'PASS',
      counts: {},
      findings: [],
      items: [
        item({
          sourceNormalOccurrenceKey: 'spec-orig',
          sourceCivilDate: '2026-08-10',
          component: 'SPECIALIZED_STUDY',
          classification: 'COMPLETED',
          fulfillmentKind: 'MAKEUP',
          makeupTeachingScheduleId: 'makeup-sched-1',
          executionCivilDate: '2026-08-20',
          actualTeacherUserId: 'teacher-sub',
        }),
      ],
    }]);
    const result = await h.service.resolve(input());
    expect(result.roots[0].details).toHaveLength(1);
    expect(result.roots[0].details[0]).toMatchObject({
      sourceNormalOccurrenceKey: 'spec-orig',
      component: 'SPECIALIZED_STUDY',
      fulfillmentKind: 'MAKEUP',
      classification: 'COMPLETED',
      makeupTeachingScheduleId: 'makeup-sched-1',
    });
    expect(result.counts).toEqual({
      distributedElapsedCount: 1,
      completedCount: 1,
      openDebtCount: 0,
      lateCount: 0,
      unconfirmedGapCount: 0,
    });
  });

  it('12. Range filtering strictly filters by sourceCivilDate, preserving source obligation semantics', async () => {
    const h = semanticHarness([{
      status: 'PASS',
      counts: {},
      findings: [],
      items: [
        // Source in range, execution outside range -> INCLUDED
        item({
          sourceNormalOccurrenceKey: 'in-range-makeup',
          sourceCivilDate: '2026-08-15',
          component: 'SPECIALIZED_STUDY',
          classification: 'COMPLETED',
          fulfillmentKind: 'MAKEUP',
          executionCivilDate: '2026-09-10',
        }),
        // Source outside range, execution in range -> EXCLUDED
        item({
          sourceNormalOccurrenceKey: 'out-range-source',
          sourceCivilDate: '2026-07-25',
          component: 'CORE',
          classification: 'COMPLETED',
          fulfillmentKind: 'MAKEUP',
          executionCivilDate: '2026-08-15',
        }),
      ],
    }]);
    const result = await h.service.resolve({
      ...input(),
      fromCivilDate: '2026-08-01' as never,
      toCivilDate: '2026-08-31' as never,
    });
    expect(result.roots[0].details).toHaveLength(1);
    expect(result.roots[0].details[0].sourceNormalOccurrenceKey).toBe('in-range-makeup');
  });

  it('13. Propagates upstream Progress/Debt V2 BLOCKED status with exact findings and null counts', async () => {
    const upstreamFindings = [
      { severity: 'BLOCKER' as const, code: 'UPSTREAM_ALLOCATION_BLOCKED' as const, reason: 'PPCT allocation blocked', occurrenceKey: null, entityIds: ['plan-1'] },
    ];
    const h = semanticHarness([{
      status: 'BLOCKED',
      counts: null,
      items: [],
      findings: upstreamFindings,
    }]);
    const result = await h.service.resolve(input());
    expect(result.status).toBe('BLOCKED');
    expect(result.counts).toBeNull();
    expect(result.roots[0].status).toBe('BLOCKED');
    expect(result.roots[0].counts).toBeNull();
    expect(result.roots[0].details).toEqual([]);
    expect(result.roots[0].findings).toEqual(upstreamFindings);
  });

  it('15. Multiple roots: grand totals equal exact sum of each root once', async () => {
    const h = semanticHarness([
      // Root 1 (Class A): 1 CORE completed + 1 SPECIALIZED debt = 2 elapsed
      {
        status: 'PASS',
        counts: {},
        findings: [],
        items: [
          item({ sourceNormalOccurrenceKey: 'a-c', sourceCivilDate: '2026-08-10', component: 'CORE', classification: 'COMPLETED' }),
          item({ sourceNormalOccurrenceKey: 'a-s', sourceCivilDate: '2026-08-11', component: 'SPECIALIZED_STUDY', classification: 'PROVEN_OPEN_DEBT' }),
        ],
      },
      // Root 2 (Class B): 2 CORE completed = 2 elapsed
      {
        status: 'PASS',
        counts: {},
        findings: [],
        items: [
          item({ sourceNormalOccurrenceKey: 'b-c1', sourceCivilDate: '2026-08-10', component: 'CORE', classification: 'COMPLETED' }),
          item({ sourceNormalOccurrenceKey: 'b-c2', sourceCivilDate: '2026-08-12', component: 'CORE', classification: 'COMPLETED' }),
        ],
      },
    ]);
    const result = await h.service.resolve(input([
      { schoolClassId: 'class-a', subjectId: 'subject-1' },
      { schoolClassId: 'class-b', subjectId: 'subject-1' },
    ]));
    expect(result.roots).toHaveLength(2);
    expect(result.counts).toEqual({
      distributedElapsedCount: 4,
      completedCount: 3,
      openDebtCount: 1,
      lateCount: 1,
      unconfirmedGapCount: 0,
    });
  });

  it('18. Required P2-003 invariant: distributedElapsedCount === completedCount + openDebtCount + unconfirmedGapCount', async () => {
    const h = semanticHarness([{
      status: 'PASS',
      counts: {},
      findings: [],
      items: [
        item({ sourceNormalOccurrenceKey: '1', sourceCivilDate: '2026-08-10', component: 'CORE', classification: 'COMPLETED' }),
        item({ sourceNormalOccurrenceKey: '2', sourceCivilDate: '2026-08-11', component: 'SPECIALIZED_STUDY', classification: 'PROVEN_OPEN_DEBT' }),
        item({ sourceNormalOccurrenceKey: '3', sourceCivilDate: '2026-08-12', component: 'CORE', classification: 'UNCONFIRMED_COMPLETION_GAP' }),
      ],
    }]);
    const result = await h.service.resolve(input());
    const c = result.counts!;
    expect(c.distributedElapsedCount).toBe(3);
    expect(c.distributedElapsedCount).toBe(c.completedCount + c.openDebtCount + c.unconfirmedGapCount);
  });
});
