import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, Prisma, TimetableVersion, TimetableVersionStatus } from '@prisma/client';
import {
  CivilDateString,
  TimetableActivationResult,
  TimetableDeferredCheck,
  TimetableEffectiveResolution,
  TimetableEntryListResponse,
  TimetableEntryReplaceResult,
  TimetableValidationIssue,
  TimetableValidationReport,
  TimetableVersionListResponse,
  TimetableVersionRecord,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { previousCivilDate } from '../teaching-assignments/teaching-assignment-policy';
import {
  ActivateTimetableVersionDto,
  ApproveTimetableVersionDto,
  CreateTimetableVersionDto,
  ListTimetableEntriesDto,
  ListTimetableVersionsDto,
  ReplaceTimetableEntriesDto,
  ResolveTimetableDateDto,
  SetTimetableTargetDto,
  ValidateTimetableVersionDto,
} from './dto';
import {
  timetableEntryInclude,
  timetableVersionCountSelect,
  toTimetableEntryRecord,
  toTimetableVersionRecord,
} from './mapper';
import { evaluateTimetableEntries, issue, sortValidationIssues } from './timetable-validation';

const DEFERRED_CHECKS: TimetableDeferredCheck[] = [
  'TIMETABLE_COMPLETENESS',
  'PPCT_ASSOCIATION',
  'SPECIAL_ACTIVITY_COLLISIONS',
];
const ENTRY_CONSTRAINTS = [
  'timetable_entries_class_exact_slot_key',
  'timetable_entries_teacher_exact_slot_key',
  'timetable_version_id,weekday,time_slot_definition_id,school_class_id',
  'timetable_version_id,weekday,time_slot_definition_id,teacher_user_id',
] as const;
const VERSION_NUMBER_CONSTRAINTS = [
  'timetable_versions_academic_year_id_version_number_key',
  'academic_year_id,version_number',
] as const;
export const STALE_MESSAGE = 'Bản nháp thời khóa biểu đã thay đổi; hãy tải lại trước khi tiếp tục.';
export const LIFECYCLE_STALE_MESSAGE = 'Trạng thái phiên bản thời khóa biểu đã thay đổi; hãy tải lại trước khi tiếp tục.';
export const ACTIVE_HEAD_STALE_MESSAGE = 'Đầu chuỗi thời khóa biểu đang áp dụng đã thay đổi; hãy tải lại trước khi kích hoạt.';
const LIFECYCLE_CONSTRAINTS = [
  'timetable_versions_one_active_per_year_key',
  'timetable_versions_effective_history_no_overlap',
] as const;

@Injectable()
export class TimetablesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listVersions(academicYearId: string, query: ListTimetableVersionsDto): Promise<TimetableVersionListResponse> {
    await this.requireAcademicYear(academicYearId);
    const where: Prisma.TimetableVersionWhereInput = {
      academicYearId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.timetableVersion.findMany({
        where,
        include: timetableVersionCountSelect,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.timetableVersion.count({ where }),
    ]);
    return { items: items.map(toTimetableVersionRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async getVersion(id: string): Promise<TimetableVersionRecord> {
    const row = await this.prisma.timetableVersion.findUnique({ where: { id }, include: timetableVersionCountSelect });
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản thời khóa biểu.');
    return toTimetableVersionRecord(row);
  }

  async createVersion(
    academicYearId: string,
    dto: CreateTimetableVersionDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimetableVersionRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireAcademicYear(academicYearId, tx);
        const maximum = await tx.timetableVersion.aggregate({
          where: { academicYearId },
          _max: { versionNumber: true },
        });
        const versionNumber = (maximum._max.versionNumber ?? 0) + 1;
        const row = await tx.timetableVersion.create({
          data: {
            academicYearId,
            versionNumber,
            status: TimetableVersionStatus.DRAFT,
            calendarVersionId: null,
            effectiveAcademicWeekId: null,
            effectiveFrom: null,
            effectiveUntil: null,
            contentChecksum: null,
            note: dto.note?.trim() || null,
            createdByUserId: actorUserId,
          },
          include: timetableVersionCountSelect,
        });
        await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_VERSION_DRAFT_CREATED', row.id, {
          academicYearId,
          versionNumber,
          entryCount: 0,
        });
        return toTimetableVersionRecord(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowCreateConflict(error);
    }
  }

  async setTarget(
    id: string,
    dto: SetTimetableTargetDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimetableVersionRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const version = await this.requireDraft(id, tx);
        const calendar = await tx.academicCalendarVersion.findUnique({ where: { id: dto.calendarVersionId } });
        if (!calendar) throw new NotFoundException('Không tìm thấy phiên lịch học thuật.');
        if (calendar.academicYearId !== version.academicYearId) {
          throw new ConflictException('Phiên lịch không thuộc năm học của thời khóa biểu.');
        }
        const week = await tx.academicWeek.findUnique({
          where: { id: dto.effectiveAcademicWeekId },
          include: { segments: { orderBy: [{ startDate: 'asc' }, { id: 'asc' }] } },
        });
        if (!week) throw new NotFoundException('Không tìm thấy tuần học.');
        if (week.calendarVersionId !== calendar.id) {
          throw new ConflictException('Tuần học không thuộc đúng phiên lịch đã chọn.');
        }
        if (week.segments.length === 0) {
          throw new ConflictException('Tuần học chưa có phân đoạn ngày để xác định hiệu lực.');
        }
        const effectiveFrom = week.segments[0]!.startDate;
        await this.claimDraft(tx, version, dto.expectedUpdatedAt, {
          calendarVersionId: calendar.id,
          effectiveAcademicWeekId: week.id,
          effectiveFrom,
          effectiveUntil: null,
        });
        await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_VERSION_TARGET_SET', version.id, {
          academicYearId: version.academicYearId,
          versionNumber: version.versionNumber,
          previousCalendarVersionId: version.calendarVersionId,
          previousEffectiveAcademicWeekId: version.effectiveAcademicWeekId,
          previousEffectiveFrom: version.effectiveFrom ? formatCivilDate(version.effectiveFrom) : null,
          calendarVersionId: calendar.id,
          effectiveAcademicWeekId: week.id,
          effectiveFrom: formatCivilDate(effectiveFrom),
        });
        return this.reloadVersion(tx, version.id);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowMutationConflict(error, 'Không thể cập nhật mục tiêu thời khóa biểu do xung đột đồng thời.');
    }
  }

  async listEntries(id: string, query: ListTimetableEntriesDto): Promise<TimetableEntryListResponse> {
    if (!await this.prisma.timetableVersion.findUnique({ where: { id }, select: { id: true } })) {
      throw new NotFoundException('Không tìm thấy phiên bản thời khóa biểu.');
    }
    const where: Prisma.TimetableEntryWhereInput = {
      timetableVersionId: id,
      ...(query.weekday ? { weekday: query.weekday } : {}),
      ...(query.schoolClassId ? { schoolClassId: query.schoolClassId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.teacherUserId ? { teacherUserId: query.teacherUserId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.timetableEntry.findMany({
        where,
        include: timetableEntryInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [
          { weekday: 'asc' },
          { timeSlotDefinitionId: 'asc' },
          { schoolClassId: 'asc' },
          { subjectId: 'asc' },
          { id: 'asc' },
        ],
      }),
      this.prisma.timetableEntry.count({ where }),
    ]);
    return { items: items.map(toTimetableEntryRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async replaceEntries(
    id: string,
    dto: ReplaceTimetableEntriesDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimetableEntryReplaceResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const version = await this.requireDraft(id, tx);
        const unique = <T>(values: T[]): T[] => [...new Set(values)];
        const [slots, classes, subjects, assignments] = await Promise.all([
          tx.timeSlotDefinition.findMany({ where: { id: { in: unique(dto.entries.map((row) => row.timeSlotDefinitionId)) } } }),
          tx.schoolClass.findMany({ where: { id: { in: unique(dto.entries.map((row) => row.schoolClassId)) } } }),
          tx.subject.findMany({ where: { id: { in: unique(dto.entries.map((row) => row.subjectId)) } } }),
          tx.teachingAssignment.findMany({
            where: { id: { in: unique(dto.entries.map((row) => row.teachingAssignmentId)) } },
            include: { teacher: { include: { profile: true } } },
          }),
        ]);
        const slotMap = new Map(slots.map((row) => [row.id, row]));
        const classMap = new Map(classes.map((row) => [row.id, row]));
        const subjectMap = new Map(subjects.map((row) => [row.id, row]));
        const assignmentMap = new Map(assignments.map((row) => [row.id, row]));
        const replacement = dto.entries.map((requested) => {
          const slot = slotMap.get(requested.timeSlotDefinitionId);
          const schoolClass = classMap.get(requested.schoolClassId);
          const subject = subjectMap.get(requested.subjectId);
          const assignment = assignmentMap.get(requested.teachingAssignmentId);
          if (!slot) throw new NotFoundException('Không tìm thấy phiên bản khung tiết.');
          if (!schoolClass) throw new NotFoundException('Không tìm thấy lớp học.');
          if (!subject) throw new NotFoundException('Không tìm thấy môn học.');
          if (!assignment) throw new NotFoundException('Không tìm thấy phân công giảng dạy.');
          if (slot.academicYearId !== version.academicYearId || slot.weekday !== requested.weekday) {
            throw new ConflictException('Khung tiết không khớp năm học hoặc thứ đã chọn.');
          }
          if (!slot.isActive || !slot.allowRegularTeaching) {
            throw new ConflictException('Chỉ được chọn khung tiết đang hoạt động và cho phép dạy thông thường.');
          }
          if (schoolClass.academicYearId !== version.academicYearId || schoolClass.status !== 'ACTIVE') {
            throw new ConflictException('Lớp học không khớp năm học hoặc không hoạt động.');
          }
          if (subject.status !== 'ACTIVE') throw new ConflictException('Môn học không hoạt động.');
          if (assignment.academicYearId !== version.academicYearId
            || assignment.schoolClassId !== requested.schoolClassId
            || assignment.subjectId !== requested.subjectId) {
            throw new ConflictException('Phân công giảng dạy không khớp năm học, lớp hoặc môn đã chọn.');
          }
          if (assignment.teacher.status !== 'ACTIVE' || !assignment.teacher.profile?.isTeachingStaff) {
            throw new ConflictException('Giáo viên của phân công không đủ điều kiện cho biên soạn mới.');
          }
          return {
            timetableVersionId: version.id,
            academicYearId: version.academicYearId,
            weekday: requested.weekday,
            timeSlotDefinitionId: requested.timeSlotDefinitionId,
            schoolClassId: requested.schoolClassId,
            subjectId: requested.subjectId,
            teachingAssignmentId: requested.teachingAssignmentId,
            teacherUserId: assignment.teacherUserId,
          };
        });

        const previousCount = await tx.timetableEntry.count({ where: { timetableVersionId: version.id } });
        await this.claimDraft(tx, version, dto.expectedUpdatedAt);
        await tx.timetableEntry.deleteMany({ where: { timetableVersionId: version.id } });
        if (replacement.length > 0) await tx.timetableEntry.createMany({ data: replacement });
        await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_ENTRIES_REPLACED', version.id, {
          academicYearId: version.academicYearId,
          versionNumber: version.versionNumber,
          previousCount,
          entryCount: replacement.length,
        });
        return {
          version: await this.reloadVersion(tx, version.id),
          previousCount,
          entryCount: replacement.length,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isEntryConflict(error)) {
        throw new ConflictException('Nội dung thời khóa biểu bị trùng lớp hoặc giáo viên trong cùng khung tiết.');
      }
      if (isSerializationConflict(error)) throw new ConflictException(STALE_MESSAGE);
      throw error;
    }
  }

  async validateVersion(
    id: string,
    dto: ValidateTimetableVersionDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimetableValidationReport> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const version = await this.requireDraft(id, tx);
        const evaluation = await this.evaluateVersionCurrentScope(tx, version, false);

        const token = await this.claimDraft(tx, version, dto.expectedUpdatedAt);
        const orderedIssues = evaluation.issues;
        const valid = orderedIssues.length === 0;
        const now = new Date(Math.max(Date.now(), token.getTime() + 1));
        const updated = valid
          ? await tx.timetableVersion.update({
            where: { id },
            data: {
              status: TimetableVersionStatus.VALIDATED,
              validatedByUserId: actorUserId,
              validatedAt: now,
              updatedAt: now,
            },
            include: timetableVersionCountSelect,
          })
          : await tx.timetableVersion.findUniqueOrThrow({ where: { id }, include: timetableVersionCountSelect });
        await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_VALIDATION_RUN', version.id, {
          academicYearId: version.academicYearId,
          versionNumber: version.versionNumber,
          valid,
          statusBefore: TimetableVersionStatus.DRAFT,
          statusAfter: updated.status,
          issueCount: orderedIssues.length,
          issueCodes: [...new Set(orderedIssues.map((item) => item.code))],
          deferredChecks: DEFERRED_CHECKS,
        });
        const record = toTimetableVersionRecord(updated);
        return {
          versionId: version.id,
          validationScope: 'NORMAL_BASE_TIMETABLE',
          statusBefore: TimetableVersionStatus.DRAFT,
          statusAfter: record.status,
          valid,
          issues: orderedIssues,
          deferredChecks: DEFERRED_CHECKS,
          validatedByUserId: record.validatedByUserId,
          validatedAt: record.validatedAt,
          version: record,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowMutationConflict(error, 'Không thể xác thực thời khóa biểu do xung đột đồng thời.');
    }
  }

  async approveVersion(
    id: string,
    dto: ApproveTimetableVersionDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimetableVersionRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const version = await this.requireLifecycleVersion(id, TimetableVersionStatus.VALIDATED, tx);
        const approvedAt = strictlyAdvancedInstant(version.updatedAt);
        const claimed = await tx.timetableVersion.updateMany({
          where: {
            id,
            status: TimetableVersionStatus.VALIDATED,
            updatedAt: new Date(dto.expectedUpdatedAt),
          },
          data: {
            status: TimetableVersionStatus.APPROVED,
            approvedByUserId: actorUserId,
            approvedAt,
            updatedAt: approvedAt,
          },
        });
        if (claimed.count !== 1) throw new ConflictException(LIFECYCLE_STALE_MESSAGE);
        await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_VERSION_APPROVED', id, {
          academicYearId: version.academicYearId,
          versionNumber: version.versionNumber,
          statusBefore: TimetableVersionStatus.VALIDATED,
          statusAfter: TimetableVersionStatus.APPROVED,
          validatedByUserId: version.validatedByUserId,
          approvedByUserId: actorUserId,
        });
        return this.reloadVersion(tx, id);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowLifecycleConflict(error);
    }
  }

  async activateVersion(
    id: string,
    dto: ActivateTimetableVersionDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimetableActivationResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const version = await this.requireLifecycleVersion(id, TimetableVersionStatus.APPROVED, tx);
        const claimToken = strictlyAdvancedInstant(version.updatedAt);
        const claimed = await tx.timetableVersion.updateMany({
          where: {
            id,
            status: TimetableVersionStatus.APPROVED,
            updatedAt: new Date(dto.expectedUpdatedAt),
          },
          data: { updatedAt: claimToken },
        });
        if (claimed.count !== 1) throw new ConflictException(LIFECYCLE_STALE_MESSAGE);

        const evaluation = await this.evaluateVersionCurrentScope(tx, version, true);
        const currentActive = await tx.timetableVersion.findFirst({
          where: { academicYearId: version.academicYearId, status: TimetableVersionStatus.ACTIVE },
          orderBy: [{ versionNumber: 'asc' }, { id: 'asc' }],
        });
        const expectedActiveVersionId = dto.expectedActiveVersionId ?? null;
        const actualActiveVersionId = currentActive?.id ?? null;
        if (expectedActiveVersionId !== actualActiveVersionId) {
          throw new ConflictException(ACTIVE_HEAD_STALE_MESSAGE);
        }

        if (evaluation.issues.length > 0) {
          const record = await this.reloadVersion(tx, id);
          await this.writeActivationRunAudit(tx, actorUserId, meta, version, {
            valid: false,
            activated: false,
            statusAfter: TimetableVersionStatus.APPROVED,
            issues: evaluation.issues,
            expectedActiveVersionId,
            actualActiveVersionId,
          });
          return {
            versionId: id,
            activationScope: 'NORMAL_BASE_TIMETABLE',
            statusBefore: 'APPROVED',
            statusAfter: 'APPROVED',
            activated: false,
            issues: evaluation.issues,
            deferredChecks: DEFERRED_CHECKS,
            supersededVersion: null,
            version: record,
          };
        }

        const candidateEffectiveFrom = formatCivilDate(version.effectiveFrom!);
        if (currentActive && candidateEffectiveFrom <= formatCivilDate(currentActive.effectiveFrom!)) {
          throw new ConflictException('Ngày hiệu lực của phiên bản kế tiếp phải sau đầu chuỗi đang áp dụng.');
        }
        const activationInstant = strictlyAdvancedInstant(claimToken, currentActive?.updatedAt);
        let supersededVersion: TimetableVersionRecord | null = null;
        if (currentActive) {
          const predecessor = await tx.timetableVersion.update({
            where: { id: currentActive.id },
            data: {
              status: TimetableVersionStatus.SUPERSEDED,
              effectiveUntil: parseCivilDate(previousCivilDate(candidateEffectiveFrom)),
              supersededAt: activationInstant,
              updatedAt: activationInstant,
            },
            include: timetableVersionCountSelect,
          });
          supersededVersion = toTimetableVersionRecord(predecessor);
        }
        const activated = await tx.timetableVersion.updateMany({
          where: { id, status: TimetableVersionStatus.APPROVED, updatedAt: claimToken },
          data: {
            status: TimetableVersionStatus.ACTIVE,
            activatedByUserId: actorUserId,
            activatedAt: activationInstant,
            effectiveUntil: null,
            supersededAt: null,
            updatedAt: activationInstant,
          },
        });
        if (activated.count !== 1) throw new ConflictException(LIFECYCLE_STALE_MESSAGE);
        const record = await this.reloadVersion(tx, id);
        await this.writeActivationRunAudit(tx, actorUserId, meta, version, {
          valid: true,
          activated: true,
          statusAfter: TimetableVersionStatus.ACTIVE,
          issues: [],
          expectedActiveVersionId,
          actualActiveVersionId,
        });
        await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_VERSION_ACTIVATED', id, {
          academicYearId: version.academicYearId,
          versionNumber: version.versionNumber,
          effectiveFrom: candidateEffectiveFrom,
          calendarVersionId: version.calendarVersionId,
          effectiveAcademicWeekId: version.effectiveAcademicWeekId,
          activatedByUserId: actorUserId,
          previousActiveVersionId: actualActiveVersionId,
        });
        if (currentActive && supersededVersion) {
          await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_VERSION_SUPERSEDED', currentActive.id, {
            academicYearId: currentActive.academicYearId,
            versionNumber: currentActive.versionNumber,
            effectiveFrom: formatCivilDate(currentActive.effectiveFrom!),
            effectiveUntil: supersededVersion.effectiveUntil,
            supersededByVersionId: id,
          });
        }
        return {
          versionId: id,
          activationScope: 'NORMAL_BASE_TIMETABLE',
          statusBefore: 'APPROVED',
          statusAfter: 'ACTIVE',
          activated: true,
          issues: [],
          deferredChecks: DEFERRED_CHECKS,
          supersededVersion,
          version: record,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowLifecycleConflict(error);
    }
  }

  async resolveEffectiveVersion(
    academicYearId: string,
    dto: ResolveTimetableDateDto,
  ): Promise<TimetableEffectiveResolution> {
    await this.requireAcademicYear(academicYearId);
    const date = dto.date as CivilDateString;
    const targetDate = parseCivilDate(date);
    const version = await this.prisma.timetableVersion.findFirst({
      where: {
        academicYearId,
        status: { in: [TimetableVersionStatus.ACTIVE, TimetableVersionStatus.SUPERSEDED] },
        effectiveFrom: { lte: targetDate },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: targetDate } }],
      },
      include: timetableVersionCountSelect,
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
    });
    return { academicYearId, date, version: version ? toTimetableVersionRecord(version) : null };
  }

  private async evaluateVersionCurrentScope(
    tx: Prisma.TransactionClient,
    version: TimetableVersion,
    requireActiveCalendar: boolean,
  ): Promise<{ issues: TimetableValidationIssue[] }> {
    const entries = await tx.timetableEntry.findMany({
      where: { timetableVersionId: version.id },
      include: timetableEntryInclude,
      orderBy: [{ id: 'asc' }],
    });
    const issues: TimetableValidationIssue[] = [];
    let teachingWeekdays: Parameters<typeof evaluateTimetableEntries>[0]['teachingWeekdays'];
    let effectiveFrom: Parameters<typeof evaluateTimetableEntries>[0]['effectiveFrom'];
    let calendarEndDate: Parameters<typeof evaluateTimetableEntries>[0]['calendarEndDate'];
    if (!version.calendarVersionId || !version.effectiveAcademicWeekId || !version.effectiveFrom) {
      issues.push(issue('TARGET_REQUIRED'));
    } else {
      const [calendar, week] = await Promise.all([
        tx.academicCalendarVersion.findUnique({ where: { id: version.calendarVersionId } }),
        tx.academicWeek.findUnique({
          where: { id: version.effectiveAcademicWeekId },
          include: { segments: { orderBy: [{ startDate: 'asc' }, { id: 'asc' }] } },
        }),
      ]);
      if (!calendar || calendar.academicYearId !== version.academicYearId
        || !week || week.calendarVersionId !== calendar.id) {
        issues.push(issue('TARGET_REQUIRED'));
      } else {
        if (requireActiveCalendar && !calendar.isActive) issues.push(issue('TARGET_CALENDAR_NOT_ACTIVE'));
        teachingWeekdays = calendar.teachingWeekdays;
        if (week.segments.length === 0) {
          issues.push(issue('TARGET_WEEK_NO_SEGMENTS'));
        } else {
          const expected = formatCivilDate(week.segments[0]!.startDate);
          const persisted = formatCivilDate(version.effectiveFrom);
          if (expected !== persisted) issues.push(issue('TARGET_EFFECTIVE_FROM_MISMATCH'));
          effectiveFrom = persisted;
          calendarEndDate = formatCivilDate(calendar.endDate);
        }
      }
    }
    issues.push(...evaluateTimetableEntries({ entries, teachingWeekdays, effectiveFrom, calendarEndDate }));
    return { issues: sortValidationIssues(issues) };
  }

  private async requireLifecycleVersion(
    id: string,
    status: TimetableVersionStatus,
    tx: Prisma.TransactionClient,
  ): Promise<TimetableVersion> {
    const version = await tx.timetableVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('Không tìm thấy phiên bản thời khóa biểu.');
    if (version.status !== status) {
      throw new ConflictException(`Chỉ phiên bản ${status} mới có thể thực hiện chuyển trạng thái này.`);
    }
    return version;
  }

  private async writeActivationRunAudit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    meta: RequestMeta,
    version: TimetableVersion,
    input: {
      valid: boolean;
      activated: boolean;
      statusAfter: TimetableVersionStatus;
      issues: TimetableValidationIssue[];
      expectedActiveVersionId: string | null;
      actualActiveVersionId: string | null;
    },
  ): Promise<void> {
    await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_ACTIVATION_RUN', version.id, {
      academicYearId: version.academicYearId,
      versionNumber: version.versionNumber,
      valid: input.valid,
      activated: input.activated,
      statusBefore: TimetableVersionStatus.APPROVED,
      statusAfter: input.statusAfter,
      issueCount: input.issues.length,
      issueCodes: [...new Set(input.issues.map((item) => item.code))],
      deferredChecks: DEFERRED_CHECKS,
      expectedActiveVersionId: input.expectedActiveVersionId,
      actualActiveVersionId: input.actualActiveVersionId,
    });
  }

  private async requireAcademicYear(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    if (!await tx.academicYear.findUnique({ where: { id }, select: { id: true } })) {
      throw new NotFoundException('Không tìm thấy năm học.');
    }
  }

  private async requireDraft(id: string, tx: Prisma.TransactionClient) {
    const version = await tx.timetableVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('Không tìm thấy phiên bản thời khóa biểu.');
    if (version.status !== TimetableVersionStatus.DRAFT) {
      throw new ConflictException('Chỉ bản nháp DRAFT mới có thể thay đổi hoặc xác thực.');
    }
    return version;
  }

  private async claimDraft(
    tx: Prisma.TransactionClient,
    version: TimetableVersion,
    expectedUpdatedAt: string,
    data: Prisma.TimetableVersionUncheckedUpdateManyInput = {},
  ): Promise<Date> {
    const expected = new Date(expectedUpdatedAt);
    const updatedAt = new Date(Math.max(Date.now(), version.updatedAt.getTime() + 1));
    const claimed = await tx.timetableVersion.updateMany({
      where: { id: version.id, status: TimetableVersionStatus.DRAFT, updatedAt: expected },
      data: { ...data, updatedAt },
    });
    if (claimed.count !== 1) throw new ConflictException(STALE_MESSAGE);
    return updatedAt;
  }

  private async reloadVersion(tx: Prisma.TransactionClient, id: string): Promise<TimetableVersionRecord> {
    const row = await tx.timetableVersion.findUniqueOrThrow({ where: { id }, include: timetableVersionCountSelect });
    return toTimetableVersionRecord(row);
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    meta: RequestMeta,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.write({
      actorUserId,
      action,
      entityType: 'TimetableVersion',
      entityId,
      requestId: meta.requestId,
      result: AuditResult.SUCCESS,
      metadata,
    }, tx);
  }

  private rethrowCreateConflict(error: unknown): never {
    if (error instanceof HttpException) throw error;
    if (isSerializationConflict(error) || isConstraintConflict(error, VERSION_NUMBER_CONSTRAINTS)) {
      throw new ConflictException('Số phiên bản thời khóa biểu vừa thay đổi; hãy thử tạo lại.');
    }
    throw error;
  }

  private rethrowMutationConflict(error: unknown, message: string): never {
    if (error instanceof HttpException) throw error;
    if (isSerializationConflict(error)) throw new ConflictException(message);
    throw error;
  }

  private rethrowLifecycleConflict(error: unknown): never {
    if (error instanceof HttpException) throw error;
    if (isKnownLifecycleConflict(error)) {
      throw new ConflictException('Chuỗi thời khóa biểu đã thay đổi đồng thời; hãy tải lại trước khi tiếp tục.');
    }
    throw error;
  }
}

