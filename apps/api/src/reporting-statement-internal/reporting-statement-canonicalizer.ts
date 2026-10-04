import { createHash } from "crypto";
import { BadRequestException } from "@nestjs/common";
import { isCivilDate } from "../common/validation/civil-date";
import {
  PersonalReportingProjection,
  PersonalReportingSection,
  PersonalResponsibilityInterval,
} from "../personal-reporting-projection/personal-reporting-projection.types";

export const REPORTING_STATEMENT_SNAPSHOT_V1 = "REPORTING_STATEMENT_SNAPSHOT_V1" as const;
export const REPORTING_STATEMENT_SNAPSHOT_V2 = "REPORTING_STATEMENT_SNAPSHOT_V2" as const;
export const REPORTING_STATEMENT_SNAPSHOT_V3 = "REPORTING_STATEMENT_SNAPSHOT_V3" as const;
export const REPORTING_STATEMENT_SNAPSHOT_V4 = "REPORTING_STATEMENT_SNAPSHOT_V4" as const;
export const REPORTING_STATEMENT_SERIALIZER_V1 = "REPORTING_STATEMENT_CANONICAL_JSON_V1" as const;

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export interface SpecialProgrammeWorkloadAttestationEvidenceSnapshot {
  readonly attestationId: string;
  readonly attestedByUserId: string;
  readonly authorityType: string;
  readonly capabilityKey: string;
  readonly scope: string;
  readonly resourceId: string | null;
  readonly attestedAt: string;
}

export interface SpecialProgrammeWorkloadContributionSnapshot {
  readonly executionId: string;
  readonly specialActivityId: string;
  readonly specialActivityStaffingId: string;
  readonly specialActivityTimeSlotId: string;
  readonly programmeMasterId: string;
  readonly programmePlanVersionId: string;
  readonly programmeTopicItemId: string;
  readonly plannedProgrammeOccurrenceId: string;
  readonly plannedOccurrenceSlotId: string;
  readonly programmeKind: string;
  readonly occurrenceMode: string;
  readonly executionCivilDate: string;
  readonly actualTeacherUserId: string;
  readonly coefficient: number;
  readonly credit: number;
  readonly policyVersionId: string;
  readonly policyValidatorVersion: string;
  readonly policyEffectiveFrom?: string;
  readonly policyEffectiveUntil?: string | null;
  readonly attestations: readonly SpecialProgrammeWorkloadAttestationEvidenceSnapshot[];
}

export interface SpecialProgrammeWorkloadPendingConfirmationSnapshot {
  readonly executionId: string;
  readonly specialActivityId: string;
  readonly specialActivityStaffingId: string;
  readonly specialActivityTimeSlotId: string;
  readonly programmeMasterId: string;
  readonly programmePlanVersionId: string;
  readonly programmeTopicItemId: string;
  readonly plannedProgrammeOccurrenceId: string;
  readonly plannedOccurrenceSlotId: string;
  readonly programmeKind: string;
  readonly occurrenceMode: string;
  readonly executionCivilDate: string;
  readonly actualTeacherUserId: string;
  readonly reason: string;
}

export interface SpecialProgrammeWorkloadSnapshot {
  readonly projectionProfile: string;
  readonly status: "PASS";
  readonly totalCredit: number;
  readonly contributionCount: number;
  readonly contributions: readonly SpecialProgrammeWorkloadContributionSnapshot[];
  readonly pendingConfirmation: readonly SpecialProgrammeWorkloadPendingConfirmationSnapshot[];
  readonly evaluatedAt: string;
}

export interface ReportingStatementSnapshotCommon {
  readonly serializerVersion: typeof REPORTING_STATEMENT_SERIALIZER_V1;
  readonly statementProfile: string;
  readonly submitterUserId: string;
  readonly submitterDisplayNameSnapshot: string | null;
  readonly submitterStaffCodeSnapshot: string | null;
  readonly academicYearId: string;
  readonly fromCivilDate: string;
  readonly toCivilDate: string;
  readonly asOfInstant: string;
  readonly personalProjectionProfile: string;
  readonly responsibilityState: "RESPONSIBILITY_PRESENT";
  readonly responsibilityManifest: readonly DeepReadonly<PersonalResponsibilityInterval>[];
  readonly sections: readonly DeepReadonly<PersonalReportingSection>[];
  readonly counts: DeepReadonly<NonNullable<PersonalReportingProjection["counts"]>>;
}

export interface ReportingStatementSnapshotV1 extends ReportingStatementSnapshotCommon {
  readonly snapshotProfile: typeof REPORTING_STATEMENT_SNAPSHOT_V1;
}

export interface ReportingStatementSnapshotV2 extends ReportingStatementSnapshotCommon {
  readonly snapshotProfile: typeof REPORTING_STATEMENT_SNAPSHOT_V2;
  readonly operationalStartPolicyVersionId: string;
  readonly operationalStartDate: string;
}

export interface ReportingStatementSnapshotV3 extends ReportingStatementSnapshotCommon {
  readonly snapshotProfile: typeof REPORTING_STATEMENT_SNAPSHOT_V3;
  readonly operationalStartPolicyVersionId: string;
  readonly operationalStartDate: string;
  readonly specialProgrammeWorkload: DeepReadonly<SpecialProgrammeWorkloadSnapshot>;
}

export interface CurricularWorkloadContributionSnapshot {
  readonly executionId: string;
  readonly kind: string;
  readonly executionCivilDate: string;
  readonly actualTeacherUserId: string;
  readonly credit: number;
  readonly schoolClassId: string;
  readonly subjectId: string;
  readonly originalTimetableEntryId: string;
  readonly sourceCivilDate: string;
  readonly replacesId?: string | null;
}

export interface WorkloadAdjustmentAppliedRuleSnapshot {
  readonly ruleId: string;
  readonly calculation: 'TRU_TIET' | 'TRU_PHAN_TRAM' | 'GHI_DE';
  readonly value: number;
  readonly priority: number;
  readonly sourceKind: 'ADDITIONAL_DUTY' | 'HOMEROOM_RESPONSIBILITY';
  readonly dutyDefinitionId?: string;
  readonly dutyDefinitionCodeSnapshot?: string;
  readonly dutyDefinitionNameSnapshot?: string;
  readonly qualifyingAssignmentIds?: readonly string[];
  readonly matchingHomeroomAssignmentIds?: readonly string[];
  readonly matchingSchoolClassIds?: readonly string[];
}

