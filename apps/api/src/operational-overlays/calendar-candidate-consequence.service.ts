import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { formatCivilDate, hcmCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { OfficialWorkloadProjectionService } from '../official-workload/official-workload-projection.service';
import { PpctOccurrenceAllocationService } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.service';
import { ProgressDebtService } from '../progress-debt/progress-debt.service';
import { CalendarExceptionReplay } from '../resolved-occurrences/calendar-exception-replay';
import { extractCanonicalOccupancies, intervalsOverlapTimes } from '../resolved-occurrences/effective-occupancy';
import { ResolvedLessonOccurrencesService } from '../resolved-occurrences/resolved-occurrences.service';
import { PreviewCalendarExceptionDto } from './dto';
import { OperationalOverlaysService } from './operational-overlays.service';
import { OverlayClock, OVERLAY_CLOCK } from './operational-overlay-policy';

const MAX_DAYS = 550;
const MAX_STREAMS = 512;
const MAX_ROWS = 10000;
const MAX_RETAINED_FACTS = 200000;

/**
 * Composes V2 allocation/fulfillment and official workload in one snapshot.
 * Commands MUST recompute inside their own SERIALIZABLE transaction.
 */
@Injectable()
export class CalendarCandidateConsequenceService {
  constructor(
    @Inject(forwardRef(() => OperationalOverlaysService)) private readonly overlays: OperationalOverlaysService,
    private readonly structural: ResolvedLessonOccurrencesService,
    private readonly allocation: PpctOccurrenceAllocationService,
    private readonly progress: ProgressDebtService,
    private readonly workload: OfficialWorkloadProjectionService,
    @Inject(OVERLAY_CLOCK) private readonly clock: OverlayClock,
  ) {}

  resolveNow(input: PreviewCalendarExceptionDto) {
    return this.resolve(input, this.clock.now());
  }

  async resolve(input: PreviewCalendarExceptionDto, asOfInstant: Date) {
    // Own the input instant across awaits; Progress V2 independently checks
    // non-future semantics using its authoritative clock.
    if (!(asOfInstant instanceof Date)) throw new Error('CALENDAR_REPLAY_AS_OF_INVALID');
    const asOf = new Date(asOfInstant.getTime());
    if (Number.isNaN(asOf.getTime()) || asOf > this.clock.now()) throw new Error('CALENDAR_REPLAY_AS_OF_INVALID');
    return this.overlays.withCalendarConsequenceReplay(input, (replay, tx) => this.evaluate(tx, replay, asOf));
  }

  async evaluate(tx: Prisma.TransactionClient, replay: CalendarExceptionReplay, asOf: Date) {
    const candidate = replay.candidate;
    const classIds = await replay.resolveCandidateClassIds(tx);
    // Include SUPERSEDED history and future-effective ACTIVE heads, never a
    // current/latest shortcut. The finite boundary comes from retained calendars.
    const versions = await tx.timetableVersion.findMany({
      where: { academicYearId: candidate.academicYearId, status: { in: ['ACTIVE', 'SUPERSEDED'] } },
      include: { calendarVersion: true }, orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }], take: 129,
    });
    if (!versions.length || versions.length > 128) throw new Error('CALENDAR_REPLAY_TIMETABLE_BOUNDARY_UNRESOLVED');
    for (const version of versions) {
      const calendar = version.calendarVersion;
      if (!version.effectiveFrom || !calendar || calendar.academicYearId !== candidate.academicYearId
        || calendar.startDate > version.effectiveFrom || calendar.endDate < version.effectiveFrom
        || (version.effectiveUntil && (version.effectiveUntil < version.effectiveFrom || version.effectiveUntil > calendar.endDate))) {
        throw new Error('CALENDAR_REPLAY_TIMETABLE_BOUNDARY_UNRESOLVED');
      }
    }
    const fromCivilDate = formatCivilDate(new Date(Math.min(...versions.map((v) => v.effectiveFrom!.getTime()))));
    const throughCivilDate = formatCivilDate(new Date(Math.max(...versions.map((v) => v.calendarVersion!.endDate.getTime()))));
    const progressThrough = hcmCivilDate(asOf);
    if (candidate.civilDate < fromCivilDate || candidate.civilDate > throughCivilDate
      || progressThrough > throughCivilDate
      || (parseCivilDate(throughCivilDate).getTime() - parseCivilDate(fromCivilDate).getTime()) / 86400000 + 1 > MAX_DAYS) {
      throw new Error('CALENDAR_REPLAY_HORIZON_UNRESOLVED');
    }

    const source = await replay.readSource(tx, candidate.civilDate, () => this.structural.resolveInTransaction(tx, {
      academicYearId: candidate.academicYearId, civilDate: candidate.civilDate,
    }));
    // Resolver owns historical uniqueness and full source provenance. Do not
    // interpret an empty result from a blocked resolver as "no impact".
    if (source.status !== 'PASS') throw new Error('CALENDAR_REPLAY_SOURCE_BLOCKED');
    const effective = versions.filter((v) => formatCivilDate(v.effectiveFrom!) <= candidate.civilDate
      && (!v.effectiveUntil || formatCivilDate(v.effectiveUntil) >= candidate.civilDate));
    if (effective.length !== 1 || effective[0]!.calendarVersionId !== candidate.academicCalendarVersionId) {
      throw new Error('CALENDAR_REPLAY_EFFECTIVE_CALENDAR_MISMATCH');
    }
    // apply() reuses the validated command predicate, including exact slots and
    // session. It rejects non-base precedence rather than guessing disposition
    // or independent special-activity consequences.
    const changed = replay.apply(tx, source);
    const affected = source.normalOccurrences.filter((row, index) => changed.normalOccurrences[index] !== row);
    if (replay.reversesExceptionId || replay.dispositionScenario) {
      const occupancies = extractCanonicalOccupancies(changed);
      for (const row of changed.normalOccurrences.filter((r) => affected.some((a) => a.occurrenceKey === r.occurrenceKey))) {
        const own = occupancies.find((o) => o.id === `base:${row.timetableEntryId}`
          || row.disposition && (o.id === `sub:${row.disposition.id}` || o.id === `sup:${row.disposition.id}`));
        if (own && occupancies.some((other) => other.id !== own.id
          && (other.schoolClassId === own.schoolClassId || other.teacherUserId === own.teacherUserId)
          && intervalsOverlapTimes(own.startTime, own.endTime, other.startTime, other.endTime))) {
          throw new Error('CALENDAR_REPLAY_REVERSAL_OCCUPANCY_CONFLICT');
        }
      }
    }
    if (affected.some((row) => !classIds.includes(row.schoolClass.id))) throw new Error('CALENDAR_REPLAY_SCOPE_UNRESOLVED');
    const retainedWhere = { academicYearId: candidate.academicYearId, schoolClassId: { in: classIds }, status: 'ACTIVE' as const,
      ...(replay.dispositionScenario ? { subjectId: replay.dispositionScenario.subjectId } : {}) };
    // A school-year has many more facts than one class. Keep a per-class bound
    // plus a finite aggregate cap; never truncate a school to the single-class limit.
    const retainedLimit = Math.min(MAX_RETAINED_FACTS, MAX_ROWS * classIds.length);
    const executions = await tx.curricularTeachingExecution.findMany({ where: retainedWhere, orderBy: { id: 'asc' }, take: retainedLimit + 1 });
    const makeups = await tx.makeupTeachingSchedule.findMany({ where: retainedWhere, include: { targetTimeSlotDefinition: true }, orderBy: { id: 'asc' }, take: retainedLimit + 1 });
    if (executions.length > retainedLimit || makeups.length > retainedLimit) throw new Error('CALENDAR_REPLAY_DISCOVERY_LIMIT_EXCEEDED');
    // Retained streams are included even when no normal row on the selected day
    // was suppressed (e.g. a Tuesday make-up target for a Monday obligation).
    const rootRows = [...affected.map((r) => ({ schoolClass: r.schoolClass, subjectId: r.subjectId })),
      ...executions.map((r) => ({ schoolClass: { id: r.schoolClassId }, subjectId: r.subjectId })),
      ...makeups.map((r) => ({ schoolClass: { id: r.schoolClassId }, subjectId: r.subjectId }))];
    const roots = [...new Map(rootRows.map((row) => [`${row.schoolClass.id}:${row.subjectId}`, {
      academicYearId: candidate.academicYearId, schoolClassId: row.schoolClass.id, subjectId: row.subjectId,
    }])).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, root]) => root);
    if (roots.length > MAX_STREAMS) throw new Error('CALENDAR_REPLAY_STREAM_LIMIT_EXCEEDED');

    const streams = [];
    const retainedFindings: Array<{ code: string; retainedEntityId: string; reason: string }> = [];
    for (const root of roots) {
      // Full historical origin and weekly look-ahead remain owned by allocator
      // V2. Progress is elapsed-only at the SAME instant on both sides.
      const ppct = await this.allocation.replayCalendarCandidateInTransactionV2(tx, { ...root, throughCivilDate }, replay);
      const progress = await this.progress.replayCalendarCandidateInTransactionV2(tx, { ...root, asOfInstant: asOf }, replay);
      const retained = await this.progress.reconcileRetainedCalendarExecutionsInTransactionV2(tx, ppct.projection.before, ppct.projection.after);
      for (const finding of retained.findings) for (const retainedEntityId of finding.entityIds) {
        retainedFindings.push({ code: finding.code, retainedEntityId, reason: finding.reason });
      }
      const schedules = makeups.filter((m) => m.schoolClassId === root.schoolClassId && m.subjectId === root.subjectId);
      for (const schedule of schedules) {
        const sourceKey = `NORMAL:${schedule.originalTimetableEntryId}:${formatCivilDate(schedule.originalCivilDate)}`;
        for (const [side, projection] of [['BEFORE', ppct.projection.before], ['AFTER', ppct.projection.after]] as const) {
          const row = projection.normalAllocations.find((r) => r.occurrence.occurrenceKey === sourceKey);
          const match = projection.makeupSourceMatches.find((m) => m.makeupTeachingScheduleId === schedule.id);
          const o = row?.occurrence;
          const e = row?.expectedPpctItem;
          const valid = o && e && row.allocationStatus === 'ALLOCATED' && match?.status === 'MATCH'
            && e.component === row.plannedComponent
            && o.timetableVersionId === schedule.originalTimetableVersionId
            && o.timetableEntryId === schedule.originalTimetableEntryId
            && o.academicCalendarVersionId === schedule.originalAcademicCalendarVersionId
            && o.timeSlot.id === schedule.originalTimeSlotDefinitionId
            && o.teachingAssignmentId === schedule.originalTeachingAssignmentId
            && o.responsibleTeacherUserId === schedule.responsibleTeacherUserId
            && (o.disposition?.id ?? null) === schedule.sourceDispositionId;
          if (!valid) retainedFindings.push({ code: 'CALENDAR_REPLAY_MAKEUP_SOURCE_CONFLICT', retainedEntityId: schedule.id,
            reason: `${side}: original obligation, disposition or PPCT lineage no longer matches.` });
        }
        // Compare the complete allocated item, including revision, component and
        // distribution identity: an accepted schedule may never silently rebind.
        const left = ppct.projection.before.makeupSourceMatches.find((m) => m.makeupTeachingScheduleId === schedule.id);
        const right = ppct.projection.after.makeupSourceMatches.find((m) => m.makeupTeachingScheduleId === schedule.id);
        if (!left?.expectedPpctItem || JSON.stringify(left.expectedPpctItem) !== JSON.stringify(right?.expectedPpctItem)) {
          retainedFindings.push({ code: 'CALENDAR_REPLAY_MAKEUP_LINEAGE_CONFLICT', retainedEntityId: schedule.id,
            reason: 'Candidate changes the exact PPCT revision/component or obligation identity.' });
        }
        const targetDate = formatCivilDate(schedule.targetCivilDate);
        if (targetDate < fromCivilDate || targetDate > throughCivilDate) {
          retainedFindings.push({ code: 'CALENDAR_REPLAY_MAKEUP_TARGET_UNRESOLVED', retainedEntityId: schedule.id, reason: 'Retained target is outside the proven timetable boundary.' });
          continue;
        }
        const target = await replay.readSource(tx, targetDate, () => this.structural.resolveInTransaction(tx, { academicYearId: candidate.academicYearId, civilDate: targetDate }));
        const targetRow = target.makeupOccurrences.find((m) => m.target.id === schedule.id);
        if (target.status !== 'PASS' || !targetRow
          || targetRow.target.targetAcademicCalendarVersionId !== schedule.targetAcademicCalendarVersionId
          || targetRow.target.targetTimeSlotDefinitionId !== schedule.targetTimeSlotDefinitionId
          || targetRow.target.scheduledTeacherUserId !== schedule.scheduledTeacherUserId) {
          retainedFindings.push({ code: 'CALENDAR_REPLAY_MAKEUP_TARGET_UNRESOLVED', retainedEntityId: schedule.id, reason: 'Exact retained target cannot be resolved.' });
        }
        const slot = schedule.targetTimeSlotDefinition;
        const targetCalendar = await tx.academicCalendarVersion.findUnique({ where: { id: schedule.targetAcademicCalendarVersionId } });
        const targetInterrupted = await tx.calendarInterruption.findFirst({ where: { calendarVersionId: schedule.targetAcademicCalendarVersionId,
          startDate: { lte: schedule.targetCivilDate }, endDate: { gte: schedule.targetCivilDate } }, select: { id: true } });
        const targetExceptions = await tx.calendarException.findMany({ where: { academicCalendarVersionId: schedule.targetAcademicCalendarVersionId,
          civilDate: schedule.targetCivilDate, status: 'ACTIVE' }, include: { exactTimeSlots: true } });
        const grade = ppct.projection.before.normalAllocations.find((r) => r.occurrence.occurrenceKey === sourceKey)?.occurrence.schoolClass.gradeLevel;
        const suppressed = targetExceptions.some((exception) => exception.id !== replay.reversesExceptionId
          && (exception.scope === 'SCHOOL_WIDE' || exception.scope === 'CLASS' && exception.schoolClassId === schedule.schoolClassId
            || exception.scope === 'GRADE' && exception.gradeLevel === grade)
          && (exception.timeSelector === 'WHOLE_DAY' || exception.timeSelector === 'SESSION' && exception.session === slot.session
            || exception.timeSelector === 'EXACT_SLOTS' && exception.exactTimeSlots.some((s) => s.timeSlotDefinitionId === slot.id)));
        if (!targetCalendar || targetCalendar.academicYearId !== candidate.academicYearId
          || schedule.targetCivilDate < targetCalendar.startDate || schedule.targetCivilDate > targetCalendar.endDate
          || targetInterrupted || suppressed || !slot.allowMakeupTeaching) {
          retainedFindings.push({ code: 'CALENDAR_REPLAY_MAKEUP_TARGET_INVALID', retainedEntityId: schedule.id,
            reason: 'Retained target calendar/slot is invalid or already suppressed.' });
        }
        if (!replay.reversesExceptionId && !replay.dispositionScenario && targetDate === candidate.civilDate && schedule.targetAcademicCalendarVersionId === candidate.academicCalendarVersionId
          && (candidate.timeSelector === 'WHOLE_DAY'
            || candidate.timeSelector === 'SESSION' && candidate.session === slot.session
            || candidate.timeSelector === 'EXACT_SLOTS' && candidate.exactTimeSlotDefinitionIds.includes(slot.id))) {
          retainedFindings.push({ code: 'CALENDAR_REPLAY_MAKEUP_TARGET_SUPPRESSED', retainedEntityId: schedule.id,
            reason: 'Candidate suppresses the exact ACTIVE make-up target.' });
        }
      }
      const afterByKey = new Map(ppct.projection.after.normalAllocations.map((row) => [row.occurrence.occurrenceKey, row]));
      const ppctChanges = ppct.projection.before.normalAllocations.flatMap((before) => {
        const after = afterByKey.get(before.occurrence.occurrenceKey);
        if (before.allocationStatus === after?.allocationStatus
          && before.expectedPpctItem?.ppctItemRevisionId === after?.expectedPpctItem?.ppctItemRevisionId
          && before.plannedComponent === after?.plannedComponent) return [];
        return [{ occurrenceKey: before.occurrence.occurrenceKey, civilDate: before.occurrence.civilDate,
          slotStartTime: before.occurrence.timeSlot.startTime, before: before.expectedPpctItem,
          after: after?.expectedPpctItem ?? null }];
      });
      streams.push({ scope: root, ppct: ppct.projection, progress: progress.projection, retained, ppctChanges });
    }

    const teacherIds = new Set([...affected.map((row) => row.responsibleTeacherUserId),
      ...(replay.dispositionScenario?.disposition.assignedTeacherUserId ? [replay.dispositionScenario.disposition.assignedTeacherUserId] : []),
      ...executions.flatMap((e) => [e.actualTeacherUserId, e.responsibleTeacherUserId]),
      ...makeups.flatMap((m) => [m.scheduledTeacherUserId, m.responsibleTeacherUserId])]);
    if (roots.length) {
      const rootWhere = { academicYearId: candidate.academicYearId,
        OR: roots.map(({ schoolClassId, subjectId }) => ({ schoolClassId, subjectId })) };
      const entries = await tx.timetableEntry.findMany({
        where: { ...rootWhere, timetableVersionId: { in: versions.map((v) => v.id) } },
        select: { teacherUserId: true }, orderBy: { id: 'asc' }, take: MAX_ROWS + 1,
      });
      const dispositions = await tx.operationalLessonDisposition.findMany({
        where: { ...rootWhere, status: 'ACTIVE' }, select: { responsibleTeacherUserId: true, assignedTeacherUserId: true },
        orderBy: { id: 'asc' }, take: MAX_ROWS + 1,
      });
      // Frozen class targets determine activity reach, not a mutable grade/name.
      // The activity itself is independent of the candidate exception; include
      // staffing conservatively and let official P4-050 authority decide credit.
      const activities = await tx.specialActivity.findMany({
        where: { academicYearId: candidate.academicYearId, status: 'ACTIVE',
          classTargets: { some: { schoolClassId: { in: [...new Set(roots.map((r) => r.schoolClassId))] } } } },
        select: { staffing: { select: { scheduledTeacherUserId: true } } }, orderBy: { id: 'asc' }, take: MAX_ROWS + 1,
      });
      if ([entries, dispositions, activities].some((rows) => rows.length > MAX_ROWS)) throw new Error('CALENDAR_REPLAY_DISCOVERY_LIMIT_EXCEEDED');
      for (const row of entries) teacherIds.add(row.teacherUserId);
      for (const row of dispositions) {
        teacherIds.add(row.responsibleTeacherUserId);
        if (row.assignedTeacherUserId) teacherIds.add(row.assignedTeacherUserId);
      }
      for (const activity of activities) for (const row of activity.staffing) teacherIds.add(row.scheduledTeacherUserId);
    }
    if (teacherIds.size > 512) throw new Error('CALENDAR_REPLAY_TEACHER_LIMIT_EXCEEDED');
    const reconciled = retainedFindings.length === 0 && streams.every((s) => s.retained.status === 'PASS'
      && s.ppct.status === 'PASS' && s.progress.status === 'PASS');
    const teachers = [];
    const orderedTeacherIds = [...teacherIds].sort();
    const official = await this.workload.resolveManyInTransaction(tx, orderedTeacherIds.map((targetUserId) => ({
        academicYearId: candidate.academicYearId, targetUserId, fromCivilDate, toCivilDate: throughCivilDate, asOfInstant: asOf,
    })));
    for (const [index, targetUserId] of orderedTeacherIds.entries()) {
      const before = official[index]!;
      // A calendar exception writes no execution, participation, attestation,
      // coefficient, business policy, homeroom or duty source. ADR-057 excludes
      // CalendarException from required norm. Equality follows ONLY after all
      // retained curricular identities in its class scope survived V2 replay.
      const retainedIds = new Set(executions.map((e) => e.id));
      const complete = reconciled && before.status === 'PASS' && before.curricularWorkload.contributions.every((c) =>
        !classIds.includes(c.schoolClassId) || replay.dispositionScenario && c.subjectId !== replay.dispositionScenario.subjectId || retainedIds.has(c.executionId));
      teachers.push({ targetUserId, status: complete ? 'PASS' as const : 'BLOCKED' as const,
        before, after: complete ? before : null,
        delta: complete ? { earnedCredit: 0, requiredCredit: 0, varianceCredit: 0 } : null,
        reconciliation: complete ? {
          method: 'RETAINED_CREDIT_IDENTITY_AFTER_V2_RECONCILIATION' as const,
          executionIds: before.curricularWorkload.contributions.map((c) => c.executionId).sort(),
          reconciledScopeExecutionIds: executions.filter((e) => e.actualTeacherUserId === targetUserId).map((e) => e.id).sort(),
          unchangedSources: ['SPECIAL_PROGRAMME_P4_050', 'DATE_EFFECTIVE_NORM_ADR_057'] as const,
          createsExecution: false as const,
        } : null });
    }
    const assessed = roots.length > 0 && reconciled && teachers.length > 0 && teachers.every((t) => t.status === 'PASS');
    const result = {
      profile: 'CALENDAR_CANDIDATE_SCOPE_REPLAY_V2' as const,
      status: assessed ? 'PASS' as const : 'BLOCKED' as const,
      candidate,
      operation: replay.dispositionScenario ?? { reversesExceptionId: replay.reversesExceptionId },
      coverage: { ppctItemAllocation: assessed ? 'ASSESSED' as const : 'NOT_ASSESSED' as const,
        debt: assessed ? 'ASSESSED' as const : 'NOT_ASSESSED' as const,
        workload: assessed ? 'ASSESSED' as const : 'NOT_ASSESSED' as const },
      boundary: { fromCivilDate, throughCivilDate, progressAsOfInstant: asOf.toISOString(),
        timetableVersionIds: versions.map((v) => v.id), maxDays: MAX_DAYS, maxRetainedFacts: retainedLimit },
      classIds, affectedOccurrenceKeys: affected.map((row) => row.occurrenceKey).sort(), streams, teachers,
      retainedFindings,
      limitations: ['RETAINED_CALENDAR_BOUNDARY_ONLY', 'PROGRESS_AS_OF_ONLY', 'PREVIEW_CANNOT_AUTHORIZE_MUTATION',
        ...(roots.length ? [] : ['NO_AFFECTED_BASE_OPPORTUNITIES'])],
    };
    // Exclude evaluation instants, never business provenance, from the optimistic
    // preview comparison. Changed classifications, facts, policy or lineage hash
    // differently even when the candidate itself is identical.
    const semantic = JSON.stringify(result, (key, value: unknown) =>
      ['evaluatedAt', 'asOfInstant', 'progressAsOfInstant'].includes(key) ? undefined : value);
    return { ...result, consequenceFingerprint: createHash('sha256').update(semantic).digest('hex') };
  }
}
