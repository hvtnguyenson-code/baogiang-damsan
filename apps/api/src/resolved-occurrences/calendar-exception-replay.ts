import { CivilDateString } from '@baogiang/contracts';
import { CalendarExceptionScope, CalendarExceptionTimeSelector, Prisma, TimeSlotSession } from '@prisma/client';
import { NormalStructuralOccurrence, ResolvedLessonOccurrencesResult } from './resolved-occurrence.types';

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

/**
 * Transaction-local source adapter, after commit-command validation. No retained row
 * is fabricated: the marker below identifies a hypothetical exception only.
 * Full V2 replay still owns ordering, lineage, week routing and allocation.
 * Public readers/commands deliberately have no parameter accepting this adapter.
 */
export class CalendarExceptionReplay {
  private active = true;
  readonly candidate: CalendarReplayCandidate;

  private constructor(
    private readonly tx: Prisma.TransactionClient,
    candidate: CalendarReplayCandidate,
    private readonly covers: (entry: NormalStructuralOccurrence) => boolean,
  ) {
    this.candidate = Object.freeze({ ...candidate, exactTimeSlotDefinitionIds: Object.freeze([...candidate.exactTimeSlotDefinitionIds]) });
  }

  /** Internal factory: use OperationalOverlaysService's validated candidate and command predicate. */
  static async withValidatedCandidate<T>(
    tx: Prisma.TransactionClient,
    candidate: CalendarReplayCandidate,
    covers: (entry: NormalStructuralOccurrence) => boolean,
    evaluate: (replay: CalendarExceptionReplay) => Promise<T>,
  ): Promise<T> {
    const replay = new CalendarExceptionReplay(tx, candidate, covers);
    try { return await evaluate(replay); }
    finally { replay.active = false; }
  }

  private assertTransaction(tx: Prisma.TransactionClient): void {
    if (!this.active || tx !== this.tx) throw new Error('CALENDAR_REPLAY_TRANSACTION_MISMATCH');
  }

  async assertStream(tx: Prisma.TransactionClient, scope: { academicYearId: string; schoolClassId: string; subjectId: string }): Promise<void> {
    this.assertTransaction(tx);
    if (scope.academicYearId !== this.candidate.academicYearId) throw new Error('CALENDAR_REPLAY_YEAR_MISMATCH');
    // Progress currently reconciles executions only against surviving direct
    // obligations. Suppression could remove that obligation entirely. Until an
    // orphan-aware reconciliation exists, reject ALL ACTIVE executions/schedules
    // in the stream, including future/unended ones and those beyond the horizon.
    const where = { academicYearId: scope.academicYearId, schoolClassId: scope.schoolClassId, subjectId: scope.subjectId, status: 'ACTIVE' as const };
    if (await tx.curricularTeachingExecution.findFirst({ where, select: { id: true } })) {
      throw new Error('CALENDAR_REPLAY_EXECUTION_RECONCILIATION_REQUIRED');
    }
    if (await tx.makeupTeachingSchedule.findFirst({ where, select: { id: true } })) {
      throw new Error('CALENDAR_REPLAY_MAKEUP_RECONCILIATION_REQUIRED');
    }
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
        // This first seam supports base opportunities only. Do not guess precedence
        // or reconciliation for an already suppressed/disposed source.
        if (entry.effectiveKind !== 'BASE_TIMETABLE') throw new Error('CALENDAR_REPLAY_NON_BASE_SOURCE');
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