export interface WorkloadAdjustmentSegmentSnapshot {
  readonly fromCivilDate: string;
  readonly toCivilDate: string;
  readonly isWorkloadEligible: boolean;
  readonly calendarVersionId: string;
  readonly teachingWeekdays: readonly string[];
  readonly denominatorK: number;
  readonly hasInterruption: boolean;
  readonly interruptionIds?: readonly string[];
  readonly policyVersionId: string | null;
  readonly policyValidatorVersion: string | null;
  readonly policyEffectiveFrom?: string | null;
  readonly policyEffectiveUntil?: string | null;
  readonly baseWeeklyNorm: number | null;
  readonly adjustedWeeklyNorm: number | null;
  readonly dailyRequiredCredit: number;
  readonly appliedRules: readonly WorkloadAdjustmentAppliedRuleSnapshot[];
}

export interface OfficialTeacherWorkloadSnapshot {
  readonly projectionProfile: string;
  readonly status: 'PASS';
  readonly curricularCredit: number;
  readonly specialProgrammeCredit: number;
  readonly earnedCredit: number;
  readonly requiredCredit: number;
  readonly varianceCredit: number;
  readonly curricularContributions: readonly CurricularWorkloadContributionSnapshot[];
  readonly specialProgrammeWorkload: DeepReadonly<SpecialProgrammeWorkloadSnapshot>;
  readonly adjustmentSegments: readonly WorkloadAdjustmentSegmentSnapshot[];
  readonly evaluatedAt: string;
}

export interface ReportingStatementSnapshotV4 extends ReportingStatementSnapshotCommon {
  readonly snapshotProfile: typeof REPORTING_STATEMENT_SNAPSHOT_V4;
  readonly operationalStartPolicyVersionId: string;
  readonly operationalStartDate: string;
  readonly specialProgrammeWorkload: DeepReadonly<SpecialProgrammeWorkloadSnapshot>;
  readonly officialWorkload: DeepReadonly<OfficialTeacherWorkloadSnapshot>;
}

export type ReportingStatementSnapshot =
  | ReportingStatementSnapshotV1
  | ReportingStatementSnapshotV2
  | ReportingStatementSnapshotV3
  | ReportingStatementSnapshotV4;

export interface FreezeReportingStatementInputBase {
  statementProfile: string;
  submitterUserId: string;
  submitterDisplayNameSnapshot?: string | null;
  submitterStaffCodeSnapshot?: string | null;
  asOfInstant: Date;
  projection: PersonalReportingProjection;
}

export interface FreezeReportingStatementInputV4 extends FreezeReportingStatementInputBase {
  operationalStartPolicyVersionId: string;
  operationalStartDate: string;
  specialProgrammeWorkload: SpecialProgrammeWorkloadSnapshot;
  officialWorkload: OfficialTeacherWorkloadSnapshot;
}

export interface FreezeReportingStatementInputV3 extends FreezeReportingStatementInputBase {
  operationalStartPolicyVersionId: string;
  operationalStartDate: string;
  specialProgrammeWorkload: SpecialProgrammeWorkloadSnapshot;
}

export interface FreezeReportingStatementInputV2 extends FreezeReportingStatementInputBase {
  operationalStartPolicyVersionId: string;
  operationalStartDate: string;
}

export interface FreezeReportingStatementInputV1 extends FreezeReportingStatementInputBase {
  snapshotProfile?: typeof REPORTING_STATEMENT_SNAPSHOT_V1;
}

export type FreezeReportingStatementInput =
  | FreezeReportingStatementInputV4
  | FreezeReportingStatementInputV3
  | FreezeReportingStatementInputV2;

export interface FrozenReportingStatementSnapshot<
  TSnapshot extends ReportingStatementSnapshot = ReportingStatementSnapshot,
> {
  readonly snapshot: TSnapshot;
  readonly canonicalSnapshotJson: string;
  readonly semanticHash: string;
  readonly frozenSubjectIds: readonly string[];
}

export function canonicalizeJson(value: CanonicalValue): string {
  assertCanonicalValue(value, "$");
  return serialize(value);
}

