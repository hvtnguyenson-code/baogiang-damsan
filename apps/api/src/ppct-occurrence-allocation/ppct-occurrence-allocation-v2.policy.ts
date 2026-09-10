import { PpctCurricularComponent } from '@prisma/client';
import {
  ComponentTransitionBlocker,
  PpctGraphLineageV2,
  PpctGraphVersionV2,
  PpctPlanGraphV2,
} from './ppct-occurrence-allocation-v2.types';

const authoritative = (version: PpctGraphVersionV2 | undefined): version is PpctGraphVersionV2 => Boolean(version && version.status !== 'DRAFT');

function connectedComponents(edges: PpctGraphLineageV2[]): PpctGraphLineageV2[][] {
  const remaining = new Set(edges.map((edge) => edge.id));
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  const components: PpctGraphLineageV2[][] = [];
  while (remaining.size) {
    const first = [...remaining].sort()[0]!;
    const queue = [first];
    const component: PpctGraphLineageV2[] = [];
    remaining.delete(first);
    while (queue.length) {
      const edge = byId.get(queue.shift()!)!;
      component.push(edge);
      for (const candidateId of [...remaining]) {
        const candidate = byId.get(candidateId)!;
        if (candidate.predecessorItemId === edge.predecessorItemId || candidate.successorItemId === edge.successorItemId) {
          remaining.delete(candidateId);
          queue.push(candidateId);
        }
      }
    }
    components.push(component.sort((a, b) => a.id.localeCompare(b.id)));
  }
  return components;
}

export function applyComponentVersionTransition(
  graph: PpctPlanGraphV2,
  target: PpctGraphVersionV2,
  covered: Set<string>,
  curricularComponent: PpctCurricularComponent,
): ComponentTransitionBlocker | null {
  const versions = new Map(graph.versions.map((version) => [version.id, version]));
  const incoming = graph.lineages
    .filter((edge) => edge.successorVersionId === target.id && edge.component === curricularComponent)
    .sort((a, b) => a.id.localeCompare(b.id));
  const targetItems = new Set(
    target.itemRevisions
      .filter((revision) => revision.component === curricularComponent)
      .map((revision) => revision.ppctItemId),
  );

  for (const edge of incoming) {
    const predecessor = versions.get(edge.predecessorVersionId);
    const successorExists = target.itemRevisions.some(
      (revision) => revision.component === curricularComponent && revision.ppctItemId === edge.successorItemId,
    );
    const predecessorExists = predecessor?.itemRevisions.some(
      (revision) => revision.component === curricularComponent && revision.ppctItemId === edge.predecessorItemId,
    );
    if (
      edge.ppctPlanId !== graph.planId
      || edge.successorVersionId !== target.id
      || edge.component !== curricularComponent
      || !successorExists
      || !authoritative(predecessor)
      || predecessor.ppctPlanId !== graph.planId
      || !predecessorExists
      || predecessor.versionNumber >= target.versionNumber
    ) {
      return { code: 'PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS', reason: 'MALFORMED_LINEAGE_PREDECESSOR', entityIds: [edge.id] };
    }
    const successorPriorHistory = graph.versions.some(
      (version) => version.status !== 'DRAFT'
        && version.versionNumber < target.versionNumber
        && version.itemRevisions.some(
          (revision) => revision.component === curricularComponent && revision.ppctItemId === edge.successorItemId,
        ),
    );
    if (successorPriorHistory) {
      return {
        code: 'PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS',
        reason: 'IMPERMISSIBLE_SUCCESSOR_HISTORY',
        entityIds: [edge.id, edge.successorItemId].sort(),
      };
    }
  }

  const lineagePredecessors = new Set(incoming.map((edge) => edge.predecessorItemId));
  const mixed = [...lineagePredecessors].filter((itemId) => targetItems.has(itemId)).sort();
  if (mixed.length) {
    return { code: 'PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS', reason: 'MIXED_CARRY_FORWARD_AND_LINEAGE', entityIds: mixed };
  }

  for (const component of connectedComponents(incoming)) {
    const predecessors = [...new Set(component.map((edge) => edge.predecessorItemId))].sort();
    const successors = [...new Set(component.map((edge) => edge.successorItemId))].sort();
    if (predecessors.length > 1 && successors.length > 1) {
      return {
        code: 'PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS',
        reason: 'MANY_TO_MANY_LINEAGE',
        entityIds: component.map((edge) => edge.id).sort(),
      };
    }
    if (predecessors.length === 1 && successors.length > 1 && covered.has(predecessors[0]!)) {
      return {
        code: 'PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION',
        entityIds: [predecessors[0]!, ...successors].sort(),
      };
    }
    if (predecessors.length > 1 && successors.length === 1) {
      const coveredCount = predecessors.filter((itemId) => covered.has(itemId)).length;
      if (coveredCount > 0 && coveredCount < predecessors.length) {
        return {
          code: 'PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION',
          entityIds: [...predecessors, successors[0]!].sort(),
        };
      }
      if (coveredCount === predecessors.length) covered.add(successors[0]!);
    }
  }
  return null;
}

export function pendingComponentRevisions(
  version: PpctGraphVersionV2,
  covered: ReadonlySet<string>,
  component: PpctCurricularComponent,
) {
  return version.itemRevisions
    .filter((revision) => revision.component === component && !covered.has(revision.ppctItemId))
    .sort((a, b) => a.sequence - b.sequence || a.ppctItemId.localeCompare(b.ppctItemId) || a.id.localeCompare(b.id));
}
