import { createHash } from "crypto";
import { BadRequestException } from "@nestjs/common";
import { civilDateDayNumber, formatCivilDate, isCivilDate, parseCivilDate } from "../common/validation/civil-date";
import {
  exactAdd,
  exactSub,
  makeRational,
  rationalAdd,
  rationalDivInt,
  rationalMul,
  rationalRound4,
  ZERO_RATIONAL,
} from "../common/decimal/exact-decimal";
import { calculateAdjustedWeeklyNormRational } from "../official-workload/workload-adjustment-formula";
import { weekdayForCivilDate } from "../special-activities/special-activity-policy";
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
    { fromCivilDate: p.scope.fromCivilDate, toCivilDate: p.scope.toCivilDate },
  );
  if (owl.specialProgrammeCredit !== wl.totalCredit) {
    throw new BadRequestException("specialProgrammeCredit must equal specialProgrammeWorkload.totalCredit.");
  }
  const topSpJson = canonicalizeJson(wl as unknown as CanonicalValue);
  const nestedSpJson = canonicalizeJson(owl.specialProgrammeWorkload as unknown as CanonicalValue);
  if (topSpJson !== nestedSpJson) {
    throw new BadRequestException("top-level specialProgrammeWorkload and nested specialProgrammeWorkload must be canonical equivalent.");
  }

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
      policyVersionId: s.isWorkloadEligible ? s.policyVersionId : null,
      policyValidatorVersion: s.isWorkloadEligible ? s.policyValidatorVersion : null,
      policyEffectiveFrom: s.isWorkloadEligible ? (s.policyEffectiveFrom ?? null) : null,
      policyEffectiveUntil: s.isWorkloadEligible ? (s.policyEffectiveUntil ?? null) : null,
      teachingWeekdays: s.teachingWeekdays.slice().sort(compare),
      interruptionIds: (s.interruptionIds ?? []).slice().sort(compare),
      appliedRules: s.appliedRules
        .slice()
        .sort((a, b) => a.priority - b.priority || compare(a.ruleId, b.ruleId))
        .map((r) => {
          if (r.sourceKind === 'HOMEROOM_RESPONSIBILITY') {
            return {
              ruleId: r.ruleId,
              calculation: r.calculation,
              value: r.value,
              priority: r.priority,
              sourceKind: 'HOMEROOM_RESPONSIBILITY' as const,
              matchingHomeroomAssignmentIds: (r.matchingHomeroomAssignmentIds ?? []).slice().sort(compare),
              matchingSchoolClassIds: (r.matchingSchoolClassIds ?? []).slice().sort(compare),
            };
          }
          return {
            ruleId: r.ruleId,
            calculation: r.calculation,
            value: r.value,
            priority: r.priority,
            sourceKind: 'ADDITIONAL_DUTY' as const,
            dutyDefinitionId: r.dutyDefinitionId!,
            dutyDefinitionCodeSnapshot: r.dutyDefinitionCodeSnapshot!,
            dutyDefinitionNameSnapshot: r.dutyDefinitionNameSnapshot!,
            qualifyingAssignmentIds: (r.qualifyingAssignmentIds ?? []).slice().sort(compare),
          };
        }),
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
      { fromCivilDate: v4.fromCivilDate, toCivilDate: v4.toCivilDate },
    );
    const topSpJson = canonicalizeJson(v4.specialProgrammeWorkload as unknown as CanonicalValue);
    const nestedSpJson = canonicalizeJson(v4.officialWorkload.specialProgrammeWorkload as unknown as CanonicalValue);
    if (topSpJson !== nestedSpJson) {
      throw new Error("Frozen Reporting Statement V4 top-level and nested special programme workload drift detected.");
    }
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

function nextCivilDate(civilDate: string): string {
  const d = parseCivilDate(civilDate);
  const nextMs = d.getTime() + 86_400_000;
  return formatCivilDate(new Date(nextMs));
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function checkDecimal4(val: unknown): boolean {
  if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val) || val < 0) {
    return false;
  }
  const s = val.toString();
  if (s.includes('e') || s.includes('E')) {
    return false;
  }
  const parts = s.split('.');
  if (parts.length > 1 && parts[1].length > 4) {
    return false;
  }
  return true;
}