export function sha256CanonicalJson(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function buildFrozenSnapshotBase(
  input: FreezeReportingStatementInputBase,
): {
  p: PersonalReportingProjection;
  counts: NonNullable<PersonalReportingProjection["counts"]>;
  subjects: string[];
} {
  const p = input.projection;
  if (p.responsibilityState !== "RESPONSIBILITY_PRESENT") {
    throw new BadRequestException("A zero-responsibility projection cannot create a Statement.");
  }
  if (p.status !== "PASS" || p.counts === null) {
    throw new BadRequestException("Only a PASS Personal projection can create a Statement.");
  }
  if (p.scope.targetUserId !== input.submitterUserId) {
    throw new BadRequestException("Personal projection owner must equal the Statement submitter.");
  }
  if (p.scope.asOfInstant.getTime() !== input.asOfInstant.getTime()) {
    throw new BadRequestException("Projection asOfInstant must equal the pinned Statement asOfInstant.");
  }
  const subjects = [...new Set(p.responsibilityManifest.map((x) => x.subjectId))].sort(compare);
  if (!subjects.length) {
    throw new BadRequestException("A Reporting Statement requires at least one frozen subject.");
  }
  return { p, counts: p.counts, subjects };
}

export function freezeReportingStatementSnapshotV4(
  input: FreezeReportingStatementInputV4,
): FrozenReportingStatementSnapshot<ReportingStatementSnapshotV4> {
  const { p, counts, subjects } = buildFrozenSnapshotBase(input);

  if (
    typeof input.operationalStartPolicyVersionId !== "string" ||
    !input.operationalStartPolicyVersionId.trim()
  ) {
    throw new BadRequestException("operationalStartPolicyVersionId must be a non-empty string.");
  }
  if (
    typeof input.operationalStartDate !== "string" ||
    !isCivilDate(input.operationalStartDate)
  ) {
    throw new BadRequestException("operationalStartDate must be a valid civil date in YYYY-MM-DD format.");
  }

  const wl = input.specialProgrammeWorkload;
  if (!wl || typeof wl !== "object") {
    throw new BadRequestException("specialProgrammeWorkload must be an object.");
  }
  if (wl.status !== "PASS") {
    throw new BadRequestException("Only a PASS special programme workload projection can create a Statement.");
  }
  validateSpecialProgrammeWorkloadSnapshot(
    wl,
    input.submitterUserId,
    (message) => {
      throw new BadRequestException(message);
    },
  );

  const owl = input.officialWorkload;
  if (!owl || typeof owl !== "object") {
    throw new BadRequestException("officialWorkload must be an object.");
  }
  if (owl.status !== "PASS") {
    throw new BadRequestException("Only a PASS official workload projection can create a Statement.");
  }
  validateOfficialTeacherWorkloadSnapshot(
    owl,
    input.submitterUserId,
    (message) => {
      throw new BadRequestException(message);
    },
  );

  const sortedContributions = wl.contributions
    .slice()
    .sort(compareContributionSnapshot)
    .map((c: SpecialProgrammeWorkloadContributionSnapshot) => ({
      ...c,
      attestations: (c.attestations || [])
        .slice()
        .sort((a: SpecialProgrammeWorkloadAttestationEvidenceSnapshot, b: SpecialProgrammeWorkloadAttestationEvidenceSnapshot) => compare(a.attestationId, b.attestationId))
        .map((a: SpecialProgrammeWorkloadAttestationEvidenceSnapshot) => ({ ...a })),
    }));

  const sortedPending = wl.pendingConfirmation
    .slice()
    .sort(comparePendingSnapshot)
    .map((pc) => ({ ...pc }));

  const specialProgrammeWorkload: DeepReadonly<SpecialProgrammeWorkloadSnapshot> = {
    projectionProfile: required(wl.projectionProfile),
    status: "PASS",
    totalCredit: wl.totalCredit,
    contributionCount: wl.contributionCount,
    contributions: sortedContributions,
    pendingConfirmation: sortedPending,
    evaluatedAt: required(wl.evaluatedAt),
  };

  const sortedCurricular = owl.curricularContributions
    .slice()
    .sort((a, b) => compare(a.executionCivilDate, b.executionCivilDate) || compare(a.executionId, b.executionId))
    .map((c) => ({ ...c }));

  const sortedSegments = owl.adjustmentSegments
    .slice()
    .sort((a, b) => compare(a.fromCivilDate, b.fromCivilDate) || compare(a.toCivilDate, b.toCivilDate) || compare(a.calendarVersionId, b.calendarVersionId))
    .map((s) => ({
      ...s,
      teachingWeekdays: s.teachingWeekdays.slice().sort(compare),
      interruptionIds: (s.interruptionIds ?? []).slice().sort(compare),
      appliedRules: s.appliedRules
        .slice()
        .sort((a, b) => a.priority - b.priority || compare(a.ruleId, b.ruleId))
        .map((r) => ({
          ...r,
          qualifyingAssignmentIds: (r.qualifyingAssignmentIds ?? []).slice().sort(compare),
          matchingHomeroomAssignmentIds: (r.matchingHomeroomAssignmentIds ?? []).slice().sort(compare),
          matchingSchoolClassIds: (r.matchingSchoolClassIds ?? []).slice().sort(compare),
        })),
    }));

  const officialWorkload: DeepReadonly<OfficialTeacherWorkloadSnapshot> = {
    projectionProfile: required(owl.projectionProfile),
    status: "PASS",
    curricularCredit: owl.curricularCredit,
    specialProgrammeCredit: owl.specialProgrammeCredit,
    earnedCredit: owl.earnedCredit,
    requiredCredit: owl.requiredCredit,
    varianceCredit: owl.varianceCredit,
    curricularContributions: sortedCurricular,
    specialProgrammeWorkload,
    adjustmentSegments: sortedSegments,
    evaluatedAt: required(owl.evaluatedAt),
  };

  const snapshot: ReportingStatementSnapshotV4 = {
    snapshotProfile: REPORTING_STATEMENT_SNAPSHOT_V4,
    serializerVersion: REPORTING_STATEMENT_SERIALIZER_V1,
    statementProfile: required(input.statementProfile),
    submitterUserId: required(input.submitterUserId),
    submitterDisplayNameSnapshot: input.submitterDisplayNameSnapshot ?? null,
    submitterStaffCodeSnapshot: input.submitterStaffCodeSnapshot ?? null,
    academicYearId: required(p.scope.academicYearId),
    fromCivilDate: civil(p.scope.fromCivilDate),
    toCivilDate: civil(p.scope.toCivilDate),
    asOfInstant: instant(input.asOfInstant),
    personalProjectionProfile: p.profile,
    responsibilityState: "RESPONSIBILITY_PRESENT",
    responsibilityManifest: p.responsibilityManifest
      .slice()
      .sort(interval)
      .map((x) => ({ ...x })),
    sections: p.sections
      .slice()
      .sort(section)
      .map((x) => ({
        ...x,
        responsibilityIntervals: x.responsibilityIntervals
          .slice()
          .sort(interval)
          .map((i) => ({ ...i })),
        details: x.details.slice().sort(detail).map((d) => ({ ...d })),
        findings: x.findings
          .slice()
          .sort(finding)
          .map((f) => ({ ...f, entityIds: f.entityIds.slice().sort(compare) })),
      })),
    counts: { ...counts },
    operationalStartPolicyVersionId: required(input.operationalStartPolicyVersionId),
    operationalStartDate: civil(input.operationalStartDate),
    specialProgrammeWorkload,
    officialWorkload,
  };

  const canonicalSnapshotJson = canonicalizeJson(snapshot as unknown as CanonicalValue);
  return freezeDeep({
    snapshot,
    canonicalSnapshotJson,
    semanticHash: sha256CanonicalJson(canonicalSnapshotJson),
    frozenSubjectIds: subjects,
  });
}

export function freezeReportingStatementSnapshotV3(
  input: FreezeReportingStatementInputV3,
): FrozenReportingStatementSnapshot<ReportingStatementSnapshotV3> {

  const { p, counts, subjects } = buildFrozenSnapshotBase(input);

  if (
    typeof input.operationalStartPolicyVersionId !== "string" ||
    !input.operationalStartPolicyVersionId.trim()
  ) {
    throw new BadRequestException("operationalStartPolicyVersionId must be a non-empty string.");
  }
  if (
    typeof input.operationalStartDate !== "string" ||
    !isCivilDate(input.operationalStartDate)
  ) {
    throw new BadRequestException("operationalStartDate must be a valid civil date in YYYY-MM-DD format.");
  }

  const wl = input.specialProgrammeWorkload;
  if (!wl || typeof wl !== "object") {
    throw new BadRequestException("specialProgrammeWorkload must be an object.");
  }
  if (wl.status !== "PASS") {
    throw new BadRequestException("Only a PASS special programme workload projection can create a Statement.");
  }
  if (typeof wl.totalCredit !== "number" || !Number.isFinite(wl.totalCredit) || wl.totalCredit < 0) {
    throw new BadRequestException("totalCredit must be a non-negative finite number.");
  }
  if (typeof wl.contributionCount !== "number" || !Number.isInteger(wl.contributionCount) || wl.contributionCount < 0) {
    throw new BadRequestException("contributionCount must be a non-negative integer.");
  }
  if (!Array.isArray(wl.contributions) || !Array.isArray(wl.pendingConfirmation)) {
    throw new BadRequestException("contributions and pendingConfirmation must be arrays.");
  }
  validateSpecialProgrammeWorkloadSnapshot(
    wl,
    input.submitterUserId,
    (message) => {
      throw new BadRequestException(message);
    },
  );

  const sortedContributions = wl.contributions
    .slice()
    .sort(compareContributionSnapshot)
    .map((c: SpecialProgrammeWorkloadContributionSnapshot) => ({
      ...c,
      attestations: (c.attestations || [])
        .slice()
        .sort((a: SpecialProgrammeWorkloadAttestationEvidenceSnapshot, b: SpecialProgrammeWorkloadAttestationEvidenceSnapshot) => compare(a.attestationId, b.attestationId))
        .map((a: SpecialProgrammeWorkloadAttestationEvidenceSnapshot) => ({ ...a })),
    }));

  const sortedPending = wl.pendingConfirmation
    .slice()
    .sort(comparePendingSnapshot)
    .map((pc) => ({ ...pc }));

  const specialProgrammeWorkload: DeepReadonly<SpecialProgrammeWorkloadSnapshot> = {
    projectionProfile: required(wl.projectionProfile),
    status: "PASS",
    totalCredit: wl.totalCredit,
    contributionCount: wl.contributionCount,
    contributions: sortedContributions,
    pendingConfirmation: sortedPending,
    evaluatedAt: required(wl.evaluatedAt),
  };

  const snapshot: ReportingStatementSnapshotV3 = {
    snapshotProfile: REPORTING_STATEMENT_SNAPSHOT_V3,
    serializerVersion: REPORTING_STATEMENT_SERIALIZER_V1,
    statementProfile: required(input.statementProfile),
    submitterUserId: required(input.submitterUserId),
    submitterDisplayNameSnapshot: input.submitterDisplayNameSnapshot ?? null,
    submitterStaffCodeSnapshot: input.submitterStaffCodeSnapshot ?? null,
    academicYearId: required(p.scope.academicYearId),
    fromCivilDate: civil(p.scope.fromCivilDate),
    toCivilDate: civil(p.scope.toCivilDate),
    asOfInstant: instant(input.asOfInstant),
    personalProjectionProfile: p.profile,
    responsibilityState: "RESPONSIBILITY_PRESENT",
    responsibilityManifest: p.responsibilityManifest
      .slice()
      .sort(interval)
      .map((x) => ({ ...x })),
    sections: p.sections
      .slice()
      .sort(section)
      .map((x) => ({
        ...x,
        responsibilityIntervals: x.responsibilityIntervals
          .slice()
          .sort(interval)
          .map((i) => ({ ...i })),
        details: x.details.slice().sort(detail).map((d) => ({ ...d })),
        findings: x.findings
          .slice()
          .sort(finding)
          .map((f) => ({ ...f, entityIds: f.entityIds.slice().sort(compare) })),
      })),
    counts: { ...counts },
    operationalStartPolicyVersionId: required(input.operationalStartPolicyVersionId),
    operationalStartDate: civil(input.operationalStartDate),
    specialProgrammeWorkload,
  };

  const canonicalSnapshotJson = canonicalizeJson(snapshot as unknown as CanonicalValue);
  return freezeDeep({
    snapshot,
    canonicalSnapshotJson,
    semanticHash: sha256CanonicalJson(canonicalSnapshotJson),
    frozenSubjectIds: subjects,
  });
}

export function freezeReportingStatementSnapshotV2(
  input: FreezeReportingStatementInputV2,
): FrozenReportingStatementSnapshot<ReportingStatementSnapshotV2> {
  const { p, counts, subjects } = buildFrozenSnapshotBase(input);

  if (
    typeof input.operationalStartPolicyVersionId !== "string" ||
    !input.operationalStartPolicyVersionId.trim()
  ) {
    throw new BadRequestException("operationalStartPolicyVersionId must be a non-empty string.");
  }
  if (
    typeof input.operationalStartDate !== "string" ||
    !isCivilDate(input.operationalStartDate)
  ) {
    throw new BadRequestException("operationalStartDate must be a valid civil date in YYYY-MM-DD format.");
  }

  const snapshot: ReportingStatementSnapshotV2 = {
    snapshotProfile: REPORTING_STATEMENT_SNAPSHOT_V2,
    serializerVersion: REPORTING_STATEMENT_SERIALIZER_V1,
    statementProfile: required(input.statementProfile),
    submitterUserId: required(input.submitterUserId),
    submitterDisplayNameSnapshot: input.submitterDisplayNameSnapshot ?? null,
    submitterStaffCodeSnapshot: input.submitterStaffCodeSnapshot ?? null,
    academicYearId: required(p.scope.academicYearId),
    fromCivilDate: civil(p.scope.fromCivilDate),
    toCivilDate: civil(p.scope.toCivilDate),
    asOfInstant: instant(input.asOfInstant),
    personalProjectionProfile: p.profile,
    responsibilityState: "RESPONSIBILITY_PRESENT",
    responsibilityManifest: p.responsibilityManifest
      .slice()
      .sort(interval)
      .map((x) => ({ ...x })),
    sections: p.sections
      .slice()
      .sort(section)
      .map((x) => ({
        ...x,
        responsibilityIntervals: x.responsibilityIntervals
          .slice()
          .sort(interval)
          .map((i) => ({ ...i })),
        details: x.details.slice().sort(detail).map((d) => ({ ...d })),
        findings: x.findings
          .slice()
          .sort(finding)
          .map((f) => ({ ...f, entityIds: f.entityIds.slice().sort(compare) })),
      })),
    counts: { ...counts },
    operationalStartPolicyVersionId: required(input.operationalStartPolicyVersionId),
    operationalStartDate: civil(input.operationalStartDate),
  };

  const canonicalSnapshotJson = canonicalizeJson(snapshot as unknown as CanonicalValue);
  return freezeDeep({
    snapshot,
    canonicalSnapshotJson,
    semanticHash: sha256CanonicalJson(canonicalSnapshotJson),
    frozenSubjectIds: subjects,
  });
}

export function freezeReportingStatementSnapshot(
  input: FreezeReportingStatementInputV4,
): FrozenReportingStatementSnapshot<ReportingStatementSnapshotV4>;
export function freezeReportingStatementSnapshot(
  input: FreezeReportingStatementInputV3,
): FrozenReportingStatementSnapshot<ReportingStatementSnapshotV3>;
export function freezeReportingStatementSnapshot(
  input: FreezeReportingStatementInputV2,
): FrozenReportingStatementSnapshot<ReportingStatementSnapshotV2>;
export function freezeReportingStatementSnapshot(
  input: FreezeReportingStatementInput,
): FrozenReportingStatementSnapshot<ReportingStatementSnapshot> {
  if ("officialWorkload" in input && input.officialWorkload !== undefined) {
    return freezeReportingStatementSnapshotV4(input as FreezeReportingStatementInputV4);
  }
  if ("specialProgrammeWorkload" in input && input.specialProgrammeWorkload !== undefined) {
    return freezeReportingStatementSnapshotV3(input as FreezeReportingStatementInputV3);
  }
  return freezeReportingStatementSnapshotV2(input as FreezeReportingStatementInputV2);
}


export function freezeReportingStatementSnapshotV1(
  input: FreezeReportingStatementInputV1,
): FrozenReportingStatementSnapshot<ReportingStatementSnapshotV1> {
  const { p, counts, subjects } = buildFrozenSnapshotBase(input);

  const snapshot: ReportingStatementSnapshotV1 = {
    snapshotProfile: REPORTING_STATEMENT_SNAPSHOT_V1,
    serializerVersion: REPORTING_STATEMENT_SERIALIZER_V1,
    statementProfile: required(input.statementProfile),
    submitterUserId: required(input.submitterUserId),
    submitterDisplayNameSnapshot: input.submitterDisplayNameSnapshot ?? null,
    submitterStaffCodeSnapshot: input.submitterStaffCodeSnapshot ?? null,
    academicYearId: required(p.scope.academicYearId),
    fromCivilDate: civil(p.scope.fromCivilDate),
    toCivilDate: civil(p.scope.toCivilDate),
    asOfInstant: instant(input.asOfInstant),
    personalProjectionProfile: p.profile,
    responsibilityState: "RESPONSIBILITY_PRESENT",
    responsibilityManifest: p.responsibilityManifest
      .slice()
      .sort(interval)
      .map((x) => ({ ...x })),
    sections: p.sections
      .slice()
      .sort(section)
      .map((x) => ({
        ...x,
        responsibilityIntervals: x.responsibilityIntervals
          .slice()
          .sort(interval)
          .map((i) => ({ ...i })),
        details: x.details.slice().sort(detail).map((d) => ({ ...d })),
        findings: x.findings
          .slice()
          .sort(finding)
          .map((f) => ({ ...f, entityIds: f.entityIds.slice().sort(compare) })),
      })),
    counts: { ...counts },
  };

  const canonicalSnapshotJson = canonicalizeJson(snapshot as unknown as CanonicalValue);
  return freezeDeep({
    snapshot,
    canonicalSnapshotJson,
    semanticHash: sha256CanonicalJson(canonicalSnapshotJson),
    frozenSubjectIds: subjects,
  });
}

export function assertFrozenReportingStatementIntegrity(
  frozen: FrozenReportingStatementSnapshot,
): void {
  const canonical = canonicalizeJson(frozen.snapshot as unknown as CanonicalValue);
  if (canonical !== frozen.canonicalSnapshotJson) {
    throw new Error("Frozen Reporting Statement canonical snapshot integrity failed.");
  }
  if (sha256CanonicalJson(frozen.canonicalSnapshotJson) !== frozen.semanticHash) {
    throw new Error("Frozen Reporting Statement semantic hash integrity failed.");
  }
  if (frozen.snapshot.serializerVersion !== REPORTING_STATEMENT_SERIALIZER_V1) {
    throw new Error("Frozen Reporting Statement version integrity failed.");
  }
  if (
    frozen.snapshot.snapshotProfile !== REPORTING_STATEMENT_SNAPSHOT_V1 &&
    frozen.snapshot.snapshotProfile !== REPORTING_STATEMENT_SNAPSHOT_V2 &&
    frozen.snapshot.snapshotProfile !== REPORTING_STATEMENT_SNAPSHOT_V3 &&
    frozen.snapshot.snapshotProfile !== REPORTING_STATEMENT_SNAPSHOT_V4
  ) {
    throw new Error("Frozen Reporting Statement unknown snapshot profile failed.");
  }
  if (
    frozen.snapshot.snapshotProfile === REPORTING_STATEMENT_SNAPSHOT_V2 ||
    frozen.snapshot.snapshotProfile === REPORTING_STATEMENT_SNAPSHOT_V3 ||
    frozen.snapshot.snapshotProfile === REPORTING_STATEMENT_SNAPSHOT_V4
  ) {
    const v2Plus = frozen.snapshot as ReportingStatementSnapshotV2 | ReportingStatementSnapshotV3 | ReportingStatementSnapshotV4;
    if (
      typeof v2Plus.operationalStartPolicyVersionId !== "string" ||
      !v2Plus.operationalStartPolicyVersionId.trim()
    ) {
      throw new Error("Frozen Reporting Statement V2 policy version integrity failed.");
    }
    if (
      typeof v2Plus.operationalStartDate !== "string" ||
      !isCivilDate(v2Plus.operationalStartDate)
    ) {
      throw new Error("Frozen Reporting Statement V2 operational start date integrity failed.");
    }
  }
  if (
    frozen.snapshot.snapshotProfile === REPORTING_STATEMENT_SNAPSHOT_V3 ||
    frozen.snapshot.snapshotProfile === REPORTING_STATEMENT_SNAPSHOT_V4
  ) {
    const v3Plus = frozen.snapshot as ReportingStatementSnapshotV3 | ReportingStatementSnapshotV4;
    if (!v3Plus.specialProgrammeWorkload || typeof v3Plus.specialProgrammeWorkload !== "object") {
      throw new Error("Frozen Reporting Statement V3 special programme workload integrity failed.");
    }
    if (v3Plus.specialProgrammeWorkload.status !== "PASS") {
      throw new Error("Frozen Reporting Statement V3 status integrity failed.");
    }
    if (
      typeof v3Plus.specialProgrammeWorkload.totalCredit !== "number" ||
      !Number.isFinite(v3Plus.specialProgrammeWorkload.totalCredit) ||
      v3Plus.specialProgrammeWorkload.totalCredit < 0
    ) {
      throw new Error("Frozen Reporting Statement V3 total credit integrity failed.");
    }
    if (
      typeof v3Plus.specialProgrammeWorkload.contributionCount !== "number" ||
      !Number.isInteger(v3Plus.specialProgrammeWorkload.contributionCount) ||
      v3Plus.specialProgrammeWorkload.contributionCount < 0
    ) {
      throw new Error("Frozen Reporting Statement V3 contribution count integrity failed.");
    }
    if (!Array.isArray(v3Plus.specialProgrammeWorkload.contributions) || !Array.isArray(v3Plus.specialProgrammeWorkload.pendingConfirmation)) {
      throw new Error("Frozen Reporting Statement V3 array integrity failed.");
    }
    validateSpecialProgrammeWorkloadSnapshot(
      v3Plus.specialProgrammeWorkload,
      v3Plus.submitterUserId,
      (message) => {
        throw new Error(`Frozen Reporting Statement V3 ${message}`);
      },
    );
  }
  if (frozen.snapshot.snapshotProfile === REPORTING_STATEMENT_SNAPSHOT_V4) {
    const v4 = frozen.snapshot as ReportingStatementSnapshotV4;
    if (!v4.officialWorkload || typeof v4.officialWorkload !== "object") {
      throw new Error("Frozen Reporting Statement V4 official workload integrity failed.");
    }
    validateOfficialTeacherWorkloadSnapshot(
      v4.officialWorkload,
      v4.submitterUserId,
      (message) => {
        throw new Error(`Frozen Reporting Statement V4 ${message}`);
      },
    );
  }
  const subjects = [...new Set(frozen.snapshot.responsibilityManifest.map((x) => x.subjectId))].sort(compare);
  if (
    subjects.length === 0 ||
    subjects.length !== frozen.frozenSubjectIds.length ||
    subjects.some((x, i) => x !== frozen.frozenSubjectIds[i])
  ) {
    throw new Error("Frozen Reporting Statement subject integrity failed.");
  }
  if (instant(new Date(frozen.snapshot.asOfInstant)) !== frozen.snapshot.asOfInstant) {
    throw new Error("Frozen Reporting Statement asOf integrity failed.");
  }
}

function serialize(v: CanonicalValue): string {
  if (v === null) return "null";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    return "[" + v.map(serialize).join(",") + "]";
  }
  return (
    "{" +
    Object.keys(v)
      .sort(compare)
      .map((k) => JSON.stringify(k) + ":" + serialize(v[k]))
      .join(",") +
    "}"
  );
}

