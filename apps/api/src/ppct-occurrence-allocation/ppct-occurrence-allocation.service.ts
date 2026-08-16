import { Injectable } from '@nestjs/common';
import { OperationalOverlayStatus, Prisma, TimetableVersionStatus } from '@prisma/client';
import { CivilDateString } from '@baogiang/contracts';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { ResolvedLessonOccurrencesService } from '../resolved-occurrences/resolved-occurrences.service';
import { NormalStructuralOccurrence, StructuralOccurrenceFinding } from '../resolved-occurrences/resolved-occurrence.types';
import {
  applyVersionTransition,
  compareHistoryPositions,
  compareNormalOccurrences,
  consumingOverlapKeys,
  consumptionDecision,
  distributionObligationKey,
  HistoryPosition,
  historyPositionAtDateStart,
  historyPositionForNormal,
  pendingRevisions,
} from './ppct-occurrence-allocation.policy';
import {
  DirectDistributionObligation,
  ExpectedPpctItem,
  MakeupSourceMatch,
  NormalPpctAllocation,
  PpctAllocationFinding,
  PpctGraphVersion,
  PpctOccurrenceAllocationResult,
  PpctPlanGraph,
  PPCT_OCCURRENCE_ALLOCATION_PROFILE,
  ResolvePpctOccurrenceAllocationInput,
} from './ppct-occurrence-allocation.types';

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
const GLOBAL_STRUCTURAL_CODES = new Set(['TIMETABLE_EFFECTIVE_VERSION_MISSING', 'TIMETABLE_EFFECTIVE_VERSION_AMBIGUOUS', 'RETAINED_CALENDAR_INVALID']);
const makeupInclude = {
  targetTimeSlotDefinition: true,
  originalTimetableEntry: { select: { timeSlotDefinition: { select: { startTime: true, endTime: true } } } },
} satisfies Prisma.MakeupTeachingScheduleInclude;

interface DatedFinding {
  civilDate: CivilDateString;
  finding: StructuralOccurrenceFinding;
  appliesAtOccurrenceKey: string | null;
  isGlobal: boolean;
}

const expectedItem = (obligation: DirectDistributionObligation): ExpectedPpctItem => ({
  distributionObligationKey: obligation.distributionObligationKey,
  ppctClassAssociationId: obligation.ppctClassAssociationId,
  ppctPlanId: obligation.ppctPlanId,
  ppctVersionId: obligation.ppctVersionId,
  ppctItemId: obligation.ppctItemId,
  ppctItemRevisionId: obligation.ppctItemRevisionId,
  sequence: obligation.sequence,
  title: obligation.title,
  lessonType: obligation.lessonType,
});

@Injectable()
export class PpctOccurrenceAllocationService {
  constructor(private readonly prisma: PrismaService, private readonly structural: ResolvedLessonOccurrencesService) {}

