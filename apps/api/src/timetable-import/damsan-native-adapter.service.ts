import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AcademicWeekday, Prisma, TimetableImportSemanticField } from '@prisma/client';
import {
  TimetableImportCanonicalPreviewRow,
  TimetableImportNativeSessionMode,
  TimetableImportPreviewDiffRow,
  TimetableImportPreviewIssue,
  TimetableImportPreviewIssueCode,
  TimetableImportWorkbookInspectionResponse,
  TimetableImportWorkbookPreviewResponse,
  TimetableImportWorksheetInspection,
  TimetableValidationIssueCode,
} from '@baogiang/contracts';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { EnrichedTimetableEntry } from '../timetables/mapper';
import { evaluateTimetableEntries } from '../timetables/timetable-validation';
import { PreviewTimetableImportWorkbookDto } from './dto';
import { normalizeLookupKey } from './normalization';
import {
  computePreviewDiff,
  sortPreviewIssues,
} from './workbook-canonicalization';
import { ParsedWorkbook } from './workbook-parser.types';
import {
  DAMSAN_NATIVE_AFTERNOON_SHEET_SENTINEL,
  DAMSAN_NATIVE_HEADER_ROW_SENTINEL,
  DAMSAN_NATIVE_MORNING_SHEET_SENTINEL,
  DAMSAN_NATIVE_SHEETS,
  DAMSAN_NATIVE_SHEET_SENTINEL,
  DamSanNativeErrorCode,
  DamSanNativeTimetableException,
  NativeSession,
  SafeEvidence,
} from './damsan-native-adapter.types';
import { validateAndExtractWorkbookStructure } from './damsan-native-parser';
import { reconcileNativeWorkbook } from './damsan-native-reconciler';

@Injectable()
export class DamSanNativeTimetableAdapter {
  constructor(private readonly prisma: PrismaService) {}

  inspect(
    parsed: ParsedWorkbook,
    profileRevisionId: string,
    profileId: string,
    sourceFileName: string,
    mode: TimetableImportNativeSessionMode = 'BOTH',
  ): TimetableImportWorkbookInspectionResponse {
    validateAndExtractWorkbookStructure(parsed, mode);

    const sheets: TimetableImportWorksheetInspection[] = parsed.sheets.map((sheet) => ({
      name: sheet.name,
      state: sheet.state,
      nonBlank: true,
      selectable: true,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      matchesProfileSheetHint: true,
      headerCandidates: [{ rowNumber: 6, matchedSemanticFields: [], complete: true }],
    }));

    return {
      profileRevisionId,
      profileId,
      sourceFileName,
      sheets,
      issues: [],
    };
  }

