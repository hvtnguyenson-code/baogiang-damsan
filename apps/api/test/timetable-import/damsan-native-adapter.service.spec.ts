import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AcademicWeekday, CatalogStatus, UserStatus } from '@prisma/client';
import { DamSanNativeTimetableAdapter } from '../../src/timetable-import/damsan-native-adapter.service';
import {
  DAMSAN_NATIVE_SHEETS,
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

    type MockVersion = {
      id: string;
      academicYearId: string;
      versionNumber: number;
      status: string;
      calendarVersionId: string;
      effectiveAcademicWeekId: string;
      effectiveFrom: Date;
      effectiveUntil: Date | null;
      contentChecksum?: string;
      createdAt: Date;
      updatedAt: Date;
      _count?: { entries: number };
      [key: string]: unknown;
    };
    type MockReceipt = {
      id: string;
      timetableVersionId?: string;
      committedAt?: Date;
      [key: string]: unknown;
    };
    type MockRequestKey = {
      id: string;
      requestKey?: string;
      receiptId?: string;
      [key: string]: unknown;
    };

    const versions: MockVersion[] = [
      {
        id: 'active-baseline-id',
        academicYearId: mockIds.academicYearId,
        versionNumber: 1,
        status: 'ACTIVE',
        calendarVersionId: mockIds.calendarVersionId,
        effectiveAcademicWeekId: mockIds.effectiveAcademicWeekId,
        effectiveFrom: new Date('2026-09-07T00:00:00Z'),
        effectiveUntil: null,
        contentChecksum: 'baseline-content-checksum',
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-01T00:00:00Z'),
        _count: { entries: 455 },
      },
    ];
    const receipts: MockReceipt[] = [];
    const requestKeys = new Map<string, MockRequestKey>();

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
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where?.status?.in) {
            const active = versions.find((v) => where.status.in.includes(v.status));
            return Promise.resolve(active ?? null);
          }
          if (where?.contentChecksum) {
            const match = versions.find((v) => v.contentChecksum === where.contentChecksum);
            if (match) {
              const r = receipts.find((rec) => rec.timetableVersionId === match.id);
              return Promise.resolve({
                ...match,
                importReceipt: r ?? null,
              });
            }
          }
          return Promise.resolve(null);
        }),
        aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: 0 } }),
        create: jest.fn().mockImplementation(({ data }) => {
          const v = {
            id: 'created-version-id',
            createdAt: new Date('2026-09-07T12:00:00Z'),
            updatedAt: new Date('2026-09-07T12:00:00Z'),
            _count: { entries: 455 },
            ...data,
          };
          versions.push(v);
          return Promise.resolve(v);
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(({ where }) => {
          const v = versions.find((item) => item.id === where.id);
          return Promise.resolve(v ?? {
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
          });
        }),
      },
      timetableEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 455 }),
      },
      timetableImportReceipt: {
        create: jest.fn().mockImplementation(({ data }) => {
          const r = {
            id: 'created-receipt-id',
            committedAt: new Date('2026-09-07T12:00:00Z'),
            ...data,
          };
          receipts.push(r);
          return Promise.resolve(r);
        }),
      },
      timetableImportRequestKey: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const keyBinding = requestKeys.get(where.requestKey);
          if (!keyBinding) return Promise.resolve(null);
          const r = receipts.find((rec) => rec.id === keyBinding.receiptId);
          const v = versions.find((ver) => ver.id === r?.timetableVersionId);
          return Promise.resolve({
            ...keyBinding,
            receipt: r ? { ...r, timetableVersion: v } : null,
          });
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const k = { id: `created-key-${requestKeys.size + 1}`, ...data };
          requestKeys.set(data.requestKey, k);
          return Promise.resolve(k);
        }),
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

    return { prisma, audit, parser, adapter, service, classes, subjects, users, assignments, slots };
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

  describe('P2-050: Morning/Afternoon Selective Update & Explicit Carry-Forward', () => {
    // Helper to generate mock baseline entries from full preview
    async function getFullBaselineEntries() {
      const { adapter } = buildMockContext();
      const fullPreview = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
      return fullPreview.rows.map((row, idx) => ({
        id: `baseline-entry-${idx + 1}`,
        timetableVersionId: 'baseline-version-id',
        academicYearId: mockIds.academicYearId,
        weekday: row.weekday,
        timeSlotDefinitionId: row.timeSlotDefinitionId,
        schoolClassId: row.schoolClassId,
        subjectId: row.subjectId,
        teachingAssignmentId: row.teachingAssignmentId,
        teacherUserId: row.teacherUserId,
        createdAt: new Date('2026-09-01T00:00:00Z'),
      }));
    }

    describe('A. Backward Compatibility', () => {
      it('1. DAMSAN_NATIVE with mode omitted defaults to BOTH', async () => {
        const { adapter } = buildMockContext();
        const res = await adapter.preview(parsedFixture, previewDto, 'fixture.xlsx');
        expect(res.composition?.mode).toBe('BOTH');
        expect(res.rows).toHaveLength(455);
        expect(res.source.sheetName).toBe('ALL_SHEETS');
      });

      it('2. BOTH still requires/validates all four sheets', async () => {
        const mutatedParsed = {
          ...parsedFixture,
          sheets: parsedFixture.sheets.filter((s) => s.name !== 'TKB THEO LỚP BUỔI CHIỀU'),
        };
        const { adapter } = buildMockContext();
        await expect(adapter.preview(mutatedParsed, { ...previewDto, nativeSessionMode: 'BOTH' }, 'fixture.xlsx'))
          .rejects.toThrow();
      });

      it('3. sanitized BOTH remains exactly 455 canonical normal rows', async () => {
        const { adapter } = buildMockContext();
        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'BOTH' }, 'fixture.xlsx');
        expect(res.rows).toHaveLength(455);
        expect(res.composition?.authoredEntryCount).toBe(455);
        expect(res.composition?.carriedForwardEntryCount).toBe(0);
      });

      it('4. current ALL_SHEETS / header 6 replay behavior remains valid', async () => {
        const { service } = buildMockContext();
        const res = await service.confirm(
          uploadFile,
          { ...previewDto, nativeSessionMode: 'BOTH', requestIdempotencyKey: 'idemp-both-replay' },
          mockIds.actorUserId,
          { requestId: 'req-both' },
        );
        expect(res.outcome).toBe('CREATED');
        expect(res.receipt.sheetName).toBe('ALL_SHEETS');
        expect(res.receipt.headerRowNumber).toBe(6);
      });

      it('4a. native inspect, mode omitted defaults to BOTH', async () => {
        const { service } = buildMockContext();
        const res = await service.inspect(uploadFile, mockIds.profileRevisionId, 'DAMSAN_NATIVE');
        expect(res.sheets.length).toBe(4);
      });

      it('4b. BOTH inspect still fails if any of 4 required sheets is missing/corrupt', async () => {
        const { service, parser } = buildMockContext();
        const morningOnlyParsed = {
          ...parsedFixture,
          sheets: parsedFixture.sheets.filter((s) => !s.name.includes('CHIỀU')),
        };
        parser.parse.mockResolvedValueOnce(morningOnlyParsed);
        await expect(service.inspect(uploadFile, mockIds.profileRevisionId, 'DAMSAN_NATIVE', 'BOTH'))
          .rejects.toThrow();
      });

      it('4c. MORNING inspect succeeds with afternoon sheets completely absent', async () => {
        const { service, parser } = buildMockContext();
        const morningOnlyParsed = {
          ...parsedFixture,
          sheets: parsedFixture.sheets.filter((s) => !s.name.includes('CHIỀU')),
        };
        parser.parse.mockResolvedValueOnce(morningOnlyParsed);
        const res = await service.inspect(uploadFile, mockIds.profileRevisionId, 'DAMSAN_NATIVE', 'MORNING');
        expect(res.sheets.length).toBe(2);
      });

      it('4d. MORNING inspect succeeds when unselected afternoon sheets are malformed', async () => {
        const { service, parser } = buildMockContext();
        const morningWithMalformedAfternoon = {
          ...parsedFixture,
          sheets: parsedFixture.sheets.map((sheet) => {
            if (sheet.name.includes('CHIỀU')) {
              return { ...sheet, rowCount: 1, columnCount: 1, rows: [['corrupt']] };
            }
            return sheet;
          }),
        };
        parser.parse.mockResolvedValueOnce(morningWithMalformedAfternoon);
        const res = await service.inspect(uploadFile, mockIds.profileRevisionId, 'DAMSAN_NATIVE', 'MORNING');
        expect(res.sheets.length).toBe(4);
      });

      it('4e. AFTERNOON inspect succeeds with morning sheets absent/malformed', async () => {
        const { service, parser } = buildMockContext();
        const afternoonOnlyParsed = {
          ...parsedFixture,
          sheets: parsedFixture.sheets.filter((s) => !s.name.includes('SÁNG') && !s.name.includes('SANG')),
        };
        parser.parse.mockResolvedValueOnce(afternoonOnlyParsed);
        const res = await service.inspect(uploadFile, mockIds.profileRevisionId, 'DAMSAN_NATIVE', 'AFTERNOON');
        expect(res.sheets.length).toBe(2);
      });

      it('4f. missing/corrupt selected pair fails closed at inspect', async () => {
        const { service, parser } = buildMockContext();
        const missingMorningClass = {
          ...parsedFixture,
          sheets: parsedFixture.sheets.filter((s) => s.name !== 'TKB THEO LỚP BUỔI SÁNG'),
        };
        parser.parse.mockResolvedValueOnce(missingMorningClass);
        await expect(service.inspect(uploadFile, mockIds.profileRevisionId, 'DAMSAN_NATIVE', 'MORNING'))
          .rejects.toThrow();
      });
    });

    describe('B. Morning Selective', () => {
      it('5. baseline 455 + new morning 402 => final 455', async () => {
        const { adapter, prisma } = buildMockContext();
        const baselineEntries = await getFullBaselineEntries();
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue(baselineEntries);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(true);
        expect(res.composition).toEqual({
          mode: 'MORNING',
          baselineTimetableVersionId: 'baseline-ver-1',
          authoredEntryCount: 402,
          carriedForwardEntryCount: 53,
          finalEntryCount: 455,
        });
        expect(res.rows).toHaveLength(455);
        expect(res.source.sheetName).toBe('MORNING_SHEETS');
        expect(res.source.sourceRowCount).toBe(540);
      });

      it('6. exact 53 afternoon baseline rows carried unchanged', async () => {
        const { adapter, prisma, slots } = buildMockContext();
        const baselineEntries = await getFullBaselineEntries();
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue(baselineEntries);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        const afternoonSlotIds = new Set(slots.filter((s) => s.session === 'AFTERNOON').map((s) => s.id));
        const carriedAfternoon = res.rows.filter((r) => afternoonSlotIds.has(r.timeSlotDefinitionId));
        expect(carriedAfternoon).toHaveLength(53);
        for (const row of carriedAfternoon) {
          expect(row.sourceRowNumber).toBe(0);
        }
      });

      it('7. malformed/missing unselected afternoon workbook sheets do not erase carried afternoon', async () => {
        const { adapter, prisma } = buildMockContext();
        const baselineEntries = await getFullBaselineEntries();
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue(baselineEntries);

        // Filter out afternoon sheets completely
        const morningOnlyParsed = {
          ...parsedFixture,
          sheets: parsedFixture.sheets.filter((s) => !s.name.includes('CHIỀU')),
        };

        const res = await adapter.preview(morningOnlyParsed, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(true);
        expect(res.rows).toHaveLength(455);
        expect(res.composition?.carriedForwardEntryCount).toBe(53);
      });

      it('8. selected morning pair missing/corrupt => fail closed', async () => {
        const { adapter } = buildMockContext();
        const corruptedParsed = {
          ...parsedFixture,
          sheets: parsedFixture.sheets.filter((s) => s.name !== 'TKB THEO LỚP BUỔI SÁNG'),
        };
        await expect(adapter.preview(corruptedParsed, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx'))
          .rejects.toThrow();
      });
    });

    describe('C. Afternoon Selective', () => {
      it('9. baseline 455 + new afternoon 53 => final 455', async () => {
        const { adapter, prisma } = buildMockContext();
        const baselineEntries = await getFullBaselineEntries();
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue(baselineEntries);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'AFTERNOON' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(true);
        expect(res.composition).toEqual({
          mode: 'AFTERNOON',
          baselineTimetableVersionId: 'baseline-ver-1',
          authoredEntryCount: 53,
          carriedForwardEntryCount: 402,
          finalEntryCount: 455,
        });
        expect(res.rows).toHaveLength(455);
        expect(res.source.sheetName).toBe('AFTERNOON_SHEETS');
        expect(res.source.sourceRowCount).toBe(540);
      });

      it('10. exact 402 morning baseline rows carried unchanged', async () => {
        const { adapter, prisma, slots } = buildMockContext();
        const baselineEntries = await getFullBaselineEntries();
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue(baselineEntries);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'AFTERNOON' }, 'fixture.xlsx');
        const morningSlotIds = new Set(slots.filter((s) => s.session === 'MORNING').map((s) => s.id));
        const carriedMorning = res.rows.filter((r) => morningSlotIds.has(r.timeSlotDefinitionId));
        expect(carriedMorning).toHaveLength(402);
      });

      it('11. malformed/missing unselected morning source does not erase carried morning', async () => {
        const { adapter, prisma } = buildMockContext();
        const baselineEntries = await getFullBaselineEntries();
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue(baselineEntries);

        // Filter out morning sheets completely
        const afternoonOnlyParsed = {
          ...parsedFixture,
          sheets: parsedFixture.sheets.filter((s) => !s.name.includes('SÁNG') && !s.name.includes('SANG')),
        };

        const res = await adapter.preview(afternoonOnlyParsed, { ...previewDto, nativeSessionMode: 'AFTERNOON' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(true);
        expect(res.rows).toHaveLength(455);
        expect(res.composition?.carriedForwardEntryCount).toBe(402);
      });

      it('12. selected afternoon pair missing/corrupt => fail closed', async () => {
        const { adapter } = buildMockContext();
        const corruptedParsed = {
          ...parsedFixture,
          sheets: parsedFixture.sheets.filter((s) => s.name !== 'TKB THEO LỚP BUỔI CHIỀU'),
        };
        await expect(adapter.preview(corruptedParsed, { ...previewDto, nativeSessionMode: 'AFTERNOON' }, 'fixture.xlsx'))
          .rejects.toThrow();
      });
    });

    describe('D. Baseline Resolution', () => {
      it('13. selective without effective baseline throws TKB_NATIVE_CARRY_FORWARD_BASELINE_MISSING', async () => {
        const { adapter, prisma } = buildMockContext();
        prisma.timetableVersion.findFirst.mockResolvedValue(null);

        await expect(adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx'))
          .rejects.toMatchObject({
            response: expect.objectContaining({
              error: DamSanNativeErrorCode.TKB_NATIVE_CARRY_FORWARD_BASELINE_MISSING,
            }),
          });
      });

      it('14. baseline selected by exact ADR-020 effective interval', async () => {
        const { adapter, prisma } = buildMockContext();
        const baselineEntries = await getFullBaselineEntries();
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ad20',
          versionNumber: 2,
          status: 'SUPERSEDED',
          effectiveFrom: new Date('2026-09-01T00:00:00Z'),
          effectiveUntil: new Date('2026-09-15T00:00:00Z'),
        });
        prisma.timetableEntry.findMany.mockResolvedValue(baselineEntries);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.composition?.baselineTimetableVersionId).toBe('baseline-ad20');
        expect(prisma.timetableVersion.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              status: { in: ['ACTIVE', 'SUPERSEDED'] },
              effectiveFrom: { lte: expect.any(Date) },
            }),
            orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
          }),
        );
      });

      it('15. DRAFT/VALIDATED/APPROVED candidates are never carry-forward baseline', async () => {
        const { adapter, prisma } = buildMockContext();
        prisma.timetableVersion.findFirst.mockResolvedValue(null);

        await expect(adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx'))
          .rejects.toThrow();
      });

      it('16. future/old versionNumber ordering cannot override date-effective baseline', async () => {
        const { adapter, prisma } = buildMockContext();
        const baselineEntries = await getFullBaselineEntries();
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'v1-effective',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue(baselineEntries);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.composition?.baselineTimetableVersionId).toBe('v1-effective');
      });
    });

    describe('E. Provenance', () => {
      it('17. carried rows preserve exact canonical IDs and no re-resolution through catalog', async () => {
        const { adapter, prisma } = buildMockContext();
        const customCarriedEntry = {
          id: 'carried-special-entry',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([customCarriedEntry]);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        const matched = res.rows.find((r) => r.teachingAssignmentId === 'assign-10A1-TO-GV01');
        expect(matched).toBeDefined();
        expect(matched?.teacherUserId).toBe('user-GV01');
        expect(matched?.subjectId).toBe('subj-TO');
        expect(matched?.schoolClassId).toBe('class-10A1');
        expect(matched?.timeSlotDefinitionId).toBe('slot-MONDAY-AFTERNOON-1');
      });

      it('18. carry-forward must not re-resolve aliases/current staff assignment', async () => {
        const { adapter, prisma } = buildMockContext();
        const baselineEntry = {
          id: 'b-1',
          timetableVersionId: 'baseline-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([baselineEntry]);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        const carried = res.rows.find((r) => r.teachingAssignmentId === 'assign-10A1-TO-GV01');
        expect(carried?.teachingAssignmentId).toBe('assign-10A1-TO-GV01');
      });

      it('18a. missing baseline TimeSlotDefinition fails closed with TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID', async () => {
        const { adapter, prisma } = buildMockContext();
        const entryWithMissingSlot = {
          id: 'entry-missing-slot',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'non-existent-slot-id',
          schoolClassId: 'class-10A1',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([entryWithMissingSlot]);

        await expect(adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx'))
          .rejects.toMatchObject({
            response: {
              error: DamSanNativeErrorCode.TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID,
              entryId: 'entry-missing-slot',
              missingRelation: 'TimeSlotDefinition',
              referenceId: 'non-existent-slot-id',
            },
          });
      });

      it('18b. missing baseline SchoolClass fails closed with TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID', async () => {
        const { adapter, prisma } = buildMockContext();
        const entryWithMissingClass = {
          id: 'entry-missing-class',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'non-existent-class-id',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([entryWithMissingClass]);

        await expect(adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx'))
          .rejects.toMatchObject({
            response: {
              error: DamSanNativeErrorCode.TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID,
              entryId: 'entry-missing-class',
              missingRelation: 'SchoolClass',
              referenceId: 'non-existent-class-id',
            },
          });
      });

      it('18c. missing baseline Subject fails closed with TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID', async () => {
        const { adapter, prisma } = buildMockContext();
        const entryWithMissingSubject = {
          id: 'entry-missing-subject',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1',
          subjectId: 'non-existent-subject-id',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([entryWithMissingSubject]);

        await expect(adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx'))
          .rejects.toMatchObject({
            response: {
              error: DamSanNativeErrorCode.TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID,
              entryId: 'entry-missing-subject',
              missingRelation: 'Subject',
              referenceId: 'non-existent-subject-id',
            },
          });
      });

      it('18d. missing baseline User fails closed with TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID', async () => {
        const { adapter, prisma } = buildMockContext();
        const entryWithMissingUser = {
          id: 'entry-missing-user',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'non-existent-user-id',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([entryWithMissingUser]);

        await expect(adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx'))
          .rejects.toMatchObject({
            response: {
              error: DamSanNativeErrorCode.TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID,
              entryId: 'entry-missing-user',
              missingRelation: 'User',
              referenceId: 'non-existent-user-id',
            },
          });
      });

      it('18e. missing baseline TeachingAssignment fails closed with TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID', async () => {
        const { adapter, prisma } = buildMockContext();
        const entryWithMissingAssignment = {
          id: 'entry-missing-assignment',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'non-existent-assignment-id',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([entryWithMissingAssignment]);

        await expect(adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx'))
          .rejects.toMatchObject({
            response: {
              error: DamSanNativeErrorCode.TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID,
              entryId: 'entry-missing-assignment',
              missingRelation: 'TeachingAssignment',
              referenceId: 'non-existent-assignment-id',
            },
          });
      });
    });

    describe('F. Final Validation', () => {
      it('19. authored row conflicting with carried row on real wall-clock overlap is blocked by full composition validation', async () => {
        const { adapter, prisma, slots } = buildMockContext();
        // Standard Monday Morning Period 2 in fixture has:
        // startTime: 1970-01-01T08:00:00.000Z, endTime: 1970-01-01T08:45:00.000Z
        // Standard Monday Afternoon Period 1 in fixture has:
        // startTime: 1970-01-01T13:00:00.000Z, endTime: 1970-01-01T13:45:00.000Z
        // Replace slot-MONDAY-AFTERNOON-1 with a slot whose wall-clock time overlaps with Morning Period 2 (08:15-09:00)
        const mutatedSlots = slots.map((s) => {
          if (s.id === 'slot-MONDAY-AFTERNOON-1') {
            return {
              ...s,
              startTime: new Date('1970-01-01T08:15:00.000Z'),
              endTime: new Date('1970-01-01T09:00:00.000Z'),
            };
          }
          return s;
        });
        prisma.timeSlotDefinition.findMany.mockResolvedValue(mutatedSlots);

        // In sanitized fixture, Monday Morning Period 2 has class 10A1 assigned to subject TO, teacher GV01
        // Baseline has a carried afternoon entry for class 10A1 using slot-MONDAY-AFTERNOON-1
        const conflictingCarriedEntry = {
          id: 'carried-overlapping-entry',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1', // class collision with morning 10A1!
          subjectId: 'subj-VA',
          teachingAssignmentId: 'assign-10A1-VA-GV02',
          teacherUserId: 'user-GV02',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([conflictingCarriedEntry]);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(false);
        expect(res.composition?.carriedForwardEntryCount).toBe(1);
        expect(res.issues).toContainEqual(
          expect.objectContaining({
            code: 'CLASS_TIME_OVERLAP',
            severity: 'ERROR',
          }),
        );
      });

      it('20. validator receives full composed timetable', async () => {
        const { adapter, prisma } = buildMockContext();
        const baselineEntries = await getFullBaselineEntries();
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue(baselineEntries);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.rows).toHaveLength(455);
        expect(res.blockingIssueCount).toBe(0);
      });

      it('21. selected session can be deliberately cleared without erasing the untouched session', async () => {
        const { adapter, prisma } = buildMockContext();
        const baselineEntries = await getFullBaselineEntries();
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue(baselineEntries);

        // Mutate parsedFixture: blank all morning teacher-linked class allocations & teacher allocations
        // Keep structural markers (like CC, SH) and keep headers valid
        const clearedMorningParsed: ParsedWorkbook = {
          ...parsedFixture,
          sheets: parsedFixture.sheets.map((sheet) => {
            if (sheet.name === DAMSAN_NATIVE_SHEETS.MORNING_CLASS) {
              return {
                ...sheet,
                rows: sheet.rows.map((row, rowIdx) => {
                  if (rowIdx < 6) return row; // keep headers and meta
                  // Clear cells in rows 6+ except weekday/period columns (colIdx < 2)
                  return {
                    ...row,
                    cells: row.cells.map((cell, colIdx) => (colIdx < 2 ? cell : { ...cell, text: '', kind: 'BLANK' })),
                  };
                }),
              };
            }
            if (sheet.name === DAMSAN_NATIVE_SHEETS.MORNING_TEACHER) {
              return {
                ...sheet,
                rows: sheet.rows.map((row, rowIdx) => {
                  if (rowIdx < 7) return row; // keep headers (rows 6 and 7)
                  // Clear cells in teacher rows except teacher name column (colIdx < 1)
                  return {
                    ...row,
                    cells: row.cells.map((cell, colIdx) => (colIdx < 1 ? cell : { ...cell, text: '', kind: 'BLANK' })),
                  };
                }),
              };
            }
            return sheet;
          }),
        };

        const res = await adapter.preview(clearedMorningParsed, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(true);
        expect(res.composition).toEqual({
          mode: 'MORNING',
          baselineTimetableVersionId: 'baseline-ver-1',
          authoredEntryCount: 0,
          carriedForwardEntryCount: 53,
          finalEntryCount: 53,
        });
        expect(res.rows).toHaveLength(53);
        expect(res.issues.some((i) => i.code === 'EMPTY_TIMETABLE')).toBe(false);
      });

      it('21a. carried row with inactive TimeSlotDefinition fails closed with SLOT_NOT_ACTIVE', async () => {
        const { adapter, prisma, slots } = buildMockContext();
        const mutatedSlots = slots.map((s) => (s.id === 'slot-MONDAY-AFTERNOON-1' ? { ...s, isActive: false } : s));
        prisma.timeSlotDefinition.findMany.mockResolvedValue(mutatedSlots);

        const carriedEntry = {
          id: 'carried-inactive-slot',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([carriedEntry]);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(false);
        expect(res.issues).toContainEqual(
          expect.objectContaining({
            code: 'SLOT_NOT_ACTIVE',
            severity: 'ERROR',
          }),
        );
      });

      it('21b. carried row with slot not allowing regular teaching fails closed with SLOT_NOT_REGULAR_TEACHING', async () => {
        const { adapter, prisma, slots } = buildMockContext();
        const mutatedSlots = slots.map((s) => (s.id === 'slot-MONDAY-AFTERNOON-1' ? { ...s, allowRegularTeaching: false } : s));
        prisma.timeSlotDefinition.findMany.mockResolvedValue(mutatedSlots);

        const carriedEntry = {
          id: 'carried-irregular-slot',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([carriedEntry]);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(false);
        expect(res.issues).toContainEqual(
          expect.objectContaining({
            code: 'SLOT_NOT_REGULAR_TEACHING',
            severity: 'ERROR',
          }),
        );
      });

      it('21c. carried row with inactive SchoolClass fails closed with CLASS_INACTIVE', async () => {
        const { adapter, prisma, classes } = buildMockContext();
        const mutatedClasses = classes.map((c) => (c.id === 'class-10A1' ? { ...c, status: CatalogStatus.INACTIVE } : c));
        prisma.schoolClass.findMany.mockResolvedValue(mutatedClasses);

        const carriedEntry = {
          id: 'carried-inactive-class',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([carriedEntry]);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(false);
        expect(res.issues).toContainEqual(
          expect.objectContaining({
            code: 'CLASS_INACTIVE',
            severity: 'ERROR',
          }),
        );
      });

      it('21d. carried row with inactive Subject fails closed with SUBJECT_INACTIVE', async () => {
        const { adapter, prisma, subjects } = buildMockContext();
        const mutatedSubjects = subjects.map((s) => (s.id === 'subj-TO' ? { ...s, status: CatalogStatus.INACTIVE } : s));
        prisma.subject.findMany.mockResolvedValue(mutatedSubjects);

        const carriedEntry = {
          id: 'carried-inactive-subject',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([carriedEntry]);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(false);
        expect(res.issues).toContainEqual(
          expect.objectContaining({
            code: 'SUBJECT_INACTIVE',
            severity: 'ERROR',
          }),
        );
      });

      it('21e. carried row with inactive Teacher fails closed with TEACHER_INACTIVE', async () => {
        const { adapter, prisma, users } = buildMockContext();
        const mutatedUsers = users.map((u) => (u.id === 'user-GV01' ? { ...u, status: UserStatus.DISABLED } : u));
        prisma.user.findMany.mockResolvedValue(mutatedUsers);

        const carriedEntry = {
          id: 'carried-inactive-teacher',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([carriedEntry]);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(false);
        expect(res.issues).toContainEqual(
          expect.objectContaining({
            code: 'TEACHER_INACTIVE',
            severity: 'ERROR',
          }),
        );
      });

      it('21f. carried row with teacher who is no longer teaching staff fails closed with TEACHER_NOT_TEACHING_STAFF', async () => {
        const { adapter, prisma, users } = buildMockContext();
        const mutatedUsers = users.map((u) => (u.id === 'user-GV01' ? { ...u, profile: { ...u.profile, isTeachingStaff: false } } : u));
        prisma.user.findMany.mockResolvedValue(mutatedUsers);

        const carriedEntry = {
          id: 'carried-non-teaching-staff',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([carriedEntry]);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(false);
        expect(res.issues).toContainEqual(
          expect.objectContaining({
            code: 'TEACHER_NOT_TEACHING_STAFF',
            severity: 'ERROR',
          }),
        );
      });

      it('21g. carried row with assignment coverage gap fails closed with ASSIGNMENT_COVERAGE_GAP', async () => {
        const { adapter, prisma, assignments } = buildMockContext();
        // Valid until before calendar end date (2027-05-31)
        const mutatedAssignments = assignments.map((a) => (a.id === 'assign-10A1-TO-GV01' ? { ...a, validUntil: new Date('2026-10-01T00:00:00Z') } : a));
        prisma.teachingAssignment.findMany.mockResolvedValue(mutatedAssignments);

        const carriedEntry = {
          id: 'carried-gap-assignment',
          timetableVersionId: 'baseline-ver-1',
          academicYearId: mockIds.academicYearId,
          weekday: AcademicWeekday.MONDAY,
          timeSlotDefinitionId: 'slot-MONDAY-AFTERNOON-1',
          schoolClassId: 'class-10A1',
          subjectId: 'subj-TO',
          teachingAssignmentId: 'assign-10A1-TO-GV01',
          teacherUserId: 'user-GV01',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        };
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'baseline-ver-1',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        prisma.timetableEntry.findMany.mockResolvedValue([carriedEntry]);

        const res = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(res.canConfirm).toBe(false);
        expect(res.issues).toContainEqual(
          expect.objectContaining({
            code: 'ASSIGNMENT_COVERAGE_GAP',
            severity: 'ERROR',
          }),
        );
      });
    });

    describe('G. Idempotency & Replay', () => {
      it('22. same key + same mode => replay', async () => {
        const { service } = buildMockContext();
        const confirmDto: ConfirmTimetableImportWorkbookDto = {
          ...previewDto,
          nativeSessionMode: 'MORNING',
          requestIdempotencyKey: 'idemp-mode-replay',
        };

        const res1 = await service.confirm(uploadFile, confirmDto, mockIds.actorUserId, { requestId: 'r1' });
        expect(res1.outcome).toBe('CREATED');

        const res2 = await service.confirm(uploadFile, confirmDto, mockIds.actorUserId, { requestId: 'r2' });
        expect(res2.outcome).toBe('IDEMPOTENT_REPLAY');
      });

      it('23. same key + different mode => conflict TIMETABLE_IMPORT_IDEMPOTENCY_KEY_REUSED', async () => {
        const { service } = buildMockContext();
        const confirmDto1: ConfirmTimetableImportWorkbookDto = {
          ...previewDto,
          nativeSessionMode: 'MORNING',
          requestIdempotencyKey: 'idemp-mode-conflict',
        };
        await service.confirm(uploadFile, confirmDto1, mockIds.actorUserId, { requestId: 'r1' });

        const confirmDto2: ConfirmTimetableImportWorkbookDto = {
          ...previewDto,
          nativeSessionMode: 'AFTERNOON',
          requestIdempotencyKey: 'idemp-mode-conflict',
        };
        await expect(service.confirm(uploadFile, confirmDto2, mockIds.actorUserId, { requestId: 'r2' }))
          .rejects.toThrow('Request idempotency key was already used for a different confirmation request.');
      });

      it('24. different key + same final semantic checksum => semantic replay', async () => {
        const { service } = buildMockContext();
        const confirmDto1: ConfirmTimetableImportWorkbookDto = {
          ...previewDto,
          nativeSessionMode: 'BOTH',
          requestIdempotencyKey: 'key-1',
        };
        await service.confirm(uploadFile, confirmDto1, mockIds.actorUserId, { requestId: 'r1' });

        const confirmDto2: ConfirmTimetableImportWorkbookDto = {
          ...previewDto,
          nativeSessionMode: 'BOTH',
          requestIdempotencyKey: 'key-2',
        };
        const res2 = await service.confirm(uploadFile, confirmDto2, mockIds.actorUserId, { requestId: 'r2' });
        expect(res2.outcome).toBe('IDEMPOTENT_REPLAY');
      });

      it('25. client sheet/header values cannot override server sentinel for selective mode', async () => {
        const { service } = buildMockContext();
        const confirmDto: ConfirmTimetableImportWorkbookDto = {
          ...previewDto,
          nativeSessionMode: 'MORNING',
          sheetName: 'MALICIOUS_OVERRIDE',
          headerRowNumber: 99,
          requestIdempotencyKey: 'key-sentinel-check',
        };
        const res = await service.confirm(uploadFile, confirmDto, mockIds.actorUserId, { requestId: 'r1' });
        expect(res.receipt.sheetName).toBe('MORNING_SHEETS');
        expect(res.receipt.headerRowNumber).toBe(6);
      });
    });

    describe('H. Contract & Boundaries', () => {
      it('26. nativeSessionMode on GENERIC request is rejected with TIMETABLE_IMPORT_INVALID_SOURCE_FORMAT', async () => {
        const { service } = buildMockContext();
        // 1. inspect
        await expect(service.inspect(uploadFile, mockIds.profileRevisionId, 'GENERIC', 'MORNING'))
          .rejects.toMatchObject({
            response: expect.objectContaining({
              error: 'TIMETABLE_IMPORT_INVALID_SOURCE_FORMAT',
            }),
          });

        // 2. preview
        const genericPreviewDto: PreviewTimetableImportWorkbookDto = {
          profileRevisionId: mockIds.profileRevisionId,
          academicYearId: mockIds.academicYearId,
          calendarVersionId: mockIds.calendarVersionId,
          effectiveAcademicWeekId: mockIds.effectiveAcademicWeekId,
          sourceFormat: 'GENERIC',
          nativeSessionMode: 'MORNING',
        };
        await expect(service.preview(uploadFile, genericPreviewDto)).rejects.toMatchObject({
          response: expect.objectContaining({
            error: 'TIMETABLE_IMPORT_INVALID_SOURCE_FORMAT',
          }),
        });

        // 3. confirm
        const genericConfirmDto: ConfirmTimetableImportWorkbookDto = {
          ...genericPreviewDto,
          sheetName: 'Sheet1',
          headerRowNumber: 1,
        };
        await expect(service.confirm(uploadFile, genericConfirmDto, mockIds.actorUserId, { requestId: 'r-gen' }))
          .rejects.toMatchObject({
            response: expect.objectContaining({
              error: 'TIMETABLE_IMPORT_INVALID_SOURCE_FORMAT',
            }),
          });
      });

      it('27. preview composition counts and IDs are exact', async () => {
        const { adapter, prisma } = buildMockContext();
        // BOTH with no baseline
        prisma.timetableVersion.findFirst.mockResolvedValue(null);
        const resNoBase = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'BOTH' }, 'fixture.xlsx');
        expect(resNoBase.composition).toEqual({
          mode: 'BOTH',
          baselineTimetableVersionId: null,
          authoredEntryCount: 455,
          carriedForwardEntryCount: 0,
          finalEntryCount: 455,
        });

        // Selective with baseline
        prisma.timetableVersion.findFirst.mockResolvedValue({
          id: 'active-baseline-id',
          versionNumber: 1,
          status: 'ACTIVE',
          effectiveFrom: new Date('2026-09-07T00:00:00Z'),
          effectiveUntil: null,
        });
        const resSelective = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(resSelective.composition?.baselineTimetableVersionId).toBe('active-baseline-id');
      });

      it('28. audit metadata exact and bounded for selective confirmation with carried forward baseline', async () => {
        const { service, audit, prisma } = buildMockContext();
        const baselineEntries = await getFullBaselineEntries();
        prisma.timetableVersion.findFirst.mockImplementation(({ where }) => {
          if (where?.contentChecksum) {
            return Promise.resolve(null);
          }
          return Promise.resolve({
            id: 'active-baseline-id',
            versionNumber: 1,
            status: 'ACTIVE',
            effectiveFrom: new Date('2026-09-07T00:00:00Z'),
            effectiveUntil: null,
          });
        });
        prisma.timetableEntry.findMany.mockResolvedValue(baselineEntries);

        await service.confirm(
          uploadFile,
          { ...previewDto, nativeSessionMode: 'MORNING', requestIdempotencyKey: 'idemp-audit-check' },
          mockIds.actorUserId,
          { requestId: 'req-audit' },
        );
        expect(audit.write).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              nativeSessionMode: 'MORNING',
              baselineTimetableVersionId: 'active-baseline-id',
              authoredEntryCount: 402,
              carriedForwardEntryCount: 53,
              finalEntryCount: 455,
            }),
          }),
          expect.anything(),
        );
      });
    });

    describe('I. Non-Regression', () => {
      it('29. CC/GDĐP/TN-HN remain non-persisted structural evidence in both and selective modes', async () => {
        const { adapter } = buildMockContext();
        const resBoth = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'BOTH' }, 'fixture.xlsx');
        expect(resBoth.rows.some((r) => ['CC', 'GDĐP', 'TN-HN'].includes(r.subjectCode))).toBe(false);

        const resMorning = await adapter.preview(parsedFixture, { ...previewDto, nativeSessionMode: 'MORNING' }, 'fixture.xlsx');
        expect(resMorning.rows.some((r) => ['CC', 'GDĐP', 'TN-HN'].includes(r.subjectCode))).toBe(false);
      });
    });
  });
});
