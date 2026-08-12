import { BadRequestException, ConflictException, Injectable, NotFoundException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { AcademicWeekday, Prisma, TimetableImportSemanticField } from '@prisma/client';
import { TimetableImportCanonicalPreviewRow, TimetableImportPreviewDiffRow, TimetableImportPreviewIssue, TimetableImportWorkbookInspectionResponse, TimetableImportWorkbookPreviewResponse } from '@baogiang/contracts';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { evaluateTimetableEntries } from '../timetables/timetable-validation';
import { EnrichedTimetableEntry } from '../timetables/mapper';
import { PreviewTimetableImportWorkbookDto } from './dto';
import { semanticFieldOrder } from './mapper';
import { normalizeHumanText, normalizeLookupKey } from './normalization';
import { computePreviewDiff, parsePeriodOrdinal, parseSession, parseWeekday, resolveTeacherCandidates, semanticFields, sortPreviewIssues } from './workbook-canonicalization';
import { HeaderMapping, inspectParsedWorkbook, locateHeader } from './workbook-inspection';
import { MAX_MAPPED_CELL_TEXT_LENGTH, MAX_XLSX_BYTES } from './workbook-limits';
import { ParsedWorkbookCell } from './workbook-parser.types';
import { WorkbookParserService } from './workbook-parser.service';

export interface UploadedWorkbookFile { originalname: string; mimetype: string; size: number; buffer: Buffer }
type RevisionContext = Prisma.TimetableImportProfileRevisionGetPayload<{ include: { profile: true; columnMappings: true } }>;

const messages: Record<string, string> = {
  HIDDEN_MAPPED_DATA: 'Hidden row or column contains mapped timetable data.', NONBLANK_ROW_WITHOUT_MAPPED_DATA: 'Nonblank row contains no mapped data.', PARTIALLY_BLANK_MAPPED_ROW: 'Mapped row is incomplete.',
  FORMULA_IN_MAPPED_CELL: 'Formula is not allowed in a mapped cell.', HYPERLINK_IN_MAPPED_CELL: 'Hyperlink is not allowed in a mapped cell.', MERGED_MAPPED_CELL: 'Merged mapped cell is not allowed.', UNSUPPORTED_MAPPED_CELL_TYPE: 'Mapped cell type is unsupported.', MAPPED_VALUE_TOO_LONG: 'Mapped value is too long.',
  INVALID_WEEKDAY: 'Weekday token is invalid.', INVALID_SESSION: 'Session token is invalid.', INVALID_PERIOD_ORDINAL: 'Period ordinal is invalid.', WEEKDAY_NOT_IN_CALENDAR: 'Weekday is not configured for the calendar.',
  SLOT_NOT_FOUND: 'Time slot coordinate was not found.', SLOT_NOT_ACTIVE: 'Time slot is inactive.', SLOT_NOT_REGULAR_TEACHING: 'Time slot does not allow regular teaching.',
  CLASS_NOT_FOUND: 'Class was not found.', CLASS_INACTIVE: 'Class is inactive.', CLASS_IDENTITY_CONFLICT: 'Class code and alias disagree.', SUBJECT_NOT_FOUND: 'Subject was not found.', SUBJECT_INACTIVE: 'Subject is inactive.', SUBJECT_IDENTITY_CONFLICT: 'Subject code and alias disagree.',
  TEACHER_NOT_FOUND: 'Teacher was not found.', TEACHER_AMBIGUOUS: 'Teacher identifier is ambiguous.', TEACHER_INACTIVE: 'Teacher is inactive.', TEACHER_NOT_TEACHING_STAFF: 'User is not teaching staff.',
  ASSIGNMENT_NOT_FOUND: 'Teaching assignment was not found.', ASSIGNMENT_AMBIGUOUS: 'Teaching assignment is ambiguous.', ASSIGNMENT_COVERAGE_GAP: 'Teaching assignment does not cover the validation envelope.', DUPLICATE_CANONICAL_ROW: 'Canonical timetable row is duplicated.', CLASS_TIME_OVERLAP: 'Class timetable rows overlap.', TEACHER_TIME_OVERLAP: 'Teacher timetable rows overlap.',
};

@Injectable()
export class TimetableImportWorkbookService {
  constructor(private readonly prisma: PrismaService, private readonly parser: WorkbookParserService) {}

  async inspect(file: UploadedWorkbookFile | undefined, profileRevisionId: string): Promise<TimetableImportWorkbookInspectionResponse> {
    this.validateFile(file);
    const revision = await this.requireActiveRevision(profileRevisionId);
    this.assertUniqueMappings(revision);
    const parsed = await this.parser.parse(file!.buffer);
    const inspection = inspectParsedWorkbook(parsed, this.headerMappings(revision), revision.sheetNameHint);
    return { profileRevisionId, profileId: revision.profileId, sourceFileName: this.sourceFileName(file!.originalname), ...inspection };
  }

  async preview(file: UploadedWorkbookFile | undefined, dto: PreviewTimetableImportWorkbookDto): Promise<TimetableImportWorkbookPreviewResponse> {
    this.validateFile(file);
    const revision = await this.requireActiveRevision(dto.profileRevisionId);
    this.assertUniqueMappings(revision);
    const [parsed, target] = await Promise.all([this.parser.parse(file!.buffer), this.resolveTarget(dto)]);
    const sheet = parsed.sheets.find((item) => item.name === dto.sheetName);
    if (!sheet || sheet.state !== 'VISIBLE' || !sheet.rows.some((row) => row.cells.some((cell) => cell.kind !== 'BLANK'))) throw new BadRequestException({ error: 'TIMETABLE_IMPORT_SHEET_NOT_SELECTABLE', message: 'Selected worksheet is not visible and nonblank.' });
    const located = locateHeader(sheet, dto.headerRowNumber, this.headerMappings(revision));
    if (!located?.candidate.complete) throw new BadRequestException({ error: 'TIMETABLE_IMPORT_HEADER_NOT_COMPLETE', message: 'Confirmed header row does not contain the exact mapping.' });
    const context = await this.loadResolutionContext(revision.profileId, dto.academicYearId);
    const issues: TimetableImportPreviewIssue[] = [];
    const rows: TimetableImportCanonicalPreviewRow[] = [];
    const transient: EnrichedTimetableEntry[] = [];
    let sourceRowCount = 0;
    for (const sourceRow of sheet.rows.filter((row) => row.number > dto.headerRowNumber)) {
      if (sourceRow.cells.every((cell) => cell.kind === 'BLANK')) continue;
      sourceRowCount += 1;
      const mapped = Object.fromEntries(semanticFields.map((field) => [field, sourceRow.cells[located.columns[field] - 1]!])) as Record<TimetableImportSemanticField, ParsedWorkbookCell>;
      const present = semanticFields.filter((field) => mapped[field].kind !== 'BLANK');
      if (present.length === 0) { issues.push(this.issue('NONBLANK_ROW_WITHOUT_MAPPED_DATA', sourceRow.number)); continue; }
      if (present.length !== semanticFields.length) { issues.push(this.issue('PARTIALLY_BLANK_MAPPED_ROW', sourceRow.number)); continue; }
      const values = {} as Record<TimetableImportSemanticField, string>;
      let unsafe = false;
      for (const field of semanticFields) {
        const cell = mapped[field];
        const permitsNumber = field === 'PERIOD_ORDINAL';
        const code = cell.formula ? 'FORMULA_IN_MAPPED_CELL' : cell.hyperlink ? 'HYPERLINK_IN_MAPPED_CELL' : cell.merged ? 'MERGED_MAPPED_CELL' : cell.kind !== 'TEXT' && !(permitsNumber && cell.kind === 'NUMBER') ? 'UNSUPPORTED_MAPPED_CELL_TYPE' : undefined;
        if (code) { issues.push(this.issue(code, sourceRow.number, field)); unsafe = true; continue; }
        const value = normalizeHumanText(cell.text!);
        if (value.length > MAX_MAPPED_CELL_TEXT_LENGTH) { issues.push(this.issue('MAPPED_VALUE_TOO_LONG', sourceRow.number, field, value)); unsafe = true; }
        values[field] = value;
        if ((sourceRow.hidden || sheet.hiddenColumns.includes(located.columns[field])) && value) issues.push(this.issue('HIDDEN_MAPPED_DATA', sourceRow.number, field));
      }
      if (unsafe) continue;
      const weekday = parseWeekday(values.WEEKDAY); const session = parseSession(values.SESSION); const ordinal = parsePeriodOrdinal(values.PERIOD_ORDINAL);
      if (!weekday) issues.push(this.issue('INVALID_WEEKDAY', sourceRow.number, 'WEEKDAY', values.WEEKDAY));
      if (!session) issues.push(this.issue('INVALID_SESSION', sourceRow.number, 'SESSION', values.SESSION));
      if (!ordinal) issues.push(this.issue('INVALID_PERIOD_ORDINAL', sourceRow.number, 'PERIOD_ORDINAL', values.PERIOD_ORDINAL));
      if (!weekday || !session || !ordinal) continue;
      const slotHistory = context.slots.filter((slot) => slot.weekday === weekday && slot.session === session && slot.ordinal === ordinal);
      const currentSlots = slotHistory.filter((item) => item.isActive);
      if (slotHistory.length === 0) { issues.push(this.issue('SLOT_NOT_FOUND', sourceRow.number)); continue; }
      if (currentSlots.length === 0) { issues.push(this.issue('SLOT_NOT_ACTIVE', sourceRow.number)); continue; }
      if (currentSlots.length > 1) throw new ConflictException({ error: 'TIMETABLE_IMPORT_SLOT_CURRENT_INVARIANT', message: 'Multiple current time slots share one coordinate.' });
      const slot = currentSlots[0]!;
      if (!slot.allowRegularTeaching) { issues.push(this.issue('SLOT_NOT_REGULAR_TEACHING', sourceRow.number)); continue; }
      const schoolClass = this.resolveCodeAlias(values.SCHOOL_CLASS, context.classes, context.classAliases, 'code');
      if (schoolClass.conflict) { issues.push(this.issue('CLASS_IDENTITY_CONFLICT', sourceRow.number, 'SCHOOL_CLASS', values.SCHOOL_CLASS)); continue; }
      if (!schoolClass.item) { issues.push(this.issue('CLASS_NOT_FOUND', sourceRow.number, 'SCHOOL_CLASS', values.SCHOOL_CLASS)); continue; }
      if (schoolClass.item.status !== 'ACTIVE') { issues.push(this.issue('CLASS_INACTIVE', sourceRow.number)); continue; }
      const subject = this.resolveCodeAlias(values.SUBJECT, context.subjects, context.subjectAliases, 'code');
      if (subject.conflict) { issues.push(this.issue('SUBJECT_IDENTITY_CONFLICT', sourceRow.number, 'SUBJECT', values.SUBJECT)); continue; }
      if (!subject.item) { issues.push(this.issue('SUBJECT_NOT_FOUND', sourceRow.number, 'SUBJECT', values.SUBJECT)); continue; }
      if (subject.item.status !== 'ACTIVE') { issues.push(this.issue('SUBJECT_INACTIVE', sourceRow.number)); continue; }
      const teacherResult = resolveTeacherCandidates(values.TEACHER, revision.teacherIdentifierMode, context.users, context.teacherAliases);
      if (teacherResult.length === 0) { issues.push(this.issue('TEACHER_NOT_FOUND', sourceRow.number, 'TEACHER', values.TEACHER)); continue; }
      if (teacherResult.length > 1) { issues.push(this.issue('TEACHER_AMBIGUOUS', sourceRow.number, 'TEACHER', values.TEACHER)); continue; }
      const teacher = teacherResult[0]!;
      if (teacher.status !== 'ACTIVE') { issues.push(this.issue('TEACHER_INACTIVE', sourceRow.number)); continue; }
      if (!teacher.profile?.isTeachingStaff) { issues.push(this.issue('TEACHER_NOT_TEACHING_STAFF', sourceRow.number)); continue; }
      const identityAssignments = context.assignments.filter((item) => item.schoolClassId === schoolClass.item!.id && item.subjectId === subject.item!.id && item.teacherUserId === teacher.id);
      if (identityAssignments.length === 0) { issues.push(this.issue('ASSIGNMENT_NOT_FOUND', sourceRow.number)); continue; }
      const covered = identityAssignments.filter((item) => formatCivilDate(item.validFrom) <= target.effectiveFrom && (!item.validUntil || formatCivilDate(item.validUntil) >= target.calendarEndDate));
      if (covered.length === 0) { issues.push(this.issue('ASSIGNMENT_COVERAGE_GAP', sourceRow.number)); continue; }
      if (covered.length > 1) { issues.push(this.issue('ASSIGNMENT_AMBIGUOUS', sourceRow.number)); continue; }
      const assignment = covered[0]!;
      const canonical: TimetableImportCanonicalPreviewRow = { sourceRowNumber: sourceRow.number, weekday, timeSlotDefinitionId: slot.id, schoolClassId: schoolClass.item.id, schoolClassCode: schoolClass.item.code, subjectId: subject.item.id, subjectCode: subject.item.code, teachingAssignmentId: assignment.id, teacherUserId: teacher.id, teacherDisplayName: teacher.profile.displayName, teacherStaffCode: teacher.profile.staffCode, normalizedSourceValues: values };
      rows.push(canonical);
      transient.push({ id: `source-row-${sourceRow.number.toString().padStart(6, '0')}`, timetableVersionId: 'preview', academicYearId: dto.academicYearId, weekday, timeSlotDefinitionId: slot.id, schoolClassId: schoolClass.item.id, subjectId: subject.item.id, teachingAssignmentId: assignment.id, teacherUserId: teacher.id, createdAt: new Date(0), timeSlotDefinition: slot, schoolClass: schoolClass.item, subject: subject.item, teacher, teachingAssignment: assignment } as EnrichedTimetableEntry);
    }
    this.addDuplicateIssues(rows, issues);
    const sourceById = new Map(transient.map((entry) => [entry.id, Number(entry.id.slice(-6))]));
    for (const validation of evaluateTimetableEntries({ entries: transient, teachingWeekdays: target.teachingWeekdays, effectiveFrom: target.effectiveFrom, calendarEndDate: target.calendarEndDate })) {
      if (validation.code === 'EMPTY_TIMETABLE' || !['WEEKDAY_NOT_IN_CALENDAR', 'CLASS_TIME_OVERLAP', 'TEACHER_TIME_OVERLAP'].includes(validation.code)) continue;
      const related = (validation.entryIds ?? []).map((id) => sourceById.get(id)!).filter(Boolean);
      issues.push({ ...this.issue(validation.code, related[0]), relatedSourceRowNumbers: related.length > 1 ? related : undefined });
    }
    const orderedIssues = sortPreviewIssues(issues); const blockingIssueCount = orderedIssues.filter((item) => item.severity === 'ERROR').length;
    const baseline = await this.loadBaseline(dto.academicYearId, target.effectiveFrom);
    const diff = blockingIssueCount === 0 ? computePreviewDiff(rows.map(this.diffRow), baseline.entries.map(this.baselineDiffRow)) : null;
    return { profileId: revision.profileId, profileRevisionId: revision.id, source: { sourceFileName: this.sourceFileName(file!.originalname), sheetName: sheet.name, headerRowNumber: dto.headerRowNumber, sourceRowCount }, target: { academicYearId: dto.academicYearId, calendarVersionId: dto.calendarVersionId, effectiveAcademicWeekId: dto.effectiveAcademicWeekId, effectiveFrom: target.effectiveFrom, calendarEndDate: target.calendarEndDate }, rows, issues: orderedIssues, blockingIssueCount, warningCount: orderedIssues.filter((item) => item.severity === 'WARNING').length, canConfirm: blockingIssueCount === 0, baseline: { date: target.effectiveFrom, timetableVersion: baseline.version }, diff };
  }

  private validateFile(file: UploadedWorkbookFile | undefined): void {
    if (!file) throw new BadRequestException({ error: 'TIMETABLE_IMPORT_FILE_REQUIRED', message: 'XLSX file is required.' });
    if (file.size > MAX_XLSX_BYTES) throw new PayloadTooLargeException({ error: 'TIMETABLE_IMPORT_FILE_TOO_LARGE', message: 'XLSX file exceeds 8 MiB.' });
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) throw new UnsupportedMediaTypeException({ error: 'TIMETABLE_IMPORT_UNSUPPORTED_FILE_TYPE', message: 'Only .xlsx files are accepted.' });
    if (!['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'].includes(file.mimetype)) throw new UnsupportedMediaTypeException({ error: 'TIMETABLE_IMPORT_UNSUPPORTED_FILE_TYPE', message: 'Unsupported workbook media type.' });
  }

  private assertUniqueMappings(revision: RevisionContext): void {
    if (revision.columnMappings.length !== semanticFieldOrder.length
      || new Set(revision.columnMappings.map((item) => item.semanticField)).size !== semanticFieldOrder.length
      || new Set(revision.columnMappings.map((item) => item.sourceHeaderKey)).size !== semanticFieldOrder.length) {
      throw new ConflictException({ error: 'TIMETABLE_IMPORT_PROFILE_MAPPING_INVALID', message: 'Profile revision must contain six unique mappings.' });
    }
  }

  private sourceFileName(value: string): string {
    const leaf = value.replaceAll('\\', '/').split('/').at(-1) ?? '';
    const safe = [...leaf].filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    }).join('');
    return safe.slice(0, 255) || 'workbook.xlsx';
  }
  private headerMappings(revision: RevisionContext): HeaderMapping[] { const order = new Map(semanticFieldOrder.map((field, index) => [field, index])); return [...revision.columnMappings].sort((a, b) => (order.get(a.semanticField) ?? 99) - (order.get(b.semanticField) ?? 99)).map((item) => ({ semanticField: item.semanticField, sourceHeaderKey: item.sourceHeaderKey })); }
  private async requireActiveRevision(id: string): Promise<RevisionContext> { const row = await this.prisma.timetableImportProfileRevision.findUnique({ where: { id }, include: { profile: true, columnMappings: true } }); if (!row) throw new NotFoundException('Không tìm thấy phiên bản cấu hình nhập.'); if (!row.isActive) throw new ConflictException({ error: 'TIMETABLE_IMPORT_PROFILE_REVISION_NOT_ACTIVE', message: 'Phiên bản cấu hình không còn hoạt động.' }); if (new Set(row.columnMappings.map((item) => item.semanticField)).size !== semanticFieldOrder.length) throw new ConflictException({ error: 'TIMETABLE_IMPORT_PROFILE_MAPPING_INVALID', message: 'Phiên bản cấu hình không có đủ sáu ánh xạ.' }); return row; }

  private async resolveTarget(dto: PreviewTimetableImportWorkbookDto) { const year = await this.prisma.academicYear.findUnique({ where: { id: dto.academicYearId } }); if (!year) throw new NotFoundException('Không tìm thấy năm học.'); const calendar = await this.prisma.academicCalendarVersion.findUnique({ where: { id: dto.calendarVersionId } }); if (!calendar) throw new NotFoundException('Không tìm thấy phiên lịch.'); if (calendar.academicYearId !== dto.academicYearId) throw new ConflictException('Phiên lịch không thuộc năm học.'); const week = await this.prisma.academicWeek.findUnique({ where: { id: dto.effectiveAcademicWeekId }, include: { segments: true } }); if (!week) throw new NotFoundException('Không tìm thấy tuần học.'); if (week.calendarVersionId !== calendar.id) throw new ConflictException('Tuần học không thuộc phiên lịch.'); if (week.segments.length === 0) throw new ConflictException('Tuần học chưa có phân đoạn ngày.'); return { effectiveFrom: week.segments.map((item) => formatCivilDate(item.startDate)).sort()[0]!, calendarEndDate: formatCivilDate(calendar.endDate), teachingWeekdays: calendar.teachingWeekdays }; }

  private async loadResolutionContext(profileId: string, academicYearId: string) { const [classes, subjects, users, aliases, slots, assignments] = await Promise.all([this.prisma.schoolClass.findMany({ where: { academicYearId } }), this.prisma.subject.findMany(), this.prisma.user.findMany({ include: { profile: true } }), this.prisma.timetableImportEntityAlias.findMany({ where: { profileId, isActive: true, OR: [{ academicYearId }, { academicYearId: null }] } }), this.prisma.timeSlotDefinition.findMany({ where: { academicYearId }, orderBy: { revision: 'desc' } }), this.prisma.teachingAssignment.findMany({ where: { academicYearId } })]); return { classes, subjects, users, slots, assignments, classAliases: aliases.filter((item) => item.entityType === 'SCHOOL_CLASS' && item.academicYearId === academicYearId), subjectAliases: aliases.filter((item) => item.entityType === 'SUBJECT' && item.academicYearId === null), teacherAliases: aliases.filter((item) => item.entityType === 'TEACHER' && item.academicYearId === null) }; }
  private resolveCodeAlias<T extends { id: string }>(value: string, rows: T[], aliases: Array<{ sourceValueKey: string; schoolClassId: string | null; subjectId: string | null }>, code: keyof T) { const key = normalizeLookupKey(value); const ids = new Set<string>(); const codeRow = rows.find((row) => normalizeLookupKey(String(row[code])) === key); if (codeRow) ids.add(codeRow.id); for (const alias of aliases) { if (alias.sourceValueKey !== key) continue; const id = alias.schoolClassId ?? alias.subjectId; if (id) ids.add(id); } return { item: ids.size === 1 ? rows.find((row) => row.id === [...ids][0]) : undefined, conflict: ids.size > 1 }; }
  private issue(code: string, sourceRowNumber?: number, semanticField?: TimetableImportSemanticField, value?: string): TimetableImportPreviewIssue { return { code: code as TimetableImportPreviewIssue['code'], severity: 'ERROR', category: code.includes('CELL') || code.includes('ROW') || code === 'HIDDEN_MAPPED_DATA' ? 'ROW' : code.includes('OVERLAP') ? 'VALIDATION' : 'RESOLUTION', message: messages[code] ?? code, ...(sourceRowNumber ? { sourceRowNumber } : {}), ...(semanticField ? { semanticField } : {}), ...(value ? { boundedSourceValue: value.slice(0, MAX_MAPPED_CELL_TEXT_LENGTH) } : {}) }; }
  private addDuplicateIssues(rows: TimetableImportCanonicalPreviewRow[], issues: TimetableImportPreviewIssue[]): void { const grouped = new Map<string, TimetableImportCanonicalPreviewRow[]>(); for (const row of rows) { const key = `${row.weekday}:${row.timeSlotDefinitionId}:${row.schoolClassId}`; grouped.set(key, [...(grouped.get(key) ?? []), row]); } for (const group of grouped.values()) if (group.length > 1) for (const row of group) issues.push({ ...this.issue('DUPLICATE_CANONICAL_ROW', row.sourceRowNumber), relatedSourceRowNumbers: group.map((item) => item.sourceRowNumber) }); }
  private diffRow(row: TimetableImportCanonicalPreviewRow): TimetableImportPreviewDiffRow { return { weekday: row.weekday, timeSlotDefinitionId: row.timeSlotDefinitionId, schoolClassId: row.schoolClassId, sourceRowNumber: row.sourceRowNumber, subjectId: row.subjectId, teachingAssignmentId: row.teachingAssignmentId, teacherUserId: row.teacherUserId }; }
  private baselineDiffRow(row: { weekday: AcademicWeekday; timeSlotDefinitionId: string; schoolClassId: string; subjectId: string; teachingAssignmentId: string; teacherUserId: string }): TimetableImportPreviewDiffRow { return { ...row }; }
  private async loadBaseline(academicYearId: string, date: string) { const targetDate = parseCivilDate(date); const version = await this.prisma.timetableVersion.findFirst({ where: { academicYearId, status: { in: ['ACTIVE', 'SUPERSEDED'] }, effectiveFrom: { lte: targetDate }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: targetDate } }] }, orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }] }); const entries = version ? await this.prisma.timetableEntry.findMany({ where: { timetableVersionId: version.id } }) : []; return { entries, version: version ? { id: version.id, versionNumber: version.versionNumber, status: version.status, effectiveFrom: version.effectiveFrom ? formatCivilDate(version.effectiveFrom) : null, effectiveUntil: version.effectiveUntil ? formatCivilDate(version.effectiveUntil) : null } : null }; }
}
