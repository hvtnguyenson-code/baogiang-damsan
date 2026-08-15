import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AcademicWeekday,
  AuditResult,
  CalendarExceptionScope,
  CalendarExceptionTimeSelector,
  OperationalLessonDispositionType,
  OperationalOverlayStatus,
  Prisma,
  TimeSlotSession,
  TimetableVersionStatus,
} from '@prisma/client';
import {
  CalendarExceptionCreateResult,
  CalendarExceptionListResponse,
  CalendarExceptionRecord,
  CalendarExceptionReverseResult,
  OperationalLessonDispositionCreateResult,
  OperationalLessonDispositionListResponse,
  OperationalLessonDispositionRecord,
  OperationalLessonDispositionReverseResult,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCalendarExceptionDto, CreateLessonDispositionDto, ListCalendarExceptionsDto, ListLessonDispositionsDto, ReverseOperationalOverlayDto } from './dto';
import { calendarExceptionInclude, toCalendarExceptionRecord, toLessonDispositionRecord } from './mapper';
import { OperationalOverlayAccessService } from './operational-overlay-access.service';
import { COLLISION_COVERAGE, calendarCreateFingerprint, dispositionCreateFingerprint, isTeacherDisposition, OverlayClock, OVERLAY_CLOCK, reverseFingerprint, weekdayForCivilDate } from './operational-overlay-policy';

const CREATE_RACE_MESSAGE = 'Lệnh xung đột với một thay đổi đồng thời hoặc dữ liệu nghiệp vụ đang có.';
const STALE_MESSAGE = 'Bản ghi đã thay đổi; hãy tải lại trước khi đảo ngược.';

