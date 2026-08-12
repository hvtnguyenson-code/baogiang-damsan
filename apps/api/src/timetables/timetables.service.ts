import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, Prisma, TimetableVersion, TimetableVersionStatus } from '@prisma/client';
import {
  TimetableDeferredCheck,
  TimetableEntryListResponse,
  TimetableEntryReplaceResult,
  TimetableValidationIssue,
  TimetableValidationReport,
  TimetableVersionListResponse,
  TimetableVersionRecord,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { formatCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTimetableVersionDto,
  ListTimetableEntriesDto,
  ListTimetableVersionsDto,
  ReplaceTimetableEntriesDto,
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
const STALE_MESSAGE = 'Báº£n nhÃ¡p thá»i khÃ³a biá»ƒu Ä‘Ã£ thay Ä‘á»•i; hÃ£y táº£i láº¡i trÆ°á»›c khi tiáº¿p tá»¥c.';

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
    if (!row) throw new NotFoundException('KhÃ´ng tÃ¬m tháº¥y phiÃªn báº£n thá»i khÃ³a biá»ƒu.');
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
        if (!calendar) throw new NotFoundException('KhÃ´ng tÃ¬m tháº¥y phiÃªn lá»‹ch há»c thuáº­t.');
        if (calendar.academicYearId !== version.academicYearId) {
          throw new ConflictException('PhiÃªn lá»‹ch khÃ´ng thuá»™c nÄƒm há»c cá»§a thá»i khÃ³a biá»ƒu.');
        }
        const week = await tx.academicWeek.findUnique({
          where: { id: dto.effectiveAcademicWeekId },
          include: { segments: { orderBy: [{ startDate: 'asc' }, { id: 'asc' }] } },
        });
        if (!week) throw new NotFoundException('KhÃ´ng tÃ¬m tháº¥y tuáº§n há»c.');
        if (week.calendarVersionId !== calendar.id) {
          throw new ConflictException('Tuáº§n há»c khÃ´ng thuá»™c Ä‘Ãºng phiÃªn lá»‹ch Ä‘Ã£ chá»n.');
        }
        if (week.segments.length === 0) {
          throw new ConflictException('Tuáº§n há»c chÆ°a cÃ³ phÃ¢n Ä‘oáº¡n ngÃ y Ä‘á»ƒ xÃ¡c Ä‘á»‹nh hiá»‡u lá»±c.');
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
      this.rethrowMutationConflict(error, 'KhÃ´ng thá»ƒ cáº­p nháº­t má»¥c tiÃªu thá»i khÃ³a biá»ƒu do xung Ä‘á»™t Ä‘á»“ng thá»i.');
    }
  }

  async listEntries(id: string, query: ListTimetableEntriesDto): Promise<TimetableEntryListResponse> {
    if (!await this.prisma.timetableVersion.findUnique({ where: { id }, select: { id: true } })) {
      throw new NotFoundException('KhÃ´ng tÃ¬m tháº¥y phiÃªn báº£n thá»i khÃ³a biá»ƒu.');
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
          if (!slot) throw new NotFoundException('KhÃ´ng tÃ¬m tháº¥y phiÃªn báº£n khung tiáº¿t.');
          if (!schoolClass) throw new NotFoundException('KhÃ´ng tÃ¬m tháº¥y lá»›p há»c.');
          if (!subject) throw new NotFoundException('KhÃ´ng tÃ¬m tháº¥y mÃ´n há»c.');
          if (!assignment) throw new NotFoundException('KhÃ´ng tÃ¬m tháº¥y phÃ¢n cÃ´ng giáº£ng dáº¡y.');
          if (slot.academicYearId !== version.academicYearId || slot.weekday !== requested.weekday) {
            throw new ConflictException('Khung tiáº¿t khÃ´ng khá»›p nÄƒm há»c hoáº·c thá»© Ä‘Ã£ chá»n.');
          }
          if (!slot.isActive || !slot.allowRegularTeaching) {
            throw new ConflictException('Chá»‰ Ä‘Æ°á»£c chá»n khung tiáº¿t Ä‘ang hoáº¡t Ä‘á»™ng vÃ  cho phÃ©p dáº¡y thÃ´ng thÆ°á»ng.');
          }
          if (schoolClass.academicYearId !== version.academicYearId || schoolClass.status !== 'ACTIVE') {
            throw new ConflictException('Lá»›p há»c khÃ´ng khá»›p nÄƒm há»c hoáº·c khÃ´ng hoáº¡t Ä‘á»™ng.');
          }
          if (subject.status !== 'ACTIVE') throw new ConflictException('MÃ´n há»c khÃ´ng hoáº¡t Ä‘á»™ng.');
          if (assignment.academicYearId !== version.academicYearId
            || assignment.schoolClassId !== requested.schoolClassId
            || assignment.subjectId !== requested.subjectId) {
            throw new ConflictException('PhÃ¢n cÃ´ng giáº£ng dáº¡y khÃ´ng khá»›p nÄƒm há»c, lá»›p hoáº·c mÃ´n Ä‘Ã£ chá»n.');
          }
          if (assignment.teacher.status !== 'ACTIVE' || !assignment.teacher.profile?.isTeachingStaff) {
            throw new ConflictException('GiÃ¡o viÃªn cá»§a phÃ¢n cÃ´ng khÃ´ng Ä‘á»§ Ä‘iá»u kiá»‡n cho biÃªn soáº¡n má»›i.');
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
        throw new ConflictException('Ná»™i dung thá»i khÃ³a biá»ƒu bá»‹ trÃ¹ng lá»›p hoáº·c giÃ¡o viÃªn trong cÃ¹ng khung tiáº¿t.');
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
        const entries = await tx.timetableEntry.findMany({
          where: { timetableVersionId: id },
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
          const calendar = await tx.academicCalendarVersion.findUnique({ where: { id: version.calendarVersionId } });
          const week = await tx.academicWeek.findUnique({
            where: { id: version.effectiveAcademicWeekId },
            include: { segments: { orderBy: [{ startDate: 'asc' }, { id: 'asc' }] } },
          });
          if (!calendar || calendar.academicYearId !== version.academicYearId
            || !week || week.calendarVersionId !== calendar.id) {
            issues.push(issue('TARGET_REQUIRED'));
          } else if (week.segments.length === 0) {
            teachingWeekdays = calendar.teachingWeekdays;
            issues.push(issue('TARGET_WEEK_NO_SEGMENTS'));
          } else {
            const expected = formatCivilDate(week.segments[0]!.startDate);
            const persisted = formatCivilDate(version.effectiveFrom);
            if (expected !== persisted) issues.push(issue('TARGET_EFFECTIVE_FROM_MISMATCH'));
            teachingWeekdays = calendar.teachingWeekdays;
            effectiveFrom = persisted;
            calendarEndDate = formatCivilDate(calendar.endDate);
          }
        }
        issues.push(...evaluateTimetableEntries({ entries, teachingWeekdays, effectiveFrom, calendarEndDate }));

        const token = await this.claimDraft(tx, version, dto.expectedUpdatedAt);
        const orderedIssues = sortValidationIssues(issues);
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
      this.rethrowMutationConflict(error, 'KhÃ´ng thá»ƒ xÃ¡c thá»±c thá»i khÃ³a biá»ƒu do xung Ä‘á»™t Ä‘á»“ng thá»i.');
    }
  }

  private async requireAcademicYear(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    if (!await tx.academicYear.findUnique({ where: { id }, select: { id: true } })) {
      throw new NotFoundException('KhÃ´ng tÃ¬m tháº¥y nÄƒm há»c.');
    }
  }

  private async requireDraft(id: string, tx: Prisma.TransactionClient) {
    const version = await tx.timetableVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('KhÃ´ng tÃ¬m tháº¥y phiÃªn báº£n thá»i khÃ³a biá»ƒu.');
    if (version.status !== TimetableVersionStatus.DRAFT) {
      throw new ConflictException('Chá»‰ báº£n nhÃ¡p DRAFT má»›i cÃ³ thá»ƒ thay Ä‘á»•i hoáº·c xÃ¡c thá»±c.');
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
      throw new ConflictException('Sá»‘ phiÃªn báº£n thá»i khÃ³a biá»ƒu vá»«a thay Ä‘á»•i; hÃ£y thá»­ táº¡o láº¡i.');
    }
    throw error;
  }

  private rethrowMutationConflict(error: unknown, message: string): never {
    if (error instanceof HttpException) throw error;
    if (isSerializationConflict(error)) throw new ConflictException(message);
    throw error;
  }
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

export { DEFERRED_CHECKS, isEntryConflict, isSerializationConflict };
