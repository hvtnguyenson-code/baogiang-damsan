import { Injectable } from '@nestjs/common';
import { OperationalOverlayStatus, Prisma, TimetableVersionStatus } from '@prisma/client';
import { CivilDateString, PpctCurricularComponent } from '@baogiang/contracts';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { ResolvedLessonOccurrencesService } from '../resolved-occurrences/resolved-occurrences.service';
import { NormalStructuralOccurrence, StructuralOccurrenceFinding } from '../resolved-occurrences/resolved-occurrence.types';
import {
  applyVersionTransition,
  applyVersionTransitionV2,
  compareHistoryPositions,
  compareNormalOccurrences,
  consumingOverlapKeys,
  consumptionDecision,
  distributionObligationKey,
  HistoryPosition,
  historyPositionAtDateStart,
  historyPositionForNormal,
  pendingRevisions,
  pendingRevisionsV2,
} from './ppct-occurrence-allocation.policy';
import {
  DirectDistributionObligation,
  ExpectedPpctItem,
  MakeupSourceMatch,
  NormalPpctAllocation,
  PpctAllocationFinding,
  PpctGraphVersion,
  PpctOccurrenceAllocationProfile,
  PpctOccurrenceAllocationResult,
  PpctPlanGraph,
  PPCT_OCCURRENCE_ALLOCATION_PROFILE,
  PPCT_OCCURRENCE_ALLOCATION_PROFILE_V2,
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
  ...(obligation.component ? { component: obligation.component } : {}),
});

@Injectable()
export class PpctOccurrenceAllocationService {
  constructor(private readonly prisma: PrismaService, private readonly structural: ResolvedLessonOccurrencesService) {}

