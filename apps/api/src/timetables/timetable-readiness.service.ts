import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { AcademicWeekday, PpctVersionStatus, Prisma, TimetableVersionStatus } from '@prisma/client';
import {
  CivilDateString,
  TimetableReadinessDimensionKey,
  TimetableReadinessDimensionResult,
  TimetableReadinessFinding,
  TimetableReadinessResponse,
  TimetableReadinessStream,
} from '@baogiang/contracts';
import { civilDateDayNumber, formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import {
  ExactPpctAssociation,
  isPpctAssociationEffectiveOn,
  PpctAssociationReadService,
} from '../ppct/ppct-association-read.service';
import { PpctOccurrenceAllocationService } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvaluateTimetableReadinessDto } from './dto';

const PROFILE = 'NORMAL_BASE_PPCT_V1' as const;
const PRODUCT_LABEL = 'TIMETABLE READINESS — NORMAL BASE + PPCT BINDING' as const;
const PROFILE_V2 = 'NORMAL_BASE_PPCT_COMPONENT_V2' as const;
const PRODUCT_LABEL_V2 = 'TIMETABLE READINESS — NORMAL BASE + PPCT COMPONENT' as const;
const ASSESSABLE_STATUSES: TimetableVersionStatus[] = [
  TimetableVersionStatus.VALIDATED,
  TimetableVersionStatus.APPROVED,
  TimetableVersionStatus.ACTIVE,
  TimetableVersionStatus.SUPERSEDED,
];
const VALID_PPCT_STATUSES = new Set<PpctVersionStatus>([
  PpctVersionStatus.PUBLISHED,
  PpctVersionStatus.SUPERSEDED,
]);
const WEEKDAY_BY_UTC_DAY: AcademicWeekday[] = [
  AcademicWeekday.SUNDAY,
  AcademicWeekday.MONDAY,
  AcademicWeekday.TUESDAY,
  AcademicWeekday.WEDNESDAY,
  AcademicWeekday.THURSDAY,
  AcademicWeekday.FRIDAY,
  AcademicWeekday.SATURDAY,
];
const DIMENSION_KEYS: TimetableReadinessDimensionKey[] = [
  'NORMAL_BASE_TIMETABLE_FOUNDATION',
  'PPCT_ASSOCIATION_BINDING',
  'PPCT_CAPACITY',
  'OPERATIONAL_OVERLAYS',
  'SUBSTITUTION_CANCELLATION_MAKEUP',
  'LOCAL_OPERATIONAL_EXCEPTIONS',
  'SPECIAL_ACTIVITY_COLLISIONS',
  'RESOLVED_OCCURRENCE_EXECUTION',
  'PROGRESS_DEBT_REPORTING',
];

interface Opportunity extends TimetableReadinessStream {
  date: CivilDateString;
  timetableEntryIds: string[];
}

