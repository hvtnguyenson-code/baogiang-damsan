import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CivilDateString } from '@baogiang/contracts';
import { BusinessConfigurationService } from '../business-configuration/business-configuration.service';
import { formatCivilDate, isCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import {
  SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_PROFILE_V1,
  SpecialProgrammeWorkloadAttestationEvidence,
  SpecialProgrammeWorkloadContribution,
  SpecialProgrammeWorkloadFinding,
  SpecialProgrammeWorkloadPendingConfirmation,
  SpecialProgrammeWorkloadProjection,
  SpecialProgrammeWorkloadProjectionInput,
} from './special-programme-workload-projection.types';
import { SpecialProgrammeWorkloadPolicyPayloadV1 } from '@baogiang/contracts';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class SpecialProgrammeWorkloadProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessConfiguration: BusinessConfigurationService,
  ) {}

  async resolve(
    input: SpecialProgrammeWorkloadProjectionInput,
  ): Promise<SpecialProgrammeWorkloadProjection> {
    return this.resolveInTransaction(this.prisma, input);
  }

  async resolveInTransaction(
    tx: Db,
    input: SpecialProgrammeWorkloadProjectionInput,
  ): Promise<SpecialProgrammeWorkloadProjection> {
    this.validateInput(input);

    const fromDate = parseCivilDate(input.fromCivilDate);
    const toDate = parseCivilDate(input.toCivilDate);
    const evaluatedAt = new Date().toISOString();

    const emptyPassResponse = (
      pending: SpecialProgrammeWorkloadPendingConfirmation[] = [],
    ): SpecialProgrammeWorkloadProjection => ({
      profile: SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_PROFILE_V1,
      status: 'PASS',
      scope: {
        academicYearId: input.academicYearId,
        targetUserId: input.targetUserId,
        fromCivilDate: input.fromCivilDate,
        toCivilDate: input.toCivilDate,
        asOfInstant: input.asOfInstant.toISOString(),
      },
      totalCredit: 0,
      contributionCount: 0,
      contributions: [],
      pendingConfirmation: pending.sort(comparePending),
      findings: [],
      evaluatedAt,
    });

    // 1. Fetch active executions for target user within civil date range created at or before asOfInstant
    const executions = await tx.specialActivityParticipationExecution.findMany({
      where: {
        academicYearId: input.academicYearId,
        actualTeacherUserId: input.targetUserId,
        status: 'ACTIVE',
        executionCivilDate: {
          gte: fromDate,
          lte: toDate,
        },
        createdAt: { lte: input.asOfInstant },
      },
      include: {
        specialActivity: true,
      },
      orderBy: [{ executionCivilDate: 'asc' }, { id: 'asc' }],
    });

    // 2. Filter executions whose status is ACTIVE and SpecialActivity root is ACTIVE
    const activeExecutions = executions.filter(
      (e) =>
        e.status === 'ACTIVE' &&
        e.specialActivity &&
        e.specialActivity.status === 'ACTIVE',
    );

    if (activeExecutions.length === 0) {
      return emptyPassResponse();
    }

    // 3. Find ProgrammeMaterializedActivity provenance
    const specialActivityIds = [
      ...new Set(activeExecutions.map((e) => e.specialActivityId)),
    ];
    const pmas = await tx.programmeMaterializedActivity.findMany({
      where: {
        specialActivityId: { in: specialActivityIds },
      },
    });

    const pmaByActivityId = new Map(pmas.map((p) => [p.specialActivityId, p]));

    // Filter to executions that belong to programme-materialized activities (ignore ad-hoc)
    const programmeExecutions = activeExecutions.filter((e) =>
      pmaByActivityId.has(e.specialActivityId),
    );

    if (programmeExecutions.length === 0) {
      return emptyPassResponse();
    }

    // 4. Batch query related entities to verify coherent linkage
    const masterIds = [...new Set(pmas.map((p) => p.programmeMasterId))];
    const planVersionIds = [...new Set(pmas.map((p) => p.programmePlanVersionId))];
    const topicItemIds = [...new Set(pmas.map((p) => p.programmeTopicItemId))];
    const occurrenceIds = [
      ...new Set(pmas.map((p) => p.plannedProgrammeOccurrenceId)),
    ];
    const slotIds = [...new Set(pmas.map((p) => p.plannedOccurrenceSlotId))];
    const activitySlotIds = [
      ...new Set(programmeExecutions.map((e) => e.specialActivityTimeSlotId)),
    ];

    const [
      masters,
      planVersions,
      topicItems,
      occurrences,
      slots,
      activitySlots,
      attestations,
    ] = await Promise.all([
      tx.programmeMaster.findMany({
        where: { id: { in: masterIds }, academicYearId: input.academicYearId },
      }),
      tx.programmePlanVersion.findMany({
        where: { id: { in: planVersionIds } },
      }),
      tx.programmeTopicItem.findMany({
        where: { id: { in: topicItemIds } },
      }),
      tx.plannedProgrammeOccurrence.findMany({
        where: { id: { in: occurrenceIds }, academicYearId: input.academicYearId },
      }),
      tx.plannedOccurrenceSlot.findMany({
        where: { id: { in: slotIds }, academicYearId: input.academicYearId },
      }),
      tx.specialActivityTimeSlot.findMany({
        where: { id: { in: activitySlotIds }, academicYearId: input.academicYearId },
      }),
      tx.programmeOccurrenceAttestation.findMany({
        where: {
          plannedProgrammeOccurrenceId: { in: occurrenceIds },
          status: 'ACTIVE',
          attestedAt: { lte: input.asOfInstant },
        },
        orderBy: [{ id: 'asc' }],
      }),
    ]);

    const masterMap = new Map(masters.map((m) => [m.id, m]));
    const planVersionMap = new Map(planVersions.map((pv) => [pv.id, pv]));
    const topicItemMap = new Map(topicItems.map((ti) => [ti.id, ti]));
    const occurrenceMap = new Map(occurrences.map((o) => [o.id, o]));
    const slotMap = new Map(slots.map((s) => [s.id, s]));
    const activitySlotMap = new Map(activitySlots.map((as) => [as.id, as]));

    // Group attestations by plannedProgrammeOccurrenceId
    const attestationsByOccurrenceId = new Map<
      string,
      typeof attestations
    >();
    for (const att of attestations) {
      const list = attestationsByOccurrenceId.get(att.plannedProgrammeOccurrenceId);
      if (list) {
        list.push(att);
      } else {
        attestationsByOccurrenceId.set(att.plannedProgrammeOccurrenceId, [att]);
      }
    }

    // 5. Group executions by plannedOccurrenceSlotId (at most one per plannedOccurrenceSlotId + actualTeacherUserId)
    const slotExecutionsMap = new Map<
      string,
      typeof programmeExecutions[0]
    >();

    for (const exec of programmeExecutions) {
      const pma = pmaByActivityId.get(exec.specialActivityId);
      if (!pma) continue;

      // Verify relational coherence
      const master = masterMap.get(pma.programmeMasterId);
      const planVersion = planVersionMap.get(pma.programmePlanVersionId);
      const topicItem = topicItemMap.get(pma.programmeTopicItemId);
      const occurrence = occurrenceMap.get(pma.plannedProgrammeOccurrenceId);
      const slot = slotMap.get(pma.plannedOccurrenceSlotId);
      const activitySlot = activitySlotMap.get(exec.specialActivityTimeSlotId);

      if (
        !master ||
        !planVersion ||
        planVersion.programmeMasterId !== master.id ||
        !topicItem ||
        topicItem.programmePlanVersionId !== planVersion.id ||
        !occurrence ||
        occurrence.programmeMasterId !== master.id ||
        !slot ||
        slot.plannedProgrammeOccurrenceId !== occurrence.id ||
        !activitySlot ||
        activitySlot.timeSlotDefinitionId !== slot.timeSlotDefinitionId
      ) {
        continue;
      }

      if (!slotExecutionsMap.has(pma.plannedOccurrenceSlotId)) {
        slotExecutionsMap.set(pma.plannedOccurrenceSlotId, exec);
      }
    }

    const pendingConfirmations: SpecialProgrammeWorkloadPendingConfirmation[] = [];
    interface EligibleCandidate {
      execution: typeof programmeExecutions[0];
      pma: typeof pmas[0];
      master: typeof masters[0];
      occurrence: typeof occurrences[0];
      attestations: typeof attestations;
    }
    const eligibleCandidates: EligibleCandidate[] = [];

    for (const [slotId, exec] of slotExecutionsMap.entries()) {
      const pma = pmaByActivityId.get(exec.specialActivityId)!;
      const master = masterMap.get(pma.programmeMasterId)!;
      const occurrence = occurrenceMap.get(pma.plannedProgrammeOccurrenceId)!;
      const occurrenceAtts =
        attestationsByOccurrenceId.get(occurrence.id) ?? [];

      const civilDateStr = formatCivilDate(exec.executionCivilDate) as CivilDateString;

      if (occurrenceAtts.length === 0) {
        // Pending confirmation
        pendingConfirmations.push({
          executionId: exec.id,
          specialActivityId: exec.specialActivityId,
          specialActivityStaffingId: exec.specialActivityStaffingId,
          specialActivityTimeSlotId: exec.specialActivityTimeSlotId,
          programmeMasterId: pma.programmeMasterId,
          programmePlanVersionId: pma.programmePlanVersionId,
          programmeTopicItemId: pma.programmeTopicItemId,
          plannedProgrammeOccurrenceId: pma.plannedProgrammeOccurrenceId,
          plannedOccurrenceSlotId: slotId,
          programmeKind: master.kind,
          occurrenceMode: occurrence.mode,
          executionCivilDate: civilDateStr,
          actualTeacherUserId: exec.actualTeacherUserId,
          reason: 'PENDING_ATTESTATION',
        });
      } else {
        // Eligible for workload contribution
        eligibleCandidates.push({
          execution: exec,
          pma,
          master,
          occurrence,
          attestations: occurrenceAtts,
        });
      }
    }

    // 6. Policy resolution
    if (eligibleCandidates.length === 0) {
      return emptyPassResponse(pendingConfirmations);
    }

    type EffectivePolicyResolution = Awaited<
      ReturnType<BusinessConfigurationService['resolveEffectiveBusinessPolicy']>
    >;
    const policyResolutionCache = new Map<string, EffectivePolicyResolution>();
    const findings: SpecialProgrammeWorkloadFinding[] = [];
    const contributions: SpecialProgrammeWorkloadContribution[] = [];

    for (const candidate of eligibleCandidates) {
      const civilDateStr = formatCivilDate(
        candidate.execution.executionCivilDate,
      ) as CivilDateString;

      let policyRes = policyResolutionCache.get(civilDateStr);
      if (!policyRes) {
        policyRes = await this.businessConfiguration.resolveEffectiveBusinessPolicy(
          'SPECIAL_PROGRAMME_WORKLOAD',
          { kind: 'ACADEMIC_YEAR', academicYearId: input.academicYearId },
          civilDateStr,
          tx,
        );
        policyResolutionCache.set(civilDateStr, policyRes);
      }

      if (policyRes.outcome !== 'RESOLVED' || !policyRes.payload) {
        findings.push({
          code: `SPECIAL_PROGRAMME_WORKLOAD_POLICY_${policyRes.outcome}`,
          message: `Chính sách SPECIAL_PROGRAMME_WORKLOAD không hợp lệ hoặc chưa được cấu hình (${policyRes.outcome}) cho ngày ${civilDateStr}.`,
          severity: 'BLOCKER',
          entityIds: [
            candidate.execution.id,
            candidate.pma.plannedOccurrenceSlotId,
          ],
        });
        continue;
      }

      const payload = policyRes.payload as unknown as SpecialProgrammeWorkloadPolicyPayloadV1;
      const kindCoeffs =
        payload.coefficients?.[
          candidate.master.kind as keyof typeof payload.coefficients
        ];
      const coef =
        kindCoeffs?.[
          candidate.occurrence.mode as keyof typeof kindCoeffs
        ];

      if (typeof coef !== 'number' || !Number.isFinite(coef) || coef < 0) {
        findings.push({
          code: 'SPECIAL_PROGRAMME_WORKLOAD_POLICY_COEFFICIENT_INVALID',
          message: `Không tìm thấy hệ số định mức hợp lệ cho ${candidate.master.kind} ${candidate.occurrence.mode}.`,
          severity: 'BLOCKER',
          entityIds: [
            candidate.execution.id,
            candidate.pma.plannedOccurrenceSlotId,
          ],
        });
        continue;
      }

      const sortedAttestations: SpecialProgrammeWorkloadAttestationEvidence[] =
        candidate.attestations
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((att) => ({
            attestationId: att.id,
            attestedByUserId: att.attestedByUserId,
            authorityType: att.authorityType,
            capabilityKey: att.capabilityKey,
            scope: att.scope,
            resourceId: att.scopeResourceId ?? null,
            attestedAt: att.attestedAt.toISOString(),
          }));

      contributions.push({
        executionId: candidate.execution.id,
        specialActivityId: candidate.execution.specialActivityId,
        specialActivityStaffingId: candidate.execution.specialActivityStaffingId,
        specialActivityTimeSlotId: candidate.execution.specialActivityTimeSlotId,
        programmeMasterId: candidate.pma.programmeMasterId,
        programmePlanVersionId: candidate.pma.programmePlanVersionId,
        programmeTopicItemId: candidate.pma.programmeTopicItemId,
        plannedProgrammeOccurrenceId: candidate.pma.plannedProgrammeOccurrenceId,
        plannedOccurrenceSlotId: candidate.pma.plannedOccurrenceSlotId,
        programmeKind: candidate.master.kind,
        occurrenceMode: candidate.occurrence.mode,
        executionCivilDate: civilDateStr,
        actualTeacherUserId: candidate.execution.actualTeacherUserId,
        coefficient: coef,
        credit: coef,
        policyVersionId: policyRes.policyVersionId!,
        policyValidatorVersion: policyRes.validatorVersion!,
        policyEffectiveFrom: policyRes.effectiveFrom,
        policyEffectiveUntil: policyRes.effectiveUntil ?? null,
        attestations: sortedAttestations,
      });
    }

    const hasBlocker = findings.some((f) => f.severity === 'BLOCKER');
    const sortedContributions = contributions.sort(compareContribution);
    const sortedPending = pendingConfirmations.sort(comparePending);

    if (hasBlocker) {
      return {
        profile: SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_PROFILE_V1,
        status: 'BLOCKED',
        scope: {
          academicYearId: input.academicYearId,
          targetUserId: input.targetUserId,
          fromCivilDate: input.fromCivilDate,
          toCivilDate: input.toCivilDate,
          asOfInstant: input.asOfInstant.toISOString(),
        },
        totalCredit: null,
        contributionCount: null,
        contributions: [],
        pendingConfirmation: sortedPending,
        findings,
        evaluatedAt,
      };
    }

    const totalCredit =
      Math.round(
        sortedContributions.reduce((sum, c) => sum + c.credit, 0) * 10000,
      ) / 10000;

    return {
      profile: SPECIAL_PROGRAMME_WORKLOAD_PROJECTION_PROFILE_V1,
      status: 'PASS',
      scope: {
        academicYearId: input.academicYearId,
        targetUserId: input.targetUserId,
        fromCivilDate: input.fromCivilDate,
        toCivilDate: input.toCivilDate,
        asOfInstant: input.asOfInstant.toISOString(),
      },
      totalCredit,
      contributionCount: sortedContributions.length,
      contributions: sortedContributions,
      pendingConfirmation: sortedPending,
      findings: [],
      evaluatedAt,
    };
  }

  private validateInput(input: SpecialProgrammeWorkloadProjectionInput): void {
    if (!input.academicYearId || typeof input.academicYearId !== 'string') {
      throw new BadRequestException('academicYearId must be a non-empty string.');
    }
    if (!input.targetUserId || typeof input.targetUserId !== 'string') {
      throw new BadRequestException('targetUserId must be a non-empty string.');
    }
    if (!isCivilDate(input.fromCivilDate)) {
      throw new BadRequestException('fromCivilDate must be a valid civil date in YYYY-MM-DD format.');
    }
    if (!isCivilDate(input.toCivilDate)) {
      throw new BadRequestException('toCivilDate must be a valid civil date in YYYY-MM-DD format.');
    }
    if (parseCivilDate(input.fromCivilDate) > parseCivilDate(input.toCivilDate)) {
      throw new BadRequestException('fromCivilDate must not be after toCivilDate.');
    }
    if (
      !(input.asOfInstant instanceof Date) ||
      Number.isNaN(input.asOfInstant.getTime())
    ) {
      throw new BadRequestException('asOfInstant must be a valid Date.');
    }
  }
}

function compareContribution(
  a: SpecialProgrammeWorkloadContribution,
  b: SpecialProgrammeWorkloadContribution,
): number {
  return (
    a.executionCivilDate.localeCompare(b.executionCivilDate) ||
    a.plannedOccurrenceSlotId.localeCompare(b.plannedOccurrenceSlotId) ||
    a.executionId.localeCompare(b.executionId)
  );
}

function comparePending(
  a: SpecialProgrammeWorkloadPendingConfirmation,
  b: SpecialProgrammeWorkloadPendingConfirmation,
): number {
  return (
    a.executionCivilDate.localeCompare(b.executionCivilDate) ||
    a.plannedOccurrenceSlotId.localeCompare(b.plannedOccurrenceSlotId) ||
    a.executionId.localeCompare(b.executionId)
  );
}