function assertCanonicalValue(v: unknown, path: string): asserts v is CanonicalValue {
  if (v === undefined) {
    throw new TypeError("Undefined is not permitted in canonical JSON at " + path);
  }
  if (v === null || typeof v === "string" || typeof v === "boolean") return;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) {
      throw new TypeError("Non-finite number is not permitted in canonical JSON at " + path);
    }
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => assertCanonicalValue(x, path + "[" + i + "]"));
    return;
  }
  if (typeof v !== "object" || Object.getPrototypeOf(v) !== Object.prototype) {
    throw new TypeError("Unsupported canonical JSON value at " + path);
  }
  Object.entries(v).forEach(([k, x]) => assertCanonicalValue(x, path + "." + k));
}

function finding(
  a: { code: string; occurrenceKey: string | null; reason: string; entityIds: string[] },
  b: { code: string; occurrenceKey: string | null; reason: string; entityIds: string[] },
): number {
  return (
    compare(a.code, b.code) ||
    compare(a.occurrenceKey ?? "", b.occurrenceKey ?? "") ||
    compare(a.reason, b.reason) ||
    compare(
      a.entityIds.slice().sort(compare).join("\u0000"),
      b.entityIds.slice().sort(compare).join("\u0000"),
    )
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function interval(
  a: PersonalResponsibilityInterval,
  b: PersonalResponsibilityInterval,
): number {
  return (
    compare(a.schoolClassId, b.schoolClassId) ||
    compare(a.subjectId, b.subjectId) ||
    compare(a.validFrom, b.validFrom) ||
    compare(a.validUntil ?? "9999-12-31", b.validUntil ?? "9999-12-31") ||
    compare(a.teachingAssignmentId, b.teachingAssignmentId)
  );
}

function section(
  a: PersonalReportingSection,
  b: PersonalReportingSection,
): number {
  return (
    compare(a.schoolClassId, b.schoolClassId) ||
    compare(a.subjectId, b.subjectId)
  );
}

function detail(
  a: {
    sourceCivilDate: string;
    sourceSlotStart: string;
    sourceSlotEnd: string;
    sourceNormalOccurrenceKey: string;
  },
  b: typeof a,
): number {
  return (
    compare(a.sourceCivilDate, b.sourceCivilDate) ||
    compare(a.sourceSlotStart, b.sourceSlotStart) ||
    compare(a.sourceSlotEnd, b.sourceSlotEnd) ||
    compare(a.sourceNormalOccurrenceKey, b.sourceNormalOccurrenceKey)
  );
}

function required(v: string): string {
  if (!v.trim()) throw new BadRequestException("Required string missing.");
  return v;
}

function civil(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new BadRequestException("Civil dates must use YYYY-MM-DD.");
  }
  return v;
}

function instant(v: Date): string {
  if (Number.isNaN(v.getTime())) {
    throw new BadRequestException("asOfInstant must be valid.");
  }
  return v.toISOString();
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as object)) {
      freezeDeep(child);
    }
  }
  return value;
}

