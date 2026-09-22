import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { HdtnWorkbookImporterService } from '../../src/programme-planning/hdtn-workbook-importer.service';
import { AuthorizedProgrammePlanningService } from '../../src/programme-planning/authorized-programme-planning.service';
import { ParsedWorkbookCell, ParsedWorkbookRow, ParsedWorkbook } from '../../src/timetable-import/workbook-parser.types';

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

const HEADERS = ['Tuần từ', 'Tuần đến', 'Số tiết', 'Quy mô tổ chức', 'Khối', 'Chủ đề', 'Người thực hiện'];

function createMockWorkbook(dataRows: (string | null | undefined)[][]): ParsedWorkbook {
  const rows: ParsedWorkbookRow[] = [
    makeRow(1, HEADERS),
    ...dataRows.map((cells, idx) => makeRow(idx + 2, cells)),
  ];
  return {
    sheets: [
      {
        name: 'NHẬP HĐTN-HN',
        state: 'VISIBLE',
        rowCount: rows.length,
        columnCount: HEADERS.length,
        rows,
        hiddenColumns: [],
      },
    ],
  };
}

describe('HdtnWorkbookImporterService & Authorization', () => {
  const academicYearId = 'year-uuid-1';
  const calendarVersionId = 'cal-uuid-1';
  const timetableVersionId = 'tkb-uuid-1';
  const actorId = 'actor-user-1';

  let mockPrisma: Record<string, Record<string, jest.Mock>>;
  let mockParser: { parse: jest.Mock };
  let mockMarkerService: { findRetainedMarkers: jest.Mock };
  let mockPlanningService: { importHdtnDraftPackage: jest.Mock };
  let mockProgrammeAuthService: { requireProgrammeAuthority: jest.Mock; requireBghAuthority: jest.Mock };
  let mockCapabilityAuthService: Record<string, jest.Mock>;
  let importerService: HdtnWorkbookImporterService;
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

  const gvcn10a = {
    id: 'gvcn-user-10a',
    username: 'gvcn10a',
    status: 'ACTIVE',
    profile: { staffCode: 'GV10A', displayName: 'GVCN 10A', isTeachingStaff: true },
  };

  const gvcn10b = {
    id: 'gvcn-user-10b',
    username: 'gvcn10b',
    status: 'ACTIVE',
    profile: { staffCode: 'GV10B', displayName: 'GVCN 10B', isTeachingStaff: true },
  };

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

  const timeSlots = [slotMorning1, slotMorning2];

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
            startDate: new Date('2026-09-07T00:00:00.000Z'), // Monday
            endDate: new Date('2026-09-12T00:00:00.000Z'),   // Saturday
          },
        ],
      },
    ],
    interruptions: [],
  };

  beforeEach(() => {
    mockPrisma = {
      academicYear: {
        findUnique: jest.fn().mockResolvedValue({ id: academicYearId, code: '2026-2027', name: '2026-2027' }),
      },
      academicCalendarVersion: {
        findFirst: jest.fn().mockResolvedValue(defaultCalendar),
      },
      schoolClass: {
        findMany: jest.fn().mockResolvedValue(allActiveClasses),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([teacherA, teacherB, gvcn10a, gvcn10b]),
        findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
          return [teacherA, teacherB, gvcn10a, gvcn10b].find((u) => u.id === where.id) ?? null;
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
        findMany: jest.fn().mockResolvedValue([
          {
            id: timetableVersionId,
            academicYearId,
            status: 'ACTIVE',
            effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
            effectiveUntil: null,
          },
        ]),
      },
      homeroomAssignment: {
        findMany: jest.fn().mockImplementation(async ({ where }: { where: { schoolClassId: string } }) => {
          const classId = where.schoolClassId;
          if (classId === 'class-10a') {
            return [{
              id: 'hr-10a',
              schoolClassId: 'class-10a',
              teacherUserId: gvcn10a.id,
              validFrom: new Date('2026-09-01T00:00:00.000Z'),
              validUntil: null,
              teacherUser: gvcn10a,
            }];
          }
          if (classId === 'class-10b') {
            return [{
              id: 'hr-10b',
              schoolClassId: 'class-10b',
              teacherUserId: gvcn10b.id,
              validFrom: new Date('2026-09-01T00:00:00.000Z'),
              validUntil: null,
              teacherUser: gvcn10b,
            }];
          }
          return [];
        }),
      },
      programmeMaster: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'master-hdtn-1',
          academicYearId,
          kind: 'HDTN_HN',
          status: 'ACTIVE',
          name: 'HĐTN-HN 2026-2027',
        }),
      },
      userCapabilityAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    mockParser = {
      parse: jest.fn().mockResolvedValue(createMockWorkbook([])),
    };

    mockMarkerService = {
      findRetainedMarkers: jest.fn().mockResolvedValue([]),
    };

    mockPlanningService = {
      importHdtnDraftPackage: jest.fn().mockResolvedValue({
        outcome: 'CREATED',
        commandId: 'cmd-confirm-1',
        programmeMasterId: 'master-hdtn-1',
        programmePlanVersionId: 'plan-v1',
        versionNumber: 1,
        topicItemCount: 1,
        occurrenceCount: 1,
        slotCount: 1,
        staffingCount: 1,
        status: 'DRAFT',
      }),
    };

    importerService = new HdtnWorkbookImporterService(
      mockPrisma as never,
      mockParser as never,
      mockMarkerService as never,
      mockPlanningService as never,
    );

    mockProgrammeAuthService = {
      requireProgrammeAuthority: jest.fn().mockResolvedValue(undefined),
      requireBghAuthority: jest.fn().mockResolvedValue(undefined),
    };

    mockCapabilityAuthService = {};

    authService = new AuthorizedProgrammePlanningService(
      mockPlanningService as never,
      mockProgrammeAuthService as never,
      mockCapabilityAuthService as never,
      mockPrisma as never,
      importerService,
    );
  });

  const dummyUpload = {
    buffer: Buffer.from('mock-xlsx'),
    originalname: 'hdtn_test.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 100,
  };

  describe('1. Workbook Structure & Inspection', () => {
    it('inspects valid workbook and detects NHẬP HĐTN-HN sheet and headers', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo lớp', '10', 'Chủ đề 1', 'GVCN'],
      ]));

      const res = await importerService.inspect(dummyUpload);
      expect(res.sourceFileName).toBe('hdtn_test.xlsx');
      expect(res.dataSheetFound).toBe(true);
      expect(res.sheets[0].isDataSheet).toBe(true);
      expect(res.sheets[0].headers).toEqual(HEADERS);
      expect(res.sheets[0].rowCount).toBe(2);
    });

    it('blocks workbook with extra non-blank columns beyond column 7 during inspect', async () => {
      mockParser.parse.mockResolvedValue({
        sheets: [{
          name: 'NHẬP HĐTN-HN',
          state: 'VISIBLE',
          rowCount: 2,
          columnCount: 8,
          rows: [
            makeRow(1, [...HEADERS, 'Cột thừa']),
            makeRow(2, ['1', '1', '1', 'Theo lớp', '10', 'Chủ đề 1', 'GVCN', 'Dữ liệu không mong muốn']),
          ],
          hiddenColumns: [],
        }],
      });

      const res = await importerService.inspect(dummyUpload);
      expect(res.issues).toContainEqual(expect.objectContaining({
        code: 'EXTRA_COLUMNS_DETECTED',
        severity: 'BLOCKER',
      }));
    });

    it('blocks workbook missing required NHẬP HĐTN-HN sheet', async () => {
      mockParser.parse.mockResolvedValue({
        sheets: [{ name: 'SHEET1', state: 'VISIBLE', rowCount: 1, columnCount: 1, rows: [], hiddenColumns: [] }],
      });

      await expect(importerService.preview(dummyUpload, academicYearId)).rejects.toThrow(BadRequestException);
    });

    it('blocks workbook with missing/renamed headers', async () => {
      const badHeaders = ['Tuần từ', 'Tuần đến', 'Số tiết', 'Khối', 'Chủ đề', 'Người thực hiện']; // missing Quy mô
      mockParser.parse.mockResolvedValue({
        sheets: [{
          name: 'NHẬP HĐTN-HN',
          state: 'VISIBLE',
          rowCount: 1,
          columnCount: badHeaders.length,
          rows: [makeRow(1, badHeaders)],
          hiddenColumns: [],
        }],
      });

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.issues).toContainEqual(expect.objectContaining({
        code: 'HEADER_MISMATCH',
        severity: 'BLOCKER',
      }));
    });

    it('skips blank trailing rows safely', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['', '', '', '', '', '', ''],
        ['   ', '', '', '', '', '', ''],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.rows).toHaveLength(0);
      expect(res.canConfirm).toBe(false);
    });

    it('blocks row with invalid organizing scope / mode', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Sai Quy Mô', '10', 'Chủ đề 1', 'GVCN'],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.issues).toContainEqual(expect.objectContaining({
        code: 'INVALID_ORGANIZING_SCOPE',
      }));
    });

    it('blocks row with invalid grade level', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo lớp', '9', 'Chủ đề 1', 'GVCN'],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.issues).toContainEqual(expect.objectContaining({
        code: 'INVALID_GRADE_LEVEL',
      }));
    });

    it('blocks row with invalid period count', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '0', 'Theo lớp', '10', 'Chủ đề 1', 'GVCN'],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.issues).toContainEqual(expect.objectContaining({
        code: 'INVALID_REQUIRED_PERIODS',
      }));
    });
  });

  describe('2. Teacher Identity & Normalization', () => {
    it('resolves single teacher exact normalized name in GRADE mode', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      // 2 active classes in Grade 10: 10A, 10B
      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.rows[0].resolvedTeachers).toHaveLength(1);
      expect(res.rows[0].resolvedTeachers[0]).toMatchObject({
        enteredName: 'Nguyễn Văn A',
        displayName: 'Nguyễn Văn A',
        staffCode: 'GV01',
      });
      expect(res.canConfirm).toBe(true);
    });

    it('resolves multiple teachers separated by semicolons', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A ;  Trần Thị B '],
      ]));

      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.rows[0].resolvedTeachers).toHaveLength(2);
      expect(res.rows[0].resolvedTeachers.map((t) => t.displayName)).toEqual(['Nguyễn Văn A', 'Trần Thị B']);
      expect(res.canConfirm).toBe(true);
    });

    it('blocks duplicate teacher names in token list', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A; Nguyễn Văn A'],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'DUPLICATE_TEACHER_TOKEN',
      }));
    });

    it('blocks unknown teacher name (0 matches)', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Người Không Tồn Tại'],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'TEACHER_NOT_FOUND',
      }));
    });

    it('blocks ambiguous teacher displayName (>1 match)', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        teacherA,
        {
          id: 'teacher-user-a2',
          username: 'nguyenvana2',
          status: 'ACTIVE',
          profile: { staffCode: 'GV99', displayName: 'Nguyễn Văn A', isTeachingStaff: true },
        },
      ]);

      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'TEACHER_NAME_AMBIGUOUS',
      }));
    });

    it('strips valid trailing " và lớp <classCode>" suffix when class exists without creating class fanout', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A và lớp 10A'],
      ]));

      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.rows[0].resolvedTeachers).toHaveLength(1);
      expect(res.rows[0].resolvedTeachers[0].displayName).toBe('Nguyễn Văn A');
      expect(res.canConfirm).toBe(true);
    });

    it('blocks invalid trailing text that is not a valid class annotation', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A và các bạn'],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'TEACHER_NOT_FOUND',
      }));
    });

    it('blocks " và lớp <classCode>" if classCode does not exist in academic year', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A và lớp 99Z'],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'SUPPORTING_CLASS_NOT_FOUND',
      }));
    });

    it('Finding E: blocks duplicate canonical User.id across multiple tokens after suffix normalization', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A; Nguyễn Văn A và lớp 10A'],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'DUPLICATE_RESOLVED_TEACHER',
        severity: 'BLOCKER',
      }));
    });
  });

  describe('3. CLASS Mode & Historical GVCN Resolution', () => {
    it('requires GVCN sentinel in CLASS mode and rejects explicit teacher names', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo lớp', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'CLASS_GVCN_SENTINEL_REQUIRED',
      }));
    });

    it('resolves exact GVCN for each active class in CLASS mode', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo lớp', '10', 'Chủ đề 1', 'GVCN'],
      ]));

      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(true);
      expect(res.rows[0].slots).toHaveLength(1); // 1 distinct logical slot
      expect(res.rows[0].targetClassCodes).toEqual(['10A', '10B']);
      expect(res.rows[0].slots[0].weekday).toBe('MONDAY');
    });

    it('Finding A regression: preserves each class\'s own exact slot when classes have different timetable slots', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo lớp', '10', 'Chủ đề 1', 'GVCN'],
      ]));

      // 10A has slot-m1, 10B has slot-m2
      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN' },
      ]);

      const res = await importerService.resolveWorkbook(dummyUpload, academicYearId);
      expect(res.preview.canConfirm).toBe(true);

      const occ10a = res.resolvedPackage.occurrences.find((o) => o.schoolClassId === 'class-10a');
      const occ10b = res.resolvedPackage.occurrences.find((o) => o.schoolClassId === 'class-10b');

      expect(occ10a).toBeDefined();
      expect(occ10b).toBeDefined();

      // 10A must have slot-m1 ONLY
      expect(occ10a!.slots).toHaveLength(1);
      expect(occ10a!.slots[0].timeSlotDefinitionId).toBe('slot-m1');
      expect(occ10a!.slots[0].teacherUserIds).toEqual([gvcn10a.id]);

      // 10B must have slot-m2 ONLY
      expect(occ10b!.slots).toHaveLength(1);
      expect(occ10b!.slots[0].timeSlotDefinitionId).toBe('slot-m2');
      expect(occ10b!.slots[0].teacherUserIds).toEqual([gvcn10b.id]);
    });

    it('blocks package if a class is missing historical GVCN on civilDate', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo lớp', '10', 'Chủ đề 1', 'GVCN'],
      ]));

      // Class 10b has no homeroom assignment
      mockPrisma.homeroomAssignment.findMany.mockImplementation(async ({ where }: { where: { schoolClassId: string } }) => {
        if (where.schoolClassId === 'class-10a') {
          return [{
            id: 'hr-10a',
            schoolClassId: 'class-10a',
            teacherUserId: gvcn10a.id,
            validFrom: new Date('2026-09-01T00:00:00.000Z'),
            validUntil: null,
            teacherUser: gvcn10a,
          }];
        }
        return [];
      });

      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'HOMEROOM_MISSING',
      }));
    });
  });

  describe('4. GRADE & SCHOOL_WIDE Coverage Collapse', () => {
    it('collapses complete grade marker coverage into 1 logical slot', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      // 10A and 10B both have slot-m1
      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(true);
      expect(res.rows[0].slots).toHaveLength(1); // collapsed into 1 logical slot
      expect(res.rows[0].slots[0].timeSlotDefinitionId).toBe('slot-m1');
      expect(res.rows[0].slots[0].weekday).toBe('MONDAY');
    });

    it('blocks GRADE mode if marker coverage is incomplete across active classes of the grade', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      // Only 10A has marker, 10B is missing
      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'GRADE_COVERAGE_INCOMPLETE',
      }));
    });

    it('collapses complete school-wide marker coverage into 1 logical slot', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Toàn trường', '', 'Chào cờ / Sinh hoạt', 'Nguyễn Văn A'],
      ]));

      // All classes in school (10A, 10B, 11A) must have marker on slot-m1
      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-11a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(true);
      expect(res.rows[0].slots).toHaveLength(1);
      expect(res.rows[0].slots[0].timeSlotDefinitionId).toBe('slot-m1');
    });

    it('blocks SCHOOL_WIDE mode if coverage is incomplete', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Toàn trường', '', 'Chào cờ', 'Nguyễn Văn A'],
      ]));

      // 11A missing
      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'SCHOOL_WIDE_COVERAGE_INCOMPLETE',
      }));
    });
  });

  describe('5. Exact Count Rule', () => {
    it('blocks when candidate count is less than required periods', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '2', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'], // requires 2 periods
      ]));

      // Only 1 period available (slot-m1)
      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'GRADE_PERIOD_COUNT_MISMATCH',
      }));
    });

    it('blocks when candidate count exceeds required periods (surplus)', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'], // requires 1 period
      ]));

      // 2 periods available (slot-m1 and slot-m2)
      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN' },
      ]);

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'GRADE_PERIOD_COUNT_MISMATCH',
      }));
    });
  });

  describe('6. Calendar & Timetable Authority', () => {
    it('blocks when official week number is not found in academic calendar', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['99', '99', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'WEEK_NOT_IN_CALENDAR',
      }));
    });

    it('blocks when no date-effective TimetableVersion exists for the date', async () => {
      mockPrisma.timetableVersion.findFirst.mockResolvedValue(null); // No timetable

      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      const res = await importerService.preview(dummyUpload, academicYearId);
      expect(res.canConfirm).toBe(false);
      expect(res.rows[0].issues).toContainEqual(expect.objectContaining({
        code: 'TIMETABLE_VERSION_NOT_FOUND',
      }));
    });

    it('only queries and respects HDTN_HN markers (ignores GDDP / others)', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      await importerService.preview(dummyUpload, academicYearId);
      expect(mockMarkerService.findRetainedMarkers).toHaveBeenCalledWith({
        timetableVersionId,
        kind: 'HDTN_HN',
      });
    });
  });

  describe('7. Preview Fingerprint & Confirmation Safety', () => {
    it('produces deterministic previewFingerprint without mutation', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res1 = await importerService.preview(dummyUpload, academicYearId);
      const res2 = await importerService.preview(dummyUpload, academicYearId);

      expect(res1.previewFingerprint).toBeDefined();
      expect(res1.previewFingerprint).toBe(res2.previewFingerprint);
      // Zero mutation assertion:
      expect(mockPlanningService.importHdtnDraftPackage).not.toHaveBeenCalled();
    });

    it('Finding B: fingerprint changes when TimetableVersion identity changes', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));
      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res1 = await importerService.preview(dummyUpload, academicYearId);

      mockPrisma.timetableVersion.findFirst.mockResolvedValueOnce({
        id: 'tkb-uuid-2-different',
        academicYearId,
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
        effectiveUntil: null,
      });

      const res2 = await importerService.preview(dummyUpload, academicYearId);
      expect(res1.previewFingerprint).not.toBe(res2.previewFingerprint);
    });

    it('Finding B: fingerprint changes when retained marker identity changes', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));
      mockMarkerService.findRetainedMarkers.mockResolvedValueOnce([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);
      const res1 = await importerService.preview(dummyUpload, academicYearId);

      mockMarkerService.findRetainedMarkers.mockResolvedValueOnce([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m2', kind: 'HDTN_HN' },
      ]);
      const res2 = await importerService.preview(dummyUpload, academicYearId);
      expect(res1.previewFingerprint).not.toBe(res2.previewFingerprint);
    });

    it('Finding B: fingerprint changes when CLASS homeroomAssignment / GVCN changes', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo lớp', '10', 'Chủ đề 1', 'GVCN'],
      ]));
      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res1 = await importerService.preview(dummyUpload, academicYearId);

      mockPrisma.homeroomAssignment.findMany.mockImplementation(async ({ where }: { where: { schoolClassId: string } }) => {
        if (where.schoolClassId === 'class-10a') {
          return [{
            id: 'hr-10a-new',
            schoolClassId: 'class-10a',
            teacherUserId: teacherB.id,
            validFrom: new Date('2026-09-01T00:00:00.000Z'),
            validUntil: null,
            teacherUser: teacherB,
          }];
        }
        return [{
          id: 'hr-10b',
          schoolClassId: 'class-10b',
          teacherUserId: gvcn10b.id,
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validUntil: null,
          teacherUser: gvcn10b,
        }];
      });

      const res2 = await importerService.preview(dummyUpload, academicYearId);
      expect(res1.previewFingerprint).not.toBe(res2.previewFingerprint);
    });

    it('Finding B: fingerprint changes when AcademicWeek/segment identity changes', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));
      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const res1 = await importerService.preview(dummyUpload, academicYearId);

      mockPrisma.academicCalendarVersion.findFirst.mockResolvedValueOnce({
        ...defaultCalendar,
        weeks: [
          {
            id: 'week-1-different',
            officialWeekNumber: 1,
            segments: [
              {
                id: 'seg-1-different',
                startDate: new Date('2026-09-07T00:00:00.000Z'),
                endDate: new Date('2026-09-12T00:00:00.000Z'),
              },
            ],
          },
        ],
      });

      const res2 = await importerService.preview(dummyUpload, academicYearId);
      expect(res1.previewFingerprint).not.toBe(res2.previewFingerprint);
    });

    it('rejects confirm if expectedPreviewFingerprint does not match fresh evaluation', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      await expect(
        importerService.confirm(
          dummyUpload,
          academicYearId,
          'stale-fingerprint-12345',
          'cmd-1',
          actorId,
        ),
      ).rejects.toThrow(ConflictException);

      expect(mockPlanningService.importHdtnDraftPackage).not.toHaveBeenCalled();
    });

    it('successfully confirms draft when fingerprint matches', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      mockMarkerService.findRetainedMarkers.mockResolvedValue([
        { schoolClassId: 'class-10a', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
        { schoolClassId: 'class-10b', timeSlotDefinitionId: 'slot-m1', kind: 'HDTN_HN' },
      ]);

      const previewRes = await importerService.preview(dummyUpload, academicYearId);

      const confirmRes = await importerService.confirm(
        dummyUpload,
        academicYearId,
        previewRes.previewFingerprint,
        'cmd-confirm-1',
        actorId,
      );

      expect(confirmRes.status).toBe('DRAFT');
      expect(confirmRes.programmePlanVersionId).toBe('plan-v1');
      expect(mockPlanningService.importHdtnDraftPackage).toHaveBeenCalledTimes(1);
    });
  });

  describe('8. Authorization Façade Boundary', () => {
    it('dispatches to requireProgrammeAuthority on existing master', async () => {
      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      const res = await authService.previewHdtnWorkbook(dummyUpload, academicYearId, actorId);
      expect(res).toBeDefined();
      expect(mockProgrammeAuthService.requireProgrammeAuthority).toHaveBeenCalledWith(
        actorId,
        expect.objectContaining({ id: 'master-hdtn-1', kind: 'HDTN_HN' }),
        undefined,
      );
    });

    it('denies user when requireProgrammeAuthority throws ForbiddenException', async () => {
      mockProgrammeAuthService.requireProgrammeAuthority.mockRejectedValue(
        new ForbiddenException('Unauthorized for master'),
      );

      await expect(
        authService.previewHdtnWorkbook(dummyUpload, academicYearId, actorId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('dispatches to requireBghAuthority when master is missing (bootstrap)', async () => {
      mockPrisma.programmeMaster.findFirst.mockResolvedValue(null); // No master

      mockParser.parse.mockResolvedValue(createMockWorkbook([
        ['1', '1', '1', 'Theo khối', '10', 'Chủ đề 1', 'Nguyễn Văn A'],
      ]));

      const res = await authService.previewHdtnWorkbook(dummyUpload, academicYearId, actorId);
      expect(res).toBeDefined();
      expect(mockProgrammeAuthService.requireBghAuthority).toHaveBeenCalledWith(
        actorId,
        undefined,
      );
    });

    it('denies coordinator when master is missing if user is not BGH', async () => {
      mockPrisma.programmeMaster.findFirst.mockResolvedValue(null); // No master
      mockProgrammeAuthService.requireBghAuthority.mockRejectedValue(
        new ForbiddenException('BGH authority required to bootstrap master'),
      );

      await expect(
        authService.previewHdtnWorkbook(dummyUpload, academicYearId, actorId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
