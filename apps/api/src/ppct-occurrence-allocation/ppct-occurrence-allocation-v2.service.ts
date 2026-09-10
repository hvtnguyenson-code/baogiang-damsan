import { Injectable } from '@nestjs/common';
import {
  OperationalOverlayStatus,
  PpctClassCurricularProfile,
  PpctCurricularComponent,
  Prisma,
  TimetableVersionStatus,
} from '@prisma/client';
import { CivilDateString } from '@baogiang/contracts';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { ResolvedLessonOccurrencesService } from '../resolved-occurrences/resolved-occurrences.service';
import { NormalStructuralOccurrence, StructuralOccurrenceFinding } from '../resolved-occurrences/resolved-occurrence.types';
import {
  compareHistoryPositions,
  compareNormalOccurrences,
  consumingOverlapKeys,
  consumptionDecision,
  distributionObligationKey,
  HistoryPosition,
  historyPositionAtDateStart,
  historyPositionForNormal,
} from './ppct-occurrence-allocation.policy';
import { applyComponentVersionTransition, pendingComponentRevisions } from './ppct-occurrence-allocation-v2.policy';
import {
  ComponentDirectDistributionObligation,
  ComponentExpectedPpctItem,
  ComponentMakeupSourceMatch,
  ComponentNormalPpctAllocation,
  PpctAllocationV2Finding,
  PpctGraphVersionV2,
  PpctOccurrenceAllocationV2Result,
  PpctPlanGraphV2,
  PPCT_OCCURRENCE_ALLOCATION_PROFILE_V2,
} from './ppct-occurrence-allocation-v2.types';
import { ResolvePpctOccurrenceAllocationInput } from './ppct-occurrence-allocation.types';

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
const COMPONENTS = [PpctCurricularComponent.CORE, PpctCurricularComponent.SPECIALIZED_STUDY] as const;
const GLOBAL_STRUCTURAL_CODES = new Set(['TIMETABLE_EFFECTIVE_VERSION_MISSING', 'TIMETABLE_EFFECTIVE_VERSION_AMBIGUOUS', 'RETAINED_CALENDAR_INVALID']);
const GAP_IRRELEVANT_STRUCTURAL_CODES = new Set(['PPCT_ASSOCIATION_MISSING', 'PPCT_ASSOCIATION_AMBIGUOUS', 'PPCT_ASSOCIATION_INVALID_TARGET']);
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

interface RoutingGroup {
  key: string;
  calendarVersionId: string;
  academicWeekId: string;
  envelopeStart: Date;
  envelopeEnd: Date;
  members: NormalStructuralOccurrence[];
}

interface RoutingPreparation {
  plannedComponentByOccurrence: Map<string, PpctCurricularComponent | null>;
  gapOccurrenceKeys: Set<string>;
  findingsByOccurrence: Map<string, PpctAllocationV2Finding[]>;
}

const componentExpectedItem = (obligation: ComponentDirectDistributionObligation): ComponentExpectedPpctItem => ({
  distributionObligationKey: obligation.distributionObligationKey,
  ppctClassAssociationId: obligation.ppctClassAssociationId,
  ppctPlanId: obligation.ppctPlanId,
  ppctVersionId: obligation.ppctVersionId,
  ppctItemId: obligation.ppctItemId,
  ppctItemRevisionId: obligation.ppctItemRevisionId,
  component: obligation.component,
  sequence: obligation.sequence,
  title: obligation.title,
  lessonType: obligation.lessonType,
});

@Injectable()
export class PpctOccurrenceAllocationV2Service {
  constructor(private readonly prisma: PrismaService, private readonly structural: ResolvedLessonOccurrencesService) {}

  async resolve(input: ResolvePpctOccurrenceAllocationInput): Promise<PpctOccurrenceAllocationV2Result> {
    const result = await this.prisma.$transaction(
      (tx) => this.resolveInTransaction(tx, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { ...result, evaluatedAt: new Date().toISOString() };
  }

  /**
   * Component-aware replay against a caller-owned transaction snapshot.
   * This method deliberately opens no nested transaction.
   */
  async resolveInTransaction(
    tx: Prisma.TransactionClient,
    input: ResolvePpctOccurrenceAllocationInput,
  ): Promise<Omit<PpctOccurrenceAllocationV2Result, 'evaluatedAt'>> {
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
          if (affected) structuralFindings.push({ civilDate, finding, appliesAtOccurrenceKey: affected.occurrenceKey, isGlobal: false });
        }
      }
    }
    normals.sort(compareNormalOccurrences);

