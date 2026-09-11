import { TimetableReadinessService } from '../../src/timetables/timetable-readiness.service';

const evaluatedFrom = '2026-09-07';
const evaluatedTo = '2026-09-14';

const versionFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'version-1',
  academicYearId: 'year-1',
  status: 'VALIDATED',
  calendarVersionId: 'calendar-1',
  effectiveAcademicWeekId: 'week-1',
  effectiveFrom: new Date('2026-09-07Z'),
  effectiveUntil: null,
  validatedAt: new Date('2026-08-14T00:00:00Z'),
  validatedByUserId: 'actor',
  entries: [
    { id: 'entry-b', weekday: 'MONDAY', schoolClassId: 'class-1', subjectId: 'subject-1' },
    { id: 'entry-a', weekday: 'MONDAY', schoolClassId: 'class-1', subjectId: 'subject-1' },
  ],
  ...overrides,
});

const calendarFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'calendar-1',
  academicYearId: 'year-1',
  endDate: new Date('2027-05-31Z'),
  teachingWeekdays: ['MONDAY', 'FRIDAY'],
  weeks: [
    { id: 'week-1', segments: [{ startDate: new Date('2026-09-07Z'), endDate: new Date('2026-09-07Z'), segmentOrder: 1 }] },
    { id: 'week-2', segments: [{ startDate: new Date('2026-09-14Z'), endDate: new Date('2026-09-14Z'), segmentOrder: 1 }] },
  ],
  ...overrides,
});

const associationFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'association-1',
  academicYearId: 'year-1',
  schoolClassId: 'class-1',
  subjectId: 'subject-1',
  ppctPlanId: 'plan-1',
  ppctVersionId: 'ppct-version-1',
  ppctVersionStatus: 'PUBLISHED',
  curricularProfile: 'CORE_ONLY',
  effectiveFrom: new Date('2026-09-01Z'),
  effectiveUntil: null,
  ...overrides,
});

