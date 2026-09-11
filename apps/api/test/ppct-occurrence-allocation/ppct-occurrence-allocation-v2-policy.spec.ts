import {
  applyVersionTransitionV2,
  pendingRevisionsV2,
} from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation.policy';
import {
  PpctGraphItemRevision,
  PpctGraphLineage,
  PpctGraphVersion,
  PpctPlanGraph,
} from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation.types';

function revision(
  ppctVersionId: string,
  ppctItemId: string,
  sequence: number,
  component: 'CORE' | 'SPECIALIZED_STUDY',
): PpctGraphItemRevision {
  return {
    id: `${ppctVersionId}-${ppctItemId}`,
    ppctVersionId,
    ppctPlanId: 'plan-1',
    ppctItemId,
    sequence,
    title: ppctItemId,
    lessonType: 'LESSON',
    component,
  };
}

function version(
  id: string,
  versionNumber: number,
  coreItems: string[],
  specializedItems: string[] = [],
  status: PpctGraphVersion['status'] = 'PUBLISHED',
): PpctGraphVersion {
  const itemRevisions: PpctGraphItemRevision[] = [
    ...coreItems.map((idStr, idx) => revision(id, idStr, idx + 1, 'CORE')),
    ...specializedItems.map((idStr, idx) => revision(id, idStr, idx + 1, 'SPECIALIZED_STUDY')),
  ];
  return {
    id,
    ppctPlanId: 'plan-1',
    versionNumber,
    status,
    itemRevisions,
  };
}

const edge = (
  id: string,
  predecessorVersionId: string,
  predecessorItemId: string,
  successorVersionId: string,
  successorItemId: string,
  component: 'CORE' | 'SPECIALIZED_STUDY' = 'CORE',
): PpctGraphLineage => ({
  id,
  ppctPlanId: 'plan-1',
  predecessorVersionId,
  predecessorItemId,
  successorVersionId,
  successorItemId,
  component,
});

const graph = (versions: PpctGraphVersion[], lineages: PpctGraphLineage[] = []): PpctPlanGraph => ({
  planId: 'plan-1',
  versions,
  lineages,
});

describe('PPCT Allocator V2 Policy Unit Tests', () => {
  describe('pendingRevisionsV2', () => {
    const v = version('v1', 1, ['c1', 'c2', 'c3'], ['s1', 's2']);

    it('returns only CORE items for CORE component sorted by sequence', () => {
      const covered = new Set<string>(['c1']);
      const pending = pendingRevisionsV2(v, 'CORE', covered);
      expect(pending.map((r) => r.ppctItemId)).toEqual(['c2', 'c3']);
      expect(pending.every((r) => r.component === 'CORE')).toBe(true);
    });

    it('returns only SPECIALIZED_STUDY items for SPECIALIZED_STUDY component', () => {
      const covered = new Set<string>();
      const pending = pendingRevisionsV2(v, 'SPECIALIZED_STUDY', covered);
      expect(pending.map((r) => r.ppctItemId)).toEqual(['s1', 's2']);
      expect(pending.every((r) => r.component === 'SPECIALIZED_STUDY')).toBe(true);
    });

    it('returns empty when component is exhausted without touching the other component', () => {
      const coveredSpecialized = new Set<string>(['s1', 's2']);
      const pending = pendingRevisionsV2(v, 'SPECIALIZED_STUDY', coveredSpecialized);
      expect(pending).toHaveLength(0);

      // CORE still has items
      const pendingCore = pendingRevisionsV2(v, 'CORE', new Set());
      expect(pendingCore).toHaveLength(3);
    });
  });

  describe('applyVersionTransitionV2', () => {
    it('detects and rejects cross-component lineage edges (fail-closed)', () => {
      const v1 = version('v1', 1, ['c1'], ['s1']);
      const v2 = version('v2', 2, ['c1'], ['s2']);
      // Invalid edge attempting to link CORE c1 to SPECIALIZED s2
      const crossEdge = edge('e1', 'v1', 'c1', 'v2', 's2', 'CORE');
      const g = graph([v1, v2], [crossEdge]);
      const covered = { CORE: new Set<string>(), SPECIALIZED_STUDY: new Set<string>() };

      const blocker = applyVersionTransitionV2(g, v2, covered);
      expect(blocker).toEqual({
        code: 'PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS',
        reason: 'CROSS_COMPONENT_LINEAGE',
        entityIds: ['e1'],
      });
    });

    it('carries forward covered items component-independently', () => {
      const v1 = version('v1', 1, ['c1', 'c2'], ['s1', 's2']);
      const v2 = version('v2', 2, ['c1', 'c2'], ['s1', 's2']);
      const g = graph([v1, v2]);
      const covered = {
        CORE: new Set<string>(['c1']),
        SPECIALIZED_STUDY: new Set<string>(['s1']),
      };

      const blocker = applyVersionTransitionV2(g, v2, covered);
      expect(blocker).toBeNull();
      expect(covered.CORE.has('c1')).toBe(true);
      expect(covered.SPECIALIZED_STUDY.has('s1')).toBe(true);
    });

    it('blocks 1-to-many split after distribution within SPECIALIZED_STUDY without affecting CORE', () => {
      const v1 = version('v1', 1, ['c1'], ['s1']);
      const v2 = version('v2', 2, ['c1'], ['s2a', 's2b']);
      const edges = [
        edge('e1', 'v1', 's1', 'v2', 's2a', 'SPECIALIZED_STUDY'),
        edge('e2', 'v1', 's1', 'v2', 's2b', 'SPECIALIZED_STUDY'),
      ];
      const g = graph([v1, v2], edges);
      const covered = {
        CORE: new Set<string>(),
        SPECIALIZED_STUDY: new Set<string>(['s1']), // s1 already distributed
      };

      const blocker = applyVersionTransitionV2(g, v2, covered);
      expect(blocker).toEqual({
        code: 'PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION',
        entityIds: ['s1', 's2a', 's2b'],
      });
    });

    it('blocks partial merge in CORE without affecting SPECIALIZED_STUDY', () => {
      const v1 = version('v1', 1, ['c1', 'c2'], ['s1']);
      const v2 = version('v2', 2, ['c_merged'], ['s1']);
      const edges = [
        edge('e1', 'v1', 'c1', 'v2', 'c_merged', 'CORE'),
        edge('e2', 'v1', 'c2', 'v2', 'c_merged', 'CORE'),
      ];
      const g = graph([v1, v2], edges);
      const covered = {
        CORE: new Set<string>(['c1']), // c1 covered, but c2 NOT covered
        SPECIALIZED_STUDY: new Set<string>(),
      };

      const blocker = applyVersionTransitionV2(g, v2, covered);
      expect(blocker).toEqual({
        code: 'PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION',
        entityIds: ['c1', 'c2', 'c_merged'],
      });
    });

    it('successfully credits all-covered merge in CORE', () => {
      const v1 = version('v1', 1, ['c1', 'c2'], ['s1']);
      const v2 = version('v2', 2, ['c_merged'], ['s1']);
      const edges = [
        edge('e1', 'v1', 'c1', 'v2', 'c_merged', 'CORE'),
        edge('e2', 'v1', 'c2', 'v2', 'c_merged', 'CORE'),
      ];
      const g = graph([v1, v2], edges);
      const covered = {
        CORE: new Set<string>(['c1', 'c2']), // both covered
        SPECIALIZED_STUDY: new Set<string>(),
      };

      const blocker = applyVersionTransitionV2(g, v2, covered);
      expect(blocker).toBeNull();
      expect(covered.CORE.has('c_merged')).toBe(true);
    });
  });
});