const VALID_TEACHING_WEEKDAYS = new Set([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

function validateOfficialTeacherWorkloadSnapshot(
  workload: OfficialTeacherWorkloadSnapshot,
  submitterUserId: string,
  fail: (message: string) => never,
  statementRange?: { fromCivilDate: string; toCivilDate: string },
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
  const expectedEarned = exactAdd(workload.curricularCredit, workload.specialProgrammeCredit);
  if (workload.earnedCredit !== expectedEarned) {
    fail('earnedCredit arithmetic integrity failed.');
  }
  const expectedVariance = exactSub(workload.earnedCredit, workload.requiredCredit);
  if (workload.varianceCredit !== expectedVariance) {
    fail('varianceCredit arithmetic integrity failed.');
  }
  if (!isValidInstantString(workload.evaluatedAt)) {
    fail('official workload evaluatedAt integrity failed.');
  }

  // Nested special programme workload validation
  if (!workload.specialProgrammeWorkload || typeof workload.specialProgrammeWorkload !== 'object') {
    fail('official workload nested specialProgrammeWorkload missing.');
  }
  validateSpecialProgrammeWorkloadSnapshot(
    workload.specialProgrammeWorkload,
    submitterUserId,
    (msg) => fail(`nested special programme ${msg}`),
  );
  if (workload.specialProgrammeCredit !== workload.specialProgrammeWorkload.totalCredit) {
    fail('official workload specialProgrammeCredit must equal nested specialProgrammeWorkload.totalCredit.');
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

  // Validate adjustment segments coverage and range
  if (statementRange) {
    if (workload.adjustmentSegments.length === 0) {
      fail('segment coverage integrity failed: segment list is empty.');
    }
    const firstSeg = workload.adjustmentSegments[0]!;
    if (firstSeg.fromCivilDate !== statementRange.fromCivilDate) {
      fail('segment coverage integrity failed: first segment does not match statement fromCivilDate.');
    }
    const lastSeg = workload.adjustmentSegments[workload.adjustmentSegments.length - 1]!;
    if (lastSeg.toCivilDate !== statementRange.toCivilDate) {
      fail('segment coverage integrity failed: last segment does not match statement toCivilDate.');
    }
  }

  let totalExactRequired = ZERO_RATIONAL;

  for (let i = 0; i < workload.adjustmentSegments.length; i++) {
    const seg = workload.adjustmentSegments[i]!;
    if (!isCivilDate(seg.fromCivilDate) || !isCivilDate(seg.toCivilDate) || seg.fromCivilDate > seg.toCivilDate) {
      fail('segment civil dates integrity failed.');
    }

    if (statementRange) {
      if (seg.fromCivilDate < statementRange.fromCivilDate || seg.toCivilDate > statementRange.toCivilDate) {
        fail('segment coverage integrity failed: segment range outside statement range.');
      }
    }

    if (i > 0) {
      const prevSeg = workload.adjustmentSegments[i - 1]!;
      const expectedNext = nextCivilDate(prevSeg.toCivilDate);
      if (seg.fromCivilDate < expectedNext) {
        fail('segment coverage integrity failed: segment overlap detected.');
      }
      if (seg.fromCivilDate > expectedNext) {
        fail('segment coverage integrity failed: segment gap detected.');
      }
      if (seg.fromCivilDate !== expectedNext) {
        fail('segment coverage integrity failed: segment dates not contiguous.');
      }
    }

    if (typeof seg.calendarVersionId !== 'string' || !seg.calendarVersionId.trim()) {
      fail('segment calendarVersionId integrity failed.');
    }
    if (!Array.isArray(seg.teachingWeekdays) || seg.teachingWeekdays.length === 0) {
      fail('segment teachingWeekdays integrity failed: must be a non-empty array.');
    }
    for (const tw of seg.teachingWeekdays) {
      if (!VALID_TEACHING_WEEKDAYS.has(tw)) {
        fail(`segment teachingWeekdays contains invalid weekday: ${tw}`);
      }
    }
    if (new Set(seg.teachingWeekdays).size !== seg.teachingWeekdays.length) {
      fail('segment teachingWeekdays contains duplicate weekdays.');
    }
    if (seg.denominatorK !== seg.teachingWeekdays.length) {
      fail('segment teachingWeekdays/denominatorK integrity failed.');
    }
    if (typeof seg.hasInterruption !== 'boolean') {
      fail('segment hasInterruption must be a boolean.');
    }
    if (seg.hasInterruption) {
      if (!Array.isArray(seg.interruptionIds) || seg.interruptionIds.length === 0) {
        fail('interrupted segment must have non-empty interruptionIds array.');
      }
      const seenInterruptionIds = new Set<string>();
      for (const id of seg.interruptionIds) {
        if (typeof id !== 'string' || !id.trim()) {
          fail('interrupted segment interruptionId must be a non-empty string.');
        }
        if (seenInterruptionIds.has(id)) {
          fail(`interrupted segment contains duplicate interruptionId: ${id}.`);
        }
        seenInterruptionIds.add(id);
      }
    } else {
      if (seg.interruptionIds !== undefined && seg.interruptionIds !== null) {
        if (!Array.isArray(seg.interruptionIds) || seg.interruptionIds.length > 0) {
          fail('uninterrupted segment must not have interruptionIds.');
        }
      }
    }
    if (typeof seg.isWorkloadEligible !== 'boolean') {
      fail('segment isWorkloadEligible integrity failed.');
    }

    // MAJOR C: Validate array shape before dereferencing it
    if (!Array.isArray(seg.appliedRules)) {
      fail('segment appliedRules integrity failed: must be an array.');
    }

    if (seg.isWorkloadEligible) {
      if (seg.hasInterruption) {
        fail('eligible segment must not claim hasInterruption.');
      }
      if (seg.denominatorK <= 0) {
        fail('segment denominatorK must be positive for eligible segments.');
      }
      let curr = parseCivilDate(seg.fromCivilDate);
      const end = parseCivilDate(seg.toCivilDate);
      while (curr.getTime() <= end.getTime()) {
        const wd = weekdayForCivilDate(curr);
        if (!seg.teachingWeekdays.includes(wd)) {
          fail(`eligible segment spans non-teaching weekday ${wd} on ${formatCivilDate(curr)}.`);
        }
        curr = new Date(curr.getTime() + 86_400_000);
      }
      if (typeof seg.policyVersionId !== 'string' || !seg.policyVersionId.trim()) {
        fail('segment policyVersionId integrity failed.');
      }
      // D. Provenance completeness check
      if (typeof seg.policyValidatorVersion !== 'string' || !seg.policyValidatorVersion.trim()) {
        fail('segment policyValidatorVersion integrity failed.');
      }

      // BLOCKER B: Policy effectivity provenance
      if (typeof seg.policyEffectiveFrom !== 'string' || !isCivilDate(seg.policyEffectiveFrom)) {
        fail('eligible segment policyEffectiveFrom integrity failed: must be a valid civil date.');
      }
      if (seg.policyEffectiveUntil !== null && (typeof seg.policyEffectiveUntil !== 'string' || !isCivilDate(seg.policyEffectiveUntil))) {
        fail('eligible segment policyEffectiveUntil integrity failed: must be null or a valid civil date.');
      }
      if (seg.policyEffectiveUntil !== null && seg.policyEffectiveFrom > seg.policyEffectiveUntil) {
        fail(`eligible segment policyEffectiveUntil must be on or after policyEffectiveFrom: ${seg.policyEffectiveUntil} < ${seg.policyEffectiveFrom}.`);
      }
      if (seg.policyEffectiveFrom > seg.fromCivilDate) {
        fail(`eligible segment policy window starts after segment start: policyEffectiveFrom ${seg.policyEffectiveFrom} > fromCivilDate ${seg.fromCivilDate}.`);
      }
      if (seg.policyEffectiveUntil !== null && seg.toCivilDate > seg.policyEffectiveUntil) {
        fail(`eligible segment policy window ends before segment end: toCivilDate ${seg.toCivilDate} > policyEffectiveUntil ${seg.policyEffectiveUntil}.`);
      }

      // BLOCKER A #1: baseWeeklyNorm decimal precision parity
      if (typeof seg.baseWeeklyNorm !== 'number' || !checkDecimal4(seg.baseWeeklyNorm)) {
        fail('segment baseWeeklyNorm integrity failed: must be a non-negative finite number with at most 4 decimal places without exponential notation.');
      }
      if (typeof seg.adjustedWeeklyNorm !== 'number' || !Number.isFinite(seg.adjustedWeeklyNorm) || seg.adjustedWeeklyNorm < 0) {
        fail('segment adjustedWeeklyNorm integrity failed.');
      }
      if (typeof seg.dailyRequiredCredit !== 'number' || !Number.isFinite(seg.dailyRequiredCredit) || seg.dailyRequiredCredit < 0) {
        fail('segment dailyRequiredCredit integrity failed.');
      }
    } else {
      // Ineligible segment
      if (!seg.hasInterruption) {
        // BLOCKER A: If hasInterruption === false, every civil date in that segment must be outside teachingWeekdays.
        let curr = parseCivilDate(seg.fromCivilDate);
        const end = parseCivilDate(seg.toCivilDate);
        while (curr.getTime() <= end.getTime()) {
          const wd = weekdayForCivilDate(curr);
          if (seg.teachingWeekdays.includes(wd)) {
            fail(`ineligible uninterrupted segment contains teaching weekday ${wd} on ${formatCivilDate(curr)} without interruption provenance.`);
          }
          curr = new Date(curr.getTime() + 86_400_000);
        }
      }
      if (seg.dailyRequiredCredit !== 0) {
        fail('ineligible segment must have dailyRequiredCredit = 0.');
      }
      if (seg.baseWeeklyNorm !== null || seg.adjustedWeeklyNorm !== null) {
        fail('ineligible segment must have null weekly norms.');
      }
      if (seg.policyVersionId !== null || seg.policyValidatorVersion !== null) {
        fail('ineligible segment must have null policyVersionId and policyValidatorVersion.');
      }
      // BLOCKER B: Ineligible segment carrying non-null policy effectivity provenance
      if (seg.policyEffectiveFrom !== null || seg.policyEffectiveUntil !== null) {
        fail('ineligible segment must have null policyEffectiveFrom and policyEffectiveUntil.');
      }
      if (seg.appliedRules.length !== 0) {
        fail('ineligible segment must have empty appliedRules.');
      }
    }

    // BLOCKER B: Mirror canonical WORKLOAD_ADJUSTMENT rule invariants inside frozen V4 integrity
    const seenRuleIds = new Set<string>();
    const seenPriorities = new Set<number>();

    for (const r of seg.appliedRules) {
      if (!r || typeof r !== 'object') {
        fail('segment rule integrity failed: rule must be an object.');
      }

      // BLOCKER A #2: ruleId canonical form
      if (typeof r.ruleId !== 'string' || !r.ruleId || r.ruleId !== r.ruleId.trim() || r.ruleId.length > 100) {
        fail('segment rule ruleId integrity failed: must be a non-empty trimmed string of at most 100 characters.');
      }
      if (seenRuleIds.has(r.ruleId)) {
        fail(`segment rule duplicate ruleId: ${r.ruleId}.`);
      }
      seenRuleIds.add(r.ruleId);

      if (typeof r.priority !== 'number' || !Number.isInteger(r.priority) || r.priority < 0) {
        fail('segment rule priority integrity failed: must be a non-negative integer.');
      }
      if (seenPriorities.has(r.priority)) {
        fail(`segment rule duplicate priority: ${r.priority}.`);
      }
      seenPriorities.add(r.priority);

      // Calculation
      if (r.calculation !== 'TRU_TIET' && r.calculation !== 'TRU_PHAN_TRAM' && r.calculation !== 'GHI_DE') {
        fail(`segment rule calculation unknown: ${r.calculation}.`);
      }
      // BLOCKER A #1: value decimal precision parity
      if (typeof r.value !== 'number' || !checkDecimal4(r.value)) {
        fail('segment rule value integrity failed: must be a non-negative finite number with at most 4 decimal places without exponential notation.');
      }
      if (r.calculation === 'TRU_PHAN_TRAM' && r.value > 100) {
        fail('segment rule TRU_PHAN_TRAM value must not exceed 100.');
      }

      // Source kind
      if (r.sourceKind !== 'ADDITIONAL_DUTY' && r.sourceKind !== 'HOMEROOM_RESPONSIBILITY') {
        fail(`segment rule sourceKind unknown: ${r.sourceKind}.`);
      }

      // Source provenance evidence
      if (r.sourceKind === 'ADDITIONAL_DUTY') {
        // BLOCKER A #3: dutyDefinitionId UUID parity
        if (typeof r.dutyDefinitionId !== 'string' || !UUID_REGEX.test(r.dutyDefinitionId)) {
          fail('segment rule dutyDefinitionId integrity failed: must be a valid UUID.');
        }
        if (typeof r.dutyDefinitionCodeSnapshot !== 'string' || !r.dutyDefinitionCodeSnapshot.trim()) {
          fail('segment rule dutyDefinitionCodeSnapshot integrity failed: must be a non-empty string.');
        }
        if (typeof r.dutyDefinitionNameSnapshot !== 'string' || !r.dutyDefinitionNameSnapshot.trim()) {
          fail('segment rule dutyDefinitionNameSnapshot integrity failed: must be a non-empty string.');
        }
        if (!Array.isArray(r.qualifyingAssignmentIds) || r.qualifyingAssignmentIds.length === 0) {
          fail('segment rule qualifyingAssignmentIds integrity failed: must be a non-empty array.');
        }
        const seenAssignmentIds = new Set<string>();
        for (const id of r.qualifyingAssignmentIds) {
          if (typeof id !== 'string' || !id.trim()) {
            fail('segment rule qualifyingAssignmentIds contains empty string.');
          }
          if (seenAssignmentIds.has(id)) {
            fail(`segment rule qualifyingAssignmentIds contains duplicate id: ${id}.`);
          }
          seenAssignmentIds.add(id);
        }
        if (r.matchingHomeroomAssignmentIds !== undefined && r.matchingHomeroomAssignmentIds !== null) {
          fail('segment rule ADDITIONAL_DUTY must not have matchingHomeroomAssignmentIds.');
        }
        if (r.matchingSchoolClassIds !== undefined && r.matchingSchoolClassIds !== null) {
          fail('segment rule ADDITIONAL_DUTY must not have matchingSchoolClassIds.');
        }
      } else if (r.sourceKind === 'HOMEROOM_RESPONSIBILITY') {
        if (!Array.isArray(r.matchingHomeroomAssignmentIds) || r.matchingHomeroomAssignmentIds.length === 0) {
          fail('segment rule matchingHomeroomAssignmentIds integrity failed: must be a non-empty array.');
        }
        const seenHrIds = new Set<string>();
        for (const id of r.matchingHomeroomAssignmentIds) {
          if (typeof id !== 'string' || !id.trim()) {
            fail('segment rule matchingHomeroomAssignmentIds contains empty string.');
          }
          if (seenHrIds.has(id)) {
            fail(`segment rule matchingHomeroomAssignmentIds contains duplicate id: ${id}.`);
          }
          seenHrIds.add(id);
        }

        if (!Array.isArray(r.matchingSchoolClassIds) || r.matchingSchoolClassIds.length === 0) {
          fail('segment rule matchingSchoolClassIds integrity failed: must be a non-empty array.');
        }
        const seenClassIds = new Set<string>();
        for (const id of r.matchingSchoolClassIds) {
          if (typeof id !== 'string' || !id.trim()) {
            fail('segment rule matchingSchoolClassIds contains empty string.');
          }
          if (seenClassIds.has(id)) {
            fail(`segment rule matchingSchoolClassIds contains duplicate id: ${id}.`);
          }
          seenClassIds.add(id);
        }

        if (r.dutyDefinitionId !== undefined && r.dutyDefinitionId !== null) {
          fail('segment rule HOMEROOM_RESPONSIBILITY must not have dutyDefinitionId.');
        }
        if (r.dutyDefinitionCodeSnapshot !== undefined && r.dutyDefinitionCodeSnapshot !== null) {
          fail('segment rule HOMEROOM_RESPONSIBILITY must not have dutyDefinitionCodeSnapshot.');
        }
        if (r.dutyDefinitionNameSnapshot !== undefined && r.dutyDefinitionNameSnapshot !== null) {
          fail('segment rule HOMEROOM_RESPONSIBILITY must not have dutyDefinitionNameSnapshot.');
        }
        if (r.qualifyingAssignmentIds !== undefined && r.qualifyingAssignmentIds !== null) {
          fail('segment rule HOMEROOM_RESPONSIBILITY must not have qualifyingAssignmentIds.');
        }
      }
    }
    if (seg.isWorkloadEligible) {
      const sortedRules = seg.appliedRules
        .slice()
        .sort(
          (a: { priority: number; ruleId: string }, b: { priority: number; ruleId: string }) =>
            a.priority - b.priority || a.ruleId.localeCompare(b.ruleId),
        );
      const adjustedRational = calculateAdjustedWeeklyNormRational(
        seg.baseWeeklyNorm!,
        sortedRules.map((r: { calculation: string; value: number }) => ({ calculation: r.calculation as never, value: r.value })),
      );
      const expectedAdjusted = rationalRound4(adjustedRational);
      if (seg.adjustedWeeklyNorm !== expectedAdjusted) {
        fail('segment adjustedWeeklyNorm provenance mismatch.');
      }
      if (seg.denominatorK <= 0) {
        fail('segment denominatorK must be positive.');
      }
      const dailyRational = rationalDivInt(adjustedRational, seg.denominatorK);
      const expectedDaily = rationalRound4(dailyRational);
      if (seg.dailyRequiredCredit !== expectedDaily) {
        fail('segment dailyRequiredCredit provenance mismatch.');
      }

      const dayCount = civilDateDayNumber(seg.toCivilDate) - civilDateDayNumber(seg.fromCivilDate) + 1;
      const segmentRequiredRational = rationalMul(dailyRational, makeRational(BigInt(dayCount), 1n));
      totalExactRequired = rationalAdd(totalExactRequired, segmentRequiredRational);
    }
  }

  const expectedRequiredCredit = rationalRound4(totalExactRequired);
  if (workload.requiredCredit !== expectedRequiredCredit) {
    fail('requiredCredit exact provenance reconciliation failed.');
  }
}

export function assertOfficialTeacherWorkloadSnapshotIntegrity(
  workload: OfficialTeacherWorkloadSnapshot,
  submitterUserId: string,
  topLevelSpecialProgrammeWorkload?: SpecialProgrammeWorkloadSnapshot,
  statementRange?: { fromCivilDate: string; toCivilDate: string },
): void {
  validateOfficialTeacherWorkloadSnapshot(
    workload,
    submitterUserId,
    (message) => {
      throw new Error(message);
    },
    statementRange,
  );
  if (topLevelSpecialProgrammeWorkload) {
    const topSpJson = canonicalizeJson(topLevelSpecialProgrammeWorkload as unknown as CanonicalValue);
    const nestedSpJson = canonicalizeJson(workload.specialProgrammeWorkload as unknown as CanonicalValue);
    if (topSpJson !== nestedSpJson) {
      throw new Error('top-level and nested special programme workload drift detected.');
    }
  }
}


function isValidInstantString(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
