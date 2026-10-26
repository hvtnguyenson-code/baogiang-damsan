import { CivilDateString } from '@baogiang/contracts';
import { CalendarExceptionScope, CalendarExceptionTimeSelector, Prisma, TimeSlotSession } from '@prisma/client';
import { NormalStructuralOccurrence, ResolvedLessonOccurrencesResult, StructuralDispositionProvenance } from './resolved-occurrence.types';

export interface DispositionReplayScenario {
  subjectId: string;
  timetableEntryId: string;
  disposition: StructuralDispositionProvenance;
  reversesId: string | null;
  eligibilityStaffSubjectId: string | null;
}

/** Internal, bounded evidence. It cannot authorize a command or certify the public preview. */
export interface CalendarCandidateReplayEvidence<T> {
  profile: 'CALENDAR_CANDIDATE_REPLAY_PARTIAL_V1';
  status: 'NOT_ASSESSED' | 'BLOCKED';
  candidate: CalendarReplayCandidate;
  coverage: { ppctItemAllocation: 'NOT_ASSESSED'; debt: 'NOT_ASSESSED'; workload: 'NOT_ASSESSED' };
  limitations: readonly ['BOUNDED_SINGLE_STREAM_REPLAY', 'ACTIVE_EXECUTION_AND_MAKEUP_UNSUPPORTED', 'WORKLOAD_CANDIDATE_REPLAY_UNAVAILABLE', 'MUTATION_REVALIDATION_UNAVAILABLE'];
  projection: T;
}

export interface CalendarReplayCandidate {
  readonly academicYearId: string;
  readonly academicCalendarVersionId: string;
  readonly civilDate: CivilDateString;
  readonly scope: CalendarExceptionScope;
  readonly gradeLevel: number | null;
  readonly schoolClassId: string | null;
  readonly timeSelector: CalendarExceptionTimeSelector;
  readonly session: TimeSlotSession | null;
  readonly exactTimeSlotDefinitionIds: readonly string[];
}

/** Internal diagnostics only; never a public preview or mutation authorization. */
export class CalendarReplayReconciliationRequired extends Error {
  readonly missingAuthority = 'CANDIDATE_RETAINED_EXECUTION_AND_OFFICIAL_WORKLOAD_RECONCILIATION' as const;

  constructor(
    readonly code: 'CALENDAR_REPLAY_EXECUTION_RECONCILIATION_REQUIRED' | 'CALENDAR_REPLAY_MAKEUP_RECONCILIATION_REQUIRED',
    readonly retainedEntityId: string,
  ) {
    super(code);
    this.name = 'CalendarReplayReconciliationRequired';
  }
}

/**
 * Transaction-local source adapter, after commit-command validation. No retained row
 * is fabricated: the marker below identifies a hypothetical exception only.
 * Full V2 replay still owns ordering, lineage, week routing and allocation.
 * Public readers/commands deliberately have no parameter accepting this adapter.
 */
export class CalendarExceptionReplay {
  private active = true;
  private readonly sourceReads = new Map<string, Promise<ResolvedLessonOccurrencesResult>>();
  readonly candidate: CalendarReplayCandidate;

  private constructor(
    private readonly tx: Prisma.TransactionClient,
    candidate: CalendarReplayCandidate,
    private readonly covers: (entry: NormalStructuralOccurrence) => boolean,
    private readonly reconcilesRetained = false,
    readonly reversesExceptionId: string | null = null,
    readonly dispositionScenario: DispositionReplayScenario | null = null,
  ) {
    this.candidate = Object.freeze({ ...candidate, exactTimeSlotDefinitionIds: Object.freeze([...candidate.exactTimeSlotDefinitionIds]) });
  }

  /** Internal factory: use OperationalOverlaysService's validated candidate and command predicate. */
  static async withValidatedCandidate<T>(
    tx: Prisma.TransactionClient,
    candidate: CalendarReplayCandidate,
    covers: (entry: NormalStructuralOccurrence) => boolean,
    evaluate: (replay: CalendarExceptionReplay) => Promise<T>,
    reconcilesRetained = false,
    reversesExceptionId: string | null = null,
    dispositionScenario: DispositionReplayScenario | null = null,
  ): Promise<T> {
    const replay = new CalendarExceptionReplay(tx, candidate, covers, reconcilesRetained, reversesExceptionId, dispositionScenario);
    try { return await evaluate(replay); }
    finally { replay.active = false; replay.sourceReads.clear(); }
  }

  private assertTransaction(tx: Prisma.TransactionClient): void {
    if (!this.active || tx !== this.tx) throw new Error('CALENDAR_REPLAY_TRANSACTION_MISMATCH');
  }

