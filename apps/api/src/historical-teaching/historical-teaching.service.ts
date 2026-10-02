import {
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AuditResult,
  OperationalLessonDispositionType,
  OperationalOverlayStatus,
  Prisma,
  TeachingExecutionStatus,
  TimeSlotSession,
  TimetableVersionStatus,
  UserStatus,
} from '@prisma/client';
import type {
  HistoricalTeachingConfirmResponse,
  HistoricalTeachingIssue,
  HistoricalTeachingNormalizedRow,
  HistoricalTeachingOptionsResponse,
  HistoricalTeachingPreviewResponse,
  HistoricalTeachingPreviewRow,
  HistoricalTeachingReconciliationResponse,
  HistoricalTeachingReconciliationRow,
  HistoricalTeachingReverseResponse,
} from '@baogiang/contracts/historical-teaching';
import { HISTORICAL_TEACHING_PROFILE } from '@baogiang/contracts/historical-teaching';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { requestMeta } from '../auth/auth-http';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { BusinessConfigurationService } from '../business-configuration/business-configuration.service';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { intervalsOverlap, weekdayForCivilDate } from '../operational-overlays/operational-overlay-policy';
import { PpctOccurrenceAllocationService } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.service';
import type { ExpectedPpctItem, NormalPpctAllocation } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.types';
import { PrismaService } from '../prisma/prisma.service';
import { ResolvedLessonOccurrencesService } from '../resolved-occurrences/resolved-occurrences.service';
import { staffSubjectCoverageWhere, previousCivilDate } from '../teaching-assignments/teaching-assignment-policy';
import { createFingerprint, hcmSlotEnd, reverseFingerprint } from '../teaching-executions/teaching-execution-policy';
import type { ReverseTeachingExecutionDto } from '../teaching-executions/dto';
import {
  ConfirmHistoricalTeachingDto,
  HistoricalTeachingReconciliationQueryDto,
  PreviewHistoricalTeachingDto,
} from './dto';
import { parseHistoricalTeachingCsv } from './historical-teaching.csv';

type Db = Prisma.TransactionClient;
type Slot = {
  id: string;
  academicYearId: string;
  weekday: string;
  session: TimeSlotSession;
  ordinal: number;
  revision: number;
  displayLabel: string;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  allowMakeupTeaching: boolean;
};

type DispositionPlan =
  | { mode: 'NONE'; id: null; replacesId: null; eligibilityStaffSubjectId: null }
  | { mode: 'REUSE'; id: string; replacesId: null; eligibilityStaffSubjectId: string | null }
  | { mode: 'CREATE' | 'REPLACE'; id: null; replacesId: string | null; eligibilityStaffSubjectId: string };

type MakeupPlan =
  | { mode: 'NONE'; id: null; replacesId: null; sourceDispositionId: null; eligibilityStaffSubjectId: null }
  | { mode: 'REUSE'; id: string; replacesId: null; sourceDispositionId: string | null; eligibilityStaffSubjectId: string }
  | { mode: 'CREATE' | 'REPLACE'; id: null; replacesId: string | null; sourceDispositionId: string | null; eligibilityStaffSubjectId: string };

interface PreparedRow {
  normalized: HistoricalTeachingNormalizedRow;
  preview: HistoricalTeachingPreviewRow;
  schoolClassId: string;
  schoolClassName: string;
  subjectId: string;
  subjectName: string;
  occurrence: NormalPpctAllocation['occurrence'];
  expected: ExpectedPpctItem;
  sourceSlot: Slot;
  actualTeacherUserId: string;
  actualTeacherDisplayName: string;
  responsibleTeacherDisplayName: string;
  executionCalendarVersionId: string;
  executionSlot: Slot;
  executionWeekId: string;
  executionWeekSegmentId: string;
  replacesExecutionId: string | null;
  disposition: DispositionPlan;
  makeup: MakeupPlan;
}

interface PreparedBatch {
  response: HistoricalTeachingPreviewResponse;
  rows: PreparedRow[];
}

function shaText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function shaObject(value: unknown): string {
  return shaText(JSON.stringify(value));
}

function normalizedCode(value: string): string {
  return value.normalize('NFC').trim().toUpperCase();
}

function slotKey(weekday: string, session: string, ordinal: number): string {
  return `${weekday}:${session}:${ordinal}`;
}

function internalRequestKey(family: string, requestKey: string, rowRef: string): string {
  return `p3:${family}:${shaText(`${requestKey}:${rowRef}`).slice(0, 64)}`;
}

function blocker(rowNumber: number, code: string, message: string): HistoricalTeachingIssue {
  return { severity: 'BLOCKER', code, message, rowNumber };
}