function strictlyAdvancedInstant(...previous: Array<Date | undefined>): Date {
  const previousMaximum = Math.max(...previous.filter((value): value is Date => value !== undefined)
    .map((value) => value.getTime()));
  return new Date(Math.max(Date.now(), previousMaximum + 1));
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

function isConstraintConflict(error: unknown, constraints: readonly string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const detail = `${error.message} ${JSON.stringify(error.meta ?? {})}`
    .replace(/\s/gu, '')
    .replaceAll('"', '')
    .replaceAll("'", '')
    .replaceAll('`', '')
    .replaceAll('[', '')
    .replaceAll(']', '')
    .toLowerCase();
  return constraints.some((constraint) => detail.includes(constraint));
}

function isEntryConflict(error: unknown): boolean {
  return isConstraintConflict(error, ENTRY_CONSTRAINTS);
}

function isKnownLifecycleConflict(error: unknown): boolean {
  if (isSerializationConflict(error)) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return isConstraintConflict(error, [LIFECYCLE_CONSTRAINTS[0]]);
    if (error.code !== 'P2004') return false;
    const detail = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
    return LIFECYCLE_CONSTRAINTS.some((constraint) => detail.includes(constraint));
  }
  return error instanceof Prisma.PrismaClientUnknownRequestError
    && LIFECYCLE_CONSTRAINTS.some((constraint) => error.message.includes(constraint));
}

export { DEFERRED_CHECKS, isEntryConflict, isKnownLifecycleConflict, isSerializationConflict };