@Injectable()
export class OperationalOverlaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: OperationalOverlayAccessService,
    @Inject(OVERLAY_CLOCK) private readonly clock: OverlayClock,
  ) {}

  async createCalendarException(dto: CreateCalendarExceptionDto, request: AuthenticatedRequest): Promise<CalendarExceptionCreateResult> {
    await this.access.requireCalendar(request);
    const normalized = this.normalizeCalendar(dto);
    const fingerprint = calendarCreateFingerprint(normalized);
    return this.withMutationRetry(async () => this.prisma.$transaction(async (tx) => {
      const replay = await tx.calendarException.findUnique({ where: { createRequestKey: dto.requestKey.trim() }, include: calendarExceptionInclude });
      if (replay) {
        if (replay.createRequestFingerprint !== fingerprint) throw new ConflictException('requestKey đã được dùng với nội dung khác.');
        return { outcome: 'IDEMPOTENT_REPLAY', record: toCalendarExceptionRecord(replay), collisionCoverage: COLLISION_COVERAGE };
      }
      await this.validateCalendarCreate(tx, normalized);
      const row = await tx.calendarException.create({
        data: {
          academicYearId: normalized.academicYearId,
          academicCalendarVersionId: normalized.academicCalendarVersionId,
          civilDate: parseCivilDate(normalized.civilDate), scope: normalized.scope, gradeLevel: normalized.gradeLevel,
          schoolClassId: normalized.schoolClassId, timeSelector: normalized.timeSelector, session: normalized.session,
          note: normalized.note, replacesId: normalized.replacesId, createRequestKey: dto.requestKey.trim(),
          createRequestFingerprint: fingerprint, createdByUserId: request.auth!.user.id,
          exactTimeSlots: normalized.exactTimeSlotDefinitionIds.length ? { create: normalized.exactTimeSlotDefinitionIds.map((timeSlotDefinitionId) => ({ academicYearId: normalized.academicYearId, timeSlotDefinitionId })) } : undefined,
        }, include: calendarExceptionInclude,
      });
      await this.writeAudit(tx, request, 'CALENDAR_EXCEPTION_CREATED', 'CalendarException', row.id, {
        capabilityKey: 'CALENDAR_EXCEPTION_MANAGE', scope: 'SCHOOL_WIDE', requestKey: dto.requestKey.trim(),
        academicYearId: row.academicYearId, calendarVersionId: row.academicCalendarVersionId,
        civilDate: normalized.civilDate, replacesId: row.replacesId, retrospective: this.isPast(normalized.civilDate), ...COLLISION_COVERAGE,
      });
      return { outcome: 'CREATED', record: toCalendarExceptionRecord(row), collisionCoverage: COLLISION_COVERAGE };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async listCalendarExceptions(query: ListCalendarExceptionsDto, request: AuthenticatedRequest): Promise<CalendarExceptionListResponse> {
    await this.access.requireCalendar(request);
    const where: Prisma.CalendarExceptionWhereInput = { academicYearId: query.academicYearId };
    if (query.civilDate) where.civilDate = parseCivilDate(query.civilDate);
    if (query.status) where.status = query.status;
    if (query.scope) where.scope = query.scope;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.calendarException.findMany({ where, include: calendarExceptionInclude, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ civilDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }),
      this.prisma.calendarException.count({ where }),
    ]);
    return { items: items.map(toCalendarExceptionRecord), page: query.page, pageSize: query.pageSize, total, collisionCoverage: COLLISION_COVERAGE };
  }

  async getCalendarException(id: string, request: AuthenticatedRequest): Promise<CalendarExceptionRecord> {
    await this.access.requireCalendar(request);
    const row = await this.prisma.calendarException.findUnique({ where: { id }, include: calendarExceptionInclude });
    if (!row) throw new NotFoundException('Không tìm thấy ngoại lệ lịch học.');
    return toCalendarExceptionRecord(row);
  }

  async reverseCalendarException(id: string, dto: ReverseOperationalOverlayDto, request: AuthenticatedRequest): Promise<CalendarExceptionReverseResult> {
    await this.access.requireCalendar(request);
    const fingerprint = reverseFingerprint(id, dto.expectedUpdatedAt, dto.reversalReason.trim());
    return this.withMutationRetry(async () => this.prisma.$transaction(async (tx) => {
      const keyed = await tx.calendarException.findUnique({ where: { reverseRequestKey: dto.requestKey.trim() }, include: calendarExceptionInclude });
      if (keyed) {
        if (keyed.id !== id || keyed.reverseRequestFingerprint !== fingerprint) throw new ConflictException('requestKey đảo ngược đã được dùng với nội dung khác.');
        return { outcome: 'IDEMPOTENT_REPLAY', record: toCalendarExceptionRecord(keyed), collisionCoverage: COLLISION_COVERAGE };
      }
      const existing = await tx.calendarException.findUnique({ where: { id }, include: calendarExceptionInclude });
      if (!existing) throw new NotFoundException('Không tìm thấy ngoại lệ lịch học.');
      const reversedAt = this.clock.now();
      const changed = await tx.calendarException.updateMany({ where: { id, status: OperationalOverlayStatus.ACTIVE, updatedAt: new Date(dto.expectedUpdatedAt) }, data: {
        status: OperationalOverlayStatus.REVERSED, reversedByUserId: request.auth!.user.id, reversedAt,
        reversalReason: dto.reversalReason.trim(), reverseRequestKey: dto.requestKey.trim(), reverseRequestFingerprint: fingerprint, updatedAt: reversedAt,
      } });
      if (changed.count !== 1) throw new ConflictException(STALE_MESSAGE);
      const row = await tx.calendarException.findUniqueOrThrow({ where: { id }, include: calendarExceptionInclude });
      await this.writeAudit(tx, request, 'CALENDAR_EXCEPTION_REVERSED', 'CalendarException', id, {
        capabilityKey: 'CALENDAR_EXCEPTION_MANAGE', scope: 'SCHOOL_WIDE', requestKey: dto.requestKey.trim(),
        academicYearId: row.academicYearId, calendarVersionId: row.academicCalendarVersionId,
        civilDate: formatCivilDate(row.civilDate), retrospective: this.isPast(formatCivilDate(row.civilDate)), ...COLLISION_COVERAGE,
      });
      return { outcome: 'REVERSED', record: toCalendarExceptionRecord(row), collisionCoverage: COLLISION_COVERAGE };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async createLessonDisposition(dto: CreateLessonDispositionDto, request: AuthenticatedRequest): Promise<OperationalLessonDispositionCreateResult> {
    const source = await this.requireSourceEntry(this.prisma, dto.timetableEntryId);
    if (dto.dispositionType === OperationalLessonDispositionType.AUTHORIZED_CANCELLATION) await this.access.requireTeachingSchoolWide(request);
    else await this.access.requireTeachingSubject(request, source.subjectId);
    const normalized = {
      timetableEntryId: dto.timetableEntryId, sourceCivilDate: dto.sourceCivilDate, dispositionType: dto.dispositionType,
      assignedTeacherUserId: dto.assignedTeacherUserId ?? null, note: dto.note?.trim() ?? null, replacesId: dto.replacesId ?? null,
    };
    const fingerprint = dispositionCreateFingerprint(normalized);
    return this.withMutationRetry(async () => this.prisma.$transaction(async (tx) => {
      const replay = await tx.operationalLessonDisposition.findUnique({ where: { createRequestKey: dto.requestKey.trim() } });
      if (replay) {
        if (replay.createRequestFingerprint !== fingerprint) throw new ConflictException('requestKey đã được dùng với nội dung khác.');
        return { outcome: 'IDEMPOTENT_REPLAY', record: toLessonDispositionRecord(replay), collisionCoverage: COLLISION_COVERAGE };
      }
      const exact = await this.requireSourceEntry(tx, dto.timetableEntryId);
      const sourceDate = parseCivilDate(dto.sourceCivilDate);
      await this.validateDispositionSource(tx, exact, sourceDate, normalized.note);
      this.validateDispositionShape(dto);
      if (await tx.operationalLessonDisposition.findFirst({ where: { timetableEntryId: exact.id, sourceCivilDate: sourceDate, status: OperationalOverlayStatus.ACTIVE }, select: { id: true } })) {
        throw new ConflictException('Cơ hội dạy này đã có một disposition ACTIVE.');
      }
      await this.requireReplacement(tx, 'disposition', normalized.replacesId);
      const eligibility = await this.resolveEligibility(tx, dto, exact.subjectId);
      if (dto.assignedTeacherUserId) await this.assertTeacherAvailable(tx, dto.assignedTeacherUserId, sourceDate, exact.weekday, exact.timeSlotDefinitionId);
      const row = await tx.operationalLessonDisposition.create({ data: {
        academicYearId: exact.academicYearId, timetableVersionId: exact.timetableVersionId, timetableEntryId: exact.id,
        sourceCivilDate: sourceDate, academicCalendarVersionId: exact.timetableVersion.calendarVersionId!,
        timeSlotDefinitionId: exact.timeSlotDefinitionId, schoolClassId: exact.schoolClassId, subjectId: exact.subjectId,
        teachingAssignmentId: exact.teachingAssignmentId, responsibleTeacherUserId: exact.teacherUserId,
        dispositionType: dto.dispositionType, assignedTeacherUserId: dto.assignedTeacherUserId,
        ...eligibility, note: normalized.note, replacesId: normalized.replacesId,
        createRequestKey: dto.requestKey.trim(), createRequestFingerprint: fingerprint, createdByUserId: request.auth!.user.id,
      } });
      await this.writeAudit(tx, request, 'OPERATIONAL_LESSON_DISPOSITION_CREATED', 'OperationalLessonDisposition', row.id, {
        capabilityKey: 'TEACHING_OPERATION_MANAGE', scope: dto.dispositionType === OperationalLessonDispositionType.AUTHORIZED_CANCELLATION ? 'SCHOOL_WIDE' : 'SUBJECT',
        resourceId: dto.dispositionType === OperationalLessonDispositionType.AUTHORIZED_CANCELLATION ? undefined : row.subjectId,
        requestKey: dto.requestKey.trim(), academicYearId: row.academicYearId, timetableVersionId: row.timetableVersionId,
        timetableEntryId: row.timetableEntryId, schoolClassId: row.schoolClassId, subjectId: row.subjectId,
        dispositionType: row.dispositionType, assignedTeacherUserId: row.assignedTeacherUserId, replacesId: row.replacesId,
        civilDate: dto.sourceCivilDate, retrospective: this.isPast(dto.sourceCivilDate), ...COLLISION_COVERAGE,
      });
      return { outcome: 'CREATED', record: toLessonDispositionRecord(row), collisionCoverage: COLLISION_COVERAGE };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async listLessonDispositions(query: ListLessonDispositionsDto, request: AuthenticatedRequest): Promise<OperationalLessonDispositionListResponse> {
    if (query.subjectId) await this.access.requireTeachingSubject(request, query.subjectId);
    else await this.access.requireTeachingSchoolWide(request);
    const where: Prisma.OperationalLessonDispositionWhereInput = { academicYearId: query.academicYearId };
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.schoolClassId) where.schoolClassId = query.schoolClassId;
    if (query.sourceCivilDate) where.sourceCivilDate = parseCivilDate(query.sourceCivilDate);
    if (query.status) where.status = query.status;
    if (query.dispositionType) where.dispositionType = query.dispositionType;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.operationalLessonDisposition.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ sourceCivilDate: 'asc' }, { timetableEntryId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }),
      this.prisma.operationalLessonDisposition.count({ where }),
    ]);
    return { items: items.map(toLessonDispositionRecord), page: query.page, pageSize: query.pageSize, total, collisionCoverage: COLLISION_COVERAGE };
  }

  async getLessonDisposition(id: string, request: AuthenticatedRequest): Promise<OperationalLessonDispositionRecord> {
    const row = await this.prisma.operationalLessonDisposition.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy disposition tiết dạy.');
    await this.access.requireTeachingSubject(request, row.subjectId);
    return toLessonDispositionRecord(row);
  }

  async reverseLessonDisposition(id: string, dto: ReverseOperationalOverlayDto, request: AuthenticatedRequest): Promise<OperationalLessonDispositionReverseResult> {
    const persisted = await this.prisma.operationalLessonDisposition.findUnique({ where: { id } });
    if (!persisted) throw new NotFoundException('Không tìm thấy disposition tiết dạy.');
    if (persisted.dispositionType === OperationalLessonDispositionType.AUTHORIZED_CANCELLATION) await this.access.requireTeachingSchoolWide(request);
    else await this.access.requireTeachingSubject(request, persisted.subjectId);
    const fingerprint = reverseFingerprint(id, dto.expectedUpdatedAt, dto.reversalReason.trim());
    return this.withMutationRetry(async () => this.prisma.$transaction(async (tx) => {
      const keyed = await tx.operationalLessonDisposition.findUnique({ where: { reverseRequestKey: dto.requestKey.trim() } });
      if (keyed) {
        if (keyed.id !== id || keyed.reverseRequestFingerprint !== fingerprint) throw new ConflictException('requestKey đảo ngược đã được dùng với nội dung khác.');
        return { outcome: 'IDEMPOTENT_REPLAY', record: toLessonDispositionRecord(keyed), collisionCoverage: COLLISION_COVERAGE };
      }
      const reversedAt = this.clock.now();
      const changed = await tx.operationalLessonDisposition.updateMany({ where: { id, status: OperationalOverlayStatus.ACTIVE, updatedAt: new Date(dto.expectedUpdatedAt) }, data: {
        status: OperationalOverlayStatus.REVERSED, reversedByUserId: request.auth!.user.id, reversedAt,
        reversalReason: dto.reversalReason.trim(), reverseRequestKey: dto.requestKey.trim(), reverseRequestFingerprint: fingerprint, updatedAt: reversedAt,
      } });
      if (changed.count !== 1) throw new ConflictException(STALE_MESSAGE);
      const row = await tx.operationalLessonDisposition.findUniqueOrThrow({ where: { id } });
      await this.writeAudit(tx, request, 'OPERATIONAL_LESSON_DISPOSITION_REVERSED', 'OperationalLessonDisposition', id, {
        capabilityKey: 'TEACHING_OPERATION_MANAGE', scope: row.dispositionType === OperationalLessonDispositionType.AUTHORIZED_CANCELLATION ? 'SCHOOL_WIDE' : 'SUBJECT',
        resourceId: row.dispositionType === OperationalLessonDispositionType.AUTHORIZED_CANCELLATION ? undefined : row.subjectId,
        requestKey: dto.requestKey.trim(), academicYearId: row.academicYearId, timetableVersionId: row.timetableVersionId,
        timetableEntryId: row.timetableEntryId, schoolClassId: row.schoolClassId, subjectId: row.subjectId,
        dispositionType: row.dispositionType, assignedTeacherUserId: row.assignedTeacherUserId,
        civilDate: formatCivilDate(row.sourceCivilDate), retrospective: this.isPast(formatCivilDate(row.sourceCivilDate)), ...COLLISION_COVERAGE,
      });
      return { outcome: 'REVERSED', record: toLessonDispositionRecord(row), collisionCoverage: COLLISION_COVERAGE };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  private normalizeCalendar(dto: CreateCalendarExceptionDto) {
    const exactTimeSlotDefinitionIds = [...new Set(dto.exactTimeSlotDefinitionIds ?? [])].sort();
    const normalized = {
      academicYearId: dto.academicYearId, academicCalendarVersionId: dto.academicCalendarVersionId,
      civilDate: dto.civilDate, scope: dto.scope, gradeLevel: dto.gradeLevel ?? null, schoolClassId: dto.schoolClassId ?? null,
      timeSelector: dto.timeSelector, session: dto.session ?? null, exactTimeSlotDefinitionIds,
      note: dto.note?.trim() ?? null, replacesId: dto.replacesId ?? null,
    };
    if (dto.scope === CalendarExceptionScope.SCHOOL_WIDE && (dto.gradeLevel !== undefined || dto.schoolClassId !== undefined)
      || dto.scope === CalendarExceptionScope.GRADE && (dto.gradeLevel === undefined || dto.schoolClassId !== undefined)
      || dto.scope === CalendarExceptionScope.CLASS && (dto.schoolClassId === undefined || dto.gradeLevel !== undefined)) {
      throw new BadRequestException('Hình dạng scope của ngoại lệ lịch học không hợp lệ.');
    }
    if (dto.timeSelector === CalendarExceptionTimeSelector.WHOLE_DAY && (dto.session !== undefined || dto.exactTimeSlotDefinitionIds !== undefined)
      || dto.timeSelector === CalendarExceptionTimeSelector.SESSION && (dto.session === undefined || dto.exactTimeSlotDefinitionIds !== undefined)
      || dto.timeSelector === CalendarExceptionTimeSelector.EXACT_SLOTS && (dto.session !== undefined || exactTimeSlotDefinitionIds.length === 0)) {
      throw new BadRequestException('Hình dạng bộ chọn thời gian không hợp lệ.');
    }
    if (this.isPast(dto.civilDate) && !normalized.note) throw new BadRequestException('Lệnh hồi tố phải có ghi chú lý do.');
    return normalized;
  }

  private async validateCalendarCreate(tx: Prisma.TransactionClient, value: ReturnType<OperationalOverlaysService['normalizeCalendar']>): Promise<void> {
    const [year, calendar] = await Promise.all([
      tx.academicYear.findUnique({ where: { id: value.academicYearId }, select: { id: true } }),
      tx.academicCalendarVersion.findUnique({ where: { id: value.academicCalendarVersionId } }),
    ]);
    if (!year) throw new NotFoundException('Không tìm thấy năm học.');
    if (!calendar || calendar.academicYearId !== value.academicYearId) throw new ConflictException('Phiên lịch không thuộc đúng năm học.');
    const date = parseCivilDate(value.civilDate);
    if (date < calendar.startDate || date > calendar.endDate) throw new ConflictException('Ngày nằm ngoài hiệu lực của phiên lịch.');
    if (!this.isPast(value.civilDate) && !calendar.isActive) throw new ConflictException('Lệnh hiện tại/tương lai phải dùng phiên lịch đang có hiệu lực.');
    if (value.schoolClassId) {
      const schoolClass = await tx.schoolClass.findUnique({ where: { id: value.schoolClassId } });
      if (!schoolClass || schoolClass.academicYearId !== value.academicYearId) throw new ConflictException('Lớp không thuộc đúng năm học.');
    }
    const interrupted = await tx.calendarInterruption.findFirst({ where: { calendarVersionId: calendar.id, startDate: { lte: date }, endDate: { gte: date } }, select: { id: true } });
    if (interrupted) throw new ConflictException('Ngày này bị CalendarInterruption bao phủ; không có cơ hội học bình thường.');
    const slots = value.exactTimeSlotDefinitionIds.length ? await tx.timeSlotDefinition.findMany({ where: { id: { in: value.exactTimeSlotDefinitionIds } } }) : [];
    if (slots.length !== value.exactTimeSlotDefinitionIds.length || slots.some((slot) => slot.academicYearId !== value.academicYearId || slot.weekday !== weekdayForCivilDate(date) || (!this.isPast(value.civilDate) && !slot.isActive))) {
      throw new ConflictException('Một hoặc nhiều exact slot không hợp lệ cho năm/ngày/nguồn hiện hành.');
    }
    await this.requireReplacement(tx, 'calendar', value.replacesId);
    const existing = await tx.calendarException.findMany({ where: { academicCalendarVersionId: calendar.id, civilDate: date, status: OperationalOverlayStatus.ACTIVE }, include: { ...calendarExceptionInclude, schoolClass: { select: { gradeLevel: true } } } });
    const targetClass = value.schoolClassId ? await tx.schoolClass.findUniqueOrThrow({ where: { id: value.schoolClassId }, select: { gradeLevel: true } }) : null;
    for (const item of existing) {
      if (this.scopeOverlaps(value, targetClass?.gradeLevel ?? null, item, item.schoolClass?.gradeLevel ?? null)
        && this.timeOverlaps(value, slots, item, await this.slotsForException(tx, item))) throw new ConflictException('Ngoại lệ lịch học ACTIVE bị chồng lấp.');
    }
    await this.assertCalendarDoesNotSuppressOverlay(tx, value, slots, date, targetClass?.gradeLevel ?? null);
  }

  private async assertCalendarDoesNotSuppressOverlay(tx: Prisma.TransactionClient, value: ReturnType<OperationalOverlaysService['normalizeCalendar']>, slots: Array<{ id: string; session: TimeSlotSession }>, date: Date, targetGrade: number | null): Promise<void> {
    const dispositions = await tx.operationalLessonDisposition.findMany({ where: { academicCalendarVersionId: value.academicCalendarVersionId, sourceCivilDate: date, status: OperationalOverlayStatus.ACTIVE }, include: { timetableEntry: { include: { schoolClass: { select: { gradeLevel: true } }, timeSlotDefinition: { select: { session: true } } } } } });
    for (const row of dispositions) {
      if (this.scopeCovers(value, targetGrade, row.schoolClassId, row.timetableEntry.schoolClass.gradeLevel)
        && this.timeCovers(value, slots, row.timeSlotDefinitionId, row.timetableEntry.timeSlotDefinition.session)) throw new ConflictException('Ngoại lệ sẽ triệt tiêu một disposition ACTIVE.');
    }
    const makeups = await tx.makeupTeachingSchedule.findMany({ where: { targetAcademicCalendarVersionId: value.academicCalendarVersionId, targetCivilDate: date, status: OperationalOverlayStatus.ACTIVE }, include: { targetTimeSlotDefinition: { select: { session: true } } } });
    const classIds = [...new Set(makeups.map((row) => row.schoolClassId))];
    const classes = classIds.length ? await tx.schoolClass.findMany({ where: { id: { in: classIds } }, select: { id: true, gradeLevel: true } }) : [];
    const grades = new Map(classes.map((row) => [row.id, row.gradeLevel]));
    for (const row of makeups) {
      if (this.scopeCovers(value, targetGrade, row.schoolClassId, grades.get(row.schoolClassId) ?? -1)
        && this.timeCovers(value, slots, row.targetTimeSlotDefinitionId, row.targetTimeSlotDefinition.session)) throw new ConflictException('Ngoại lệ sẽ triệt tiêu một lịch dạy bù ACTIVE.');
    }
  }

  private async validateDispositionSource(tx: Prisma.TransactionClient, entry: SourceEntry, date: Date, note: string | null): Promise<void> {
    const civil = formatCivilDate(date);
    const version = entry.timetableVersion;
    if (!version.calendarVersionId || !version.calendarVersion) throw new ConflictException('Nguồn thời khóa biểu không có phiên lịch retained chính xác.');
    if (!version.effectiveFrom || date < version.effectiveFrom || version.effectiveUntil && date > version.effectiveUntil) throw new ConflictException('Ngày nguồn ngoài hiệu lực thời khóa biểu.');
    const past = this.isPast(civil);
    if (past ? version.status !== TimetableVersionStatus.ACTIVE && version.status !== TimetableVersionStatus.SUPERSEDED : version.status !== TimetableVersionStatus.ACTIVE) throw new ConflictException('Trạng thái thời khóa biểu không có thẩm quyền cho ngày nguồn.');
    if (date < version.calendarVersion.startDate || date > version.calendarVersion.endDate) throw new ConflictException('Ngày nguồn ngoài hiệu lực phiên lịch.');
    if (!past && !version.calendarVersion.isActive) throw new ConflictException('Nguồn hiện tại/tương lai đã trôi khỏi phiên lịch authoritative.');
    if (!past) {
      const authoritative = await tx.timetableVersion.findMany({
        where: { academicYearId: entry.academicYearId, status: TimetableVersionStatus.ACTIVE, effectiveFrom: { lte: date }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: date } }] },
        select: { id: true }, orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }], take: 2,
      });
      if (authoritative.length !== 1 || authoritative[0]?.id !== version.id) throw new ConflictException('Nguồn thời khóa biểu hiện tại/tương lai không còn là nguồn date-effective authoritative duy nhất.');
      if (!entry.timeSlotDefinition.isActive || !entry.timeSlotDefinition.allowRegularTeaching
        || entry.schoolClass.status !== 'ACTIVE' || entry.subject.status !== 'ACTIVE'
        || entry.teacher.status !== 'ACTIVE' || !entry.teacher.profile?.isTeachingStaff) {
        throw new ConflictException('Nguồn retained hiện tại/tương lai không còn hợp lệ để vận hành.');
      }
    }
    if (entry.weekday !== weekdayForCivilDate(date) || entry.timeSlotDefinition.weekday !== entry.weekday) throw new ConflictException('Thứ của ngày nguồn không khớp entry/slot.');
    if (date < entry.teachingAssignment.validFrom || entry.teachingAssignment.validUntil && date > entry.teachingAssignment.validUntil) throw new ConflictException('TeachingAssignment không có hiệu lực tại ngày nguồn.');
    if (past && !note) throw new BadRequestException('Lệnh hồi tố phải có ghi chú lý do.');
    if (await tx.calendarInterruption.findFirst({ where: { calendarVersionId: version.calendarVersionId, startDate: { lte: date }, endDate: { gte: date } }, select: { id: true } })) throw new ConflictException('CalendarInterruption đã loại bỏ cơ hội nguồn.');
    const exceptions = await tx.calendarException.findMany({ where: { academicCalendarVersionId: version.calendarVersionId, civilDate: date, status: OperationalOverlayStatus.ACTIVE }, include: { ...calendarExceptionInclude, schoolClass: { select: { gradeLevel: true } } } });
    const applicable = [];
    for (const exception of exceptions) if (this.exceptionCoversEntry(exception, entry.schoolClassId, entry.schoolClass.gradeLevel, entry.timeSlotDefinitionId, entry.timeSlotDefinition.session)) applicable.push(exception.id);
    if (applicable.length > 1) throw new ConflictException('Dữ liệu ngoại lệ ACTIVE mơ hồ; hệ thống từ chối an toàn.');
    if (applicable.length === 1) throw new ConflictException('CalendarException đã loại bỏ cơ hội nguồn.');
  }

  private validateDispositionShape(dto: CreateLessonDispositionDto): void {
    if (isTeacherDisposition(dto.dispositionType) !== Boolean(dto.assignedTeacherUserId)) throw new BadRequestException('assignedTeacherUserId không phù hợp loại disposition.');
  }

  private async resolveEligibility(tx: Prisma.TransactionClient, dto: CreateLessonDispositionDto, subjectId: string): Promise<Record<string, unknown>> {
    if (!dto.assignedTeacherUserId) return {};
    const user = await tx.user.findUnique({ where: { id: dto.assignedTeacherUserId }, include: { profile: true } });
    if (!user || user.status !== 'ACTIVE' || !user.profile || !user.profile.isTeachingStaff) throw new ConflictException('Giáo viên được gán không phải nhân sự giảng dạy ACTIVE hợp lệ.');
    const checkedAt = this.clock.now();
    if (dto.dispositionType === OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION) {
      const proof = await tx.staffSubject.findFirst({ where: { userId: user.id, subjectId, validFrom: { lte: checkedAt }, OR: [{ validUntil: null }, { validUntil: { gt: checkedAt } }] }, orderBy: [{ validFrom: 'desc' }, { id: 'asc' }] });
      if (!proof) throw new ConflictException('Giáo viên thay thế không có StaffSubject hiện hành cho môn nguồn.');
      return { eligibilityCheckedAt: checkedAt, eligibilityWasActive: true, eligibilityWasTeachingStaff: true, eligibilitySameSubject: true, eligibilityStaffSubjectId: proof.id };
    }
    return { eligibilityCheckedAt: checkedAt, eligibilityWasActive: true, eligibilityWasTeachingStaff: true, eligibilitySameSubject: false, eligibilityStaffSubjectId: null };
  }

  private async assertTeacherAvailable(tx: Prisma.TransactionClient, teacherId: string, date: Date, weekday: AcademicWeekday, slotId: string): Promise<void> {
    if (await tx.operationalLessonDisposition.findFirst({ where: { assignedTeacherUserId: teacherId, sourceCivilDate: date, timeSlotDefinitionId: slotId, status: OperationalOverlayStatus.ACTIVE, dispositionType: { in: [OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION, OperationalLessonDispositionType.DIFFERENT_SUBJECT_SUPERVISION] } }, select: { id: true } })) throw new ConflictException('Giáo viên đã có occupancy từ disposition ACTIVE.');
    if (await tx.makeupTeachingSchedule.findFirst({ where: { scheduledTeacherUserId: teacherId, targetCivilDate: date, targetTimeSlotDefinitionId: slotId, status: OperationalOverlayStatus.ACTIVE }, select: { id: true } })) throw new ConflictException('Giáo viên đã có occupancy từ lịch dạy bù ACTIVE.');
    const entries = await tx.timetableEntry.findMany({ where: { teacherUserId: teacherId, weekday, timeSlotDefinitionId: slotId, timetableVersion: { status: { in: [TimetableVersionStatus.ACTIVE, TimetableVersionStatus.SUPERSEDED] }, effectiveFrom: { lte: date }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: date } }] } }, include: { timetableVersion: true, schoolClass: { select: { gradeLevel: true } }, timeSlotDefinition: { select: { session: true } } } });
    for (const entry of entries) {
      if (!entry.timetableVersion.calendarVersionId) continue;
      if (await tx.calendarInterruption.findFirst({ where: { calendarVersionId: entry.timetableVersion.calendarVersionId, startDate: { lte: date }, endDate: { gte: date } }, select: { id: true } })) continue;
      const exceptions = await tx.calendarException.findMany({ where: { academicCalendarVersionId: entry.timetableVersion.calendarVersionId, civilDate: date, status: OperationalOverlayStatus.ACTIVE }, include: { ...calendarExceptionInclude, schoolClass: { select: { gradeLevel: true } } } });
      const applicable = exceptions.filter((item) => this.exceptionCoversEntry(item, entry.schoolClassId, entry.schoolClass.gradeLevel, slotId, entry.timeSlotDefinition.session));
      if (applicable.length > 1) throw new ConflictException('Dữ liệu ngoại lệ ACTIVE mơ hồ; hệ thống từ chối an toàn.');
      if (applicable.length === 1) continue;
      if (await tx.operationalLessonDisposition.findFirst({ where: { timetableEntryId: entry.id, sourceCivilDate: date, status: OperationalOverlayStatus.ACTIVE }, select: { id: true } })) continue;
      throw new ConflictException('Giáo viên đã có occupancy từ thời khóa biểu canonical.');
    }
  }

  private async requireReplacement(tx: Prisma.TransactionClient, family: 'calendar' | 'disposition', replacesId: string | null): Promise<void> {
    if (!replacesId) return;
    const predecessor = family === 'calendar'
      ? await tx.calendarException.findUnique({ where: { id: replacesId }, select: { status: true } })
      : await tx.operationalLessonDisposition.findUnique({ where: { id: replacesId }, select: { status: true } });
    if (!predecessor || predecessor.status !== OperationalOverlayStatus.REVERSED) throw new ConflictException('Predecessor phải tồn tại, cùng family và đã REVERSED.');
  }

  private async requireSourceEntry(db: PrismaService | Prisma.TransactionClient, id: string): Promise<SourceEntry> {
    const row = await db.timetableEntry.findUnique({ where: { id }, include: {
      timetableVersion: { include: { calendarVersion: true } }, timeSlotDefinition: true,
      schoolClass: { select: { gradeLevel: true, status: true } }, subject: true,
      teachingAssignment: true, teacher: { include: { profile: true } },
    } });
    if (!row) throw new NotFoundException('Không tìm thấy TimetableEntry nguồn.');
    return row;
  }

  private scopeOverlaps(left: ScopeShape, leftGrade: number | null, right: ScopeShape, rightGrade: number | null): boolean {
    if (left.scope === CalendarExceptionScope.SCHOOL_WIDE || right.scope === CalendarExceptionScope.SCHOOL_WIDE) return true;
    if (left.scope === CalendarExceptionScope.GRADE && right.scope === CalendarExceptionScope.GRADE) return left.gradeLevel === right.gradeLevel;
    if (left.scope === CalendarExceptionScope.CLASS && right.scope === CalendarExceptionScope.CLASS) return left.schoolClassId === right.schoolClassId;
    return left.scope === CalendarExceptionScope.GRADE ? left.gradeLevel === rightGrade : right.gradeLevel === leftGrade;
  }

  private timeOverlaps(left: TimeShape, leftSlots: Array<{ id: string; session: TimeSlotSession }>, right: TimeShape, rightSlots: Array<{ id: string; session: TimeSlotSession }>): boolean {
    if (left.timeSelector === CalendarExceptionTimeSelector.WHOLE_DAY || right.timeSelector === CalendarExceptionTimeSelector.WHOLE_DAY) return true;
    if (left.timeSelector === CalendarExceptionTimeSelector.SESSION && right.timeSelector === CalendarExceptionTimeSelector.SESSION) return left.session === right.session;
    if (left.timeSelector === CalendarExceptionTimeSelector.EXACT_SLOTS && right.timeSelector === CalendarExceptionTimeSelector.EXACT_SLOTS) return leftSlots.some((slot) => rightSlots.some((candidate) => candidate.id === slot.id));
    return left.timeSelector === CalendarExceptionTimeSelector.SESSION ? rightSlots.some((slot) => slot.session === left.session) : leftSlots.some((slot) => slot.session === right.session);
  }

  private scopeCovers(value: ScopeShape, targetGrade: number | null, classId: string, classGrade: number): boolean {
    return value.scope === CalendarExceptionScope.SCHOOL_WIDE || value.scope === CalendarExceptionScope.CLASS && value.schoolClassId === classId || value.scope === CalendarExceptionScope.GRADE && value.gradeLevel === classGrade && (targetGrade === null || targetGrade === classGrade);
  }

  private timeCovers(value: TimeShape, slots: Array<{ id: string; session: TimeSlotSession }>, slotId: string, session: TimeSlotSession): boolean {
    return value.timeSelector === CalendarExceptionTimeSelector.WHOLE_DAY || value.timeSelector === CalendarExceptionTimeSelector.SESSION && value.session === session || value.timeSelector === CalendarExceptionTimeSelector.EXACT_SLOTS && slots.some((slot) => slot.id === slotId);
  }

  private exceptionCoversEntry(exception: ExceptionCoverageShape, classId: string, grade: number, slotId: string, session: TimeSlotSession): boolean {
    const scope = exception.scope === CalendarExceptionScope.SCHOOL_WIDE || exception.scope === CalendarExceptionScope.CLASS && exception.schoolClassId === classId || exception.scope === CalendarExceptionScope.GRADE && exception.gradeLevel === grade;
    const time = exception.timeSelector === CalendarExceptionTimeSelector.WHOLE_DAY || exception.timeSelector === CalendarExceptionTimeSelector.SESSION && exception.session === session || exception.timeSelector === CalendarExceptionTimeSelector.EXACT_SLOTS && exception.exactTimeSlots.some((slot: { timeSlotDefinitionId: string }) => slot.timeSlotDefinitionId === slotId);
    return scope && time;
  }

  private async slotsForException(tx: Prisma.TransactionClient, exception: { exactTimeSlots: Array<{ timeSlotDefinitionId: string }> }): Promise<Array<{ id: string; session: TimeSlotSession }>> {
    const ids = exception.exactTimeSlots.map((item) => item.timeSlotDefinitionId);
    return ids.length ? tx.timeSlotDefinition.findMany({ where: { id: { in: ids } }, select: { id: true, session: true } }) : [];
  }

  private today(): string {
    return new Date(this.clock.now().getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  private isPast(civilDate: string): boolean { return civilDate < this.today(); }

  private async writeAudit(tx: Prisma.TransactionClient, request: AuthenticatedRequest, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.audit.write({ actorUserId: request.auth!.user.id, action, entityType, entityId, requestId: requestMeta(request).requestId, result: AuditResult.SUCCESS, metadata }, tx);
  }

  private async withMutationRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { return await operation(); } catch (error) {
        if (error instanceof HttpException) throw error;
        if (!isRetryable(error)) throw error;
        if (attempt === 3) throw new ConflictException(CREATE_RACE_MESSAGE);
      }
    }
    throw new ConflictException(CREATE_RACE_MESSAGE);
  }
}

type SourceEntry = Prisma.TimetableEntryGetPayload<{ include: { timetableVersion: { include: { calendarVersion: true } }; timeSlotDefinition: true; schoolClass: { select: { gradeLevel: true; status: true } }; subject: true; teachingAssignment: true; teacher: { include: { profile: true } } } }>;
type ScopeShape = { scope: CalendarExceptionScope; gradeLevel: number | null; schoolClassId: string | null };
type TimeShape = { timeSelector: CalendarExceptionTimeSelector; session: TimeSlotSession | null };
type ExceptionCoverageShape = ScopeShape & TimeShape & { exactTimeSlots: Array<{ timeSlotDefinitionId: string }> };

function isRetryable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code);
}