  async preview(
    parsed: ParsedWorkbook,
    dto: PreviewTimetableImportWorkbookDto,
    sourceFileName: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<TimetableImportWorkbookPreviewResponse> {
    const revision = await db.timetableImportProfileRevision.findUnique({
      where: { id: dto.profileRevisionId },
      include: { profile: true },
    });
    if (!revision) throw new NotFoundException('Không tìm thấy phiên bản cấu hình nhập.');
    if (!revision.isActive) {
      throw new ConflictException({
        error: 'TIMETABLE_IMPORT_PROFILE_REVISION_NOT_ACTIVE',
        message: 'Phiên bản cấu hình không còn hoạt động.',
      });
    }

    const sessionMode = dto.nativeSessionMode ?? 'BOTH';
    const structure = validateAndExtractWorkbookStructure(parsed, sessionMode);
    const reconciliation = reconcileNativeWorkbook(structure, sessionMode);

    const target = await this.resolveTarget(dto, db);
    const context = await this.loadResolutionContext(revision.profileId, dto.academicYearId, db);

    const issues: TimetableImportPreviewIssue[] = [];
    const authoredRows: TimetableImportCanonicalPreviewRow[] = [];
    const transient: EnrichedTimetableEntry[] = [];

    // 0. Verify effective date matches target week
    if (structure.effectiveDate !== target.effectiveFrom) {
      issues.push(this.issue(
        DamSanNativeErrorCode.TKB_NATIVE_EFFECTIVE_DATE_MISMATCH,
        4,
        `Workbook effective date "${structure.effectiveDate}" does not match target week effective date "${target.effectiveFrom}".`,
        { expected: target.effectiveFrom, actual: structure.effectiveDate },
      ));
    }

    // 1. Resolve Classes from Row 6 headers for selected session(s)
    const morningClassMap = new Map<string, { id: string; code: string; gradeLevel: number }>();
    if (sessionMode === 'BOTH' || sessionMode === 'MORNING') {
      const morningResolvedClassIds = new Set<string>();
      for (const classCode of structure.morningClasses) {
        const resolved = this.resolveClass(classCode, context.classes, context.classAliases);
        if (resolved.conflict) {
          issues.push(this.issue(
            'CLASS_IDENTITY_CONFLICT',
            6,
            `Morning class header "${classCode}" has conflicting canonical identity.`,
            { sheet: DAMSAN_NATIVE_SHEETS.MORNING_CLASS, classCode },
          ));
        } else if (resolved.inactive) {
          issues.push(this.issue(
            'CLASS_INACTIVE',
            6,
            `Morning class header "${classCode}" resolves to an inactive class.`,
            { sheet: DAMSAN_NATIVE_SHEETS.MORNING_CLASS, classCode },
          ));
        } else if (!resolved.item) {
          issues.push(this.issue(
            DamSanNativeErrorCode.TKB_NATIVE_CLASS_HEADER_UNKNOWN,
            6,
            `Morning class header "${classCode}" was not found in active classes.`,
            { sheet: DAMSAN_NATIVE_SHEETS.MORNING_CLASS, classCode },
          ));
        } else if (morningResolvedClassIds.has(resolved.item.id)) {
          issues.push(this.issue(
            'CLASS_IDENTITY_CONFLICT',
            6,
            `Morning class header "${classCode}" resolves to duplicate canonical class identity "${resolved.item.code}".`,
            { sheet: DAMSAN_NATIVE_SHEETS.MORNING_CLASS, classCode },
          ));
        } else {
          morningResolvedClassIds.add(resolved.item.id);
          morningClassMap.set(classCode, resolved.item);
        }
      }
    }

    const afternoonClassMap = new Map<string, { id: string; code: string; gradeLevel: number }>();
    if (sessionMode === 'BOTH' || sessionMode === 'AFTERNOON') {
      const afternoonResolvedClassIds = new Set<string>();
      for (const classCode of structure.afternoonClasses) {
        const resolved = this.resolveClass(classCode, context.classes, context.classAliases);
        if (resolved.conflict) {
          issues.push(this.issue(
            'CLASS_IDENTITY_CONFLICT',
            6,
            `Afternoon class header "${classCode}" has conflicting canonical identity.`,
            { sheet: DAMSAN_NATIVE_SHEETS.AFTERNOON_CLASS, classCode },
          ));
        } else if (resolved.inactive) {
          issues.push(this.issue(
            'CLASS_INACTIVE',
            6,
            `Afternoon class header "${classCode}" resolves to an inactive class.`,
            { sheet: DAMSAN_NATIVE_SHEETS.AFTERNOON_CLASS, classCode },
          ));
        } else if (!resolved.item) {
          issues.push(this.issue(
            DamSanNativeErrorCode.TKB_NATIVE_CLASS_HEADER_UNKNOWN,
            6,
            `Afternoon class header "${classCode}" was not found in active classes.`,
            { sheet: DAMSAN_NATIVE_SHEETS.AFTERNOON_CLASS, classCode },
          ));
        } else if (afternoonResolvedClassIds.has(resolved.item.id)) {
          issues.push(this.issue(
            'CLASS_IDENTITY_CONFLICT',
            6,
            `Afternoon class header "${classCode}" resolves to duplicate canonical class identity "${resolved.item.code}".`,
            { sheet: DAMSAN_NATIVE_SHEETS.AFTERNOON_CLASS, classCode },
          ));
        } else {
          afternoonResolvedClassIds.add(resolved.item.id);
          afternoonClassMap.set(classCode, resolved.item);
        }
      }
    }

    // 2. Resolve Teachers from reconciled active teacher rows
    const teacherUserMap = new Map<string, { id: string; profile: { staffCode: string | null; displayName: string } }>();
    for (const rowInfo of reconciliation.teacherRows.values()) {
      if (rowInfo.isZeroAllocation || !rowInfo.derivedTeacherCode) {
        continue;
      }
      const teacherResult = this.resolveTeacher(rowInfo.derivedTeacherCode, context.users, context.teacherAliases);
      if (teacherResult.status === 'NOT_FOUND') {
        issues.push(this.issue(
          DamSanNativeErrorCode.TKB_NATIVE_TEACHER_IDENTITY_UNKNOWN,
          rowInfo.rowRef.rowNumber,
          `Derived teacher code "${rowInfo.derivedTeacherCode}" could not be resolved to an active teaching user.`,
          { sheet: rowInfo.rowRef.sheet, rowNumber: rowInfo.rowRef.rowNumber, derivedTeacherCode: rowInfo.derivedTeacherCode },
        ));
      } else if (teacherResult.status === 'CONFLICT') {
        issues.push(this.issue(
          DamSanNativeErrorCode.TKB_NATIVE_TEACHER_CODE_CONFLICT,
          rowInfo.rowRef.rowNumber,
          `Derived teacher code "${rowInfo.derivedTeacherCode}" resolved to multiple or conflicting users.`,
          { sheet: rowInfo.rowRef.sheet, rowNumber: rowInfo.rowRef.rowNumber, derivedTeacherCode: rowInfo.derivedTeacherCode },
        ));
      } else if (teacherResult.user) {
        teacherUserMap.set(rowInfo.derivedTeacherCode, teacherResult.user);
      }
    }

    // 3. Resolve Subjects from reconciled class slots
    const subjectMap = new Map<string, { id: string; code: string }>();
    const distinctSubjectCodes = new Set(
      reconciliation.reconciledSlots.map((s) => s.classSlot.subjectCode!).filter(Boolean),
    );
    for (const subjectCode of distinctSubjectCodes) {
      const resolved = this.resolveSubject(subjectCode, context.subjects, context.subjectAliases);
      if (resolved.conflict) {
        issues.push(this.issue(
          'SUBJECT_IDENTITY_CONFLICT',
          undefined,
          `Subject code "${subjectCode}" has conflicting canonical identity.`,
          { subjectCode },
        ));
      } else if (resolved.inactive) {
        issues.push(this.issue(
          'SUBJECT_INACTIVE',
          undefined,
          `Subject code "${subjectCode}" resolves to an inactive subject.`,
          { subjectCode },
        ));
      } else if (!resolved.item) {
        issues.push(this.issue(
          DamSanNativeErrorCode.TKB_NATIVE_SUBJECT_UNKNOWN,
          undefined,
          `Subject code "${subjectCode}" was not found in active subjects.`,
          { subjectCode },
        ));
      } else {
        subjectMap.set(subjectCode, resolved.item);
      }
    }

    // 4. Map Reconciled Slots to Canonical Preview Rows
    for (const slot of reconciliation.reconciledSlots) {
      const { classSlot } = slot;
      const classMap = classSlot.session === 'MORNING' ? morningClassMap : afternoonClassMap;
      const schoolClass = classMap.get(classSlot.classCode);
      const subject = classSlot.subjectCode ? subjectMap.get(classSlot.subjectCode) : undefined;
      const teacher = slot.derivedTeacherCode ? teacherUserMap.get(slot.derivedTeacherCode) : undefined;

      if (!schoolClass || !subject || !teacher) {
        // Individual missing issues were already recorded above
        continue;
      }

      // Slot resolution
      const timeSlot = this.resolveTimeSlot(
        classSlot.session,
        classSlot.weekday,
        classSlot.period,
        context.slots,
        classSlot.rowNumber,
        issues,
      );
      if (!timeSlot) continue;

      // Assignment resolution
      const assignment = this.resolveAssignment(
        schoolClass.id,
        subject.id,
        teacher.id,
        target.effectiveFrom,
        target.calendarEndDate,
        context.assignments,
        classSlot.rowNumber,
        issues,
      );
      if (!assignment) continue;

      const normalizedSourceValues: Record<TimetableImportSemanticField, string> = {
        WEEKDAY: classSlot.weekday,
        SESSION: classSlot.session === 'MORNING' ? 'Sáng' : 'Chiều',
        PERIOD_ORDINAL: String(classSlot.period),
        SCHOOL_CLASS: classSlot.classCode,
        SUBJECT: classSlot.subjectCode!,
        TEACHER: slot.derivedTeacherCode,
      };

      authoredRows.push({
        sourceRowNumber: classSlot.rowNumber,
        weekday: classSlot.weekday,
        timeSlotDefinitionId: timeSlot.id,
        schoolClassId: schoolClass.id,
        schoolClassCode: schoolClass.code,
        subjectId: subject.id,
        subjectCode: subject.code,
        teachingAssignmentId: assignment.id,
        teacherUserId: teacher.id,
        teacherDisplayName: teacher.profile.displayName,
        teacherStaffCode: teacher.profile.staffCode,
        normalizedSourceValues,
      });

      const fullUser = context.users.find((u) => u.id === teacher.id) ?? teacher;

      transient.push({
        id: `source-slot-${classSlot.session}-${classSlot.day}-${classSlot.period}-${classSlot.classCode}`,
        timetableVersionId: 'preview',
        academicYearId: dto.academicYearId,
        weekday: classSlot.weekday,
        timeSlotDefinitionId: timeSlot.id,
        schoolClassId: schoolClass.id,
        subjectId: subject.id,
        teachingAssignmentId: assignment.id,
        teacherUserId: teacher.id,
        createdAt: new Date(0),
        timeSlotDefinition: timeSlot,
        schoolClass,
        subject,
        teacher: fullUser,
        teachingAssignment: assignment,
      } as EnrichedTimetableEntry);
    }

    // 5. Load Baseline and Perform Exact Carry-Forward for Selective Modes
    const baseline = await this.loadBaseline(dto.academicYearId, target.effectiveFrom, db);

    if (sessionMode !== 'BOTH' && !baseline.version) {
      throw new DamSanNativeTimetableException(
        DamSanNativeErrorCode.TKB_NATIVE_CARRY_FORWARD_BASELINE_MISSING,
        `Cannot selectively import ${sessionMode} timetable without an active or superseded canonical baseline effective at ${target.effectiveFrom}.`,
        { expected: target.effectiveFrom },
      );
    }

    const carriedRows: TimetableImportCanonicalPreviewRow[] = [];
    if (sessionMode !== 'BOTH' && baseline.version && baseline.entries.length > 0) {
      const slotMap = new Map(context.slots.map((s) => [s.id, s]));
      const classMap = new Map(context.classes.map((c) => [c.id, c]));
      const subjectMapById = new Map(context.subjects.map((s) => [s.id, s]));
      const userMapById = new Map(context.users.map((u) => [u.id, u]));
      const assignmentMapById = new Map(context.assignments.map((a) => [a.id, a]));

      for (const entry of baseline.entries) {
        const slotDef = slotMap.get(entry.timeSlotDefinitionId);
        if (!slotDef) {
          throw new DamSanNativeTimetableException(
            DamSanNativeErrorCode.TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID,
            `Không tìm thấy khung tiết hợp lệ cho dòng bảo lưu ${entry.id}.`,
            {
              entryId: entry.id,
              missingRelation: 'TimeSlotDefinition',
              referenceId: entry.timeSlotDefinitionId,
            },
          );
        }

        // Only carry forward rows whose session is NOT authored by this request
        if (slotDef.session === sessionMode) {
          continue;
        }

        const schoolClass = classMap.get(entry.schoolClassId);
        if (!schoolClass) {
          throw new DamSanNativeTimetableException(
            DamSanNativeErrorCode.TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID,
            `Không tìm thấy lớp học hợp lệ cho dòng bảo lưu ${entry.id}.`,
            {
              entryId: entry.id,
              missingRelation: 'SchoolClass',
              referenceId: entry.schoolClassId,
            },
          );
        }

        const subject = subjectMapById.get(entry.subjectId);
        if (!subject) {
          throw new DamSanNativeTimetableException(
            DamSanNativeErrorCode.TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID,
            `Không tìm thấy môn học hợp lệ cho dòng bảo lưu ${entry.id}.`,
            {
              entryId: entry.id,
              missingRelation: 'Subject',
              referenceId: entry.subjectId,
            },
          );
        }

        const user = userMapById.get(entry.teacherUserId);
        if (!user) {
          throw new DamSanNativeTimetableException(
            DamSanNativeErrorCode.TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID,
            `Không tìm thấy giáo viên hợp lệ cho dòng bảo lưu ${entry.id}.`,
            {
              entryId: entry.id,
              missingRelation: 'User',
              referenceId: entry.teacherUserId,
            },
          );
        }

        const assignment = assignmentMapById.get(entry.teachingAssignmentId);
        if (!assignment) {
          throw new DamSanNativeTimetableException(
            DamSanNativeErrorCode.TKB_NATIVE_CARRY_FORWARD_PROVENANCE_INVALID,
            `Không tìm thấy phân công giảng dạy hợp lệ cho dòng bảo lưu ${entry.id}.`,
            {
              entryId: entry.id,
              missingRelation: 'TeachingAssignment',
              referenceId: entry.teachingAssignmentId,
            },
          );
        }

        carriedRows.push({
          sourceRowNumber: 0,
          weekday: entry.weekday,
          timeSlotDefinitionId: entry.timeSlotDefinitionId,
          schoolClassId: entry.schoolClassId,
          schoolClassCode: schoolClass.code,
          subjectId: entry.subjectId,
          subjectCode: subject.code,
          teachingAssignmentId: entry.teachingAssignmentId,
          teacherUserId: entry.teacherUserId,
          teacherDisplayName: user.profile?.displayName ?? '',
          teacherStaffCode: user.profile?.staffCode ?? null,
          normalizedSourceValues: {
            WEEKDAY: entry.weekday,
            SESSION: slotDef.session === 'MORNING' ? 'Sáng' : slotDef.session === 'AFTERNOON' ? 'Chiều' : slotDef.session,
            PERIOD_ORDINAL: String(slotDef.ordinal),
            SCHOOL_CLASS: schoolClass.code,
            SUBJECT: subject.code,
            TEACHER: user.profile?.staffCode ?? user.profile?.displayName ?? '',
          },
        });

        transient.push({
          id: `carried-entry-${entry.id}`,
          timetableVersionId: 'preview',
          academicYearId: dto.academicYearId,
          weekday: entry.weekday,
          timeSlotDefinitionId: entry.timeSlotDefinitionId,
          schoolClassId: entry.schoolClassId,
          subjectId: entry.subjectId,
          teachingAssignmentId: entry.teachingAssignmentId,
          teacherUserId: entry.teacherUserId,
          createdAt: entry.createdAt,
          timeSlotDefinition: slotDef,
          schoolClass,
          subject,
          teacher: user,
          teachingAssignment: assignment,
        } as EnrichedTimetableEntry);
      }
    }

    const rows = [...authoredRows, ...carriedRows];

    // 6. Add duplicate issues and timetable-wide validation on composed timetable
    this.addDuplicateIssues(rows, issues);
    for (const validation of evaluateTimetableEntries({
      entries: transient,
      teachingWeekdays: target.teachingWeekdays,
      effectiveFrom: target.effectiveFrom,
      calendarEndDate: target.calendarEndDate,
    })) {
      const mappedCode = mapValidationCodeToPreviewIssueCode(validation.code);
      if (!mappedCode) continue;
      issues.push({
        code: mappedCode,
        severity: 'ERROR',
        category: 'VALIDATION',
        message: validation.message,
      });
    }

    const orderedIssues = sortPreviewIssues(issues);
    const blockingIssueCount = orderedIssues.filter((item) => item.severity === 'ERROR').length;
    const diff = blockingIssueCount === 0
      ? computePreviewDiff(rows.map(this.diffRow), baseline.entries.map(this.baselineDiffRow))
      : null;

    const sheetName = sessionMode === 'MORNING'
      ? DAMSAN_NATIVE_MORNING_SHEET_SENTINEL
      : sessionMode === 'AFTERNOON'
        ? DAMSAN_NATIVE_AFTERNOON_SHEET_SENTINEL
        : DAMSAN_NATIVE_SHEET_SENTINEL;
    const headerRowNumber = DAMSAN_NATIVE_HEADER_ROW_SENTINEL;
    const sourceRowCount = sessionMode === 'MORNING'
      ? structure.morningClassSlots.length
      : sessionMode === 'AFTERNOON'
        ? structure.afternoonClassSlots.length
        : structure.morningClassSlots.length + structure.afternoonClassSlots.length;

    return {
      profileId: revision.profileId,
      profileRevisionId: revision.id,
      source: {
        sourceFileName,
        sheetName,
        headerRowNumber,
        sourceRowCount,
      },
      target: {
        academicYearId: dto.academicYearId,
        calendarVersionId: dto.calendarVersionId,
        effectiveAcademicWeekId: dto.effectiveAcademicWeekId,
        effectiveFrom: target.effectiveFrom,
        calendarEndDate: target.calendarEndDate,
      },
      rows,
      issues: orderedIssues,
      blockingIssueCount,
      warningCount: orderedIssues.filter((item) => item.severity === 'WARNING').length,
      canConfirm: blockingIssueCount === 0,
      baseline: { date: target.effectiveFrom, timetableVersion: baseline.version },
      composition: {
        mode: sessionMode,
        baselineTimetableVersionId: baseline.version?.id ?? null,
        authoredEntryCount: authoredRows.length,
        carriedForwardEntryCount: carriedRows.length,
        finalEntryCount: rows.length,
      },
      diff,
    };
  }

  private resolveClass(
    code: string,
    classes: Array<{ id: string; code: string; status: string; gradeLevel: number }>,
    aliases: Array<{ sourceValueKey: string; schoolClassId: string | null }>,
  ): { item?: { id: string; code: string; gradeLevel: number }; conflict?: boolean; inactive?: boolean } {
    const key = normalizeLookupKey(code);
    const candidateIds = new Set<string>();
    const directMatch = classes.find((c) => normalizeLookupKey(c.code) === key);
    if (directMatch) candidateIds.add(directMatch.id);

    for (const alias of aliases) {
      if (alias.sourceValueKey === key && alias.schoolClassId) {
        candidateIds.add(alias.schoolClassId);
      }
    }

    if (candidateIds.size === 0) return {};
    if (candidateIds.size > 1) return { conflict: true };

    const candidateId = [...candidateIds][0]!;
    const candidate = classes.find((c) => c.id === candidateId);
    if (!candidate || candidate.status !== 'ACTIVE') return { inactive: true };
    return { item: candidate };
  }

  private resolveSubject(
    code: string,
    subjects: Array<{ id: string; code: string; status: string }>,
    aliases: Array<{ sourceValueKey: string; subjectId: string | null }>,
  ): { item?: { id: string; code: string }; conflict?: boolean; inactive?: boolean } {
    const key = normalizeLookupKey(code);
    const candidateIds = new Set<string>();
    const directMatch = subjects.find((s) => normalizeLookupKey(s.code) === key);
    if (directMatch) candidateIds.add(directMatch.id);

    for (const alias of aliases) {
      if (alias.sourceValueKey === key && alias.subjectId) {
        candidateIds.add(alias.subjectId);
      }
    }

    if (candidateIds.size === 0) return {};
    if (candidateIds.size > 1) return { conflict: true };

    const candidateId = [...candidateIds][0]!;
    const candidate = subjects.find((s) => s.id === candidateId);
    if (!candidate || candidate.status !== 'ACTIVE') return { inactive: true };
    return { item: candidate };
  }

  private resolveTeacher(
    derivedCode: string,
    users: Array<{ id: string; status: string; profile: { staffCode: string | null; displayName: string; isTeachingStaff: boolean } | null }>,
    aliases: Array<{ sourceValueKey: string; teacherUserId: string | null }>,
  ): { status: 'FOUND' | 'NOT_FOUND' | 'CONFLICT'; user?: { id: string; profile: { staffCode: string | null; displayName: string } } } {
    const key = normalizeLookupKey(derivedCode);
    const candidateUserIds = new Set<string>();

    // 1. StaffProfile.staffCode match
    const staffCodeUsers = users.filter((u) => u.status === 'ACTIVE'
      && u.profile?.isTeachingStaff
      && u.profile.staffCode
      && normalizeLookupKey(u.profile.staffCode) === key);
    for (const u of staffCodeUsers) {
      candidateUserIds.add(u.id);
    }

    // 2. Approved TimetableImportEntityAlias match
    const aliasMatches = aliases.filter((a) => a.sourceValueKey === key && a.teacherUserId);
    for (const alias of aliasMatches) {
      const user = users.find((u) => u.id === alias.teacherUserId && u.status === 'ACTIVE' && u.profile?.isTeachingStaff);
      if (user) {
        candidateUserIds.add(user.id);
      }
    }

    if (candidateUserIds.size === 0) {
      return { status: 'NOT_FOUND' };
    }
    if (candidateUserIds.size > 1) {
      return { status: 'CONFLICT' };
    }

    const userId = [...candidateUserIds][0]!;
    const user = users.find((u) => u.id === userId)!;
    return {
      status: 'FOUND',
      user: {
        id: user.id,
        profile: {
          staffCode: user.profile!.staffCode,
          displayName: user.profile!.displayName,
        },
      },
    };
  }

  private resolveTimeSlot(
    session: NativeSession,
    weekday: AcademicWeekday,
    period: number,
    slots: Array<{ id: string; session: string; weekday: string; ordinal: number; isActive: boolean; allowRegularTeaching: boolean }>,
    sourceRowNumber: number,
    issues: TimetableImportPreviewIssue[],
  ) {
    const matchingHistory = slots.filter((s) => s.session === session && s.weekday === weekday && s.ordinal === period);
    if (matchingHistory.length === 0) {
      issues.push(this.issue('SLOT_NOT_FOUND', sourceRowNumber, 'Time slot coordinate was not found.'));
      return undefined;
    }
    const currentSlots = matchingHistory.filter((s) => s.isActive);
    if (currentSlots.length === 0) {
      issues.push(this.issue('SLOT_NOT_ACTIVE', sourceRowNumber, 'Time slot is inactive.'));
      return undefined;
    }
    if (currentSlots.length > 1) {
      throw new ConflictException({
        error: 'TIMETABLE_IMPORT_SLOT_CURRENT_INVARIANT',
        message: 'Multiple current time slots share one coordinate.',
      });
    }
    const slot = currentSlots[0]!;
    if (!slot.allowRegularTeaching) {
      issues.push(this.issue('SLOT_NOT_REGULAR_TEACHING', sourceRowNumber, 'Time slot does not allow regular teaching.'));
      return undefined;
    }
    return slot;
  }

  private resolveAssignment(
    schoolClassId: string,
    subjectId: string,
    teacherUserId: string,
    effectiveFrom: string,
    calendarEndDate: string,
    assignments: Array<{ id: string; schoolClassId: string; subjectId: string; teacherUserId: string; validFrom: Date; validUntil: Date | null }>,
    sourceRowNumber: number,
    issues: TimetableImportPreviewIssue[],
  ) {
    const matches = assignments.filter((a) => a.schoolClassId === schoolClassId
      && a.subjectId === subjectId
      && a.teacherUserId === teacherUserId);
    if (matches.length === 0) {
      issues.push(this.issue('ASSIGNMENT_NOT_FOUND', sourceRowNumber, 'Teaching assignment was not found.'));
      return undefined;
    }
    const covered = matches.filter((a) => formatCivilDate(a.validFrom) <= effectiveFrom
      && (!a.validUntil || formatCivilDate(a.validUntil) >= calendarEndDate));
    if (covered.length === 0) {
      issues.push(this.issue('ASSIGNMENT_COVERAGE_GAP', sourceRowNumber, 'Teaching assignment does not cover the validation envelope.'));
      return undefined;
    }
    if (covered.length > 1) {
      issues.push(this.issue('ASSIGNMENT_AMBIGUOUS', sourceRowNumber, 'Teaching assignment is ambiguous.'));
      return undefined;
    }
    return covered[0]!;
  }

  private issue(
    code: string,
    sourceRowNumber?: number,
    message?: string,
    safeEvidence?: SafeEvidence,
  ): TimetableImportPreviewIssue {
    return {
      code: code as TimetableImportPreviewIssue['code'],
      severity: 'ERROR',
      category: code.startsWith('TKB_NATIVE_')
        ? 'RESOLUTION'
        : code.includes('CELL') || code.includes('ROW')
          ? 'ROW'
          : code.includes('OVERLAP') || code === 'EMPTY_TIMETABLE'
            ? 'VALIDATION'
            : 'RESOLUTION',
      message: message ?? code,
      ...(sourceRowNumber ? { sourceRowNumber } : {}),
      ...(safeEvidence?.classCode ? { boundedSourceValue: safeEvidence.classCode } : {}),
    };
  }

  private addDuplicateIssues(rows: TimetableImportCanonicalPreviewRow[], issues: TimetableImportPreviewIssue[]): void {
    const grouped = new Map<string, TimetableImportCanonicalPreviewRow[]>();
    for (const row of rows) {
      const key = `${row.weekday}:${row.timeSlotDefinitionId}:${row.schoolClassId}`;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    for (const group of grouped.values()) {
      if (group.length > 1) {
        for (const row of group) {
          issues.push({
            ...this.issue('DUPLICATE_CANONICAL_ROW', row.sourceRowNumber, 'Canonical timetable row is duplicated.'),
            relatedSourceRowNumbers: group.map((item) => item.sourceRowNumber),
          });
        }
      }
    }
  }

  private diffRow(row: TimetableImportCanonicalPreviewRow): TimetableImportPreviewDiffRow {
    return {
      weekday: row.weekday,
      timeSlotDefinitionId: row.timeSlotDefinitionId,
      schoolClassId: row.schoolClassId,
      sourceRowNumber: row.sourceRowNumber,
      subjectId: row.subjectId,
      teachingAssignmentId: row.teachingAssignmentId,
      teacherUserId: row.teacherUserId,
    };
  }

  private baselineDiffRow(row: {
    weekday: AcademicWeekday;
    timeSlotDefinitionId: string;
    schoolClassId: string;
    subjectId: string;
    teachingAssignmentId: string;
    teacherUserId: string;
  }): TimetableImportPreviewDiffRow {
    return { ...row };
  }

  private async loadBaseline(academicYearId: string, date: string, db: Prisma.TransactionClient) {
    const targetDate = parseCivilDate(date);
    const version = await db.timetableVersion.findFirst({
      where: {
        academicYearId,
        status: { in: ['ACTIVE', 'SUPERSEDED'] },
        effectiveFrom: { lte: targetDate },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: targetDate } }],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
    });
    const entries = version ? await db.timetableEntry.findMany({ where: { timetableVersionId: version.id } }) : [];
    return {
      entries,
      version: version ? {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        effectiveFrom: version.effectiveFrom ? formatCivilDate(version.effectiveFrom) : null,
        effectiveUntil: version.effectiveUntil ? formatCivilDate(version.effectiveUntil) : null,
      } : null,
    };
  }

