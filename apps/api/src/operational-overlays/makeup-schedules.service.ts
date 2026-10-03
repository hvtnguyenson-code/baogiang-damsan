import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OperationalLessonDispositionType,
  OperationalOverlayStatus,
  Prisma,
  SpecialActivityStatus,
  TeachingExecutionStatus,
  TimetableVersionStatus,
} from '@prisma/client';
import {
  MakeupTeachingCandidateListResponse,
  MakeupTeachingCandidateRecord,
  MakeupTeachingScheduleCreateResult,
  MakeupTeachingScheduleListResponse,
  MakeupTeachingScheduleRecord,
  MakeupTeachingScheduleReverseResult,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { BusinessConfigurationService } from '../business-configuration/business-configuration.service';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressDebtService } from '../progress-debt/progress-debt.service';
import { staffSubjectCoverageWhere } from '../teaching-assignments/teaching-assignment-policy';
import {
  CreateMakeupScheduleDto,
  ListMakeupCandidatesDto,
  ListMakeupSchedulesDto,
  ReverseOperationalOverlayDto,
} from './dto';
import { toMakeupScheduleRecord } from './mapper';
import { OperationalOverlayAccessService } from './operational-overlay-access.service';
import {
  COLLISION_COVERAGE,
  hcmSlotInstant,
  intervalsOverlap,
  makeupCreateFingerprint,
  OverlayClock,
  OVERLAY_CLOCK,
  reverseFingerprint,
  weekdayForCivilDate,
} from './operational-overlay-policy';
import { hcmCivilDate } from '../progress-debt/progress-debt.policy';

const CREATE_RACE_MESSAGE = 'Lệnh xung đột với một thay đổi đồng thời hoặc dữ liệu nghiệp vụ đang có.';
const STALE_MESSAGE = 'Bản ghi đã thay đổi; hãy tải lại trước khi đảo ngược.';