@Injectable()
export class HistoricalTeachingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly allocation: PpctOccurrenceAllocationService,
    private readonly structural: ResolvedLessonOccurrencesService,
    private readonly businessConfiguration: BusinessConfigurationService,
    private readonly audit: AuditService,
  ) {}

  async options(academicYearId?: string): Promise<HistoricalTeachingOptionsResponse> {
    const academicYears = await this.prisma.academicYear.findMany({
      orderBy: [{ code: 'desc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, code: true, name: true },
    });
    const selectedAcademicYearId = academicYearId ?? academicYears[0]?.id ?? null;
    if (selectedAcademicYearId && !academicYears.some((year) => year.id === selectedAcademicYearId)) {
      throw new NotFoundException('Không tìm thấy năm học.');
    }
    if (!selectedAcademicYearId) {
      return { academicYears, selectedAcademicYearId: null, classes: [], subjects: [] };
    }
    const [classes, subjects] = await Promise.all([
      this.prisma.schoolClass.findMany({
        where: { academicYearId: selectedAcademicYearId },
        orderBy: [{ gradeLevel: 'asc' }, { code: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, name: true, gradeLevel: true },
      }),
      this.prisma.subject.findMany({
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: { id: true, code: true, name: true },
      }),
    ]);
    return { academicYears, selectedAcademicYearId, classes, subjects };
  }

  async preview(dto: PreviewHistoricalTeachingDto): Promise<HistoricalTeachingPreviewResponse> {
    return this.prisma.$transaction(
      (tx) => this.prepare(tx, dto.academicYearId, dto.sourceText),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    ).then((prepared) => prepared.response);
  }

  async confirm(dto: ConfirmHistoricalTeachingDto, request: AuthenticatedRequest): Promise<HistoricalTeachingConfirmResponse> {
    const sourceSha256 = shaText(dto.sourceText);
    return this.retryMutation(async () => this.prisma.$transaction(async (tx) => {
      const replay = await tx.historicalTeachingImportBatch.findUnique({
        where: { requestKey: dto.requestKey },
        include: { rows: { orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }] } },
      });
      if (replay) {
        if (
          replay.academicYearId !== dto.academicYearId
          || replay.sourceSha256 !== sourceSha256
          || replay.requestFingerprint !== dto.requestFingerprint
          || dto.batchRef !== replay.requestFingerprint.slice(0, 16)
        ) {
          throw new ConflictException('requestKey lịch sử đã được dùng với nội dung khác.');
        }
        return {
          profile: HISTORICAL_TEACHING_PROFILE,
          outcome: 'IDEMPOTENT_REPLAY',
          batchId: replay.id,
          requestFingerprint: replay.requestFingerprint,
          sourceSha256: replay.sourceSha256,
          confirmedAt: replay.confirmedAt.toISOString(),
          rows: replay.rows.map((row) => ({
            rowNumber: row.rowNumber,
            rowRef: row.rowHash,
            kind: row.kind,
            executionId: row.curricularTeachingExecutionId,
          })),
        };
      }

      const prepared = await this.prepare(tx, dto.academicYearId, dto.sourceText);
      if (!prepared.response.canConfirm) {
        throw new UnprocessableEntityException('Dữ liệu lịch sử còn lỗi chặn; hãy sửa và xem trước lại.');
      }
      if (
        prepared.response.batchRef !== dto.batchRef
        || prepared.response.requestFingerprint !== dto.requestFingerprint
      ) {
        throw new ConflictException('Bản xem trước lịch sử đã thay đổi; hãy xem trước lại trước khi xác nhận.');
      }

      const actorUserId = request.auth!.user.id;
      const confirmedAt = new Date();
      const batch = await tx.historicalTeachingImportBatch.create({
        data: {
          academicYearId: dto.academicYearId,
          sourceSha256: prepared.response.sourceSha256,
          operationalStartPolicyVersionId: prepared.response.operationalStartPolicyVersionId,
          operationalStartDate: parseCivilDate(prepared.response.operationalStartDate),
          requestKey: dto.requestKey,
          requestFingerprint: prepared.response.requestFingerprint,
          confirmedByUserId: actorUserId,
          confirmedAt,
        },
      });

      const output: HistoricalTeachingConfirmResponse['rows'] = [];
      for (const preparedRow of prepared.rows) {
        const row = preparedRow.normalized;
        const dispositionId = await this.materializeDisposition(tx, preparedRow, dto.requestKey, actorUserId, confirmedAt);
        const makeupId = await this.materializeMakeup(tx, preparedRow, dto.requestKey, actorUserId, confirmedAt);
        const execution = await this.createExecution(tx, preparedRow, dispositionId, makeupId, dto.requestKey, actorUserId);

        await tx.historicalTeachingImportRow.create({
          data: {
            batchId: batch.id,
            rowNumber: row.rowNumber,
            rowHash: row.rowRef,
            kind: row.kind,
            schoolClassCode: row.schoolClassCode,
            subjectCode: row.subjectCode,
            sourceCivilDate: parseCivilDate(row.sourceCivilDate),
            sourceSession: row.sourceSession,
            sourceOrdinal: row.sourceOrdinal,
            actualTeacherStaffCode: row.actualTeacherStaffCode,
            executionCivilDate: parseCivilDate(row.executionCivilDate),
            executionSession: row.executionSession,
            executionOrdinal: row.executionOrdinal,
            note: row.note,
            curricularTeachingExecutionId: execution.id,
            operationalLessonDispositionId: dispositionId,
            makeupTeachingScheduleId: makeupId,
            ownsOperationalLessonDisposition: preparedRow.disposition.mode === 'CREATE' || preparedRow.disposition.mode === 'REPLACE',
            ownsMakeupTeachingSchedule: preparedRow.makeup.mode === 'CREATE' || preparedRow.makeup.mode === 'REPLACE',
          },
        });

        await this.audit.write({
          actorUserId,
          action: 'TEACHING_EXECUTION_CONFIRMED',
          entityType: 'CurricularTeachingExecution',
          entityId: execution.id,
          requestId: requestMeta(request).requestId,
          result: AuditResult.SUCCESS,
          metadata: {
            commandFamily: 'CURRICULAR_HISTORICAL_IMPORT',
            batchId: batch.id,
            rowNumber: row.rowNumber,
            rowRef: row.rowRef,
            kind: row.kind,
            sourceNormalOccurrenceKey: preparedRow.occurrence.occurrenceKey,
            ppctItemRevisionId: preparedRow.expected.ppctItemRevisionId,
            replacesId: preparedRow.replacesExecutionId,
          },
        }, tx);

        output.push({
          rowNumber: row.rowNumber,
          rowRef: row.rowRef,
          kind: row.kind,
          executionId: execution.id,
        });
      }

      await this.audit.write({
        actorUserId,
        action: 'HISTORICAL_TEACHING_IMPORT_CONFIRMED',
        entityType: 'HistoricalTeachingImportBatch',
        entityId: batch.id,
        requestId: requestMeta(request).requestId,
        result: AuditResult.SUCCESS,
        metadata: {
          academicYearId: dto.academicYearId,
          sourceSha256: prepared.response.sourceSha256,
          operationalStartPolicyVersionId: prepared.response.operationalStartPolicyVersionId,
          operationalStartDate: prepared.response.operationalStartDate,
          rowCount: output.length,
        },
      }, tx);

      return {
        profile: HISTORICAL_TEACHING_PROFILE,
        outcome: 'CREATED',
        batchId: batch.id,
        requestFingerprint: prepared.response.requestFingerprint,
        sourceSha256: prepared.response.sourceSha256,
        confirmedAt: batch.confirmedAt.toISOString(),
        rows: output,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async reverse(
    executionId: string,
    dto: ReverseTeachingExecutionDto,
    request: AuthenticatedRequest,
  ): Promise<HistoricalTeachingReverseResponse> {
    return this.retryMutation(async () => this.prisma.$transaction(async (tx) => {
      const execution = await tx.curricularTeachingExecution.findUnique({ where: { id: executionId } });
      if (!execution) throw new NotFoundException('Không tìm thấy bằng chứng tiết dạy.');
      const provenance = await tx.historicalTeachingImportRow.findUnique({
        where: { curricularTeachingExecutionId: executionId },
      });
      if (!provenance) {
        throw new ConflictException('Bằng chứng này không thuộc luồng nạp lịch sử P3.');
      }

      const fingerprint = reverseFingerprint(executionId, dto.expectedUpdatedAt, dto.reversalReason.trim());
      if (execution.reverseRequestKey) {
        if (execution.reverseRequestKey !== dto.requestKey || execution.reverseRequestFingerprint !== fingerprint) {
          throw new ConflictException('requestKey đảo ngược đã được dùng với nội dung khác.');
        }
        return { outcome: 'IDEMPOTENT_REPLAY', executionId, updatedAt: execution.updatedAt.toISOString() };
      }
      if (
        execution.status !== TeachingExecutionStatus.ACTIVE
        || execution.updatedAt.toISOString() !== dto.expectedUpdatedAt
      ) {
        throw new ConflictException('Bằng chứng đã thay đổi hoặc không còn ACTIVE.');
      }

      const reversedAt = new Date();
      if (provenance.ownsOperationalLessonDisposition && provenance.operationalLessonDispositionId) {
        const disposition = await tx.operationalLessonDisposition.findUnique({ where: { id: provenance.operationalLessonDispositionId } });
        if (!disposition || disposition.status !== OperationalOverlayStatus.ACTIVE) {
          throw new ConflictException('Provenance dạy thay lịch sử không còn ACTIVE đồng bộ với execution.');
        }
        const key = internalRequestKey('disp-reverse', dto.requestKey, provenance.rowHash);
        const fp = shaObject({ version: 'historical-disposition-reverse-v1', id: disposition.id, reason: dto.reversalReason.trim() });
        await tx.operationalLessonDisposition.update({
          where: { id: disposition.id },
          data: {
            status: OperationalOverlayStatus.REVERSED,
            reversedByUserId: request.auth!.user.id,
            reversedAt,
            reversalReason: dto.reversalReason.trim(),
            reverseRequestKey: key,
            reverseRequestFingerprint: fp,
          },
        });
      }

      if (provenance.ownsMakeupTeachingSchedule && provenance.makeupTeachingScheduleId) {
        const makeup = await tx.makeupTeachingSchedule.findUnique({ where: { id: provenance.makeupTeachingScheduleId } });
        if (!makeup || makeup.status !== OperationalOverlayStatus.ACTIVE) {
          throw new ConflictException('Provenance dạy bù lịch sử không còn ACTIVE đồng bộ với execution.');
        }
        const key = internalRequestKey('makeup-reverse', dto.requestKey, provenance.rowHash);
        const fp = shaObject({ version: 'historical-makeup-reverse-v1', id: makeup.id, reason: dto.reversalReason.trim() });
        await tx.makeupTeachingSchedule.update({
          where: { id: makeup.id },
          data: {
            status: OperationalOverlayStatus.REVERSED,
            reversedByUserId: request.auth!.user.id,
            reversedAt,
            reversalReason: dto.reversalReason.trim(),
            reverseRequestKey: key,
            reverseRequestFingerprint: fp,
          },
        });
      }

      const changed = await tx.curricularTeachingExecution.updateMany({
        where: { id: executionId, status: TeachingExecutionStatus.ACTIVE, updatedAt: execution.updatedAt },
        data: {
          status: TeachingExecutionStatus.REVERSED,
          reversedByUserId: request.auth!.user.id,
          reversedAt,
          reversalReason: dto.reversalReason.trim(),
          reverseRequestKey: dto.requestKey,
          reverseRequestFingerprint: fingerprint,
        },
      });
      if (changed.count !== 1) throw new ConflictException('Bằng chứng đã thay đổi đồng thời.');
      const result = await tx.curricularTeachingExecution.findUniqueOrThrow({ where: { id: executionId } });

      await this.audit.write({
        actorUserId: request.auth!.user.id,
        action: 'HISTORICAL_TEACHING_EVIDENCE_REVERSED',
        entityType: 'CurricularTeachingExecution',
        entityId: executionId,
        requestId: requestMeta(request).requestId,
        result: AuditResult.SUCCESS,
        metadata: {
          historicalTeachingImportRowId: provenance.id,
          rowNumber: provenance.rowNumber,
          reversalReason: dto.reversalReason.trim(),
        },
      }, tx);

      return { outcome: 'REVERSED', executionId, updatedAt: result.updatedAt.toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  }

  async reconciliation(query: HistoricalTeachingReconciliationQueryDto): Promise<HistoricalTeachingReconciliationResponse> {
    return this.prisma.$transaction(async (tx) => {
      const academicYear = await tx.academicYear.findUnique({
        where: { id: query.academicYearId },
        select: { id: true, code: true, name: true },
      });
      if (!academicYear) throw new NotFoundException('Không tìm thấy năm học.');

      const schoolClass = await tx.schoolClass.findUnique({
        where: { academicYearId_code: { academicYearId: query.academicYearId, code: normalizedCode(query.schoolClassCode) } },
        select: { id: true, code: true, name: true },
      });
      if (!schoolClass) throw new NotFoundException('Không tìm thấy lớp trong năm học đã chọn.');

      const subject = await tx.subject.findUnique({
        where: { code: normalizedCode(query.subjectCode) },
        select: { id: true, code: true, name: true },
      });
      if (!subject) throw new NotFoundException('Không tìm thấy môn học.');

      const policy = await this.businessConfiguration.resolveOperationalStartPolicy(
        query.academicYearId,
        this.businessConfiguration.businessCivilDate(),
        tx,
      );
      const throughCivilDate = previousCivilDate(policy.operationalStartDate);
      const calendar = await tx.academicCalendarVersion.findFirst({
        where: { academicYearId: query.academicYearId, startDate: { lte: parseCivilDate(policy.operationalStartDate) } },
        orderBy: [{ versionNumber: 'asc' }, { id: 'asc' }],
        select: { startDate: true },
      });
      if (!calendar || throughCivilDate < formatCivilDate(calendar.startDate)) {
        return {
          profile: HISTORICAL_TEACHING_PROFILE,
          academicYear,
          schoolClass,
          subject,
          operationalStartDate: policy.operationalStartDate,
          throughCivilDate,
          counts: { confirmed: 0, unconfirmed: 0, conflict: 0 },
          rows: [],
          findings: [],
        };
      }

      const [allocation, executions, slots] = await Promise.all([
        this.allocation.resolveInTransactionV2(tx, {
          academicYearId: query.academicYearId,
          schoolClassId: schoolClass.id,
          subjectId: subject.id,
          throughCivilDate,
        }),
        tx.curricularTeachingExecution.findMany({
          where: {
            academicYearId: query.academicYearId,
            schoolClassId: schoolClass.id,
            subjectId: subject.id,
            sourceCivilDate: { lt: parseCivilDate(policy.operationalStartDate) },
          },
          orderBy: [{ sourceCivilDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        }),
        tx.timeSlotDefinition.findMany({ where: { academicYearId: query.academicYearId } }),
      ]);
      const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
      const active = executions.filter((execution) => execution.status === TeachingExecutionStatus.ACTIVE);
      const rows: HistoricalTeachingReconciliationRow[] = [];
      const seenExecutionIds = new Set<string>();

      for (const distributed of allocation.normalAllocations) {
        if (distributed.allocationEffect !== 'CONSUMES_NEXT_ITEM') continue;
        const occurrence = distributed.occurrence;
        const slot = slotMap.get(occurrence.timeSlot.id);
        const responsible = await this.displayName(tx, occurrence.responsibleTeacherUserId);
        const candidates = active.filter((execution) => execution.sourceNormalOccurrenceKey === occurrence.occurrenceKey);
        candidates.forEach((execution) => seenExecutionIds.add(execution.id));
        const findings: string[] = allocation.findings
          .filter((finding) => finding.occurrenceKey === occurrence.occurrenceKey)
          .map((finding) => finding.code);

        let status: HistoricalTeachingReconciliationRow['status'];
        const execution = candidates[0] ?? null;
        if (
          distributed.allocationStatus !== 'ALLOCATED'
          || !distributed.expectedPpctItem
          || candidates.length > 1
          || (execution && (
            execution.ppctClassAssociationId !== distributed.expectedPpctItem.ppctClassAssociationId
            || execution.ppctPlanId !== distributed.expectedPpctItem.ppctPlanId
            || execution.ppctVersionId !== distributed.expectedPpctItem.ppctVersionId
            || execution.ppctItemId !== distributed.expectedPpctItem.ppctItemId
            || execution.ppctItemRevisionId !== distributed.expectedPpctItem.ppctItemRevisionId
          ))
        ) {
          status = 'CONFLICT';
          if (candidates.length > 1) findings.push('DUPLICATE_ACTIVE_EXECUTION');
          if (execution && distributed.expectedPpctItem) findings.push('EXECUTION_PPCT_PROVENANCE_MISMATCH');
        } else if (!execution) {
          status = 'UNCONFIRMED';
        } else {
          status = 'CONFIRMED';
        }

        rows.push({
          occurrenceKey: occurrence.occurrenceKey,
          sourceCivilDate: occurrence.civilDate,
          sourceSession: (slot?.session ?? occurrence.timeSlot.session) as HistoricalTeachingReconciliationRow['sourceSession'],
          sourceOrdinal: slot?.ordinal ?? 0,
          sourceSlotLabel: slot?.displayLabel ?? `${occurrence.timeSlot.session} ${occurrence.timeSlot.startTime}`,
          responsibleTeacherDisplayName: responsible ?? 'Không xác định',
          ppct: distributed.expectedPpctItem ? {
            component: distributed.expectedPpctItem.component ?? 'CORE',
            sequence: distributed.expectedPpctItem.sequence,
            title: distributed.expectedPpctItem.title,
            lessonType: distributed.expectedPpctItem.lessonType,
          } : null,
          status,
          executionId: execution?.id ?? null,
          executionUpdatedAt: execution?.updatedAt.toISOString() ?? null,
          executionKind: execution?.kind ?? null,
          actualTeacherDisplayName: execution?.actualTeacherDisplayNameSnapshot ?? null,
          findings: [...new Set(findings)].sort(),
        });
      }

      const orphanIds = active.filter((execution) => !seenExecutionIds.has(execution.id)).map((execution) => execution.id);
      const findings = orphanIds.map((id) => `ORPHAN_ACTIVE_EXECUTION:${id}`);
      return {
        profile: HISTORICAL_TEACHING_PROFILE,
        academicYear,
        schoolClass,
        subject,
        operationalStartDate: policy.operationalStartDate,
        throughCivilDate,
        counts: {
          confirmed: rows.filter((row) => row.status === 'CONFIRMED').length,
          unconfirmed: rows.filter((row) => row.status === 'UNCONFIRMED').length,
          conflict: rows.filter((row) => row.status === 'CONFLICT').length + orphanIds.length,
        },
        rows,
        findings,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private async prepare(tx: Db, academicYearId: string, sourceText: string): Promise<PreparedBatch> {
    const parsed = parseHistoricalTeachingCsv(sourceText);
    const sourceSha256 = shaText(sourceText);
    const academicYear = await tx.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true, code: true, name: true },
    });
    if (!academicYear) throw new NotFoundException('Không tìm thấy năm học.');

    const policy = await this.businessConfiguration.resolveOperationalStartPolicy(
      academicYearId,
      this.businessConfiguration.businessCivilDate(),
      tx,
    );

    const classCodes = [...new Set(parsed.rows.map((row) => row.schoolClassCode))];
    const subjectCodes = [...new Set(parsed.rows.map((row) => row.subjectCode))];
    const teacherCodes = [...new Set(parsed.rows.map((row) => row.actualTeacherStaffCode))];
    const [classes, subjects, profiles, slots] = await Promise.all([
      tx.schoolClass.findMany({
        where: { academicYearId, code: { in: classCodes } },
        select: { id: true, code: true, name: true, gradeLevel: true },
      }),
      tx.subject.findMany({
        where: { code: { in: subjectCodes } },
        select: { id: true, code: true, name: true },
      }),
      tx.staffProfile.findMany({
        where: { staffCode: { in: teacherCodes } },
        include: { user: true },
      }),
      tx.timeSlotDefinition.findMany({ where: { academicYearId } }),
    ]);
    const classMap = new Map(classes.map((item) => [normalizedCode(item.code), item]));
    const subjectMap = new Map(subjects.map((item) => [normalizedCode(item.code), item]));
    const profileMap = new Map(profiles.filter((item) => item.staffCode).map((item) => [normalizedCode(item.staffCode!), item]));
    const slotById = new Map(slots.map((slot) => [slot.id, slot as Slot]));
    const slotByCoordinate = new Map<string, Slot[]>();
    for (const rawSlot of slots) {
      const slot = rawSlot as Slot;
      const key = slotKey(slot.weekday, slot.session, slot.ordinal);
      const bucket = slotByCoordinate.get(key) ?? [];
      bucket.push(slot);
      slotByCoordinate.set(key, bucket);
    }

    const groupRows = new Map<string, { classId: string; subjectId: string; throughCivilDate: string }>();
    for (const row of parsed.rows) {
      const schoolClass = classMap.get(row.schoolClassCode);
      const subject = subjectMap.get(row.subjectCode);
      if (!schoolClass || !subject) continue;
      const key = `${schoolClass.id}:${subject.id}`;
      const existing = groupRows.get(key);
      if (!existing || row.sourceCivilDate > existing.throughCivilDate) {
        groupRows.set(key, { classId: schoolClass.id, subjectId: subject.id, throughCivilDate: row.sourceCivilDate });
      }
    }

    const allocations = new Map<string, Awaited<ReturnType<PpctOccurrenceAllocationService['resolveInTransactionV2']>>>();
    for (const [key, scope] of [...groupRows.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      allocations.set(key, await this.allocation.resolveInTransactionV2(tx, {
        academicYearId,
        schoolClassId: scope.classId,
        subjectId: scope.subjectId,
        throughCivilDate: scope.throughCivilDate as `${number}-${number}-${number}`,
      }));
    }

    const globalIssues: HistoricalTeachingIssue[] = [...parsed.issues];
    const preparedRows: PreparedRow[] = [];
    const previews: HistoricalTeachingPreviewRow[] = [];
    const responsibleNames = new Map<string, string | null>();

    for (const row of parsed.rows) {
      const issues: HistoricalTeachingIssue[] = [];
      const schoolClass = classMap.get(row.schoolClassCode);
      const subject = subjectMap.get(row.subjectCode);
      const actualProfile = profileMap.get(row.actualTeacherStaffCode);

      if (!schoolClass) issues.push(blocker(row.rowNumber, 'HISTORY_CLASS_NOT_FOUND', 'Không tìm thấy mã lớp trong năm học đã chọn.'));
      if (!subject) issues.push(blocker(row.rowNumber, 'HISTORY_SUBJECT_NOT_FOUND', 'Không tìm thấy mã môn học.'));
      if (!actualProfile) issues.push(blocker(row.rowNumber, 'HISTORY_TEACHER_NOT_FOUND', 'Không tìm thấy mã cán bộ giáo viên thực dạy.'));
      if (row.sourceCivilDate >= policy.operationalStartDate) {
        issues.push(blocker(row.rowNumber, 'HISTORY_SOURCE_NOT_PRE_OPERATIONAL', 'Ngày nghĩa vụ gốc không nằm trước mốc bắt đầu vận hành.'));
      }

      let selected: NormalPpctAllocation | null = null;
      let sourceSlot: Slot | null = null;
      if (schoolClass && subject) {
        const allocation = allocations.get(`${schoolClass.id}:${subject.id}`);
        const matches = (allocation?.normalAllocations ?? []).filter((candidate) => {
          const slot = slotById.get(candidate.occurrence.timeSlot.id);
          return candidate.occurrence.civilDate === row.sourceCivilDate
            && slot?.session === row.sourceSession
            && slot?.ordinal === row.sourceOrdinal;
        });
        if (matches.length !== 1) {
          issues.push(blocker(
            row.rowNumber,
            matches.length === 0 ? 'HISTORY_SOURCE_OCCURRENCE_NOT_FOUND' : 'HISTORY_SOURCE_OCCURRENCE_AMBIGUOUS',
            matches.length === 0
              ? 'Không tìm thấy đúng tiết TKB gốc theo lớp, môn, ngày, buổi và tiết.'
              : 'Có nhiều tiết nguồn phù hợp; dữ liệu retained bị mơ hồ.',
          ));
        } else {
          selected = matches[0]!;
          sourceSlot = slotById.get(selected.occurrence.timeSlot.id) ?? null;
          if (
            selected.allocationEffect !== 'CONSUMES_NEXT_ITEM'
            || selected.allocationStatus !== 'ALLOCATED'
            || !selected.expectedPpctItem
          ) {
            issues.push(blocker(row.rowNumber, 'HISTORY_PPCT_NOT_ALLOCATED', 'Tiết nguồn không có nghĩa vụ PPCT ALLOCATED đáng tin cậy.'));
          }
        }
      }

      if (sourceSlot && hcmSlotEnd(parseCivilDate(row.sourceCivilDate), sourceSlot.endTime) > new Date()) {
        issues.push(blocker(row.rowNumber, 'HISTORY_SOURCE_NOT_ENDED', 'Tiết nguồn chưa kết thúc theo giờ Việt Nam.'));
      }

      let responsibleDisplayName: string | null = null;
      if (selected) {
        if (!responsibleNames.has(selected.occurrence.responsibleTeacherUserId)) {
          responsibleNames.set(
            selected.occurrence.responsibleTeacherUserId,
            await this.displayName(tx, selected.occurrence.responsibleTeacherUserId),
          );
        }
        responsibleDisplayName = responsibleNames.get(selected.occurrence.responsibleTeacherUserId) ?? null;
        if (!responsibleDisplayName) {
          issues.push(blocker(row.rowNumber, 'HISTORY_RESPONSIBLE_TEACHER_SNAPSHOT_MISSING', 'Giáo viên chịu trách nhiệm không còn display snapshot hợp lệ.'));
        }
      }

      let eligibilityStaffSubjectId: string | null = null;
      if (actualProfile && selected && subject) {
        if (row.kind === 'NORMAL') {
          if (actualProfile.userId !== selected.occurrence.responsibleTeacherUserId) {
            issues.push(blocker(row.rowNumber, 'HISTORY_NORMAL_TEACHER_MISMATCH', 'BINH_THUONG phải do đúng giáo viên chịu trách nhiệm của TKB gốc thực dạy.'));
          }
          if (selected.occurrence.effectiveKind !== 'BASE_TIMETABLE') {
            issues.push(blocker(row.rowNumber, 'HISTORY_NORMAL_SOURCE_NOT_BASE', 'BINH_THUONG chỉ hợp lệ với cơ hội TKB gốc không có disposition/suppression.'));
          }
        } else {
          if (actualProfile.user.status !== UserStatus.ACTIVE || !actualProfile.isTeachingStaff) {
            issues.push(blocker(row.rowNumber, 'HISTORY_ACTUAL_TEACHER_NOT_ELIGIBLE', 'Giáo viên dạy thay/dạy bù phải là nhân sự giảng dạy ACTIVE hiện hành.'));
          } else {
            const eligibilityDate = row.kind === 'MAKEUP' ? row.executionCivilDate : row.sourceCivilDate;
            const proof = await tx.staffSubject.findFirst({
              where: {
                userId: actualProfile.userId,
                ...staffSubjectCoverageWhere(subject.id, eligibilityDate, eligibilityDate),
              },
              orderBy: [{ validFrom: 'desc' }, { id: 'asc' }],
              select: { id: true },
            });
            if (!proof) {
              issues.push(blocker(row.rowNumber, 'HISTORY_SAME_SUBJECT_ELIGIBILITY_MISSING', 'Không có StaffSubject bao phủ ngày thực dạy cho giáo viên và môn này.'));
            } else {
              eligibilityStaffSubjectId = proof.id;
            }
          }
        }
      }

      let disposition: DispositionPlan = { mode: 'NONE', id: null, replacesId: null, eligibilityStaffSubjectId: null };
      let makeup: MakeupPlan = { mode: 'NONE', id: null, replacesId: null, sourceDispositionId: null, eligibilityStaffSubjectId: null };
      let executionSlot = sourceSlot;
      let executionCalendarVersionId = selected?.occurrence.academicCalendarVersionId ?? '';
      let executionWeekId = '';
      let executionWeekSegmentId = '';
      let replacesExecutionId: string | null = null;

      if (selected?.expectedPpctItem && schoolClass && subject && sourceSlot && actualProfile) {
        const history = await this.executionHistory(tx, selected, selected.expectedPpctItem);
        if (history.active.length > 0) {
          issues.push(blocker(row.rowNumber, 'HISTORY_OBLIGATION_ALREADY_CONFIRMED', 'Nghĩa vụ này đã có execution ACTIVE.'));
        }
        if (history.openReversed.length > 1) {
          issues.push(blocker(row.rowNumber, 'HISTORY_REPLACEMENT_AMBIGUOUS', 'Có nhiều predecessor REVERSED chưa được thay thế cho cùng nghĩa vụ.'));
        } else if (history.openReversed.length === 1) {
          replacesExecutionId = history.openReversed[0]!.id;
        }

        const predecessorImport = replacesExecutionId
          ? await tx.historicalTeachingImportRow.findUnique({
              where: { curricularTeachingExecutionId: replacesExecutionId },
            })
          : null;

        if (row.kind === 'SUBSTITUTION') {
          if (actualProfile.userId === selected.occurrence.responsibleTeacherUserId) {
            issues.push(blocker(row.rowNumber, 'HISTORY_SUBSTITUTION_SAME_TEACHER', 'DAY_THAY phải có giáo viên thực dạy khác giáo viên chịu trách nhiệm.'));
          }
          if (selected.occurrence.effectiveKind === 'BASE_TIMETABLE') {
            let replacesId: string | null = null;
            if (predecessorImport?.operationalLessonDispositionId) {
              const predecessorDisposition = await tx.operationalLessonDisposition.findUnique({
                where: { id: predecessorImport.operationalLessonDispositionId },
                select: { status: true },
              });
              if (predecessorDisposition?.status === OperationalOverlayStatus.REVERSED) {
                replacesId = predecessorImport.operationalLessonDispositionId;
              }
            }
            if (eligibilityStaffSubjectId) {
              disposition = {
                mode: replacesId ? 'REPLACE' : 'CREATE',
                id: null,
                replacesId,
                eligibilityStaffSubjectId,
              };
            }
          } else if (
            selected.occurrence.effectiveKind === 'OPERATIONAL_DISPOSITION'
            && selected.occurrence.disposition?.dispositionType === OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION
            && selected.occurrence.disposition.assignedTeacherUserId === actualProfile.userId
          ) {
            disposition = {
              mode: 'REUSE',
              id: selected.occurrence.disposition.id,
              replacesId: null,
              eligibilityStaffSubjectId,
            };
          } else {
            issues.push(blocker(row.rowNumber, 'HISTORY_SUBSTITUTION_SOURCE_CONFLICT', 'Nguồn DAY_THAY đang có ý nghĩa vận hành không tương thích.'));
          }

          if (sourceSlot && eligibilityStaffSubjectId) {
            await this.assertHistoricalSubstitutionTeacherAvailable(
              tx,
              academicYearId,
              row.sourceCivilDate,
              sourceSlot,
              selected.occurrence.occurrenceKey,
              actualProfile.userId,
              issues,
              row.rowNumber,
            );
          }
        }

        if (row.kind === 'MAKEUP') {
          const allowedSource = selected.occurrence.effectiveKind === 'BASE_TIMETABLE'
            || (
              selected.occurrence.effectiveKind === 'OPERATIONAL_DISPOSITION'
              && ['ABSENCE_NO_REPLACEMENT', 'DIFFERENT_SUBJECT_SUPERVISION'].includes(selected.occurrence.disposition?.dispositionType ?? '')
            );
          if (!allowedSource) {
            issues.push(blocker(row.rowNumber, 'HISTORY_MAKEUP_SOURCE_NOT_ELIGIBLE', 'Nghĩa vụ gốc không còn là nguồn hợp lệ để xác nhận DAY_BU.'));
          }

          const targetDate = parseCivilDate(row.executionCivilDate);
          const targetWeekday = weekdayForCivilDate(targetDate);
          const candidates = slotByCoordinate.get(slotKey(targetWeekday, row.executionSession, row.executionOrdinal)) ?? [];
          const activeCandidates = candidates.filter((candidate) => candidate.isActive && candidate.allowMakeupTeaching);
          const retainedCandidates = candidates.filter((candidate) => candidate.allowMakeupTeaching);
          const targetSlot = activeCandidates.length === 1
            ? activeCandidates[0]!
            : activeCandidates.length === 0 && retainedCandidates.length === 1
              ? retainedCandidates[0]!
              : null;
          if (!targetSlot) {
            issues.push(blocker(row.rowNumber, 'HISTORY_MAKEUP_TARGET_SLOT_AMBIGUOUS', 'Không resolve được đúng một slot dạy bù theo ngày/buổi/tiết.'));
          } else {
            executionSlot = targetSlot;
            if (hcmSlotEnd(targetDate, targetSlot.endTime) > new Date()) {
              issues.push(blocker(row.rowNumber, 'HISTORY_MAKEUP_TARGET_NOT_ENDED', 'Tiết dạy bù thực tế chưa kết thúc theo giờ Việt Nam.'));
            }

            const targetVersions = await tx.timetableVersion.findMany({
              where: {
                academicYearId,
                status: { in: [TimetableVersionStatus.ACTIVE, TimetableVersionStatus.SUPERSEDED] },
                effectiveFrom: { lte: targetDate },
                OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: targetDate } }],
              },
              orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
              select: { id: true, calendarVersionId: true },
            });
            if (targetVersions.length !== 1 || !targetVersions[0]!.calendarVersionId) {
              issues.push(blocker(row.rowNumber, 'HISTORY_MAKEUP_TARGET_TIMETABLE_AMBIGUOUS', 'Ngày dạy bù không resolve được đúng một TKB retained có calendar authority.'));
            } else {
              executionCalendarVersionId = targetVersions[0]!.calendarVersionId!;
            }

            const sourceDispositionId = selected.occurrence.effectiveKind === 'OPERATIONAL_DISPOSITION'
              ? selected.occurrence.disposition?.id ?? null
              : null;
            const activeMakeups = await tx.makeupTeachingSchedule.findMany({
              where: {
                originalTimetableEntryId: selected.occurrence.timetableEntryId,
                originalCivilDate: parseCivilDate(row.sourceCivilDate),
                status: OperationalOverlayStatus.ACTIVE,
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            });
            if (activeMakeups.length > 1) {
              issues.push(blocker(row.rowNumber, 'HISTORY_MAKEUP_ACTIVE_AMBIGUOUS', 'Có nhiều lịch dạy bù ACTIVE cho cùng nghĩa vụ.'));
            } else if (activeMakeups.length === 1) {
              const existing = activeMakeups[0]!;
              if (
                existing.targetCivilDate.getTime() === targetDate.getTime()
                && existing.targetTimeSlotDefinitionId === targetSlot.id
                && existing.scheduledTeacherUserId === actualProfile.userId
              ) {
                makeup = {
                  mode: 'REUSE',
                  id: existing.id,
                  replacesId: null,
                  sourceDispositionId: existing.sourceDispositionId,
                  eligibilityStaffSubjectId: existing.eligibilityStaffSubjectId,
                };
              } else {
                issues.push(blocker(row.rowNumber, 'HISTORY_MAKEUP_ACTIVE_CONFLICT', 'Đã có lịch dạy bù ACTIVE khác đích hoặc khác giáo viên cho nghĩa vụ này.'));
              }
            } else if (eligibilityStaffSubjectId) {
              let replacesId: string | null = null;
              if (predecessorImport?.makeupTeachingScheduleId) {
                const predecessorMakeup = await tx.makeupTeachingSchedule.findUnique({
                  where: { id: predecessorImport.makeupTeachingScheduleId },
                  select: { status: true },
                });
                if (predecessorMakeup?.status === OperationalOverlayStatus.REVERSED) {
                  replacesId = predecessorImport.makeupTeachingScheduleId;
                }
              }
              makeup = {
                mode: replacesId ? 'REPLACE' : 'CREATE',
                id: null,
                replacesId,
                sourceDispositionId,
                eligibilityStaffSubjectId,
              };
            }

            if (targetSlot && executionCalendarVersionId) {
              await this.assertHistoricalMakeupTargetAvailable(
                tx,
                academicYearId,
                row.executionCivilDate,
                targetSlot,
                schoolClass.id,
                actualProfile.userId,
                makeup.mode === 'REUSE' ? makeup.id : null,
                issues,
                row.rowNumber,
              );
            }
          }
        }

        if (executionSlot && executionCalendarVersionId) {
          const week = await this.resolveWeek(tx, executionCalendarVersionId, parseCivilDate(row.executionCivilDate));
          if (!week) {
            issues.push(blocker(row.rowNumber, 'HISTORY_EXECUTION_WEEK_AMBIGUOUS', 'Không resolve được đúng một AcademicWeek/segment cho ngày thực dạy.'));
          } else {
            executionWeekId = week.weekId;
            executionWeekSegmentId = week.segmentId;
          }
        }
      }

      const expected = selected?.expectedPpctItem ?? null;
      const preview: HistoricalTeachingPreviewRow = {
        ...row,
        status: issues.length ? 'BLOCKED' : 'READY',
        schoolClassName: schoolClass?.name ?? null,
        subjectName: subject?.name ?? null,
        sourceSlotLabel: sourceSlot?.displayLabel ?? null,
        executionSlotLabel: executionSlot?.displayLabel ?? null,
        responsibleTeacherDisplayName: responsibleDisplayName,
        actualTeacherDisplayName: actualProfile?.displayName ?? null,
        ppct: expected ? {
          component: expected.component ?? 'CORE',
          sequence: expected.sequence,
          title: expected.title,
          lessonType: expected.lessonType,
        } : null,
        replacementCandidate: Boolean(replacesExecutionId),
        issues,
      };
      previews.push(preview);

      if (
        issues.length === 0
        && schoolClass
        && subject
        && selected
        && expected
        && sourceSlot
        && actualProfile
        && responsibleDisplayName
        && executionSlot
        && executionCalendarVersionId
        && executionWeekId
        && executionWeekSegmentId
      ) {
        preparedRows.push({
          normalized: row,
          preview,
          schoolClassId: schoolClass.id,
          schoolClassName: schoolClass.name,
          subjectId: subject.id,
          subjectName: subject.name,
          occurrence: selected.occurrence,
          expected,
          sourceSlot,
          actualTeacherUserId: actualProfile.userId,
          actualTeacherDisplayName: actualProfile.displayName,
          responsibleTeacherDisplayName: responsibleDisplayName,
          executionCalendarVersionId,
          executionSlot,
          executionWeekId,
          executionWeekSegmentId,
          replacesExecutionId,
          disposition,
          makeup,
        });
      }
    }

    this.applyInBatchConflictChecks(preparedRows, previews);

    const allIssues = [
      ...globalIssues,
      ...previews.flatMap((preview) => preview.issues),
    ];
    const canConfirm = parsed.rows.length > 0
      && preparedRows.length === parsed.rows.length
      && !allIssues.some((issue) => issue.severity === 'BLOCKER')
      && previews.every((preview) => preview.status === 'READY');

    const canonical = preparedRows
      .sort((left, right) => left.normalized.rowNumber - right.normalized.rowNumber)
      .map((row) => ({
        row: row.normalized,
        schoolClassId: row.schoolClassId,
        subjectId: row.subjectId,
        occurrenceKey: row.occurrence.occurrenceKey,
        timetableVersionId: row.occurrence.timetableVersionId,
        timetableEntryId: row.occurrence.timetableEntryId,
        sourceCalendarVersionId: row.occurrence.academicCalendarVersionId,
        sourceSlotId: row.sourceSlot.id,
        expected: row.expected,
        actualTeacherUserId: row.actualTeacherUserId,
        executionCalendarVersionId: row.executionCalendarVersionId,
        executionSlotId: row.executionSlot.id,
        executionWeekId: row.executionWeekId,
        executionWeekSegmentId: row.executionWeekSegmentId,
        replacesExecutionId: row.replacesExecutionId,
        disposition: row.disposition,
        makeup: row.makeup,
      }));
    const requestFingerprint = shaObject({
      version: HISTORICAL_TEACHING_PROFILE,
      academicYearId,
      sourceSha256,
      operationalStartPolicyVersionId: policy.policyVersionId,
      operationalStartDate: policy.operationalStartDate,
      rows: canonical,
    });

    return {
      response: {
        profile: HISTORICAL_TEACHING_PROFILE,
        academicYear,
        sourceSha256,
        batchRef: requestFingerprint.slice(0, 16),
        operationalStartDate: policy.operationalStartDate,
        operationalStartPolicyVersionId: policy.policyVersionId,
        requestFingerprint,
        canConfirm,
        rows: previews.sort((left, right) => left.rowNumber - right.rowNumber),
        issues: globalIssues,
      },
      rows: preparedRows,
    };
  }

  private applyInBatchConflictChecks(rows: PreparedRow[], previews: HistoricalTeachingPreviewRow[]): void {
    const byObligation = new Map<string, PreparedRow[]>();
    for (const row of rows) {
      const key = `${row.occurrence.occurrenceKey}:${row.expected.ppctItemId}`;
      const bucket = byObligation.get(key) ?? [];
      bucket.push(row);
      byObligation.set(key, bucket);
    }
    for (const bucket of byObligation.values()) {
      if (bucket.length < 2) continue;
      for (const row of bucket) {
        this.addPreviewIssue(previews, row.normalized.rowNumber, blocker(
          row.normalized.rowNumber,
          'HISTORY_DUPLICATE_OBLIGATION_IN_BATCH',
          'Một nghĩa vụ PPCT xuất hiện nhiều lần trong cùng batch.',
        ));
      }
    }

    for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
      const left = rows[leftIndex]!;
      if (left.normalized.kind !== 'MAKEUP') continue;
      for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
        const right = rows[rightIndex]!;
        if (right.normalized.kind !== 'MAKEUP' || left.normalized.executionCivilDate !== right.normalized.executionCivilDate) continue;
        if (!intervalsOverlap(left.executionSlot, right.executionSlot)) continue;
        if (left.schoolClassId !== right.schoolClassId && left.actualTeacherUserId !== right.actualTeacherUserId) continue;
        this.addPreviewIssue(previews, left.normalized.rowNumber, blocker(left.normalized.rowNumber, 'HISTORY_MAKEUP_BATCH_COLLISION', 'Hai dòng DAY_BU trong batch xung đột lớp hoặc giáo viên cùng thời gian.'));
        this.addPreviewIssue(previews, right.normalized.rowNumber, blocker(right.normalized.rowNumber, 'HISTORY_MAKEUP_BATCH_COLLISION', 'Hai dòng DAY_BU trong batch xung đột lớp hoặc giáo viên cùng thời gian.'));
      }
    }
  }

  private addPreviewIssue(previews: HistoricalTeachingPreviewRow[], rowNumber: number, issue: HistoricalTeachingIssue): void {
    const preview = previews.find((candidate) => candidate.rowNumber === rowNumber);
    if (!preview || preview.issues.some((candidate) => candidate.code === issue.code)) return;
    preview.issues.push(issue);
    preview.status = 'BLOCKED';
  }

  private async executionHistory(tx: Db, selected: NormalPpctAllocation, expected: ExpectedPpctItem) {
    const rows = await tx.curricularTeachingExecution.findMany({
      where: {
        academicYearId: selected.occurrence.academicYearId,
        schoolClassId: selected.occurrence.schoolClass.id,
        subjectId: selected.occurrence.subjectId,
        originalTimetableEntryId: selected.occurrence.timetableEntryId,
        sourceCivilDate: parseCivilDate(selected.occurrence.civilDate),
        ppctClassAssociationId: expected.ppctClassAssociationId,
        ppctPlanId: expected.ppctPlanId,
        ppctVersionId: expected.ppctVersionId,
        ppctItemId: expected.ppctItemId,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const replacedIds = new Set(rows.map((row) => row.replacesId).filter((value): value is string => Boolean(value)));
    return {
      active: rows.filter((row) => row.status === TeachingExecutionStatus.ACTIVE),
      openReversed: rows.filter((row) => row.status === TeachingExecutionStatus.REVERSED && !replacedIds.has(row.id)),
    };
  }

  private async materializeDisposition(
    tx: Db,
    prepared: PreparedRow,
    requestKey: string,
    actorUserId: string,
    checkedAt: Date,
  ): Promise<string | null> {
    if (prepared.disposition.mode === 'NONE') return null;
    if (prepared.disposition.mode === 'REUSE') return prepared.disposition.id;
    const row = prepared.normalized;
    const key = internalRequestKey('disp', requestKey, row.rowRef);
    const fingerprint = shaObject({
      version: 'historical-disposition-v1',
      occurrenceKey: prepared.occurrence.occurrenceKey,
      actualTeacherUserId: prepared.actualTeacherUserId,
      replacesId: prepared.disposition.replacesId,
    });
    const created = await tx.operationalLessonDisposition.create({
      data: {
        academicYearId: prepared.occurrence.academicYearId,
        timetableVersionId: prepared.occurrence.timetableVersionId,
        timetableEntryId: prepared.occurrence.timetableEntryId,
        sourceCivilDate: parseCivilDate(row.sourceCivilDate),
        academicCalendarVersionId: prepared.occurrence.academicCalendarVersionId,
        timeSlotDefinitionId: prepared.sourceSlot.id,
        schoolClassId: prepared.schoolClassId,
        subjectId: prepared.subjectId,
        teachingAssignmentId: prepared.occurrence.teachingAssignmentId,
        responsibleTeacherUserId: prepared.occurrence.responsibleTeacherUserId,
        dispositionType: OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION,
        assignedTeacherUserId: prepared.actualTeacherUserId,
        eligibilityCheckedAt: checkedAt,
        eligibilityWasActive: true,
        eligibilityWasTeachingStaff: true,
        eligibilitySameSubject: true,
        eligibilityStaffSubjectId: prepared.disposition.eligibilityStaffSubjectId,
        note: row.note,
        replacesId: prepared.disposition.replacesId,
        createRequestKey: key,
        createRequestFingerprint: fingerprint,
        createdByUserId: actorUserId,
      },
    });
    return created.id;
  }

  private async materializeMakeup(
    tx: Db,
    prepared: PreparedRow,
    requestKey: string,
    actorUserId: string,
    checkedAt: Date,
  ): Promise<string | null> {
    if (prepared.makeup.mode === 'NONE') return null;
    if (prepared.makeup.mode === 'REUSE') return prepared.makeup.id;
    const row = prepared.normalized;
    const key = internalRequestKey('makeup', requestKey, row.rowRef);
    const fingerprint = shaObject({
      version: 'historical-makeup-v1',
      occurrenceKey: prepared.occurrence.occurrenceKey,
      executionCivilDate: row.executionCivilDate,
      executionSlotId: prepared.executionSlot.id,
      actualTeacherUserId: prepared.actualTeacherUserId,
      replacesId: prepared.makeup.replacesId,
    });
    const created = await tx.makeupTeachingSchedule.create({
      data: {
        academicYearId: prepared.occurrence.academicYearId,
        originalTimetableVersionId: prepared.occurrence.timetableVersionId,
        originalTimetableEntryId: prepared.occurrence.timetableEntryId,
        originalCivilDate: parseCivilDate(row.sourceCivilDate),
        originalAcademicCalendarVersionId: prepared.occurrence.academicCalendarVersionId,
        originalTimeSlotDefinitionId: prepared.sourceSlot.id,
        schoolClassId: prepared.schoolClassId,
        subjectId: prepared.subjectId,
        originalTeachingAssignmentId: prepared.occurrence.teachingAssignmentId,
        responsibleTeacherUserId: prepared.occurrence.responsibleTeacherUserId,
        ppctClassAssociationId: prepared.expected.ppctClassAssociationId,
        ppctPlanId: prepared.expected.ppctPlanId,
        ppctVersionId: prepared.expected.ppctVersionId,
        ppctItemId: prepared.expected.ppctItemId,
        sourceDispositionId: prepared.makeup.sourceDispositionId,
        targetCivilDate: parseCivilDate(row.executionCivilDate),
        targetAcademicCalendarVersionId: prepared.executionCalendarVersionId,
        targetTimeSlotDefinitionId: prepared.executionSlot.id,
        scheduledTeacherUserId: prepared.actualTeacherUserId,
        eligibilityCheckedAt: checkedAt,
        eligibilityWasActive: true,
        eligibilityWasTeachingStaff: true,
        eligibilitySameSubject: true,
        eligibilityStaffSubjectId: prepared.makeup.eligibilityStaffSubjectId,
        note: row.note,
        replacesId: prepared.makeup.replacesId,
        createRequestKey: key,
        createRequestFingerprint: fingerprint,
        createdByUserId: actorUserId,
      },
    });
    return created.id;
  }

  private async createExecution(
    tx: Db,
    prepared: PreparedRow,
    dispositionId: string | null,
    makeupId: string | null,
    requestKey: string,
    actorUserId: string,
  ) {
    const row = prepared.normalized;
    const createRequestKey = internalRequestKey('exec', requestKey, row.rowRef);
    const createRequestFingerprint = createFingerprint('CURRICULAR_HISTORICAL_IMPORT', {
      rowRef: row.rowRef,
      occurrenceKey: prepared.occurrence.occurrenceKey,
      ppctItemRevisionId: prepared.expected.ppctItemRevisionId,
      actualTeacherUserId: prepared.actualTeacherUserId,
      executionCivilDate: row.executionCivilDate,
      executionTimeSlotDefinitionId: prepared.executionSlot.id,
      dispositionId,
      makeupId,
      replacesId: prepared.replacesExecutionId,
    });
    return tx.curricularTeachingExecution.create({
      data: {
        kind: row.kind === 'MAKEUP' ? 'MAKEUP' : 'NORMAL',
        academicYearId: prepared.occurrence.academicYearId,
        schoolClassId: prepared.schoolClassId,
        subjectId: prepared.subjectId,
        sourceNormalOccurrenceKey: prepared.occurrence.occurrenceKey,
        originalTimetableVersionId: prepared.occurrence.timetableVersionId,
        originalTimetableEntryId: prepared.occurrence.timetableEntryId,
        sourceCivilDate: parseCivilDate(row.sourceCivilDate),
        sourceAcademicCalendarVersionId: prepared.occurrence.academicCalendarVersionId,
        sourceTimeSlotDefinitionId: prepared.sourceSlot.id,
        originalTeachingAssignmentId: prepared.occurrence.teachingAssignmentId,
        responsibleTeacherUserId: prepared.occurrence.responsibleTeacherUserId,
        ppctClassAssociationId: prepared.expected.ppctClassAssociationId,
        ppctPlanId: prepared.expected.ppctPlanId,
        ppctVersionId: prepared.expected.ppctVersionId,
        ppctItemId: prepared.expected.ppctItemId,
        ppctItemRevisionId: prepared.expected.ppctItemRevisionId,
        operationalLessonDispositionId: row.kind === 'SUBSTITUTION' ? dispositionId : null,
        operationalDispositionType: row.kind === 'SUBSTITUTION' ? OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION : null,
        makeupTeachingScheduleId: row.kind === 'MAKEUP' ? makeupId : null,
        executionCivilDate: parseCivilDate(row.executionCivilDate),
        executionAcademicCalendarVersionId: prepared.executionCalendarVersionId,
        executionTimeSlotDefinitionId: prepared.executionSlot.id,
        executionAcademicWeekId: prepared.executionWeekId,
        executionAcademicWeekSegmentId: prepared.executionWeekSegmentId,
        actualTeacherUserId: prepared.actualTeacherUserId,
        schoolClassCodeSnapshot: prepared.normalized.schoolClassCode,
        schoolClassNameSnapshot: prepared.schoolClassName,
        subjectCodeSnapshot: prepared.normalized.subjectCode,
        subjectNameSnapshot: prepared.subjectName,
        responsibleTeacherDisplayNameSnapshot: prepared.responsibleTeacherDisplayName,
        actualTeacherDisplayNameSnapshot: prepared.actualTeacherDisplayName,
        note: row.note,
        createRequestKey,
        createRequestFingerprint,
        replacesId: prepared.replacesExecutionId,
        createdByUserId: actorUserId,
      },
    });
  }

  private async assertHistoricalSubstitutionTeacherAvailable(
    tx: Db,
    academicYearId: string,
    civilDate: string,
    sourceSlot: Slot,
    sourceOccurrenceKey: string,
    actualTeacherUserId: string,
    issues: HistoricalTeachingIssue[],
    rowNumber: number,
  ): Promise<void> {
    const structural = await this.structural.resolveInTransaction(tx, {
      academicYearId,
      civilDate: civilDate as `${number}-${number}-${number}`,
    });

    for (const occurrence of structural.normalOccurrences) {
      if (occurrence.occurrenceKey === sourceOccurrenceKey) continue;
      const slot = await tx.timeSlotDefinition.findUnique({ where: { id: occurrence.timeSlot.id } });
      if (!slot || !intervalsOverlap(sourceSlot, slot)) continue;
      const teacherOccupant = occurrence.effectiveKind === 'BASE_TIMETABLE'
        ? occurrence.responsibleTeacherUserId
        : occurrence.effectiveKind === 'OPERATIONAL_DISPOSITION'
          && ['SAME_SUBJECT_SUBSTITUTION', 'DIFFERENT_SUBJECT_SUPERVISION'].includes(occurrence.disposition?.dispositionType ?? '')
          ? occurrence.disposition?.assignedTeacherUserId
          : null;
      if (teacherOccupant === actualTeacherUserId) {
        issues.push(blocker(
          rowNumber,
          'HISTORY_SUBSTITUTION_TEACHER_COLLISION',
          'Giáo viên DAY_THAY đang có occupancy TKB canonical khác cùng thời gian.',
        ));
        return;
      }
    }

    for (const activity of structural.specialActivityOccurrences) {
      const overlaps = activity.timeSlots.some((slot) => {
        const start = new Date(`1970-01-01T${slot.startTime}Z`);
        const end = new Date(`1970-01-01T${slot.endTime}Z`);
        return intervalsOverlap(sourceSlot, { startTime: start, endTime: end });
      });
      if (overlaps && activity.staffing.some((staffing) => staffing.scheduledTeacherUserId === actualTeacherUserId)) {
        issues.push(blocker(
          rowNumber,
          'HISTORY_SUBSTITUTION_TEACHER_ACTIVITY_COLLISION',
          'Giáo viên DAY_THAY đang có SpecialActivity cùng thời gian.',
        ));
        return;
      }
    }

    for (const makeup of structural.makeupOccurrences) {
      if (makeup.target.scheduledTeacherUserId !== actualTeacherUserId) continue;
      const slot = await tx.timeSlotDefinition.findUnique({ where: { id: makeup.target.targetTimeSlotDefinitionId } });
      if (slot && intervalsOverlap(sourceSlot, slot)) {
        issues.push(blocker(
          rowNumber,
          'HISTORY_SUBSTITUTION_TEACHER_MAKEUP_COLLISION',
          'Giáo viên DAY_THAY đang có lịch dạy bù ACTIVE cùng thời gian.',
        ));
        return;
      }
    }
  }

  private async assertHistoricalMakeupTargetAvailable(
    tx: Db,
    academicYearId: string,
    civilDate: string,
    targetSlot: Slot,
    schoolClassId: string,
    actualTeacherUserId: string,
    reusedMakeupId: string | null,
    issues: HistoricalTeachingIssue[],
    rowNumber: number,
  ): Promise<void> {
    const structural = await this.structural.resolveInTransaction(tx, { academicYearId, civilDate: civilDate as `${number}-${number}-${number}` });
    for (const occurrence of structural.normalOccurrences) {
      const slot = await tx.timeSlotDefinition.findUnique({ where: { id: occurrence.timeSlot.id } });
      if (!slot || !intervalsOverlap(targetSlot, slot)) continue;
      const classOccupies = occurrence.schoolClass.id === schoolClassId
        && (
          occurrence.effectiveKind === 'BASE_TIMETABLE'
          || (
            occurrence.effectiveKind === 'OPERATIONAL_DISPOSITION'
            && ['SAME_SUBJECT_SUBSTITUTION', 'DIFFERENT_SUBJECT_SUPERVISION'].includes(occurrence.disposition?.dispositionType ?? '')
          )
        );
      const teacherOccupant = occurrence.effectiveKind === 'BASE_TIMETABLE'
        ? occurrence.responsibleTeacherUserId
        : occurrence.effectiveKind === 'OPERATIONAL_DISPOSITION'
          ? occurrence.disposition?.assignedTeacherUserId
          : null;
      if (classOccupies || teacherOccupant === actualTeacherUserId) {
        issues.push(blocker(rowNumber, 'HISTORY_MAKEUP_TARGET_TIMETABLE_COLLISION', 'DAY_BU xung đột với occupancy TKB canonical tại thời gian đích.'));
        break;
      }
    }

    for (const activity of structural.specialActivityOccurrences) {
      const overlaps = activity.timeSlots.some((slot) => {
        const start = new Date(`1970-01-01T${slot.startTime}Z`);
        const end = new Date(`1970-01-01T${slot.endTime}Z`);
        return intervalsOverlap(targetSlot, { startTime: start, endTime: end });
      });
      if (!overlaps) continue;
      if (activity.classTargetIds.includes(schoolClassId) || activity.staffing.some((staffing) => staffing.scheduledTeacherUserId === actualTeacherUserId)) {
        issues.push(blocker(rowNumber, 'HISTORY_MAKEUP_TARGET_ACTIVITY_COLLISION', 'DAY_BU xung đột với HĐTN/GDĐP/SpecialActivity tại thời gian đích.'));
        break;
      }
    }

    for (const makeup of structural.makeupOccurrences) {
      if (reusedMakeupId && makeup.target.id === reusedMakeupId) continue;
      const slot = await tx.timeSlotDefinition.findUnique({ where: { id: makeup.target.targetTimeSlotDefinitionId } });
      if (!slot || !intervalsOverlap(targetSlot, slot)) continue;
      if (makeup.target.schoolClassId === schoolClassId || makeup.target.scheduledTeacherUserId === actualTeacherUserId) {
        issues.push(blocker(rowNumber, 'HISTORY_MAKEUP_TARGET_MAKEUP_COLLISION', 'DAY_BU xung đột với lịch dạy bù ACTIVE khác.'));
        break;
      }
    }
  }

  private async resolveWeek(tx: Db, calendarVersionId: string, date: Date): Promise<{ weekId: string; segmentId: string } | null> {
    const segments = await tx.academicWeekSegment.findMany({
      where: { calendarVersionId, startDate: { lte: date }, endDate: { gte: date } },
      select: { id: true, academicWeekId: true },
      orderBy: [{ segmentOrder: 'asc' }, { id: 'asc' }],
    });
    return segments.length === 1 ? { weekId: segments[0]!.academicWeekId, segmentId: segments[0]!.id } : null;
  }

  private async displayName(tx: Db, userId: string): Promise<string | null> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { profile: { select: { displayName: true } } },
    });
    return user?.profile?.displayName ?? null;
  }

  private async retryMutation<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof HttpException) throw error;
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !['P2002', 'P2034'].includes(error.code)) throw error;
        if (attempt === 3) throw new ConflictException('Có thay đổi đồng thời; hãy xem trước lại.');
      }
    }
    throw new ConflictException('Có thay đổi đồng thời; hãy xem trước lại.');
  }
}
