import { NormalStructuralOccurrence } from '../resolved-occurrences/resolved-occurrence.types';
import { CivilDateString } from '@baogiang/contracts';
import {
  AllocationEffect,
  DirectDistributionObligation,
  PpctGraphLineage,
  PpctGraphVersion,
  PpctPlanGraph,
  TransitionBlocker,
} from './ppct-occurrence-allocation.types';

export interface ConsumptionDecision { effect: AllocationEffect; reason: string; }
export interface HistoryPosition { civilDate: CivilDateString; startTime: string; endTime: string; occurrenceKey: string; }

export function historyPositionForNormal(occurrence: NormalStructuralOccurrence): HistoryPosition {
  return { civilDate: occurrence.civilDate, startTime: occurrence.timeSlot.startTime, endTime: occurrence.timeSlot.endTime, occurrenceKey: occurrence.occurrenceKey };
}

export function historyPositionAtDateStart(civilDate: CivilDateString): HistoryPosition {
  return { civilDate, startTime: '', endTime: '', occurrenceKey: '' };
}

export function compareHistoryPositions(a: HistoryPosition, b: HistoryPosition): number {
  return a.civilDate.localeCompare(b.civilDate)
    || a.startTime.localeCompare(b.startTime)
    || a.endTime.localeCompare(b.endTime)
    || a.occurrenceKey.localeCompare(b.occurrenceKey);
}

export function consumptionDecision(occurrence: NormalStructuralOccurrence): ConsumptionDecision {
  if (occurrence.effectiveKind === 'BASE_TIMETABLE') return { effect: 'CONSUMES_NEXT_ITEM', reason: 'BASE_TIMETABLE' };
  if (occurrence.effectiveKind === 'CALENDAR_INTERRUPTION') return { effect: 'DOES_NOT_CONSUME_ITEM', reason: 'CALENDAR_INTERRUPTION' };
  if (occurrence.effectiveKind === 'CALENDAR_EXCEPTION') return { effect: 'DOES_NOT_CONSUME_ITEM', reason: 'CALENDAR_EXCEPTION' };
  if (occurrence.effectiveKind === 'SPECIAL_ACTIVITY_SUPPRESSED') return { effect: 'DOES_NOT_CONSUME_ITEM', reason: 'SPECIAL_ACTIVITY_SUPPRESSED' };
  const disposition = occurrence.disposition?.dispositionType;
  if (disposition === 'AUTHORIZED_CANCELLATION') return { effect: 'DOES_NOT_CONSUME_ITEM', reason: disposition };
  if (disposition === 'ABSENCE_NO_REPLACEMENT' || disposition === 'SAME_SUBJECT_SUBSTITUTION' || disposition === 'DIFFERENT_SUBJECT_SUPERVISION') {
    return { effect: 'CONSUMES_NEXT_ITEM', reason: disposition };
  }
  return { effect: 'DOES_NOT_CONSUME_ITEM', reason: 'OPERATIONAL_DISPOSITION_INVALID' };
}

export function distributionObligationKey(value: Pick<DirectDistributionObligation,
  'academicYearId' | 'schoolClassId' | 'subjectId' | 'normalOccurrenceKey' | 'ppctClassAssociationId' | 'ppctVersionId' | 'ppctItemId'>): string {
  return `PPCT_DISTRIBUTION:${value.academicYearId}:${value.schoolClassId}:${value.subjectId}:${value.normalOccurrenceKey}:${value.ppctClassAssociationId}:${value.ppctVersionId}:${value.ppctItemId}`;
}

export function compareNormalOccurrences(a: NormalStructuralOccurrence, b: NormalStructuralOccurrence): number {
  return compareHistoryPositions(historyPositionForNormal(a), historyPositionForNormal(b));
}

export function consumingOverlapKeys(occurrences: NormalStructuralOccurrence[]): Set<string> {
  const ambiguous = new Set<string>();
  for (let i = 0; i < occurrences.length; i += 1) {
    const a = occurrences[i]!;
    if (consumptionDecision(a).effect !== 'CONSUMES_NEXT_ITEM') continue;
    for (let j = i + 1; j < occurrences.length; j += 1) {
      const b = occurrences[j]!;
      if (b.civilDate !== a.civilDate || b.timeSlot.startTime >= a.timeSlot.endTime) break;
      if (consumptionDecision(b).effect === 'CONSUMES_NEXT_ITEM' && a.timeSlot.startTime < b.timeSlot.endTime && b.timeSlot.startTime < a.timeSlot.endTime) {
        ambiguous.add(a.occurrenceKey); ambiguous.add(b.occurrenceKey);
      }
    }
  }
  return ambiguous;
}

