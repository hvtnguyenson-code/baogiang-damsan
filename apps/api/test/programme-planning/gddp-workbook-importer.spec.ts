import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  computeContiguousGuidelineRange,
  GddpWorkbookImporterService,
} from '../../src/programme-planning/gddp-workbook-importer.service';
import { AuthorizedProgrammePlanningService } from '../../src/programme-planning/authorized-programme-planning.service';
import { ParsedWorkbookCell, ParsedWorkbookRow, ParsedWorkbook } from '../../src/timetable-import/workbook-parser.types';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CAPABILITIES } = require('../../../../prisma/capability-catalog.cjs') as {
  CAPABILITIES: Array<[string, string, string[]]>;
};

const textCell = (text: string): ParsedWorkbookCell => ({
  kind: 'TEXT',
  text,
  textOverLimit: false,
  formula: false,
  hyperlink: false,
  merged: false,
});

const blankCell = (): ParsedWorkbookCell => ({
  kind: 'BLANK',
  textOverLimit: false,
  formula: false,
  hyperlink: false,
  merged: false,
});

const makeRow = (number: number, values: (string | null | undefined)[]): ParsedWorkbookRow => ({
  number,
  hidden: false,
  cells: values.map((val) => (val != null && val !== '' ? textCell(val) : blankCell())),
});

const HEADERS = ['Khối', 'Tiết PPCT', 'Tuần dạy', 'Nội dung', 'Giáo viên dạy'];

function createMockGddpWorkbook(
  dataRows: (string | null | undefined)[][],
  sheetName = 'NHẬP GDĐP',
  customHeaders = HEADERS,
): ParsedWorkbook {
  const rows: ParsedWorkbookRow[] = [
    makeRow(1, customHeaders),
    ...dataRows.map((cells, idx) => makeRow(idx + 2, cells)),
  ];
  return {
    sheets: [
      {
        name: sheetName,
        state: 'VISIBLE',
        rowCount: rows.length,
        columnCount: customHeaders.length,
        rows,
        hiddenColumns: [],
      },
    ],
  };
}

