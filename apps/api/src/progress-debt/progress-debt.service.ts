import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { OperationalOverlayStatus, Prisma, TeachingExecutionStatus } from '@prisma/client';
import { formatCivilDate } from '../common/validation/civil-date';
import { PpctOccurrenceAllocationService } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.service';
import { ExpectedPpctItem, NormalPpctAllocation } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.types';
import { PrismaService } from '../prisma/prisma.service';
import { TEACHING_EXECUTION_CLOCK, TeachingExecutionClock } from '../teaching-executions/teaching-execution-policy';
import { hasEndedAt, hcmCivilDate } from './progress-debt.policy';
import {
  ProgressDebtCounts, ProgressDebtFinding, ProgressDebtItem, ProgressDebtProjection,
  ResolveProgressDebtInput, TEACHING_PROGRESS_DEBT_PROFILE,
} from './progress-debt.types';

const executionInclude = { executionTimeSlot: { select: { endTime: true } } } satisfies Prisma.CurricularTeachingExecutionInclude;
type Execution = Prisma.CurricularTeachingExecutionGetPayload<{ include: typeof executionInclude }>;
type DirectAllocation = NormalPpctAllocation & { expectedPpctItem: ExpectedPpctItem };

@Injectable()
export class ProgressDebtService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly allocation: PpctOccurrenceAllocationService,
    @Inject(TEACHING_EXECUTION_CLOCK) private readonly clock: TeachingExecutionClock,
  ) {}

  async resolve(input: ResolveProgressDebtInput): Promise<ProgressDebtProjection> {
    this.assertAsOf(input.asOfInstant);
    return this.prisma.$transaction(
      (tx) => this.resolveInTransaction(tx, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async resolveInTransaction(tx: Prisma.TransactionClient, input: ResolveProgressDebtInput): Promise<ProgressDebtProjection> {
    this.assertAsOf(input.asOfInstant);
    const throughCivilDate = hcmCivilDate(input.asOfInstant);
    const allocated = await this.allocation.resolveInTransaction(tx, {
      academicYearId: input.academicYearId,
      schoolClassId: input.schoolClassId,
      subjectId: input.subjectId,
      throughCivilDate,
    });
    if (allocated.status === 'BLOCKED') {
      return this.blocked(input, [{ severity: 'BLOCKER', code: 'UPSTREAM_ALLOCATION_BLOCKED', reason: 'PPCT occurrence allocation is blocked.', occurrenceKey: null, entityIds: allocated.findings.flatMap((finding) => finding.entityIds).sort() }]);
    }

    const direct = allocated.normalAllocations.filter((row): row is DirectAllocation => row.allocationEffect === 'CONSUMES_NEXT_ITEM' && row.allocationStatus === 'ALLOCATED' && row.expectedPpctItem !== null)
      .filter((row) => hasEndedAt(row.occurrence.civilDate, row.occurrence.timeSlot.endTime, input.asOfInstant));
    const executions = await tx.curricularTeachingExecution.findMany({
      where: {
        academicYearId: input.academicYearId,
        schoolClassId: input.schoolClassId,
        subjectId: input.subjectId,
        sourceCivilDate: { lte: new Date(`${throughCivilDate}T00:00:00.000Z`) },
      },
      include: executionInclude,
      orderBy: { id: 'asc' },
    }) as Execution[];
    const candidates = new Map<string, Execution[]>();
    for (const execution of executions) {
      if (execution.status !== TeachingExecutionStatus.ACTIVE || !execution.executionTimeSlot || !hasEndedAt(formatCivilDate(execution.executionCivilDate), execution.executionTimeSlot.endTime.toISOString().slice(11, 19), input.asOfInstant)) continue;
      candidates.set(execution.sourceNormalOccurrenceKey, [...(candidates.get(execution.sourceNormalOccurrenceKey) ?? []), execution]);
    }
    const makeupIds = executions.filter((execution) => execution.kind === 'MAKEUP' && execution.makeupTeachingScheduleId).map((execution) => execution.makeupTeachingScheduleId!);
    const schedules = makeupIds.length ? await tx.makeupTeachingSchedule.findMany({ where: { id: { in: [...new Set(makeupIds)].sort() } }, orderBy: { id: 'asc' } }) : [];
    const schedulesById = new Map(schedules.map((schedule) => [schedule.id, schedule]));

    const items: ProgressDebtItem[] = [];
    const findings: ProgressDebtFinding[] = [];
    for (const allocation of direct) {
      const sourceKey = allocation.occurrence.occurrenceKey;
      const eligible = candidates.get(sourceKey) ?? [];
      if (eligible.length > 1) {
        findings.push(this.finding('ACTIVE_FULFILLMENT_AMBIGUOUS', 'More than one ended ACTIVE curricular execution claims the exact original obligation.', sourceKey, eligible.map((execution) => execution.id)));
        continue;
      }
      if (eligible.length === 1) {
        const execution = eligible[0]!;
        const issue = this.reconcileExecution(allocation, execution, schedulesById.get(execution.makeupTeachingScheduleId ?? '') ?? null, allocated.makeupSourceMatches);
        if (issue) { findings.push(this.finding('RECONCILIATION_REQUIRED', issue, sourceKey, [execution.id])); continue; }
        items.push(this.item(allocation, 'COMPLETED', execution));
        continue;
      }
      const kind = allocation.occurrence.effectiveKind;
      const disposition = allocation.occurrence.disposition?.dispositionType ?? null;
      if (kind === 'OPERATIONAL_DISPOSITION' && (disposition === 'ABSENCE_NO_REPLACEMENT' || disposition === 'DIFFERENT_SUBJECT_SUPERVISION')) {
        items.push(this.item(allocation, 'PROVEN_OPEN_DEBT', null));
      } else if (kind === 'BASE_TIMETABLE' || (kind === 'OPERATIONAL_DISPOSITION' && disposition === 'SAME_SUBJECT_SUBSTITUTION')) {
        items.push(this.item(allocation, 'UNCONFIRMED_COMPLETION_GAP', null));
      } else {
        findings.push(this.finding('OPERATIONAL_MEANING_UNCLASSIFIABLE', `Allocated direct obligation has unsupported operational meaning ${kind}:${disposition ?? 'null'}.`, sourceKey, []));
      }
    }
    if (findings.length) return this.blocked(input, findings);
    const counts: ProgressDebtCounts = {
      distributedElapsedCount: items.length,
      completedCount: items.filter((item) => item.classification === 'COMPLETED').length,
      openDebtCount: items.filter((item) => item.classification === 'PROVEN_OPEN_DEBT').length,
      lateCount: items.filter((item) => item.classification === 'PROVEN_OPEN_DEBT').length,
      unconfirmedGapCount: items.filter((item) => item.classification === 'UNCONFIRMED_COMPLETION_GAP').length,
    };
    if (counts.distributedElapsedCount !== counts.completedCount + counts.openDebtCount + counts.unconfirmedGapCount) throw new Error('Progress/debt invariant violated.');
    return { profile: TEACHING_PROGRESS_DEBT_PROFILE, scope: input, status: 'PASS', counts, items: items.sort((a, b) => a.sourceNormalOccurrenceKey.localeCompare(b.sourceNormalOccurrenceKey)), findings: [], evaluatedAt: this.clock.now().toISOString() };
  }

  private assertAsOf(asOfInstant: Date): void {
    if (!(asOfInstant instanceof Date) || Number.isNaN(asOfInstant.getTime())) throw new BadRequestException('asOfInstant must be a valid instant.');
    if (asOfInstant > this.clock.now()) throw new BadRequestException('asOfInstant cannot be in the future.');
  }

  private reconcileExecution(allocation: DirectAllocation, execution: Execution, schedule: { [key: string]: unknown } | null, matches: Array<{ makeupTeachingScheduleId: string; sourceNormalOccurrenceKey: string; status: string; expectedPpctItem: ExpectedPpctItem | null }>): string | null {
    const occurrence = allocation.occurrence; const expected = allocation.expectedPpctItem;
    const common: Array<[string, unknown, unknown]> = [
      ['academicYearId', execution.academicYearId, occurrence.academicYearId], ['schoolClassId', execution.schoolClassId, occurrence.schoolClass.id], ['subjectId', execution.subjectId, occurrence.subjectId], ['sourceNormalOccurrenceKey', execution.sourceNormalOccurrenceKey, occurrence.occurrenceKey],
      ['originalTimetableVersionId', execution.originalTimetableVersionId, occurrence.timetableVersionId], ['originalTimetableEntryId', execution.originalTimetableEntryId, occurrence.timetableEntryId], ['sourceCivilDate', formatCivilDate(execution.sourceCivilDate), occurrence.civilDate], ['sourceAcademicCalendarVersionId', execution.sourceAcademicCalendarVersionId, occurrence.academicCalendarVersionId], ['sourceTimeSlotDefinitionId', execution.sourceTimeSlotDefinitionId, occurrence.timeSlot.id], ['originalTeachingAssignmentId', execution.originalTeachingAssignmentId, occurrence.teachingAssignmentId], ['responsibleTeacherUserId', execution.responsibleTeacherUserId, occurrence.responsibleTeacherUserId],
      ['ppctClassAssociationId', execution.ppctClassAssociationId, expected.ppctClassAssociationId], ['ppctPlanId', execution.ppctPlanId, expected.ppctPlanId], ['ppctVersionId', execution.ppctVersionId, expected.ppctVersionId], ['ppctItemId', execution.ppctItemId, expected.ppctItemId], ['ppctItemRevisionId', execution.ppctItemRevisionId, expected.ppctItemRevisionId],
    ];
    const mismatch = common.find((entry) => entry[1] !== entry[2]);
    if (mismatch) return `Retained execution ${mismatch[0]} does not match current authoritative direct obligation.`;
    if (execution.kind === 'NORMAL') {
      if (occurrence.effectiveKind === 'BASE_TIMETABLE') return execution.operationalLessonDispositionId !== null || execution.operationalDispositionType !== null || execution.actualTeacherUserId !== occurrence.responsibleTeacherUserId ? 'NORMAL BASE execution disposition or actual teacher no longer matches the current authoritative source.' : null;
      if (occurrence.effectiveKind === 'OPERATIONAL_DISPOSITION' && occurrence.disposition?.dispositionType === 'SAME_SUBJECT_SUBSTITUTION') return execution.operationalLessonDispositionId !== occurrence.disposition.id || execution.operationalDispositionType !== occurrence.disposition.dispositionType || execution.actualTeacherUserId !== occurrence.disposition.assignedTeacherUserId ? 'NORMAL substitution execution disposition or assigned teacher no longer matches the current authoritative source.' : null;
      return 'NORMAL execution no longer has an eligible BASE or exact SAME_SUBJECT_SUBSTITUTION source.';
    }
    if (execution.kind !== 'MAKEUP' || !execution.makeupTeachingScheduleId || !schedule) return 'MAKEUP execution has no current retained makeup schedule.';
    const match = matches.find((item) => item.makeupTeachingScheduleId === execution.makeupTeachingScheduleId);
    if (!match || match.status !== 'MATCH' || match.sourceNormalOccurrenceKey !== occurrence.occurrenceKey || !match.expectedPpctItem || !this.sameExpectedPpctItem(match.expectedPpctItem, expected)) return 'MAKEUP schedule no longer has an exact current authoritative source match.';
    const scheduleChecks: Array<[string, unknown, unknown]> = [
      ['status', schedule.status, OperationalOverlayStatus.ACTIVE], ['academicYearId', schedule.academicYearId, occurrence.academicYearId], ['schoolClassId', schedule.schoolClassId, occurrence.schoolClass.id], ['subjectId', schedule.subjectId, occurrence.subjectId], ['originalTimetableVersionId', schedule.originalTimetableVersionId, occurrence.timetableVersionId], ['originalTimetableEntryId', schedule.originalTimetableEntryId, occurrence.timetableEntryId], ['originalCivilDate', schedule.originalCivilDate instanceof Date ? formatCivilDate(schedule.originalCivilDate) : null, occurrence.civilDate], ['originalAcademicCalendarVersionId', schedule.originalAcademicCalendarVersionId, occurrence.academicCalendarVersionId], ['originalTimeSlotDefinitionId', schedule.originalTimeSlotDefinitionId, occurrence.timeSlot.id], ['originalTeachingAssignmentId', schedule.originalTeachingAssignmentId, occurrence.teachingAssignmentId], ['responsibleTeacherUserId', schedule.responsibleTeacherUserId, occurrence.responsibleTeacherUserId], ['ppctClassAssociationId', schedule.ppctClassAssociationId, expected.ppctClassAssociationId], ['ppctPlanId', schedule.ppctPlanId, expected.ppctPlanId], ['ppctVersionId', schedule.ppctVersionId, expected.ppctVersionId], ['ppctItemId', schedule.ppctItemId, expected.ppctItemId], ['targetCivilDate', schedule.targetCivilDate instanceof Date ? formatCivilDate(schedule.targetCivilDate) : null, formatCivilDate(execution.executionCivilDate)], ['targetAcademicCalendarVersionId', schedule.targetAcademicCalendarVersionId, execution.executionAcademicCalendarVersionId], ['targetTimeSlotDefinitionId', schedule.targetTimeSlotDefinitionId, execution.executionTimeSlotDefinitionId], ['scheduledTeacherUserId', schedule.scheduledTeacherUserId, execution.actualTeacherUserId],
    ];
    const scheduleMismatch = scheduleChecks.find((entry) => entry[1] !== entry[2]);
    return scheduleMismatch ? `MAKEUP retained schedule ${scheduleMismatch[0]} does not match exact accepted source or target provenance.` : null;
  }

  private item(allocation: DirectAllocation, classification: ProgressDebtItem['classification'], execution: Execution | null): ProgressDebtItem {
    const occurrence = allocation.occurrence; const expected = allocation.expectedPpctItem;
    return { classification, sourceNormalOccurrenceKey: occurrence.occurrenceKey, originalTimetableVersionId: occurrence.timetableVersionId, originalTimetableEntryId: occurrence.timetableEntryId, sourceCivilDate: occurrence.civilDate, sourceAcademicCalendarVersionId: occurrence.academicCalendarVersionId, sourceTimeSlotDefinitionId: occurrence.timeSlot.id, originalTeachingAssignmentId: occurrence.teachingAssignmentId, responsibleTeacherUserId: occurrence.responsibleTeacherUserId, ppctClassAssociationId: expected.ppctClassAssociationId, ppctPlanId: expected.ppctPlanId, ppctVersionId: expected.ppctVersionId, ppctItemId: expected.ppctItemId, ppctItemRevisionId: expected.ppctItemRevisionId, operationalLessonDispositionId: occurrence.disposition?.id ?? null, operationalDispositionType: occurrence.disposition?.dispositionType ?? null, fulfillmentExecutionId: execution?.id ?? null, fulfillmentKind: execution?.kind ?? null, makeupTeachingScheduleId: execution?.makeupTeachingScheduleId ?? null, executionCivilDate: execution ? formatCivilDate(execution.executionCivilDate) : null, executionAcademicCalendarVersionId: execution?.executionAcademicCalendarVersionId ?? null, executionTimeSlotDefinitionId: execution?.executionTimeSlotDefinitionId ?? null, actualTeacherUserId: execution?.actualTeacherUserId ?? null };
  }

  private sameExpectedPpctItem(left: ExpectedPpctItem, right: ExpectedPpctItem): boolean {
    return left.distributionObligationKey === right.distributionObligationKey
      && left.ppctClassAssociationId === right.ppctClassAssociationId
      && left.ppctPlanId === right.ppctPlanId
      && left.ppctVersionId === right.ppctVersionId
      && left.ppctItemId === right.ppctItemId
      && left.ppctItemRevisionId === right.ppctItemRevisionId;
  }

  private finding(code: ProgressDebtFinding['code'], reason: string, occurrenceKey: string | null, entityIds: string[]): ProgressDebtFinding { return { severity: 'BLOCKER', code, reason, occurrenceKey, entityIds: [...entityIds].sort() }; }
  private blocked(input: ResolveProgressDebtInput, findings: ProgressDebtFinding[]): ProgressDebtProjection { return { profile: TEACHING_PROGRESS_DEBT_PROFILE, scope: input, status: 'BLOCKED', counts: null, items: [], findings: findings.sort((a, b) => `${a.code}:${a.occurrenceKey ?? ''}:${a.entityIds.join(',')}`.localeCompare(`${b.code}:${b.occurrenceKey ?? ''}:${b.entityIds.join(',')}`)), evaluatedAt: this.clock.now().toISOString() }; }
}