  /** Deduplicate canonical reads only within this live transaction/candidate.
   * No cross-request cache or retained projection authority is introduced. */
  readSource(tx: Prisma.TransactionClient, civilDate: CivilDateString,
    resolve: () => Promise<ResolvedLessonOccurrencesResult>): Promise<ResolvedLessonOccurrencesResult> {
    this.assertTransaction(tx);
    let pending = this.sourceReads.get(civilDate);
    if (!pending) { pending = resolve(); this.sourceReads.set(civilDate, pending); }
    return pending;
  }

  async assertStream(tx: Prisma.TransactionClient, scope: { academicYearId: string; schoolClassId: string; subjectId: string }): Promise<void> {
    this.assertTransaction(tx);
    if (scope.academicYearId !== this.candidate.academicYearId) throw new Error('CALENDAR_REPLAY_YEAR_MISMATCH');
    // Only the candidate-wide orchestrator may replace the legacy blanket gate.
    // It must reconcile ALL retained facts before publishing assessed coverage.
    if (this.reconcilesRetained) return;
    // Progress V2 now detects orphaned ended fulfillment, but cannot certify
    // future/unended retained evidence or candidate-aware official workload.
    // Reject ALL ACTIVE executions/schedules, even beyond the horizon; a safe
    // elapsed progress result alone cannot prove retained workload consequences.
    const where = { academicYearId: scope.academicYearId, schoolClassId: scope.schoolClassId, subjectId: scope.subjectId, status: 'ACTIVE' as const };
    const execution = await tx.curricularTeachingExecution.findFirst({ where, select: { id: true }, orderBy: { id: 'asc' } });
    if (execution) {
      throw new CalendarReplayReconciliationRequired('CALENDAR_REPLAY_EXECUTION_RECONCILIATION_REQUIRED', execution.id);
    }
    const makeup = await tx.makeupTeachingSchedule.findFirst({ where, select: { id: true }, orderBy: { id: 'asc' } });
    if (makeup) {
      throw new CalendarReplayReconciliationRequired('CALENDAR_REPLAY_MAKEUP_RECONCILIATION_REQUIRED', makeup.id);
    }
  }

  /**
   * Candidate-wide retained-evidence gate. Unlike assertStream, this checks
   * every class selected by the calendar scope, across all subjects and dates.
   * It is intentionally conservative: no allocation/workload clearance claim.
   */
  async assertCandidateRetainedScope(tx: Prisma.TransactionClient): Promise<void> {
    this.assertTransaction(tx);
    const classIds = await this.resolveCandidateClassIds(tx);
    const where = {
      academicYearId: this.candidate.academicYearId,
      schoolClassId: { in: classIds },
      status: 'ACTIVE' as const,
    };
    // Both original obligation and actual make-up target share schoolClassId
    // through composite FKs. Deliberately do not filter either date/calendar,
    // subject, teacher, selector or horizon: either end can require reconciliation.
    const execution = await tx.curricularTeachingExecution.findFirst({
      where, select: { id: true }, orderBy: { id: 'asc' },
    });
    if (execution) {
      throw new CalendarReplayReconciliationRequired('CALENDAR_REPLAY_EXECUTION_RECONCILIATION_REQUIRED', execution.id);
    }
    const makeup = await tx.makeupTeachingSchedule.findFirst({
      where, select: { id: true }, orderBy: { id: 'asc' },
    });
    if (makeup) {
      throw new CalendarReplayReconciliationRequired('CALENDAR_REPLAY_MAKEUP_RECONCILIATION_REQUIRED', makeup.id);
    }
  }

