import {
  BadRequestException,
  ConflictException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  AcademicWeekday,
  SchoolClass,
  TimeSlotDefinition,
  TimetableVersion,
  TimetableVersionStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  CivilDateString,
  HdtnWorkbookConfirmResponse,
  HdtnWorkbookInspectionResponse,
  HdtnWorkbookInspectionSheet,
  HdtnWorkbookOrganizingScope,
  HdtnWorkbookPreviewIssue,
  HdtnWorkbookPreviewResponse,
  HdtnWorkbookPreviewRow,
  HdtnWorkbookResolvedSlot,
  HdtnWorkbookResolvedTeacherSummary,
} from '@baogiang/contracts';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { classifyHomeroomResolutionRows } from '../homeroom-assignments/homeroom-assignments.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimetableSpecialProgrammeMarkerService } from '../timetables/timetable-special-programme-marker.service';
import { WorkbookParserService } from '../timetable-import/workbook-parser.service';
import { ParsedWorkbookCell, ParsedWorkbookRow } from '../timetable-import/workbook-parser.types';
import { MAX_XLSX_BYTES } from '../timetable-import/workbook-limits';
import { formatWallClockTime } from '../time-slots/wall-clock-time';
import {
  HdtnImportAuthorityEvidence,
  HdtnImportBootstrapContext,
  ProgrammePlanningService,
  ResolvedHdtnDraftPackage,
  ResolvedHdtnOccurrence,
  ResolvedHdtnTopic,
  weekdayForCivilDate,
} from './programme-planning.service';

export type {
  HdtnImportAuthorityEvidence,
  HdtnImportBootstrapContext,
  ResolvedHdtnDraftPackage,
  ResolvedHdtnOccurrence,
  ResolvedHdtnTopic,
};

export interface UploadedWorkbookFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ResolvedWorkbookResult {
  preview: HdtnWorkbookPreviewResponse;
  resolvedPackage: ResolvedHdtnDraftPackage;
  authorityEvidence: HdtnImportAuthorityEvidence;
}

const EXPECTED_HEADERS = [
  'Tuần từ',
  'Tuần đến',
  'Số tiết',
  'Quy mô tổ chức',
  'Khối',
  'Chủ đề',
  'Người thực hiện',
] as const;

interface NormalizedRowData {
  sourceRowNumber: number;
  weekFrom: number;
  weekTo: number;
  requiredPeriods: number;
  organizingScope: HdtnWorkbookOrganizingScope;
  organizingScopeLabel: string;
  gradeLevel: number | null;
  topicTitle: string;
  enteredTeacherText: string;
}

