import { BadRequestException, Injectable } from '@nestjs/common';
import { AdditionalDutyDefinition, Prisma, StaffAdditionalDutyAssignment, TeachingExecutionStatus } from '@prisma/client';
import {
  BusinessPolicyResolution,
  CivilDateString,
  WorkloadAdjustmentPolicyPayloadV1,
  WorkloadAdjustmentRuleV1,
} from '@baogiang/contracts';
import { BusinessConfigurationService } from '../business-configuration/business-configuration.service';
import { formatCivilDate, hcmCivilDate, isCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { SpecialProgrammeWorkloadProjectionService } from '../special-programme-workload/special-programme-workload-projection.service';
import { weekdayForCivilDate } from '../special-activities/special-activity-policy';
import {
  calculateAdjustedWeeklyNormRational,
  sortAdjustmentRules,
} from './workload-adjustment-formula';
import {
  Rational,
  ZERO_RATIONAL,
  rationalRound4,
  rationalDivInt,
  rationalAdd,
  exactAdd,
  exactSub,
} from '../common/decimal/exact-decimal';
import {
  CurricularWorkloadContribution,
  OFFICIAL_TEACHER_WORKLOAD_PROJECTION_PROFILE_V1,
  OfficialTeacherWorkloadProjection,
  OfficialTeacherWorkloadProjectionInput,
  OfficialWorkloadFinding,
  WorkloadAdjustmentAppliedRule,
  WorkloadAdjustmentSegment,
} from './official-workload.types';

interface DailyWorkloadEvaluation {
  civilDate: CivilDateString;
  isWorkloadEligible: boolean;
  calendarVersionId: string;
  teachingWeekdays: string[];
  denominatorK: number;
  hasInterruption: boolean;
  interruptionIds: string[];
  policyVersionId: string | null;
  policyValidatorVersion: string | null;
  policyEffectiveFrom?: string | null;
  policyEffectiveUntil?: string | null;
  baseWeeklyNorm: number | null;
  adjustedWeeklyNorm: number | null;
  dailyRequiredCredit: number;
  dailyRequiredRational?: Rational;
  appliedRules: WorkloadAdjustmentAppliedRule[];
}

@Injectable()
export class OfficialWorkloadProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessConfiguration: BusinessConfigurationService,
    private readonly specialProgrammeWorkload: SpecialProgrammeWorkloadProjectionService,
  ) {}

  async resolve(
    input: OfficialTeacherWorkloadProjectionInput,
  ): Promise<OfficialTeacherWorkloadProjection> {
    return this.prisma.$transaction(
      async (tx) => this.resolveInTransaction(tx, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async resolveInTransaction(
    tx: Prisma.TransactionClient,
    input: OfficialTeacherWorkloadProjectionInput,
  ): Promise<OfficialTeacherWorkloadProjection> {
    this.validateInput(input);
    const evaluatedAt = new Date().toISOString();
    const findings: OfficialWorkloadFinding[] = [];

    // 1. Curricular Workload (T49)
    const curricularResult = await this.resolveCurricularWorkload(tx, input);
    findings.push(...curricularResult.findings);

    // 2. Special Programme Workload (P4-050 reuse)
    const specialWorkload = await this.specialProgrammeWorkload.resolveInTransaction(tx, {
      academicYearId: input.academicYearId,
      targetUserId: input.targetUserId,
      fromCivilDate: input.fromCivilDate,
      toCivilDate: input.toCivilDate,
      asOfInstant: input.asOfInstant,
    });

    if (specialWorkload.status === 'BLOCKED') {
      findings.push({
        code: 'SPECIAL_PROGRAMME_WORKLOAD_BLOCKED',
        message: 'Tổng hợp khối lượng chuyên đề / GDĐP / HĐTN-HN bị chặn.',
        severity: 'BLOCKER',
        entityIds: [],
      });
      findings.push(...specialWorkload.findings);
    }

    // 3. Required Workload & Adjustment Segments
    const requiredResult = await this.resolveRequiredWorkload(tx, input);
    findings.push(...requiredResult.findings);

    const hasBlockers = findings.some((f) => f.severity === 'BLOCKER') ||
      curricularResult.status === 'BLOCKED' ||
      specialWorkload.status === 'BLOCKED' ||
      requiredResult.status === 'BLOCKED';

    if (hasBlockers) {
      return {
        profile: OFFICIAL_TEACHER_WORKLOAD_PROJECTION_PROFILE_V1,
        status: 'BLOCKED',
        scope: {
          academicYearId: input.academicYearId,
          targetUserId: input.targetUserId,
          fromCivilDate: input.fromCivilDate,
          toCivilDate: input.toCivilDate,
          asOfInstant: input.asOfInstant.toISOString(),
        },
        curricularWorkload: {
          status: curricularResult.status,
          totalCredit: null,
          contributionCount: null,
          contributions: [],
          findings: curricularResult.findings,
        },
        specialProgrammeWorkload: specialWorkload,
        earnedCredit: null,
        requiredCredit: null,
        varianceCredit: null,
        adjustmentSegments: requiredResult.segments,
        findings: this.deduplicateFindings(findings),
        evaluatedAt,
      };
    }

    const curricularCredit = curricularResult.totalCredit;
    const specialCredit = specialWorkload.totalCredit ?? 0;
    const earnedCredit = exactAdd(curricularCredit, specialCredit);
    const requiredCredit = requiredResult.totalRequiredCredit;
    const varianceCredit = exactSub(earnedCredit, requiredCredit);

    return {
      profile: OFFICIAL_TEACHER_WORKLOAD_PROJECTION_PROFILE_V1,
      status: 'PASS',
      scope: {
        academicYearId: input.academicYearId,
        targetUserId: input.targetUserId,
        fromCivilDate: input.fromCivilDate,
        toCivilDate: input.toCivilDate,
        asOfInstant: input.asOfInstant.toISOString(),
      },
      curricularWorkload: {
        status: 'PASS',
        totalCredit: curricularResult.totalCredit,
        contributionCount: curricularResult.contributions.length,
        contributions: curricularResult.contributions,
        findings: [],
      },
      specialProgrammeWorkload: specialWorkload,
      earnedCredit,
      requiredCredit,
      varianceCredit,
      adjustmentSegments: requiredResult.segments,
      findings: [],
      evaluatedAt,
    };
  }

  private validateInput(input: OfficialTeacherWorkloadProjectionInput): void {
    if (!input) throw new BadRequestException('Input is required.');
    if (!isCivilDate(input.fromCivilDate) || !isCivilDate(input.toCivilDate)) {
      throw new BadRequestException('fromCivilDate and toCivilDate must be valid civil dates (YYYY-MM-DD).');
    }
    if (input.fromCivilDate > input.toCivilDate) {
      throw new BadRequestException('fromCivilDate must be before or equal to toCivilDate.');
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
    if (!uuidRegex.test(input.academicYearId)) {
      throw new BadRequestException('academicYearId must be a valid UUID.');
    }
    if (!uuidRegex.test(input.targetUserId)) {
      throw new BadRequestException('targetUserId must be a valid UUID.');
    }
    if (!(input.asOfInstant instanceof Date) || Number.isNaN(input.asOfInstant.getTime())) {
      throw new BadRequestException('asOfInstant must be a valid Date.');
    }
  }

  private async resolveCurricularWorkload(
    tx: Prisma.TransactionClient,
    input: OfficialTeacherWorkloadProjectionInput,
  ): Promise<{
    status: 'PASS' | 'BLOCKED';
    totalCredit: number;
    contributions: CurricularWorkloadContribution[];
    findings: OfficialWorkloadFinding[];
  }> {
    const executions = await tx.curricularTeachingExecution.findMany({
      where: {
        academicYearId: input.academicYearId,
        actualTeacherUserId: input.targetUserId,
        status: TeachingExecutionStatus.ACTIVE,
        executionCivilDate: {
          gte: parseCivilDate(input.fromCivilDate),
          lte: parseCivilDate(input.toCivilDate),
        },
      },
      orderBy: [
        { executionCivilDate: 'asc' },
        { executionTimeSlotDefinitionId: 'asc' },
        { id: 'asc' },
      ],
    });

    const contributions: CurricularWorkloadContribution[] = executions.map((e) => ({
      executionId: e.id,
      kind: e.kind,
      executionCivilDate: formatCivilDate(e.executionCivilDate) as CivilDateString,
      actualTeacherUserId: e.actualTeacherUserId,
      credit: 1,
      schoolClassId: e.schoolClassId,
      subjectId: e.subjectId,
      originalTimetableEntryId: e.originalTimetableEntryId,
      sourceCivilDate: formatCivilDate(e.sourceCivilDate) as CivilDateString,
      replacesId: e.replacesId,
    }));

    return {
      status: 'PASS',
      totalCredit: contributions.length,
      contributions,
      findings: [],
    };
  }

  private async resolveRequiredWorkload(
    tx: Prisma.TransactionClient,
    input: OfficialTeacherWorkloadProjectionInput,
  ): Promise<{
    status: 'PASS' | 'BLOCKED';
    totalRequiredCredit: number;
    segments: WorkloadAdjustmentSegment[];
    findings: OfficialWorkloadFinding[];
  }> {
    const findings: OfficialWorkloadFinding[] = [];
    const dates = this.enumerateCivilDates(input.fromCivilDate, input.toCivilDate);

    // Prefetch active calendar versions covering the academic year
    const calendarVersions = await tx.academicCalendarVersion.findMany({
      where: {
        academicYearId: input.academicYearId,
        isActive: true,
      },
      include: {
        interruptions: {
          orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }],
    });

    // Prefetch target teacher's active homeroom assignments
    const homeroomAssignments = await tx.homeroomAssignment.findMany({
      where: {
        academicYearId: input.academicYearId,
        teacherUserId: input.targetUserId,
        status: 'ACTIVE',
      },
      include: {
        schoolClass: true,
      },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    });

    // Prefetch target teacher's staff profile and duty assignments
    const staffProfile = await tx.staffProfile.findUnique({
      where: { userId: input.targetUserId },
    });

    let dutyAssignments: Array<StaffAdditionalDutyAssignment & { dutyDefinition: AdditionalDutyDefinition }> = [];
    if (staffProfile) {
      dutyAssignments = await tx.staffAdditionalDutyAssignment.findMany({
        where: { staffProfileId: staffProfile.id },
        include: { dutyDefinition: true },
        orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
      });
    }

    const policyCache = new Map<string, BusinessPolicyResolution>();
    const dutyDefCache = new Map<string, AdditionalDutyDefinition | null>();
    const dailyEvaluations: DailyWorkloadEvaluation[] = [];

    let hasAnyEligibleDate = false;

    for (const d of dates) {
      const dDate = parseCivilDate(d);
      // Calendar resolution
      const coveringCalendars = calendarVersions.filter((c) => {
        const startStr = formatCivilDate(c.startDate);
        const endStr = formatCivilDate(c.endDate);
        return startStr <= d && d <= endStr;
      });

      if (coveringCalendars.length === 0) {
        findings.push({
          code: 'CALENDAR_VERSION_NOT_FOUND',
          message: `Không tìm thấy phiên lịch năm học đang hoạt động cho ngày ${d}.`,
          severity: 'BLOCKER',
          entityIds: [],
        });
        continue;
      }

      if (coveringCalendars.length > 1) {
        findings.push({
          code: 'CALENDAR_VERSION_AMBIGUOUS',
          message: `Tồn tại nhiều hơn một phiên lịch năm học hoạt động chồng lấn cho ngày ${d}.`,
          severity: 'BLOCKER',
          entityIds: coveringCalendars.map((c) => c.id),
        });
        continue;
      }

      const calendar = coveringCalendars[0];
      if (!calendar.teachingWeekdays || calendar.teachingWeekdays.length === 0) {
        findings.push({
          code: 'TEACHING_WEEKDAYS_EMPTY',
          message: `Phiên lịch năm học ${calendar.id} không có cấu hình ngày dạy trong tuần (teachingWeekdays) cho ngày ${d}.`,
          severity: 'BLOCKER',
          entityIds: [calendar.id],
        });
        continue;
      }

      const weekday = weekdayForCivilDate(dDate);
      const isTeachingWeekday = calendar.teachingWeekdays.includes(weekday);

      const interruptions = calendar.interruptions.filter((i) => {
        const startStr = formatCivilDate(i.startDate);
        const endStr = formatCivilDate(i.endDate);
        return startStr <= d && d <= endStr;
      });
      const hasInterruption = interruptions.length > 0;

      const isWorkloadEligible = isTeachingWeekday && !hasInterruption;
      const denominatorK = calendar.teachingWeekdays.length;

      if (!isWorkloadEligible) {
        dailyEvaluations.push({
          civilDate: d,
          isWorkloadEligible: false,
          calendarVersionId: calendar.id,
          teachingWeekdays: calendar.teachingWeekdays.slice().sort(),
          denominatorK,
          hasInterruption,
          interruptionIds: interruptions.map((i) => i.id).sort(),
          policyVersionId: null,
          policyValidatorVersion: null,
          policyEffectiveFrom: null,
          policyEffectiveUntil: null,
          baseWeeklyNorm: null,
          adjustedWeeklyNorm: null,
          dailyRequiredCredit: 0,
          appliedRules: [],
        });
        continue;
      }

      // Day is workload-eligible!
      hasAnyEligibleDate = true;

      // Policy resolution for date d
      let policyRes = policyCache.get(d);
      if (!policyRes) {
        policyRes = await this.businessConfiguration.resolveEffectiveBusinessPolicy(
          'WORKLOAD_ADJUSTMENT',
          { kind: 'ACADEMIC_YEAR', academicYearId: input.academicYearId },
          d,
          tx,
        );
        policyCache.set(d, policyRes);
      }

      if (policyRes.outcome !== 'RESOLVED' || !policyRes.payload) {
        const findingCode = policyRes.outcome.startsWith('POLICY_')
          ? `WORKLOAD_ADJUSTMENT_${policyRes.outcome}`
          : `WORKLOAD_ADJUSTMENT_POLICY_${policyRes.outcome}`;
        findings.push({
          code: findingCode,
          message: `Chính sách WORKLOAD_ADJUSTMENT không hợp lệ hoặc chưa được cấu hình (${policyRes.outcome}) cho ngày ${d}.`,
          severity: 'BLOCKER',
          entityIds: [],
        });
        continue;
      }

      const payload = policyRes.payload as unknown as WorkloadAdjustmentPolicyPayloadV1;

      // Evaluate Homeroom Responsibility for target teacher on date d
      const matchingHomerooms = homeroomAssignments.filter((h) => {
        const fromStr = formatCivilDate(h.validFrom);
        const untilStr = h.validUntil ? formatCivilDate(h.validUntil) : null;
        return fromStr <= d && (untilStr === null || d <= untilStr);
      });
      const hasHomeroom = matchingHomerooms.length > 0;

      // Evaluate Additional Duty Assignments for target teacher on date d
      const effectiveDutyAssignments = dutyAssignments.filter((a) => {
        const fromDateStr = hcmCivilDate(a.validFrom);
        const untilDateStr = a.validUntil ? hcmCivilDate(a.validUntil) : null;
        return fromDateStr <= d && (untilDateStr === null || d < untilDateStr);
      });

      // Verify all rules with ADDITIONAL_DUTY source have valid referenced definition in DB
      let dutyDefMissing = false;
      for (const rule of payload.rules) {
        if (rule.source.kind === 'ADDITIONAL_DUTY') {
          const defId = rule.source.dutyDefinitionId;
          if (!dutyDefCache.has(defId)) {
            const defRow = await tx.additionalDutyDefinition.findUnique({ where: { id: defId } });
            dutyDefCache.set(defId, defRow);
          }
          const dutyDef = dutyDefCache.get(defId);
          if (!dutyDef) {
            findings.push({
              code: 'ADDITIONAL_DUTY_DEFINITION_MISSING',
              message: `Không tìm thấy định nghĩa nhiệm vụ kiêm nhiệm (dutyDefinitionId: ${defId}) được tham chiếu bởi quy tắc điều chỉnh định mức.`,
              severity: 'BLOCKER',
              entityIds: [defId],
            });
            dutyDefMissing = true;
          }
        }
      }
      if (dutyDefMissing) {
        continue;
      }

      // Match rules
      const applicableRules: WorkloadAdjustmentRuleV1[] = [];
      const appliedRulesProvenance: WorkloadAdjustmentAppliedRule[] = [];

      for (const rule of payload.rules) {
        const source = rule.source;
        if (source.kind === 'HOMEROOM_RESPONSIBILITY') {
          if (hasHomeroom) {
            applicableRules.push(rule);
            appliedRulesProvenance.push({
              ruleId: rule.ruleId,
              calculation: rule.calculation,
              value: rule.value,
              priority: rule.priority,
              sourceKind: 'HOMEROOM_RESPONSIBILITY',
              matchingHomeroomAssignmentIds: matchingHomerooms.map((h) => h.id).sort(),
              matchingSchoolClassIds: matchingHomerooms.map((h) => h.schoolClassId).sort(),
            });
          }
        } else if (source.kind === 'ADDITIONAL_DUTY') {
          const dutyDefinitionId = source.dutyDefinitionId;
          const matchingDuty = effectiveDutyAssignments.filter(
            (a) => a.dutyDefinitionId === dutyDefinitionId,
          );
          if (matchingDuty.length > 0) {
            applicableRules.push(rule);
            const def = dutyDefCache.get(dutyDefinitionId)!;
            appliedRulesProvenance.push({
              ruleId: rule.ruleId,
              calculation: rule.calculation,
              value: rule.value,
              priority: rule.priority,
              sourceKind: 'ADDITIONAL_DUTY',
              dutyDefinitionId,
              dutyDefinitionCodeSnapshot: def.code,
              dutyDefinitionNameSnapshot: def.name,
              qualifyingAssignmentIds: matchingDuty.map((a) => a.id).sort(),
            });
          }
        }
      }

      // Sort applicable rules by priority ASC
      const sortedApplicable = sortAdjustmentRules(applicableRules);
      const sortedAppliedProvenance = appliedRulesProvenance
        .slice()
        .sort((a, b) => a.priority - b.priority || a.ruleId.localeCompare(b.ruleId));

      const adjustedWeeklyNormRational = calculateAdjustedWeeklyNormRational(
        payload.baseWeeklyNorm,
        sortedApplicable,
      );
      const adjustedWeeklyNorm = rationalRound4(adjustedWeeklyNormRational);
      const dailyRequiredRational = rationalDivInt(adjustedWeeklyNormRational, denominatorK);
      const dailyRequiredCredit = rationalRound4(dailyRequiredRational);

      dailyEvaluations.push({
        civilDate: d,
        isWorkloadEligible: true,
        calendarVersionId: calendar.id,
        teachingWeekdays: calendar.teachingWeekdays.slice().sort(),
        denominatorK,
        hasInterruption: false,
        interruptionIds: [],
        policyVersionId: (policyRes.outcome === 'RESOLVED' && policyRes.policyVersionId) ? policyRes.policyVersionId : null,
        policyValidatorVersion: (policyRes.outcome === 'RESOLVED' && policyRes.validatorVersion) ? policyRes.validatorVersion : null,
        policyEffectiveFrom: (policyRes.outcome === 'RESOLVED' && policyRes.effectiveFrom)
          ? policyRes.effectiveFrom
          : null,
        policyEffectiveUntil: (policyRes.outcome === 'RESOLVED' && policyRes.effectiveUntil)
          ? policyRes.effectiveUntil
          : null,
        baseWeeklyNorm: payload.baseWeeklyNorm,
        adjustedWeeklyNorm,
        dailyRequiredCredit,
        dailyRequiredRational,
        appliedRules: sortedAppliedProvenance,
      });
    }

    if (findings.some((f) => f.severity === 'BLOCKER')) {
      return {
        status: 'BLOCKED',
        totalRequiredCredit: 0,
        segments: this.compressSegments(dailyEvaluations),
        findings,
      };
    }

    if (!hasAnyEligibleDate) {
      return {
        status: 'PASS',
        totalRequiredCredit: 0,
        segments: this.compressSegments(dailyEvaluations),
        findings: [],
      };
    }

    let totalRequiredRational = ZERO_RATIONAL;
    for (const evalDay of dailyEvaluations) {
      if (evalDay.dailyRequiredRational) {
        totalRequiredRational = rationalAdd(totalRequiredRational, evalDay.dailyRequiredRational);
      }
    }
    const totalRequiredCredit = rationalRound4(totalRequiredRational);
    const segments = this.compressSegments(dailyEvaluations);

    return {
      status: 'PASS',
      totalRequiredCredit,
      segments,
      findings: [],
    };
  }

  private compressSegments(evaluations: DailyWorkloadEvaluation[]): WorkloadAdjustmentSegment[] {
    if (evaluations.length === 0) return [];

    const segments: WorkloadAdjustmentSegment[] = [];
    let currentSeg: WorkloadAdjustmentSegment | null = null;
    let currentKey = '';

    for (const e of evaluations) {
      const key = this.segmentKey(e);
      if (currentSeg && key === currentKey) {
        currentSeg.toCivilDate = e.civilDate;
      } else {
        currentSeg = {
          fromCivilDate: e.civilDate,
          toCivilDate: e.civilDate,
          isWorkloadEligible: e.isWorkloadEligible,
          calendarVersionId: e.calendarVersionId,
          teachingWeekdays: e.teachingWeekdays,
          denominatorK: e.denominatorK,
          hasInterruption: e.hasInterruption,
          interruptionIds: e.interruptionIds,
          policyVersionId: e.policyVersionId,
          policyValidatorVersion: e.policyValidatorVersion,
          policyEffectiveFrom: e.policyEffectiveFrom,
          policyEffectiveUntil: e.policyEffectiveUntil,
          baseWeeklyNorm: e.baseWeeklyNorm,
          adjustedWeeklyNorm: e.adjustedWeeklyNorm,
          dailyRequiredCredit: e.dailyRequiredCredit,
          appliedRules: e.appliedRules,
        };
        segments.push(currentSeg);
        currentKey = key;
      }
    }

    return segments;
  }

  private segmentKey(e: DailyWorkloadEvaluation): string {
    const rulesSignature = e.appliedRules
      .map((r) => `${r.ruleId}:${r.calculation}:${r.value}:${r.priority}:${r.sourceKind}:${r.dutyDefinitionId ?? ''}:${(r.qualifyingAssignmentIds ?? []).join(',')}:${(r.matchingHomeroomAssignmentIds ?? []).join(',')}`)
      .join('|');
    return [
      e.isWorkloadEligible ? 'ELIGIBLE' : 'INELIGIBLE',
      e.calendarVersionId,
      e.teachingWeekdays.join(','),
      e.denominatorK,
      e.hasInterruption ? 'INTERRUPTED' : 'NOT_INTERRUPTED',
      e.interruptionIds.join(','),
      e.policyVersionId ?? 'NO_POLICY',
      e.policyValidatorVersion ?? '',
      e.policyEffectiveFrom ?? '',
      e.policyEffectiveUntil ?? '',
      e.baseWeeklyNorm ?? '',
      e.adjustedWeeklyNorm ?? '',
      rulesSignature,
    ].join('::');
  }

  private enumerateCivilDates(from: CivilDateString, to: CivilDateString): CivilDateString[] {
    const list: CivilDateString[] = [];
    let curr = parseCivilDate(from);
    const end = parseCivilDate(to);
    while (curr.getTime() <= end.getTime()) {
      list.push(formatCivilDate(curr) as CivilDateString);
      curr = new Date(curr.getTime() + 86400000);
    }
    return list;
  }

  private deduplicateFindings(findings: OfficialWorkloadFinding[]): OfficialWorkloadFinding[] {
    const seen = new Set<string>();
    const result: OfficialWorkloadFinding[] = [];
    for (const f of findings) {
      const key = `${f.code}::${f.message}::${f.entityIds.slice().sort().join(',')}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(f);
      }
    }
    return result;
  }
}