  async resolveCandidateClassIds(tx: Prisma.TransactionClient): Promise<string[]> {
    this.assertTransaction(tx);
    const { academicYearId, scope, gradeLevel, schoolClassId } = this.candidate;
    if (!['CLASS', 'GRADE', 'SCHOOL_WIDE'].includes(scope)) throw new Error('CALENDAR_REPLAY_SCOPE_UNRESOLVED');
    if (scope === 'CLASS' && !schoolClassId) throw new Error('CALENDAR_REPLAY_CLASS_SCOPE_UNRESOLVED');
    if (scope === 'GRADE' && (gradeLevel === null || !Number.isInteger(gradeLevel))) throw new Error('CALENDAR_REPLAY_GRADE_SCOPE_UNRESOLVED');
    const classes = await tx.schoolClass.findMany({
      where: {
        academicYearId,
        ...(scope === 'CLASS' ? { id: schoolClassId ?? undefined } :
          scope === 'GRADE' ? { gradeLevel: gradeLevel ?? undefined } : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 513,
    });
    if (classes.length > 512) throw new Error('CALENDAR_REPLAY_CLASS_LIMIT_EXCEEDED');
    if (scope === 'CLASS' && (!schoolClassId || classes.length !== 1 || classes[0]?.id !== schoolClassId)) {
      throw new Error('CALENDAR_REPLAY_CLASS_SCOPE_UNRESOLVED');
    }
    if (scope === 'GRADE' && (gradeLevel === null || classes.length === 0)) {
      throw new Error('CALENDAR_REPLAY_GRADE_SCOPE_UNRESOLVED');
    }
    if (classes.length === 0) throw new Error('CALENDAR_REPLAY_SCOPE_UNRESOLVED');
    return classes.map((entry) => entry.id).sort();
  }

  apply(tx: Prisma.TransactionClient, source: ResolvedLessonOccurrencesResult): ResolvedLessonOccurrencesResult {
    this.assertTransaction(tx);
    if (source.scope.academicYearId !== this.candidate.academicYearId) throw new Error('CALENDAR_REPLAY_YEAR_MISMATCH');
    if (source.status !== 'PASS') throw new Error('CALENDAR_REPLAY_SOURCE_BLOCKED');
    if (source.scope.civilDate !== this.candidate.civilDate) return source;
    return {
      ...source,
      normalOccurrences: source.normalOccurrences.map((entry) => {
        if (entry.academicYearId !== this.candidate.academicYearId
          || entry.civilDate !== this.candidate.civilDate
          || entry.academicCalendarVersionId !== this.candidate.academicCalendarVersionId || !this.covers(entry)) return entry;
        if (this.dispositionScenario) {
          const scenario = this.dispositionScenario;
          if (entry.timetableEntryId !== scenario.timetableEntryId || entry.subjectId !== scenario.subjectId) return entry;
          if (scenario.reversesId) {
            if (entry.effectiveKind !== 'OPERATIONAL_DISPOSITION' || entry.disposition?.id !== scenario.reversesId) {
              throw new Error('DISPOSITION_REPLAY_RETAINED_SOURCE_CONFLICT');
            }
            return { ...entry, effectiveKind: 'BASE_TIMETABLE' as const, disposition: null };
          }
          if (entry.effectiveKind !== 'BASE_TIMETABLE') throw new Error('DISPOSITION_REPLAY_NON_BASE_SOURCE');
          return { ...entry, effectiveKind: 'OPERATIONAL_DISPOSITION' as const, disposition: scenario.disposition };
        }
        if (this.reversesExceptionId) {
          if (!entry.exceptionIds.includes(this.reversesExceptionId)) return entry;
          const exceptionIds = entry.exceptionIds.filter((id) => id !== this.reversesExceptionId);
          // Same precedence as the canonical structural resolver; all underlying
          // provenance was retained even while the exception suppressed it.
          const effectiveKind = entry.interruptionIds.length ? 'CALENDAR_INTERRUPTION' as const
            : exceptionIds.length ? 'CALENDAR_EXCEPTION' as const
            : entry.suppressingSpecialActivityIds.length ? 'SPECIAL_ACTIVITY_SUPPRESSED' as const
            : entry.disposition ? 'OPERATIONAL_DISPOSITION' as const : 'BASE_TIMETABLE' as const;
          return { ...entry, exceptionIds, effectiveKind };
        }
        // This first seam supports base opportunities only. Do not guess precedence
        // or reconciliation for an already suppressed/disposed source.
        // ADR-036: a calendar exception outranks normal activity suppression,
        // while the independent activity/participation remains untouched.
        if (entry.effectiveKind !== 'BASE_TIMETABLE' && entry.effectiveKind !== 'SPECIAL_ACTIVITY_SUPPRESSED') throw new Error('CALENDAR_REPLAY_NON_BASE_SOURCE');
        return { ...entry, effectiveKind: 'CALENDAR_EXCEPTION' as const, exceptionIds: ['PREVIEW:CALENDAR_EXCEPTION'] };
      }),
    };
  }

  evidence<T extends { status: 'PASS' | 'BLOCKED' }>(tx: Prisma.TransactionClient, projection: T): CalendarCandidateReplayEvidence<T> {
    this.assertTransaction(tx);
    return {
      profile: 'CALENDAR_CANDIDATE_REPLAY_PARTIAL_V1',
      status: projection.status === 'BLOCKED' ? 'BLOCKED' : 'NOT_ASSESSED',
      candidate: this.candidate,
      coverage: { ppctItemAllocation: 'NOT_ASSESSED', debt: 'NOT_ASSESSED', workload: 'NOT_ASSESSED' },
      limitations: ['BOUNDED_SINGLE_STREAM_REPLAY', 'ACTIVE_EXECUTION_AND_MAKEUP_UNSUPPORTED', 'WORKLOAD_CANDIDATE_REPLAY_UNAVAILABLE', 'MUTATION_REVALIDATION_UNAVAILABLE'],
      projection,
    };
  }
}