  async resolve(
    input: ResolvePpctOccurrenceAllocationInput,
    profile: PpctOccurrenceAllocationProfile = PPCT_OCCURRENCE_ALLOCATION_PROFILE,
  ): Promise<PpctOccurrenceAllocationResult> {
    if (profile === PPCT_OCCURRENCE_ALLOCATION_PROFILE_V2) {
      return this.resolveV2(input);
    }
    const result = await this.prisma.$transaction(
      (tx) => this.resolveInTransaction(tx, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { ...result, evaluatedAt: new Date().toISOString() };
  }

  async resolveV2(input: ResolvePpctOccurrenceAllocationInput): Promise<PpctOccurrenceAllocationResult> {
    const result = await this.prisma.$transaction(
      (tx) => this.resolveInTransactionV2(tx, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { ...result, evaluatedAt: new Date().toISOString() };
  }

  /**
   * Resolve against the caller's transaction snapshot.  This deliberately
   * opens no transaction: execution confirmation composes it inside its
   * single SERIALIZABLE mutation boundary.
   */
  async resolveInTransaction(
    tx: Prisma.TransactionClient,
    input: ResolvePpctOccurrenceAllocationInput,
    profile: PpctOccurrenceAllocationProfile = PPCT_OCCURRENCE_ALLOCATION_PROFILE,
  ): Promise<Omit<PpctOccurrenceAllocationResult, 'evaluatedAt'>> {
    if (profile === PPCT_OCCURRENCE_ALLOCATION_PROFILE_V2) {
      return this.resolveInTransactionV2(tx, input);
    }
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
      const obligation: DirectDistributionObligation = { ...base, distributionObligationKey: distributionObligationKey(base), ppctItemRevisionId: revision.id, sequence: revision.sequence, title: revision.title, lessonType: revision.lessonType, component: revision.component };
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

  async resolveInTransactionV2(
    tx: Prisma.TransactionClient,
    input: ResolvePpctOccurrenceAllocationInput,
  ): Promise<Omit<PpctOccurrenceAllocationResult, 'evaluatedAt'>> {
    const throughDate = parseCivilDate(input.throughCivilDate);
    const candidateDates = await this.discoverCandidateDates(tx, input, throughDate);
    const normals: NormalStructuralOccurrence[] = [];
    const structuralFindings: DatedFinding[] = [];
    for (const civilDate of candidateDates) {
      const result = await this.structural.resolveInTransaction(tx, { academicYearId: input.academicYearId, civilDate });
      const targetNormals = result.normalOccurrences.filter(
        (occurrence) => occurrence.schoolClass.id === input.schoolClassId && occurrence.subjectId === input.subjectId,
      );
      normals.push(...targetNormals);
      const keys = new Set(targetNormals.map((occurrence) => occurrence.occurrenceKey));
      for (const finding of result.findings) {
        if (GLOBAL_STRUCTURAL_CODES.has(finding.code)) {
          structuralFindings.push({ civilDate, finding, appliesAtOccurrenceKey: null, isGlobal: true });
        } else if (finding.occurrenceKey !== null && keys.has(finding.occurrenceKey)) {
          structuralFindings.push({ civilDate, finding, appliesAtOccurrenceKey: finding.occurrenceKey, isGlobal: false });
        } else if (finding.code === 'ACTIVE_SPECIAL_ACTIVITY_COLLISION') {
          const affected = targetNormals
            .filter((occurrence) => occurrence.suppressingSpecialActivityIds.some((id) => finding.entityIds.includes(id)))
            .sort(compareNormalOccurrences)[0];
          if (affected) {
            structuralFindings.push({ civilDate, finding, appliesAtOccurrenceKey: affected.occurrenceKey, isGlobal: false });
          }
        }
      }
    }
    normals.sort(compareNormalOccurrences);

    // 1. Identify calendar versions and academic week segments
    const calVersionIds = [...new Set(normals.map((o) => o.academicCalendarVersionId))];
    const segments = calVersionIds.length
      ? await tx.academicWeekSegment.findMany({
          where: { calendarVersionId: { in: calVersionIds } },
          include: { academicWeek: true },
          orderBy: [{ startDate: 'asc' }, { segmentOrder: 'asc' }],
        })
      : [];

    type SegmentType = (typeof segments)[0];
    const occSegmentMap = new Map<string, SegmentType>();
    for (const occurrence of normals) {
      const date = parseCivilDate(occurrence.civilDate);
      const matched = segments.find(
        (s) => s.calendarVersionId === occurrence.academicCalendarVersionId && s.startDate <= date && s.endDate >= date,
      );
      if (matched) {
        occSegmentMap.set(occurrence.occurrenceKey, matched);
      }
    }

    // 2. Discover business weeks and canonical week routing sets
    const weekIds = [...new Set([...occSegmentMap.values()].map((s) => s.academicWeekId))];
    const plannedComponentMap = new Map<string, PpctCurricularComponent>();
    const weekBlockerFindings: PpctAllocationFinding[] = [];

    for (const weekId of weekIds) {
      const weekSegments = segments
        .filter((s) => s.academicWeekId === weekId)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
      if (!weekSegments.length) continue;

      const envelopeStart = weekSegments[0]!.startDate;
      const envelopeEnd = weekSegments[weekSegments.length - 1]!.endDate;

      // Check for profile applicability split in protected week envelope
      const associationsInEnvelope = await tx.ppctClassAssociation.findMany({
        where: {
          academicYearId: input.academicYearId,
          schoolClassId: input.schoolClassId,
          subjectId: input.subjectId,
          effectiveFrom: { lte: envelopeEnd },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: envelopeStart } }],
        },
        orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
      });
      const uniqueProfiles = [...new Set(associationsInEnvelope.map((a) => a.curricularProfile))];
      if (uniqueProfiles.length > 1) {
        weekBlockerFindings.push({
          severity: 'BLOCKER',
          code: 'PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT',
          occurrenceKey: null,
          entityIds: associationsInEnvelope.map((a) => a.id).sort(),
        });
      }

      // Collect all routing occurrences in this business week
      const weekOccurrences: NormalStructuralOccurrence[] = normals.filter(
        (o) => occSegmentMap.get(o.occurrenceKey)?.academicWeekId === weekId,
      );

      // If week extends beyond throughDate, discover future opportunities in week segments
      if (envelopeEnd > throughDate) {
        const nextDay = new Date(throughDate.getTime() + 86400000);
        const futureDates = await this.discoverCandidateDates(tx, input, envelopeEnd, nextDay);
        for (const fDateStr of futureDates) {
          const fDate = parseCivilDate(fDateStr);
          const matchedSeg = weekSegments.find((s) => s.startDate <= fDate && s.endDate >= fDate);
          if (matchedSeg) {
            const fResult = await this.structural.resolveInTransaction(tx, {
              academicYearId: input.academicYearId,
              civilDate: fDateStr,
            });
            const fNormals = fResult.normalOccurrences.filter(
              (o) => o.schoolClass.id === input.schoolClassId && o.subjectId === input.subjectId,
            );
            weekOccurrences.push(...fNormals);
          }
        }
      }

      // Check for calendar / week split among all opportunities in the business week envelope
      const envelopeOccurrences = normals.filter((o) => {
        const d = parseCivilDate(o.civilDate);
        return d >= envelopeStart && d <= envelopeEnd;
      });
      const distinctCalVersionsInEnvelope = new Set(envelopeOccurrences.map((o) => o.academicCalendarVersionId));
      const distinctWeeksInEnvelope = new Set(
        envelopeOccurrences.map((o) => occSegmentMap.get(o.occurrenceKey)?.academicWeekId).filter(Boolean),
      );
      if (distinctCalVersionsInEnvelope.size > 1 || distinctWeeksInEnvelope.size > 1) {
        const splitAlreadyReported = weekBlockerFindings.some(
          (f) => f.code === 'PPCT_COMPONENT_WEEK_CALENDAR_SPLIT',
        );
        if (!splitAlreadyReported) {
          weekBlockerFindings.push({
            severity: 'BLOCKER',
            code: 'PPCT_COMPONENT_WEEK_CALENDAR_SPLIT',
            occurrenceKey: envelopeOccurrences[0]?.occurrenceKey ?? null,
            entityIds: [...distinctCalVersionsInEnvelope].sort(),
          });
        }
        continue;
      }

      // Deterministic weekly ordering (requirement 5.4)
      weekOccurrences.sort((a, b) => {
        return (
          a.civilDate.localeCompare(b.civilDate) ||
          a.timeSlot.startTime.localeCompare(b.timeSlot.startTime) ||
          a.timeSlot.endTime.localeCompare(b.timeSlot.endTime) ||
          a.occurrenceKey.localeCompare(b.occurrenceKey)
        );
      });

      const effectiveProfile = associationsInEnvelope[0]?.curricularProfile ?? 'CORE_ONLY';
      if (effectiveProfile === 'CORE_ONLY') {
        for (const occ of weekOccurrences) {
          plannedComponentMap.set(occ.occurrenceKey, 'CORE');
        }
      } else if (effectiveProfile === 'CORE_PLUS_SPECIALIZED_STUDY') {
        if (weekOccurrences.length === 1) {
          weekBlockerFindings.push({
            severity: 'BLOCKER',
            code: 'PPCT_COMPONENT_WEEK_CAPACITY_INVALID',
            occurrenceKey: weekOccurrences[0]!.occurrenceKey,
            entityIds: [weekId, weekOccurrences[0]!.timetableEntryId].sort(),
          });
          plannedComponentMap.set(weekOccurrences[0]!.occurrenceKey, 'SPECIALIZED_STUDY');
        } else if (weekOccurrences.length >= 2) {
          for (let i = 0; i < weekOccurrences.length - 1; i += 1) {
            plannedComponentMap.set(weekOccurrences[i]!.occurrenceKey, 'CORE');
          }
          plannedComponentMap.set(weekOccurrences[weekOccurrences.length - 1]!.occurrenceKey, 'SPECIALIZED_STUDY');
        }
      }
    }

    // Chronological Allocation Loop
    const findings: PpctAllocationFinding[] = [];
    const addFinding = (finding: PpctAllocationFinding) =>
      findings.push({ ...finding, entityIds: [...finding.entityIds].sort() });

    for (const wb of weekBlockerFindings) {
      addFinding(wb);
    }

    const byOccurrence = new Map<string, StructuralOccurrenceFinding[]>();
    for (const item of structuralFindings) {
      if (item.appliesAtOccurrenceKey) {
        byOccurrence.set(item.appliesAtOccurrenceKey, [...(byOccurrence.get(item.appliesAtOccurrenceKey) ?? []), item.finding]);
      }
    }
    const globalEvents = structuralFindings
      .filter((item) => item.isGlobal)
      .sort((a, b) =>
        `${a.civilDate}:${a.finding.code}:${a.finding.entityIds.join(',')}`.localeCompare(
          `${b.civilDate}:${b.finding.code}:${b.finding.entityIds.join(',')}`,
        ),
      );
    const overlapKeys = consumingOverlapKeys(normals);
    const overlapReported = new Set<string>();
    const covered: Record<PpctCurricularComponent, Set<string>> = {
      CORE: new Set<string>(),
      SPECIALIZED_STUDY: new Set<string>(),
    };
    const obligations = new Map<string, DirectDistributionObligation>();
    const graphCache = new Map<string, PpctPlanGraph>();
    const normalAllocations: NormalPpctAllocation[] = [];
    let currentVersion: PpctGraphVersion | null = null;
    let currentPlanId: string | null = null;
    let historyBlocked = weekBlockerFindings.length > 0;
    let firstHistoryBlockBoundary: HistoryPosition | null = null;
    let globalEventIndex = 0;
    const blockHistoryAt = (position: HistoryPosition) => {
      historyBlocked = true;
      if (!firstHistoryBlockBoundary || compareHistoryPositions(position, firstHistoryBlockBoundary) < 0) {
        firstHistoryBlockBoundary = position;
      }
    };

    if (historyBlocked && normals.length) {
      firstHistoryBlockBoundary = historyPositionForNormal(normals[0]!);
    }

    for (const occurrence of normals) {
      const decision = consumptionDecision(occurrence);
      const occurrencePosition = historyPositionForNormal(occurrence);
      const isRouting = occSegmentMap.has(occurrence.occurrenceKey);
      const plannedComponent = isRouting ? (plannedComponentMap.get(occurrence.occurrenceKey) ?? 'CORE') : null;

      while (globalEventIndex < globalEvents.length && globalEvents[globalEventIndex]!.civilDate <= occurrence.civilDate) {
        const event = globalEvents[globalEventIndex]!;
        addFinding(event.finding);
        blockHistoryAt(historyPositionAtDateStart(event.civilDate));
        globalEventIndex += 1;
      }

      const scopedFindings = byOccurrence.get(occurrence.occurrenceKey) ?? [];
      if (scopedFindings.length) {
        for (const finding of scopedFindings) addFinding(finding);
        blockHistoryAt(occurrencePosition);
      }

      if (overlapKeys.has(occurrence.occurrenceKey)) {
        const members = normals
          .filter(
            (candidate) =>
              candidate.civilDate === occurrence.civilDate &&
              overlapKeys.has(candidate.occurrenceKey) &&
              candidate.timeSlot.startTime < occurrence.timeSlot.endTime &&
              occurrence.timeSlot.startTime < candidate.timeSlot.endTime,
          )
          .map((candidate) => candidate.occurrenceKey)
          .sort();
        const signature = members.join(',');
        if (!overlapReported.has(signature)) {
          addFinding({
            severity: 'BLOCKER',
            code: 'PPCT_ALLOCATION_OCCURRENCE_ORDER_AMBIGUOUS',
            occurrenceKey: occurrence.occurrenceKey,
            entityIds: members,
          });
          overlapReported.add(signature);
        }
        blockHistoryAt(occurrencePosition);
      }

      // Non-routing member (interruption gap outside segments)
      if (!isRouting) {
        normalAllocations.push({
          occurrence,
          allocationEffect: 'DOES_NOT_CONSUME_ITEM',
          allocationReason: 'CALENDAR_INTERRUPTION',
          allocationStatus: 'NOT_CONSUMED',
          expectedPpctItem: null,
          plannedComponent: null,
        });
        continue;
      }

      const binding = occurrence.ppctBinding;
      if (!binding && !historyBlocked) {
        addFinding({
          severity: 'BLOCKER',
          code: 'PPCT_ALLOCATION_HISTORY_BLOCKED',
          occurrenceKey: occurrence.occurrenceKey,
          reason: 'TARGET_PPCT_BINDING_MISSING',
          entityIds: [occurrence.timetableEntryId],
        });
        blockHistoryAt(occurrencePosition);
      }

      if (historyBlocked || !binding) {
        normalAllocations.push({
          occurrence,
          allocationEffect: decision.effect,
          allocationReason: decision.reason,
          allocationStatus: 'BLOCKED',
          expectedPpctItem: null,
          plannedComponent,
        });
        continue;
      }

      const graph = graphCache.get(binding.ppctPlanId) ?? (await this.loadGraph(tx, binding.ppctPlanId));
      graphCache.set(binding.ppctPlanId, graph);
      const target = graph.versions.find((version) => version.id === binding.ppctVersionId && version.status !== 'DRAFT');
      if (!target) {
        addFinding({
          severity: 'BLOCKER',
          code: 'PPCT_ALLOCATION_HISTORY_BLOCKED',
          occurrenceKey: occurrence.occurrenceKey,
          reason: 'TARGET_VERSION_CONTEXT_MISSING',
          entityIds: [binding.ppctVersionId],
        });
        blockHistoryAt(occurrencePosition);
      } else if (currentPlanId !== null && currentPlanId !== binding.ppctPlanId) {
        addFinding({
          severity: 'BLOCKER',
          code: 'PPCT_ALLOCATION_HISTORY_BLOCKED',
          occurrenceKey: occurrence.occurrenceKey,
          reason: 'PLAN_CONTEXT_CHANGED',
          entityIds: [currentPlanId, binding.ppctPlanId],
        });
        blockHistoryAt(occurrencePosition);
      } else if (currentVersion && target.versionNumber < currentVersion.versionNumber) {
        addFinding({
          severity: 'BLOCKER',
          code: 'PPCT_ALLOCATION_HISTORY_BLOCKED',
          occurrenceKey: occurrence.occurrenceKey,
          reason: 'NON_FORWARD_VERSION_TRANSITION',
          entityIds: [currentVersion.id, target.id],
        });
        blockHistoryAt(occurrencePosition);
      } else {
        const currentNumber = currentVersion?.versionNumber;
        const frontier: PpctGraphVersion[] =
          currentNumber !== undefined
            ? graph.versions.filter(
                (version) =>
                  version.status !== 'DRAFT' &&
                  version.versionNumber > currentNumber &&
                  version.versionNumber <= target.versionNumber,
              )
            : [target];
        for (const version of frontier.sort((a, b) => a.versionNumber - b.versionNumber || a.id.localeCompare(b.id))) {
          const blocker = applyVersionTransitionV2(graph, version, covered);
          if (blocker) {
            addFinding({ severity: 'BLOCKER', ...blocker, occurrenceKey: occurrence.occurrenceKey });
            blockHistoryAt(occurrencePosition);
            break;
          }
          currentVersion = version;
          currentPlanId = graph.planId;
        }
      }

      if (historyBlocked || !currentVersion) {
        normalAllocations.push({
          occurrence,
          allocationEffect: decision.effect,
          allocationReason: decision.reason,
          allocationStatus: 'BLOCKED',
          expectedPpctItem: null,
          plannedComponent,
        });
        continue;
      }

      if (decision.effect === 'DOES_NOT_CONSUME_ITEM') {
        normalAllocations.push({
          occurrence,
          allocationEffect: decision.effect,
          allocationReason: decision.reason,
          allocationStatus: 'NOT_CONSUMED',
          expectedPpctItem: null,
          plannedComponent,
        });
        continue;
      }

      const revision = pendingRevisionsV2(currentVersion, plannedComponent!, covered[plannedComponent!])[0];
      if (!revision) {
        addFinding({
          severity: 'BLOCKER',
          code: 'PPCT_ALLOCATION_EXHAUSTED',
          occurrenceKey: occurrence.occurrenceKey,
          reason: plannedComponent!,
          component: plannedComponent!,
          entityIds: [currentVersion.id],
        });
        blockHistoryAt(occurrencePosition);
        normalAllocations.push({
          occurrence,
          allocationEffect: decision.effect,
          allocationReason: decision.reason,
          allocationStatus: 'BLOCKED',
          expectedPpctItem: null,
          plannedComponent,
        });
        continue;
      }

      const base = {
        academicYearId: input.academicYearId,
        schoolClassId: input.schoolClassId,
        subjectId: input.subjectId,
        normalOccurrenceKey: occurrence.occurrenceKey,
        ppctClassAssociationId: binding.ppctClassAssociationId,
        ppctPlanId: binding.ppctPlanId,
        ppctVersionId: currentVersion.id,
        ppctItemId: revision.ppctItemId,
      };
      const obligation: DirectDistributionObligation = {
        ...base,
        distributionObligationKey: distributionObligationKey(base),
        ppctItemRevisionId: revision.id,
        sequence: revision.sequence,
        title: revision.title,
        lessonType: revision.lessonType,
        component: revision.component,
      };
      covered[plannedComponent!].add(revision.ppctItemId);
      obligations.set(occurrence.occurrenceKey, obligation);
      normalAllocations.push({
        occurrence,
        allocationEffect: decision.effect,
        allocationReason: decision.reason,
        allocationStatus: 'ALLOCATED',
        expectedPpctItem: {
          ...expectedItem(obligation),
          component: revision.component,
        },
        plannedComponent,
      });
    }

    while (globalEventIndex < globalEvents.length) {
      const event = globalEvents[globalEventIndex]!;
      addFinding(event.finding);
      blockHistoryAt(historyPositionAtDateStart(event.civilDate));
      globalEventIndex += 1;
    }

    const makeups = await tx.makeupTeachingSchedule.findMany({
      where: {
        academicYearId: input.academicYearId,
        schoolClassId: input.schoolClassId,
        subjectId: input.subjectId,
        targetCivilDate: { lte: throughDate },
        status: OperationalOverlayStatus.ACTIVE,
      },
      include: makeupInclude,
      orderBy: [{ targetCivilDate: 'asc' }, { id: 'asc' }],
    });

    const makeupSourceMatches: MakeupSourceMatch[] = makeups
      .map((makeup) => {
        const sourceNormalOccurrenceKey = `NORMAL:${makeup.originalTimetableEntryId}:${formatCivilDate(makeup.originalCivilDate)}`;
        const direct = obligations.get(sourceNormalOccurrenceKey);
        const exact =
          direct &&
          direct.academicYearId === makeup.academicYearId &&
          direct.schoolClassId === makeup.schoolClassId &&
          direct.subjectId === makeup.subjectId &&
          direct.ppctClassAssociationId === makeup.ppctClassAssociationId &&
          direct.ppctPlanId === makeup.ppctPlanId &&
          direct.ppctVersionId === makeup.ppctVersionId &&
          direct.ppctItemId === makeup.ppctItemId
            ? direct
            : null;
        const sourceAllocation = normalAllocations.find(
          (allocation) => allocation.occurrence.occurrenceKey === sourceNormalOccurrenceKey,
        );
        const sourcePosition: HistoryPosition = {
          civilDate: formatCivilDate(makeup.originalCivilDate),
          startTime: makeup.originalTimetableEntry.timeSlotDefinition.startTime.toISOString().slice(11, 19),
          endTime: makeup.originalTimetableEntry.timeSlotDefinition.endTime.toISOString().slice(11, 19),
          occurrenceKey: sourceNormalOccurrenceKey,
        };
        let status: MakeupSourceMatch['status'];
        if (exact) status = 'MATCH';
        else if (sourceAllocation?.allocationStatus === 'ALLOCATED' || sourceAllocation?.allocationStatus === 'NOT_CONSUMED')
          status = 'MISMATCH';
        else if (sourceAllocation?.allocationStatus === 'BLOCKED') status = 'NOT_ASSESSED_HISTORY_BLOCKED';
        else
          status =
            firstHistoryBlockBoundary && compareHistoryPositions(firstHistoryBlockBoundary, sourcePosition) <= 0
              ? 'NOT_ASSESSED_HISTORY_BLOCKED'
              : 'MISMATCH';
        if (status === 'MISMATCH') {
          addFinding({
            severity: 'BLOCKER',
            code: 'PPCT_MAKEUP_SOURCE_ALLOCATION_MISMATCH',
            occurrenceKey: `MAKEUP:${makeup.id}`,
            entityIds: [makeup.id],
          });
        }
        return {
          occurrenceKey: `MAKEUP:${makeup.id}`,
          makeupTeachingScheduleId: makeup.id,
          targetCivilDate: formatCivilDate(makeup.targetCivilDate),
          targetSlotStartTime: makeup.targetTimeSlotDefinition.startTime.toISOString().slice(11, 19),
          sourceNormalOccurrenceKey,
          status,
          expectedPpctItem: exact ? { ...expectedItem(exact), component: exact.component } : null,
        };
      })
      .sort((a, b) =>
        `${a.targetCivilDate}:${a.targetSlotStartTime}:${a.occurrenceKey}`.localeCompare(
          `${b.targetCivilDate}:${b.targetSlotStartTime}:${b.occurrenceKey}`,
        ),
      );

    findings.sort((a, b) =>
      `${a.code}:${a.occurrenceKey ?? ''}:${a.reason ?? ''}:${a.entityIds.join(',')}`.localeCompare(
        `${b.code}:${b.occurrenceKey ?? ''}:${b.reason ?? ''}:${b.entityIds.join(',')}`,
      ),
    );

    return {
      profile: PPCT_OCCURRENCE_ALLOCATION_PROFILE_V2,
      scope: input,
      status: findings.length ? 'BLOCKED' : 'PASS',
      replayOrigin: candidateDates[0] ?? null,
      coverage: {
        ppctItemAllocation: 'ASSESSED',
        teachingExecution: 'NOT_ASSESSED',
        completion: 'NOT_ASSESSED',
        debt: 'NOT_ASSESSED',
        reporting: 'NOT_ASSESSED',
      },
      normalAllocations,
      makeupSourceMatches,
      findings,
    };
  }

  private async discoverCandidateDates(
    tx: Prisma.TransactionClient,
    input: ResolvePpctOccurrenceAllocationInput,
    through: Date,
    from?: Date,
  ): Promise<CivilDateString[]> {
    const entries = await tx.timetableEntry.findMany({
      where: {
        academicYearId: input.academicYearId,
        schoolClassId: input.schoolClassId,
        subjectId: input.subjectId,
        timetableVersion: {
          status: { in: [TimetableVersionStatus.ACTIVE, TimetableVersionStatus.SUPERSEDED] },
          effectiveFrom: { not: null, lte: through },
        },
      },
      select: { weekday: true, timetableVersion: { select: { effectiveFrom: true, effectiveUntil: true } } },
    });
    const result = new Set<CivilDateString>();
    for (const entry of entries) {
      if (!entry.timetableVersion.effectiveFrom) continue;
      const start = from && from > entry.timetableVersion.effectiveFrom ? from : entry.timetableVersion.effectiveFrom;
      const end = entry.timetableVersion.effectiveUntil && entry.timetableVersion.effectiveUntil < through ? entry.timetableVersion.effectiveUntil : through;
      if (start > end) continue;
      const cursor = new Date(start.getTime());
      const desired = WEEKDAYS.indexOf(entry.weekday);
      cursor.setUTCDate(cursor.getUTCDate() + ((desired - cursor.getUTCDay() + 7) % 7));
      while (cursor <= end) {
        if (!from || cursor >= from) {
          result.add(formatCivilDate(cursor));
        }
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    }
    return [...result].sort();
  }

  private async loadGraph(tx: Prisma.TransactionClient, planId: string): Promise<PpctPlanGraph> {
    const [versions, lineages] = await Promise.all([
      tx.ppctVersion.findMany({
        where: { ppctPlanId: planId },
        include: { itemRevisions: true },
        orderBy: [{ versionNumber: 'asc' }, { id: 'asc' }],
      }),
      tx.ppctItemLineage.findMany({ where: { ppctPlanId: planId }, orderBy: { id: 'asc' } }),
    ]);
    return {
      planId,
      versions: versions.map((version) => ({
        ...version,
        status: version.status as PpctGraphVersion['status'],
        itemRevisions: version.itemRevisions.map((revision) => ({
          id: revision.id,
          ppctVersionId: revision.ppctVersionId,
          ppctPlanId: revision.ppctPlanId,
          ppctItemId: revision.ppctItemId,
          sequence: revision.sequence,
          title: revision.title,
          lessonType: revision.lessonType,
          component: revision.component,
        })),
      })),
      lineages: lineages.map((lineage) => ({
        id: lineage.id,
        ppctPlanId: lineage.ppctPlanId,
        predecessorVersionId: lineage.predecessorVersionId,
        predecessorItemId: lineage.predecessorItemId,
        successorVersionId: lineage.successorVersionId,
        successorItemId: lineage.successorItemId,
        component: lineage.component,
      })),
    };
  }
}