@Injectable()
export class HdtnWorkbookImporterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: WorkbookParserService,
    private readonly markerService: TimetableSpecialProgrammeMarkerService,
    private readonly planningService: ProgrammePlanningService,
  ) {}

  validateFile(file: UploadedWorkbookFile | undefined): void {
    if (!file) {
      throw new BadRequestException({
        error: 'HDTN_IMPORT_FILE_REQUIRED',
        message: 'Tệp bảng tính Excel (.xlsx) là bắt buộc.',
      });
    }
    if (file.size > MAX_XLSX_BYTES) {
      throw new PayloadTooLargeException({
        error: 'HDTN_IMPORT_FILE_TOO_LARGE',
        message: 'Kích thước tệp Excel vượt quá giới hạn 8 MiB.',
      });
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new UnsupportedMediaTypeException({
        error: 'HDTN_IMPORT_UNSUPPORTED_FILE_TYPE',
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
        error: 'HDTN_IMPORT_UNSUPPORTED_FILE_TYPE',
        message: 'Loại tệp phương tiện (MIME type) không được hỗ trợ.',
      });
    }
  }

  async inspect(
    file: UploadedWorkbookFile | undefined,
  ): Promise<HdtnWorkbookInspectionResponse> {
    this.validateFile(file);
    const parsed = await this.parser.parse(file!.buffer);
    const sheets: HdtnWorkbookInspectionSheet[] = [];
    const issues: HdtnWorkbookPreviewIssue[] = [];

    let dataSheetFound = false;

    for (const sheet of parsed.sheets) {
      const isData = this.isHdtnDataSheetName(sheet.name);
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
        message: "Không tìm thấy sheet dữ liệu có tên 'NHẬP HĐTN-HN'.",
      });
    } else {
      const dataSheet = parsed.sheets.find((s) => this.isHdtnDataSheetName(s.name));
      if (dataSheet) {
        const headerCheck = this.checkHeaderRow(dataSheet.rows[0]);
        if (headerCheck) {
          issues.push(headerCheck);
        }

        // Structural check: unexpected extra columns beyond column 7
        for (const row of dataSheet.rows) {
          const extraCells = row.cells.slice(7);
          const hasExtra = extraCells.some(
            (c: ParsedWorkbookCell) => c.text && c.text.trim() !== '',
          );
          if (hasExtra) {
            issues.push({
              severity: 'BLOCKER',
              code: 'EXTRA_COLUMNS_DETECTED',
              message: `Dòng ${row.number}: Phát hiện cột dữ liệu thừa vượt quá 7 cột quy chuẩn của bảng tính HĐTN-HN.`,
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

          const weekFromRaw = row.cells[0]?.text;
          const weekToRaw = row.cells[1]?.text;
          const periodsRaw = row.cells[2]?.text;
          const scopeRaw = row.cells[3]?.text;
          const gradeRaw = row.cells[4]?.text;
          const topicRaw = row.cells[5]?.text;
          const teacherRaw = row.cells[6]?.text;

          const weekFrom = Number(weekFromRaw);
          const weekTo = Number(weekToRaw);
          const requiredPeriods = Number(periodsRaw);

          if (
            !Number.isInteger(weekFrom) ||
            weekFrom < 1 ||
            !Number.isInteger(weekTo) ||
            weekTo < 1 ||
            weekFrom > weekTo
          ) {
            issues.push({
              severity: 'BLOCKER',
              code: 'INVALID_WEEK_RANGE',
              message: `Dòng ${sourceRowNumber}: Khoảng tuần không hợp lệ (${String(weekFromRaw)} - ${String(weekToRaw)}). Tuần phải là số nguyên dương và Tuần từ <= Tuần đến.`,
              sourceRowNumber,
            });
          }

          if (!Number.isInteger(requiredPeriods) || requiredPeriods < 1) {
            issues.push({
              severity: 'BLOCKER',
              code: 'INVALID_REQUIRED_PERIODS',
              message: `Dòng ${sourceRowNumber}: Số tiết phải là số nguyên dương (${String(periodsRaw)}).`,
              sourceRowNumber,
            });
          }

          const scopeNorm = String(scopeRaw ?? '').trim().normalize('NFC');
          if (!['Theo lớp', 'Theo khối', 'Toàn trường'].includes(scopeNorm)) {
            issues.push({
              severity: 'BLOCKER',
              code: 'INVALID_ORGANIZING_SCOPE',
              message: `Dòng ${sourceRowNumber}: Quy mô tổ chức '${scopeNorm}' không hợp lệ. Chỉ chấp nhận: 'Theo lớp', 'Theo khối', 'Toàn trường'.`,
              sourceRowNumber,
            });
          } else if (scopeNorm === 'Theo lớp' || scopeNorm === 'Theo khối') {
            const parsedGrade = Number(gradeRaw);
            if (![10, 11, 12].includes(parsedGrade)) {
              issues.push({
                severity: 'BLOCKER',
                code: 'INVALID_GRADE_LEVEL',
                message: `Dòng ${sourceRowNumber}: Khối lớp bắt buộc là 10, 11 hoặc 12 đối với quy mô '${scopeNorm}'.`,
                sourceRowNumber,
              });
            }
          }

          const topicTitle = String(topicRaw ?? '').trim();
          if (!topicTitle) {
            issues.push({
              severity: 'BLOCKER',
              code: 'TOPIC_TITLE_REQUIRED',
              message: `Dòng ${sourceRowNumber}: Tên chủ đề không được để trống.`,
              sourceRowNumber,
            });
          }

          const enteredTeacherText = String(teacherRaw ?? '').trim();
          if (!enteredTeacherText) {
            issues.push({
              severity: 'BLOCKER',
              code: 'TEACHER_TEXT_REQUIRED',
              message: `Dòng ${sourceRowNumber}: Người thực hiện không được để trống.`,
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
  ): Promise<ResolvedWorkbookResult> {
    this.validateFile(file);
    const parsed = await this.parser.parse(file!.buffer);
    const issues: HdtnWorkbookPreviewIssue[] = [];

    const dataSheet = parsed.sheets.find((s) => this.isHdtnDataSheetName(s.name));
    if (!dataSheet) {
      throw new BadRequestException({
        error: 'HDTN_DATA_SHEET_NOT_FOUND',
        message: "Không tìm thấy sheet dữ liệu có tên 'NHẬP HĐTN-HN'.",
      });
    }

    const headerIssue = this.checkHeaderRow(dataSheet.rows[0]);
    if (headerIssue) {
      issues.push(headerIssue);
    }

    // Check for unexpected extra columns
    for (const row of dataSheet.rows) {
      const extraCells = row.cells.slice(7);
      const hasExtra = extraCells.some(
        (c: ParsedWorkbookCell) => c.text && c.text.trim() !== '',
      );
      if (hasExtra) {
        issues.push({
          severity: 'BLOCKER',
          code: 'EXTRA_COLUMNS_DETECTED',
          message: `Dòng ${row.number}: Phát hiện cột dữ liệu thừa vượt quá 7 cột quy chuẩn của bảng tính HĐTN-HN.`,
          sourceRowNumber: row.number,
        });
        break;
      }
    }

    const calendar = await this.prisma.academicCalendarVersion.findFirst({
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

    if (!calendar) {
      issues.push({
        severity: 'BLOCKER',
        code: 'ACTIVE_CALENDAR_NOT_FOUND',
        message: 'Năm học chưa có lịch năm học nào đang kích hoạt.',
      });
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

    const timeSlotDefinitions = await this.prisma.timeSlotDefinition.findMany({
      where: { academicYearId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }, { ordinal: 'asc' }],
    });

    const timeSlotMap = new Map(timeSlotDefinitions.map((s) => [s.id, s]));

    const rawRows = dataSheet.rows.slice(1);
    const parsedRows: NormalizedRowData[] = [];

    rawRows.forEach((row) => {
      const sourceRowNumber = row.number;
      const isBlank = row.cells.every(
        (c: ParsedWorkbookCell) => !c.text || c.text.trim() === '',
      );
      if (isBlank) {
        return;
      }

      const weekFromRaw = row.cells[0]?.text;
      const weekToRaw = row.cells[1]?.text;
      const periodsRaw = row.cells[2]?.text;
      const scopeRaw = row.cells[3]?.text;
      const gradeRaw = row.cells[4]?.text;
      const topicRaw = row.cells[5]?.text;
      const teacherRaw = row.cells[6]?.text;

      const weekFrom = Number(weekFromRaw);
      const weekTo = Number(weekToRaw);
      const requiredPeriods = Number(periodsRaw);

      let rowHasFormatError = false;

      if (
        !Number.isInteger(weekFrom) ||
        weekFrom < 1 ||
        !Number.isInteger(weekTo) ||
        weekTo < 1 ||
        weekFrom > weekTo
      ) {
        issues.push({
          severity: 'BLOCKER',
          code: 'INVALID_WEEK_RANGE',
          message: `Dòng ${sourceRowNumber}: Khoảng tuần không hợp lệ (${String(weekFromRaw)} - ${String(weekToRaw)}). Tuần phải là số nguyên dương và Tuần từ <= Tuần đến.`,
          sourceRowNumber,
        });
        rowHasFormatError = true;
      }

      if (!Number.isInteger(requiredPeriods) || requiredPeriods < 1) {
        issues.push({
          severity: 'BLOCKER',
          code: 'INVALID_REQUIRED_PERIODS',
          message: `Dòng ${sourceRowNumber}: Số tiết phải là số nguyên dương (${String(periodsRaw)}).`,
          sourceRowNumber,
        });
        rowHasFormatError = true;
      }

      const scopeNorm = String(scopeRaw ?? '').trim().normalize('NFC');
      let organizingScope: HdtnWorkbookOrganizingScope | null = null;
      const organizingScopeLabel = scopeNorm;
      if (scopeNorm === 'Theo lớp') {
        organizingScope = 'CLASS';
      } else if (scopeNorm === 'Theo khối') {
        organizingScope = 'GRADE';
      } else if (scopeNorm === 'Toàn trường') {
        organizingScope = 'SCHOOL_WIDE';
      } else {
        issues.push({
          severity: 'BLOCKER',
          code: 'INVALID_ORGANIZING_SCOPE',
          message: `Dòng ${sourceRowNumber}: Quy mô tổ chức '${scopeNorm}' không hợp lệ. Chỉ chấp nhận: 'Theo lớp', 'Theo khối', 'Toàn trường'.`,
          sourceRowNumber,
        });
        rowHasFormatError = true;
      }

      let gradeLevel: number | null = null;
      if (organizingScope === 'CLASS' || organizingScope === 'GRADE') {
        const parsedGrade = Number(gradeRaw);
        if (![10, 11, 12].includes(parsedGrade)) {
          issues.push({
            severity: 'BLOCKER',
            code: 'INVALID_GRADE_LEVEL',
            message: `Dòng ${sourceRowNumber}: Khối lớp bắt buộc là 10, 11 hoặc 12 đối với quy mô '${organizingScopeLabel}'.`,
            sourceRowNumber,
          });
          rowHasFormatError = true;
        } else {
          gradeLevel = parsedGrade;
        }
      }

      const topicTitle = String(topicRaw ?? '').trim();
      if (!topicTitle) {
        issues.push({
          severity: 'BLOCKER',
          code: 'TOPIC_TITLE_REQUIRED',
          message: `Dòng ${sourceRowNumber}: Tên chủ đề không được để trống.`,
          sourceRowNumber,
        });
        rowHasFormatError = true;
      }

      const enteredTeacherText = String(teacherRaw ?? '').trim();
      if (!enteredTeacherText) {
        issues.push({
          severity: 'BLOCKER',
          code: 'TEACHER_TEXT_REQUIRED',
          message: `Dòng ${sourceRowNumber}: Người thực hiện không được để trống.`,
          sourceRowNumber,
        });
        rowHasFormatError = true;
      }

      if (!rowHasFormatError && organizingScope) {
        parsedRows.push({
          sourceRowNumber,
          weekFrom,
          weekTo,
          requiredPeriods,
          organizingScope,
          organizingScopeLabel,
          gradeLevel,
          topicTitle,
          enteredTeacherText,
        });
      }
    });

    const previewRows: HdtnWorkbookPreviewRow[] = [];
    const timetableVersionCache = new Map<string, TimetableVersion | null>();

    // Authority Evidence collectors
    const academicWeekIds = new Set<string>();
    const academicWeekSegmentIds = new Set<string>();
    const segmentDateRanges: Array<{ segmentId: string; startDate: string; endDate: string }> = [];
    const targetClassIds = new Set<string>();
    const timetableVersionIds = new Set<string>();
    const timeSlotDefinitionIds = new Set<string>();
    const explicitTeacherUserIds = new Set<string>();
    const homeroomAssignments: Array<{
      civilDate: string;
      schoolClassId: string;
      homeroomAssignmentId: string;
      teacherUserId: string;
    }> = [];
    const markerTuples: Array<{
      timetableVersionId: string;
      schoolClassId: string;
      timeSlotDefinitionId: string;
      kind: string;
      civilDate: string;
    }> = [];

    const resolvedTopics: ResolvedHdtnTopic[] = [];
    const resolvedOccurrences: ResolvedHdtnOccurrence[] = [];

    for (let rowIndex = 0; rowIndex < parsedRows.length; rowIndex += 1) {
      const row = parsedRows[rowIndex]!;
      const topicSequence = rowIndex + 1;
      const rowIssues: HdtnWorkbookPreviewIssue[] = [];
      const resolvedTeachers: HdtnWorkbookResolvedTeacherSummary[] = [];

      resolvedTopics.push({
        sequence: topicSequence,
        title: row.topicTitle,
        requiredPeriods: row.requiredPeriods,
        guidelineWeekFrom: row.weekFrom,
        guidelineWeekTo: row.weekTo,
      });

      // 1. Resolve teacher identity
      if (row.organizingScope === 'CLASS') {
        const normalizedTeacher = row.enteredTeacherText.normalize('NFC').trim().toUpperCase();
        if (normalizedTeacher !== 'GVCN') {
          const issue: HdtnWorkbookPreviewIssue = {
            severity: 'BLOCKER',
            code: 'CLASS_GVCN_SENTINEL_REQUIRED',
            message: `Dòng ${row.sourceRowNumber}: Quy mô 'Theo lớp' bắt buộc 'Người thực hiện' phải là 'GVCN'.`,
            sourceRowNumber: row.sourceRowNumber,
          };
          rowIssues.push(issue);
          issues.push(issue);
        }
      } else {
        // GRADE or SCHOOL_WIDE
        const teacherTokens = row.enteredTeacherText
          .split(';')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);

        if (teacherTokens.length === 0) {
          const issue: HdtnWorkbookPreviewIssue = {
            severity: 'BLOCKER',
            code: 'TEACHER_NAME_REQUIRED',
            message: `Dòng ${row.sourceRowNumber}: Danh sách giáo viên thực hiện không được để trống.`,
            sourceRowNumber: row.sourceRowNumber,
          };
          rowIssues.push(issue);
          issues.push(issue);
        }

        const seenTokens = new Set<string>();
        const seenUserIds = new Set<string>();

        for (const rawToken of teacherTokens) {
          const normToken = rawToken.trim().normalize('NFC').toLowerCase();
          if (seenTokens.has(normToken)) {
            const issue: HdtnWorkbookPreviewIssue = {
              severity: 'BLOCKER',
              code: 'DUPLICATE_TEACHER_TOKEN',
              message: `Dòng ${row.sourceRowNumber}: Tên giáo viên '${rawToken.trim()}' bị lặp lại trong danh sách người thực hiện.`,
              sourceRowNumber: row.sourceRowNumber,
            };
            rowIssues.push(issue);
            issues.push(issue);
            continue;
          }
          seenTokens.add(normToken);

          const parsedTeacher = this.parseSupportingClassSuffix(rawToken, activeClasses, row.sourceRowNumber);
          if (parsedTeacher.issue) {
            rowIssues.push(parsedTeacher.issue);
            issues.push(parsedTeacher.issue);
            continue;
          }

          const match = this.resolveTeacherByName(parsedTeacher.teacherName, teachingUsers, row.sourceRowNumber);
          if (match.issue) {
            rowIssues.push(match.issue);
            issues.push(match.issue);
          } else if (match.teacher) {
            // Finding E: Duplicate detection on canonical resolved User.id
            if (seenUserIds.has(match.teacher.matchedUserId)) {
              const issue: HdtnWorkbookPreviewIssue = {
                severity: 'BLOCKER',
                code: 'DUPLICATE_RESOLVED_TEACHER',
                message: `Dòng ${row.sourceRowNumber}: Giáo viên '${match.teacher.displayName}' bị chỉ định trùng lặp nhiều lần trong danh sách người thực hiện.`,
                sourceRowNumber: row.sourceRowNumber,
              };
              rowIssues.push(issue);
              issues.push(issue);
            } else {
              seenUserIds.add(match.teacher.matchedUserId);
              resolvedTeachers.push(match.teacher);
              explicitTeacherUserIds.add(match.teacher.matchedUserId);
            }
          }
        }
      }

      // 2. Resolve teaching civil dates from calendar
      const civilDates: CivilDateString[] = [];
      if (calendar) {
        for (let w = row.weekFrom; w <= row.weekTo; w += 1) {
          const week = calendar.weeks.find((item) => item.officialWeekNumber === w);
          if (!week) {
            const issue: HdtnWorkbookPreviewIssue = {
              severity: 'BLOCKER',
              code: 'WEEK_NOT_IN_CALENDAR',
              message: `Dòng ${row.sourceRowNumber}: Tuần chính thức số ${w} không tồn tại trong lịch năm học.`,
              sourceRowNumber: row.sourceRowNumber,
            };
            rowIssues.push(issue);
            issues.push(issue);
            continue;
          }

          academicWeekIds.add(week.id);

          if (week.segments.length === 0) {
            const issue: HdtnWorkbookPreviewIssue = {
              severity: 'BLOCKER',
              code: 'WEEK_SEGMENTS_EMPTY',
              message: `Dòng ${row.sourceRowNumber}: Tuần số ${w} không có đoạn thời gian nào.`,
              sourceRowNumber: row.sourceRowNumber,
            };
            rowIssues.push(issue);
            issues.push(issue);
            continue;
          }

          for (const segment of week.segments) {
            academicWeekSegmentIds.add(segment.id);
            segmentDateRanges.push({
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
        const issue: HdtnWorkbookPreviewIssue = {
          severity: 'BLOCKER',
          code: 'NO_TEACHING_CIVIL_DATES',
          message: `Dòng ${row.sourceRowNumber}: Không tìm thấy ngày học hợp lệ nào trong khoảng tuần ${row.weekFrom} - ${row.weekTo}.`,
          sourceRowNumber: row.sourceRowNumber,
        };
        rowIssues.push(issue);
        issues.push(issue);
      }

      // 3. Resolve target classes
      let targetClasses: SchoolClass[] = [];
      if (row.organizingScope === 'CLASS' || row.organizingScope === 'GRADE') {
        targetClasses = activeClasses.filter((c) => c.gradeLevel === row.gradeLevel);
        if (targetClasses.length === 0) {
          const issue: HdtnWorkbookPreviewIssue = {
            severity: 'BLOCKER',
            code: 'NO_ACTIVE_CLASSES_IN_GRADE',
            message: `Dòng ${row.sourceRowNumber}: Không có lớp học nào đang hoạt động thuộc khối ${row.gradeLevel}.`,
            sourceRowNumber: row.sourceRowNumber,
          };
          rowIssues.push(issue);
          issues.push(issue);
        }
      } else {
        targetClasses = activeClasses;
        if (targetClasses.length === 0) {
          const issue: HdtnWorkbookPreviewIssue = {
            severity: 'BLOCKER',
            code: 'NO_ACTIVE_CLASSES_IN_SCHOOL',
            message: `Dòng ${row.sourceRowNumber}: Toàn trường không có lớp học nào đang hoạt động.`,
            sourceRowNumber: row.sourceRowNumber,
          };
          rowIssues.push(issue);
          issues.push(issue);
        }
      }

      for (const cls of targetClasses) {
        targetClassIds.add(cls.id);
      }

      // 4. Resolve date-effective timetable versions & retained markers
      const markersForDates: Array<{
        civilDate: CivilDateString;
        timeSlotDefinitionId: string;
        schoolClassId: string;
        timeSlot: TimeSlotDefinition;
        timetableVersionId: string;
      }> = [];

      for (const cDate of uniqueCivilDates) {
        let tv = timetableVersionCache.get(cDate);
        if (!tv && !timetableVersionCache.has(cDate)) {
          const targetDateObj = parseCivilDate(cDate);
          tv = await this.prisma.timetableVersion.findFirst({
            where: {
              academicYearId,
              status: { in: [TimetableVersionStatus.ACTIVE, TimetableVersionStatus.SUPERSEDED] },
              effectiveFrom: { lte: targetDateObj },
              OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: targetDateObj } }],
            },
            orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
          });
          timetableVersionCache.set(cDate, tv ?? null);
        }

        if (!tv) {
          const issue: HdtnWorkbookPreviewIssue = {
            severity: 'BLOCKER',
            code: 'TIMETABLE_VERSION_NOT_FOUND',
            message: `Dòng ${row.sourceRowNumber}: Không tìm thấy thời khóa biểu có hiệu lực tại ngày ${cDate}.`,
            sourceRowNumber: row.sourceRowNumber,
          };
          rowIssues.push(issue);
          issues.push(issue);
          continue;
        }

        timetableVersionIds.add(tv.id);

        const retainedMarkers = await this.markerService.findRetainedMarkers({
          timetableVersionId: tv.id,
          kind: 'HDTN_HN',
        });

        const expectedWeekday = weekdayForCivilDate(parseCivilDate(cDate));

        for (const rm of retainedMarkers) {
          const slotDef = timeSlotMap.get(rm.timeSlotDefinitionId);
          if (slotDef && slotDef.weekday === expectedWeekday) {
            timeSlotDefinitionIds.add(slotDef.id);
            markersForDates.push({
              civilDate: cDate,
              timeSlotDefinitionId: rm.timeSlotDefinitionId,
              schoolClassId: rm.schoolClassId,
              timeSlot: slotDef,
              timetableVersionId: tv.id,
            });
            markerTuples.push({
              timetableVersionId: tv.id,
              schoolClassId: rm.schoolClassId,
              timeSlotDefinitionId: rm.timeSlotDefinitionId,
              kind: 'HDTN_HN',
              civilDate: cDate,
            });
          }
        }
      }

      const previewRowSlots: HdtnWorkbookResolvedSlot[] = [];

      // 5. Evaluate and build occurrences based on organizing scope
      if (row.organizingScope === 'CLASS') {
        // Finding A: Each class must preserve its OWN exact slots
        for (const cls of targetClasses) {
          const classMarkers = markersForDates.filter((m) => m.schoolClassId === cls.id);

          if (classMarkers.length !== row.requiredPeriods) {
            const issue: HdtnWorkbookPreviewIssue = {
              severity: 'BLOCKER',
              code: 'CLASS_PERIOD_COUNT_MISMATCH',
              message: `Dòng ${row.sourceRowNumber}: Lớp ${cls.code} có ${classMarkers.length} tiết HĐTN-HN trên thời khóa biểu, không khớp với số tiết yêu cầu là ${row.requiredPeriods}.`,
              sourceRowNumber: row.sourceRowNumber,
              schoolClassCode: cls.code,
            };
            rowIssues.push(issue);
            issues.push(issue);
          }

          const classMarkersByDate = new Map<string, typeof classMarkers>();
          const gvcnByDate = new Map<string, string>();

          for (const cm of classMarkers) {
            const dateObj = parseCivilDate(cm.civilDate);
            const coveringAssignments = await this.prisma.homeroomAssignment.findMany({
              where: {
                academicYearId,
                schoolClassId: cls.id,
                status: 'ACTIVE',
                validFrom: { lte: dateObj },
                OR: [{ validUntil: null }, { validUntil: { gte: dateObj } }],
              },
            });
            const lineageRows = await this.prisma.homeroomAssignment.findMany({
              where: { academicYearId, schoolClassId: cls.id },
              select: {
                id: true,
                academicYearId: true,
                schoolClassId: true,
                status: true,
                replacesId: true,
                reversedByUserId: true,
                reversedAt: true,
                reversalReason: true,
              },
            });

            const classification = classifyHomeroomResolutionRows(coveringAssignments, lineageRows);
            if (classification.outcome !== 'RESOLVED') {
              const issue: HdtnWorkbookPreviewIssue = {
                severity: 'BLOCKER',
                code: `HOMEROOM_${classification.outcome}`,
                message: `Dòng ${row.sourceRowNumber}: Lớp ${cls.code} không thể xác định GVCN tại ngày ${cm.civilDate} (kết quả: ${classification.outcome}).`,
                sourceRowNumber: row.sourceRowNumber,
                schoolClassCode: cls.code,
              };
              rowIssues.push(issue);
              issues.push(issue);
            } else {
              const gvcnUser = await this.prisma.user.findUnique({
                where: { id: classification.assignment.teacherUserId },
                include: { profile: true },
              });
              if (!gvcnUser || gvcnUser.status !== 'ACTIVE' || !gvcnUser.profile?.isTeachingStaff) {
                const issue: HdtnWorkbookPreviewIssue = {
                  severity: 'BLOCKER',
                  code: 'HOMEROOM_TEACHER_INELIGIBLE',
                  message: `Dòng ${row.sourceRowNumber}: GVCN của lớp ${cls.code} tại ngày ${cm.civilDate} không phải nhân sự giảng dạy ACTIVE hợp lệ.`,
                  sourceRowNumber: row.sourceRowNumber,
                  schoolClassCode: cls.code,
                };
                rowIssues.push(issue);
                issues.push(issue);
              } else {
                gvcnByDate.set(cm.civilDate, classification.assignment.teacherUserId);
                homeroomAssignments.push({
                  civilDate: cm.civilDate,
                  schoolClassId: cls.id,
                  homeroomAssignmentId: classification.assignment.id,
                  teacherUserId: classification.assignment.teacherUserId,
                });
              }
            }

            if (!classMarkersByDate.has(cm.civilDate)) {
              classMarkersByDate.set(cm.civilDate, []);
            }
            classMarkersByDate.get(cm.civilDate)!.push(cm);
          }

          // Build occurrences for THIS CLASS only!
          for (const [civilDate, cMarkers] of classMarkersByDate.entries()) {
            const gvcnUserId = gvcnByDate.get(civilDate);
            if (gvcnUserId) {
              resolvedOccurrences.push({
                topicSequence,
                civilDate,
                mode: 'CLASS',
                gradeLevel: null,
                schoolClassId: cls.id,
                slots: cMarkers.map((m) => ({
                  timeSlotDefinitionId: m.timeSlotDefinitionId,
                  teacherUserIds: [gvcnUserId],
                })),
              });
            }
          }
        }

        // Preview presentation row: union of unique slots for display
        const uniqueClassSlots = new Map<string, HdtnWorkbookResolvedSlot>();
        for (const m of markersForDates.filter((m) => targetClasses.some((c) => c.id === m.schoolClassId))) {
          const key = `${m.civilDate}#${m.timeSlotDefinitionId}`;
          if (!uniqueClassSlots.has(key)) {
            uniqueClassSlots.set(key, {
              civilDate: m.civilDate,
              weekday: m.timeSlot.weekday as AcademicWeekday,
              timeSlotDefinitionId: m.timeSlotDefinitionId,
              periodNumber: m.timeSlot.ordinal,
              startTime: formatWallClockTime(m.timeSlot.startTime),
              endTime: formatWallClockTime(m.timeSlot.endTime),
            });
          }
        }
        previewRowSlots.push(...this.sortResolvedSlots([...uniqueClassSlots.values()]));

        previewRows.push({
          sourceRowNumber: row.sourceRowNumber,
          weekFrom: row.weekFrom,
          weekTo: row.weekTo,
          requiredPeriods: row.requiredPeriods,
          organizingScope: row.organizingScope,
          organizingScopeLabel: row.organizingScopeLabel,
          gradeLevel: row.gradeLevel,
          topicTitle: row.topicTitle,
          enteredTeacherText: row.enteredTeacherText,
          resolvedTeachers: [],
          targetClassCodes: targetClasses.map((c) => c.code),
          resolvedCandidateCount: row.requiredPeriods,
          slots: previewRowSlots,
          issues: rowIssues,
        });
      } else if (row.organizingScope === 'GRADE') {
        const slotKeys = new Map<string, { civilDate: CivilDateString; timeSlot: TimeSlotDefinition }>();
        for (const m of markersForDates.filter((m) => targetClasses.some((c) => c.id === m.schoolClassId))) {
          const key = `${m.civilDate}#${m.timeSlotDefinitionId}`;
          if (!slotKeys.has(key)) {
            slotKeys.set(key, { civilDate: m.civilDate, timeSlot: m.timeSlot });
          }
        }

        const collapsedSlots: HdtnWorkbookResolvedSlot[] = [];
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
            const issue: HdtnWorkbookPreviewIssue = {
              severity: 'BLOCKER',
              code: 'GRADE_COVERAGE_INCOMPLETE',
              message: `Dòng ${row.sourceRowNumber}: Tiết HĐTN-HN ngày ${val.civilDate} (tiết ${val.timeSlot.ordinal}) không phủ đủ 100% các lớp trong khối ${row.gradeLevel}. Thiếu các lớp: ${missingClassCodes.join(', ')}.`,
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

        if (collapsedSlots.length !== row.requiredPeriods) {
          const issue: HdtnWorkbookPreviewIssue = {
            severity: 'BLOCKER',
            code: 'GRADE_PERIOD_COUNT_MISMATCH',
            message: `Dòng ${row.sourceRowNumber}: Số tiết HĐTN-HN toàn khối sau khi gộp là ${collapsedSlots.length}, không khớp với số tiết yêu cầu là ${row.requiredPeriods}.`,
            sourceRowNumber: row.sourceRowNumber,
          };
          rowIssues.push(issue);
          issues.push(issue);
        }

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

        previewRowSlots.push(...this.sortResolvedSlots(collapsedSlots));

        previewRows.push({
          sourceRowNumber: row.sourceRowNumber,
          weekFrom: row.weekFrom,
          weekTo: row.weekTo,
          requiredPeriods: row.requiredPeriods,
          organizingScope: row.organizingScope,
          organizingScopeLabel: row.organizingScopeLabel,
          gradeLevel: row.gradeLevel,
          topicTitle: row.topicTitle,
          enteredTeacherText: row.enteredTeacherText,
          resolvedTeachers,
          targetClassCodes: targetClasses.map((c) => c.code),
          resolvedCandidateCount: collapsedSlots.length,
          slots: previewRowSlots,
          issues: rowIssues,
        });
      } else {
        // SCHOOL_WIDE
        const slotKeys = new Map<string, { civilDate: CivilDateString; timeSlot: TimeSlotDefinition }>();
        for (const m of markersForDates.filter((m) => activeClasses.some((c) => c.id === m.schoolClassId))) {
          const key = `${m.civilDate}#${m.timeSlotDefinitionId}`;
          if (!slotKeys.has(key)) {
            slotKeys.set(key, { civilDate: m.civilDate, timeSlot: m.timeSlot });
          }
        }

        const collapsedSlots: HdtnWorkbookResolvedSlot[] = [];
        const slotsByCivilDate = new Map<string, Array<{ timeSlotDefinitionId: string }>>();

        for (const [key, val] of slotKeys.entries()) {
          const [, timeSlotDefinitionId] = key.split('#');
          const coveringClasses = markersForDates.filter(
            (m) =>
              m.civilDate === val.civilDate &&
              m.timeSlotDefinitionId === timeSlotDefinitionId &&
              activeClasses.some((c) => c.id === m.schoolClassId),
          );
          const coveredClassIds = new Set(coveringClasses.map((m) => m.schoolClassId));

          if (coveredClassIds.size !== activeClasses.length) {
            const missingClassCodes = activeClasses
              .filter((c) => !coveredClassIds.has(c.id))
              .map((c) => c.code);
            const issue: HdtnWorkbookPreviewIssue = {
              severity: 'BLOCKER',
              code: 'SCHOOL_WIDE_COVERAGE_INCOMPLETE',
              message: `Dòng ${row.sourceRowNumber}: Tiết HĐTN-HN ngày ${val.civilDate} (tiết ${val.timeSlot.ordinal}) không phủ đủ 100% tất cả các lớp trong toàn trường. Thiếu các lớp: ${missingClassCodes.join(', ')}.`,
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

        if (collapsedSlots.length !== row.requiredPeriods) {
          const issue: HdtnWorkbookPreviewIssue = {
            severity: 'BLOCKER',
            code: 'SCHOOL_WIDE_PERIOD_COUNT_MISMATCH',
            message: `Dòng ${row.sourceRowNumber}: Số tiết HĐTN-HN toàn trường sau khi gộp là ${collapsedSlots.length}, không khớp với số tiết yêu cầu là ${row.requiredPeriods}.`,
            sourceRowNumber: row.sourceRowNumber,
          };
          rowIssues.push(issue);
          issues.push(issue);
        }

        const explicitTeacherIds = resolvedTeachers.map((t) => t.matchedUserId);
        for (const [civilDate, sList] of slotsByCivilDate.entries()) {
          resolvedOccurrences.push({
            topicSequence,
            civilDate,
            mode: 'SCHOOL_WIDE',
            gradeLevel: null,
            schoolClassId: null,
            slots: sList.map((s) => ({
              timeSlotDefinitionId: s.timeSlotDefinitionId,
              teacherUserIds: explicitTeacherIds,
            })),
          });
        }

        previewRowSlots.push(...this.sortResolvedSlots(collapsedSlots));

        previewRows.push({
          sourceRowNumber: row.sourceRowNumber,
          weekFrom: row.weekFrom,
          weekTo: row.weekTo,
          requiredPeriods: row.requiredPeriods,
          organizingScope: row.organizingScope,
          organizingScopeLabel: row.organizingScopeLabel,
          gradeLevel: null,
          topicTitle: row.topicTitle,
          enteredTeacherText: row.enteredTeacherText,
          resolvedTeachers,
          targetClassCodes: activeClasses.map((c) => c.code),
          resolvedCandidateCount: collapsedSlots.length,
          slots: previewRowSlots,
          issues: rowIssues,
        });
      }
    }

    const authorityEvidence: HdtnImportAuthorityEvidence = {
      academicYearId,
      calendarVersionId: calendar?.id ?? '',
      academicWeekIds: Array.from(academicWeekIds),
      academicWeekSegmentIds: Array.from(academicWeekSegmentIds),
      segmentDateRanges,
      targetClassIds: Array.from(targetClassIds),
      timetableVersionIds: Array.from(timetableVersionIds),
      timeSlotDefinitionIds: Array.from(timeSlotDefinitionIds),
      explicitTeacherUserIds: Array.from(explicitTeacherUserIds),
      homeroomAssignments,
      markerTuples,
    };

    const blockingIssueCount = issues.filter((i) => i.severity === 'BLOCKER').length;
    const warningCount = issues.filter((i) => i.severity === 'WARNING').length;
    const canConfirm = parsedRows.length > 0 && blockingIssueCount === 0;

    const resolvedPackage: ResolvedHdtnDraftPackage = {
      academicYearId,
      previewFingerprint: '',
      topics: resolvedTopics,
      occurrences: resolvedOccurrences,
    };

    const previewFingerprint = this.computePreviewFingerprint(
      academicYearId,
      parsedRows,
      authorityEvidence,
      resolvedPackage,
    );

    resolvedPackage.previewFingerprint = previewFingerprint;

    const preview: HdtnWorkbookPreviewResponse = {
      sourceFileName: this.sourceFileName(file!.originalname),
      sheetName: dataSheet.name,
      academicYearId,
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
  ): Promise<HdtnWorkbookPreviewResponse> {
    const resolved = await this.resolveWorkbook(file, academicYearId);
    return resolved.preview;
  }

  async confirm(
    file: UploadedWorkbookFile | undefined,
    academicYearId: string,
    expectedPreviewFingerprint: string,
    commandId: string,
    actorUserId: string,
    bootstrapContext: HdtnImportBootstrapContext = {
      expectedProgrammeMasterId: null,
      canBootstrapMaster: false,
    },
  ): Promise<HdtnWorkbookConfirmResponse> {
    const resolved = await this.resolveWorkbook(file, academicYearId);

    if (resolved.preview.previewFingerprint !== expectedPreviewFingerprint) {
      throw new ConflictException({
        error: 'HDTN_IMPORT_STALE_PREVIEW',
        message:
          'Dữ liệu thời khóa biểu, lịch năm học hoặc phân công giáo viên đã thay đổi kể từ khi xem trước; vui lòng tải lại bản xem trước.',
      });
    }

    if (!resolved.preview.canConfirm || resolved.preview.blockingIssueCount > 0) {
      throw new ConflictException({
        error: 'HDTN_IMPORT_HAS_BLOCKERS',
        message: 'Workbook chứa lỗi chặn (blocker), không thể xác nhận import.',
      });
    }

    return this.planningService.importHdtnDraftPackage(
      actorUserId,
      commandId,
      resolved.resolvedPackage,
      bootstrapContext,
      resolved.authorityEvidence,
    );
  }

  private isHdtnDataSheetName(name: string): boolean {
    const norm = name.trim().normalize('NFC').toUpperCase();
    return norm === 'NHẬP HĐTN-HN' || norm === 'NHAP HDTN-HN';
  }

  private checkHeaderRow(row: ParsedWorkbookRow | undefined): HdtnWorkbookPreviewIssue | null {
    if (!row || row.cells.length < EXPECTED_HEADERS.length) {
      return {
        severity: 'BLOCKER',
        code: 'HEADER_MISMATCH',
        message:
          'Tiêu đề cột không đúng định dạng chuẩn HĐTN-HN. Bắt buộc đúng thứ tự: Tuần từ, Tuần đến, Số tiết, Quy mô tổ chức, Khối, Chủ đề, Người thực hiện.',
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

  private parseSupportingClassSuffix(
    token: string,
    activeClasses: SchoolClass[],
    sourceRowNumber: number,
  ): { teacherName: string; issue?: HdtnWorkbookPreviewIssue } {
    const match = token.match(/^(.+?)\s+và\s+lớp\s+([A-Za-z0-9_]+)$/iu);
    if (!match) {
      return { teacherName: token.trim() };
    }

    const teacherPart = match[1]!.trim();
    const classCode = match[2]!.trim();

    const classExists = activeClasses.some(
      (c) => c.code.toLowerCase() === classCode.toLowerCase(),
    );

    if (!classExists) {
      return {
        teacherName: teacherPart,
        issue: {
          severity: 'BLOCKER',
          code: 'SUPPORTING_CLASS_NOT_FOUND',
          message: `Dòng ${sourceRowNumber}: Lớp hỗ trợ '${classCode}' trong chú thích không tồn tại trong danh sách lớp đang hoạt động.`,
          sourceRowNumber,
        },
      };
    }

    return { teacherName: teacherPart };
  }

  private resolveTeacherByName(
    name: string,
    teachingUsers: Array<{ id: string; profile: { displayName: string; staffCode: string | null } | null }>,
    sourceRowNumber: number,
  ): { teacher?: HdtnWorkbookResolvedTeacherSummary; issue?: HdtnWorkbookPreviewIssue } {
    const normalizedTarget = name.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();

    const matched = teachingUsers.filter((u) => {
      if (!u.profile) return false;
      const displayName = u.profile.displayName;
      const norm = displayName.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
      return norm === normalizedTarget;
    });

    if (matched.length === 0) {
      return {
        issue: {
          severity: 'BLOCKER',
          code: 'TEACHER_NOT_FOUND',
          message: `Dòng ${sourceRowNumber}: Không tìm thấy giáo viên với họ tên '${name}' trong danh sách nhân sự giảng dạy đang hoạt động.`,
          sourceRowNumber,
          teacherName: name,
        },
      };
    }

    if (matched.length > 1) {
      return {
        issue: {
          severity: 'BLOCKER',
          code: 'TEACHER_NAME_AMBIGUOUS',
          message: `Dòng ${sourceRowNumber}: Tìm thấy nhiều (${matched.length}) giáo viên trùng họ tên '${name}'.`,
          sourceRowNumber,
          teacherName: name,
        },
      };
    }

    const teacherUser = matched[0]!;
    if (!teacherUser.profile) {
      return {
        issue: {
          severity: 'BLOCKER',
          code: 'TEACHER_NOT_FOUND',
          message: `Dòng ${sourceRowNumber}: Giáo viên '${name}' không có hồ sơ hợp lệ.`,
          sourceRowNumber,
          teacherName: name,
        },
      };
    }

    return {
      teacher: {
        enteredName: name,
        matchedUserId: teacherUser.id,
        displayName: teacherUser.profile.displayName,
        staffCode: teacherUser.profile.staffCode ?? null,
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

  private sortResolvedSlots(slots: HdtnWorkbookResolvedSlot[]): HdtnWorkbookResolvedSlot[] {
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
    parsedRows: NormalizedRowData[],
    evidence: HdtnImportAuthorityEvidence,
    resolvedPackage: ResolvedHdtnDraftPackage,
  ): string {
    const payload = {
      academicYearId,
      calendarVersionId: evidence.calendarVersionId,
      normalizedRows: parsedRows.map((r) => ({
        sourceRowNumber: r.sourceRowNumber,
        weekFrom: r.weekFrom,
        weekTo: r.weekTo,
        requiredPeriods: r.requiredPeriods,
        organizingScope: r.organizingScope,
        gradeLevel: r.gradeLevel,
        topicTitle: r.topicTitle,
        enteredTeacherText: r.enteredTeacherText,
      })),
      academicWeekIds: [...new Set(evidence.academicWeekIds)].sort(),
      academicWeekSegmentIds: [...new Set(evidence.academicWeekSegmentIds)].sort(),
      segmentDateRanges: [
        ...new Set(
          evidence.segmentDateRanges.map(
            (s) => `${s.segmentId}#${s.startDate}#${s.endDate}`,
          ),
        ),
      ].sort(),
      targetClassIds: [...new Set(evidence.targetClassIds)].sort(),
      timetableVersionIds: [...new Set(evidence.timetableVersionIds)].sort(),
      timeSlotDefinitionIds: [...new Set(evidence.timeSlotDefinitionIds)].sort(),
      explicitTeacherUserIds: [...new Set(evidence.explicitTeacherUserIds)].sort(),
      homeroomAssignments: [
        ...new Set(
          evidence.homeroomAssignments.map(
            (h) =>
              `${h.civilDate}#${h.schoolClassId}#${h.homeroomAssignmentId}#${h.teacherUserId}`,
          ),
        ),
      ].sort(),
      markerTuples: [
        ...new Set(
          evidence.markerTuples.map(
            (m) =>
              `${m.timetableVersionId}#${m.schoolClassId}#${m.timeSlotDefinitionId}#${m.kind}#${m.civilDate}`,
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
        })),
        occurrences: resolvedPackage.occurrences
          .map((o) => ({
            topicSequence: o.topicSequence,
            civilDate: o.civilDate,
            mode: o.mode,
            gradeLevel: o.gradeLevel,
            schoolClassId: o.schoolClassId,
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
            if (a.mode !== b.mode) return a.mode.localeCompare(b.mode);
            const classComp = (a.schoolClassId ?? '').localeCompare(b.schoolClassId ?? '');
            if (classComp !== 0) return classComp;
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
    return safe.slice(0, 255) || 'hdtn_workbook.xlsx';
  }
}