@Injectable()
export class MakeupSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: OperationalOverlayAccessService,
    private readonly businessConfiguration: BusinessConfigurationService,
    private readonly progressDebt: ProgressDebtService,
    @Inject(OVERLAY_CLOCK) private readonly clock: OverlayClock,
  ) {}

  async listCandidates(
    query: ListMakeupCandidatesDto,
    request: AuthenticatedRequest,
  ): Promise<MakeupTeachingCandidateListResponse> {
    if (query.subjectId) {
      await this.access.requireTeachingSubject(request, query.subjectId);
    } else {
      await this.access.requireTeachingSchoolWide(request);
    }

    const commandNow = this.clock.now();
    const policyResolutionCivilDate = hcmCivilDate(commandNow);
    const operationalStart = await this.businessConfiguration.resolveOperationalStartPolicy(
      query.academicYearId,
      policyResolutionCivilDate,
      this.prisma,
    );
    const operationalStartDate = operationalStart.operationalStartDate;

    // Find all class-subject pairs in this academic year
    const assignmentWhere: Prisma.TeachingAssignmentWhereInput = {
      academicYearId: query.academicYearId,
    };
    if (query.schoolClassId) assignmentWhere.schoolClassId = query.schoolClassId;
    if (query.subjectId) assignmentWhere.subjectId = query.subjectId;

    const assignments = await this.prisma.teachingAssignment.findMany({
      where: assignmentWhere,
      select: { schoolClassId: true, subjectId: true },
      distinct: ['schoolClassId', 'subjectId'],
    });

    const candidateItems: MakeupTeachingCandidateRecord[] = [];

    // Evaluate progress/debt for each class-subject pair
    for (const pair of assignments) {
      const projection = await this.progressDebt.resolveInTransactionV2(this.prisma, {
        academicYearId: query.academicYearId,
        schoolClassId: pair.schoolClassId,
        subjectId: pair.subjectId,
        asOfInstant: commandNow,
      });

      if (projection.status !== 'PASS') continue;

      for (const item of projection.items) {
        if (item.classification !== 'PROVEN_OPEN_DEBT') continue;
        if (item.sourceCivilDate < operationalStartDate) continue;
        if (query.fromCivilDate && item.sourceCivilDate < query.fromCivilDate) continue;
        if (query.toCivilDate && item.sourceCivilDate > query.toCivilDate) continue;
        if (!item.operationalLessonDispositionId || !item.operationalDispositionType) continue;

        candidateItems.push({
          sourceNormalOccurrenceKey: item.sourceNormalOccurrenceKey,
          originalCivilDate: item.sourceCivilDate,
          originalTimeSlotDefinitionId: item.sourceTimeSlotDefinitionId,
          schoolClassId: pair.schoolClassId,
          subjectId: pair.subjectId,
          responsibleTeacherUserId: item.responsibleTeacherUserId,
          sourceDispositionId: item.operationalLessonDispositionId,
          dispositionType: item.operationalDispositionType as OperationalLessonDispositionType,
          ppctItemId: item.ppctItemId,
          component: item.component,
          hasActiveMakeupSchedule: false,
          activeMakeupScheduleId: null,
        });
      }
    }

    if (candidateItems.length === 0) {
      return { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
    }

    // Load active makeup schedules for candidate obligations
    const activeMakeups = await this.prisma.makeupTeachingSchedule.findMany({
      where: {
        academicYearId: query.academicYearId,
        status: OperationalOverlayStatus.ACTIVE,
      },
      select: {
        id: true,
        ppctClassAssociationId: true,
        ppctPlanId: true,
        ppctVersionId: true,
        ppctItemId: true,
        originalTimetableEntryId: true,
        originalCivilDate: true,
      },
    });

    const activeMakeupByCoord = new Map<string, string>();
    for (const m of activeMakeups) {
      const coord = `${m.ppctClassAssociationId}:${m.ppctPlanId}:${m.ppctVersionId}:${m.ppctItemId}`;
      activeMakeupByCoord.set(coord, m.id);
    }

    // Load display names for classes, subjects, users, slots
    const classIds = [...new Set(candidateItems.map((c) => c.schoolClassId))];
    const subjectIds = [...new Set(candidateItems.map((c) => c.subjectId))];
    const teacherUserIds = [...new Set(candidateItems.map((c) => c.responsibleTeacherUserId))];
    const slotIds = [...new Set(candidateItems.map((c) => c.originalTimeSlotDefinitionId))];
    const ppctItemIds = [...new Set(candidateItems.map((c) => c.ppctItemId))];

    const [classes, subjects, users, slots, ppctRevisions] = await Promise.all([
      this.prisma.schoolClass.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }),
      this.prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: teacherUserIds } }, select: { id: true, profile: { select: { displayName: true } } } }),
      this.prisma.timeSlotDefinition.findMany({ where: { id: { in: slotIds } }, select: { id: true, displayLabel: true, session: true, weekday: true } }),
      this.prisma.ppctItemRevision.findMany({ where: { ppctItemId: { in: ppctItemIds } }, select: { ppctItemId: true, title: true, sequence: true }, orderBy: [{ createdAt: 'desc' }] }),
    ]);

    const classMap = new Map(classes.map((c) => [c.id, c.name]));
    const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
    const teacherMap = new Map(users.map((u) => [u.id, u.profile?.displayName ?? u.id]));
    const slotMap = new Map(slots.map((s) => [s.id, s]));
    const ppctRevisionMap = new Map(ppctRevisions.map((p) => [p.ppctItemId, p]));

    for (const candidate of candidateItems) {
      const slot = slotMap.get(candidate.originalTimeSlotDefinitionId);
      const ppct = ppctRevisionMap.get(candidate.ppctItemId);
      candidate.schoolClassName = classMap.get(candidate.schoolClassId);
      candidate.subjectName = subjectMap.get(candidate.subjectId);
      candidate.responsibleTeacherName = teacherMap.get(candidate.responsibleTeacherUserId);
      if (slot) {
        candidate.originalTimeSlotName = slot.displayLabel;
        candidate.originalSession = slot.session;
        candidate.originalWeekday = slot.weekday;
      }
      if (ppct) {
        candidate.ppctItemName = ppct.title;
        candidate.ppctItemSequence = ppct.sequence;
      }
      // Check active makeup
      const activeScheduleId = activeMakeups.find(
        (m) =>
          m.originalTimetableEntryId === candidate.sourceNormalOccurrenceKey.split(':')[1] &&
          formatCivilDate(m.originalCivilDate) === candidate.originalCivilDate,
      )?.id;
      if (activeScheduleId) {
        candidate.hasActiveMakeupSchedule = true;
        candidate.activeMakeupScheduleId = activeScheduleId;
      }
    }

    candidateItems.sort((a, b) => {
      const dateCmp = a.originalCivilDate.localeCompare(b.originalCivilDate);
      if (dateCmp !== 0) return dateCmp;
      return a.sourceNormalOccurrenceKey.localeCompare(b.sourceNormalOccurrenceKey);
    });

    const total = candidateItems.length;
    const page = query.page;
    const pageSize = query.pageSize;
    const items = candidateItems.slice((page - 1) * pageSize, page * pageSize);

    return { items, page, pageSize, total };
  }

  async create(
    dto: CreateMakeupScheduleDto,
    request: AuthenticatedRequest,
  ): Promise<MakeupTeachingScheduleCreateResult> {
    const normalized = {
      academicYearId: dto.academicYearId,
      sourceNormalOccurrenceKey: dto.sourceNormalOccurrenceKey.trim(),
      targetCivilDate: dto.targetCivilDate,
      targetTimeSlotDefinitionId: dto.targetTimeSlotDefinitionId,
      scheduledTeacherUserId: dto.scheduledTeacherUserId,
      note: dto.note?.trim() ?? null,
      replacesId: dto.replacesId ?? null,
    };
    const fingerprint = makeupCreateFingerprint(normalized);

    return this.withMutationRetry(async () =>
      this.prisma.$transaction(
        async (tx) => {
          // 1. Idempotency replay check
          const replay = await tx.makeupTeachingSchedule.findUnique({
            where: { createRequestKey: dto.requestKey.trim() },
          });
          if (replay) {
            if (replay.createRequestFingerprint !== fingerprint) {
              throw new ConflictException('requestKey đã được dùng với nội dung khác.');
            }
            return {
              outcome: 'IDEMPOTENT_REPLAY',
              record: toMakeupScheduleRecord(replay),
              collisionCoverage: COLLISION_COVERAGE,
            };
          }

          // 2. Parse sourceNormalOccurrenceKey
          const parts = normalized.sourceNormalOccurrenceKey.split(':');
          if (parts.length !== 3 || parts[0] !== 'NORMAL') {
            throw new BadRequestException('sourceNormalOccurrenceKey không đúng định dạng chuẩn tắc.');
          }
          const timetableEntryId = parts[1]!;
          const sourceCivilDateStr = parts[2]!;

          // 3. Look up timetableEntry
          const entry = await tx.timetableEntry.findUnique({
            where: { id: timetableEntryId },
            include: {
              timetableVersion: true,
              timeSlotDefinition: true,
              schoolClass: { select: { id: true, gradeLevel: true } },
            },
          });
          if (!entry || entry.academicYearId !== normalized.academicYearId) {
            throw new NotFoundException('Không tìm thấy cơ hội dạy nguồn hoặc không thuộc năm học.');
          }
          if (!entry.timetableVersion.calendarVersionId) {
            throw new ConflictException('Phiên thời khóa biểu gốc không gắn với phiên lịch.');
          }

          // 4. Authorization check for exact persisted subject
          await this.access.requireTeachingSubject(request, entry.subjectId);

          // 5. Operational start check
          const commandNow = this.clock.now();
          const policyResolutionCivilDate = hcmCivilDate(commandNow);
          const operationalStart = await this.businessConfiguration.resolveOperationalStartPolicy(
            normalized.academicYearId,
            policyResolutionCivilDate,
            tx,
          );
          if (sourceCivilDateStr < operationalStart.operationalStartDate) {
            throw new ConflictException(
              'Cơ hội dạy thuộc giai đoạn trước vận hành; không thể lập lịch dạy bù công khai.',
            );
          }

          // 6. Canonical progress/debt revalidation
          const progressDebt = await this.progressDebt.resolveInTransactionV2(tx, {
            academicYearId: normalized.academicYearId,
            schoolClassId: entry.schoolClassId,
            subjectId: entry.subjectId,
            asOfInstant: commandNow,
          });

          if (progressDebt.status !== 'PASS') {
            throw new ConflictException('Tiến độ/nợ tiết bị chặn hoặc không thể tính toán.');
          }

          const debtItem = progressDebt.items.find(
            (item) => item.sourceNormalOccurrenceKey === normalized.sourceNormalOccurrenceKey,
          );
          if (!debtItem) {
            throw new ConflictException('Không tìm thấy nghĩa vụ giảng dạy tương ứng.');
          }

          if (debtItem.classification !== 'PROVEN_OPEN_DEBT') {
            if (debtItem.classification === 'UNCONFIRMED_COMPLETION_GAP') {
              throw new ConflictException('Khoảng trống chưa xác nhận không phải nợ tiết được chứng minh.');
            }
            if (debtItem.classification === 'COMPLETED') {
              throw new ConflictException('Nghĩa vụ đã hoàn thành; không thể lập lịch dạy bù.');
            }
            throw new ConflictException(
              `Nghĩa vụ không ở trạng thái PROVEN_OPEN_DEBT (hiện tại: ${debtItem.classification}).`,
            );
          }

          // 7. Check no ACTIVE fulfilling execution exists
          const existingExec = await tx.curricularTeachingExecution.findFirst({
            where: {
              academicYearId: normalized.academicYearId,
              schoolClassId: entry.schoolClassId,
              subjectId: entry.subjectId,
              sourceNormalOccurrenceKey: normalized.sourceNormalOccurrenceKey,
              status: TeachingExecutionStatus.ACTIVE,
            },
          });
          if (existingExec) {
            throw new ConflictException(
              'Nghĩa vụ đã có bằng chứng thực hiện (CurricularTeachingExecution) ACTIVE.',
            );
          }

          // 8. Check no ACTIVE makeup exists for this obligation
          const existingActiveMakeup = await tx.makeupTeachingSchedule.findFirst({
            where: {
              ppctClassAssociationId: debtItem.ppctClassAssociationId,
              ppctPlanId: debtItem.ppctPlanId,
              ppctVersionId: debtItem.ppctVersionId,
              ppctItemId: debtItem.ppctItemId,
              status: OperationalOverlayStatus.ACTIVE,
            },
          });
          if (existingActiveMakeup) {
            throw new ConflictException('Đã tồn tại lịch dạy bù ACTIVE cho nghĩa vụ PPCT này.');
          }

          // 9. Check source disposition
          if (!debtItem.operationalLessonDispositionId) {
            throw new ConflictException('Nghĩa vụ nợ không có disposition nguồn hợp lệ.');
          }
          const sourceDisposition = await tx.operationalLessonDisposition.findUnique({
            where: { id: debtItem.operationalLessonDispositionId },
          });
          if (!sourceDisposition || sourceDisposition.status !== OperationalOverlayStatus.ACTIVE) {
            throw new ConflictException('Disposition nguồn không còn ACTIVE.');
          }
          if (
            sourceDisposition.dispositionType !== OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT &&
            sourceDisposition.dispositionType !== OperationalLessonDispositionType.DIFFERENT_SUBJECT_SUPERVISION
          ) {
            throw new ConflictException('Disposition nguồn không thuộc loại phát sinh nợ hợp lệ.');
          }

          // 10. Target date & calendar validation
          const targetDate = parseCivilDate(normalized.targetCivilDate);
          const targetCalendar = await tx.academicCalendarVersion.findFirst({
            where: {
              academicYearId: normalized.academicYearId,
              startDate: { lte: targetDate },
              endDate: { gte: targetDate },
            },
            orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }],
          });
          if (!targetCalendar) {
            throw new ConflictException('Ngày mục tiêu nằm ngoài tất cả phiên lịch của năm học.');
          }
          if (!targetCalendar.isActive) {
            throw new ConflictException('Phiên lịch bao phủ ngày mục tiêu chưa được kích hoạt.');
          }

          // CalendarInterruption check
          const interruption = await tx.calendarInterruption.findFirst({
            where: {
              calendarVersionId: targetCalendar.id,
              startDate: { lte: targetDate },
              endDate: { gte: targetDate },
            },
          });
          if (interruption) {
            throw new ConflictException(
              'Ngày mục tiêu nằm trong khoảng gián đoạn lịch học (CalendarInterruption).',
            );
          }

          // Target slot definition validation
          const targetSlot = await tx.timeSlotDefinition.findUnique({
            where: { id: normalized.targetTimeSlotDefinitionId },
          });
          if (!targetSlot || targetSlot.academicYearId !== normalized.academicYearId) {
            throw new NotFoundException('Không tìm thấy tiết học mục tiêu hoặc không thuộc năm học.');
          }
          if (!targetSlot.isActive) {
            throw new ConflictException('Tiết học mục tiêu không còn hoạt động.');
          }

          const targetWeekday = weekdayForCivilDate(targetDate);
          if (targetSlot.weekday !== targetWeekday) {
            throw new ConflictException('Tiết học mục tiêu không khớp thứ trong tuần của ngày mục tiêu.');
          }
          if (!targetSlot.allowMakeupTeaching) {
            throw new ConflictException(
              'Tiết học mục tiêu không cho phép dạy bù (allowMakeupTeaching = false).',
            );
          }

          // Prospective check: target slot must not have started yet at command time
          const targetStartTime = hcmSlotInstant(targetDate, targetSlot.startTime);
          if (targetStartTime <= commandNow) {
            throw new ConflictException(
              'Tiết học mục tiêu phải bắt đầu sau thời điểm tạo lịch theo giờ Việt Nam.',
            );
          }

          // CalendarException check for target class & time
          const exceptions = await tx.calendarException.findMany({
            where: {
              academicCalendarVersionId: targetCalendar.id,
              civilDate: targetDate,
              status: OperationalOverlayStatus.ACTIVE,
            },
            include: { exactTimeSlots: true },
          });
          const suppresses = exceptions.some((exception) => {
            const scopeMatch =
              exception.scope === 'SCHOOL_WIDE' ||
              (exception.scope === 'GRADE' && exception.gradeLevel === entry.schoolClass.gradeLevel) ||
              (exception.scope === 'CLASS' && exception.schoolClassId === entry.schoolClassId);
            const timeMatch =
              exception.timeSelector === 'WHOLE_DAY' ||
              (exception.timeSelector === 'SESSION' && exception.session === targetSlot.session) ||
              (exception.timeSelector === 'EXACT_SLOTS' &&
                exception.exactTimeSlots.some((s) => s.timeSlotDefinitionId === targetSlot.id));
            return scopeMatch && timeMatch;
          });
          if (suppresses) {
            throw new ConflictException(
              'Tiết học mục tiêu của lớp bị triệt tiêu bởi ngoại lệ lịch học (CalendarException) ACTIVE.',
            );
          }

          // 11. Teacher eligibility
          const teacher = await tx.user.findUnique({
            where: { id: normalized.scheduledTeacherUserId },
            include: { profile: true },
          });
          if (!teacher || teacher.status !== 'ACTIVE' || !teacher.profile || !teacher.profile.isTeachingStaff) {
            throw new ConflictException('Giáo viên được xếp lịch không phải nhân sự giảng dạy ACTIVE hợp lệ.');
          }

          const targetCivilDateStr = normalized.targetCivilDate as `${number}-${number}-${number}`;
          const proofs = await tx.staffSubject.findMany({
            where: {
              userId: teacher.id,
              ...staffSubjectCoverageWhere(entry.subjectId, targetCivilDateStr, targetCivilDateStr),
            },
          });
          if (proofs.length === 0) {
            throw new ConflictException('Giáo viên không có StaffSubject bao phủ ngày dạy bù cho môn học này.');
          }
          if (proofs.length > 1) {
            throw new ConflictException(
              'Giáo viên có nhiều hơn một StaffSubject hợp lệ cho môn học này trên ngày mục tiêu (mơ hồ).',
            );
          }
          const proof = proofs[0]!;

          // 12. Collision checks
          const targetInterval = { startTime: targetSlot.startTime, endTime: targetSlot.endTime };

          // a. Active make-up collision (class & teacher)
          const makeups = await tx.makeupTeachingSchedule.findMany({
            where: {
              academicYearId: normalized.academicYearId,
              targetCivilDate: targetDate,
              status: OperationalOverlayStatus.ACTIVE,
              OR: [
                { schoolClassId: entry.schoolClassId },
                { scheduledTeacherUserId: teacher.id },
              ],
            },
            include: { targetTimeSlotDefinition: true },
          });
          for (const m of makeups) {
            if (intervalsOverlap(targetInterval, m.targetTimeSlotDefinition)) {
              if (m.schoolClassId === entry.schoolClassId) {
                throw new ConflictException('Lớp học đã có lịch dạy bù ACTIVE khác trong cùng khoảng thời gian.');
              }
              if (m.scheduledTeacherUserId === teacher.id) {
                throw new ConflictException('Giáo viên đã có lịch dạy bù ACTIVE khác trong cùng khoảng thời gian.');
              }
            }
          }

          // b. Active SpecialActivity collision (class & teacher)
          const activities = await tx.specialActivity.findMany({
            where: {
              academicYearId: normalized.academicYearId,
              civilDate: targetDate,
              status: SpecialActivityStatus.ACTIVE,
              OR: [
                { classTargets: { some: { schoolClassId: entry.schoolClassId } } },
                { staffing: { some: { scheduledTeacherUserId: teacher.id } } },
              ],
            },
            include: {
              timeSlots: { include: { timeSlotDefinition: true } },
              classTargets: true,
              staffing: true,
            },
          });
          for (const act of activities) {
            for (const actSlot of act.timeSlots) {
              if (intervalsOverlap(targetInterval, actSlot.timeSlotDefinition)) {
                if (act.classTargets.some((ct) => ct.schoolClassId === entry.schoolClassId)) {
                  throw new ConflictException(
                    'Lớp học bị trùng lặp với Hoạt động đặc biệt (SpecialActivity) ACTIVE.',
                  );
                }
                if (act.staffing.some((st) => st.scheduledTeacherUserId === teacher.id)) {
                  throw new ConflictException(
                    'Giáo viên bị trùng lặp với Hoạt động đặc biệt (SpecialActivity) ACTIVE.',
                  );
                }
              }
            }
          }

          // c. Active OperationalLessonDispositions assigned to this teacher
          const dispositions = await tx.operationalLessonDisposition.findMany({
            where: {
              academicYearId: normalized.academicYearId,
              sourceCivilDate: targetDate,
              status: OperationalOverlayStatus.ACTIVE,
              assignedTeacherUserId: teacher.id,
            },
            include: { timetableEntry: { include: { timeSlotDefinition: true } } },
          });
          for (const d of dispositions) {
            if (intervalsOverlap(targetInterval, d.timetableEntry.timeSlotDefinition)) {
              throw new ConflictException(
                'Giáo viên đã có occupancy từ disposition thay thế/quản nhiệm ACTIVE.',
              );
            }
          }

          // d. Normal timetable entries (class & teacher)
          const normalEntries = await tx.timetableEntry.findMany({
            where: {
              weekday: targetWeekday,
              timetableVersion: {
                status: { in: [TimetableVersionStatus.ACTIVE, TimetableVersionStatus.SUPERSEDED] },
                effectiveFrom: { lte: targetDate },
                OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: targetDate } }],
              },
              OR: [
                { schoolClassId: entry.schoolClassId },
                { teacherUserId: teacher.id },
              ],
            },
            include: {
              timetableVersion: true,
              timeSlotDefinition: true,
              schoolClass: { select: { gradeLevel: true } },
            },
          });

          for (const ne of normalEntries) {
            if (!intervalsOverlap(targetInterval, ne.timeSlotDefinition)) continue;

            // Check if suppressed by CalendarInterruption
            if (ne.timetableVersion.calendarVersionId) {
              const isInterrupted = await tx.calendarInterruption.findFirst({
                where: {
                  calendarVersionId: ne.timetableVersion.calendarVersionId,
                  startDate: { lte: targetDate },
                  endDate: { gte: targetDate },
                },
              });
              if (isInterrupted) continue;

              // Check CalendarException
              const excs = await tx.calendarException.findMany({
                where: {
                  academicCalendarVersionId: ne.timetableVersion.calendarVersionId,
                  civilDate: targetDate,
                  status: OperationalOverlayStatus.ACTIVE,
                },
                include: { exactTimeSlots: true },
              });
              const isExc = excs.some((exc) => {
                const scopeMatch =
                  exc.scope === 'SCHOOL_WIDE' ||
                  (exc.scope === 'GRADE' && exc.gradeLevel === ne.schoolClass.gradeLevel) ||
                  (exc.scope === 'CLASS' && exc.schoolClassId === ne.schoolClassId);
                const timeMatch =
                  exc.timeSelector === 'WHOLE_DAY' ||
                  (exc.timeSelector === 'SESSION' && exc.session === ne.timeSlotDefinition.session) ||
                  (exc.timeSelector === 'EXACT_SLOTS' &&
                    exc.exactTimeSlots.some((s) => s.timeSlotDefinitionId === ne.timeSlotDefinitionId));
                return scopeMatch && timeMatch;
              });
              if (isExc) continue;
            }

            // Check OperationalLessonDisposition on this normal entry
            const disp = await tx.operationalLessonDisposition.findFirst({
              where: {
                timetableEntryId: ne.id,
                sourceCivilDate: targetDate,
                status: OperationalOverlayStatus.ACTIVE,
              },
            });
            if (disp) {
              if (disp.dispositionType === OperationalLessonDispositionType.AUTHORIZED_CANCELLATION) {
                continue;
              }
              if (disp.dispositionType === OperationalLessonDispositionType.ABSENCE_NO_REPLACEMENT) {
                continue;
              }
              if (disp.dispositionType === OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION) {
                if (ne.schoolClassId === entry.schoolClassId) {
                  throw new ConflictException('Lớp học đã có tiết thay thế từ thời khóa biểu chuẩn tắc.');
                }
                if (ne.teacherUserId === teacher.id) {
                  continue;
                }
              }
              if (disp.dispositionType === OperationalLessonDispositionType.DIFFERENT_SUBJECT_SUPERVISION) {
                if (ne.schoolClassId === entry.schoolClassId) {
                  throw new ConflictException('Lớp học đã có tiết quản nhiệm từ thời khóa biểu chuẩn tắc.');
                }
                if (ne.teacherUserId === teacher.id) {
                  continue;
                }
              }
            }

            if (ne.schoolClassId === entry.schoolClassId) {
              throw new ConflictException('Lớp học đã có lịch học từ thời khóa biểu chuẩn tắc.');
            }
            if (ne.teacherUserId === teacher.id) {
              throw new ConflictException('Giáo viên đã có lịch dạy từ thời khóa biểu chuẩn tắc.');
            }
          }

          // 13. Replacement validation
          if (normalized.replacesId) {
            const predecessor = await tx.makeupTeachingSchedule.findUnique({
              where: { id: normalized.replacesId },
            });
            if (!predecessor) {
              throw new NotFoundException('Không tìm thấy lịch dạy bù tiền nhiệm cần thay thế.');
            }
            if (predecessor.status !== OperationalOverlayStatus.REVERSED) {
              throw new ConflictException('Lịch dạy bù tiền nhiệm phải ở trạng thái REVERSED.');
            }
            if (
              predecessor.academicYearId !== normalized.academicYearId ||
              predecessor.schoolClassId !== entry.schoolClassId ||
              predecessor.subjectId !== entry.subjectId ||
              predecessor.originalTimetableVersionId !== entry.timetableVersionId ||
              predecessor.originalTimetableEntryId !== entry.id ||
              formatCivilDate(predecessor.originalCivilDate) !== sourceCivilDateStr ||
              predecessor.originalAcademicCalendarVersionId !== entry.timetableVersion.calendarVersionId ||
              predecessor.originalTimeSlotDefinitionId !== entry.timeSlotDefinitionId ||
              predecessor.originalTeachingAssignmentId !== entry.teachingAssignmentId ||
              predecessor.responsibleTeacherUserId !== entry.teacherUserId ||
              predecessor.ppctClassAssociationId !== debtItem.ppctClassAssociationId ||
              predecessor.ppctPlanId !== debtItem.ppctPlanId ||
              predecessor.ppctVersionId !== debtItem.ppctVersionId ||
              predecessor.ppctItemId !== debtItem.ppctItemId
            ) {
              throw new ConflictException(
                'Lịch dạy bù thay thế phải bảo toàn đúng nghĩa vụ giảng dạy gốc của lịch tiền nhiệm.',
              );
            }
            const alreadyReplaced = await tx.makeupTeachingSchedule.findFirst({
              where: { replacesId: predecessor.id },
            });
            if (alreadyReplaced) {
              throw new ConflictException('Lịch dạy bù tiền nhiệm đã được thay thế trước đó.');
            }
          }

          // 14. Persist schedule
          const created = await tx.makeupTeachingSchedule.create({
            data: {
              academicYearId: normalized.academicYearId,
              originalTimetableVersionId: entry.timetableVersionId,
              originalTimetableEntryId: entry.id,
              originalCivilDate: parseCivilDate(sourceCivilDateStr),
              originalAcademicCalendarVersionId: entry.timetableVersion.calendarVersionId,
              originalTimeSlotDefinitionId: entry.timeSlotDefinitionId,
              schoolClassId: entry.schoolClassId,
              subjectId: entry.subjectId,
              originalTeachingAssignmentId: entry.teachingAssignmentId,
              responsibleTeacherUserId: entry.teacherUserId,
              ppctClassAssociationId: debtItem.ppctClassAssociationId,
              ppctPlanId: debtItem.ppctPlanId,
              ppctVersionId: debtItem.ppctVersionId,
              ppctItemId: debtItem.ppctItemId,
              sourceDispositionId: sourceDisposition.id,
              targetCivilDate: targetDate,
              targetAcademicCalendarVersionId: targetCalendar.id,
              targetTimeSlotDefinitionId: targetSlot.id,
              scheduledTeacherUserId: teacher.id,
              eligibilityCheckedAt: commandNow,
              eligibilityWasActive: true,
              eligibilityWasTeachingStaff: true,
              eligibilitySameSubject: true,
              eligibilityStaffSubjectId: proof.id,
              note: normalized.note,
              status: OperationalOverlayStatus.ACTIVE,
              createRequestKey: dto.requestKey.trim(),
              createRequestFingerprint: fingerprint,
              replacesId: normalized.replacesId,
              createdByUserId: request.auth!.user.id,
            },
          });

          await this.writeAudit(
            tx,
            request,
            'MAKEUP_TEACHING_SCHEDULE_CREATED',
            'MakeupTeachingSchedule',
            created.id,
            {
              capabilityKey: 'TEACHING_OPERATION_MANAGE',
              scope: 'SUBJECT',
              resourceId: entry.subjectId,
              requestKey: dto.requestKey.trim(),
              academicYearId: created.academicYearId,
              schoolClassId: created.schoolClassId,
              subjectId: created.subjectId,
              scheduledTeacherUserId: created.scheduledTeacherUserId,
              targetCivilDate: normalized.targetCivilDate,
              replacesId: created.replacesId,
              ...COLLISION_COVERAGE,
            },
          );

          return {
            outcome: 'CREATED',
            record: toMakeupScheduleRecord(created),
            collisionCoverage: COLLISION_COVERAGE,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async list(
    query: ListMakeupSchedulesDto,
    request: AuthenticatedRequest,
  ): Promise<MakeupTeachingScheduleListResponse> {
    if (query.subjectId) {
      await this.access.requireTeachingSubject(request, query.subjectId);
    } else {
      await this.access.requireTeachingSchoolWide(request);
    }

    const where: Prisma.MakeupTeachingScheduleWhereInput = {
      academicYearId: query.academicYearId,
    };
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.schoolClassId) where.schoolClassId = query.schoolClassId;
    if (query.status) where.status = query.status;
    if (query.targetCivilDate) where.targetCivilDate = parseCivilDate(query.targetCivilDate);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.makeupTeachingSchedule.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ targetCivilDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.makeupTeachingSchedule.count({ where }),
    ]);

    return {
      items: items.map(toMakeupScheduleRecord),
      page: query.page,
      pageSize: query.pageSize,
      total,
      collisionCoverage: COLLISION_COVERAGE,
    };
  }

  async get(id: string, request: AuthenticatedRequest): Promise<MakeupTeachingScheduleRecord> {
    const row = await this.prisma.makeupTeachingSchedule.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy lịch dạy bù.');
    await this.access.requireTeachingSubject(request, row.subjectId);
    return toMakeupScheduleRecord(row);
  }

  async reverse(
    id: string,
    dto: ReverseOperationalOverlayDto,
    request: AuthenticatedRequest,
  ): Promise<MakeupTeachingScheduleReverseResult> {
    const persisted = await this.prisma.makeupTeachingSchedule.findUnique({ where: { id } });
    if (!persisted) throw new NotFoundException('Không tìm thấy lịch dạy bù.');
    await this.access.requireTeachingSubject(request, persisted.subjectId);

    const fingerprint = reverseFingerprint(id, dto.expectedUpdatedAt, dto.reversalReason.trim());

    return this.withMutationRetry(async () =>
      this.prisma.$transaction(
        async (tx) => {
          const keyed = await tx.makeupTeachingSchedule.findUnique({
            where: { reverseRequestKey: dto.requestKey.trim() },
          });
          if (keyed) {
            if (keyed.id !== id || keyed.reverseRequestFingerprint !== fingerprint) {
              throw new ConflictException('requestKey đảo ngược đã được dùng với nội dung khác.');
            }
            return {
              outcome: 'IDEMPOTENT_REPLAY',
              record: toMakeupScheduleRecord(keyed),
              collisionCoverage: COLLISION_COVERAGE,
            };
          }

          // Check if active CurricularTeachingExecution references this schedule
          const activeExec = await tx.curricularTeachingExecution.findFirst({
            where: {
              makeupTeachingScheduleId: id,
              status: TeachingExecutionStatus.ACTIVE,
            },
          });
          if (activeExec) {
            throw new ConflictException(
              'Không thể đảo ngược lịch dạy bù đã có bằng chứng thực hiện (CurricularTeachingExecution) ACTIVE.',
            );
          }

          const reversedAt = this.clock.now();
          const changed = await tx.makeupTeachingSchedule.updateMany({
            where: {
              id,
              status: OperationalOverlayStatus.ACTIVE,
              updatedAt: new Date(dto.expectedUpdatedAt),
            },
            data: {
              status: OperationalOverlayStatus.REVERSED,
              reversedByUserId: request.auth!.user.id,
              reversedAt,
              reversalReason: dto.reversalReason.trim(),
              reverseRequestKey: dto.requestKey.trim(),
              reverseRequestFingerprint: fingerprint,
              updatedAt: reversedAt,
            },
          });
          if (changed.count !== 1) throw new ConflictException(STALE_MESSAGE);

          const row = await tx.makeupTeachingSchedule.findUniqueOrThrow({ where: { id } });

          await this.writeAudit(
            tx,
            request,
            'MAKEUP_TEACHING_SCHEDULE_REVERSED',
            'MakeupTeachingSchedule',
            id,
            {
              capabilityKey: 'TEACHING_OPERATION_MANAGE',
              scope: 'SUBJECT',
              resourceId: row.subjectId,
              requestKey: dto.requestKey.trim(),
              academicYearId: row.academicYearId,
              schoolClassId: row.schoolClassId,
              subjectId: row.subjectId,
              targetCivilDate: formatCivilDate(row.targetCivilDate),
              reversalReason: dto.reversalReason.trim(),
              ...COLLISION_COVERAGE,
            },
          );

          return {
            outcome: 'REVERSED',
            record: toMakeupScheduleRecord(row),
            collisionCoverage: COLLISION_COVERAGE,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    request: AuthenticatedRequest,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.write(
      {
        actorUserId: request.auth!.user.id,
        action,
        entityType,
        entityId,
        requestId: requestMeta(request).requestId,
        result: 'SUCCESS',
        metadata,
      },
      tx,
    );
  }

  private async withMutationRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof HttpException) throw error;
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2002', 'P2034'].includes(error.code) ||
          attempt === 3
        ) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
            throw new ConflictException(CREATE_RACE_MESSAGE);
          }
          throw error;
        }
      }
    }
    throw new ConflictException(CREATE_RACE_MESSAGE);
  }
}