    const routing = await this.prepareRouting(tx, input, normals);
    const findings: PpctAllocationV2Finding[] = [];
    const addFinding = (finding: PpctAllocationV2Finding) => findings.push({ ...finding, entityIds: [...finding.entityIds].sort() });
    const byOccurrence = new Map<string, StructuralOccurrenceFinding[]>();
    for (const item of structuralFindings) {
      if (!item.appliesAtOccurrenceKey) continue;
      byOccurrence.set(item.appliesAtOccurrenceKey, [...(byOccurrence.get(item.appliesAtOccurrenceKey) ?? []), item.finding]);
    }
    const globalEvents = structuralFindings
      .filter((item) => item.isGlobal)
      .sort((a, b) => `${a.civilDate}:${a.finding.code}:${a.finding.entityIds.join(',')}`.localeCompare(`${b.civilDate}:${b.finding.code}:${b.finding.entityIds.join(',')}`));
    const routingNormals = normals.filter((occurrence) => !routing.gapOccurrenceKeys.has(occurrence.occurrenceKey));
    const overlapKeys = consumingOverlapKeys(routingNormals);
    const overlapReported = new Set<string>();
    const coveredByComponent = new Map<PpctCurricularComponent, Set<string>>([
      [PpctCurricularComponent.CORE, new Set<string>()],
      [PpctCurricularComponent.SPECIALIZED_STUDY, new Set<string>()],
    ]);
    const obligations = new Map<string, ComponentDirectDistributionObligation>();
    const graphCache = new Map<string, PpctPlanGraphV2>();
    const normalAllocations: ComponentNormalPpctAllocation[] = [];
    let currentVersion: PpctGraphVersionV2 | null = null;
    let currentPlanId: string | null = null;
    let historyBlocked = false;
    let firstHistoryBlockBoundary: HistoryPosition | null = null;
    let globalEventIndex = 0;
    const blockHistoryAt = (position: HistoryPosition) => {
      historyBlocked = true;
      if (!firstHistoryBlockBoundary || compareHistoryPositions(position, firstHistoryBlockBoundary) < 0) {
        firstHistoryBlockBoundary = position;
      }
    };

