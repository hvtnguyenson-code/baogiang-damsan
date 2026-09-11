import { CivilDateString, PpctCurricularComponent } from '@baogiang/contracts';
import { NormalStructuralOccurrence, StructuralOccurrenceFindingCode } from '../resolved-occurrences/resolved-occurrence.types';

export const PPCT_OCCURRENCE_ALLOCATION_PROFILE = 'PPCT_OCCURRENCE_ALLOCATION_V1' as const;
export const PPCT_OCCURRENCE_ALLOCATION_PROFILE_V2 = 'PPCT_OCCURRENCE_ALLOCATION_V2' as const;
export type PpctOccurrenceAllocationProfile =
  | typeof PPCT_OCCURRENCE_ALLOCATION_PROFILE
  | typeof PPCT_OCCURRENCE_ALLOCATION_PROFILE_V2;

export interface ResolvePpctOccurrenceAllocationInput {
  academicYearId: string;
  schoolClassId: string;
  subjectId: string;
  throughCivilDate: CivilDateString;
}

export type AllocationEffect = 'CONSUMES_NEXT_ITEM' | 'DOES_NOT_CONSUME_ITEM';
export type AllocationStatus = 'ALLOCATED' | 'NOT_CONSUMED' | 'BLOCKED';
export type MakeupSourceMatchStatus = 'MATCH' | 'MISMATCH' | 'NOT_ASSESSED_HISTORY_BLOCKED';

export interface ExpectedPpctItem {
  distributionObligationKey: string;
  ppctClassAssociationId: string;
  ppctPlanId: string;
  ppctVersionId: string;
  ppctItemId: string;
  ppctItemRevisionId: string;
  sequence: number;
  title: string;
  lessonType: string;
  component?: PpctCurricularComponent;
}

export interface NormalPpctAllocation {
  occurrence: NormalStructuralOccurrence;
  allocationEffect: AllocationEffect;
  allocationReason: string;
  allocationStatus: AllocationStatus;
  expectedPpctItem: ExpectedPpctItem | null;
  plannedComponent?: PpctCurricularComponent | null;
}

export interface MakeupSourceMatch {
  occurrenceKey: string;
  makeupTeachingScheduleId: string;
  targetCivilDate: CivilDateString;
  targetSlotStartTime: string;
  sourceNormalOccurrenceKey: string;
  status: MakeupSourceMatchStatus;
  expectedPpctItem: ExpectedPpctItem | null;
}

export type PpctAllocationFindingCode =
  | StructuralOccurrenceFindingCode
  | 'PPCT_ALLOCATION_EXHAUSTED'
  | 'PPCT_ALLOCATION_OCCURRENCE_ORDER_AMBIGUOUS'
  | 'PPCT_ALLOCATION_HISTORY_BLOCKED'
  | 'PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION'
  | 'PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION'
  | 'PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS'
  | 'PPCT_MAKEUP_SOURCE_ALLOCATION_MISMATCH'
  | 'PPCT_COMPONENT_WEEK_CAPACITY_INVALID'
  | 'PPCT_COMPONENT_WEEK_CALENDAR_SPLIT'
  | 'PPCT_COMPONENT_APPLICABILITY_WEEK_SPLIT';

export interface PpctAllocationFinding {
  severity: 'BLOCKER';
  code: PpctAllocationFindingCode;
  occurrenceKey: string | null;
  reason?: string;
  entityIds: string[];
  component?: PpctCurricularComponent;
}

export interface PpctOccurrenceAllocationResult {
  profile: PpctOccurrenceAllocationProfile;
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
  normalAllocations: NormalPpctAllocation[];
  makeupSourceMatches: MakeupSourceMatch[];
  findings: PpctAllocationFinding[];
  evaluatedAt: string;
}

export interface DirectDistributionObligation extends ExpectedPpctItem {
  academicYearId: string;
  schoolClassId: string;
  subjectId: string;
  normalOccurrenceKey: string;
}

export interface PpctGraphItemRevision {
  id: string;
  ppctVersionId: string;
  ppctPlanId: string;
  ppctItemId: string;
  sequence: number;
  title: string;
  lessonType: string;
  component?: PpctCurricularComponent;
}

export interface PpctGraphVersion {
  id: string;
  ppctPlanId: string;
  versionNumber: number;
  status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  itemRevisions: PpctGraphItemRevision[];
}

export interface PpctGraphLineage {
  id: string;
  ppctPlanId: string;
  predecessorVersionId: string;
  predecessorItemId: string;
  successorVersionId: string;
  successorItemId: string;
  component?: PpctCurricularComponent;
}

export interface PpctPlanGraph {
  planId: string;
  versions: PpctGraphVersion[];
  lineages: PpctGraphLineage[];
}

export interface TransitionBlocker {
  code: Extract<PpctAllocationFindingCode,
    | 'PPCT_VERSION_TRANSITION_SPLIT_AFTER_DISTRIBUTION'
    | 'PPCT_VERSION_TRANSITION_MERGE_PARTIAL_DISTRIBUTION'
    | 'PPCT_VERSION_TRANSITION_LINEAGE_AMBIGUOUS'>;
  reason?: string;
  entityIds: string[];
}
