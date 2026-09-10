import { PpctCurricularComponent } from '@prisma/client';
import { applyComponentVersionTransition, pendingComponentRevisions } from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation-v2.policy';
import { PpctPlanGraphV2 } from '../../src/ppct-occurrence-allocation/ppct-occurrence-allocation-v2.types';

function graph(): PpctPlanGraphV2 {
  return {
    planId: 'plan',
    versions: [
      {
        id: 'v1', ppctPlanId: 'plan', versionNumber: 1, status: 'SUPERSEDED',
        itemRevisions: [
          { id: 'ra', ppctVersionId: 'v1', ppctPlanId: 'plan', ppctItemId: 'A', component: PpctCurricularComponent.CORE, sequence: 1, title: 'A', lessonType: 'LESSON' },
          { id: 'rb', ppctVersionId: 'v1', ppctPlanId: 'plan', ppctItemId: 'B', component: PpctCurricularComponent.CORE, sequence: 2, title: 'B', lessonType: 'LESSON' },
          { id: 'rs', ppctVersionId: 'v1', ppctPlanId: 'plan', ppctItemId: 'S', component: PpctCurricularComponent.SPECIALIZED_STUDY, sequence: 1, title: 'S', lessonType: 'LESSON' },
        ],
      },
      {
        id: 'v2', ppctPlanId: 'plan', versionNumber: 2, status: 'PUBLISHED',
        itemRevisions: [
          { id: 'rm', ppctVersionId: 'v2', ppctPlanId: 'plan', ppctItemId: 'M', component: PpctCurricularComponent.CORE, sequence: 1, title: 'M', lessonType: 'LESSON' },
          { id: 'rx', ppctVersionId: 'v2', ppctPlanId: 'plan', ppctItemId: 'X', component: PpctCurricularComponent.CORE, sequence: 2, title: 'X', lessonType: 'LESSON' },
          { id: 'rs2', ppctVersionId: 'v2', ppctPlanId: 'plan', ppctItemId: 'S', component: PpctCurricularComponent.SPECIALIZED_STUDY, sequence: 1, title: 'S2', lessonType: 'LESSON' },
        ],
      },
    ],
    lineages: [],
  };
}

describe('P2-003 component-aware allocation policy', () => {
  it('keeps independent pending sequence spaces per component', () => {
    const g = graph(); const version = g.versions[0]!;
    expect(pendingComponentRevisions(version, new Set(), PpctCurricularComponent.CORE).map((x) => x.ppctItemId)).toEqual(['A', 'B']);
    expect(pendingComponentRevisions(version, new Set(), PpctCurricularComponent.SPECIALIZED_STUDY).map((x) => x.ppctItemId)).toEqual(['S']);
    expect(pendingComponentRevisions(version, new Set(['A']), PpctCurricularComponent.CORE).map((x) => x.ppctItemId)).toEqual(['B']);
    expect(pendingComponentRevisions(version, new Set(['A']), PpctCurricularComponent.SPECIALIZED_STUDY).map((x) => x.ppctItemId)).toEqual(['S']);
  });

  it('blocks a distributed split only in the lineage component', () => {
    const g = graph();
    g.versions[1]!.itemRevisions = [
      { id: 'rx1', ppctVersionId: 'v2', ppctPlanId: 'plan', ppctItemId: 'X1', component: PpctCurricularComponent.CORE, sequence: 1, title: 'X1', lessonType: 'LESSON' },
      { id: 'rx2', ppctVersionId: 'v2', ppctPlanId: 'plan', ppctItemId: 'X2', component: PpctCurricularComponent.CORE, sequence: 2, title: 'X2', lessonType: 'LESSON' },
      { id: 'rs2', ppctVersionId: 'v2', ppctPlanId: 'plan', ppctItemId: 'S', component: PpctCurricularComponent.SPECIALIZED_STUDY, sequence: 1, title: 'S2', lessonType: 'LESSON' },
    ];
    g.lineages = [
      { id: 'e1', ppctPlanId: 'plan', component: PpctCurricularComponent.CORE, predecessorVersionId: 'v1', predecessorItemId: 'A', successorVersionId: 'v2', successorItemId: 'X1' },
      { id: 'e2', ppctPlanId: 'plan', component: PpctCurricularComponent.CORE, predecessorVersionId: 'v1', predecessorItemId: 'A', successorVersionId: 'v2', successorItemId: 'X2' },
    ];
    expect(applyComponentVersionTransition(g, g.versions[1]!, new Set(['A']), PpctCurricularComponent.CORE)?.code).toBe('PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION');
    expect(applyComponentVersionTransition(g, g.versions[1]!, new Set(['S']), PpctCurricularComponent.SPECIALIZED_STUDY)).toBeNull();
  });

  it('derives all-covered merge credit within CORE without touching SPECIALIZED_STUDY', () => {
    const g = graph();
    g.versions[1]!.itemRevisions = [
      { id: 'rm', ppctVersionId: 'v2', ppctPlanId: 'plan', ppctItemId: 'M', component: PpctCurricularComponent.CORE, sequence: 1, title: 'M', lessonType: 'LESSON' },
      { id: 'rs2', ppctVersionId: 'v2', ppctPlanId: 'plan', ppctItemId: 'S', component: PpctCurricularComponent.SPECIALIZED_STUDY, sequence: 1, title: 'S2', lessonType: 'LESSON' },
    ];
    g.lineages = [
      { id: 'e1', ppctPlanId: 'plan', component: PpctCurricularComponent.CORE, predecessorVersionId: 'v1', predecessorItemId: 'A', successorVersionId: 'v2', successorItemId: 'M' },
      { id: 'e2', ppctPlanId: 'plan', component: PpctCurricularComponent.CORE, predecessorVersionId: 'v1', predecessorItemId: 'B', successorVersionId: 'v2', successorItemId: 'M' },
    ];
    const coreCovered = new Set(['A', 'B']);
    const specializedCovered = new Set(['S']);
    expect(applyComponentVersionTransition(g, g.versions[1]!, coreCovered, PpctCurricularComponent.CORE)).toBeNull();
    expect(coreCovered.has('M')).toBe(true);
    expect(applyComponentVersionTransition(g, g.versions[1]!, specializedCovered, PpctCurricularComponent.SPECIALIZED_STUDY)).toBeNull();
    expect([...specializedCovered]).toEqual(['S']);
  });
});
