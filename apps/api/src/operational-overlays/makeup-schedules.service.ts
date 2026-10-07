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
  TeachingExecutionStatus,
  TimeSlotSession,
} from '@prisma/client';
import {
  MakeupTargetOptionsResponse,
  MakeupTargetSlotOption,
  MakeupTargetTeacherOption,
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
  GetMakeupTargetOptionsDto,
  ListMakeupCandidatesDto,
  ListMakeupSchedulesDto,
  ReverseOperationalOverlayDto,
} from './dto';
import { toMakeupScheduleRecord } from './mapper';
import { OperationalOverlayAccessService } from './operational-overlay-access.service';
import {
  COLLISION_COVERAGE,
  hcmSlotInstant,
  makeupCreateFingerprint,
  OverlayClock,
  OVERLAY_CLOCK,
  reverseFingerprint,
  weekdayForCivilDate,
} from './operational-overlay-policy';
import { hcmCivilDate } from '../progress-debt/progress-debt.policy';
import { ResolvedLessonOccurrencesService } from '../resolved-occurrences/resolved-occurrences.service';
import {
  extractCanonicalOccupancies,
  intervalsOverlapTimes,
} from '../resolved-occurrences/effective-occupancy';
import { formatBlockedReason } from '../effective-schedule/effective-schedule-policy';

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
    private readonly resolvedOccurrences: ResolvedLessonOccurrencesService,
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
    let hasBlockedRoot = false;
    const blockedFindings: string[] = [];

    // Evaluate progress/debt for each class-subject pair
    for (const pair of assignments) {
      const projection = await this.progressDebt.resolveInTransactionV2(this.prisma, {
        academicYearId: query.academicYearId,
        schoolClassId: pair.schoolClassId,
        subjectId: pair.subjectId,
        asOfInstant: commandNow,
      });

      if (projection.status !== 'PASS') {
        hasBlockedRoot = true;
        blockedFindings.push(`ROOT_BLOCKED:${pair.schoolClassId}:${pair.subjectId}`);
        continue;
      }

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
          ppctItemRevisionId: item.ppctItemRevisionId,
          component: item.component,
          hasActiveMakeupSchedule: false,
          activeMakeupScheduleId: null,
        });
      }
    }

    // CX-05: If ANY targeted progress/debt root is BLOCKED, the entire candidate response MUST fail closed as BLOCKED
    if (hasBlockedRoot) {
      return {
        status: 'BLOCKED',
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        blockedFindings: blockedFindings.slice(0, 10),
      };
    }

    if (candidateItems.length === 0) {
      return { status: 'PASS', items: [], page: query.page, pageSize: query.pageSize, total: 0 };
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

    // Load display names for classes, subjects, users, slots, and EXACT retained PPCT revisions
    const classIds = [...new Set(candidateItems.map((c) => c.schoolClassId))];
    const subjectIds = [...new Set(candidateItems.map((c) => c.subjectId))];
    const teacherUserIds = [...new Set(candidateItems.map((c) => c.responsibleTeacherUserId))];
    const slotIds = [...new Set(candidateItems.map((c) => c.originalTimeSlotDefinitionId))];
    const ppctItemRevisionIds = [...new Set(candidateItems.map((c) => c.ppctItemRevisionId))];

    const [classes, subjects, users, slots, ppctRevisions] = await Promise.all([
      this.prisma.schoolClass.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }),
      this.prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: teacherUserIds } }, select: { id: true, profile: { select: { displayName: true } } } }),
      this.prisma.timeSlotDefinition.findMany({ where: { id: { in: slotIds } }, select: { id: true, displayLabel: true, session: true, weekday: true } }),
      this.prisma.ppctItemRevision.findMany({
        where: { id: { in: ppctItemRevisionIds } },
        select: { id: true, ppctItemId: true, title: true, sequence: true },
      }),
    ]);

    const classMap = new Map(classes.map((c) => [c.id, c.name]));
    const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
    const teacherMap = new Map(users.map((u) => [u.id, u.profile?.displayName ?? u.id]));
    const slotMap = new Map(slots.map((s) => [s.id, s]));
    const ppctRevisionByIdMap = new Map(ppctRevisions.map((p) => [p.id, p]));

    for (const candidate of candidateItems) {
      const slot = slotMap.get(candidate.originalTimeSlotDefinitionId);
      const ppct = ppctRevisionByIdMap.get(candidate.ppctItemRevisionId);

      // CX-06: Fail closed if exact retained revision is missing or does not match stable item
      if (!ppct || ppct.ppctItemId !== candidate.ppctItemId) {
        return {
          status: 'BLOCKED',
          items: [],
          page: query.page,
          pageSize: query.pageSize,
          total: 0,
          blockedFindings: ['PPCT_RETAINED_REVISION_INTEGRITY_MISMATCH'],
        };
      }

      candidate.schoolClassName = classMap.get(candidate.schoolClassId);
      candidate.subjectName = subjectMap.get(candidate.subjectId);
      candidate.responsibleTeacherName = teacherMap.get(candidate.responsibleTeacherUserId);
      if (slot) {
        candidate.originalTimeSlotName = slot.displayLabel;
        candidate.originalSession = slot.session;
        candidate.originalWeekday = slot.weekday;
      }
      candidate.ppctItemName = ppct.title;
      candidate.ppctItemSequence = ppct.sequence;

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

    return { status: 'PASS', items, page, pageSize, total };
  }

  async getTargetOptions(
    query: GetMakeupTargetOptionsDto,
    request: AuthenticatedRequest,
  ): Promise<MakeupTargetOptionsResponse> {
    const parts = query.sourceNormalOccurrenceKey.trim().split(':');
    if (parts.length !== 3 || parts[0] !== 'NORMAL') {
      throw new BadRequestException('sourceNormalOccurrenceKey không đúng định dạng chuẩn tắc.');
    }
    const timetableEntryId = parts[1]!;

    const entry = await this.prisma.timetableEntry.findUnique({
      where: { id: timetableEntryId },
      select: { subjectId: true, academicYearId: true },
    });
    if (!entry || entry.academicYearId !== query.academicYearId) {
      throw new NotFoundException('Không tìm thấy cơ hội dạy nguồn hoặc không thuộc năm học.');
    }

    await this.access.requireTeachingSubject(request, entry.subjectId);

    const targetDate = parseCivilDate(query.targetCivilDate);
    const targetWeekday = weekdayForCivilDate(targetDate);

    const slots = await this.prisma.timeSlotDefinition.findMany({
      where: {
        academicYearId: query.academicYearId,
        isActive: true,
        weekday: targetWeekday,
        allowMakeupTeaching: true,
      },
      orderBy: [{ session: 'asc' }, { ordinal: 'asc' }, { startTime: 'asc' }],
    });

    const targetCivilDateStr = query.targetCivilDate as `${number}-${number}-${number}`;
    const proofs = await this.prisma.staffSubject.findMany({
      where: {
        ...staffSubjectCoverageWhere(entry.subjectId, targetCivilDateStr, targetCivilDateStr),
        user: {
          status: 'ACTIVE',
          profile: { isTeachingStaff: true },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, staffCode: true } },
          },
        },
      },
    });

    const teacherMap = new Map<string, MakeupTargetTeacherOption>();
    for (const proof of proofs) {
      if (proof.user && !teacherMap.has(proof.user.id)) {
        teacherMap.set(proof.user.id, {
          userId: proof.user.id,
          displayName: proof.user.profile?.displayName ?? proof.user.username,
          staffCode: proof.user.profile?.staffCode ?? null,
        });
      }
    }

    const teachers = [...teacherMap.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));

    const slotOptions: MakeupTargetSlotOption[] = slots.map((s) => ({
      id: s.id,
      displayLabel: s.displayLabel,
      session: s.session as TimeSlotSession,
      ordinal: s.ordinal,
      startTime: s.startTime.toISOString().slice(11, 19) as `${number}:${number}:${number}`,
      endTime: s.endTime.toISOString().slice(11, 19) as `${number}:${number}:${number}`,
    }));

    return {
      academicYearId: query.academicYearId,
      targetCivilDate: query.targetCivilDate,
      targetWeekday,
      slots: slotOptions,
      teachers,
    };
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
            await this.access.requireTeachingSubject(request, replay.subjectId);
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
          const matchingCalendars = await tx.academicCalendarVersion.findMany({
            where: {
              academicYearId: normalized.academicYearId,
              isActive: true,
              startDate: { lte: targetDate },
              endDate: { gte: targetDate },
            },
          });
          if (matchingCalendars.length === 0) {
            throw new ConflictException('Ngày mục tiêu nằm ngoài tất cả phiên lịch đang hoạt động của năm học.');
          }
          if (matchingCalendars.length > 1) {
            throw new ConflictException(
              'Ngày mục tiêu trùng với nhiều hơn một phiên lịch hoạt động trong năm học (mơ hồ).',
            );
          }
          const targetCalendar = matchingCalendars[0]!;

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

          // 12. Canonical resolution & effective occupancy collision checks
          const targetCivilDateFormatted = formatCivilDate(targetDate) as `${number}-${number}-${number}`;
          const resolution = await this.resolvedOccurrences.resolveInTransaction(tx, {
            academicYearId: normalized.academicYearId,
            civilDate: targetCivilDateFormatted,
          });

          if (resolution.status === 'BLOCKED') {
            const firstFinding = resolution.findings[0];
            const reason = firstFinding
              ? formatBlockedReason(firstFinding)
              : 'Lịch dạy ngày mục tiêu bị xung đột hoặc chưa đủ nhất quán.';
            throw new ConflictException(`Ngày mục tiêu bị chặn giải quyết lịch: ${reason}`);
          }

          const occupancies = extractCanonicalOccupancies(resolution);

          const targetStartTimeStr = targetSlot.startTime.toISOString().slice(11, 19);
          const targetEndTimeStr = targetSlot.endTime.toISOString().slice(11, 19);

          for (const occ of occupancies) {
            if (intervalsOverlapTimes(targetStartTimeStr, targetEndTimeStr, occ.startTime, occ.endTime)) {
              if (occ.schoolClassId === entry.schoolClassId) {
                const sourceLabel =
                  occ.sourceKind === 'SPECIAL_ACTIVITY'
                    ? 'Hoạt động đặc biệt (SpecialActivity)'
                    : occ.sourceKind === 'MAKEUP_TEACHING'
                    ? 'Lịch dạy bù'
                    : 'Thời khóa biểu / phân công';
                throw new ConflictException(`Lớp học đã có ${sourceLabel} ACTIVE trong cùng khoảng thời gian.`);
              }
              if (occ.teacherUserId === teacher.id) {
                const sourceLabel =
                  occ.sourceKind === 'SPECIAL_ACTIVITY'
                    ? 'Hoạt động đặc biệt (SpecialActivity)'
                    : occ.sourceKind === 'MAKEUP_TEACHING'
                    ? 'Lịch dạy bù'
                    : 'Thời khóa biểu / phân công';
                throw new ConflictException(`Giáo viên đã có ${sourceLabel} ACTIVE trong cùng khoảng thời gian.`);
              }
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
