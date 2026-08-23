import { BadRequestException, Injectable, Inject } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  formatCivilDate,
  parseCivilDate,
} from "../common/validation/civil-date";
import { PrismaService } from "../prisma/prisma.service";
import { ReportingProjectionService } from "../reporting-projection/reporting-projection.service";
import {
  ReportingCounts,
  ReportingDetail,
} from "../reporting-projection/reporting-projection.types";
import {
  PERSONAL_REPORTING_CLOCK,
  PERSONAL_TEACHING_REPORTING_PROJECTION_PROFILE,
  PersonalReportingClock,
  PersonalReportingFinding,
  PersonalReportingProjection,
  PersonalReportingSection,
  ResolvePersonalReportingProjectionInput,
} from "./personal-reporting-projection.types";
const zero = (): ReportingCounts => ({
  distributedElapsedCount: 0,
  completedCount: 0,
  openDebtCount: 0,
  lateCount: 0,
  unconfirmedGapCount: 0,
});
@Injectable()
export class PersonalReportingProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reporting: ReportingProjectionService,
    @Inject(PERSONAL_REPORTING_CLOCK)
    private readonly clock: PersonalReportingClock,
  ) {}
  async resolve(
    input: ResolvePersonalReportingProjectionInput,
  ): Promise<PersonalReportingProjection> {
    return this.prisma.$transaction(
      (tx) => this.resolveInTransaction(tx, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async resolveInTransaction(
    tx: Prisma.TransactionClient,
    input: ResolvePersonalReportingProjectionInput,
  ): Promise<PersonalReportingProjection> {
    const from = parseCivilDate(input.fromCivilDate),
      to = parseCivilDate(input.toCivilDate);
    if (from > to)
      throw new BadRequestException(
        "fromCivilDate must be on or before toCivilDate.",
      );
    if (
      !(input.asOfInstant instanceof Date) ||
      Number.isNaN(input.asOfInstant.getTime())
    )
      throw new BadRequestException("asOfInstant must be a valid instant.");
    if (input.asOfInstant > this.clock.now())
      throw new BadRequestException("asOfInstant must not be in the future.");
    if (
      !(await tx.academicYear.findUnique({
        where: { id: input.academicYearId },
        select: { id: true },
      }))
    )
      throw new BadRequestException("academicYearId must exist.");
    if (
      !(await tx.user.findUnique({
        where: { id: input.targetUserId },
        select: { id: true },
      }))
    )
      throw new BadRequestException("targetUserId must exist.");
    const cal = await tx.academicCalendarVersion.findFirst({
      where: { academicYearId: input.academicYearId, isActive: true },
      select: { startDate: true, endDate: true },
      orderBy: { id: "asc" },
    });
    if (!cal || from < cal.startDate || to > cal.endDate)
      throw new BadRequestException(
        "Report range must be wholly within the active AcademicYear calendar boundary.",
      );
    const rows = await tx.teachingAssignment.findMany({
      where: {
        academicYearId: input.academicYearId,
        teacherUserId: input.targetUserId,
        validFrom: { lte: to },
        OR: [{ validUntil: null }, { validUntil: { gte: from } }],
      },
      select: {
        id: true,
        academicYearId: true,
        schoolClassId: true,
        subjectId: true,
        teacherUserId: true,
        validFrom: true,
        validUntil: true,
      },
    });
    const invalid =
      rows.find((row) => !this.validAssignment(row, input, from, to)) ||
      new Set(rows.map((row) => row.id)).size !== rows.length;
    if (invalid)
      return {
        profile: PERSONAL_TEACHING_REPORTING_PROJECTION_PROFILE,
        scope: input,
        responsibilityState: "RESPONSIBILITY_PRESENT" as const,
        status: "BLOCKED" as const,
        counts: null,
        responsibilityManifest: [],
        sections: [],
        findings: [
          this.finding(
            "RESPONSIBILITY_SCOPE_PROVENANCE_INVALID",
            "TeachingAssignment responsibility scope is inconsistent.",
            null,
            [],
          ),
        ],
        evaluatedAt: this.clock.now().toISOString(),
      };
    const manifest = rows
      .map((r) => ({
        teachingAssignmentId: r.id,
        schoolClassId: r.schoolClassId,
        subjectId: r.subjectId,
        validFrom: formatCivilDate(r.validFrom),
        validUntil: r.validUntil ? formatCivilDate(r.validUntil) : null,
      }))
      .sort(
        (a, b) =>
          a.schoolClassId.localeCompare(b.schoolClassId) ||
          a.subjectId.localeCompare(b.subjectId) ||
          a.validFrom.localeCompare(b.validFrom) ||
          (a.validUntil ?? "9999").localeCompare(b.validUntil ?? "9999") ||
          a.teachingAssignmentId.localeCompare(b.teachingAssignmentId),
      );
    const base = {
      profile: PERSONAL_TEACHING_REPORTING_PROJECTION_PROFILE,
      scope: input,
      responsibilityManifest: manifest,
      findings: [] as PersonalReportingFinding[],
      evaluatedAt: this.clock.now().toISOString(),
    };
    if (!manifest.length)
      return {
        ...base,
        responsibilityState: "ZERO_RESPONSIBILITY" as const,
        status: "PASS" as const,
        counts: zero(),
        sections: [],
      };
    const roots = [
      ...new Map(
        manifest.map((x) => [
          x.schoolClassId + ":" + x.subjectId,
          { schoolClassId: x.schoolClassId, subjectId: x.subjectId },
        ]),
      ).values(),
    ].sort(
      (a, b) =>
        a.schoolClassId.localeCompare(b.schoolClassId) ||
        a.subjectId.localeCompare(b.subjectId),
    );
    const upstream = await this.reporting.resolveInTransaction(tx, {
      academicYearId: input.academicYearId,
      roots,
      fromCivilDate: input.fromCivilDate,
      toCivilDate: input.toCivilDate,
      asOfInstant: input.asOfInstant,
    });
    const keys = new Set(roots.map((r) => r.schoolClassId + ":" + r.subjectId));
    if (
      upstream.roots.length !== roots.length ||
      new Set(
        upstream.roots.map(
          (r) => r.scope.schoolClassId + ":" + r.scope.subjectId,
        ),
      ).size !== roots.length ||
      upstream.roots.some(
        (r) => !keys.has(r.scope.schoolClassId + ":" + r.scope.subjectId),
      )
    )
      return {
        ...base,
        responsibilityState: "RESPONSIBILITY_PRESENT" as const,
        status: "BLOCKED" as const,
        counts: null,
        sections: [],
        findings: [
          this.finding(
            "RESPONSIBILITY_SCOPE_PROVENANCE_INVALID",
            "Reporting root set does not reconcile with responsibility scope.",
            null,
            [],
          ),
        ],
      };
    const sections = upstream.roots.map<PersonalReportingSection>((root) => {
      const intervals = manifest.filter(
        (x) =>
          x.schoolClassId === root.scope.schoolClassId &&
          x.subjectId === root.scope.subjectId,
      );
      if (root.status === "BLOCKED")
        return {
          schoolClassId: root.scope.schoolClassId,
          subjectId: root.scope.subjectId,
          responsibilityIntervals: intervals,
          status: "BLOCKED",
          counts: null,
          details: [],
          findings: root.findings,
        };
      const intervalsById = new Map(
        intervals.map((interval) => [interval.teachingAssignmentId, interval]),
      );
      const ids = new Set(intervalsById.keys());
      const bad = root.details.find((d) => {
        const interval = intervalsById.get(d.originalTeachingAssignmentId);
        const source = parseCivilDate(d.sourceCivilDate);
        const target = d.responsibleTeacherUserId === input.targetUserId;
        return (
          target !== ids.has(d.originalTeachingAssignmentId) ||
          (target &&
            (!interval ||
              source < parseCivilDate(interval.validFrom) ||
              (interval.validUntil !== null &&
                source > parseCivilDate(interval.validUntil)))) ||
          d.academicYearId !== input.academicYearId ||
          d.schoolClassId !== root.scope.schoolClassId ||
          d.subjectId !== root.scope.subjectId
        );
      });
      if (bad)
        return {
          schoolClassId: root.scope.schoolClassId,
          subjectId: root.scope.subjectId,
          responsibilityIntervals: intervals,
          status: "BLOCKED",
          counts: null,
          details: [],
          findings: [
            this.finding(
              "RESPONSIBLE_TEACHER_PROVENANCE_MISMATCH",
              "Retained responsibility provenance does not reconcile.",
              bad.sourceNormalOccurrenceKey,
              [bad.originalTeachingAssignmentId],
            ),
          ],
        };
      const details = root.details
        .filter((d) => d.responsibleTeacherUserId === input.targetUserId)
        .slice()
        .sort((a, b) => this.compareDetail(a, b));
      const dup = new Set<string>();
      const duplicate = details.find((d) => {
        const k =
          d.schoolClassId +
          ":" +
          d.subjectId +
          ":" +
          d.sourceNormalOccurrenceKey;
        if (dup.has(k)) return true;
        dup.add(k);
        return false;
      });
      if (duplicate)
        return {
          schoolClassId: root.scope.schoolClassId,
          subjectId: root.scope.subjectId,
          responsibilityIntervals: intervals,
          status: "BLOCKED",
          counts: null,
          details: [],
          findings: [
            this.finding(
              "DUPLICATE_PERSONAL_OCCURRENCE",
              "Canonical occurrence is duplicated.",
              duplicate.sourceNormalOccurrenceKey,
              [],
            ),
          ],
        };
      const counts = this.count(details);
      if (!counts)
        return {
          schoolClassId: root.scope.schoolClassId,
          subjectId: root.scope.subjectId,
          responsibilityIntervals: intervals,
          status: "BLOCKED",
          counts: null,
          details: [],
          findings: [
            this.finding(
              "PERSONAL_AGGREGATE_RECONCILIATION_FAILED",
              "Canonical detail classification cannot reconcile.",
              null,
              [],
            ),
          ],
        };
      return {
        schoolClassId: root.scope.schoolClassId,
        subjectId: root.scope.subjectId,
        responsibilityIntervals: intervals,
        status: "PASS",
        counts,
        details,
        findings: [],
      };
    }).sort(
      (left, right) =>
        left.schoolClassId.localeCompare(right.schoolClassId) ||
        left.subjectId.localeCompare(right.subjectId),
    );
    const blocked = sections.some((s) => s.status === "BLOCKED");
    if (blocked)
      return {
        ...base,
        responsibilityState: "RESPONSIBILITY_PRESENT" as const,
        status: "BLOCKED" as const,
        counts: null,
        sections,
      };
    const combined = this.sum(sections);
    if (!this.isReconciledCounts(combined))
      return {
        ...base,
        responsibilityState: "RESPONSIBILITY_PRESENT" as const,
        status: "BLOCKED" as const,
        counts: null,
        sections,
        findings: [
          this.finding(
            "PERSONAL_AGGREGATE_RECONCILIATION_FAILED",
            "Combined Personal counts cannot reconcile.",
            null,
            [],
          ),
        ],
      };
    return {
      ...base,
      responsibilityState: "RESPONSIBILITY_PRESENT" as const,
      status: "PASS" as const,
      counts: combined,
      sections,
    };
  }
  private count(d: ReportingDetail[]): ReportingCounts | null {
    const c = zero();
    for (const x of d) {
      c.distributedElapsedCount++;
      if (x.classification === "COMPLETED") c.completedCount++;
      else if (x.classification === "PROVEN_OPEN_DEBT") {
        c.openDebtCount++;
        c.lateCount++;
      } else if (x.classification === "UNCONFIRMED_COMPLETION_GAP")
        c.unconfirmedGapCount++;
      else return null;
    }
    return c.distributedElapsedCount ===
      c.completedCount + c.openDebtCount + c.unconfirmedGapCount &&
      c.lateCount === c.openDebtCount
      ? c
      : null;
  }
  private validAssignment(
    row: {
      id: string;
      academicYearId: string;
      teacherUserId: string;
      schoolClassId: string;
      subjectId: string;
      validFrom: Date;
      validUntil: Date | null;
    },
    input: ResolvePersonalReportingProjectionInput,
    from: Date,
    to: Date,
  ): boolean {
    return (
      typeof row.id === "string" &&
      row.id.length > 0 &&
      row.academicYearId === input.academicYearId &&
      row.teacherUserId === input.targetUserId &&
      typeof row.schoolClassId === "string" &&
      row.schoolClassId.length > 0 &&
      typeof row.subjectId === "string" &&
      row.subjectId.length > 0 &&
      row.validFrom instanceof Date &&
      !Number.isNaN(row.validFrom.getTime()) &&
      (row.validUntil === null ||
        (row.validUntil instanceof Date &&
          !Number.isNaN(row.validUntil.getTime()))) &&
      (row.validUntil === null || row.validFrom <= row.validUntil) &&
      row.validFrom <= to &&
      (row.validUntil === null || row.validUntil >= from)
    );
  }
  private isReconciledCounts(c: ReportingCounts): boolean {
    return (
      c.distributedElapsedCount ===
        c.completedCount + c.openDebtCount + c.unconfirmedGapCount &&
      c.lateCount === c.openDebtCount
    );
  }
  private compareDetail(a: ReportingDetail, b: ReportingDetail): number {
    return (
      a.sourceCivilDate.localeCompare(b.sourceCivilDate) ||
      a.sourceSlotStart.localeCompare(b.sourceSlotStart) ||
      a.sourceSlotEnd.localeCompare(b.sourceSlotEnd) ||
      a.sourceNormalOccurrenceKey.localeCompare(b.sourceNormalOccurrenceKey)
    );
  }
  private sum(s: PersonalReportingSection[]): ReportingCounts {
    return s.reduce((a, x) => {
      const c = x.counts!;
      for (const k of Object.keys(a) as (keyof ReportingCounts)[]) a[k] += c[k];
      return a;
    }, zero());
  }
  private finding(
    code: PersonalReportingFinding["code"],
    reason: string,
    occurrenceKey: string | null,
    entityIds: string[],
  ): PersonalReportingFinding {
    return {
      severity: "BLOCKER",
      code,
      reason,
      occurrenceKey,
      entityIds: [...entityIds].sort(),
    };
  }
}
