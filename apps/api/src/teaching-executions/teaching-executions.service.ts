import { ConflictException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { OperationalLessonDispositionType, OperationalOverlayStatus, Prisma, SpecialActivityStatus, TeachingExecutionStatus } from '@prisma/client';
import { CurricularTeachingExecutionRecord, SpecialActivityParticipationExecutionRecord, TeachingExecutionMutationResult } from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PpctOccurrenceAllocationService } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResolvedLessonOccurrencesService } from '../resolved-occurrences/resolved-occurrences.service';
import { ConfirmMakeupTeachingExecutionDto, ConfirmNormalTeachingExecutionDto, ConfirmSpecialActivityParticipationDto, ReverseTeachingExecutionDto } from './dto';
import { createFingerprint, hcmSlotEnd, reverseFingerprint, TEACHING_EXECUTION_CLOCK, TeachingExecutionClock } from './teaching-execution-policy';
import { TeachingExecutionAccessService } from './teaching-execution-access.service';

@Injectable()
export class TeachingExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly allocation: PpctOccurrenceAllocationService,
    private readonly structural: ResolvedLessonOccurrencesService,
    private readonly audit: AuditService,
    private readonly access: TeachingExecutionAccessService,
    @Inject(TEACHING_EXECUTION_CLOCK) private readonly clock: TeachingExecutionClock,
  ) {}

  confirmNormal(dto: ConfirmNormalTeachingExecutionDto, request: AuthenticatedRequest): Promise<TeachingExecutionMutationResult<CurricularTeachingExecutionRecord>> {
    return this.retry(() => this.prisma.$transaction((tx) => this.confirmNormalTx(tx, dto, request), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  confirmMakeup(dto: ConfirmMakeupTeachingExecutionDto, request: AuthenticatedRequest): Promise<TeachingExecutionMutationResult<CurricularTeachingExecutionRecord>> {
    return this.retry(() => this.prisma.$transaction((tx) => this.confirmMakeupTx(tx, dto, request), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  confirmActivity(dto: ConfirmSpecialActivityParticipationDto, request: AuthenticatedRequest): Promise<TeachingExecutionMutationResult<SpecialActivityParticipationExecutionRecord>> {
    return this.retry(() => this.prisma.$transaction((tx) => this.confirmActivityTx(tx, dto, request), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async reverseCurricular(id: string, dto: ReverseTeachingExecutionDto, request: AuthenticatedRequest): Promise<TeachingExecutionMutationResult<CurricularTeachingExecutionRecord>> {
    return this.retry(() => this.prisma.$transaction(async (tx) => {
      const fingerprint = reverseFingerprint(id, dto.expectedUpdatedAt, dto.reversalReason);
      const row = await tx.curricularTeachingExecution.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Không tìm thấy bằng chứng thực hiện chương trình.');
      await this.access.requireCurricular(request, row.actualTeacherUserId, row.subjectId);
      if (row.reverseRequestKey) {
        if (row.reverseRequestKey !== dto.requestKey) throw new ConflictException('requestKey đảo ngược đã được dùng.');
        if (row.reverseRequestFingerprint !== fingerprint) throw new ConflictException('requestKey được dùng với nội dung khác.');
        return { outcome: 'IDEMPOTENT_REPLAY', item: this.curricularRecord(row) };
      }
      if (row.status !== TeachingExecutionStatus.ACTIVE || row.updatedAt.toISOString() !== dto.expectedUpdatedAt) throw new ConflictException('Bằng chứng đã thay đổi hoặc không còn ACTIVE.');
      const updated = await tx.curricularTeachingExecution.updateMany({ where: { id, status: TeachingExecutionStatus.ACTIVE, updatedAt: row.updatedAt }, data: { status: TeachingExecutionStatus.REVERSED, reversedByUserId: request.auth!.user.id, reversedAt: this.clock.now(), reversalReason: dto.reversalReason, reverseRequestKey: dto.requestKey, reverseRequestFingerprint: fingerprint } });
      if (updated.count !== 1) throw new ConflictException('Bằng chứng đã thay đổi đồng thời.');
      const result = await tx.curricularTeachingExecution.findUniqueOrThrow({ where: { id } });
      await this.successAudit(tx, request, 'TEACHING_EXECUTION_REVERSED', 'CurricularTeachingExecution', id, { requestKey: dto.requestKey, commandFamily: 'CURRICULAR_REVERSE' });
      return { outcome: 'REVERSED', item: this.curricularRecord(result) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async reverseActivity(id: string, dto: ReverseTeachingExecutionDto, request: AuthenticatedRequest): Promise<TeachingExecutionMutationResult<SpecialActivityParticipationExecutionRecord>> {
    return this.retry(() => this.prisma.$transaction(async (tx) => {
      const fingerprint = reverseFingerprint(id, dto.expectedUpdatedAt, dto.reversalReason);
      const row = await tx.specialActivityParticipationExecution.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Không tìm thấy bằng chứng tham gia hoạt động.');
      await this.access.requireActivity(request, row.actualTeacherUserId);
      if (row.reverseRequestKey) {
        if (row.reverseRequestKey !== dto.requestKey || row.reverseRequestFingerprint !== fingerprint) throw new ConflictException('requestKey đảo ngược xung đột.');
        return { outcome: 'IDEMPOTENT_REPLAY', item: this.activityRecord(row) };
      }
      if (row.status !== TeachingExecutionStatus.ACTIVE || row.updatedAt.toISOString() !== dto.expectedUpdatedAt) throw new ConflictException('Bằng chứng đã thay đổi hoặc không còn ACTIVE.');
      const updated = await tx.specialActivityParticipationExecution.updateMany({ where: { id, status: TeachingExecutionStatus.ACTIVE, updatedAt: row.updatedAt }, data: { status: TeachingExecutionStatus.REVERSED, reversedByUserId: request.auth!.user.id, reversedAt: this.clock.now(), reversalReason: dto.reversalReason, reverseRequestKey: dto.requestKey, reverseRequestFingerprint: fingerprint } });
      if (updated.count !== 1) throw new ConflictException('Bằng chứng đã thay đổi đồng thời.');
      const result = await tx.specialActivityParticipationExecution.findUniqueOrThrow({ where: { id } });
      await this.successAudit(tx, request, 'TEACHING_EXECUTION_REVERSED', 'SpecialActivityParticipationExecution', id, { requestKey: dto.requestKey, commandFamily: 'ACTIVITY_REVERSE' });
      return { outcome: 'REVERSED', item: this.activityRecord(result) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  private async confirmNormalTx(tx: Prisma.TransactionClient, dto: ConfirmNormalTeachingExecutionDto, request: AuthenticatedRequest): Promise<TeachingExecutionMutationResult<CurricularTeachingExecutionRecord>> {
    const fingerprint = createFingerprint('CURRICULAR_NORMAL', { academicYearId: dto.academicYearId, schoolClassId: dto.schoolClassId, subjectId: dto.subjectId, timetableEntryId: dto.timetableEntryId, sourceCivilDate: dto.sourceCivilDate, note: dto.note ?? null, replacesId: dto.replacesId ?? null });
    const replay = await this.curricularReplay(tx, dto.requestKey, fingerprint, request); if (replay) return replay;
    const allocation = await this.allocation.resolveInTransaction(tx, { academicYearId: dto.academicYearId, schoolClassId: dto.schoolClassId, subjectId: dto.subjectId, throughCivilDate: dto.sourceCivilDate as `${number}-${number}-${number}` });
    const key = `NORMAL:${dto.timetableEntryId}:${dto.sourceCivilDate}`;
    const selected = allocation.normalAllocations.find((item) => item.occurrence.occurrenceKey === key);
    if (!selected || selected.allocationStatus !== 'ALLOCATED' || !selected.expectedPpctItem) throw new ConflictException('Cơ hội normal không có phân phối PPCT ALLOCATED đáng tin cậy.');
    const o = selected.occurrence;
    let actualTeacherUserId: string; let dispositionId: string | null = null; let dispositionType: OperationalLessonDispositionType | null = null;
    if (o.effectiveKind === 'BASE_TIMETABLE') actualTeacherUserId = o.responsibleTeacherUserId;
    else if (o.effectiveKind === 'OPERATIONAL_DISPOSITION' && o.disposition?.dispositionType === OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION && o.disposition.assignedTeacherUserId) { actualTeacherUserId = o.disposition.assignedTeacherUserId; dispositionId = o.disposition.id; dispositionType = o.disposition.dispositionType; }
    else throw new ConflictException('Ý nghĩa vận hành không đủ điều kiện xác nhận giảng dạy.');
    await this.assertEnded(o.civilDate, o.timeSlot.endTime, this.clock.now());
    const week = await this.requireWeek(tx, o.academicCalendarVersionId, parseCivilDate(o.civilDate), true);
    const capabilityScope = await this.access.requireCurricular(request, actualTeacherUserId, o.subjectId);
    await this.requireCurricularReplacement(tx, dto.replacesId, { ...o, ppctItemId: selected.expectedPpctItem.ppctItemId });
    const snapshots = await this.curricularSnapshots(tx, o.schoolClass.id, o.subjectId, o.responsibleTeacherUserId, actualTeacherUserId);
    const e = selected.expectedPpctItem;
    const created = await tx.curricularTeachingExecution.create({ data: { kind: 'NORMAL', academicYearId: o.academicYearId, schoolClassId: o.schoolClass.id, subjectId: o.subjectId, sourceNormalOccurrenceKey: o.occurrenceKey, originalTimetableVersionId: o.timetableVersionId, originalTimetableEntryId: o.timetableEntryId, sourceCivilDate: parseCivilDate(o.civilDate), sourceAcademicCalendarVersionId: o.academicCalendarVersionId, sourceTimeSlotDefinitionId: o.timeSlot.id, originalTeachingAssignmentId: o.teachingAssignmentId, responsibleTeacherUserId: o.responsibleTeacherUserId, ppctClassAssociationId: e.ppctClassAssociationId, ppctPlanId: e.ppctPlanId, ppctVersionId: e.ppctVersionId, ppctItemId: e.ppctItemId, ppctItemRevisionId: e.ppctItemRevisionId, operationalLessonDispositionId: dispositionId, operationalDispositionType: dispositionType, executionCivilDate: parseCivilDate(o.civilDate), executionAcademicCalendarVersionId: o.academicCalendarVersionId, executionTimeSlotDefinitionId: o.timeSlot.id, executionAcademicWeekId: week.weekId!, executionAcademicWeekSegmentId: week.segmentId!, actualTeacherUserId, ...snapshots, note: dto.note ?? null, createRequestKey: dto.requestKey, createRequestFingerprint: fingerprint, replacesId: dto.replacesId ?? null, createdByUserId: request.auth!.user.id } });
    await this.successAudit(tx, request, 'TEACHING_EXECUTION_CONFIRMED', 'CurricularTeachingExecution', created.id, { requestKey: dto.requestKey, commandFamily: 'CURRICULAR_NORMAL', capabilityScope, sourceNormalOccurrenceKey: o.occurrenceKey, operationalLessonDispositionId: dispositionId });
    return { outcome: 'CREATED', item: this.curricularRecord(created) };
  }

  private async confirmMakeupTx(tx: Prisma.TransactionClient, dto: ConfirmMakeupTeachingExecutionDto, request: AuthenticatedRequest): Promise<TeachingExecutionMutationResult<CurricularTeachingExecutionRecord>> {
    const fingerprint = createFingerprint('CURRICULAR_MAKEUP', { makeupTeachingScheduleId: dto.makeupTeachingScheduleId, note: dto.note ?? null, replacesId: dto.replacesId ?? null });
    const replay = await this.curricularReplay(tx, dto.requestKey, fingerprint, request); if (replay) return replay;
    const m = await tx.makeupTeachingSchedule.findUnique({ where: { id: dto.makeupTeachingScheduleId }, include: { targetTimeSlotDefinition: true } });
    if (!m || m.status !== OperationalOverlayStatus.ACTIVE) throw new ConflictException('Lịch dạy bù không còn ACTIVE.');
    const targetDate = formatCivilDate(m.targetCivilDate);
    const allocation = await this.allocation.resolveInTransaction(tx, { academicYearId: m.academicYearId, schoolClassId: m.schoolClassId, subjectId: m.subjectId, throughCivilDate: targetDate });
    const match = allocation.makeupSourceMatches.find((item) => item.makeupTeachingScheduleId === m.id);
    if (!match || match.status !== 'MATCH' || !match.expectedPpctItem) throw new ConflictException('Nguồn PPCT của lịch dạy bù không khớp hoặc bị chặn lịch sử.');
    await this.assertEnded(targetDate, m.targetTimeSlotDefinition.endTime.toISOString().slice(11, 19), this.clock.now());
    const week = await this.requireWeek(tx, m.targetAcademicCalendarVersionId, m.targetCivilDate, true);
    const capabilityScope = await this.access.requireCurricular(request, m.scheduledTeacherUserId, m.subjectId);
    await this.requireCurricularReplacement(tx, dto.replacesId, {
      academicYearId: m.academicYearId,
      schoolClass: { id: m.schoolClassId },
      subjectId: m.subjectId,
      timetableEntryId: m.originalTimetableEntryId,
      civilDate: formatCivilDate(m.originalCivilDate),
      ppctBinding: { ppctClassAssociationId: m.ppctClassAssociationId, ppctPlanId: m.ppctPlanId, ppctVersionId: m.ppctVersionId }, ppctItemId: m.ppctItemId,
    });
    const snapshots = await this.curricularSnapshots(tx, m.schoolClassId, m.subjectId, m.responsibleTeacherUserId, m.scheduledTeacherUserId);
    const e = match.expectedPpctItem;
    const created = await tx.curricularTeachingExecution.create({ data: { kind: 'MAKEUP', academicYearId: m.academicYearId, schoolClassId: m.schoolClassId, subjectId: m.subjectId, sourceNormalOccurrenceKey: match.sourceNormalOccurrenceKey, originalTimetableVersionId: m.originalTimetableVersionId, originalTimetableEntryId: m.originalTimetableEntryId, sourceCivilDate: m.originalCivilDate, sourceAcademicCalendarVersionId: m.originalAcademicCalendarVersionId, sourceTimeSlotDefinitionId: m.originalTimeSlotDefinitionId, originalTeachingAssignmentId: m.originalTeachingAssignmentId, responsibleTeacherUserId: m.responsibleTeacherUserId, ppctClassAssociationId: e.ppctClassAssociationId, ppctPlanId: e.ppctPlanId, ppctVersionId: e.ppctVersionId, ppctItemId: e.ppctItemId, ppctItemRevisionId: e.ppctItemRevisionId, makeupTeachingScheduleId: m.id, executionCivilDate: m.targetCivilDate, executionAcademicCalendarVersionId: m.targetAcademicCalendarVersionId, executionTimeSlotDefinitionId: m.targetTimeSlotDefinitionId, executionAcademicWeekId: week.weekId!, executionAcademicWeekSegmentId: week.segmentId!, actualTeacherUserId: m.scheduledTeacherUserId, ...snapshots, note: dto.note ?? null, createRequestKey: dto.requestKey, createRequestFingerprint: fingerprint, replacesId: dto.replacesId ?? null, createdByUserId: request.auth!.user.id } });
    await this.successAudit(tx, request, 'TEACHING_EXECUTION_CONFIRMED', 'CurricularTeachingExecution', created.id, { requestKey: dto.requestKey, commandFamily: 'CURRICULAR_MAKEUP', capabilityScope, makeupTeachingScheduleId: m.id });
    return { outcome: 'CREATED', item: this.curricularRecord(created) };
  }

  private async confirmActivityTx(tx: Prisma.TransactionClient, dto: ConfirmSpecialActivityParticipationDto, request: AuthenticatedRequest): Promise<TeachingExecutionMutationResult<SpecialActivityParticipationExecutionRecord>> {
    const fingerprint = createFingerprint('ACTIVITY_PARTICIPATION', { specialActivityId: dto.specialActivityId, specialActivityStaffingId: dto.specialActivityStaffingId, specialActivityTimeSlotId: dto.specialActivityTimeSlotId, replacesId: dto.replacesId ?? null });
    const replay = await this.activityReplay(tx, dto.requestKey, fingerprint, request); if (replay) return replay;
    const activity = await tx.specialActivity.findUnique({ where: { id: dto.specialActivityId }, include: { staffing: { include: { scheduledTeacher: { include: { profile: true } } } }, timeSlots: { include: { timeSlotDefinition: true } } } });
    if (!activity || activity.status !== SpecialActivityStatus.ACTIVE) throw new ConflictException('SpecialActivity không còn ACTIVE.');
    const staffing = activity.staffing.find((row) => row.id === dto.specialActivityStaffingId);
    const slot = activity.timeSlots.find((row) => row.id === dto.specialActivityTimeSlotId);
    if (!staffing || !slot) throw new ConflictException('Staffing hoặc slot không thuộc đúng SpecialActivity.');
    await this.assertEnded(formatCivilDate(activity.civilDate), slot.timeSlotDefinition.endTime.toISOString().slice(11, 19), this.clock.now());
    const structural = await this.structural.resolveInTransaction(tx, { academicYearId: activity.academicYearId, civilDate: formatCivilDate(activity.civilDate) });
    if (structural.findings.some((finding) => finding.entityIds.includes(activity.id) || finding.entityIds.includes(slot.id) || finding.entityIds.includes(staffing.id))) throw new ConflictException('SpecialActivity có blocker cấu trúc nên không thể xác nhận.');
    const week = await this.requireWeek(tx, activity.academicCalendarVersionId, activity.civilDate, false);
    const capabilityScope = await this.access.requireActivity(request, staffing.scheduledTeacherUserId);
    await this.requireActivityReplacement(tx, dto.replacesId, activity.id, staffing.id, slot.id);
    const displayName = staffing.scheduledTeacher.profile?.displayName;
    if (!displayName) throw new ConflictException('Giáo viên staffing không có display snapshot hợp lệ.');
    const created = await tx.specialActivityParticipationExecution.create({ data: { specialActivityId: activity.id, specialActivityStaffingId: staffing.id, specialActivityTimeSlotId: slot.id, academicYearId: activity.academicYearId, executionCivilDate: activity.civilDate, executionAcademicCalendarVersionId: activity.academicCalendarVersionId, executionTimeSlotDefinitionId: slot.timeSlotDefinitionId, executionAcademicWeekId: week.weekId, executionAcademicWeekSegmentId: week.segmentId, actualTeacherUserId: staffing.scheduledTeacherUserId, activityTitleSnapshot: activity.title, actualTeacherDisplayNameSnapshot: displayName, createRequestKey: dto.requestKey, createRequestFingerprint: fingerprint, replacesId: dto.replacesId ?? null, createdByUserId: request.auth!.user.id } });
    await this.successAudit(tx, request, 'TEACHING_EXECUTION_CONFIRMED', 'SpecialActivityParticipationExecution', created.id, { requestKey: dto.requestKey, commandFamily: 'ACTIVITY_PARTICIPATION', capabilityScope, specialActivityId: activity.id, specialActivityStaffingId: staffing.id, specialActivityTimeSlotId: slot.id });
    return { outcome: 'CREATED', item: this.activityRecord(created) };
  }

  async getCurricular(id: string, request: AuthenticatedRequest): Promise<CurricularTeachingExecutionRecord> {
    const row = await this.prisma.curricularTeachingExecution.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy bằng chứng thực hiện chương trình.');
    await this.access.requireCurricular(request, row.actualTeacherUserId, row.subjectId);
    return this.curricularRecord(row);
  }

  async getActivity(id: string, request: AuthenticatedRequest): Promise<SpecialActivityParticipationExecutionRecord> {
    const row = await this.prisma.specialActivityParticipationExecution.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy bằng chứng tham gia hoạt động.');
    await this.access.requireActivity(request, row.actualTeacherUserId);
    return this.activityRecord(row);
  }

  private async curricularReplay(tx: Prisma.TransactionClient, requestKey: string, fingerprint: string, request: AuthenticatedRequest): Promise<TeachingExecutionMutationResult<CurricularTeachingExecutionRecord> | null> {
    const existing = await tx.curricularTeachingExecution.findUnique({ where: { createRequestKey: requestKey } });
    if (!existing) return null;
    await this.access.requireCurricular(request, existing.actualTeacherUserId, existing.subjectId);
    if (existing.createRequestFingerprint !== fingerprint) throw new ConflictException('requestKey được dùng với nội dung khác.');
    return { outcome: 'IDEMPOTENT_REPLAY', item: this.curricularRecord(existing) };
  }
  private async activityReplay(tx: Prisma.TransactionClient, requestKey: string, fingerprint: string, request: AuthenticatedRequest): Promise<TeachingExecutionMutationResult<SpecialActivityParticipationExecutionRecord> | null> {
    const existing = await tx.specialActivityParticipationExecution.findUnique({ where: { createRequestKey: requestKey } });
    if (!existing) return null;
    await this.access.requireActivity(request, existing.actualTeacherUserId);
    if (existing.createRequestFingerprint !== fingerprint) throw new ConflictException('requestKey được dùng với nội dung khác.');
    return { outcome: 'IDEMPOTENT_REPLAY', item: this.activityRecord(existing) };
  }

  private async requireWeek(tx: Prisma.TransactionClient, calendarVersionId: string, civilDate: Date, required: boolean): Promise<{ weekId: string | null; segmentId: string | null }> {
    const segments = await tx.academicWeekSegment.findMany({ where: { calendarVersionId, startDate: { lte: civilDate }, endDate: { gte: civilDate } }, select: { id: true, academicWeekId: true } });
    if (!segments.length && !required) return { weekId: null, segmentId: null };
    if (segments.length !== 1) throw new ConflictException('Ánh xạ AcademicWeek/segment bị thiếu hoặc mơ hồ.');
    return { weekId: segments[0]!.academicWeekId, segmentId: segments[0]!.id };
  }

  private async assertEnded(civilDate: string, endTime: string, now: Date): Promise<void> {
    const date = parseCivilDate(civilDate);
    const [hour, minute, second] = endTime.split(':').map(Number);
    const slot = new Date(Date.UTC(1970, 0, 1, hour, minute, second));
    if (hcmSlotEnd(date, slot) > now) throw new ConflictException('Chưa đến thời điểm kết thúc tiết dạy.');
  }

  private async curricularSnapshots(tx: Prisma.TransactionClient, classId: string, subjectId: string, responsibleId: string, actualId: string) {
    const [schoolClass, subject, responsible, actual] = await Promise.all([
      tx.schoolClass.findUnique({ where: { id: classId }, select: { code: true, name: true } }),
      tx.subject.findUnique({ where: { id: subjectId }, select: { code: true, name: true } }),
      tx.user.findUnique({ where: { id: responsibleId }, include: { profile: { select: { displayName: true } } } }),
      tx.user.findUnique({ where: { id: actualId }, include: { profile: { select: { displayName: true } } } }),
    ]);
    if (!schoolClass || !subject || !responsible?.profile || !actual?.profile) throw new ConflictException('Không thể tạo display snapshot authoritative.');
    return { schoolClassCodeSnapshot: schoolClass.code, schoolClassNameSnapshot: schoolClass.name, subjectCodeSnapshot: subject.code, subjectNameSnapshot: subject.name, responsibleTeacherDisplayNameSnapshot: responsible.profile.displayName, actualTeacherDisplayNameSnapshot: actual.profile.displayName };
  }

  private async requireCurricularReplacement(tx: Prisma.TransactionClient, replacesId: string | undefined, source: { academicYearId: string; schoolClass: { id: string }; subjectId: string; timetableEntryId: string; civilDate: string; ppctItemId: string; ppctBinding: { ppctClassAssociationId: string; ppctPlanId: string; ppctVersionId: string } | null }): Promise<void> {
    if (!replacesId) return;
    const predecessor = await tx.curricularTeachingExecution.findUnique({ where: { id: replacesId } });
    if (!predecessor || predecessor.status !== TeachingExecutionStatus.REVERSED || !source.ppctBinding || predecessor.academicYearId !== source.academicYearId || predecessor.schoolClassId !== source.schoolClass.id || predecessor.subjectId !== source.subjectId || predecessor.originalTimetableEntryId !== source.timetableEntryId || formatCivilDate(predecessor.sourceCivilDate) !== source.civilDate || predecessor.ppctClassAssociationId !== source.ppctBinding.ppctClassAssociationId || predecessor.ppctPlanId !== source.ppctBinding.ppctPlanId || predecessor.ppctVersionId !== source.ppctBinding.ppctVersionId || predecessor.ppctItemId !== source.ppctItemId) throw new ConflictException('Replacement curricular không cùng nghĩa vụ reversed.');
  }
  private async requireActivityReplacement(tx: Prisma.TransactionClient, replacesId: string | undefined, activityId: string, staffingId: string, slotId: string): Promise<void> {
    if (!replacesId) return;
    const predecessor = await tx.specialActivityParticipationExecution.findUnique({ where: { id: replacesId } });
    if (!predecessor || predecessor.status !== TeachingExecutionStatus.REVERSED || predecessor.specialActivityId !== activityId || predecessor.specialActivityStaffingId !== staffingId || predecessor.specialActivityTimeSlotId !== slotId) throw new ConflictException('Replacement activity không cùng participation reversed.');
  }

  private async successAudit(tx: Prisma.TransactionClient, request: AuthenticatedRequest, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>): Promise<void> { await this.audit.write({ actorUserId: request.auth!.user.id, action, entityType, entityId, requestId: requestMeta(request).requestId, result: 'SUCCESS', metadata }, tx); }
  private async retry<T>(operation: () => Promise<T>): Promise<T> { for (let attempt = 1; attempt <= 3; attempt += 1) try { return await operation(); } catch (error) { if (error instanceof ConflictException || !(error instanceof Prisma.PrismaClientKnownRequestError) || !['P2002', 'P2034'].includes(error.code) || attempt === 3) { if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('Xung đột đồng thời; hãy thử lại.'); throw error; } } throw new ConflictException('Xung đột đồng thời; hãy thử lại.'); }

  private curricularRecord(row: Prisma.CurricularTeachingExecutionGetPayload<object>): CurricularTeachingExecutionRecord { return { id: row.id, kind: row.kind, status: row.status, academicYearId: row.academicYearId, schoolClassId: row.schoolClassId, subjectId: row.subjectId, sourceNormalOccurrenceKey: row.sourceNormalOccurrenceKey, sourceCivilDate: formatCivilDate(row.sourceCivilDate), originalTimetableVersionId: row.originalTimetableVersionId, originalTimetableEntryId: row.originalTimetableEntryId, sourceAcademicCalendarVersionId: row.sourceAcademicCalendarVersionId, sourceTimeSlotDefinitionId: row.sourceTimeSlotDefinitionId, originalTeachingAssignmentId: row.originalTeachingAssignmentId, ppctClassAssociationId: row.ppctClassAssociationId, ppctPlanId: row.ppctPlanId, ppctVersionId: row.ppctVersionId, ppctItemId: row.ppctItemId, ppctItemRevisionId: row.ppctItemRevisionId, executionCivilDate: formatCivilDate(row.executionCivilDate), executionAcademicCalendarVersionId: row.executionAcademicCalendarVersionId, executionTimeSlotDefinitionId: row.executionTimeSlotDefinitionId, executionAcademicWeekId: row.executionAcademicWeekId, executionAcademicWeekSegmentId: row.executionAcademicWeekSegmentId, responsibleTeacherUserId: row.responsibleTeacherUserId, actualTeacherUserId: row.actualTeacherUserId, operationalLessonDispositionId: row.operationalLessonDispositionId, operationalDispositionType: row.operationalDispositionType, makeupTeachingScheduleId: row.makeupTeachingScheduleId, schoolClassCodeSnapshot: row.schoolClassCodeSnapshot, schoolClassNameSnapshot: row.schoolClassNameSnapshot, subjectCodeSnapshot: row.subjectCodeSnapshot, subjectNameSnapshot: row.subjectNameSnapshot, responsibleTeacherDisplayNameSnapshot: row.responsibleTeacherDisplayNameSnapshot, actualTeacherDisplayNameSnapshot: row.actualTeacherDisplayNameSnapshot, note: row.note, replacesId: row.replacesId, reversedByUserId: row.reversedByUserId, reversedAt: row.reversedAt?.toISOString() ?? null, reversalReason: row.reversalReason, createdByUserId: row.createdByUserId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
  private activityRecord(row: Prisma.SpecialActivityParticipationExecutionGetPayload<object>): SpecialActivityParticipationExecutionRecord { return { id: row.id, status: row.status, specialActivityId: row.specialActivityId, specialActivityStaffingId: row.specialActivityStaffingId, specialActivityTimeSlotId: row.specialActivityTimeSlotId, academicYearId: row.academicYearId, executionCivilDate: formatCivilDate(row.executionCivilDate), executionAcademicCalendarVersionId: row.executionAcademicCalendarVersionId, executionTimeSlotDefinitionId: row.executionTimeSlotDefinitionId, executionAcademicWeekId: row.executionAcademicWeekId, executionAcademicWeekSegmentId: row.executionAcademicWeekSegmentId, actualTeacherUserId: row.actualTeacherUserId, activityTitleSnapshot: row.activityTitleSnapshot, actualTeacherDisplayNameSnapshot: row.actualTeacherDisplayNameSnapshot, replacesId: row.replacesId, reversedByUserId: row.reversedByUserId, reversedAt: row.reversedAt?.toISOString() ?? null, reversalReason: row.reversalReason, createdByUserId: row.createdByUserId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
}
