import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AcademicWeekday, CatalogStatus, UserStatus } from '@prisma/client';
import { DamSanNativeTimetableAdapter } from '../../src/timetable-import/damsan-native-adapter.service';
import {
  DamSanNativeErrorCode,
} from '../../src/timetable-import/damsan-native-adapter.types';
import {
  ConfirmTimetableImportWorkbookDto,
  PreviewTimetableImportWorkbookDto,
} from '../../src/timetable-import/dto';
import { TimetableImportWorkbookService, UploadedWorkbookFile } from '../../src/timetable-import/timetable-import-workbook.service';
import { parseWorkbookBuffer } from '../../src/timetable-import/workbook-parser.worker';
import { ParsedWorkbook } from '../../src/timetable-import/workbook-parser.types';

describe('DamSanNativeTimetableAdapter & Pipeline Integration (Checkpoint C)', () => {
  const fixturePath = resolve(__dirname, '../fixtures/tkb/sanitized-dam-san-tkb-fixture.xlsx');
  const fixtureBuffer = readFileSync(fixturePath);
  let parsedFixture: ParsedWorkbook;

  const mockIds = {
    academicYearId: '10000000-0000-4000-8000-000000000001',
    calendarVersionId: '10000000-0000-4000-8000-000000000002',
    effectiveAcademicWeekId: '10000000-0000-4000-8000-000000000003',
    profileId: '10000000-0000-4000-8000-000000000004',
    profileRevisionId: '10000000-0000-4000-8000-000000000005',
    actorUserId: '10000000-0000-4000-8000-000000000006',
  };

  const weekdays = [
    AcademicWeekday.MONDAY,
    AcademicWeekday.TUESDAY,
    AcademicWeekday.WEDNESDAY,
    AcademicWeekday.THURSDAY,
    AcademicWeekday.FRIDAY,
    AcademicWeekday.SATURDAY,
  ];

  // 18 classes in sanitized fixture
  const classCodes = [
    '10A1', '10A2', '10A3', '10A4', '10A5', '10A6',
    '11A1', '11A2', '11A3', '11A4', '11A5', '11A6',
    '12A1', '12A2', '12A3', '12A4', '12A5', '12A6',
  ];

  // Subjects present in sanitized fixture
  const subjectCodes = [
    'TO', 'VA', 'LI', 'HO', 'SI', 'TI', 'CN', 'SU', 'DI', 'NN', 'CD', 'TD', 'QP', 'SH',
  ];

  // 38 synthetic teachers
  const teacherCodes = Array.from({ length: 38 }, (_, i) => `GV${(i + 1).toString().padStart(2, '0')}`);

  function buildMockContext() {
    const classes = classCodes.map((code) => ({
      id: `class-${code}`,
      code,
      name: `Lớp ${code}`,
      academicYearId: mockIds.academicYearId,
      gradeLevel: Number(code.slice(0, 2)),
      status: CatalogStatus.ACTIVE,
    }));

    const subjects = subjectCodes.map((code) => ({
      id: `subj-${code}`,
      code,
      name: `Môn ${code}`,
      status: CatalogStatus.ACTIVE,
    }));

    const users = teacherCodes.map((staffCode, idx) => ({
      id: `user-${staffCode}`,
      username: staffCode.toLowerCase(),
      status: UserStatus.ACTIVE,
      profile: {
        staffCode,
        displayName: `Giáo viên ${(idx + 1).toString().padStart(2, '0')}`,
        isTeachingStaff: true,
      },
    }));

    const slots: Array<{
      id: string;
      academicYearId: string;
      weekday: AcademicWeekday;
      session: 'MORNING' | 'AFTERNOON';
      ordinal: number;
      startTime: Date;
      endTime: Date;
      revision: number;
      isActive: boolean;
      allowRegularTeaching: boolean;
    }> = [];

    for (const weekday of weekdays) {
      for (const session of ['MORNING', 'AFTERNOON'] as const) {
        for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
          const baseHour = session === 'MORNING' ? 6 + ordinal : 12 + ordinal;
          slots.push({
            id: `slot-${weekday}-${session}-${ordinal}`,
            academicYearId: mockIds.academicYearId,
            weekday,
            session,
            ordinal,
            startTime: new Date(`1970-01-01T${baseHour.toString().padStart(2, '0')}:00:00.000Z`),
            endTime: new Date(`1970-01-01T${baseHour.toString().padStart(2, '0')}:45:00.000Z`),
            revision: 1,
            isActive: true,
            allowRegularTeaching: true,
          });
        }
      }
    }

    // Comprehensive teaching assignments: every class x subject x teacher
    const assignments: Array<{
      id: string;
      academicYearId: string;
      schoolClassId: string;
      subjectId: string;
      teacherUserId: string;
      validFrom: Date;
      validUntil: Date | null;
    }> = [];

    for (const c of classes) {
      for (const s of subjects) {
        for (const u of users) {
          assignments.push({
            id: `assign-${c.code}-${s.code}-${u.profile.staffCode}`,
            academicYearId: mockIds.academicYearId,
            schoolClassId: c.id,
            subjectId: s.id,
            teacherUserId: u.id,
            validFrom: new Date('2026-09-01T00:00:00Z'),
            validUntil: new Date('2027-05-31T00:00:00Z'),
          });
        }
      }
    }

    const revision = {
      id: mockIds.profileRevisionId,
      profileId: mockIds.profileId,
      isActive: true,
      sheetNameHint: 'TKB THEO LỚP BUỔI SÁNG',
      teacherIdentifierMode: 'GENERIC_EXACT',
      profile: { id: mockIds.profileId, name: 'Đam San TKB Profile' },
      columnMappings: [],
    };

    const year = {
      id: mockIds.academicYearId,
      code: '2026-2027',
      name: '2026-2027',
    };

    const calendar = {
      id: mockIds.calendarVersionId,
      academicYearId: mockIds.academicYearId,
      startDate: new Date('2026-09-01T00:00:00Z'),
      endDate: new Date('2027-05-31T00:00:00Z'),
      teachingWeekdays: weekdays,
    };

    const week = {
      id: mockIds.effectiveAcademicWeekId,
      calendarVersionId: mockIds.calendarVersionId,
      segments: [{
        startDate: new Date('2026-09-07T00:00:00Z'),
        endDate: new Date('2026-09-12T00:00:00Z'),
      }],
    };

    const prisma = {
      timetableImportProfileRevision: { findUnique: jest.fn().mockResolvedValue(revision) },
      academicYear: { findUnique: jest.fn().mockResolvedValue(year) },
      academicCalendarVersion: { findUnique: jest.fn().mockResolvedValue(calendar) },
      academicWeek: { findUnique: jest.fn().mockResolvedValue(week) },
      schoolClass: { findMany: jest.fn().mockResolvedValue(classes) },
      subject: { findMany: jest.fn().mockResolvedValue(subjects) },
      user: { findMany: jest.fn().mockResolvedValue(users) },
      timetableImportEntityAlias: { findMany: jest.fn().mockResolvedValue([]) },
      timeSlotDefinition: { findMany: jest.fn().mockResolvedValue(slots) },
      teachingAssignment: { findMany: jest.fn().mockResolvedValue(assignments) },
      timetableVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: 0 } }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'created-version-id',
          createdAt: new Date('2026-09-07T12:00:00Z'),
          updatedAt: new Date('2026-09-07T12:00:00Z'),
          ...data,
        })),
        findUniqueOrThrow: jest.fn().mockImplementation(({ where }) => Promise.resolve({
          id: where.id,
          versionNumber: 1,
          status: 'DRAFT',
          calendarVersionId: mockIds.calendarVersionId,
          effectiveAcademicWeekId: mockIds.effectiveAcademicWeekId,
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
          activatedAt: null,
          supersededAt: null,
          createdAt: new Date('2026-09-07T12:00:00Z'),
          updatedAt: new Date('2026-09-07T12:00:00Z'),
          _count: { entries: 455 },
        })),
      },
      timetableEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 455 }),
      },
      timetableImportReceipt: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
          id: 'created-receipt-id',
          committedAt: new Date('2026-09-07T12:00:00Z'),
          ...data,
        })),
      },
      timetableImportRequestKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'created-key-id' }),
      },
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };

    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const parser = { parse: jest.fn().mockResolvedValue(parsedFixture) };
    const canonicalization = { requireActiveRevision: jest.fn().mockResolvedValue(revision) };

    const adapter = new DamSanNativeTimetableAdapter(prisma as never);
    const service = new TimetableImportWorkbookService(
      prisma as never,
      parser as never,
      canonicalization as never,
      audit as never,
      adapter,
    );

    return { prisma, audit, adapter, service, classes, subjects, users, assignments, slots };
  }

  beforeAll(async () => {
    parsedFixture = await parseWorkbookBuffer(fixtureBuffer);
  });

  const uploadFile: UploadedWorkbookFile = {
    originalname: 'sanitized-dam-san-tkb-fixture.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: fixtureBuffer.length,
    buffer: fixtureBuffer,
  };

  const previewDto: PreviewTimetableImportWorkbookDto = {
    profileRevisionId: mockIds.profileRevisionId,
    academicYearId: mockIds.academicYearId,
    calendarVersionId: mockIds.calendarVersionId,
    effectiveAcademicWeekId: mockIds.effectiveAcademicWeekId,
    sourceFormat: 'DAMSAN_NATIVE',
  };

  describe('DamSanNativeTimetableAdapter.inspect', () => {
    it('inspects native workbook and returns 4 visible/selectable worksheets without issues', () => {
      const { adapter } = buildMockContext();
      const inspection = adapter.inspect(
        parsedFixture,
        mockIds.profileRevisionId,
        mockIds.profileId,
        'fixture.xlsx',
      );

      expect(inspection.sheets).toHaveLength(4);
      for (const sheet of inspection.sheets) {
        expect(sheet.selectable).toBe(true);
        expect(sheet.nonBlank).toBe(true);
      }
      expect(inspection.issues).toHaveLength(0);
    });
  });

  describe('DamSanNativeTimetableAdapter.preview', () => {
    it('generates 455 canonical rows with canConfirm=true and 0 blocking issues on sanitized fixture', async () => {
      const { adapter } = buildMockContext();
      const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');

      expect(result.canConfirm).toBe(true);
      expect(result.blockingIssueCount).toBe(0);
      expect(result.rows).toHaveLength(455);
      expect(result.issues).toHaveLength(0);
      expect(result.target.effectiveFrom).toBe('2026-09-07');
      expect(result.diff).toMatchObject({
        counts: { added: 455, changed: 0, removed: 0, unchanged: 0 },
      });
    });

    it('emits TKB_NATIVE_CLASS_HEADER_UNKNOWN when a class code is not found in the catalog', async () => {
      const { adapter, prisma, classes } = buildMockContext();
      // Remove class 10A1 from active classes
      prisma.schoolClass.findMany.mockResolvedValue(classes.filter((c) => c.code !== '10A1'));

      const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
      expect(result.canConfirm).toBe(false);
      expect(result.blockingIssueCount).toBeGreaterThanOrEqual(1);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: DamSanNativeErrorCode.TKB_NATIVE_CLASS_HEADER_UNKNOWN,
        }),
      );
    });

    it('emits TKB_NATIVE_SUBJECT_UNKNOWN when a subject code is not found in the catalog', async () => {
      const { adapter, prisma, subjects } = buildMockContext();
      // Remove subject TO from active subjects
      prisma.subject.findMany.mockResolvedValue(subjects.filter((s) => s.code !== 'TO'));

      const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
      expect(result.canConfirm).toBe(false);
      expect(result.blockingIssueCount).toBeGreaterThanOrEqual(1);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: DamSanNativeErrorCode.TKB_NATIVE_SUBJECT_UNKNOWN,
        }),
      );
    });

    it('emits TKB_NATIVE_TEACHER_IDENTITY_UNKNOWN when derived teacher code cannot be resolved', async () => {
      const { adapter, prisma, users } = buildMockContext();
      // Remove GV01 from active users
      prisma.user.findMany.mockResolvedValue(users.filter((u) => u.profile.staffCode !== 'GV01'));

      const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
      expect(result.canConfirm).toBe(false);
      expect(result.blockingIssueCount).toBeGreaterThanOrEqual(1);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: DamSanNativeErrorCode.TKB_NATIVE_TEACHER_IDENTITY_UNKNOWN,
        }),
      );
    });

    it('deduplicates when staffCode and approved alias point to the same User (PASS)', async () => {
      const { adapter, prisma } = buildMockContext();
      // Add alias for GV01 pointing to user-GV01
      prisma.timetableImportEntityAlias.findMany.mockResolvedValue([
        {
          id: 'alias-gv01',
          sourceValueKey: 'gv01',
          teacherUserId: 'user-GV01',
          entityType: 'TEACHER',
          academicYearId: null,
        },
      ]);

      const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
      expect(result.canConfirm).toBe(true);
      expect(result.blockingIssueCount).toBe(0);
      expect(result.rows).toHaveLength(455);
    });

    it('emits TKB_NATIVE_TEACHER_CODE_CONFLICT when staffCode and alias disagree (point to DIFFERENT Users)', async () => {
      const { adapter, prisma } = buildMockContext();
      // Alias for GV01 pointing to user-GV02 (different user)
      prisma.timetableImportEntityAlias.findMany.mockResolvedValue([
        {
          id: 'alias-conflict',
          sourceValueKey: 'gv01',
          teacherUserId: 'user-GV02',
          entityType: 'TEACHER',
          academicYearId: null,
        },
      ]);

      const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
      expect(result.canConfirm).toBe(false);
      expect(result.blockingIssueCount).toBeGreaterThanOrEqual(1);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: DamSanNativeErrorCode.TKB_NATIVE_TEACHER_CODE_CONFLICT,
        }),
      );
    });
  });

  describe('TimetableImportWorkbookService Integration (Inspect, Preview, Confirm)', () => {
    it('delegates service.inspect to native adapter when sourceFormat is DAMSAN_NATIVE', async () => {
      const { service } = buildMockContext();
      const inspection = await service.inspect(uploadFile, mockIds.profileRevisionId, 'DAMSAN_NATIVE');
      expect(inspection.sheets).toHaveLength(4);
      expect(inspection.issues).toHaveLength(0);
    });

    it('delegates service.preview to native adapter when sourceFormat is DAMSAN_NATIVE', async () => {
      const { service } = buildMockContext();
      const preview = await service.preview(uploadFile, previewDto);
      expect(preview.canConfirm).toBe(true);
      expect(preview.rows).toHaveLength(455);
    });

    it('confirms native import into canonical draft version and receipt with audit logging', async () => {
      const { service, prisma, audit } = buildMockContext();
      const confirmDto: ConfirmTimetableImportWorkbookDto = {
        ...previewDto,
        requestIdempotencyKey: 'idempotency-key-native-123',
      };

      const result = await service.confirm(
        uploadFile,
        confirmDto,
        mockIds.actorUserId,
        { requestId: 'req-1' },
      );

      expect(result.outcome).toBe('CREATED');
      expect(result.version).toMatchObject({
        id: 'created-version-id',
        status: 'DRAFT',
      });
      expect(result.receipt).toMatchObject({
        id: 'created-receipt-id',
        normalizedEntryCount: 455,
      });

      // Verify entries were persisted to canonical timetableEntry table
      expect(prisma.timetableEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            timetableVersionId: 'created-version-id',
            academicYearId: mockIds.academicYearId,
          }),
        ]),
      });

      // Verify audit was written
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TIMETABLE_IMPORT_COMMITTED',
          entityType: 'TimetableImportReceipt',
        }),
        expect.anything(),
      );
    });
    it('handles idempotent replay and reused key error cleanly', async () => {
      const { service, prisma } = buildMockContext();
      const confirmDto: ConfirmTimetableImportWorkbookDto = {
        ...previewDto,
        requestIdempotencyKey: 'idempotency-key-native-replay',
      };

      const result1 = await service.confirm(
        uploadFile,
        confirmDto,
        mockIds.actorUserId,
        { requestId: 'req-1' },
      );
      expect(result1.outcome).toBe('CREATED');

      const createdVersion = await (prisma.timetableVersion.create as jest.Mock).mock.results[0].value;
      // Setup replay state in mock prisma: requestKey exists pointing to the created version
      const existingKey = {
        id: 'created-key-id',
        idempotencyKey: 'idempotency-key-native-replay',
        requestFingerprint: (prisma.timetableImportRequestKey.create as jest.Mock).mock.calls[0][0].data.requestFingerprint,
        timetableVersionId: 'created-version-id',
        academicYearId: mockIds.academicYearId,
        committedByUserId: mockIds.actorUserId,
        createdAt: new Date('2026-09-07T12:00:00Z'),
        receipt: {
          id: 'created-receipt-id',
          committedAt: new Date('2026-09-07T12:00:00Z'),
          timetableVersion: {
            ...createdVersion,
            _count: { entries: 455 },
          },
        },
      };
      prisma.timetableImportRequestKey.findUnique.mockResolvedValue(existingKey);

      // Replay with exact same workbook and DTO -> IDEMPOTENT_REPLAY
      const result2 = await service.confirm(
        uploadFile,
        confirmDto,
        mockIds.actorUserId,
        { requestId: 'req-2' },
      );
      expect(result2.outcome).toBe('IDEMPOTENT_REPLAY');

      // Replay with altered DTO but same key -> throws TIMETABLE_IMPORT_IDEMPOTENCY_KEY_REUSED
      const alteredDto: ConfirmTimetableImportWorkbookDto = {
        ...confirmDto,
        calendarVersionId: 'different-calendar-id',
      };
      await expect(
        service.confirm(uploadFile, alteredDto, mockIds.actorUserId, { requestId: 'req-3' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          error: 'TIMETABLE_IMPORT_IDEMPOTENCY_KEY_REUSED',
        }),
      });
    });

    it('Finding 3 regression: emits TKB_NATIVE_EFFECTIVE_DATE_MISMATCH when target week effectiveFrom does not match workbook date', async () => {
      const { adapter, prisma } = buildMockContext();
      // Target week starts on 2026-09-14 instead of workbook date 2026-09-07
      prisma.academicWeek.findUnique.mockResolvedValue({
        id: mockIds.effectiveAcademicWeekId,
        calendarVersionId: mockIds.calendarVersionId,
        segments: [{
          startDate: new Date('2026-09-14T00:00:00Z'),
          endDate: new Date('2026-09-19T00:00:00Z'),
        }],
      });

      const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
      expect(result.canConfirm).toBe(false);
      expect(result.blockingIssueCount).toBeGreaterThanOrEqual(1);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: DamSanNativeErrorCode.TKB_NATIVE_EFFECTIVE_DATE_MISMATCH,
          message: expect.stringContaining('2026-09-07'),
        }),
      );
    });

    it('Finding 5 regression: emits TKB_NATIVE_CLASS_HEADER_UNKNOWN when an afternoon class is missing in catalog', async () => {
      const { adapter, prisma, classes } = buildMockContext();
      // Filter out 11A1 which is in both morning and afternoon sheets
      prisma.schoolClass.findMany.mockResolvedValue(classes.filter((c) => c.code !== '11A1'));

      const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
      expect(result.canConfirm).toBe(false);
      expect(result.blockingIssueCount).toBeGreaterThanOrEqual(1);
      // It should emit TKB_NATIVE_CLASS_HEADER_UNKNOWN specifically for Afternoon
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: DamSanNativeErrorCode.TKB_NATIVE_CLASS_HEADER_UNKNOWN,
          message: 'Afternoon class header "11A1" was not found in active classes.',
        }),
      );
    });

    describe('Finding 7: Server-Owned Native Provenance Sentinel', () => {
      it('forces preview source metadata to ALL_SHEETS and 6 even when client submits arbitrary sheetName and headerRowNumber', async () => {
        const { adapter } = buildMockContext();
        const clientOverriddenDto: PreviewTimetableImportWorkbookDto = {
          ...previewDto,
          sheetName: 'SOME_CLIENT_SHEET',
          headerRowNumber: 99,
        };

        const result = await adapter.preview(parsedFixture, clientOverriddenDto, 'fixture.xlsx');
        expect(result.source.sheetName).toBe('ALL_SHEETS');
        expect(result.source.headerRowNumber).toBe(6);
      });

      it('forces first confirm fingerprint/receipt to ALL_SHEETS and 6, and allows replay with same key despite client override', async () => {
        const { service, prisma } = buildMockContext();
        const clientOverriddenConfirmDto: ConfirmTimetableImportWorkbookDto = {
          ...previewDto,
          sheetName: 'SOME_CLIENT_SHEET',
          headerRowNumber: 99,
          requestIdempotencyKey: 'idempotency-key-client-override',
        };

        const result1 = await service.confirm(
          uploadFile,
          clientOverriddenConfirmDto,
          mockIds.actorUserId,
          { requestId: 'req-override-1' },
        );
        expect(result1.outcome).toBe('CREATED');
        expect(result1.receipt.sheetName).toBe('ALL_SHEETS');
        expect(result1.receipt.headerRowNumber).toBe(6);

        // Verify fingerprint creation used ALL_SHEETS and 6
        const createdReceipt = (prisma.timetableImportReceipt.create as jest.Mock).mock.calls[0][0].data;
        expect(createdReceipt.sheetName).toBe('ALL_SHEETS');
        expect(createdReceipt.headerRowNumber).toBe(6);

        const createdVersion = await (prisma.timetableVersion.create as jest.Mock).mock.results[0].value;
        const existingKey = {
          id: 'created-key-override-id',
          idempotencyKey: 'idempotency-key-client-override',
          requestFingerprint: (prisma.timetableImportRequestKey.create as jest.Mock).mock.calls[0][0].data.requestFingerprint,
          timetableVersionId: 'created-version-id',
          academicYearId: mockIds.academicYearId,
          committedByUserId: mockIds.actorUserId,
          createdAt: new Date('2026-09-07T12:00:00Z'),
          receipt: {
            id: 'created-receipt-id',
            committedAt: new Date('2026-09-07T12:00:00Z'),
            timetableVersion: {
              ...createdVersion,
              _count: { entries: 455 },
            },
          },
        };
        prisma.timetableImportRequestKey.findUnique.mockResolvedValue(existingKey);

        // Replay with exact same key and client override returns IDEMPOTENT_REPLAY
        const result2 = await service.confirm(
          uploadFile,
          clientOverriddenConfirmDto,
          mockIds.actorUserId,
          { requestId: 'req-override-2' },
        );
        expect(result2.outcome).toBe('IDEMPOTENT_REPLAY');
      });
    });

    describe('Finding 8: Class and Subject Exact Code + Alias Conflict Resolution', () => {
      it('passes when class exact code and alias point to the same canonical ID', async () => {
        const { adapter, prisma } = buildMockContext();
        // Add alias for 10A1 pointing to class-10A1
        prisma.timetableImportEntityAlias.findMany.mockResolvedValue([
          {
            id: 'alias-1',
            entityType: 'SCHOOL_CLASS',
            sourceValueKey: '10a1',
            schoolClassId: 'class-10A1',
            subjectId: null,
            teacherUserId: null,
            academicYearId: mockIds.academicYearId,
            isActive: true,
          },
        ]);

        const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
        expect(result.issues.filter((i) => i.code === 'CLASS_IDENTITY_CONFLICT')).toHaveLength(0);
      });

      it('emits CLASS_IDENTITY_CONFLICT when class exact code and alias point to different canonical IDs', async () => {
        const { adapter, prisma } = buildMockContext();
        // Alias for 10A1 pointing to class-10A2
        prisma.timetableImportEntityAlias.findMany.mockResolvedValue([
          {
            id: 'alias-conflict-class',
            entityType: 'SCHOOL_CLASS',
            sourceValueKey: '10a1',
            schoolClassId: 'class-10A2',
            subjectId: null,
            teacherUserId: null,
            academicYearId: mockIds.academicYearId,
            isActive: true,
          },
        ]);

        const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
        expect(result.canConfirm).toBe(false);
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            code: 'CLASS_IDENTITY_CONFLICT',
            message: expect.stringContaining('10A1'),
          }),
        );
      });

      it('does not silently bypass inactive direct class when alias points to an active class', async () => {
        const { adapter, prisma, classes } = buildMockContext();
        // Mark class-10A1 as INACTIVE in catalog, and add alias pointing to active class-10A2
        const mutatedClasses = classes.map((c) => (c.code === '10A1' ? { ...c, status: CatalogStatus.INACTIVE } : c));
        prisma.schoolClass.findMany.mockResolvedValue(mutatedClasses);
        prisma.timetableImportEntityAlias.findMany.mockResolvedValue([
          {
            id: 'alias-inactive-bypass',
            entityType: 'SCHOOL_CLASS',
            sourceValueKey: '10a1',
            schoolClassId: 'class-10A2',
            subjectId: null,
            teacherUserId: null,
            academicYearId: mockIds.academicYearId,
            isActive: true,
          },
        ]);

        const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
        expect(result.canConfirm).toBe(false);
        // Both 10A1 and 10A2 are distinct candidate IDs -> conflict!
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            code: 'CLASS_IDENTITY_CONFLICT',
          }),
        );
      });

      it('emits CLASS_INACTIVE when sole candidate class is inactive', async () => {
        const { adapter, prisma, classes } = buildMockContext();
        const mutatedClasses = classes.map((c) => (c.code === '10A1' ? { ...c, status: CatalogStatus.INACTIVE } : c));
        prisma.schoolClass.findMany.mockResolvedValue(mutatedClasses);

        const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
        expect(result.canConfirm).toBe(false);
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            code: 'CLASS_INACTIVE',
          }),
        );
      });

      it('passes when subject exact code and alias point to the same canonical ID', async () => {
        const { adapter, prisma } = buildMockContext();
        // Add alias for TO pointing to subj-TO
        prisma.timetableImportEntityAlias.findMany.mockResolvedValue([
          {
            id: 'alias-subj-1',
            entityType: 'SUBJECT',
            sourceValueKey: 'to',
            schoolClassId: null,
            subjectId: 'subj-TO',
            teacherUserId: null,
            academicYearId: null,
            isActive: true,
          },
        ]);

        const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
        expect(result.issues.filter((i) => i.code === 'SUBJECT_IDENTITY_CONFLICT')).toHaveLength(0);
      });

      it('emits SUBJECT_IDENTITY_CONFLICT when subject exact code and alias point to different canonical IDs', async () => {
        const { adapter, prisma } = buildMockContext();
        // Alias for TO pointing to subject-VA
        prisma.timetableImportEntityAlias.findMany.mockResolvedValue([
          {
            id: 'alias-subj-conflict',
            entityType: 'SUBJECT',
            sourceValueKey: 'to',
            schoolClassId: null,
            subjectId: 'subject-VA',
            teacherUserId: null,
            academicYearId: null,
            isActive: true,
          },
        ]);

        const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
        expect(result.canConfirm).toBe(false);
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            code: 'SUBJECT_IDENTITY_CONFLICT',
            message: expect.stringContaining('TO'),
          }),
        );
      });

      it('emits SUBJECT_INACTIVE when sole candidate subject is inactive', async () => {
        const { adapter, prisma, subjects } = buildMockContext();
        const mutatedSubjects = subjects.map((s) => (s.code === 'TO' ? { ...s, status: CatalogStatus.INACTIVE } : s));
        prisma.subject.findMany.mockResolvedValue(mutatedSubjects);

        const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
        expect(result.canConfirm).toBe(false);
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            code: 'SUBJECT_INACTIVE',
          }),
        );
      });

      it('emits CLASS_IDENTITY_CONFLICT when two distinct class header tokens resolve to same SchoolClass ID', async () => {
        const { adapter, prisma, classes } = buildMockContext();
        // Suppose 10A2 is renamed/mapped via alias to class-10A1 (and 10A2 is not a direct code in class catalog)
        const mutatedClasses = classes.filter((c) => c.code !== '10A2');
        prisma.schoolClass.findMany.mockResolvedValue(mutatedClasses);
        prisma.timetableImportEntityAlias.findMany.mockResolvedValue([
          {
            id: 'alias-class-collision',
            entityType: 'SCHOOL_CLASS',
            sourceValueKey: '10a2',
            schoolClassId: 'class-10A1',
            subjectId: null,
            teacherUserId: null,
            academicYearId: mockIds.academicYearId,
            isActive: true,
          },
        ]);

        const result = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
        expect(result.canConfirm).toBe(false);
        expect(result.issues).toContainEqual(
          expect.objectContaining({
            code: 'CLASS_IDENTITY_CONFLICT',
            message: expect.stringContaining('10A2'),
          }),
        );
      });
    });
  });
});