const authoritative = (version: PpctGraphVersion | undefined): version is PpctGraphVersion => Boolean(version && version.status !== 'DRAFT');

function connectedComponents(edges: PpctGraphLineage[]): PpctGraphLineage[][] {
  const remaining = new Set(edges.map((edge) => edge.id));
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  const components: PpctGraphLineage[][] = [];
  while (remaining.size) {
    const first = [...remaining].sort()[0]!; const queue = [first]; const component: PpctGraphLineage[] = []; remaining.delete(first);
    while (queue.length) {
      const edge = byId.get(queue.shift()!)!; component.push(edge);
      for (const candidateId of [...remaining]) {
        const candidate = byId.get(candidateId)!;
        if (candidate.predecessorItemId === edge.predecessorItemId || candidate.successorItemId === edge.successorItemId) {
          remaining.delete(candidateId); queue.push(candidateId);
        }
      }
    }
    components.push(component.sort((a, b) => a.id.localeCompare(b.id)));
  }
  return components;
}

export function applyVersionTransition(graph: PpctPlanGraph, target: PpctGraphVersion, covered: Set<string>): TransitionBlocker | null {
  const versions = new Map(graph.versions.map((version) => [version.id, version]));
  const incoming = graph.lineages.filter((edge) => edge.successorVersionId === target.id).sort((a, b) => a.id.localeCompare(b.id));
  const targetItems = new Set(target.itemRevisions.map((revision) => revision.ppctItemId));
  for (const edge of incoming) {
    const predecessor = versions.get(edge.predecessorVersionId);
    const successorExists = target.itemRevisions.some((revision) => revision.ppctItemId === edge.successorItemId);
    const predecessorExists = predecessor?.itemRevisions.some((revision) => revision.ppctItemId === edge.predecessorItemId);
    if (edge.ppctPlanId !== graph.planId || edge.successorVersionId !== target.id || !successorExists || !authoritative(predecessor) || predecessor.ppctPlanId !== graph.planId || !predecessorExists || predecessor.versionNumber >= target.versionNumber) {
      return { code: 'PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS', reason: 'MALFORMED_LINEAGE_PREDECESSOR', entityIds: [edge.id] };
    }
    const successorPriorHistory = graph.versions.some((version) => version.status !== 'DRAFT' && version.versionNumber < target.versionNumber && version.itemRevisions.some((revision) => revision.ppctItemId === edge.successorItemId));
    if (successorPriorHistory) return { code: 'PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS', reason: 'IMPERMISSIBLE_SUCCESSOR_HISTORY', entityIds: [edge.id, edge.successorItemId].sort() };
  }
  const lineagePredecessors = new Set(incoming.map((edge) => edge.predecessorItemId));
  const mixed = [...lineagePredecessors].filter((itemId) => targetItems.has(itemId)).sort();
  if (mixed.length) return { code: 'PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS', reason: 'MIXED_CARRY_FORWARD_AND_LINEAGE', entityIds: mixed };
  for (const component of connectedComponents(incoming)) {
    const predecessors = [...new Set(component.map((edge) => edge.predecessorItemId))].sort();
    const successors = [...new Set(component.map((edge) => edge.successorItemId))].sort();
    if (predecessors.length > 1 && successors.length > 1) return { code: 'PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS', reason: 'MANY_TO_MANY_LINEAGE', entityIds: component.map((edge) => edge.id).sort() };
    if (predecessors.length === 1 && successors.length > 1 && covered.has(predecessors[0]!)) {
      return { code: 'PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION', entityIds: [predecessors[0]!, ...successors].sort() };
    }
    if (predecessors.length > 1 && successors.length === 1) {
      const coveredCount = predecessors.filter((itemId) => covered.has(itemId)).length;
      if (coveredCount > 0 && coveredCount < predecessors.length) return { code: 'PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION', entityIds: [...predecessors, successors[0]!].sort() };
      if (coveredCount === predecessors.length) covered.add(successors[0]!);
    }
  }
  return null;
}

export function pendingRevisions(version: PpctGraphVersion, covered: ReadonlySet<string>) {
  return version.itemRevisions.filter((revision) => !covered.has(revision.ppctItemId))
    .sort((a, b) => a.sequence - b.sequence || a.ppctItemId.localeCompare(b.ppctItemId) || a.id.localeCompare(b.id));
}