function compareContributionSnapshot(
  a: { executionCivilDate: string; plannedOccurrenceSlotId: string; executionId: string },
  b: { executionCivilDate: string; plannedOccurrenceSlotId: string; executionId: string },
): number {
  return (
    compare(a.executionCivilDate, b.executionCivilDate) ||
    compare(a.plannedOccurrenceSlotId, b.plannedOccurrenceSlotId) ||
    compare(a.executionId, b.executionId)
  );
}

function comparePendingSnapshot(
  a: { executionCivilDate: string; plannedOccurrenceSlotId: string; executionId: string },
  b: { executionCivilDate: string; plannedOccurrenceSlotId: string; executionId: string },
): number {
  return (
    compare(a.executionCivilDate, b.executionCivilDate) ||
    compare(a.plannedOccurrenceSlotId, b.plannedOccurrenceSlotId) ||
    compare(a.executionId, b.executionId)
  );
}

function validateSpecialProgrammeWorkloadSnapshot(
  workload: SpecialProgrammeWorkloadSnapshot,
  submitterUserId: string,
  fail: (message: string) => never,
): void {
  if (workload.projectionProfile !== 'SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_V1') {
    fail('projection profile integrity failed.');
  }
  if (workload.status !== 'PASS') fail('status integrity failed.');
  if (!Array.isArray(workload.contributions) || !Array.isArray(workload.pendingConfirmation)) {
    fail('array integrity failed.');
  }
  if (
    !Number.isInteger(workload.contributionCount) ||
    workload.contributionCount < 0 ||
    workload.contributionCount !== workload.contributions.length
  ) {
    fail('contribution count integrity failed.');
  }
  if (!Number.isFinite(workload.totalCredit) || workload.totalCredit < 0) {
    fail('total credit integrity failed.');
  }
  if (!isValidInstantString(workload.evaluatedAt)) fail('evaluatedAt integrity failed.');

  const identities = new Set<string>();
  let totalCredit = 0;
  for (const contribution of workload.contributions) {
    const requiredContributionStrings: Array<keyof SpecialProgrammeWorkloadContributionSnapshot> = [
      'executionId',
      'specialActivityId',
      'specialActivityStaffingId',
      'specialActivityTimeSlotId',
      'programmeMasterId',
      'programmePlanVersionId',
      'programmeTopicItemId',
      'plannedProgrammeOccurrenceId',
      'plannedOccurrenceSlotId',
      'programmeKind',
      'occurrenceMode',
      'actualTeacherUserId',
      'policyVersionId',
      'policyValidatorVersion',
    ];
    for (const key of requiredContributionStrings) {
      if (typeof contribution[key] !== 'string' || !contribution[key].trim()) {
        fail(`contribution ${String(key)} integrity failed.`);
      }
    }
    if (contribution.actualTeacherUserId !== submitterUserId) {
      fail('contribution owner integrity failed.');
    }
    if (!isCivilDate(contribution.executionCivilDate)) {
      fail('contribution civil date integrity failed.');
    }
    if (
      !Number.isFinite(contribution.coefficient) ||
      contribution.coefficient < 0 ||
      !Number.isFinite(contribution.credit) ||
      contribution.credit < 0 ||
      contribution.credit !== contribution.coefficient
    ) {
      fail('contribution coefficient/credit integrity failed.');
    }
    if (contribution.policyEffectiveFrom !== undefined && !contribution.policyEffectiveFrom.trim()) {
      fail('contribution policy effective-from integrity failed.');
    }
    if (
      contribution.policyEffectiveUntil !== undefined &&
      contribution.policyEffectiveUntil !== null &&
      !contribution.policyEffectiveUntil.trim()
    ) {
      fail('contribution policy effective-until integrity failed.');
    }
    const identity = `${contribution.plannedOccurrenceSlotId}|${contribution.actualTeacherUserId}`;
    if (identities.has(identity)) fail('duplicate contribution identity integrity failed.');
    identities.add(identity);
    if (!Array.isArray(contribution.attestations) || contribution.attestations.length < 1) {
      fail('contribution attestation integrity failed.');
    }
    const attestationIds = new Set<string>();
    for (const attestation of contribution.attestations) {
      for (const key of ['attestationId', 'attestedByUserId', 'authorityType', 'capabilityKey', 'scope'] as const) {
        if (typeof attestation[key] !== 'string' || !attestation[key].trim()) {
          fail(`attestation ${key} integrity failed.`);
        }
      }
      if (attestation.resourceId !== null && (typeof attestation.resourceId !== 'string' || !attestation.resourceId.trim())) {
        fail('attestation resource integrity failed.');
      }
      if (!isValidInstantString(attestation.attestedAt)) fail('attestation timestamp integrity failed.');
      if (attestationIds.has(attestation.attestationId)) fail('duplicate attestation integrity failed.');
      attestationIds.add(attestation.attestationId);
    }
    totalCredit += contribution.credit;
  }

  const roundedTotal = Math.round(totalCredit * 10000) / 10000;
  if (workload.totalCredit !== roundedTotal) fail('total credit reconciliation integrity failed.');

  for (const pending of workload.pendingConfirmation) {
    for (const key of [
      'executionId',
      'specialActivityId',
      'specialActivityStaffingId',
      'specialActivityTimeSlotId',
      'programmeMasterId',
      'programmePlanVersionId',
      'programmeTopicItemId',
      'plannedProgrammeOccurrenceId',
      'plannedOccurrenceSlotId',
      'actualTeacherUserId',
      'reason',
    ] as const) {
      if (typeof pending[key] !== 'string' || !pending[key].trim()) {
        fail(`pending confirmation ${key} integrity failed.`);
      }
    }
    if (pending.actualTeacherUserId !== submitterUserId) {
      fail('pending confirmation owner integrity failed.');
    }
    if (!isCivilDate(pending.executionCivilDate)) {
      fail('pending confirmation civil date integrity failed.');
    }
  }
}

