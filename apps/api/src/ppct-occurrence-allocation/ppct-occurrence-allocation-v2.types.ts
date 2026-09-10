import { PpctCurricularComponent } from '@prisma/client';
import { CivilDateString } from '@baogiang/contracts';
import { NormalStructuralOccurrence } from '../resolved-occurrences/resolved-occurrence.types';
import {
  AllocationEffect,
  AllocationStatus,
  ExpectedPpctItem,
  MakeupSourceMatchStatus,
  PpctAllocationFindingCode,
  ResolvePpctOccurrenceAllocationInput,
} from './ppct-occurrence-allocation.types';

export const PPCT_OCCURRENCE_ALLOCATION_PROFILE_V2 = 'PPCT_OCCURRENCE_ALLOCATION_V2' as const;

export interface ComponentExpectedPpctItem extends ExpectedPpctItem {
  component: PpctCurricularComponent;
}

export interface ComponentNormalPpctAllocation {
  occurrence: NormalStructuralOccurrence;
  plannedComponent: PpctCurricularComponent | null;
  allocationEffect: AllocationEffect;
  allocationReason: string;
  allocationStatus: AllocationStatus;
  expectedPpctItem: ComponentExpectedPpctItem | null;
}

export interface ComponentMakeupSourceMatch {
  occurrenceKey: string;
  makeupTeachingScheduleId: string;
  targetCivilDate: CivilDateString;
  targetSlotStartTime: string;
  sourceNormalOccurrenceKey: string;
  status: MakeupSourceMatchStatus;
  expectedPpctItem: ComponentExpectedPpctItem | null;
}

export type PpctAllocationV2FindingCode =
  | PpctAllocationFindingCode
  | 'PPCT_COMPONENT_WEEK_CAPACITY_INVALID'
  | 'PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT'
  | 'PPCT_COMPONENT_WEEK_CALENDAR_SPLIT';

export interface PpctAllocationV2Finding {
  severity: 'BLOCKER';
  code: PpctAllocationV2FindingCode;
  occurrenceKey: string | null;
  reason?: string;
  entityIds: string[];
  component?: PpctCurricularComponent;
}

export interface PpctOccurrenceAllocationV2Result {
  profile: typeof PPCT_OCCURRENCE_ALLOCATION_PROFILE_V2;
  scope: ResolvePpctOccurrenceAllocationInput;
  status: 'PASS' | 'BLOCKED';
  replayOrigin: CivilDateString | null;
  coverage: {
    ppctItemAllocation: 'ASSESSED';
    teachingExecution: 'NOT_ASSESSED';
    completion: 'NOT_ASSESSED';
    debt: 'NOT_ASSESSED';
    reporting: 'NOT_ASSESSED';
  };
  normalAllocations: ComponentNormalPpctAllocation[];
  makeupSourceMatches: ComponentMakeupSourceMatch[];
  findings: PpctAllocationV2Finding[];
  evaluatedAt: string;
}

export interface ComponentDirectDistributionObligation extends ComponentExpectedPpctItem {
  academicYearId: string;
  schoolClassId: string;
  subjectId: string;
  normalOccurrenceKey: string;
}

export interface PpctGraphItemRevisionV2 {
  id: string;
  ppctVersionId: string;
  ppctPlanId: string;
  ppctItemId: string;
  component: PpctCurricularComponent;
  sequence: number;
  title: string;
  lessonType: string;
}

export interface PpctGraphVersionV2 {
  id: string;
  ppctPlanId: string;
  versionNumber: number;
  status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  itemRevisions: PpctGraphItemRevisionV2[];
}

export interface PpctGraphLineageV2 {
  id: string;
  ppctPlanId: string;
  component: PpctCurricularComponent;
  predecessorVersionId: string;
  predecessorItemId: string;
  successorVersionId: string;
  successorItemId: string;
}

export interface PpctPlanGraphV2 {
  planId: string;
  versions: PpctGraphVersionV2[];
  lineages: PpctGraphLineageV2[];
}

export interface ComponentTransitionBlocker {
  code:
    | 'PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION'
    | 'PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION'
    | 'PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS';
  reason?: string;
  entityIds: string[];
}
