import {
  BadRequestException,
  ConflictException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  AcademicWeekday,
  TimeSlotDefinition,
  TimetableVersion,
  TimetableVersionStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  CivilDateString,
  GddpWorkbookConfirmResponse,
  GddpWorkbookInspectionResponse,
  GddpWorkbookInspectionSheet,
  GddpWorkbookPreviewIssue,
  GddpWorkbookPreviewResponse,
  GddpWorkbookPreviewRow,
  GddpWorkbookResolvedSlot,
  GddpWorkbookResolvedTeacherSummary,
} from '@baogiang/contracts';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { TimetableSpecialProgrammeMarkerService } from '../timetables/timetable-special-programme-marker.service';
import { WorkbookParserService } from '../timetable-import/workbook-parser.service';
import { ParsedWorkbookCell, ParsedWorkbookRow } from '../timetable-import/workbook-parser.types';
import { MAX_XLSX_BYTES } from '../timetable-import/workbook-limits';
import { formatWallClockTime } from '../time-slots/wall-clock-time';
import {
  GddpImportAuthorityEvidence,
  GddpImportBootstrapContext,
  GddpImportCalendarEvidence,
  GddpImportDateAuthority,
  GddpImportInterruptionEvidence,
  GddpImportMarkerEvidence,
  GddpImportResolvedTeacherEvidence,
  GddpImportSegmentEvidence,
  GddpImportWeekEvidence,
  ProgrammePlanningService,
  ResolvedGddpDraftPackage,
  ResolvedGddpOccurrence,
  ResolvedGddpTopic,
  weekdayForCivilDate,
} from './programme-planning.service';
import { UploadedWorkbookFile } from './hdtn-workbook-importer.service';

export type {
  GddpImportAuthorityEvidence,
  GddpImportBootstrapContext,
  GddpImportCalendarEvidence,
  GddpImportDateAuthority,
  GddpImportInterruptionEvidence,
  GddpImportMarkerEvidence,
  GddpImportResolvedTeacherEvidence,
  GddpImportSegmentEvidence,
  GddpImportWeekEvidence,
  ResolvedGddpDraftPackage,
  ResolvedGddpOccurrence,
  ResolvedGddpTopic,
};

export interface ResolvedGddpWorkbookResult {
  preview: GddpWorkbookPreviewResponse;
  resolvedPackage: ResolvedGddpDraftPackage;
  authorityEvidence: GddpImportAuthorityEvidence;
}

const EXPECTED_HEADERS = [
  'Khối',
  'Tiết PPCT',
  'Tuần dạy',
  'Nội dung',
  'Giáo viên dạy',
] as const;

interface NormalizedGddpRowData {
  sourceRowNumber: number;
  gradeLevel: number;
  ppctCoordinates: number[];
  ppctText: string;
  officialWeeks: number[];
  weeksText: string;
  requiredPeriods: number;
  topicTitle: string;
  enteredTeacherText: string;
  staffCodes: string[];
}