    for (const occurrence of normals) {
      const occurrencePosition = historyPositionForNormal(occurrence);
      const isGap = routing.gapOccurrenceKeys.has(occurrence.occurrenceKey);
      const plannedComponent = routing.plannedComponentByOccurrence.get(occurrence.occurrenceKey) ?? null;
      const decision = isGap
        ? { effect: 'DOES_NOT_CONSUME_ITEM' as const, reason: 'OUTSIDE_ACADEMIC_WEEK_SEGMENT' }
        : consumptionDecision(occurrence);

      while (globalEventIndex < globalEvents.length && globalEvents[globalEventIndex]!.civilDate <= occurrence.civilDate) {
        const event = globalEvents[globalEventIndex]!;
        addFinding(event.finding);
        blockHistoryAt(historyPositionAtDateStart(event.civilDate));
        globalEventIndex += 1;
      }

      const routingFindings = routing.findingsByOccurrence.get(occurrence.occurrenceKey) ?? [];
      if (routingFindings.length) {
        for (const finding of routingFindings) addFinding(finding);
        blockHistoryAt(occurrencePosition);
      }

      const scopedFindings = (byOccurrence.get(occurrence.occurrenceKey) ?? [])
        .filter((finding) => !(isGap && GAP_IRRELEVANT_STRUCTURAL_CODES.has(finding.code)));
      if (scopedFindings.length) {
        for (const finding of scopedFindings) addFinding(finding);
        blockHistoryAt(occurrencePosition);
      }

      if (isGap) {
        normalAllocations.push({
          occurrence,
          plannedComponent: null,
          allocationEffect: decision.effect,
          allocationReason: decision.reason,
          allocationStatus: historyBlocked ? 'BLOCKED' : 'NOT_CONSUMED',
          expectedPpctItem: null,
        });
        continue;
      }

      if (overlapKeys.has(occurrence.occurrenceKey)) {
        const members = routingNormals
          .filter((candidate) => candidate.civilDate === occurrence.civilDate
            && overlapKeys.has(candidate.occurrenceKey)
            && candidate.timeSlot.startTime < occurrence.timeSlot.endTime
            && occurrence.timeSlot.startTime < candidate.timeSlot.endTime)
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

      if (!plannedComponent && !historyBlocked) {
        addFinding({
          severity: 'BLOCKER',
          code: 'PPCT_ALLOCATION_HISTORY_BLOCKED',
          occurrenceKey: occurrence.occurrenceKey,
          reason: 'CURRICULAR_COMPONENT_ROUTE_UNRESOLVED',
          entityIds: [occurrence.timetableEntryId],
        });
        blockHistoryAt(occurrencePosition);
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
      if (historyBlocked || !binding || !plannedComponent) {
        normalAllocations.push({
          occurrence,
          plannedComponent,
          allocationEffect: decision.effect,
          allocationReason: decision.reason,
          allocationStatus: 'BLOCKED',
          expectedPpctItem: null,
        });
        continue;
      }

      const graph = graphCache.get(binding.ppctPlanId) ?? await this.loadGraph(tx, binding.ppctPlanId);
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
        const frontier: PpctGraphVersionV2[] = currentNumber !== undefined
          ? graph.versions.filter((version) => version.status !== 'DRAFT' && version.versionNumber > currentNumber && version.versionNumber <= target.versionNumber)
          : [target];
        for (const version of frontier.sort((a, b) => a.versionNumber - b.versionNumber || a.id.localeCompare(b.id))) {
          let transitionBlocked = false;
          for (const component of COMPONENTS) {
            const covered = coveredByComponent.get(component)!;
            const blocker = applyComponentVersionTransition(graph, version, covered, component);
            if (blocker) {
              addFinding({ severity: 'BLOCKER', ...blocker, occurrenceKey: occurrence.occurrenceKey, component });
              blockHistoryAt(occurrencePosition);
              transitionBlocked = true;
              break;
            }
          }
          if (transitionBlocked) break;
          currentVersion = version;
          currentPlanId = graph.planId;
        }
      }

      if (historyBlocked || !currentVersion) {
        normalAllocations.push({
          occurrence,
          plannedComponent,
          allocationEffect: decision.effect,
          allocationReason: decision.reason,
          allocationStatus: 'BLOCKED',
          expectedPpctItem: null,
        });
        continue;
      }
      if (decision.effect === 'DOES_NOT_CONSUME_ITEM') {
        normalAllocations.push({
          occurrence,
          plannedComponent,
          allocationEffect: decision.effect,
          allocationReason: decision.reason,
          allocationStatus: 'NOT_CONSUMED',
          expectedPpctItem: null,
        });
        continue;
      }

      const covered = coveredByComponent.get(plannedComponent)!;
      const revision = pendingComponentRevisions(currentVersion, covered, plannedComponent)[0];
      if (!revision) {
        addFinding({
          severity: 'BLOCKER',
          code: 'PPCT_ALLOCATION_EXHAUSTED',
          occurrenceKey: occurrence.occurrenceKey,
          entityIds: [currentVersion.id],
          component: plannedComponent,
        });
        blockHistoryAt(occurrencePosition);
        normalAllocations.push({
          occurrence,
          plannedComponent,
          allocationEffect: decision.effect,
          allocationReason: decision.reason,
          allocationStatus: 'BLOCKED',
          expectedPpctItem: null,
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
      const obligation: ComponentDirectDistributionObligation = {
        ...base,
        distributionObligationKey: distributionObligationKey(base),
        ppctItemRevisionId: revision.id,
        component: revision.component,
        sequence: revision.sequence,
        title: revision.title,
        lessonType: revision.lessonType,
      };
      covered.add(revision.ppctItemId);
      obligations.set(occurrence.occurrenceKey, obligation);
      normalAllocations.push({
        occurrence,
        plannedComponent,
        allocationEffect: decision.effect,
        allocationReason: decision.reason,
        allocationStatus: 'ALLOCATED',
        expectedPpctItem: componentExpectedItem(obligation),
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
    const makeupSourceMatches: ComponentMakeupSourceMatch[] = makeups.map((makeup) => {
      const sourceNormalOccurrenceKey = `NORMAL:${makeup.originalTimetableEntryId}:${formatCivilDate(makeup.originalCivilDate)}`;
      const direct = obligations.get(sourceNormalOccurrenceKey);
      const exact = direct
        && direct.academicYearId === makeup.academicYearId
        && direct.schoolClassId === makeup.schoolClassId
        && direct.subjectId === makeup.subjectId
        && direct.ppctClassAssociationId === makeup.ppctClassAssociationId
        && direct.ppctPlanId === makeup.ppctPlanId
        && direct.ppctVersionId === makeup.ppctVersionId
        && direct.ppctItemId === makeup.ppctItemId
        ? direct
        : null;
      const sourceAllocation = normalAllocations.find((allocation) => allocation.occurrence.occurrenceKey === sourceNormalOccurrenceKey);
      const sourcePosition: HistoryPosition = {
        civilDate: formatCivilDate(makeup.originalCivilDate),
        startTime: makeup.originalTimetableEntry.timeSlotDefinition.startTime.toISOString().slice(11, 19),
        endTime: makeup.originalTimetableEntry.timeSlotDefinition.endTime.toISOString().slice(11, 19),
        occurrenceKey: sourceNormalOccurrenceKey,
      };
      let status: ComponentMakeupSourceMatch['status'];
      if (exact) status = 'MATCH';
      else if (sourceAllocation?.allocationStatus === 'ALLOCATED' || sourceAllocation?.allocationStatus === 'NOT_CONSUMED') status = 'MISMATCH';
      else if (sourceAllocation?.allocationStatus === 'BLOCKED') status = 'NOT_ASSESSED_HISTORY_BLOCKED';
      else status = firstHistoryBlockBoundary && compareHistoryPositions(firstHistoryBlockBoundary, sourcePosition) <= 0
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
        expectedPpctItem: exact ? componentExpectedItem(exact) : null,
      };
    }).sort((a, b) => `${a.targetCivilDate}:${a.targetSlotStartTime}:${a.occurrenceKey}`.localeCompare(`${b.targetCivilDate}:${b.targetSlotStartTime}:${b.occurrenceKey}`));

    findings.sort((a, b) => `${a.code}:${a.occurrenceKey ?? ''}:${a.component ?? ''}:${a.reason ?? ''}:${a.entityIds.join(',')}`.localeCompare(`${b.code}:${b.occurrenceKey ?? ''}:${b.component ?? ''}:${b.reason ?? ''}:${b.entityIds.join(',')}`));
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

  private async prepareRouting(
    tx: Prisma.TransactionClient,
    input: ResolvePpctOccurrenceAllocationInput,
    normals: NormalStructuralOccurrence[],
  ): Promise<RoutingPreparation> {
    const plannedComponentByOccurrence = new Map<string, PpctCurricularComponent | null>();
    const gapOccurrenceKeys = new Set<string>();
    const findingsByOccurrence = new Map<string, PpctAllocationV2Finding[]>();
    const addRoutingFinding = (occurrenceKey: string, finding: PpctAllocationV2Finding) => {
      findingsByOccurrence.set(occurrenceKey, [...(findingsByOccurrence.get(occurrenceKey) ?? []), finding]);
    };
    if (!normals.length) return { plannedComponentByOccurrence, gapOccurrenceKeys, findingsByOccurrence };

    const calendarVersionIds = [...new Set(normals.map((occurrence) => occurrence.academicCalendarVersionId))].sort();
    const segments = await tx.academicWeekSegment.findMany({
      where: { calendarVersionId: { in: calendarVersionIds } },
      select: { id: true, academicWeekId: true, calendarVersionId: true, segmentOrder: true, startDate: true, endDate: true },
      orderBy: [{ calendarVersionId: 'asc' }, { academicWeekId: 'asc' }, { segmentOrder: 'asc' }, { id: 'asc' }],
    });
    const segmentsByWeek = new Map<string, typeof segments>();
    for (const segment of segments) {
      const key = `${segment.calendarVersionId}:${segment.academicWeekId}`;
      segmentsByWeek.set(key, [...(segmentsByWeek.get(key) ?? []), segment]);
    }

    const groupMembers = new Map<string, NormalStructuralOccurrence[]>();
    for (const occurrence of normals) {
      const date = parseCivilDate(occurrence.civilDate);
      const matches = segments.filter((segment) => segment.calendarVersionId === occurrence.academicCalendarVersionId && segment.startDate <= date && segment.endDate >= date);
      if (matches.length === 0) {
        gapOccurrenceKeys.add(occurrence.occurrenceKey);
        plannedComponentByOccurrence.set(occurrence.occurrenceKey, null);
        continue;
      }
      if (matches.length > 1) {
        plannedComponentByOccurrence.set(occurrence.occurrenceKey, null);
        addRoutingFinding(occurrence.occurrenceKey, {
          severity: 'BLOCKER',
          code: 'PPCT_ALLOCATION_HISTORY_BLOCKED',
          occurrenceKey: occurrence.occurrenceKey,
          reason: 'ACADEMIC_WEEK_MEMBERSHIP_AMBIGUOUS',
          entityIds: matches.map((segment) => segment.id),
        });
        continue;
      }
      const segment = matches[0]!;
      const key = `${segment.calendarVersionId}:${segment.academicWeekId}`;
      groupMembers.set(key, [...(groupMembers.get(key) ?? []), occurrence]);
    }

    const groups: RoutingGroup[] = [];
    for (const [key, members] of groupMembers) {
      const weekSegments = segmentsByWeek.get(key) ?? [];
      if (!weekSegments.length) continue;
      const sortedSegments = [...weekSegments].sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.segmentOrder - b.segmentOrder || a.id.localeCompare(b.id));
      const [calendarVersionId, academicWeekId] = key.split(':');
      groups.push({
        key,
        calendarVersionId: calendarVersionId!,
        academicWeekId: academicWeekId!,
        envelopeStart: sortedSegments[0]!.startDate,
        envelopeEnd: sortedSegments[sortedSegments.length - 1]!.endDate,
        members: [...members].sort(compareNormalOccurrences),
      });
    }
    groups.sort((a, b) => a.envelopeStart.getTime() - b.envelopeStart.getTime() || a.key.localeCompare(b.key));
    if (!groups.length) return { plannedComponentByOccurrence, gapOccurrenceKeys, findingsByOccurrence };

    const overallStart = new Date(Math.min(...groups.map((group) => group.envelopeStart.getTime())));
    const overallEnd = new Date(Math.max(...groups.map((group) => group.envelopeEnd.getTime())));
    const associations = await tx.ppctClassAssociation.findMany({
      where: {
        academicYearId: input.academicYearId,
        schoolClassId: input.schoolClassId,
        subjectId: input.subjectId,
        effectiveFrom: { lte: overallEnd },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: overallStart } }],
      },
      select: { id: true, curricularProfile: true, effectiveFrom: true, effectiveUntil: true },
      orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
    });

    const calendarSplitSignatures = new Set<string>();
    for (let i = 0; i < groups.length; i += 1) {
      const left = groups[i]!;
      for (let j = i + 1; j < groups.length; j += 1) {
        const right = groups[j]!;
        if (right.envelopeStart > left.envelopeEnd) break;
        if (left.key === right.key || left.envelopeStart > right.envelopeEnd || right.envelopeStart > left.envelopeEnd) continue;
        const signature = [left.key, right.key].sort().join('|');
        if (calendarSplitSignatures.has(signature)) continue;
        calendarSplitSignatures.add(signature);
        const first = [...left.members, ...right.members].sort(compareNormalOccurrences)[0];
        if (!first) continue;
        addRoutingFinding(first.occurrenceKey, {
          severity: 'BLOCKER',
          code: 'PPCT_COMPONENT_WEEK_CALENDAR_SPLIT',
          occurrenceKey: first.occurrenceKey,
          entityIds: [left.calendarVersionId, left.academicWeekId, right.calendarVersionId, right.academicWeekId],
        });
      }
    }

    for (const group of groups) {
      const first = group.members[0];
      if (!first) continue;
      const overlapping = associations.filter(
        (association) => association.effectiveFrom <= group.envelopeEnd
          && (association.effectiveUntil === null || association.effectiveUntil >= group.envelopeStart),
      );
      const profiles = [...new Set(overlapping.map((association) => association.curricularProfile))];
      if (profiles.length === 0) {
        for (const member of group.members) plannedComponentByOccurrence.set(member.occurrenceKey, null);
        addRoutingFinding(first.occurrenceKey, {
          severity: 'BLOCKER',
          code: 'PPCT_ALLOCATION_HISTORY_BLOCKED',
          occurrenceKey: first.occurrenceKey,
          reason: 'CURRICULAR_PROFILE_CONTEXT_MISSING',
          entityIds: [group.academicWeekId],
        });
        continue;
      }
      if (profiles.length > 1) {
        for (const member of group.members) plannedComponentByOccurrence.set(member.occurrenceKey, null);
        addRoutingFinding(first.occurrenceKey, {
          severity: 'BLOCKER',
          code: 'PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT',
          occurrenceKey: first.occurrenceKey,
          entityIds: overlapping.map((association) => association.id),
        });
        continue;
      }

      const profile = profiles[0]!;
      if (profile === PpctClassCurricularProfile.CORE_PLUS_SPECIALIZED_STUDY && group.members.length === 1) {
        plannedComponentByOccurrence.set(first.occurrenceKey, null);
        addRoutingFinding(first.occurrenceKey, {
          severity: 'BLOCKER',
          code: 'PPCT_COMPONENT_WEEK_CAPACITY_INVALID',
          occurrenceKey: first.occurrenceKey,
          entityIds: [group.academicWeekId],
        });
        continue;
      }

      for (let index = 0; index < group.members.length; index += 1) {
        const member = group.members[index]!;
        const plannedComponent = profile === PpctClassCurricularProfile.CORE_PLUS_SPECIALIZED_STUDY && index === group.members.length - 1
          ? PpctCurricularComponent.SPECIALIZED_STUDY
          : PpctCurricularComponent.CORE;
        plannedComponentByOccurrence.set(member.occurrenceKey, plannedComponent);
      }
    }

    return { plannedComponentByOccurrence, gapOccurrenceKeys, findingsByOccurrence };
  }

  private async discoverCandidateDates(
    tx: Prisma.TransactionClient,
    input: ResolvePpctOccurrenceAllocationInput,
    through: Date,
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
      const end = entry.timetableVersion.effectiveUntil && entry.timetableVersion.effectiveUntil < through
        ? entry.timetableVersion.effectiveUntil
        : through;
      const cursor = new Date(entry.timetableVersion.effectiveFrom.getTime());
      const desired = WEEKDAYS.indexOf(entry.weekday);
      cursor.setUTCDate(cursor.getUTCDate() + (desired - cursor.getUTCDay() + 7) % 7);
      while (cursor <= end) {
        result.add(formatCivilDate(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    }
    return [...result].sort();
  }

  private async loadGraph(tx: Prisma.TransactionClient, planId: string): Promise<PpctPlanGraphV2> {
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
        id: version.id,
        ppctPlanId: version.ppctPlanId,
        versionNumber: version.versionNumber,
        status: version.status as PpctGraphVersionV2['status'],
        itemRevisions: version.itemRevisions.map((revision) => ({
          id: revision.id,
          ppctVersionId: revision.ppctVersionId,
          ppctPlanId: revision.ppctPlanId,
          ppctItemId: revision.ppctItemId,
          component: revision.component,
          sequence: revision.sequence,
          title: revision.title,
          lessonType: revision.lessonType,
        })),
      })),
      lineages: lineages.map((lineage) => ({
        id: lineage.id,
        ppctPlanId: lineage.ppctPlanId,
        component: lineage.component,
        predecessorVersionId: lineage.predecessorVersionId,
        predecessorItemId: lineage.predecessorItemId,
        successorVersionId: lineage.successorVersionId,
        successorItemId: lineage.successorItemId,
      })),
    };
  }
}
