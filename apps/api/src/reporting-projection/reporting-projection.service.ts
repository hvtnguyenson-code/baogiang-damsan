import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseCivilDate } from '../common/validation/civil-date';
import { formatWallClockTime } from '../time-slots/wall-clock-time';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressDebtService } from '../progress-debt/progress-debt.service';
import { ProgressDebtItem } from '../progress-debt/progress-debt.types';
import { ReportingCounts, ReportingDetail, ReportingFinding, ReportingProjection, ReportingRootInput, ReportingRootProjection, ResolveReportingProjectionInput, TEACHING_REPORTING_PROJECTION_PROFILE } from './reporting-projection.types';

@Injectable()
export class ReportingProjectionService {
  constructor(private readonly prisma: PrismaService, private readonly progressDebt: ProgressDebtService) {}

  async resolve(input: ResolveReportingProjectionInput): Promise<ReportingProjection> {
    this.validateInput(input);
    return this.prisma.$transaction((tx) => this.resolveInTransaction(tx, input), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async resolveInTransaction(tx: Prisma.TransactionClient, input: ResolveReportingProjectionInput): Promise<ReportingProjection> {
    this.validateInput(input);
    const from = parseCivilDate(input.fromCivilDate); const to = parseCivilDate(input.toCivilDate);
    const calendar = await tx.academicCalendarVersion.findFirst({ where: { academicYearId: input.academicYearId, isActive: true }, select: { id: true, startDate: true, endDate: true }, orderBy: { id: 'asc' } });
    if (!calendar || from < calendar.startDate || to > calendar.endDate) throw new BadRequestException('Report range must be wholly within the active AcademicYear calendar boundary.');
    const ids = [...new Set(input.roots.map((root) => root.schoolClassId))];
    const classes = await tx.schoolClass.findMany({ where: { id: { in: ids } }, select: { id: true, academicYearId: true } });
    if (classes.length !== ids.length || classes.some((row) => row.academicYearId !== input.academicYearId)) throw new BadRequestException('Every reporting root school class must belong to academicYearId.');
    const roots: ReportingRootProjection[] = [];
    for (const root of [...input.roots].sort((a, b) => this.rootKey(a).localeCompare(this.rootKey(b)))) {
      const upstream = await this.progressDebt.resolveInTransaction(tx, { academicYearId: input.academicYearId, schoolClassId: root.schoolClassId, subjectId: root.subjectId, asOfInstant: input.asOfInstant });
      if (upstream.status === 'BLOCKED') { roots.push({ scope: root, status: 'BLOCKED', counts: null, details: [], findings: upstream.findings }); continue; }
      const items = upstream.items.filter((item) => {
        const date = parseCivilDate(item.sourceCivilDate); return date >= from && date <= to;
      });
      const slots = await tx.timeSlotDefinition.findMany({ where: { id: { in: [...new Set(items.map((item) => item.sourceTimeSlotDefinitionId))] } }, select: { id: true, startTime: true, endTime: true } });
      const byId = new Map(slots.map((slot) => [slot.id, slot]));
      const missing = items.filter((item) => !byId.has(item.sourceTimeSlotDefinitionId));
      if (missing.length) { roots.push({ scope: root, status: 'BLOCKED', counts: null, details: [], findings: missing.map((item): ReportingFinding => ({ severity: 'BLOCKER', code: 'SOURCE_TIME_SLOT_PROVENANCE_MISSING', reason: 'Required retained source time-slot provenance cannot be resolved.', entityIds: [item.sourceTimeSlotDefinitionId], occurrenceKey: item.sourceNormalOccurrenceKey })).sort((a, b) => a.occurrenceKey!.localeCompare(b.occurrenceKey!)) }); continue; }
      const details = items.map((item) => this.detail(input, root, item, byId.get(item.sourceTimeSlotDefinitionId)!)).sort((a, b) => this.compare(a, b));
      roots.push({ scope: root, status: 'PASS', counts: this.count(details), details, findings: [] });
    }
    const blocked = roots.some((root) => root.status === 'BLOCKED');
    return { profile: TEACHING_REPORTING_PROJECTION_PROFILE, scope: input, status: blocked ? 'BLOCKED' : 'PASS', counts: blocked ? null : this.sum(roots), roots, evaluatedAt: new Date().toISOString() };
  }

  private validateInput(input: ResolveReportingProjectionInput): void {
    if (!Array.isArray(input.roots) || input.roots.length === 0) throw new BadRequestException('roots must be a non-empty array.');
    if (input.roots.some((root) => !root.schoolClassId || !root.subjectId) || new Set(input.roots.map((root) => this.rootKey(root))).size !== input.roots.length) throw new BadRequestException('roots must be explicit and unique.');
    const from = parseCivilDate(input.fromCivilDate); const to = parseCivilDate(input.toCivilDate);
    if (from > to) throw new BadRequestException('fromCivilDate must be on or before toCivilDate.');
    if (!(input.asOfInstant instanceof Date) || Number.isNaN(input.asOfInstant.getTime())) throw new BadRequestException('asOfInstant must be a valid instant.');
  }
  private detail(input: ResolveReportingProjectionInput, root: ReportingRootInput, item: ProgressDebtItem, slot: { id: string; startTime: Date; endTime: Date } | undefined): ReportingDetail {
    if (!slot) throw new BadRequestException('Required retained source time-slot provenance cannot be resolved.');
    return { academicYearId: input.academicYearId, schoolClassId: root.schoolClassId, subjectId: root.subjectId, ...item, sourceSlotStart: formatWallClockTime(slot.startTime), sourceSlotEnd: formatWallClockTime(slot.endTime) };
  }
  private count(details: ReportingDetail[]): ReportingCounts { const completed = details.filter((x) => x.classification === 'COMPLETED').length; const debt = details.filter((x) => x.classification === 'PROVEN_OPEN_DEBT').length; const gap = details.length - completed - debt; return { distributedElapsedCount: details.length, completedCount: completed, openDebtCount: debt, lateCount: debt, unconfirmedGapCount: gap }; }
  private sum(roots: ReportingRootProjection[]): ReportingCounts { return roots.reduce((total, root) => { const count = root.counts!; return { distributedElapsedCount: total.distributedElapsedCount + count.distributedElapsedCount, completedCount: total.completedCount + count.completedCount, openDebtCount: total.openDebtCount + count.openDebtCount, lateCount: total.lateCount + count.lateCount, unconfirmedGapCount: total.unconfirmedGapCount + count.unconfirmedGapCount }; }, { distributedElapsedCount: 0, completedCount: 0, openDebtCount: 0, lateCount: 0, unconfirmedGapCount: 0 }); }
  private compare(a: ReportingDetail, b: ReportingDetail): number { return a.sourceCivilDate.localeCompare(b.sourceCivilDate) || a.sourceSlotStart.localeCompare(b.sourceSlotStart) || a.sourceSlotEnd.localeCompare(b.sourceSlotEnd) || a.sourceNormalOccurrenceKey.localeCompare(b.sourceNormalOccurrenceKey); }
  private rootKey(root: ReportingRootInput): string { return root.schoolClassId + ':' + root.subjectId; }
}