  async resolve(input: ResolvePpctOccurrenceAllocationInput): Promise<PpctOccurrenceAllocationResult> {
    const result = await this.prisma.$transaction(
      (tx) => this.resolveSnapshot(tx, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { ...result, evaluatedAt: new Date().toISOString() };
  }

  private async resolveSnapshot(tx: Prisma.TransactionClient, input: ResolvePpctOccurrenceAllocationInput): Promise<Omit<PpctOccurrenceAllocationResult, 'evaluatedAt'>> {
    const throughDate = parseCivilDate(input.throughCivilDate);
    const candidateDates = await this.discoverCandidateDates(tx, input, throughDate);
    const normals: NormalStructuralOccurrence[] = [];
    const structuralFindings: DatedFinding[] = [];
    for (const civilDate of candidateDates) {
      const result = await this.structural.resolveInTransaction(tx, { academicYearId: input.academicYearId, civilDate });
      const targetNormals = result.normalOccurrences.filter((occurrence) => occurrence.schoolClass.id === input.schoolClassId && occurrence.subjectId === input.subjectId);
      normals.push(...targetNormals);
      const keys = new Set(targetNormals.map((occurrence) => occurrence.occurrenceKey));
      for (const finding of result.findings) {
        if (GLOBAL_STRUCTURAL_CODES.has(finding.code)) structuralFindings.push({ civilDate, finding, appliesAtOccurrenceKey: null, isGlobal: true });
        else if (finding.occurrenceKey !== null && keys.has(finding.occurrenceKey)) structuralFindings.push({ civilDate, finding, appliesAtOccurrenceKey: finding.occurrenceKey, isGlobal: false });
        else if (finding.code === 'ACTIVE_SPECIAL_ACTIVITY_COLLISION') {
          const affected = targetNormals.filter((occurrence) => occurrence.suppressingSpecialActivityIds.some((id) => finding.entityIds.includes(id))).sort(compareNormalOccurrences)[0];
          if (affected) structuralFindings.push({ civilDate, finding, appliesAtOccurrenceKey: affected.occurrenceKey, isGlobal: false });
        }
      }
    }
    normals.sort(compareNormalOccurrences);

    const findings: PpctAllocationFinding[] = [];
    const addFinding = (finding: PpctAllocationFinding) => findings.push({ ...finding, entityIds: [...finding.entityIds].sort() });
    const byOccurrence = new Map<string, StructuralOccurrenceFinding[]>();
    for (const item of structuralFindings) if (item.appliesAtOccurrenceKey) byOccurrence.set(item.appliesAtOccurrenceKey, [...(byOccurrence.get(item.appliesAtOccurrenceKey) ?? []), item.finding]);
    const globalEvents = structuralFindings.filter((item) => item.isGlobal)
      .sort((a, b) => `${a.civilDate}:${a.finding.code}:${a.finding.entityIds.join(',')}`.localeCompare(`${b.civilDate}:${b.finding.code}:${b.finding.entityIds.join(',')}`));
    const overlapKeys = consumingOverlapKeys(normals);
    const overlapReported = new Set<string>();
    const covered = new Set<string>();
    const obligations = new Map<string, DirectDistributionObligation>();
    const graphCache = new Map<string, PpctPlanGraph>();
    const normalAllocations: NormalPpctAllocation[] = [];
    let currentVersion: PpctGraphVersion | null = null;
    let currentPlanId: string | null = null;
    let historyBlocked = false;
    let firstHistoryBlockBoundary: HistoryPosition | null = null;
    let globalEventIndex = 0;
    const blockHistoryAt = (position: HistoryPosition) => {
      historyBlocked = true;
      if (!firstHistoryBlockBoundary || compareHistoryPositions(position, firstHistoryBlockBoundary) < 0) firstHistoryBlockBoundary = position;
    };

    for (const occurrence of normals) {
      const decision = consumptionDecision(occurrence);
      const occurrencePosition = historyPositionForNormal(occurrence);
      while (globalEventIndex < globalEvents.length && globalEvents[globalEventIndex]!.civilDate <= occurrence.civilDate) {
        const event = globalEvents[globalEventIndex]!;
        addFinding(event.finding); blockHistoryAt(historyPositionAtDateStart(event.civilDate)); globalEventIndex += 1;
      }
      const scopedFindings = byOccurrence.get(occurrence.occurrenceKey) ?? [];
      if (scopedFindings.length) {
        for (const finding of scopedFindings) addFinding(finding);
        blockHistoryAt(occurrencePosition);
      }
      if (overlapKeys.has(occurrence.occurrenceKey)) {
        const members = normals.filter((candidate) => candidate.civilDate === occurrence.civilDate && overlapKeys.has(candidate.occurrenceKey) && candidate.timeSlot.startTime < occurrence.timeSlot.endTime && occurrence.timeSlot.startTime < candidate.timeSlot.endTime).map((candidate) => candidate.occurrenceKey).sort();
        const signature = members.join(',');
        if (!overlapReported.has(signature)) {
          addFinding({ severity: 'BLOCKER', code: 'PPCT_ALLOCATION_OCCURRENCE_ORDER_AMBIGUOUS', occurrenceKey: occurrence.occurrenceKey, entityIds: members });
          overlapReported.add(signature);
        }
        blockHistoryAt(occurrencePosition);
      }
      const binding = occurrence.ppctBinding;
      if (!binding && !historyBlocked) {
        addFinding({ severity: 'BLOCKER', code: 'PPCT_ALLOCATION_HISTORY_BLOCKED', occurrenceKey: occurrence.occurrenceKey, reason: 'TARGET_PPCT_BINDING_MISSING', entityIds: [occurrence.timetableEntryId] });
        blockHistoryAt(occurrencePosition);
      }
      if (historyBlocked || !binding) {
        normalAllocations.push({ occurrence, allocationEffect: decision.effect, allocationReason: decision.reason, allocationStatus: 'BLOCKED', expectedPpctItem: null });
        continue;
      }
      const graph = graphCache.get(binding.ppctPlanId) ?? await this.loadGraph(tx, binding.ppctPlanId);
      graphCache.set(binding.ppctPlanId, graph);
      const target = graph.versions.find((version) => version.id === binding.ppctVersionId && version.status !== 'DRAFT');
      if (!target) {
        addFinding({ severity: 'BLOCKER', code: 'PPCT_ALLOCATION_HISTORY_BLOCKED', occurrenceKey: occurrence.occurrenceKey, reason: 'TARGET_VERSION_CONTEXT_MISSING', entityIds: [binding.ppctVersionId] });
        blockHistoryAt(occurrencePosition);
      } else if (currentPlanId !== null && currentPlanId !== binding.ppctPlanId) {
        addFinding({ severity: 'BLOCKER', code: 'PPCT_ALLOCATION_HISTORY_BLOCKED', occurrenceKey: occurrence.occurrenceKey, reason: 'PLAN_CONTEXT_CHANGED', entityIds: [currentPlanId, binding.ppctPlanId] });
        blockHistoryAt(occurrencePosition);
      } else if (currentVersion && target.versionNumber < currentVersion.versionNumber) {
        addFinding({ severity: 'BLOCKER', code: 'PPCT_ALLOCATION_HISTORY_BLOCKED', occurrenceKey: occurrence.occurrenceKey, reason: 'NON_FORWARD_VERSION_TRANSITION', entityIds: [currentVersion.id, target.id] });
        blockHistoryAt(occurrencePosition);
      } else {
        const currentNumber = currentVersion?.versionNumber;
        const frontier: PpctGraphVersion[] = currentNumber !== undefined
          ? graph.versions.filter((version) => version.status !== 'DRAFT' && version.versionNumber > currentNumber && version.versionNumber <= target.versionNumber)
          : [target];
        for (const version of frontier.sort((a, b) => a.versionNumber - b.versionNumber || a.id.localeCompare(b.id))) {
          const blocker = applyVersionTransition(graph, version, covered);
          if (blocker) {
            addFinding({ severity: 'BLOCKER', ...blocker, occurrenceKey: occurrence.occurrenceKey });
            blockHistoryAt(occurrencePosition); break;
          }
          currentVersion = version; currentPlanId = graph.planId;
        }
      }
      if (historyBlocked || !currentVersion) {
        normalAllocations.push({ occurrence, allocationEffect: decision.effect, allocationReason: decision.reason, allocationStatus: 'BLOCKED', expectedPpctItem: null });
        continue;
      }
      if (decision.effect === 'DOES_NOT_CONSUME_ITEM') {
        normalAllocations.push({ occurrence, allocationEffect: decision.effect, allocationReason: decision.reason, allocationStatus: 'NOT_CONSUMED', expectedPpctItem: null });
        continue;
      }
      const revision = pendingRevisions(currentVersion, covered)[0];
      if (!revision) {
        addFinding({ severity: 'BLOCKER', code: 'PPCT_ALLOCATION_EXHAUSTED', occurrenceKey: occurrence.occurrenceKey, entityIds: [currentVersion.id] });
        blockHistoryAt(occurrencePosition);
        normalAllocations.push({ occurrence, allocationEffect: decision.effect, allocationReason: decision.reason, allocationStatus: 'BLOCKED', expectedPpctItem: null });
        continue;
      }
      const base = { academicYearId: input.academicYearId, schoolClassId: input.schoolClassId, subjectId: input.subjectId, normalOccurrenceKey: occurrence.occurrenceKey, ppctClassAssociationId: binding.ppctClassAssociationId, ppctPlanId: binding.ppctPlanId, ppctVersionId: currentVersion.id, ppctItemId: revision.ppctItemId };
      const obligation: DirectDistributionObligation = { ...base, distributionObligationKey: distributionObligationKey(base), ppctItemRevisionId: revision.id, sequence: revision.sequence, title: revision.title, lessonType: revision.lessonType };
      covered.add(revision.ppctItemId); obligations.set(occurrence.occurrenceKey, obligation);
      normalAllocations.push({ occurrence, allocationEffect: decision.effect, allocationReason: decision.reason, allocationStatus: 'ALLOCATED', expectedPpctItem: expectedItem(obligation) });
    }

    while (globalEventIndex < globalEvents.length) {
      const event = globalEvents[globalEventIndex]!;
      addFinding(event.finding); blockHistoryAt(historyPositionAtDateStart(event.civilDate)); globalEventIndex += 1;
    }
    const makeups = await tx.makeupTeachingSchedule.findMany({
      where: { academicYearId: input.academicYearId, schoolClassId: input.schoolClassId, subjectId: input.subjectId, targetCivilDate: { lte: throughDate }, status: OperationalOverlayStatus.ACTIVE },
      include: makeupInclude,
      orderBy: [{ targetCivilDate: 'asc' }, { id: 'asc' }],
    });
    const makeupSourceMatches: MakeupSourceMatch[] = makeups.map((makeup) => {
      const sourceNormalOccurrenceKey = `NORMAL:${makeup.originalTimetableEntryId}:${formatCivilDate(makeup.originalCivilDate)}`;
      const direct = obligations.get(sourceNormalOccurrenceKey);
      const exact = direct && direct.academicYearId === makeup.academicYearId && direct.schoolClassId === makeup.schoolClassId && direct.subjectId === makeup.subjectId && direct.ppctClassAssociationId === makeup.ppctClassAssociationId && direct.ppctPlanId === makeup.ppctPlanId && direct.ppctVersionId === makeup.ppctVersionId && direct.ppctItemId === makeup.ppctItemId ? direct : null;
      const sourceAllocation = normalAllocations.find((allocation) => allocation.occurrence.occurrenceKey === sourceNormalOccurrenceKey);
      const sourcePosition: HistoryPosition = {
        civilDate: formatCivilDate(makeup.originalCivilDate),
        startTime: makeup.originalTimetableEntry.timeSlotDefinition.startTime.toISOString().slice(11, 19),
        endTime: makeup.originalTimetableEntry.timeSlotDefinition.endTime.toISOString().slice(11, 19),
        occurrenceKey: sourceNormalOccurrenceKey,
      };
      let status: MakeupSourceMatch['status'];
      if (exact) status = 'MATCH';
      else if (sourceAllocation?.allocationStatus === 'ALLOCATED' || sourceAllocation?.allocationStatus === 'NOT_CONSUMED') status = 'MISMATCH';
      else if (sourceAllocation?.allocationStatus === 'BLOCKED') status = 'NOT_ASSESSED_HISTORY_BLOCKED';
      else status = firstHistoryBlockBoundary && compareHistoryPositions(firstHistoryBlockBoundary, sourcePosition) <= 0 ? 'NOT_ASSESSED_HISTORY_BLOCKED' : 'MISMATCH';
      if (status === 'MISMATCH') addFinding({ severity: 'BLOCKER', code: 'PPCT_MAKEUP_SOURCE_ALLOCATION_MISMATCH', occurrenceKey: `MAKEUP:${makeup.id}`, entityIds: [makeup.id] });
      return { occurrenceKey: `MAKEUP:${makeup.id}`, makeupTeachingScheduleId: makeup.id, targetCivilDate: formatCivilDate(makeup.targetCivilDate), targetSlotStartTime: makeup.targetTimeSlotDefinition.startTime.toISOString().slice(11, 19), sourceNormalOccurrenceKey, status, expectedPpctItem: exact ? expectedItem(exact) : null };
    }).sort((a, b) => `${a.targetCivilDate}:${a.targetSlotStartTime}:${a.occurrenceKey}`.localeCompare(`${b.targetCivilDate}:${b.targetSlotStartTime}:${b.occurrenceKey}`));

    findings.sort((a, b) => `${a.code}:${a.occurrenceKey ?? ''}:${a.reason ?? ''}:${a.entityIds.join(',')}`.localeCompare(`${b.code}:${b.occurrenceKey ?? ''}:${b.reason ?? ''}:${b.entityIds.join(',')}`));
    return {
      profile: PPCT_OCCURRENCE_ALLOCATION_PROFILE,
      scope: input,
      status: findings.length ? 'BLOCKED' : 'PASS',
      replayOrigin: candidateDates[0] ?? null,
      coverage: { ppctItemAllocation: 'ASSESSED', teachingExecution: 'NOT_ASSESSED', completion: 'NOT_ASSESSED', debt: 'NOT_ASSESSED', reporting: 'NOT_ASSESSED' },
      normalAllocations,
      makeupSourceMatches,
      findings,
    };
  }

  private async discoverCandidateDates(tx: Prisma.TransactionClient, input: ResolvePpctOccurrenceAllocationInput, through: Date): Promise<CivilDateString[]> {
    const entries = await tx.timetableEntry.findMany({
      where: {
        academicYearId: input.academicYearId,
        schoolClassId: input.schoolClassId,
        subjectId: input.subjectId,
        timetableVersion: { status: { in: [TimetableVersionStatus.ACTIVE, TimetableVersionStatus.SUPERSEDED] }, effectiveFrom: { not: null, lte: through } },
      },
      select: { weekday: true, timetableVersion: { select: { effectiveFrom: true, effectiveUntil: true } } },
    });
    const result = new Set<CivilDateString>();
    for (const entry of entries) {
      if (!entry.timetableVersion.effectiveFrom) continue;
      const end = entry.timetableVersion.effectiveUntil && entry.timetableVersion.effectiveUntil < through ? entry.timetableVersion.effectiveUntil : through;
      const cursor = new Date(entry.timetableVersion.effectiveFrom.getTime());
      const desired = WEEKDAYS.indexOf(entry.weekday);
      cursor.setUTCDate(cursor.getUTCDate() + (desired - cursor.getUTCDay() + 7) % 7);
      while (cursor <= end) { result.add(formatCivilDate(cursor)); cursor.setUTCDate(cursor.getUTCDate() + 7); }
    }
    return [...result].sort();
  }

  private async loadGraph(tx: Prisma.TransactionClient, planId: string): Promise<PpctPlanGraph> {
    const [versions, lineages] = await Promise.all([
      tx.ppctVersion.findMany({ where: { ppctPlanId: planId }, include: { itemRevisions: true }, orderBy: [{ versionNumber: 'asc' }, { id: 'asc' }] }),
      tx.ppctItemLineage.findMany({ where: { ppctPlanId: planId }, orderBy: { id: 'asc' } }),
    ]);
    return {
      planId,
      versions: versions.map((version) => ({ ...version, status: version.status as PpctGraphVersion['status'], itemRevisions: version.itemRevisions.map((revision) => ({ id: revision.id, ppctVersionId: revision.ppctVersionId, ppctPlanId: revision.ppctPlanId, ppctItemId: revision.ppctItemId, sequence: revision.sequence, title: revision.title, lessonType: revision.lessonType })) })),
      lineages: lineages.map((lineage) => ({ id: lineage.id, ppctPlanId: lineage.ppctPlanId, predecessorVersionId: lineage.predecessorVersionId, predecessorItemId: lineage.predecessorItemId, successorVersionId: lineage.successorVersionId, successorItemId: lineage.successorItemId })),
    };
  }
}