export function assertSpecialProgrammeWorkloadSnapshotIntegrity(
  workload: SpecialProgrammeWorkloadSnapshot,
  submitterUserId: string,
): void {
  validateSpecialProgrammeWorkloadSnapshot(workload, submitterUserId, (message) => {
    throw new Error(message);
  });
}

function validateOfficialTeacherWorkloadSnapshot(
  workload: OfficialTeacherWorkloadSnapshot,
  submitterUserId: string,
  fail: (message: string) => never,
): void {
  if (workload.projectionProfile !== 'OFFICIAL_TEACHER_WORKLOAD_PROJECTION_V1') {
    fail('official workload projection profile integrity failed.');
  }
  if (workload.status !== 'PASS') fail('official workload status integrity failed.');
  if (!Number.isFinite(workload.curricularCredit) || workload.curricularCredit < 0) {
    fail('curricularCredit integrity failed.');
  }
  if (!Number.isFinite(workload.specialProgrammeCredit) || workload.specialProgrammeCredit < 0) {
    fail('specialProgrammeCredit integrity failed.');
  }
  if (!Number.isFinite(workload.earnedCredit) || workload.earnedCredit < 0) {
    fail('earnedCredit integrity failed.');
  }
  if (!Number.isFinite(workload.requiredCredit) || workload.requiredCredit < 0) {
    fail('requiredCredit integrity failed.');
  }
  if (!Number.isFinite(workload.varianceCredit)) {
    fail('varianceCredit integrity failed.');
  }
  if (!Array.isArray(workload.curricularContributions) || !Array.isArray(workload.adjustmentSegments)) {
    fail('official workload arrays integrity failed.');
  }
  if (workload.curricularCredit !== workload.curricularContributions.length) {
    fail('curricularCredit count integrity failed.');
  }
  const roundedEarned = Math.round((workload.curricularCredit + workload.specialProgrammeCredit) * 10000) / 10000;
  if (workload.earnedCredit !== roundedEarned) {
    fail('earnedCredit arithmetic integrity failed.');
  }
  const roundedVariance = Math.round((workload.earnedCredit - workload.requiredCredit) * 10000) / 10000;
  if (workload.varianceCredit !== roundedVariance) {
    fail('varianceCredit arithmetic integrity failed.');
  }
  if (!isValidInstantString(workload.evaluatedAt)) {
    fail('official workload evaluatedAt integrity failed.');
  }

  // Validate curricular contributions
  const curricularIds = new Set<string>();
  for (const c of workload.curricularContributions) {
    for (const key of ['executionId', 'kind', 'actualTeacherUserId', 'schoolClassId', 'subjectId', 'originalTimetableEntryId'] as const) {
      if (typeof c[key] !== 'string' || !c[key].trim()) {
        fail(`curricular contribution ${key} integrity failed.`);
      }
    }
    if (c.actualTeacherUserId !== submitterUserId) {
      fail('curricular contribution owner integrity failed.');
    }
    if (!isCivilDate(c.executionCivilDate) || !isCivilDate(c.sourceCivilDate)) {
      fail('curricular contribution dates integrity failed.');
    }
    if (c.credit !== 1) {
      fail('curricular contribution credit must be 1.');
    }
    if (curricularIds.has(c.executionId)) {
      fail('duplicate curricular contribution integrity failed.');
    }
    curricularIds.add(c.executionId);
  }

  // Validate adjustment segments
  for (const seg of workload.adjustmentSegments) {
    if (!isCivilDate(seg.fromCivilDate) || !isCivilDate(seg.toCivilDate) || seg.fromCivilDate > seg.toCivilDate) {
      fail('segment civil dates integrity failed.');
    }
    if (typeof seg.calendarVersionId !== 'string' || !seg.calendarVersionId.trim()) {
      fail('segment calendarVersionId integrity failed.');
    }
    if (!Array.isArray(seg.teachingWeekdays) || seg.denominatorK !== seg.teachingWeekdays.length) {
      fail('segment teachingWeekdays/denominatorK integrity failed.');
    }
    if (typeof seg.isWorkloadEligible !== 'boolean') {
      fail('segment isWorkloadEligible integrity failed.');
    }
    if (seg.isWorkloadEligible) {
      if (typeof seg.policyVersionId !== 'string' || !seg.policyVersionId.trim()) {
        fail('segment policyVersionId integrity failed.');
      }
      if (typeof seg.baseWeeklyNorm !== 'number' || seg.baseWeeklyNorm < 0) {
        fail('segment baseWeeklyNorm integrity failed.');
      }
      if (typeof seg.adjustedWeeklyNorm !== 'number' || seg.adjustedWeeklyNorm < 0) {
        fail('segment adjustedWeeklyNorm integrity failed.');
      }
    }
    if (!Array.isArray(seg.appliedRules)) {
      fail('segment appliedRules integrity failed.');
    }
    for (const r of seg.appliedRules) {
      for (const key of ['ruleId', 'calculation', 'sourceKind'] as const) {
        if (typeof r[key] !== 'string' || !r[key].trim()) {
          fail(`segment rule ${key} integrity failed.`);
        }
      }
      if (!Number.isFinite(r.value) || r.value < 0 || !Number.isInteger(r.priority)) {
        fail('segment rule numeric integrity failed.');
      }
      if (r.sourceKind === 'ADDITIONAL_DUTY' && (typeof r.dutyDefinitionId !== 'string' || !r.dutyDefinitionId.trim())) {
        fail('segment rule dutyDefinitionId integrity failed.');
      }
    }
  }
}

export function assertOfficialTeacherWorkloadSnapshotIntegrity(
  workload: OfficialTeacherWorkloadSnapshot,
  submitterUserId: string,
): void {
  validateOfficialTeacherWorkloadSnapshot(workload, submitterUserId, (message) => {
    throw new Error(message);
  });
}


function isValidInstantString(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