@Injectable()
export class GddpWorkbookImporterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: WorkbookParserService,
    private readonly markerService: TimetableSpecialProgrammeMarkerService,
    private readonly planningService: ProgrammePlanningService,
  ) {}

  validateFile(file: UploadedWorkbookFile | undefined): void {
    if (!file) {
      throw new BadRequestException({
        error: 'GDDP_IMPORT_FILE_REQUIRED',
        message: 'Tệp bảng tính Excel (.xlsx) là bắt buộc.',
      });
    }
    if (file.size > MAX_XLSX_BYTES) {
      throw new PayloadTooLargeException({
        error: 'GDDP_IMPORT_FILE_TOO_LARGE',
        message: 'Kích thước tệp Excel vượt quá giới hạn 8 MiB.',
      });
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new UnsupportedMediaTypeException({
        error: 'GDDP_IMPORT_UNSUPPORTED_FILE_TYPE',
        message: 'Chỉ chấp nhận tệp có định dạng .xlsx.',
      });
    }
    if (
      ![
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream',
      ].includes(file.mimetype)
    ) {
      throw new UnsupportedMediaTypeException({
        error: 'GDDP_IMPORT_UNSUPPORTED_FILE_TYPE',
        message: 'Loại tệp phương tiện (MIME type) không được hỗ trợ.',
      });
    }
  }

  async inspect(
    file: UploadedWorkbookFile | undefined,
  ): Promise<GddpWorkbookInspectionResponse> {
    this.validateFile(file);
    const parsed = await this.parser.parse(file!.buffer);
    const sheets: GddpWorkbookInspectionSheet[] = [];
    const issues: GddpWorkbookPreviewIssue[] = [];

    let dataSheetFound = false;

    for (const sheet of parsed.sheets) {
      const isData = this.isGddpDataSheetName(sheet.name);
      if (isData) {
        dataSheetFound = true;
      }
      const firstRow = sheet.rows[0];
      const headers = firstRow ? firstRow.cells.map((c) => (c.text ?? '').trim()) : [];
      sheets.push({
        name: sheet.name,
        rowCount: sheet.rows.length,
        columnCount: firstRow?.cells.length ?? 0,
        headers,
        isDataSheet: isData,
      });
    }

    if (!dataSheetFound) {
      issues.push({
        severity: 'BLOCKER',
        code: 'DATA_SHEET_NOT_FOUND',
        message: "Không tìm thấy sheet dữ liệu có tên 'NHẬP GDĐP'.",
      });
    } else {
      const dataSheet = parsed.sheets.find((s) => this.isGddpDataSheetName(s.name));
      if (dataSheet) {
        const headerCheck = this.checkHeaderRow(dataSheet.rows[0]);
        if (headerCheck) {
          issues.push(headerCheck);
        }

        // Structural check: unexpected extra columns beyond column 5
        for (const row of dataSheet.rows) {
          const extraCells = row.cells.slice(5);
          const hasExtra = extraCells.some(
            (c: ParsedWorkbookCell) => c.text && c.text.trim() !== '',
          );
          if (hasExtra) {
            issues.push({
              severity: 'BLOCKER',
              code: 'EXTRA_COLUMNS_DETECTED',
              message: `Dòng ${row.number}: Phát hiện cột dữ liệu thừa vượt quá 5 cột quy chuẩn của bảng tính GDĐP.`,
              sourceRowNumber: row.number,
            });
            break;
          }
        }

        // Structural check: format validation for business rows
        const rawRows = dataSheet.rows.slice(1);
        for (const row of rawRows) {
          const sourceRowNumber = row.number;
          const isBlank = row.cells.every(
            (c: ParsedWorkbookCell) => !c.text || c.text.trim() === '',
          );
          if (isBlank) continue;

          const gradeRaw = row.cells[0]?.text;
          const ppctRaw = row.cells[1]?.text;
          const weeksRaw = row.cells[2]?.text;
          const topicRaw = row.cells[3]?.text;
          const teacherRaw = row.cells[4]?.text;

          const parsedGrade = Number(gradeRaw);
          if (![10, 11, 12].includes(parsedGrade)) {
            issues.push({
              severity: 'BLOCKER',
              code: 'UNSUPPORTED_GRADE_LEVEL',
              message: `Dòng ${sourceRowNumber}: Khối lớp bắt buộc là 10, 11 hoặc 12 (thực tế: '${String(gradeRaw ?? '')}').`,
              sourceRowNumber,
            });
          }

          const ppctParsed = this.parsePpctText(ppctRaw, sourceRowNumber);
          if (ppctParsed.issue) {
            issues.push(ppctParsed.issue);
          }

          const weeksParsed = this.parseWeeksText(weeksRaw, sourceRowNumber);
          if (weeksParsed.issue) {
            issues.push(weeksParsed.issue);
          }

          const topicTitle = String(topicRaw ?? '').trim();
          if (!topicTitle) {
            issues.push({
              severity: 'BLOCKER',
              code: 'TOPIC_TITLE_REQUIRED',
              message: `Dòng ${sourceRowNumber}: Nội dung không được để trống.`,
              sourceRowNumber,
            });
          }

          const enteredTeacherText = String(teacherRaw ?? '').trim();
          if (!enteredTeacherText) {
            issues.push({
              severity: 'BLOCKER',
              code: 'TEACHER_TEXT_REQUIRED',
              message: `Dòng ${sourceRowNumber}: Giáo viên dạy không được để trống.`,
              sourceRowNumber,
            });
          }
        }
      }
    }

    return {
      sourceFileName: this.sourceFileName(file!.originalname),
      sheets,
      dataSheetFound,
      issues,
    };
  }

  async resolveWorkbook(
    file: UploadedWorkbookFile | undefined,
    academicYearId: string,
    requestedGradeLevel?: number,
  ): Promise<ResolvedGddpWorkbookResult> {
    this.validateFile(file);
    const parsed = await this.parser.parse(file!.buffer);
    const issues: GddpWorkbookPreviewIssue[] = [];

    const dataSheet = parsed.sheets.find((s) => this.isGddpDataSheetName(s.name));
    if (!dataSheet) {
      throw new BadRequestException({
        error: 'GDDP_DATA_SHEET_NOT_FOUND',
        message: "Không tìm thấy sheet dữ liệu có tên 'NHẬP GDĐP'.",
      });
    }

    const headerIssue = this.checkHeaderRow(dataSheet.rows[0]);
    if (headerIssue) {
      issues.push(headerIssue);
    }

    // Check for unexpected extra columns
    for (const row of dataSheet.rows) {
      const extraCells = row.cells.slice(5);
      const hasExtra = extraCells.some(
        (c: ParsedWorkbookCell) => c.text && c.text.trim() !== '',
      );
      if (hasExtra) {
        issues.push({
          severity: 'BLOCKER',
          code: 'EXTRA_COLUMNS_DETECTED',
          message: `Dòng ${row.number}: Phát hiện cột dữ liệu thừa vượt quá 5 cột quy chuẩn của bảng tính GDĐP.`,
          sourceRowNumber: row.number,
        });
        break;
      }
    }

    const activeCalendars = await this.prisma.academicCalendarVersion.findMany({
      where: { academicYearId, isActive: true },
      include: {
        weeks: {
          include: {
            segments: { orderBy: [{ segmentOrder: 'asc' }, { id: 'asc' }] },
          },
        },
        interruptions: true,
      },
    });

    let calendar: (typeof activeCalendars)[0] | null = null;
    if (activeCalendars.length === 0) {
      issues.push({
        severity: 'BLOCKER',
        code: 'ACTIVE_CALENDAR_NOT_FOUND',
        message: 'Năm học chưa có lịch năm học nào đang kích hoạt.',
      });
    } else if (activeCalendars.length > 1) {
      issues.push({
        severity: 'BLOCKER',
        code: 'ACTIVE_CALENDAR_AMBIGUOUS',
        message: 'Phát hiện nhiều hơn một lịch năm học đang kích hoạt cho cùng một năm học.',
      });
    } else {
      calendar = activeCalendars[0]!;
    }

    const activeClasses = await this.prisma.schoolClass.findMany({
      where: { academicYearId, status: 'ACTIVE' },
      orderBy: [{ gradeLevel: 'asc' }, { code: 'asc' }],
    });

    const teachingUsers = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        profile: { isTeachingStaff: true },
      },
      include: { profile: true },
    });

    // Also fetch all users with a staffCode (including inactive or non-teaching) to provide accurate error reasons
    const allUsersWithStaffCode = await this.prisma.user.findMany({
      include: { profile: true },
    });

    const timeSlotDefinitions = await this.prisma.timeSlotDefinition.findMany({
      where: { academicYearId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }, { ordinal: 'asc' }],
    });

    const timeSlotMap = new Map(timeSlotDefinitions.map((s) => [s.id, s]));

    const rawRows = dataSheet.rows.slice(1);
    const parsedRows: NormalizedGddpRowData[] = [];
    const seenPpctCoordinates = new Set<number>();
    let detectedGrade: number | null = requestedGradeLevel ?? null;

    rawRows.forEach((row) => {
      const sourceRowNumber = row.number;
      const isBlank = row.cells.every(
        (c: ParsedWorkbookCell) => !c.text || c.text.trim() === '',
      );
      if (isBlank) {
        return;
      }

      const gradeRaw = row.cells[0]?.text;
      const ppctRaw = row.cells[1]?.text;
      const weeksRaw = row.cells[2]?.text;
      const topicRaw = row.cells[3]?.text;
      const teacherRaw = row.cells[4]?.text;

      let rowHasFormatError = false;

      const parsedGrade = Number(gradeRaw);
      if (![10, 11, 12].includes(parsedGrade)) {
        issues.push({
          severity: 'BLOCKER',
          code: 'UNSUPPORTED_GRADE_LEVEL',
          message: `Dòng ${sourceRowNumber}: Khối lớp không hợp lệ ('${String(gradeRaw ?? '')}'). Chỉ chấp nhận khối 10, 11 hoặc 12.`,
          sourceRowNumber,
        });
        rowHasFormatError = true;
      } else {
        if (detectedGrade === null) {
          detectedGrade = parsedGrade;
        } else if (detectedGrade !== parsedGrade) {
          issues.push({
            severity: 'BLOCKER',
            code: 'MULTIPLE_GRADES_IN_WORKBOOK',
            message: `Dòng ${sourceRowNumber}: Bảng tính chứa nhiều khối lớp khác nhau (${detectedGrade} và ${parsedGrade}). Mỗi lần nhập chỉ áp dụng cho một khối lớp.`,
            sourceRowNumber,
          });
          rowHasFormatError = true;
        }
      }

      const ppctParsed = this.parsePpctText(ppctRaw, sourceRowNumber);
      if (ppctParsed.issue) {
        issues.push(ppctParsed.issue);
        rowHasFormatError = true;
      } else if (ppctParsed.coordinates) {
        // Cross-row duplicate / overlap check across the grade programme
        const overlappingCoords = ppctParsed.coordinates.filter((c) =>
          seenPpctCoordinates.has(c),
        );
        if (overlappingCoords.length > 0) {
          issues.push({
            severity: 'BLOCKER',
            code: 'OVERLAPPING_PPCT_COORDINATES',
            message: `Dòng ${sourceRowNumber}: Tiết PPCT (${overlappingCoords.join(', ')}) bị trùng lặp hoặc chồng lấn với dòng khác trong chương trình khối.`,
            sourceRowNumber,
          });
          rowHasFormatError = true;
        } else {
          ppctParsed.coordinates.forEach((c) => seenPpctCoordinates.add(c));
        }
      }

      const weeksParsed = this.parseWeeksText(weeksRaw, sourceRowNumber);
      if (weeksParsed.issue) {
        issues.push(weeksParsed.issue);
        rowHasFormatError = true;
      }

      const topicTitle = String(topicRaw ?? '').trim();
      if (!topicTitle) {
        issues.push({
          severity: 'BLOCKER',
          code: 'TOPIC_TITLE_REQUIRED',
          message: `Dòng ${sourceRowNumber}: Nội dung không được để trống.`,
          sourceRowNumber,
        });
        rowHasFormatError = true;
      }

      const enteredTeacherText = String(teacherRaw ?? '').trim();
      if (!enteredTeacherText) {
        issues.push({
          severity: 'BLOCKER',
          code: 'TEACHER_TEXT_REQUIRED',
          message: `Dòng ${sourceRowNumber}: Giáo viên dạy không được để trống.`,
          sourceRowNumber,
        });
        rowHasFormatError = true;
      }

      const staffCodes = this.extractStaffCodes(enteredTeacherText);
      if (staffCodes.length === 0 && enteredTeacherText) {
        issues.push({
          severity: 'BLOCKER',
          code: 'TEACHER_STAFF_CODE_REQUIRED',
          message: `Dòng ${sourceRowNumber}: Không tìm thấy mã giáo viên hợp lệ trong '${enteredTeacherText}'.`,
          sourceRowNumber,
        });
        rowHasFormatError = true;
      }

      if (!rowHasFormatError && ppctParsed.coordinates && weeksParsed.weeks) {
        parsedRows.push({
          sourceRowNumber,
          gradeLevel: parsedGrade,
          ppctCoordinates: ppctParsed.coordinates,
          ppctText: String(ppctRaw ?? '').trim(),
          officialWeeks: weeksParsed.weeks,
          weeksText: String(weeksRaw ?? '').trim(),
          requiredPeriods: ppctParsed.coordinates.length,
          topicTitle,
          enteredTeacherText,
          staffCodes,
        });
      }
    });

    const targetGrade = detectedGrade;
    const previewRows: GddpWorkbookPreviewRow[] = [];
    const timetableVersionCache = new Map<
      string,
      { status: 'RESOLVED'; version: TimetableVersion } | { status: 'NOT_FOUND' } | { status: 'AMBIGUOUS' }
    >();

    // Authority evidence collectors
    const weeksEvidenceMap = new Map<number, GddpImportWeekEvidence>();
    const segmentsEvidenceMap = new Map<string, GddpImportSegmentEvidence>();
    const dateAuthorities: GddpImportDateAuthority[] = [];
    const markerEvidence: GddpImportMarkerEvidence[] = [];
    const resolvedTeacherEvidence: GddpImportResolvedTeacherEvidence[] = [];

    const resolvedTopics: ResolvedGddpTopic[] = [];
    const resolvedOccurrences: ResolvedGddpOccurrence[] = [];

    // Target classes in the detected grade
    const targetClasses = targetGrade
      ? activeClasses.filter((c) => c.gradeLevel === targetGrade)
      : [];
    if (targetGrade && targetClasses.length === 0) {
      issues.push({
        severity: 'BLOCKER',
        code: 'NO_ACTIVE_CLASSES_IN_GRADE',
        message: `Không có lớp học nào đang hoạt động thuộc khối ${targetGrade}.`,
      });
    }
    const targetClassIdSet = new Set(targetClasses.map((c) => c.id));

    for (let rowIndex = 0; rowIndex < parsedRows.length; rowIndex += 1) {
      const row = parsedRows[rowIndex]!;
      const topicSequence = rowIndex + 1;
      const rowIssues: GddpWorkbookPreviewIssue[] = [];
      const resolvedTeachers: GddpWorkbookResolvedTeacherSummary[] = [];

      resolvedTopics.push({
        sequence: topicSequence,
        title: row.topicTitle,
        requiredPeriods: row.requiredPeriods,
        guidelineWeekFrom: row.officialWeeks.length > 0 ? Math.min(...row.officialWeeks) : null,
        guidelineWeekTo: row.officialWeeks.length > 0 ? Math.max(...row.officialWeeks) : null,
        ppctCoordinates: row.ppctCoordinates,
      });

      // 1. Resolve teacher staff codes exactly
      const seenRowTokens = new Set<string>();
      const seenRowUserIds = new Set<string>();

      for (const rawToken of row.staffCodes) {
        const normToken = rawToken.trim().toLowerCase();
        if (seenRowTokens.has(normToken)) {
          const issue: GddpWorkbookPreviewIssue = {
            severity: 'BLOCKER',
            code: 'DUPLICATE_TEACHER_STAFF_CODE',
            message: `Dòng ${row.sourceRowNumber}: Mã giáo viên '${rawToken.trim()}' bị chỉ định trùng lặp trong danh sách giáo viên dạy.`,
            sourceRowNumber: row.sourceRowNumber,
            staffCode: rawToken.trim(),
          };
          rowIssues.push(issue);
          issues.push(issue);
          continue;
        }
        seenRowTokens.add(normToken);

        const match = this.resolveTeacherByStaffCode(
          rawToken,
          teachingUsers,
          allUsersWithStaffCode,
          row.sourceRowNumber,
        );
        if (match.issue) {
          rowIssues.push(match.issue);
          issues.push(match.issue);
        } else if (match.teacher) {
          if (seenRowUserIds.has(match.teacher.matchedUserId)) {
            const issue: GddpWorkbookPreviewIssue = {
              severity: 'BLOCKER',
              code: 'DUPLICATE_RESOLVED_TEACHER',
              message: `Dòng ${row.sourceRowNumber}: Giáo viên '${match.teacher.displayName}' (mã '${match.teacher.staffCode}') bị chỉ định trùng lặp nhiều lần cho cùng một dòng.`,
              sourceRowNumber: row.sourceRowNumber,
              staffCode: match.teacher.staffCode,
            };
            rowIssues.push(issue);
            issues.push(issue);
          } else {
            seenRowUserIds.add(match.teacher.matchedUserId);
            resolvedTeachers.push(match.teacher);
            resolvedTeacherEvidence.push({
              sourceRowNumber: row.sourceRowNumber,
              staffCode: match.teacher.staffCode,
              matchedUserId: match.teacher.matchedUserId,
              displayName: match.teacher.displayName,
            });
          }
        }
      }

      // 2. Resolve teaching civil dates from calendar for the declared weeks
      const civilDates: CivilDateString[] = [];
      if (calendar) {
        for (const w of row.officialWeeks) {
          const matchingWeeks = calendar.weeks.filter((item) => item.officialWeekNumber === w);
          if (matchingWeeks.length === 0) {
            const issue: GddpWorkbookPreviewIssue = {
              severity: 'BLOCKER',
              code: 'WEEK_NOT_IN_CALENDAR',
              message: `Dòng ${row.sourceRowNumber}: Tuần chính thức số ${w} không tồn tại trong lịch năm học.`,
              sourceRowNumber: row.sourceRowNumber,
            };
            rowIssues.push(issue);
            issues.push(issue);
            continue;
          }
          if (matchingWeeks.length > 1) {
            const issue: GddpWorkbookPreviewIssue = {
              severity: 'BLOCKER',
              code: 'OFFICIAL_WEEK_AMBIGUOUS',
              message: `Dòng ${row.sourceRowNumber}: Phát hiện nhiều tuần trùng số tuần chính thức ${w} trong lịch năm học.`,
              sourceRowNumber: row.sourceRowNumber,
            };
            rowIssues.push(issue);
            issues.push(issue);
            continue;
          }

          const week = matchingWeeks[0]!;
          weeksEvidenceMap.set(w, { officialWeekNumber: w, academicWeekId: week.id });

          if (week.segments.length === 0) {
            const issue: GddpWorkbookPreviewIssue = {
              severity: 'BLOCKER',
              code: 'WEEK_SEGMENTS_EMPTY',
              message: `Dòng ${row.sourceRowNumber}: Tuần số ${w} không có đoạn thời gian nào trong lịch năm học.`,
              sourceRowNumber: row.sourceRowNumber,
            };
            rowIssues.push(issue);
            issues.push(issue);
            continue;
          }

          for (const segment of week.segments) {
            segmentsEvidenceMap.set(segment.id, {
              academicWeekId: week.id,
              segmentId: segment.id,
              startDate: formatCivilDate(segment.startDate),
              endDate: formatCivilDate(segment.endDate),
            });
            const dates = this.enumerateTeachingDates(
              segment.startDate,
              segment.endDate,
              calendar.teachingWeekdays as AcademicWeekday[],
              calendar.interruptions,
            );
            civilDates.push(...dates);
          }
        }
      }

      const uniqueCivilDates = [...new Set(civilDates)].sort();
      if (uniqueCivilDates.length === 0 && calendar) {
        const issue: GddpWorkbookPreviewIssue = {
          severity: 'BLOCKER',
          code: 'NO_TEACHING_CIVIL_DATES',
          message: `Dòng ${row.sourceRowNumber}: Không tìm thấy ngày học hợp lệ nào trong các tuần được khai báo (${row.weeksText}).`,
          sourceRowNumber: row.sourceRowNumber,
        };
        rowIssues.push(issue);
        issues.push(issue);
      }

      // 3. Resolve date-effective timetable versions & retained GDDP markers
      const markersForDates: Array<{
        civilDate: CivilDateString;
        markerId: string;
        timeSlotDefinitionId: string;
        schoolClassId: string;
        timeSlot: TimeSlotDefinition;
        timetableVersionId: string;
      }> = [];

      for (const cDate of uniqueCivilDates) {
        let tvResult = timetableVersionCache.get(cDate);
        if (tvResult === undefined) {
          const targetDateObj = parseCivilDate(cDate);
          const candidateVersions = await this.prisma.timetableVersion.findMany({
            where: {
              academicYearId,
              status: { in: [TimetableVersionStatus.ACTIVE, TimetableVersionStatus.SUPERSEDED] },
              effectiveFrom: { lte: targetDateObj },
              OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: targetDateObj } }],
            },
          });
          if (candidateVersions.length === 0) {
            tvResult = { status: 'NOT_FOUND' };
          } else if (candidateVersions.length > 1) {
            tvResult = { status: 'AMBIGUOUS' };
          } else {
            tvResult = { status: 'RESOLVED', version: candidateVersions[0]! };
          }
          timetableVersionCache.set(cDate, tvResult);
        }

        if (tvResult.status === 'NOT_FOUND') {
          const issue: GddpWorkbookPreviewIssue = {
            severity: 'BLOCKER',
            code: 'TIMETABLE_VERSION_NOT_FOUND',
            message: `Dòng ${row.sourceRowNumber}: Không tìm thấy thời khóa biểu có hiệu lực tại ngày ${cDate}.`,
            sourceRowNumber: row.sourceRowNumber,
          };
          rowIssues.push(issue);
          issues.push(issue);
          continue;
        }

        if (tvResult.status === 'AMBIGUOUS') {
          const issue: GddpWorkbookPreviewIssue = {
            severity: 'BLOCKER',
            code: 'TIMETABLE_VERSION_AMBIGUOUS',
            message: `Dòng ${row.sourceRowNumber}: Phát hiện nhiều hơn một thời khóa biểu có hiệu lực tại ngày ${cDate}.`,
            sourceRowNumber: row.sourceRowNumber,
          };
          rowIssues.push(issue);
          issues.push(issue);
          continue;
        }

        const tv = tvResult.version;
        dateAuthorities.push({
          sourceRowNumber: row.sourceRowNumber,
          civilDate: cDate,
          timetableVersionId: tv.id,
        });

        // ONLY query GDDP markers; reject HDTN_HN markers
        const retainedMarkers = await this.markerService.findRetainedMarkers({
          timetableVersionId: tv.id,
          kind: 'GDDP',
        });

        const expectedWeekday = weekdayForCivilDate(parseCivilDate(cDate));

        for (const rm of retainedMarkers) {
          if (!targetClassIdSet.has(rm.schoolClassId)) {
            continue;
          }
          const slotDef = timeSlotMap.get(rm.timeSlotDefinitionId);
          if (slotDef && slotDef.weekday === expectedWeekday) {
            markersForDates.push({
              civilDate: cDate,
              markerId: rm.id,
              timeSlotDefinitionId: rm.timeSlotDefinitionId,
              schoolClassId: rm.schoolClassId,
              timeSlot: slotDef,
              timetableVersionId: tv.id,
            });
            markerEvidence.push({
              sourceRowNumber: row.sourceRowNumber,
              civilDate: cDate,
              markerId: rm.id,
              timetableVersionId: tv.id,
              schoolClassId: rm.schoolClassId,
              timeSlotDefinitionId: rm.timeSlotDefinitionId,
              kind: 'GDDP',
            });
          }
        }
      }

      // 4. Grade-level marker collapse and exact-count rule
      const slotKeys = new Map<string, { civilDate: CivilDateString; timeSlot: TimeSlotDefinition }>();
      for (const m of markersForDates.filter((m) => targetClasses.some((c) => c.id === m.schoolClassId))) {
        const key = `${m.civilDate}#${m.timeSlotDefinitionId}`;
        if (!slotKeys.has(key)) {
          slotKeys.set(key, { civilDate: m.civilDate, timeSlot: m.timeSlot });
        }
      }

      const collapsedSlots: GddpWorkbookResolvedSlot[] = [];
      const slotsByCivilDate = new Map<string, Array<{ timeSlotDefinitionId: string }>>();

      for (const [key, val] of slotKeys.entries()) {
        const [, timeSlotDefinitionId] = key.split('#');
        const coveringClasses = markersForDates.filter(
          (m) =>
            m.civilDate === val.civilDate &&
            m.timeSlotDefinitionId === timeSlotDefinitionId &&
            targetClasses.some((c) => c.id === m.schoolClassId),
        );
        const coveredClassIds = new Set(coveringClasses.map((m) => m.schoolClassId));

        if (coveredClassIds.size !== targetClasses.length) {
          const missingClassCodes = targetClasses
            .filter((c) => !coveredClassIds.has(c.id))
            .map((c) => c.code);
          const issue: GddpWorkbookPreviewIssue = {
            severity: 'BLOCKER',
            code: 'GRADE_COVERAGE_INCOMPLETE',
            message: `Dòng ${row.sourceRowNumber}: Tiết GDĐP ngày ${val.civilDate} (tiết ${val.timeSlot.ordinal}) không phủ đủ 100% các lớp trong khối ${row.gradeLevel}. Thiếu các lớp: ${missingClassCodes.join(', ')}.`,
            sourceRowNumber: row.sourceRowNumber,
          };
          rowIssues.push(issue);
          issues.push(issue);
        } else {
          collapsedSlots.push({
            civilDate: val.civilDate,
            weekday: val.timeSlot.weekday as AcademicWeekday,
            timeSlotDefinitionId: timeSlotDefinitionId!,
            periodNumber: val.timeSlot.ordinal,
            startTime: formatWallClockTime(val.timeSlot.startTime),
            endTime: formatWallClockTime(val.timeSlot.endTime),
          });
          if (!slotsByCivilDate.has(val.civilDate)) {
            slotsByCivilDate.set(val.civilDate, []);
          }
          slotsByCivilDate.get(val.civilDate)!.push({ timeSlotDefinitionId: timeSlotDefinitionId! });
        }
      }

      // Exact count rule: resolvedCandidateCount MUST equal declared PPCT count (requiredPeriods)
      if (collapsedSlots.length !== row.requiredPeriods) {
        const issue: GddpWorkbookPreviewIssue = {
          severity: 'BLOCKER',
          code: 'GRADE_PERIOD_COUNT_MISMATCH',
          message: `Dòng ${row.sourceRowNumber}: Số tiết GDĐP toàn khối sau khi gộp là ${collapsedSlots.length}, không khớp với số tiết PPCT yêu cầu là ${row.requiredPeriods}.`,
          sourceRowNumber: row.sourceRowNumber,
        };
        rowIssues.push(issue);
        issues.push(issue);
      }

      // Build planned occurrences under GRADE semantics (no class fan-out)
      const explicitTeacherIds = resolvedTeachers.map((t) => t.matchedUserId);
      for (const [civilDate, sList] of slotsByCivilDate.entries()) {
        resolvedOccurrences.push({
          topicSequence,
          civilDate,
          mode: 'GRADE',
          gradeLevel: row.gradeLevel,
          schoolClassId: null,
          slots: sList.map((s) => ({
            timeSlotDefinitionId: s.timeSlotDefinitionId,
            teacherUserIds: explicitTeacherIds,
          })),
        });
      }

      const previewRowSlots = this.sortResolvedSlots(collapsedSlots);

      previewRows.push({
        sourceRowNumber: row.sourceRowNumber,
        gradeLevel: row.gradeLevel,
        ppctCoordinates: row.ppctCoordinates,
        ppctText: row.ppctText,
        officialWeeks: row.officialWeeks,
        weeksText: row.weeksText,
        requiredPeriods: row.requiredPeriods,
        topicTitle: row.topicTitle,
        enteredTeacherText: row.enteredTeacherText,
        resolvedTeachers,
        targetClassCodes: targetClasses.map((c) => c.code),
        resolvedCandidateCount: collapsedSlots.length,
        slots: previewRowSlots,
        issues: rowIssues,
      });
    }

    const authorityEvidence: GddpImportAuthorityEvidence = {
      academicYearId,
      gradeLevel: targetGrade ?? 10,
      calendar: {
        calendarVersionId: calendar?.id ?? '',
        teachingWeekdays: (calendar?.teachingWeekdays ?? []) as AcademicWeekday[],
        interruptions: (calendar?.interruptions ?? [])
          .map((i) => ({
            id: i.id,
            code: i.code,
            name: i.name,
            startDate: formatCivilDate(i.startDate),
            endDate: formatCivilDate(i.endDate),
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      },
      weeks: Array.from(weeksEvidenceMap.values()),
      segments: Array.from(segmentsEvidenceMap.values()),
      targetClassIds: targetClasses.map((c) => c.id),
      dateAuthorities,
      markerEvidence,
      resolvedTeachers: resolvedTeacherEvidence,
    };

    const blockingIssueCount = issues.filter((i) => i.severity === 'BLOCKER').length;
    const warningCount = issues.filter((i) => i.severity === 'WARNING').length;
    const canConfirm = parsedRows.length > 0 && blockingIssueCount === 0;

    const resolvedPackage: ResolvedGddpDraftPackage = {
      academicYearId,
      gradeLevel: targetGrade ?? 10,
      previewFingerprint: '',
      topics: resolvedTopics,
      occurrences: resolvedOccurrences,
    };

    const previewFingerprint = this.computePreviewFingerprint(
      academicYearId,
      targetGrade ?? 10,
      parsedRows,
      authorityEvidence,
      resolvedPackage,
    );

    resolvedPackage.previewFingerprint = previewFingerprint;

    const preview: GddpWorkbookPreviewResponse = {
      sourceFileName: this.sourceFileName(file!.originalname),
      sheetName: dataSheet.name,
      academicYearId,
      gradeLevel: targetGrade,
      calendarVersionId: calendar?.id ?? '',
      previewFingerprint,
      canConfirm,
      blockingIssueCount,
      warningCount,
      totalRows: parsedRows.length,
      rows: previewRows,
      issues,
    };

    return {
      preview,
      resolvedPackage,
      authorityEvidence,
    };
  }

  async preview(
    file: UploadedWorkbookFile | undefined,
    academicYearId: string,
    requestedGradeLevel?: number,
  ): Promise<GddpWorkbookPreviewResponse> {
    const resolved = await this.resolveWorkbook(file, academicYearId, requestedGradeLevel);
    return resolved.preview;
  }

  async confirm(
    file: UploadedWorkbookFile | undefined,
    academicYearId: string,
    gradeLevel: number,
    expectedPreviewFingerprint: string,
    commandId: string,
    actorUserId: string,
    bootstrapContext: GddpImportBootstrapContext = {
      expectedProgrammeMasterId: null,
      canBootstrapMaster: false,
    },
  ): Promise<GddpWorkbookConfirmResponse> {
    const resolved = await this.resolveWorkbook(file, academicYearId, gradeLevel);

    if (resolved.preview.previewFingerprint !== expectedPreviewFingerprint) {
      throw new ConflictException({
        error: 'GDDP_IMPORT_STALE_PREVIEW',
        message:
          'Dữ liệu thời khóa biểu, lịch năm học hoặc phân công giáo viên đã thay đổi kể từ khi xem trước; vui lòng tải lại bản xem trước.',
      });
    }

    if (!resolved.preview.canConfirm || resolved.preview.blockingIssueCount > 0) {
      throw new ConflictException({
        error: 'GDDP_IMPORT_HAS_BLOCKERS',
        message: 'Workbook chứa lỗi chặn (blocker), không thể xác nhận import.',
      });
    }

    return this.planningService.importGddpDraftPackage(
      actorUserId,
      commandId,
      resolved.resolvedPackage,
      bootstrapContext,
      resolved.authorityEvidence,
    );
  }

  private isGddpDataSheetName(name: string): boolean {
    const norm = name.trim().normalize('NFC').toUpperCase();
    return norm === 'NHẬP GDĐP' || norm === 'NHẬP GDDP';
  }

  private checkHeaderRow(row: ParsedWorkbookRow | undefined): GddpWorkbookPreviewIssue | null {
    if (!row || row.cells.length < EXPECTED_HEADERS.length) {
      return {
        severity: 'BLOCKER',
        code: 'HEADER_MISMATCH',
        message:
          'Tiêu đề cột không đúng định dạng chuẩn GDĐP. Bắt buộc đúng thứ tự: Khối, Tiết PPCT, Tuần dạy, Nội dung, Giáo viên dạy.',
      };
    }

    for (let i = 0; i < EXPECTED_HEADERS.length; i += 1) {
      const cell = String(row.cells[i]?.text ?? '').trim().normalize('NFC');
      const expected = EXPECTED_HEADERS[i]!.normalize('NFC');
      if (cell.toLowerCase() !== expected.toLowerCase()) {
        return {
          severity: 'BLOCKER',
          code: 'HEADER_MISMATCH',
          message: `Cột số ${i + 1} phải là '${expected}' (thực tế nhận được '${cell}').`,
        };
      }
    }

    return null;
  }

  private parsePpctText(
    text: string | null | undefined,
    sourceRowNumber: number,
  ): { coordinates?: number[]; issue?: GddpWorkbookPreviewIssue } {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) {
      return {
        issue: {
          severity: 'BLOCKER',
          code: 'PPCT_TEXT_REQUIRED',
          message: `Dòng ${sourceRowNumber}: Tiết PPCT không được để trống.`,
          sourceRowNumber,
        },
      };
    }

    // Split by comma or semicolon
    const tokens = trimmed.split(/[,;]/).map((t) => t.trim()).filter((t) => t.length > 0);
    if (tokens.length === 0) {
      return {
        issue: {
          severity: 'BLOCKER',
          code: 'MALFORMED_PPCT',
          message: `Dòng ${sourceRowNumber}: Định dạng Tiết PPCT không hợp lệ ('${trimmed}').`,
          sourceRowNumber,
        },
      };
    }

    const coordinates: number[] = [];

    for (const token of tokens) {
      // Range check: e.g. "1-3" or "1 - 3" or "1..3"
      const rangeMatch = token.match(/^(\d+)\s*(?:[-–—]|\.\.)\s*(\d+)$/u);
      if (rangeMatch) {
        const start = Number(rangeMatch[1]);
        const end = Number(rangeMatch[2]);
        if (start < 1 || end < 1 || start > end) {
          return {
            issue: {
              severity: 'BLOCKER',
              code: 'MALFORMED_PPCT',
              message: `Dòng ${sourceRowNumber}: Khoảng Tiết PPCT '${token}' không hợp lệ. Số tiết phải dương và tăng dần.`,
              sourceRowNumber,
            },
          };
        }
        for (let num = start; num <= end; num += 1) {
          coordinates.push(num);
        }
        continue;
      }

      // Single positive integer
      const singleMatch = token.match(/^(\d+)$/u);
      if (singleMatch) {
        const num = Number(singleMatch[1]);
        if (num < 1) {
          return {
            issue: {
              severity: 'BLOCKER',
              code: 'MALFORMED_PPCT',
              message: `Dòng ${sourceRowNumber}: Tiết PPCT phải là số nguyên dương (thực tế: ${num}).`,
              sourceRowNumber,
            },
          };
        }
        coordinates.push(num);
        continue;
      }

      // If token is anything else, reject as malformed
      return {
        issue: {
          severity: 'BLOCKER',
          code: 'MALFORMED_PPCT',
          message: `Dòng ${sourceRowNumber}: Tiết PPCT '${token}' không hợp lệ. Chỉ chấp nhận số nguyên dương hoặc khoảng số nguyên.`,
          sourceRowNumber,
        },
      };
    }

    // Check duplicates and strictly ascending order within the row
    for (let i = 1; i < coordinates.length; i += 1) {
      if (coordinates[i]! <= coordinates[i - 1]!) {
        if (coordinates[i]! === coordinates[i - 1]!) {
          return {
            issue: {
              severity: 'BLOCKER',
              code: 'DUPLICATE_PPCT_COORDINATES',
              message: `Dòng ${sourceRowNumber}: Tiết PPCT bị trùng lặp số tiết (${coordinates[i]}).`,
              sourceRowNumber,
            },
          };
        }
        return {
          issue: {
            severity: 'BLOCKER',
            code: 'PPCT_NOT_ORDERED',
            message: `Dòng ${sourceRowNumber}: Các tiết PPCT phải theo thứ tự tăng dần (${coordinates.join(', ')}).`,
            sourceRowNumber,
          },
        };
      }
    }

    return { coordinates };
  }

  private parseWeeksText(
    text: string | null | undefined,
    sourceRowNumber: number,
  ): { weeks?: number[]; issue?: GddpWorkbookPreviewIssue } {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) {
      return {
        issue: {
          severity: 'BLOCKER',
          code: 'WEEKS_REQUIRED',
          message: `Dòng ${sourceRowNumber}: Tuần dạy không được để trống.`,
          sourceRowNumber,
        },
      };
    }

    const tokens = trimmed.split(/[,;]/).map((t) => t.trim()).filter((t) => t.length > 0);
    if (tokens.length === 0) {
      return {
        issue: {
          severity: 'BLOCKER',
          code: 'INVALID_WEEKS',
          message: `Dòng ${sourceRowNumber}: Định dạng Tuần dạy không hợp lệ ('${trimmed}').`,
          sourceRowNumber,
        },
      };
    }

    const weeks: number[] = [];

    for (const token of tokens) {
      const rangeMatch = token.match(/^(\d+)\s*(?:[-–—]|\.\.)\s*(\d+)$/u);
      if (rangeMatch) {
        const start = Number(rangeMatch[1]);
        const end = Number(rangeMatch[2]);
        if (start < 1 || end < 1 || start > end) {
          return {
            issue: {
              severity: 'BLOCKER',
              code: 'INVALID_WEEKS',
              message: `Dòng ${sourceRowNumber}: Khoảng tuần dạy '${token}' không hợp lệ.`,
              sourceRowNumber,
            },
          };
        }
        for (let num = start; num <= end; num += 1) {
          weeks.push(num);
        }
        continue;
      }

      const singleMatch = token.match(/^(\d+)$/u);
      if (singleMatch) {
        const num = Number(singleMatch[1]);
        if (num < 1) {
          return {
            issue: {
              severity: 'BLOCKER',
              code: 'INVALID_WEEKS',
              message: `Dòng ${sourceRowNumber}: Tuần dạy phải là số nguyên dương (thực tế: ${num}).`,
              sourceRowNumber,
            },
          };
        }
        weeks.push(num);
        continue;
      }

      return {
        issue: {
          severity: 'BLOCKER',
          code: 'INVALID_WEEKS',
          message: `Dòng ${sourceRowNumber}: Tuần dạy '${token}' không hợp lệ. Chỉ chấp nhận số nguyên dương hoặc danh sách tuần.`,
          sourceRowNumber,
        },
      };
    }

    // Deduplicate preserving declaration order
    const uniqueWeeks = [...new Set(weeks)];
    return { weeks: uniqueWeeks };
  }

  private extractStaffCodes(text: string): string[] {
    return text
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  private resolveTeacherByStaffCode(
    code: string,
    teachingUsers: Array<{
      id: string;
      status: string;
      profile: { displayName: string; staffCode: string | null; isTeachingStaff: boolean } | null;
    }>,
    allUsersWithStaffCode: Array<{
      id: string;
      status: string;
      profile: { displayName: string; staffCode: string | null; isTeachingStaff: boolean } | null;
    }>,
    sourceRowNumber: number,
  ): { teacher?: GddpWorkbookResolvedTeacherSummary; issue?: GddpWorkbookPreviewIssue } {
    const normalizedTarget = code.trim().toLowerCase();

    const matchedTeaching = teachingUsers.filter((u) => {
      if (!u.profile?.staffCode) return false;
      return u.profile.staffCode.trim().toLowerCase() === normalizedTarget;
    });

    if (matchedTeaching.length === 1) {
      const user = matchedTeaching[0]!;
      return {
        teacher: {
          staffCode: user.profile!.staffCode!,
          matchedUserId: user.id,
          displayName: user.profile!.displayName,
        },
      };
    }

    if (matchedTeaching.length > 1) {
      return {
        issue: {
          severity: 'BLOCKER',
          code: 'TEACHER_STAFF_CODE_AMBIGUOUS',
          message: `Dòng ${sourceRowNumber}: Phát hiện nhiều hơn một giáo viên giảng dạy trùng mã nhân sự '${code}'.`,
          sourceRowNumber,
          staffCode: code,
        },
      };
    }

    // Check if user exists in all users with this staffCode (could be inactive or non-teaching)
    const anyMatched = allUsersWithStaffCode.filter((u) => {
      if (!u.profile?.staffCode) return false;
      return u.profile.staffCode.trim().toLowerCase() === normalizedTarget;
    });

    if (anyMatched.length > 0) {
      const inactiveOrIneligible = anyMatched[0]!;
      return {
        issue: {
          severity: 'BLOCKER',
          code: 'TEACHER_INACTIVE_OR_INELIGIBLE',
          message: `Dòng ${sourceRowNumber}: Giáo viên với mã '${code}' (${inactiveOrIneligible.profile?.displayName ?? 'không tên'}) không ở trạng thái ACTIVE hoặc không phải nhân sự giảng dạy hợp lệ.`,
          sourceRowNumber,
          staffCode: code,
        },
      };
    }

    return {
      issue: {
        severity: 'BLOCKER',
        code: 'TEACHER_STAFF_CODE_NOT_FOUND',
        message: `Dòng ${sourceRowNumber}: Không tìm thấy giáo viên với mã nhân sự '${code}' trong danh sách nhân sự giảng dạy.`,
        sourceRowNumber,
        staffCode: code,
      },
    };
  }

  private enumerateTeachingDates(
    startDate: Date,
    endDate: Date,
    teachingWeekdays: AcademicWeekday[],
    interruptions: Array<{ startDate: Date; endDate: Date }>,
  ): CivilDateString[] {
    const results: CivilDateString[] = [];
    const current = new Date(startDate.getTime());
    const end = new Date(endDate.getTime());

    while (current <= end) {
      const weekday = weekdayForCivilDate(current);
      if (teachingWeekdays.includes(weekday)) {
        const isInterrupted = interruptions.some((inter) => {
          return current >= inter.startDate && current <= inter.endDate;
        });
        if (!isInterrupted) {
          results.push(formatCivilDate(current));
        }
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return results;
  }

  private sortResolvedSlots(slots: GddpWorkbookResolvedSlot[]): GddpWorkbookResolvedSlot[] {
    return slots.sort((a, b) => {
      if (a.civilDate !== b.civilDate) {
        return a.civilDate.localeCompare(b.civilDate);
      }
      const startA = a.startTime ?? '';
      const startB = b.startTime ?? '';
      if (startA !== startB) {
        return startA.localeCompare(startB);
      }
      const ordA = a.periodNumber ?? 0;
      const ordB = b.periodNumber ?? 0;
      if (ordA !== ordB) {
        return ordA - ordB;
      }
      return a.timeSlotDefinitionId.localeCompare(b.timeSlotDefinitionId);
    });
  }

  private computePreviewFingerprint(
    academicYearId: string,
    gradeLevel: number,
    parsedRows: NormalizedGddpRowData[],
    evidence: GddpImportAuthorityEvidence,
    resolvedPackage: ResolvedGddpDraftPackage,
  ): string {
    const payload = {
      academicYearId,
      gradeLevel,
      calendarVersionId: evidence.calendar.calendarVersionId,
      calendarTeachingWeekdays: [...(evidence.calendar.teachingWeekdays ?? [])],
      calendarInterruptions: [
        ...new Set(
          (evidence.calendar.interruptions ?? []).map(
            (i) => `${i.id}#${i.code}#${i.name}#${i.startDate}#${i.endDate}`,
          ),
        ),
      ].sort(),
      resolvedTeachers: [
        ...new Set(
          (evidence.resolvedTeachers ?? []).map(
            (t) => `${t.sourceRowNumber}#${t.staffCode.toLowerCase()}#${t.matchedUserId}#${t.displayName}`,
          ),
        ),
      ].sort(),
      normalizedRows: parsedRows.map((r) => ({
        sourceRowNumber: r.sourceRowNumber,
        gradeLevel: r.gradeLevel,
        ppctCoordinates: [...r.ppctCoordinates],
        officialWeeks: [...r.officialWeeks],
        requiredPeriods: r.requiredPeriods,
        topicTitle: r.topicTitle,
        enteredTeacherText: r.enteredTeacherText,
      })),
      weeks: [
        ...new Set(
          (evidence.weeks ?? []).map((w) => `${w.officialWeekNumber}#${w.academicWeekId}`),
        ),
      ].sort(),
      segments: [
        ...new Set(
          (evidence.segments ?? []).map(
            (s) => `${s.academicWeekId}#${s.segmentId}#${s.startDate}#${s.endDate}`,
          ),
        ),
      ].sort(),
      targetClassIds: [...evidence.targetClassIds].sort(),
      dateAuthorities: [
        ...new Set(
          (evidence.dateAuthorities ?? []).map(
            (d) => `${d.sourceRowNumber}#${d.civilDate}#${d.timetableVersionId}`,
          ),
        ),
      ].sort(),
      markerEvidence: [
        ...new Set(
          (evidence.markerEvidence ?? []).map(
            (m) =>
              `${m.sourceRowNumber}#${m.civilDate}#${m.markerId}#${m.timetableVersionId}#${m.schoolClassId}#${m.timeSlotDefinitionId}#${m.kind}`,
          ),
        ),
      ].sort(),
      resultingPackage: {
        topics: resolvedPackage.topics.map((t) => ({
          sequence: t.sequence,
          title: t.title,
          requiredPeriods: t.requiredPeriods,
          guidelineWeekFrom: t.guidelineWeekFrom ?? null,
          guidelineWeekTo: t.guidelineWeekTo ?? null,
          ppctCoordinates: [...t.ppctCoordinates],
        })),
        occurrences: resolvedPackage.occurrences
          .map((o) => ({
            topicSequence: o.topicSequence,
            civilDate: o.civilDate,
            mode: o.mode,
            gradeLevel: o.gradeLevel,
            slots: o.slots
              .map((s) => ({
                timeSlotDefinitionId: s.timeSlotDefinitionId,
                teacherUserIds: [...s.teacherUserIds].sort(),
              }))
              .sort((a, b) => a.timeSlotDefinitionId.localeCompare(b.timeSlotDefinitionId)),
          }))
          .sort((a, b) => {
            if (a.topicSequence !== b.topicSequence) return a.topicSequence - b.topicSequence;
            if (a.civilDate !== b.civilDate) return a.civilDate.localeCompare(b.civilDate);
            return (a.gradeLevel ?? 0) - (b.gradeLevel ?? 0);
          }),
      },
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private sourceFileName(value: string): string {
    const leaf = value.replaceAll('\\', '/').split('/').at(-1) ?? '';
    const safe = [...leaf]
      .filter((char) => {
        const code = char.codePointAt(0) ?? 0;
        return code > 31 && code !== 127;
      })
      .join('');
    return safe.slice(0, 255) || 'gddp_workbook.xlsx';
  }
}