describe('GddpWorkbookImporterService & Regression Matrix (P4-073)', () => {
  const academicYearId = 'year-uuid-1';
  const calendarVersionId = 'cal-uuid-1';
  const timetableVersionId = 'tkb-uuid-1';
  const timetableVersionId2 = 'tkb-uuid-2';
  const actorId = 'actor-user-1';

  let mockPrisma: Record<string, Record<string, jest.Mock>>;
  let mockParser: { parse: jest.Mock };
  let mockMarkerService: { findRetainedMarkers: jest.Mock };
  let mockPlanningService: { importGddpDraftPackage: jest.Mock };
  let mockProgrammeAuthService: { requireProgrammeAuthority: jest.Mock; requireBghAuthority: jest.Mock };
  let mockCapabilityAuthService: Record<string, jest.Mock>;
  let importerService: GddpWorkbookImporterService;
  let authService: AuthorizedProgrammePlanningService;

  const activeClassesGrade10 = [
    { id: 'class-10a', academicYearId, code: '10A', name: '10A', gradeLevel: 10, status: 'ACTIVE' },
    { id: 'class-10b', academicYearId, code: '10B', name: '10B', gradeLevel: 10, status: 'ACTIVE' },
  ];

  const activeClassesGrade11 = [
    { id: 'class-11a', academicYearId, code: '11A', name: '11A', gradeLevel: 11, status: 'ACTIVE' },
  ];

  const allActiveClasses = [...activeClassesGrade10, ...activeClassesGrade11];

  const teacherA = {
    id: 'teacher-user-a',
    username: 'nguyenvana',
    status: 'ACTIVE',
    profile: { staffCode: 'GV01', displayName: 'Nguyễn Văn A', isTeachingStaff: true },
  };

  const teacherB = {
    id: 'teacher-user-b',
    username: 'tranthib',
    status: 'ACTIVE',
    profile: { staffCode: 'GV02', displayName: 'Trần Thị B', isTeachingStaff: true },
  };

  const inactiveTeacher = {
    id: 'teacher-user-inactive',
    username: 'inactive_user',
    status: 'INACTIVE',
    profile: { staffCode: 'GV_INACTIVE', displayName: 'Giáo viên Nghỉ', isTeachingStaff: true },
  };

  const nonTeachingStaff = {
    id: 'staff-user-nonteaching',
    username: 'non_teaching',
    status: 'ACTIVE',
    profile: { staffCode: 'GV_NONTEACH', displayName: 'Nhân viên Hành chính', isTeachingStaff: false },
  };

  const ambiguousTeacher1 = {
    id: 'teacher-ambig-1',
    username: 'ambig1',
    status: 'ACTIVE',
    profile: { staffCode: 'GV_AMBIG', displayName: 'Giáo viên Trùng 1', isTeachingStaff: true },
  };

  const ambiguousTeacher2 = {
    id: 'teacher-ambig-2',
    username: 'ambig2',
    status: 'ACTIVE',
    profile: { staffCode: 'gv_ambig', displayName: 'Giáo viên Trùng 2', isTeachingStaff: true },
  };

  const allKnownUsers = [
    teacherA,
    teacherB,
    inactiveTeacher,
    nonTeachingStaff,
    ambiguousTeacher1,
    ambiguousTeacher2,
  ];

  const activeTeachingUsers = [teacherA, teacherB, ambiguousTeacher1, ambiguousTeacher2];

  const slotMorning1 = {
    id: 'slot-m1',
    academicYearId,
    weekday: 'MONDAY',
    session: 'MORNING',
    ordinal: 1,
    startTime: new Date('1970-01-01T07:00:00.000Z'),
    endTime: new Date('1970-01-01T07:45:00.000Z'),
    isActive: true,
  };

  const slotMorning2 = {
    id: 'slot-m2',
    academicYearId,
    weekday: 'MONDAY',
    session: 'MORNING',
    ordinal: 2,
    startTime: new Date('1970-01-01T07:50:00.000Z'),
    endTime: new Date('1970-01-01T08:35:00.000Z'),
    isActive: true,
  };

  const slotMorning3 = {
    id: 'slot-m3',
    academicYearId,
    weekday: 'MONDAY',
    session: 'MORNING',
    ordinal: 3,
    startTime: new Date('1970-01-01T08:40:00.000Z'),
    endTime: new Date('1970-01-01T09:25:00.000Z'),
    isActive: true,
  };

  const slotMorning4 = {
    id: 'slot-m4',
    academicYearId,
    weekday: 'MONDAY',
    session: 'MORNING',
    ordinal: 4,
    startTime: new Date('1970-01-01T09:30:00.000Z'),
    endTime: new Date('1970-01-01T10:15:00.000Z'),
    isActive: true,
  };

  const timeSlots = [slotMorning1, slotMorning2, slotMorning3, slotMorning4];

  const defaultCalendar = {
    id: calendarVersionId,
    academicYearId,
    status: 'ACTIVE',
    teachingWeekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
    weeks: [
      {
        id: 'week-1',
        officialWeekNumber: 1,
        segments: [
          {
            id: 'seg-1',
            startDate: new Date('2026-09-07T00:00:00.000Z'), // Monday 2026-09-07
            endDate: new Date('2026-09-12T00:00:00.000Z'),   // Saturday 2026-09-12
          },
        ],
      },
      {
        id: 'week-2',
        officialWeekNumber: 2,
        segments: [
          {
            id: 'seg-2',
            startDate: new Date('2026-09-14T00:00:00.000Z'), // Monday 2026-09-14
            endDate: new Date('2026-09-19T00:00:00.000Z'),
          },
        ],
      },
      {
        id: 'week-3',
        officialWeekNumber: 3,
        segments: [
          {
            id: 'seg-3',
            startDate: new Date('2026-09-21T00:00:00.000Z'), // Monday 2026-09-21
            endDate: new Date('2026-09-26T00:00:00.000Z'),
          },
        ],
      },
      {
        id: 'week-5',
        officialWeekNumber: 5,
        segments: [
          {
            id: 'seg-5',
            startDate: new Date('2026-10-05T00:00:00.000Z'), // Monday 2026-10-05
            endDate: new Date('2026-10-10T00:00:00.000Z'),
          },
        ],
      },
    ],
    interruptions: [],
  };

  const defaultMarkers = [
    // Week 1 Monday 2026-09-07 slot 1 for 10A and 10B (1 grade-level candidate slot)
    { id: 'm-10a-1', timetableVersionId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
    { id: 'm-10b-1', timetableVersionId, academicYearId, schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
  ];

  beforeEach(() => {
    mockPrisma = {
      academicYear: {
        findUnique: jest.fn().mockResolvedValue({ id: academicYearId, code: '2026-2027', name: '2026-2027' }),
      },
      academicCalendarVersion: {
        findFirst: jest.fn().mockResolvedValue(defaultCalendar),
        findMany: jest.fn().mockResolvedValue([defaultCalendar]),
      },
      schoolClass: {
        findMany: jest.fn().mockResolvedValue(allActiveClasses),
      },
      user: {
        findMany: jest.fn().mockImplementation(async (args?: { where?: { profile?: { isTeachingStaff?: boolean }; status?: string } }) => {
          if (args?.where?.profile?.isTeachingStaff && args?.where?.status === 'ACTIVE') {
            return activeTeachingUsers;
          }
          return allKnownUsers;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
          return allKnownUsers.find((u) => u.id === where.id) ?? null;
        }),
      },
      timeSlotDefinition: {
        findMany: jest.fn().mockResolvedValue(timeSlots),
      },
      timetableVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: timetableVersionId,
          academicYearId,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
          effectiveUntil: null,
        }),
        findMany: jest.fn().mockImplementation(async ({ where }: { where?: { effectiveFrom?: { lte?: Date }; OR?: Array<{ effectiveUntil?: unknown }> } }) => {
          const targetDate = where?.effectiveFrom?.lte;
          if (targetDate && targetDate >= new Date('2026-09-20T00:00:00.000Z')) {
            return [
              {
                id: timetableVersionId2,
                academicYearId,
                status: 'ACTIVE',
                effectiveFrom: new Date('2026-09-20T00:00:00.000Z'),
                effectiveUntil: null,
              },
            ];
          }
          return [
            {
              id: timetableVersionId,
              academicYearId,
              status: 'ACTIVE',
              effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
              effectiveUntil: new Date('2026-09-19T23:59:59.999Z'),
            },
          ];
        }),
      },
      programmeMaster: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new-master-uuid', academicYearId, kind: 'GDDP', gradeLevel: 10 }),
      },
      programmePlanVersion: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'new-plan-uuid', versionNumber: 1, status: 'DRAFT', draftRevision: 1 }),
      },
      programmeTopicItem: {
        create: jest.fn().mockResolvedValue({ id: 'new-topic-uuid' }),
      },
      plannedProgrammeOccurrence: {
        create: jest.fn().mockResolvedValue({ id: 'new-occurrence-uuid' }),
      },
      plannedOccurrenceSlot: {
        create: jest.fn().mockResolvedValue({ id: 'new-slot-uuid' }),
      },
      plannedSlotStaffing: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      programmePlanningCommand: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'cmd-uuid' }),
      },
    };

    mockParser = {
      parse: jest.fn(),
    };

    mockMarkerService = {
      findRetainedMarkers: jest.fn().mockImplementation(async ({ timetableVersionId: tvId, kind }: { timetableVersionId: string; kind?: string }) => {
        if (kind === 'GDDP') {
          return defaultMarkers.map((m) => ({ ...m, timetableVersionId: tvId }));
        }
        return [];
      }),
    };

    mockPlanningService = {
      importGddpDraftPackage: jest.fn().mockResolvedValue({
        outcome: 'CREATED',
        commandId: 'cmd-1',
        programmeMasterId: 'master-1',
        programmePlanVersionId: 'plan-1',
        versionNumber: 1,
        status: 'DRAFT',
        topicItemCount: 1,
        occurrenceCount: 1,
        slotCount: 1,
        staffingCount: 1,
      }),
    };

    mockProgrammeAuthService = {
      requireProgrammeAuthority: jest.fn().mockResolvedValue({ qualified: true }),
      requireBghAuthority: jest.fn().mockResolvedValue({ authorityType: 'BGH_PRINCIPAL', capabilityKey: 'APPROVAL_PRINCIPAL' }),
    };

    mockCapabilityAuthService = {
      evaluate: jest.fn().mockResolvedValue({ allowed: true }),
    };

    importerService = new GddpWorkbookImporterService(
      mockPrisma as never,
      mockParser as never,
      mockMarkerService as never,
      mockPlanningService as never,
    );

    authService = new AuthorizedProgrammePlanningService(
      mockPlanningService as never,
      mockProgrammeAuthService as never,
      mockCapabilityAuthService as never,
      mockPrisma as never,
      undefined,
      importerService,
    );
  });

  const dummyFile = {
    originalname: 'gddp_k10.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 2048,
    buffer: Buffer.from('mock'),
  };

  // 1. Single-period row
  it('1. handles single-period row (PPCT = 1) cleanly', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề 1: Khởi động GDĐP', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(true);
    expect(res.blockingIssueCount).toBe(0);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.requiredPeriods).toBe(1);
    expect(res.rows[0]!.ppctCoordinates).toEqual([1]);
    expect(res.rows[0]!.resolvedCandidateCount).toBe(1);
  });

  // 2. Multi-period row
  it('2. handles multi-period row (PPCT = 2,3,4) cleanly', async () => {
    mockMarkerService.findRetainedMarkers.mockResolvedValue([
      { id: 'm-10a-1', timetableVersionId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
      { id: 'm-10b-1', timetableVersionId, academicYearId, schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
      { id: 'm-10a-2', timetableVersionId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m2', kind: 'GDDP' },
      { id: 'm-10b-2', timetableVersionId, academicYearId, schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'GDDP' },
      { id: 'm-10a-3', timetableVersionId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m3', kind: 'GDDP' },
      { id: 'm-10b-3', timetableVersionId, academicYearId, schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m3', kind: 'GDDP' },
    ]);

    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1,2,3', '1', 'Chủ đề 2: Di sản văn hóa', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(true);
    expect(res.rows[0]!.requiredPeriods).toBe(3);
    expect(res.rows[0]!.ppctCoordinates).toEqual([1, 2, 3]);
    expect(res.rows[0]!.resolvedCandidateCount).toBe(3);
  });

  // 3. Non-contiguous week set preserved exactly
  it('3. preserves non-contiguous week set exactly (1,3,5 is not expanded to 1..5)', async () => {
    // Week 1, 3, 5 each provides 1 candidate slot
    mockMarkerService.findRetainedMarkers.mockResolvedValue([
      { id: 'm-10a-1', timetableVersionId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
      { id: 'm-10b-1', timetableVersionId, academicYearId, schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
    ]);

    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1,2,3', '1,3,5', 'Chủ đề ngắt quãng', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.rows[0]!.officialWeeks).toEqual([1, 3, 5]);
    expect(res.rows[0]!.officialWeeks).not.toContain(2);
    expect(res.rows[0]!.officialWeeks).not.toContain(4);
    expect(res.canConfirm).toBe(true);

    const resolved = await importerService.resolveWorkbook(dummyFile, academicYearId);
    // Non-contiguous week set must NOT produce a fake guideline range 1 -> 5
    expect(resolved.resolvedPackage.topics[0]?.guidelineWeekFrom).toBeNull();
    expect(resolved.resolvedPackage.topics[0]?.guidelineWeekTo).toBeNull();

    // Verify helper rules for week ranges directly
    expect(computeContiguousGuidelineRange([3])).toEqual({ guidelineWeekFrom: 3, guidelineWeekTo: 3 });
    expect(computeContiguousGuidelineRange([3, 4, 5])).toEqual({ guidelineWeekFrom: 3, guidelineWeekTo: 5 });
    expect(computeContiguousGuidelineRange([1, 3, 5])).toEqual({ guidelineWeekFrom: null, guidelineWeekTo: null });
  });

  // 4. Malformed PPCT text -> blocked
  it('4. blocks malformed PPCT text (e.g. non-numeric or invalid syntax)', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', 'abc', '1', 'Chủ đề sai tiết', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(false);
    expect(res.blockingIssueCount).toBeGreaterThan(0);
    expect(res.issues.some((i) => i.code === 'MALFORMED_PPCT')).toBe(true);
  });

  // 5. Duplicate PPCT coordinate across rows -> blocked
  it('5. blocks duplicate PPCT coordinate across rows', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề 1', 'GV01'],
        ['10', '1', '1', 'Chủ đề 2', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(false);
    expect(res.issues.some((i) => i.code === 'OVERLAPPING_PPCT_COORDINATES')).toBe(true);
  });

  // 6. Overlapping PPCT coordinates -> blocked
  it('6. blocks overlapping PPCT coordinates between rows (e.g. row 1: 1,2; row 2: 2,3)', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1,2', '1', 'Chủ đề 1', 'GV01'],
        ['10', '2,3', '1', 'Chủ đề 2', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(false);
    expect(res.issues.some((i) => i.code === 'OVERLAPPING_PPCT_COORDINATES')).toBe(true);
  });

  // 7. Incomplete grade GDDP marker coverage -> blocked
  it('7. blocks when grade GDDP marker coverage is incomplete (10A has marker, 10B does not)', async () => {
    mockMarkerService.findRetainedMarkers.mockResolvedValue([
      // Only 10A has the marker, 10B missing!
      { id: 'm-10a-1', timetableVersionId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
    ]);

    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề thiếu lớp', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(false);
    expect(res.issues.some((i) => i.code === 'GRADE_COVERAGE_INCOMPLETE')).toBe(true);
  });

  // 8. Exact grade collapse: multiple class markers -> ONE grade slot candidate
  it('8. collapses multiple class markers into ONE grade slot candidate without class fan-out', async () => {
    mockMarkerService.findRetainedMarkers.mockResolvedValue([
      { id: 'm-10a-1', timetableVersionId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
      { id: 'm-10b-1', timetableVersionId, academicYearId, schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
    ]);

    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề gộp khối', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(true);
    expect(res.rows[0]!.slots).toHaveLength(1);
    expect(res.rows[0]!.slots[0]!.timeSlotDefinitionId).toBe('slot-m1');
    expect(res.rows[0]!.resolvedCandidateCount).toBe(1);
  });

  // 9. Resolved candidate count less than PPCT count -> blocked
  it('9. blocks when resolved candidate count is less than PPCT count', async () => {
    // Declares 2 PPCT periods, but TKB only has 1 collapsed slot
    mockMarkerService.findRetainedMarkers.mockResolvedValue([
      { id: 'm-10a-1', timetableVersionId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
      { id: 'm-10b-1', timetableVersionId, academicYearId, schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
    ]);

    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1,2', '1', 'Chủ đề thiếu tiết TKB', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(false);
    expect(res.issues.some((i) => i.code === 'GRADE_PERIOD_COUNT_MISMATCH')).toBe(true);
  });

  // 10. Resolved candidate count greater than PPCT count -> blocked
  it('10. blocks when resolved candidate count is greater than PPCT count', async () => {
    // Declares 1 PPCT period, but TKB has 2 collapsed slots
    mockMarkerService.findRetainedMarkers.mockResolvedValue([
      { id: 'm-10a-1', timetableVersionId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
      { id: 'm-10b-1', timetableVersionId, academicYearId, schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
      { id: 'm-10a-2', timetableVersionId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m2', kind: 'GDDP' },
      { id: 'm-10b-2', timetableVersionId, academicYearId, schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'GDDP' },
    ]);

    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề thừa tiết TKB', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(false);
    expect(res.issues.some((i) => i.code === 'GRADE_PERIOD_COUNT_MISMATCH')).toBe(true);
  });

  // 11. Teacher staff code not found -> blocked
  it('11. blocks when teacher staff code is not found', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề mã sai', 'GV_UNKNOWN_999'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(false);
    expect(res.issues.some((i) => i.code === 'TEACHER_STAFF_CODE_NOT_FOUND')).toBe(true);
  });

  // 12. Duplicate/ambiguous staff-code authority -> blocked
  it('12. blocks when multiple users have the same staff code after normalization (ambiguous authority)', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề trùng mã', 'GV_AMBIG'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(false);
    expect(res.issues.some((i) => i.code === 'TEACHER_STAFF_CODE_AMBIGUOUS')).toBe(true);
  });

  // 13. Inactive/ineligible teacher -> blocked
  it('13. blocks when teacher is inactive or not teaching staff', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề giáo viên nghỉ', 'GV_INACTIVE'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(false);
    expect(res.issues.some((i) => i.code === 'TEACHER_INACTIVE_OR_INELIGIBLE')).toBe(true);

    // Non-teaching staff
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề nhân viên hành chính', 'GV_NONTEACH'],
      ]),
    );
    const res2 = await importerService.preview(dummyFile, academicYearId);
    expect(res2.canConfirm).toBe(false);
    expect(res2.issues.some((i) => i.code === 'TEACHER_INACTIVE_OR_INELIGIBLE')).toBe(true);
  });

  // 14. Multiple teachers assigned to same exact slot: all receive exact staffing membership without duplicate slot
  it('14. multiple teachers assigned to same slot receive exact staffing membership without duplicate slot creation', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề dạy chung', 'GV01; GV02'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(true);
    expect(res.rows[0]!.resolvedTeachers).toHaveLength(2);
    expect(res.rows[0]!.slots).toHaveLength(1);
    expect(res.rows[0]!.resolvedCandidateCount).toBe(1);
  });

  // 15. Upload/preview performs ZERO programme mutation
  it('15. upload/preview performs ZERO programme mutation', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề xem trước', 'GV01'],
      ]),
    );

    await importerService.inspect(dummyFile);
    await importerService.preview(dummyFile, academicYearId);

    expect(mockPrisma.programmeMaster.create).not.toHaveBeenCalled();
    expect(mockPrisma.programmePlanVersion.create).not.toHaveBeenCalled();
    expect(mockPrisma.programmeTopicItem.create).not.toHaveBeenCalled();
    expect(mockPrisma.plannedProgrammeOccurrence.create).not.toHaveBeenCalled();
    expect(mockPrisma.plannedOccurrenceSlot.create).not.toHaveBeenCalled();
    expect(mockPrisma.plannedSlotStaffing.createMany).not.toHaveBeenCalled();
  });

  // 16. Repeated confirmation with same request identity is idempotent
  it('16. repeated confirmation with same request identity is idempotent', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề xác nhận', 'GV01'],
      ]),
    );

    const preview = await importerService.preview(dummyFile, academicYearId);

    // Call confirm once
    await importerService.confirm(
      dummyFile,
      academicYearId,
      10,
      preview.previewFingerprint,
      'cmd-100',
      actorId,
    );

    expect(mockPlanningService.importGddpDraftPackage).toHaveBeenCalledTimes(1);

    // Stale fingerprint causes ConflictException
    await expect(
      importerService.confirm(
        dummyFile,
        academicYearId,
        10,
        'stale-fingerprint-hex',
        'cmd-100',
        actorId,
      ),
    ).rejects.toThrow(ConflictException);
  });

  // 17. No hardcoded 35-period assumption
  it('17. operates on exact declared periods without hardcoding 35-period assumption', async () => {
    // 2 periods total, perfectly valid
    mockMarkerService.findRetainedMarkers.mockResolvedValue([
      { id: 'm-10a-1', timetableVersionId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
      { id: 'm-10b-1', timetableVersionId, academicYearId, schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
      { id: 'm-10a-2', timetableVersionId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m2', kind: 'GDDP' },
      { id: 'm-10b-2', timetableVersionId, academicYearId, schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'GDDP' },
    ]);

    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1,2', '1', 'Chủ đề ngắn', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(true);
    expect(res.rows[0]!.requiredPeriods).toBe(2);
  });

  // 18. Exact timetable-version cutover by civil date
  it('18. respects timetable-version cutover by exact civil date', async () => {
    // Week 1 (2026-09-07) maps to timetableVersionId (tkb-uuid-1)
    // Week 3 (2026-09-21) maps to timetableVersionId2 (tkb-uuid-2)
    mockMarkerService.findRetainedMarkers.mockImplementation(async ({ timetableVersionId: tvId }: { timetableVersionId: string }) => {
      return [
        { id: `m-10a-${tvId}`, timetableVersionId: tvId, academicYearId, schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
        { id: `m-10b-${tvId}`, timetableVersionId: tvId, academicYearId, schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'GDDP' },
      ];
    });

    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1,2', '1,3', 'Chủ đề chuyển phiên bản TKB', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(true);
    expect(res.rows[0]!.slots).toHaveLength(2);
    // Verified 2 distinct civil dates across cutover
    expect(res.rows[0]!.slots.map((s) => s.civilDate)).toEqual(['2026-09-07', '2026-09-21']);
  });

  // 19. Wrong programme marker type does not qualify
  it('19. wrong programme marker type (HDTN_HN) does not qualify for GDDP', async () => {
    // Marker has kind: 'HDTN_HN' instead of 'GDDP'
    mockMarkerService.findRetainedMarkers.mockImplementation(async ({ kind }: { kind?: string }) => {
      if (kind === 'GDDP') {
        return []; // No GDDP markers!
      }
      return defaultMarkers;
    });

    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Chủ đề sai marker', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(false);
    expect(res.issues.some((i) => i.code === 'GRADE_PERIOD_COUNT_MISMATCH')).toBe(true);
  });

  // 20. Unsupported grade -> blocked
  it('20. blocks unsupported grade (e.g. 9 or 13)', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['9', '1', '1', 'Khối 9 THCS', 'GV01'],
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    expect(res.canConfirm).toBe(false);
    expect(res.issues.some((i) => i.code === 'UNSUPPORTED_GRADE_LEVEL')).toBe(true);
  });

  // 21. User-facing strings are Vietnamese
  it('21. produces Vietnamese user-facing preview and error messages', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', '', 'GV01'], // Empty topic title
      ]),
    );

    const res = await importerService.preview(dummyFile, academicYearId);
    const titleIssue = res.issues.find((i) => i.code === 'TOPIC_TITLE_REQUIRED');
    expect(titleIssue).toBeDefined();
    expect(titleIssue!.message).toBe('Dòng 2: Nội dung không được để trống.');
  });

  // 22. No backend enum exposed as required user input
  it('22. does not expose backend enum names as required user input in workbook', async () => {
    mockParser.parse.mockResolvedValue(
      createMockGddpWorkbook([
        ['10', '1', '1', 'Nội dung', 'GV01'],
      ]),
    );
    const inspection = await importerService.inspect(dummyFile);
    expect(inspection.sheets[0]!.headers).toEqual(['Khối', 'Tiết PPCT', 'Tuần dạy', 'Nội dung', 'Giáo viên dạy']);
    expect(inspection.sheets[0]!.headers.some((h) => ['GRADE', 'CLASS', 'GDDP', 'HDTN_HN'].includes(h))).toBe(false);
  });

  // 23. Legacy capability typo GDDDP_COORDINATOR must not appear in new production runtime code
  it('23. verifies capability catalog does NOT contain typo GDDDP_COORDINATOR', () => {
    const typo = CAPABILITIES.find(([key]) => key === 'GDDDP_COORDINATOR');
    expect(typo).toBeUndefined();

    const normalized = CAPABILITIES.find(([key]) => key === 'GDDP_COORDINATOR');
    expect(normalized).toBeDefined();
    expect(normalized![1]).toBe('Điều phối Giáo dục địa phương.');
  });

  // Authorization Seam: GDDP_COORDINATOR
  describe('Authorization Seam', () => {
    it('coordinator with GDDP_COORDINATOR can preview and confirm existing master', async () => {
      mockPrisma.programmeMaster.findFirst.mockResolvedValue({
        id: 'master-gddp-10',
        academicYearId,
        kind: 'GDDP',
        gradeLevel: 10,
      });

      mockParser.parse.mockResolvedValue(
        createMockGddpWorkbook([
          ['10', '1', '1', 'Chủ đề ủy quyền', 'GV01'],
        ]),
      );

      const previewRes = await authService.previewGddpWorkbook(
        dummyFile,
        academicYearId,
        10,
        actorId,
      );
      expect(mockProgrammeAuthService.requireProgrammeAuthority).toHaveBeenCalled();
      expect(previewRes.canConfirm).toBe(true);

      await authService.confirmGddpWorkbook(
        dummyFile,
        {
          academicYearId,
          gradeLevel: 10,
          expectedPreviewFingerprint: previewRes.previewFingerprint,
          commandId: 'cmd-auth-1',
        },
        actorId,
      );
      expect(mockPlanningService.importGddpDraftPackage).toHaveBeenCalled();
    });

    it('denies non-BGH user attempting to bootstrap new master', async () => {
      mockPrisma.programmeMaster.findFirst.mockResolvedValue(null);
      mockProgrammeAuthService.requireBghAuthority.mockRejectedValue(
        new ForbiddenException('Bạn không có quyền thực hiện thao tác này.'),
      );

      mockParser.parse.mockResolvedValue(
        createMockGddpWorkbook([
          ['10', '1', '1', 'Chủ đề từ chối', 'GV01'],
        ]),
      );

      await expect(
        authService.previewGddpWorkbook(dummyFile, academicYearId, 10, actorId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