@Injectable()
export class TimetableReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly associationRead: PpctAssociationReadService,
    @Optional() private readonly allocation?: PpctOccurrenceAllocationService,
  ) {}

  evaluate(id: string, query: EvaluateTimetableReadinessDto): Promise<TimetableReadinessResponse> {
    if (query.profile === PROFILE_V2) {
      return this.evaluateV2(id, query);
    }
    return this.prisma.$transaction(
      (tx) => this.evaluateSnapshot(tx, id, query),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  evaluateV2(id: string, query: EvaluateTimetableReadinessDto): Promise<TimetableReadinessResponse> {
    return this.prisma.$transaction(
      (tx) => this.evaluateSnapshotV2(tx, id, query),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async evaluateSnapshot(
    tx: Prisma.TransactionClient,
    id: string,
    query: EvaluateTimetableReadinessDto,
  ): Promise<TimetableReadinessResponse> {
    const version = await tx.timetableVersion.findUnique({
      where: { id },
      select: {
        id: true,
        academicYearId: true,
        status: true,
        calendarVersionId: true,
        effectiveAcademicWeekId: true,
        effectiveFrom: true,
        effectiveUntil: true,
        validatedAt: true,
        validatedByUserId: true,
        entries: { select: { id: true, weekday: true, schoolClassId: true, subjectId: true } },
      },
    });
    if (!version) throw new NotFoundException('Không tìm thấy phiên bản thời khóa biểu.');
    if (version.status === TimetableVersionStatus.DRAFT) {
      throw new ConflictException('Phiên bản thời khóa biểu DRAFT chưa thể đánh giá mức sẵn sàng.');
    }

    const from = parseCivilDate(query.from);
    const to = parseCivilDate(query.to);
    if (from > to) throw new BadRequestException('Khoảng đánh giá mức sẵn sàng không hợp lệ: from phải không sau to.');
    if (version.effectiveFrom && from < version.effectiveFrom) {
      throw new BadRequestException('from không được trước ngày hiệu lực của phiên bản thời khóa biểu.');
    }
    if (version.effectiveUntil && to > version.effectiveUntil) {
      throw new BadRequestException('to không được sau ngày kết thúc hiệu lực của phiên bản thời khóa biểu.');
    }

    const calendar = version.calendarVersionId
      ? await tx.academicCalendarVersion.findUnique({
          where: { id: version.calendarVersionId },
          select: {
            id: true,
            academicYearId: true,
            endDate: true,
            teachingWeekdays: true,
            weeks: {
              select: {
                id: true,
                segments: { select: { startDate: true, endDate: true, segmentOrder: true } },
              },
            },
          },
        })
      : null;
    if (calendar && to > calendar.endDate) {
      throw new BadRequestException('to không được sau ngày kết thúc của phiên lịch đã lưu.');
    }

    const findings = this.foundationFindings(version, calendar);
    const opportunities = calendar
      ? this.deriveOpportunities(
          version.academicYearId,
          version.entries,
          calendar.teachingWeekdays,
          calendar.weeks.flatMap((week) => week.segments),
          from,
          to,
        )
      : [];
    const affectedStreams = distinctStreams(opportunities);
    const associations = await this.associationRead.findOverlappingRange(
      tx,
      affectedStreams.map((stream) => ({ academicYearId: version.academicYearId, ...stream })),
      from,
      to,
    );
    const usedAssociationIds = new Set<string>();
    const usedVersionIds = new Set<string>();
    for (const opportunity of opportunities) {
      const matches = associations.filter((association) => covers(association, opportunity));
      if (matches.length === 0) {
        findings.push({
          code: 'PPCT_ASSOCIATION_MISSING',
          dimension: 'PPCT_ASSOCIATION_BINDING',
          severity: 'BLOCKER',
          message: 'Không có liên kết PPCT hiệu lực cho cơ hội dạy học này.',
          stream: streamOf(opportunity),
          date: opportunity.date,
          timetableEntryIds: opportunity.timetableEntryIds,
        });
        continue;
      }
      if (matches.length > 1) {
        findings.push({
          code: 'PPCT_ASSOCIATION_AMBIGUOUS',
          dimension: 'PPCT_ASSOCIATION_BINDING',
          severity: 'BLOCKER',
          message: 'Có nhiều liên kết PPCT cùng hiệu lực cho cơ hội dạy học này.',
          stream: streamOf(opportunity),
          date: opportunity.date,
          timetableEntryIds: opportunity.timetableEntryIds,
        });
        continue;
      }
      const association = matches[0];
      if (!VALID_PPCT_STATUSES.has(association.ppctVersionStatus)) {
        findings.push({
          code: 'PPCT_ASSOCIATION_INVALID_TARGET',
          dimension: 'PPCT_ASSOCIATION_BINDING',
          severity: 'BLOCKER',
          message: 'Liên kết PPCT lịch sử trỏ tới phiên bản không hợp lệ.',
          stream: streamOf(opportunity),
          date: opportunity.date,
          timetableEntryIds: opportunity.timetableEntryIds,
          ppctClassAssociationId: association.id,
          ppctVersionId: association.ppctVersionId,
        });
        continue;
      }
      usedAssociationIds.add(association.id);
      usedVersionIds.add(association.ppctVersionId);
    }

    findings.sort(compareFindings);
    const foundationFailed = findings.some((finding) => (
      finding.dimension === 'NORMAL_BASE_TIMETABLE_FOUNDATION' && finding.severity === 'BLOCKER'
    ));
    const bindingFailed = findings.some((finding) => (
      finding.dimension === 'PPCT_ASSOCIATION_BINDING' && finding.severity === 'BLOCKER'
    ));
    const dimensions = dimensionsFor(foundationFailed, bindingFailed);
    return {
      profile: PROFILE,
      productLabel: PRODUCT_LABEL,
      scope: {
        timetableVersionId: version.id,
        academicYearId: version.academicYearId,
        from: query.from as CivilDateString,
        to: query.to as CivilDateString,
        affectedStreams,
      },
      result: foundationFailed || bindingFailed ? 'FAIL' : 'PASS',
      dimensions,
      findings,
      provenance: {
        timetableVersionId: version.id,
        academicCalendarVersionId: version.calendarVersionId,
        ppctClassAssociationIds: [...usedAssociationIds].sort(),
        ppctVersionIds: [...usedVersionIds].sort(),
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  private async evaluateSnapshotV2(
    tx: Prisma.TransactionClient,
    id: string,
    query: EvaluateTimetableReadinessDto,
  ): Promise<TimetableReadinessResponse> {
    const version = await tx.timetableVersion.findUnique({
      where: { id },
      select: {
        id: true,
        academicYearId: true,
        status: true,
        calendarVersionId: true,
        effectiveAcademicWeekId: true,
        effectiveFrom: true,
        effectiveUntil: true,
        validatedAt: true,
        validatedByUserId: true,
        entries: { select: { id: true, weekday: true, schoolClassId: true, subjectId: true } },
      },
    });
    if (!version) throw new NotFoundException('Không tìm thấy phiên bản thời khóa biểu.');
    if (version.status === TimetableVersionStatus.DRAFT) {
      throw new ConflictException('Phiên bản thời khóa biểu DRAFT chưa thể đánh giá mức sẵn sàng.');
    }

    const from = parseCivilDate(query.from);
    const to = parseCivilDate(query.to);
    if (from > to) throw new BadRequestException('Khoảng đánh giá mức sẵn sàng không hợp lệ: from phải không sau to.');
    if (version.effectiveFrom && from < version.effectiveFrom) {
      throw new BadRequestException('from không được trước ngày hiệu lực của phiên bản thời khóa biểu.');
    }
    if (version.effectiveUntil && to > version.effectiveUntil) {
      throw new BadRequestException('to không được sau ngày kết thúc hiệu lực của phiên bản thời khóa biểu.');
    }

    const calendar = version.calendarVersionId
      ? await tx.academicCalendarVersion.findUnique({
          where: { id: version.calendarVersionId },
          select: {
            id: true,
            academicYearId: true,
            endDate: true,
            teachingWeekdays: true,
            weeks: {
              select: {
                id: true,
                segments: { select: { startDate: true, endDate: true, segmentOrder: true } },
              },
            },
          },
        })
      : null;
    if (calendar && to > calendar.endDate) {
      throw new BadRequestException('to không được sau ngày kết thúc của phiên lịch đã lưu.');
    }

    const findings = this.foundationFindings(version, calendar);
    const opportunities = calendar
      ? this.deriveOpportunities(
          version.academicYearId,
          version.entries,
          calendar.teachingWeekdays,
          calendar.weeks.flatMap((week) => week.segments),
          from,
          to,
        )
      : [];
    const affectedStreams = distinctStreams(opportunities);
    const associations = await this.associationRead.findOverlappingRange(
      tx,
      affectedStreams.map((stream) => ({ academicYearId: version.academicYearId, ...stream })),
      from,
      to,
    );
    const usedAssociationIds = new Set<string>();
    const usedVersionIds = new Set<string>();

    for (const opportunity of opportunities) {
      const matches = associations.filter((association) => covers(association, opportunity));
      if (matches.length === 0) {
        findings.push({
          code: 'PPCT_ASSOCIATION_MISSING',
          dimension: 'PPCT_ASSOCIATION_BINDING',
          severity: 'BLOCKER',
          message: 'Không có liên kết PPCT hiệu lực cho cơ hội dạy học này.',
          stream: streamOf(opportunity),
          date: opportunity.date,
          timetableEntryIds: opportunity.timetableEntryIds,
        });
        continue;
      }
      if (matches.length > 1) {
        findings.push({
          code: 'PPCT_ASSOCIATION_AMBIGUOUS',
          dimension: 'PPCT_ASSOCIATION_BINDING',
          severity: 'BLOCKER',
          message: 'Có nhiều liên kết PPCT cùng hiệu lực cho cơ hội dạy học này.',
          stream: streamOf(opportunity),
          date: opportunity.date,
          timetableEntryIds: opportunity.timetableEntryIds,
        });
        continue;
      }
      const association = matches[0]!;
      if (!VALID_PPCT_STATUSES.has(association.ppctVersionStatus)) {
        findings.push({
          code: 'PPCT_ASSOCIATION_INVALID_TARGET',
          dimension: 'PPCT_ASSOCIATION_BINDING',
          severity: 'BLOCKER',
          message: 'Liên kết PPCT lịch sử trỏ tới phiên bản không hợp lệ.',
          stream: streamOf(opportunity),
          date: opportunity.date,
          timetableEntryIds: opportunity.timetableEntryIds,
          ppctClassAssociationId: association.id,
          ppctVersionId: association.ppctVersionId,
        });
        continue;
      }
      usedAssociationIds.add(association.id);
      usedVersionIds.add(association.ppctVersionId);
    }

    // --- V2 CAPACITY & COMPONENT EVALUATION ---
    const activeUsedAssociations = associations.filter((a) => usedAssociationIds.has(a.id));

    for (const stream of affectedStreams) {
      const streamAssocs = activeUsedAssociations.filter(
        (a) => a.schoolClassId === stream.schoolClassId && a.subjectId === stream.subjectId,
      );

      // Check specialized content requirement for CORE_PLUS_SPECIALIZED_STUDY
      for (const assoc of streamAssocs) {
        if (assoc.curricularProfile === 'CORE_PLUS_SPECIALIZED_STUDY') {
          const specCount = await tx.ppctItemRevision.count({
            where: {
              ppctVersionId: assoc.ppctVersionId,
              component: 'SPECIALIZED_STUDY',
            },
          });
          if (specCount === 0) {
            findings.push({
              code: 'PPCT_SPECIALIZED_CONTENT_MISSING',
              dimension: 'PPCT_CAPACITY',
              severity: 'BLOCKER',
              message: 'Chương trình học CORE_PLUS_SPECIALIZED_STUDY yêu cầu phiên bản PPCT phải có ít nhất một tiết chuyên đề.',
              stream: { academicYearId: version.academicYearId, schoolClassId: stream.schoolClassId, subjectId: stream.subjectId },
              ppctClassAssociationId: assoc.id,
              ppctVersionId: assoc.ppctVersionId,
            });
          }
        }
      }

      // Reuse Allocator V2 to detect allocation risks, capacity limits, calendar split, profile split
      if (this.allocation) {
        const allocResult = await this.allocation.resolveInTransactionV2(tx, {
          academicYearId: version.academicYearId,
          schoolClassId: stream.schoolClassId,
          subjectId: stream.subjectId,
          throughCivilDate: query.to as CivilDateString,
        });

        if (allocResult.status === 'BLOCKED') {
          for (const af of allocResult.findings) {
            findings.push({
              code: af.code,
              dimension: 'PPCT_CAPACITY',
              severity: 'BLOCKER',
              message: af.reason ?? 'Lỗi điều kiện phân bổ PPCT V2.',
              stream: { academicYearId: version.academicYearId, schoolClassId: stream.schoolClassId, subjectId: stream.subjectId },
            });
          }
        }
      }
    }

    const seenFindingKeys = new Set<string>();
    const uniqueFindings = findings.filter((f) => {
      const k = `${f.code}:${f.dimension}:${f.stream?.schoolClassId ?? ''}:${f.stream?.subjectId ?? ''}:${f.date ?? ''}:${f.ppctClassAssociationId ?? ''}:${f.ppctVersionId ?? ''}`;
      if (seenFindingKeys.has(k)) return false;
      seenFindingKeys.add(k);
      return true;
    });

    uniqueFindings.sort(compareFindings);
    const foundationFailed = uniqueFindings.some(
      (f) => f.dimension === 'NORMAL_BASE_TIMETABLE_FOUNDATION' && f.severity === 'BLOCKER',
    );
    const bindingFailed = uniqueFindings.some(
      (f) => f.dimension === 'PPCT_ASSOCIATION_BINDING' && f.severity === 'BLOCKER',
    );
    const capacityFailed = uniqueFindings.some(
      (f) => f.dimension === 'PPCT_CAPACITY' && f.severity === 'BLOCKER',
    );
    const dimensions = dimensionsForV2(foundationFailed, bindingFailed, capacityFailed);

    return {
      profile: PROFILE_V2,
      productLabel: PRODUCT_LABEL_V2,
      scope: {
        timetableVersionId: version.id,
        academicYearId: version.academicYearId,
        from: query.from as CivilDateString,
        to: query.to as CivilDateString,
        affectedStreams,
      },
      result: foundationFailed || bindingFailed || capacityFailed ? 'FAIL' : 'PASS',
      dimensions,
      findings: uniqueFindings,
      provenance: {
        timetableVersionId: version.id,
        academicCalendarVersionId: version.calendarVersionId,
        ppctClassAssociationIds: [...usedAssociationIds].sort(),
        ppctVersionIds: [...usedVersionIds].sort(),
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  private foundationFindings(
    version: {
      status: TimetableVersionStatus;
      academicYearId: string;
      calendarVersionId: string | null;
      effectiveAcademicWeekId: string | null;
      effectiveFrom: Date | null;
      validatedAt: Date | null;
      validatedByUserId: string | null;
      entries: Array<{ id: string }>;
    },
    calendar: {
      academicYearId: string;
      weeks: Array<{ id: string; segments: Array<{ startDate: Date; segmentOrder: number }> }>;
    } | null,
  ): TimetableReadinessFinding[] {
    const findings: TimetableReadinessFinding[] = [];
    const add = (code: string, message: string): void => {
      findings.push({ code, dimension: 'NORMAL_BASE_TIMETABLE_FOUNDATION', severity: 'BLOCKER', message });
    };
    if (!ASSESSABLE_STATUSES.includes(version.status)) add('TIMETABLE_LIFECYCLE_EVIDENCE_INVALID', 'Trạng thái phiên bản không phải bằng chứng normal-base bất biến có thể đánh giá.');
    if (!version.validatedAt || !version.validatedByUserId) add('TIMETABLE_VALIDATION_EVIDENCE_MISSING', 'Thiếu bằng chứng xác thực normal-base đã lưu.');
    if (!version.calendarVersionId || !version.effectiveAcademicWeekId || !version.effectiveFrom) {
      add('TIMETABLE_TARGET_EVIDENCE_MISSING', 'Thiếu định danh đích lịch hoặc ngày hiệu lực đã lưu.');
    }
    if (!calendar) {
      add('TIMETABLE_CALENDAR_EVIDENCE_MISSING', 'Không tìm thấy phiên lịch chính xác đã lưu của thời khóa biểu.');
    } else {
      if (calendar.academicYearId !== version.academicYearId) add('TIMETABLE_CALENDAR_SCOPE_INVALID', 'Phiên lịch đã lưu không thuộc cùng năm học.');
      const effectiveWeek = calendar.weeks.find((week) => week.id === version.effectiveAcademicWeekId);
      if (!effectiveWeek || effectiveWeek.segments.length === 0) {
        add('TIMETABLE_EFFECTIVE_WEEK_EVIDENCE_INVALID', 'Tuần hiệu lực đã lưu không có phân đoạn lịch hợp lệ.');
      } else if (version.effectiveFrom) {
        const expected = [...effectiveWeek.segments].sort((left, right) => (
          left.startDate.getTime() - right.startDate.getTime() || left.segmentOrder - right.segmentOrder
        ))[0].startDate;
        if (expected.getTime() !== version.effectiveFrom.getTime()) {
          add('TIMETABLE_EFFECTIVE_FROM_EVIDENCE_INVALID', 'Ngày hiệu lực không khớp phân đoạn đầu của tuần đã lưu.');
        }
      }
    }
    if (version.entries.length === 0) add('TIMETABLE_ENTRIES_EVIDENCE_MISSING', 'Phiên bản bất biến không có dòng thời khóa biểu normal-base đã lưu.');
    return findings;
  }

  private deriveOpportunities(
    academicYearId: string,
    entries: Array<{ id: string; weekday: AcademicWeekday; schoolClassId: string; subjectId: string }>,
    teachingWeekdays: AcademicWeekday[],
    segments: Array<{ startDate: Date; endDate: Date }>,
    from: Date,
    to: Date,
  ): Opportunity[] {
    const grouped = new Map<string, Opportunity>();
    const acceptedWeekdays = new Set(teachingWeekdays);
    const fromDay = civilDateDayNumber(from);
    const toDay = civilDateDayNumber(to);
    for (const segment of segments) {
      const start = Math.max(fromDay, civilDateDayNumber(segment.startDate));
      const end = Math.min(toDay, civilDateDayNumber(segment.endDate));
      for (let day = start; day <= end; day += 1) {
        const weekday = WEEKDAY_BY_UTC_DAY[new Date(day * 86_400_000).getUTCDay()];
        if (!acceptedWeekdays.has(weekday)) continue;
        const date = formatCivilDate(new Date(day * 86_400_000));
        for (const entry of entries) {
          if (entry.weekday !== weekday) continue;
          const key = `${entry.schoolClassId}:${entry.subjectId}:${date}`;
          const existing = grouped.get(key);
          if (existing) existing.timetableEntryIds.push(entry.id);
          else grouped.set(key, {
            academicYearId,
            schoolClassId: entry.schoolClassId,
            subjectId: entry.subjectId,
            date,
            timetableEntryIds: [entry.id],
          });
        }
      }
    }
    return [...grouped.values()]
      .map((opportunity) => ({ ...opportunity, timetableEntryIds: [...new Set(opportunity.timetableEntryIds)].sort() }))
      .sort((left, right) => opportunityKey(left).localeCompare(opportunityKey(right)));
  }
}

function streamOf(opportunity: Opportunity): TimetableReadinessStream {
  return {
    academicYearId: opportunity.academicYearId,
    schoolClassId: opportunity.schoolClassId,
    subjectId: opportunity.subjectId,
  };
}

function covers(association: ExactPpctAssociation, opportunity: Opportunity): boolean {
  return isPpctAssociationEffectiveOn(association, streamOf(opportunity), parseCivilDate(opportunity.date));
}

function distinctStreams(opportunities: Opportunity[]): Array<{ schoolClassId: string; subjectId: string }> {
  const streams = new Map<string, { schoolClassId: string; subjectId: string }>();
  for (const opportunity of opportunities) {
    const key = `${opportunity.schoolClassId}:${opportunity.subjectId}`;
    streams.set(key, { schoolClassId: opportunity.schoolClassId, subjectId: opportunity.subjectId });
  }
  return [...streams.values()].sort((left, right) => (
    left.schoolClassId.localeCompare(right.schoolClassId) || left.subjectId.localeCompare(right.subjectId)
  ));
}

function dimensionsFor(foundationFailed: boolean, bindingFailed: boolean): TimetableReadinessDimensionResult[] {
  return DIMENSION_KEYS.map((key) => {
    if (key === 'NORMAL_BASE_TIMETABLE_FOUNDATION') return { key, state: foundationFailed ? 'FAIL' : 'PASS', required: true };
    if (key === 'PPCT_ASSOCIATION_BINDING') return { key, state: bindingFailed ? 'FAIL' : 'PASS', required: true };
    return { key, state: 'NOT_ASSESSED', required: false };
  });
}

function dimensionsForV2(
  foundationFailed: boolean,
  bindingFailed: boolean,
  capacityFailed: boolean,
): TimetableReadinessDimensionResult[] {
  return DIMENSION_KEYS.map((key) => {
    if (key === 'NORMAL_BASE_TIMETABLE_FOUNDATION') return { key, state: foundationFailed ? 'FAIL' : 'PASS', required: true };
    if (key === 'PPCT_ASSOCIATION_BINDING') return { key, state: bindingFailed ? 'FAIL' : 'PASS', required: true };
    if (key === 'PPCT_CAPACITY') return { key, state: capacityFailed ? 'FAIL' : 'PASS', required: true };
    return { key, state: 'NOT_ASSESSED', required: false };
  });
}

function compareFindings(left: TimetableReadinessFinding, right: TimetableReadinessFinding): number {
  return left.dimension.localeCompare(right.dimension)
    || left.code.localeCompare(right.code)
    || (left.stream?.academicYearId ?? '').localeCompare(right.stream?.academicYearId ?? '')
    || (left.stream?.schoolClassId ?? '').localeCompare(right.stream?.schoolClassId ?? '')
    || (left.stream?.subjectId ?? '').localeCompare(right.stream?.subjectId ?? '')
    || (left.date ?? '').localeCompare(right.date ?? '')
    || (left.ppctClassAssociationId ?? '').localeCompare(right.ppctClassAssociationId ?? '')
    || (left.ppctVersionId ?? '').localeCompare(right.ppctVersionId ?? '')
    || (left.timetableEntryIds ?? []).join(':').localeCompare((right.timetableEntryIds ?? []).join(':'));
}

function opportunityKey(value: Opportunity): string {
  return `${value.schoolClassId}:${value.subjectId}:${value.date}`;
}