  private async loadResolutionContext(profileId: string, academicYearId: string, db: Prisma.TransactionClient) {
    const [classes, subjects, users, aliases, slots, assignments] = await Promise.all([
      db.schoolClass.findMany({ where: { academicYearId } }),
      db.subject.findMany(),
      db.user.findMany({ include: { profile: true } }),
      db.timetableImportEntityAlias.findMany({ where: { profileId, isActive: true, OR: [{ academicYearId }, { academicYearId: null }] } }),
      db.timeSlotDefinition.findMany({ where: { academicYearId }, orderBy: { revision: 'desc' } }),
      db.teachingAssignment.findMany({ where: { academicYearId } }),
    ]);
    return {
      classes,
      subjects,
      users,
      slots,
      assignments,
      classAliases: aliases.filter((item) => item.entityType === 'SCHOOL_CLASS' && item.academicYearId === academicYearId),
      subjectAliases: aliases.filter((item) => item.entityType === 'SUBJECT' && item.academicYearId === null),
      teacherAliases: aliases.filter((item) => item.entityType === 'TEACHER' && item.academicYearId === null),
    };
  }

  private async resolveTarget(dto: PreviewTimetableImportWorkbookDto, db: Prisma.TransactionClient) {
    const year = await db.academicYear.findUnique({ where: { id: dto.academicYearId } });
    if (!year) throw new NotFoundException('Không tìm thấy năm học.');
    const calendar = await db.academicCalendarVersion.findUnique({ where: { id: dto.calendarVersionId } });
    if (!calendar) throw new NotFoundException('Không tìm thấy phiên lịch.');
    if (calendar.academicYearId !== dto.academicYearId) throw new ConflictException('Phiên lịch không thuộc năm học.');
    const week = await db.academicWeek.findUnique({ where: { id: dto.effectiveAcademicWeekId }, include: { segments: true } });
    if (!week) throw new NotFoundException('Không tìm thấy tuần học.');
    if (week.calendarVersionId !== calendar.id) throw new ConflictException('Tuần học không thuộc phiên lịch.');
    if (week.segments.length === 0) throw new ConflictException('Tuần học chưa có phân đoạn ngày.');
    return {
      effectiveFrom: week.segments.map((item) => formatCivilDate(item.startDate)).sort()[0]!,
      calendarEndDate: formatCivilDate(calendar.endDate),
      teachingWeekdays: calendar.teachingWeekdays,
    };
  }
}

function mapValidationCodeToPreviewIssueCode(code: TimetableValidationIssueCode): TimetableImportPreviewIssueCode | null {
  switch (code) {
    case 'EMPTY_TIMETABLE':
    case 'WEEKDAY_NOT_IN_CALENDAR':
    case 'SLOT_NOT_ACTIVE':
    case 'SLOT_NOT_REGULAR_TEACHING':
    case 'TEACHER_NOT_TEACHING_STAFF':
    case 'ASSIGNMENT_COVERAGE_GAP':
    case 'CLASS_TIME_OVERLAP':
    case 'TEACHER_TIME_OVERLAP':
      return code;
    case 'CLASS_NOT_ACTIVE':
      return 'CLASS_INACTIVE';
    case 'SUBJECT_NOT_ACTIVE':
      return 'SUBJECT_INACTIVE';
    case 'TEACHER_NOT_ACTIVE':
      return 'TEACHER_INACTIVE';
    default:
      return null;
  }
}
