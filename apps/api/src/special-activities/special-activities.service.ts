import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, OperationalOverlayStatus, Prisma, SpecialActivityScope, SpecialActivityStatus, TimetableVersionStatus } from '@prisma/client';
import { SpecialActivityCreateResult, SpecialActivityListResponse, SpecialActivityRecord, SpecialActivityReverseResult } from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecialActivityDto, ListSpecialActivitiesDto, ReverseSpecialActivityDto } from './dto';
import { specialActivityInclude, toSpecialActivityRecord } from './mapper';
import { SpecialActivityAccessService } from './special-activity-access.service';
import { intervalsOverlap, SPECIAL_ACTIVITY_CLOCK, SPECIAL_ACTIVITY_COLLISION_COVERAGE, specialActivityCreateFingerprint, specialActivityReverseFingerprint, SpecialActivityClock, weekdayForCivilDate } from './special-activity-policy';

const RACE = 'Lệnh xung đột với một thay đổi đồng thời hoặc dữ liệu nghiệp vụ đang có.';
const STALE = 'Bản ghi đã thay đổi; hãy tải lại trước khi đảo ngược.';

@Injectable()
export class SpecialActivitiesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly access: SpecialActivityAccessService, @Inject(SPECIAL_ACTIVITY_CLOCK) private readonly clock: SpecialActivityClock) {}

  async create(dto: CreateSpecialActivityDto, request: AuthenticatedRequest): Promise<SpecialActivityCreateResult> {
    await this.access.requireManage(request);
    const value = this.normalize(dto);
    const fingerprint = specialActivityCreateFingerprint(value);
    return this.retry(() => this.prisma.$transaction(async (tx) => {
      const replay = await tx.specialActivity.findUnique({ where: { createRequestKey: dto.requestKey.trim() }, include: specialActivityInclude });
      if (replay) {
        if (replay.createRequestFingerprint !== fingerprint) throw new ConflictException('requestKey đã được dùng với nội dung khác.');
        return { outcome: 'IDEMPOTENT_REPLAY', record: toSpecialActivityRecord(replay), collisionCoverage: SPECIAL_ACTIVITY_COLLISION_COVERAGE };
      }
      const context = await this.validateAndResolve(tx, value);
      await this.assertNoCollision(tx, value, context.classIds, context.slots);
      const root = await tx.specialActivity.create({ data: {
        academicYearId: value.academicYearId, academicCalendarVersionId: value.academicCalendarVersionId, civilDate: parseCivilDate(value.civilDate), scope: value.scope,
        gradeLevel: value.gradeLevel, schoolClassId: value.schoolClassId, title: value.title, note: value.note, replacesId: value.replacesId,
        createRequestKey: dto.requestKey.trim(), createRequestFingerprint: fingerprint, createdByUserId: request.auth!.user.id,
      } });
      await tx.specialActivityTimeSlot.createMany({ data: value.exactTimeSlotDefinitionIds.map((timeSlotDefinitionId) => ({ specialActivityId: root.id, academicYearId: value.academicYearId, timeSlotDefinitionId })) });
      await tx.specialActivityClassTarget.createMany({ data: context.classIds.map((schoolClassId) => ({ specialActivityId: root.id, academicYearId: value.academicYearId, schoolClassId })) });
      await tx.specialActivityStaffing.createMany({ data: context.staff.map((item) => ({ specialActivityId: root.id, scheduledTeacherUserId: item.userId, staffProfileId: item.profileId, eligibilityCheckedAt: item.checkedAt, eligibilityWasActive: true, eligibilityWasTeachingStaff: true })) });
      const row = await tx.specialActivity.findUniqueOrThrow({ where: { id: root.id }, include: specialActivityInclude });
      await this.writeAudit(tx, request, 'SPECIAL_ACTIVITY_CREATED', row.id, { capabilityKey: 'SPECIAL_ACTIVITY_MANAGE', scope: 'SCHOOL_WIDE', requestKey: dto.requestKey.trim(), academicYearId: row.academicYearId, calendarVersionId: row.academicCalendarVersionId, civilDate: value.civilDate, activityScope: row.scope, gradeLevel: row.gradeLevel, schoolClassId: row.schoolClassId, exactTimeSlotDefinitionIds: value.exactTimeSlotDefinitionIds, targetClassCount: context.classIds.length, scheduledTeacherUserIds: value.scheduledTeacherUserIds, replacesId: row.replacesId, collisionProfile: SPECIAL_ACTIVITY_COLLISION_COVERAGE.profile });
      return { outcome: 'CREATED', record: toSpecialActivityRecord(row), collisionCoverage: SPECIAL_ACTIVITY_COLLISION_COVERAGE };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async list(query: ListSpecialActivitiesDto, request: AuthenticatedRequest): Promise<SpecialActivityListResponse> {
    await this.access.requireManage(request);
    const where: Prisma.SpecialActivityWhereInput = { academicYearId: query.academicYearId, ...(query.civilDate ? { civilDate: parseCivilDate(query.civilDate) } : {}), ...(query.status ? { status: query.status } : {}), ...(query.scope ? { scope: query.scope } : {}) };
    const [items, total] = await this.prisma.$transaction([this.prisma.specialActivity.findMany({ where, include: specialActivityInclude, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ civilDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }), this.prisma.specialActivity.count({ where })]);
    return { items: items.map(toSpecialActivityRecord), page: query.page, pageSize: query.pageSize, total, collisionCoverage: SPECIAL_ACTIVITY_COLLISION_COVERAGE };
  }

  async get(id: string, request: AuthenticatedRequest): Promise<SpecialActivityRecord> {
    await this.access.requireManage(request);
    const row = await this.prisma.specialActivity.findUnique({ where: { id }, include: specialActivityInclude });
    if (!row) throw new NotFoundException('Không tìm thấy hoạt động đặc biệt.');
    return toSpecialActivityRecord(row);
  }

  async reverse(id: string, dto: ReverseSpecialActivityDto, request: AuthenticatedRequest): Promise<SpecialActivityReverseResult> {
    await this.access.requireManage(request);
    const fingerprint = specialActivityReverseFingerprint(id, dto.expectedUpdatedAt, dto.reversalReason.trim());
    return this.retry(() => this.prisma.$transaction(async (tx) => {
      const replay = await tx.specialActivity.findUnique({ where: { reverseRequestKey: dto.requestKey.trim() }, include: specialActivityInclude });
      if (replay) {
        if (replay.id !== id || replay.reverseRequestFingerprint !== fingerprint) throw new ConflictException('requestKey đảo ngược đã được dùng với nội dung khác.');
        return { outcome: 'IDEMPOTENT_REPLAY', record: toSpecialActivityRecord(replay), collisionCoverage: SPECIAL_ACTIVITY_COLLISION_COVERAGE };
      }
      const existing = await tx.specialActivity.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Không tìm thấy hoạt động đặc biệt.');
      const reversedAt = this.clock.now();
      const changed = await tx.specialActivity.updateMany({ where: { id, status: SpecialActivityStatus.ACTIVE, updatedAt: new Date(dto.expectedUpdatedAt) }, data: { status: SpecialActivityStatus.REVERSED, reversedByUserId: request.auth!.user.id, reversedAt, reversalReason: dto.reversalReason.trim(), reverseRequestKey: dto.requestKey.trim(), reverseRequestFingerprint: fingerprint, updatedAt: reversedAt } });
      if (changed.count !== 1) throw new ConflictException(STALE);
      const row = await tx.specialActivity.findUniqueOrThrow({ where: { id }, include: specialActivityInclude });
      await this.writeAudit(tx, request, 'SPECIAL_ACTIVITY_REVERSED', id, { capabilityKey: 'SPECIAL_ACTIVITY_MANAGE', scope: 'SCHOOL_WIDE', requestKey: dto.requestKey.trim(), academicYearId: row.academicYearId, calendarVersionId: row.academicCalendarVersionId, civilDate: formatCivilDate(row.civilDate), collisionProfile: SPECIAL_ACTIVITY_COLLISION_COVERAGE.profile });
      return { outcome: 'REVERSED', record: toSpecialActivityRecord(row), collisionCoverage: SPECIAL_ACTIVITY_COLLISION_COVERAGE };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  private normalize(dto: CreateSpecialActivityDto) {
    const value = { academicYearId: dto.academicYearId, academicCalendarVersionId: dto.academicCalendarVersionId, civilDate: dto.civilDate, scope: dto.scope, gradeLevel: dto.gradeLevel ?? null, schoolClassId: dto.schoolClassId ?? null, exactTimeSlotDefinitionIds: [...new Set(dto.exactTimeSlotDefinitionIds)].sort(), scheduledTeacherUserIds: [...new Set(dto.scheduledTeacherUserIds)].sort(), title: dto.title.trim(), note: dto.note?.trim() ?? null, replacesId: dto.replacesId ?? null };
    const bad = value.scope === SpecialActivityScope.SCHOOL_WIDE && (value.gradeLevel !== null || value.schoolClassId !== null) || value.scope === SpecialActivityScope.GRADE && (![10, 11, 12].includes(value.gradeLevel ?? -1) || value.schoolClassId !== null) || value.scope === SpecialActivityScope.CLASS && (value.schoolClassId === null || value.gradeLevel !== null);
    if (bad || value.exactTimeSlotDefinitionIds.length === 0 || value.scheduledTeacherUserIds.length === 0) throw new BadRequestException('Hình dạng hoạt động đặc biệt không hợp lệ.');
    return value;
  }

  private async validateAndResolve(tx: Prisma.TransactionClient, value: ReturnType<SpecialActivitiesService['normalize']>) {
    const date = parseCivilDate(value.civilDate); const past = this.isPast(value.civilDate);
    const [year, calendar, slots] = await Promise.all([tx.academicYear.findUnique({ where: { id: value.academicYearId }, select: { id: true } }), tx.academicCalendarVersion.findUnique({ where: { id: value.academicCalendarVersionId } }), tx.timeSlotDefinition.findMany({ where: { id: { in: value.exactTimeSlotDefinitionIds } } })]);
    if (!year) throw new NotFoundException('Không tìm thấy năm học.');
    if (!calendar || calendar.academicYearId !== value.academicYearId || date < calendar.startDate || date > calendar.endDate || (!past && !calendar.isActive)) throw new ConflictException('Phiên lịch retained không hợp lệ cho lệnh này.');
    if (slots.length !== value.exactTimeSlotDefinitionIds.length || slots.some((slot) => slot.academicYearId !== value.academicYearId || slot.weekday !== weekdayForCivilDate(date) || (!past && !slot.isActive))) throw new ConflictException('Một hoặc nhiều exact slot không hợp lệ cho năm/ngày/nguồn hiện hành.');
    const classes = await tx.schoolClass.findMany({ where: { academicYearId: value.academicYearId, ...(value.scope === SpecialActivityScope.GRADE ? { gradeLevel: value.gradeLevel! } : {}), ...(value.scope === SpecialActivityScope.CLASS ? { id: value.schoolClassId! } : {}), ...(!past ? { status: 'ACTIVE' } : {}) }, select: { id: true } });
    if (value.scope === SpecialActivityScope.CLASS && classes.length !== 1) throw new ConflictException('Lớp không thuộc đúng năm học hoặc không còn current canonical.');
    const classIds = [...new Set(classes.map((x) => x.id))].sort(); if (!classIds.length) throw new ConflictException('Không có lớp canonical nào để đóng băng mục tiêu.');
    const users = await tx.user.findMany({ where: { id: { in: value.scheduledTeacherUserIds } }, include: { profile: true } });
    if (users.length !== value.scheduledTeacherUserIds.length || users.some((u) => u.status !== 'ACTIVE' || !u.profile || !u.profile.isTeachingStaff)) throw new ConflictException('Giáo viên được xếp không phải nhân sự giảng dạy ACTIVE hợp lệ.');
    if (value.replacesId) { const predecessor = await tx.specialActivity.findUnique({ where: { id: value.replacesId }, select: { status: true } }); if (!predecessor || predecessor.status !== SpecialActivityStatus.REVERSED) throw new ConflictException('Predecessor phải tồn tại và đã REVERSED.'); }
    const checkedAt = this.clock.now();
    return { classIds, slots, staff: users.map((u) => ({ userId: u.id, profileId: u.profile!.id, checkedAt })) };
  }

  private async assertNoCollision(tx: Prisma.TransactionClient, value: ReturnType<SpecialActivitiesService['normalize']>, classIds: string[], slots: Array<{ id: string; startTime: Date; endTime: Date }>) {
    const date = parseCivilDate(value.civilDate); const teacherIds = value.scheduledTeacherUserIds;
    const activities = await tx.specialActivity.findMany({ where: { academicYearId: value.academicYearId, civilDate: date, status: SpecialActivityStatus.ACTIVE }, include: { timeSlots: { include: { timeSlotDefinition: true } }, classTargets: true, staffing: true } });
    for (const row of activities) if (row.timeSlots.some((a) => slots.some((b) => intervalsOverlap(a.timeSlotDefinition, b))) && (row.classTargets.some((x) => classIds.includes(x.schoolClassId)) || row.staffing.some((x) => teacherIds.includes(x.scheduledTeacherUserId)))) throw new ConflictException('Hoạt động đặc biệt ACTIVE bị chồng lấp class hoặc giáo viên.');
    const makeups = await tx.makeupTeachingSchedule.findMany({ where: { academicYearId: value.academicYearId, targetCivilDate: date, status: OperationalOverlayStatus.ACTIVE }, include: { targetTimeSlotDefinition: true } });
    if (makeups.some((x) => slots.some((slot) => intervalsOverlap(slot, x.targetTimeSlotDefinition)) && (classIds.includes(x.schoolClassId) || teacherIds.includes(x.scheduledTeacherUserId)))) throw new ConflictException('Hoạt động đặc biệt bị chồng lấp lịch dạy bù ACTIVE.');
    const dispositions = await tx.operationalLessonDisposition.findMany({ where: { academicYearId: value.academicYearId, sourceCivilDate: date, status: OperationalOverlayStatus.ACTIVE }, include: { timetableEntry: { include: { timeSlotDefinition: true } } } });
    if (dispositions.some((x) => slots.some((slot) => intervalsOverlap(slot, x.timetableEntry.timeSlotDefinition)) && (classIds.includes(x.schoolClassId) || (x.assignedTeacherUserId !== null && teacherIds.includes(x.assignedTeacherUserId))))) throw new ConflictException('Hoạt động đặc biệt bị chồng lấp disposition ACTIVE.');
    await this.assertNormalTeacherOccupancy(tx, value, classIds, slots);
  }

  private async assertNormalTeacherOccupancy(tx: Prisma.TransactionClient, value: ReturnType<SpecialActivitiesService['normalize']>, targetClassIds: string[], slots: Array<{ id: string; startTime: Date; endTime: Date }>) {
    const date = parseCivilDate(value.civilDate); const weekday = weekdayForCivilDate(date);
    const entries = await tx.timetableEntry.findMany({ where: { teacherUserId: { in: value.scheduledTeacherUserIds }, weekday, timetableVersion: { status: { in: [TimetableVersionStatus.ACTIVE, TimetableVersionStatus.SUPERSEDED] }, effectiveFrom: { lte: date }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: date } }] } }, include: { timeSlotDefinition: true, timetableVersion: true, schoolClass: { select: { gradeLevel: true } } } });
    for (const entry of entries) {
      if (!slots.some((slot) => intervalsOverlap(slot, entry.timeSlotDefinition))) continue;
      if (targetClassIds.includes(entry.schoolClassId)) continue;
      if (entry.timetableVersion.calendarVersionId && await tx.calendarInterruption.findFirst({ where: { calendarVersionId: entry.timetableVersion.calendarVersionId, startDate: { lte: date }, endDate: { gte: date } }, select: { id: true } })) continue;
      if (entry.timetableVersion.calendarVersionId) {
        const exceptions = await tx.calendarException.findMany({ where: { academicCalendarVersionId: entry.timetableVersion.calendarVersionId, civilDate: date, status: OperationalOverlayStatus.ACTIVE }, include: { exactTimeSlots: true } });
        const suppressed = exceptions.some((exception) => {
          const scope = exception.scope === 'SCHOOL_WIDE' || exception.scope === 'CLASS' && exception.schoolClassId === entry.schoolClassId || exception.scope === 'GRADE' && exception.gradeLevel === entry.schoolClass.gradeLevel;
          const time = exception.timeSelector === 'WHOLE_DAY' || exception.timeSelector === 'SESSION' && exception.session === entry.timeSlotDefinition.session || exception.timeSelector === 'EXACT_SLOTS' && exception.exactTimeSlots.some((slot) => slot.timeSlotDefinitionId === entry.timeSlotDefinitionId);
          return scope && time;
        });
        if (suppressed) continue;
      }
      if (await tx.operationalLessonDisposition.findFirst({ where: { timetableEntryId: entry.id, sourceCivilDate: date, status: OperationalOverlayStatus.ACTIVE }, select: { id: true } })) continue;
      throw new ConflictException('Giáo viên đã có occupancy từ thời khóa biểu canonical.');
    }
  }

  private today(): string { return new Date(this.clock.now().getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10); }
  private isPast(date: string): boolean { return date < this.today(); }
  private async writeAudit(tx: Prisma.TransactionClient, request: AuthenticatedRequest, action: string, id: string, metadata: Record<string, unknown>): Promise<void> { await this.audit.write({ actorUserId: request.auth!.user.id, action, entityType: 'SpecialActivity', entityId: id, requestId: requestMeta(request).requestId, result: AuditResult.SUCCESS, metadata }, tx); }
  private async retry<T>(operation: () => Promise<T>): Promise<T> { for (let attempt = 1; attempt <= 3; attempt += 1) { try { return await operation(); } catch (error) { if (error instanceof HttpException) throw error; if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !['P2002', 'P2034'].includes(error.code) || attempt === 3) { if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException(RACE); throw error; } } } throw new ConflictException(RACE); }
}