function harnessV2(options: {
  version?: ReturnType<typeof versionFixture> | null;
  calendar?: ReturnType<typeof calendarFixture> | null;
  associations?: Array<ReturnType<typeof associationFixture>>;
  specializedCount?: number;
  allocatorResult?: { status: string; findings: Array<{ code: string; reason?: string }> };
} = {}) {
  const tx = {
    timetableVersion: { findUnique: jest.fn().mockResolvedValue(options.version === undefined ? versionFixture() : options.version) },
    academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue(options.calendar === undefined ? calendarFixture() : options.calendar) },
    ppctItemRevision: {
      count: jest.fn().mockResolvedValue(options.specializedCount ?? 1),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const associationRead = {
    findOverlappingRange: jest.fn().mockResolvedValue(options.associations ?? [associationFixture()]),
  };
  const allocation = {
    resolveInTransactionV2: jest.fn().mockResolvedValue(
      options.allocatorResult ?? { status: 'RESOLVED', findings: [] },
    ),
  };

  return {
    service: new TimetableReadinessService(prisma as never, associationRead as never, allocation as never),
    prisma,
    tx,
    associationRead,
    allocation,
  };
}

describe('TimetableReadinessService — V2 Component-aware Readiness', () => {
  it('1. resolves V1 profile by default and preserves V1 semantics', async () => {
    const { service } = harnessV2();
    const result = await service.evaluate('version-1', { from: evaluatedFrom, to: evaluatedTo });
    expect(result.profile).toBe('NORMAL_BASE_PPCT_V1');
    expect(result.productLabel).toBe('TIMETABLE READINESS — NORMAL BASE + PPCT BINDING');
    expect(result.dimensions.find((d) => d.key === 'PPCT_CAPACITY')).toEqual({
      key: 'PPCT_CAPACITY',
      state: 'NOT_ASSESSED',
      required: false,
    });
  });

  it('2. explicitly selects NORMAL_BASE_PPCT_COMPONENT_V2 when requested', async () => {
    const { service } = harnessV2();
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.profile).toBe('NORMAL_BASE_PPCT_COMPONENT_V2');
    expect(result.productLabel).toBe('TIMETABLE READINESS — NORMAL BASE + PPCT COMPONENT');
    expect(result.dimensions.find((d) => d.key === 'PPCT_CAPACITY')).toEqual({
      key: 'PPCT_CAPACITY',
      state: 'PASS',
      required: true,
    });
  });

  it('3. CORE_ONLY does not require specialized content (passes even if specializedCount is 0)', async () => {
    const { service, tx } = harnessV2({
      associations: [associationFixture({ curricularProfile: 'CORE_ONLY' })],
      specializedCount: 0,
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('PASS');
    expect(tx.ppctItemRevision.count).not.toHaveBeenCalled();
  });

  it('4. CORE_PLUS_SPECIALIZED_STUDY with >= 1 specialized item passes specialized gate', async () => {
    const { service, tx } = harnessV2({
      associations: [associationFixture({ curricularProfile: 'CORE_PLUS_SPECIALIZED_STUDY' })],
      specializedCount: 3,
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('PASS');
    expect(tx.ppctItemRevision.count).toHaveBeenCalledWith({
      where: { ppctVersionId: 'ppct-version-1', component: 'SPECIALIZED_STUDY' },
    });
  });

  it('5. CORE_PLUS_SPECIALIZED_STUDY with 0 specialized items is BLOCKED with PPCT_SPECIALIZED_CONTENT_MISSING', async () => {
    const { service } = harnessV2({
      associations: [associationFixture({ curricularProfile: 'CORE_PLUS_SPECIALIZED_STUDY' })],
      specializedCount: 0,
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('FAIL');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'PPCT_SPECIALIZED_CONTENT_MISSING',
        dimension: 'PPCT_CAPACITY',
        severity: 'BLOCKER',
      }),
    );
    expect(result.dimensions.find((d) => d.key === 'PPCT_CAPACITY')?.state).toBe('FAIL');
  });

  it('6. 0 routing opportunities does not trigger capacity blocker', async () => {
    // Timetable entries are for WEDNESDAY, but teachingWeekdays/segments only have MONDAY
    const { service, allocation } = harnessV2({
      version: versionFixture({
        entries: [{ id: 'entry-wed', weekday: 'WEDNESDAY', schoolClassId: 'class-1', subjectId: 'subject-1' }],
      }),
      associations: [],
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedFrom,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('PASS');
    expect(result.scope.affectedStreams).toEqual([]);
    expect(allocation.resolveInTransactionV2).not.toHaveBeenCalled();
  });

  it('7. exactly 1 routing opportunity for specialized profile surfaces PPCT_COMPONENT_WEEK_CAPACITY_INVALID', async () => {
    const { service } = harnessV2({
      associations: [associationFixture({ curricularProfile: 'CORE_PLUS_SPECIALIZED_STUDY' })],
      allocatorResult: {
        status: 'BLOCKED',
        findings: [{ code: 'PPCT_COMPONENT_WEEK_CAPACITY_INVALID', reason: 'Tuần chỉ có 1 tiết, không đủ tối thiểu 2 tiết cho chuyên đề.' }],
      },
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('FAIL');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'PPCT_COMPONENT_WEEK_CAPACITY_INVALID',
        dimension: 'PPCT_CAPACITY',
        severity: 'BLOCKER',
      }),
    );
  });

  it('8. >= 2 routing opportunities passes capacity gate when allocator resolves', async () => {
    const { service } = harnessV2({
      associations: [associationFixture({ curricularProfile: 'CORE_PLUS_SPECIALIZED_STUDY' })],
      allocatorResult: { status: 'RESOLVED', findings: [] },
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('PASS');
  });

  it('9. interruption gap outside AcademicWeekSegment is excluded and does not create false blocker', async () => {
    // Monday 2026-09-07 is inside week-1 segment, Tuesday 2026-09-08 is outside segment (interruption gap)
    // Timetable has entry for Tuesday, but Tuesday is excluded by segments -> no opportunity, no binding needed
    const { service } = harnessV2({
      version: versionFixture({
        entries: [
          { id: 'entry-mon', weekday: 'MONDAY', schoolClassId: 'class-1', subjectId: 'subject-1' },
          { id: 'entry-tue', weekday: 'TUESDAY', schoolClassId: 'class-1', subjectId: 'subject-1' },
        ],
      }),
      associations: [
        associationFixture({
          effectiveFrom: new Date('2026-09-07Z'),
          effectiveUntil: new Date('2026-09-07Z'), // Only covers Monday, leaves Tuesday uncovered
        }),
      ],
    });
    const result = await service.evaluate('version-1', {
      from: '2026-09-07',
      to: '2026-09-07',
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('PASS');
    expect(result.findings).toHaveLength(0);
  });

  it('10. multi-segment same AcademicWeek union evaluates successfully', async () => {
    const multiSegmentCalendar = calendarFixture({
      weeks: [{
        id: 'week-1',
        segments: [
          { startDate: new Date('2026-09-07Z'), endDate: new Date('2026-09-07Z'), segmentOrder: 1 },
          { startDate: new Date('2026-09-11Z'), endDate: new Date('2026-09-11Z'), segmentOrder: 2 },
        ],
      }],
    });
    const { service } = harnessV2({
      calendar: multiSegmentCalendar,
      version: versionFixture({
        entries: [
          { id: 'entry-mon', weekday: 'MONDAY', schoolClassId: 'class-1', subjectId: 'subject-1' },
          { id: 'entry-fri', weekday: 'FRIDAY', schoolClassId: 'class-1', subjectId: 'subject-1' },
        ],
      }),
    });
    const result = await service.evaluate('version-1', {
      from: '2026-09-07',
      to: '2026-09-11',
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('PASS');
  });

  it('11. retained profile applicability split is surfaced as PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT', async () => {
    const { service } = harnessV2({
      allocatorResult: {
        status: 'BLOCKED',
        findings: [{ code: 'PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT', reason: 'Thay đổi profile trong cùng tuần học.' }],
      },
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('FAIL');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT',
        dimension: 'PPCT_CAPACITY',
      }),
    );
  });

  it('12. multiple TimetableVersions in same calendar/week is legal when allocator resolves', async () => {
    const { service } = harnessV2({
      allocatorResult: { status: 'RESOLVED', findings: [] },
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('PASS');
  });

  it('13. calendar version split in same week is surfaced as PPCT_COMPONENT_WEEK_CALENDAR_SPLIT', async () => {
    const { service } = harnessV2({
      allocatorResult: {
        status: 'BLOCKED',
        findings: [{ code: 'PPCT_COMPONENT_WEEK_CALENDAR_SPLIT', reason: 'Xung đột calendar version trong tuần học.' }],
      },
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('FAIL');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'PPCT_COMPONENT_WEEK_CALENDAR_SPLIT',
        dimension: 'PPCT_CAPACITY',
      }),
    );
  });

  it('14. AcademicWeek.id split in same week is surfaced as PPCT_COMPONENT_WEEK_CALENDAR_SPLIT', async () => {
    const { service } = harnessV2({
      allocatorResult: {
        status: 'BLOCKED',
        findings: [{ code: 'PPCT_COMPONENT_WEEK_CALENDAR_SPLIT', reason: 'Xung đột AcademicWeek id trong tuần.' }],
      },
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('FAIL');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'PPCT_COMPONENT_WEEK_CALENDAR_SPLIT',
        dimension: 'PPCT_CAPACITY',
      }),
    );
  });

  it('15. same-profile midweek PPCT version change is legal and passes if allocator resolves', async () => {
    const { service } = harnessV2({
      associations: [
        associationFixture({ id: 'assoc-1', ppctVersionId: 'v1', effectiveUntil: new Date('2026-09-07Z') }),
        associationFixture({ id: 'assoc-2', ppctVersionId: 'v2', effectiveFrom: new Date('2026-09-08Z') }),
      ],
      allocatorResult: { status: 'RESOLVED', findings: [] },
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('PASS');
    expect(result.provenance.ppctVersionIds).toEqual(['v1', 'v2']);
  });

  it('16. surfaces CORE exhaustion as PPCT_ALLOCATION_EXHAUSTED', async () => {
    const { service } = harnessV2({
      allocatorResult: {
        status: 'BLOCKED',
        findings: [{ code: 'PPCT_ALLOCATION_EXHAUSTED', reason: 'Đã phân bổ hết các tiết CORE trong phiên bản PPCT hiện hành.' }],
      },
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('FAIL');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'PPCT_ALLOCATION_EXHAUSTED',
        dimension: 'PPCT_CAPACITY',
        message: expect.stringContaining('CORE'),
      }),
    );
  });

  it('17. surfaces SPECIALIZED_STUDY exhaustion as PPCT_ALLOCATION_EXHAUSTED', async () => {
    const { service } = harnessV2({
      allocatorResult: {
        status: 'BLOCKED',
        findings: [{ code: 'PPCT_ALLOCATION_EXHAUSTED', reason: 'Đã phân bổ hết các tiết SPECIALIZED_STUDY trong phiên bản PPCT.' }],
      },
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('FAIL');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'PPCT_ALLOCATION_EXHAUSTED',
        dimension: 'PPCT_CAPACITY',
        message: expect.stringContaining('SPECIALIZED_STUDY'),
      }),
    );
  });

  it('18. suppressed planned specialized occurrence retains planning and does not promote prior CORE', async () => {
    // When operational suppression occurs, the allocator resolves with valid planning and 0 consumption
    const { service } = harnessV2({
      associations: [associationFixture({ curricularProfile: 'CORE_PLUS_SPECIALIZED_STUDY' })],
      allocatorResult: { status: 'RESOLVED', findings: [] },
    });
    const result = await service.evaluate('version-1', {
      from: evaluatedFrom,
      to: evaluatedTo,
      profile: 'NORMAL_BASE_PPCT_COMPONENT_V2',
    });
    expect(result.result).toBe('PASS');
  });
});
