import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { AuditResult, Prisma, TimetableImportReceipt, TimetableVersionStatus } from '@prisma/client';
import {
  TimetableImportReceiptRecord,
  TimetableImportWorkbookConfirmResponse,
  TimetableImportWorkbookInspectionResponse,
  TimetableImportWorkbookPreviewResponse,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { timetableVersionCountSelect, toTimetableVersionRecord } from '../timetables/mapper';
import { ConfirmTimetableImportWorkbookDto, PreviewTimetableImportWorkbookDto } from './dto';
import {
  computeConfirmRequestFingerprint,
  computeSemanticChecksum,
  computeWorkbookSha256,
} from './import-identity';
import { inspectParsedWorkbook } from './workbook-inspection';
import { MAX_XLSX_BYTES } from './workbook-limits';
import { WorkbookCanonicalizationService } from './workbook-canonicalization.service';
import { WorkbookParserService } from './workbook-parser.service';

export interface UploadedWorkbookFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const CONCURRENCY_CONSTRAINTS = [
  'timetable_versions_import_semantic_duplicate_key',
  'timetable_import_request_keys_request_key_key',
  'timetable_versions_academic_year_id_version_number_key',
] as const;
const MAX_TRANSACTION_ATTEMPTS = 3;

const replayInclude = {
  receipt: {
    include: {
      timetableVersion: { include: timetableVersionCountSelect },
    },
  },
} satisfies Prisma.TimetableImportRequestKeyInclude;

type ReplayBinding = Prisma.TimetableImportRequestKeyGetPayload<{ include: typeof replayInclude }>;

@Injectable()
export class TimetableImportWorkbookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: WorkbookParserService,
    private readonly canonicalization: WorkbookCanonicalizationService,
    private readonly audit: AuditService,
  ) {}

  async inspect(
    file: UploadedWorkbookFile | undefined,
    profileRevisionId: string,
  ): Promise<TimetableImportWorkbookInspectionResponse> {
    this.validateFile(file);
    const revision = await this.canonicalization.requireActiveRevision(profileRevisionId);
    const parsed = await this.parser.parse(file!.buffer);
    const inspection = inspectParsedWorkbook(
      parsed,
      this.canonicalization.headerMappings(revision),
      revision.sheetNameHint,
    );
    return {
      profileRevisionId,
      profileId: revision.profileId,
      sourceFileName: this.sourceFileName(file!.originalname),
      ...inspection,
    };
  }

  async preview(
    file: UploadedWorkbookFile | undefined,
    dto: PreviewTimetableImportWorkbookDto,
  ): Promise<TimetableImportWorkbookPreviewResponse> {
    this.validateFile(file);
    await this.canonicalization.requireActiveRevision(dto.profileRevisionId);
    const parsed = await this.parser.parse(file!.buffer);
    return this.canonicalization.preview(parsed, dto, this.sourceFileName(file!.originalname));
  }

  async confirm(
    file: UploadedWorkbookFile | undefined,
    dto: ConfirmTimetableImportWorkbookDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimetableImportWorkbookConfirmResponse> {
    this.validateFile(file);
    const workbookSha256 = computeWorkbookSha256(file!.buffer);
    const sourceFileName = this.sourceFileName(file!.originalname);

    if (dto.requestIdempotencyKey) {
      const existing = await this.loadReplayBinding(dto.requestIdempotencyKey, this.prisma);
      if (existing) return this.verifyBoundReplay(existing, dto, workbookSha256);
    }

    const parsed = await this.parser.parse(file!.buffer);
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          if (dto.requestIdempotencyKey) {
            const existing = await this.loadReplayBinding(dto.requestIdempotencyKey, tx);
            if (existing) return this.verifyBoundReplay(existing, dto, workbookSha256);
          }

          const canonical = await this.canonicalization.preview(parsed, dto, sourceFileName, tx);
          if (canonical.blockingIssueCount > 0) {
            throw new ConflictException({
              error: 'TIMETABLE_IMPORT_CONFIRM_BLOCKED',
              message: 'Workbook confirmation is blocked by canonical validation issues.',
              blockingIssueCount: canonical.blockingIssueCount,
              issues: canonical.issues,
            });
          }

          const semanticChecksum = computeSemanticChecksum(canonical.rows);
          const requestFingerprint = dto.requestIdempotencyKey
            ? computeConfirmRequestFingerprint({
              workbookSha256,
              profileRevisionId: dto.profileRevisionId,
              academicYearId: dto.academicYearId,
              calendarVersionId: dto.calendarVersionId,
              effectiveAcademicWeekId: dto.effectiveAcademicWeekId,
              sheetName: dto.sheetName,
              headerRowNumber: dto.headerRowNumber,
              semanticChecksum,
            })
            : null;

          const duplicate = await tx.timetableVersion.findFirst({
            where: {
              academicYearId: dto.academicYearId,
              calendarVersionId: dto.calendarVersionId,
              effectiveAcademicWeekId: dto.effectiveAcademicWeekId,
              contentChecksum: semanticChecksum,
            },
            include: {
              ...timetableVersionCountSelect,
              importReceipt: true,
            },
          });
          if (duplicate) {
            if (!duplicate.importReceipt) {
              throw new ConflictException({
                error: 'TIMETABLE_IMPORT_SEMANTIC_RECEIPT_INVARIANT',
                message: 'Semantic duplicate exists without an import receipt.',
              });
            }
            if (dto.requestIdempotencyKey) {
              await tx.timetableImportRequestKey.create({
                data: {
                  receiptId: duplicate.importReceipt.id,
                  requestKey: dto.requestIdempotencyKey,
                  requestFingerprint: requestFingerprint!,
                },
              });
              await this.audit.write({
                actorUserId,
                action: 'TIMETABLE_IMPORT_REPLAY_BOUND',
                entityType: 'TimetableImportReceipt',
                entityId: duplicate.importReceipt.id,
                requestId: meta.requestId,
                result: AuditResult.SUCCESS,
                metadata: {
                  timetableVersionId: duplicate.id,
                  academicYearId: dto.academicYearId,
                  calendarVersionId: dto.calendarVersionId,
                  effectiveAcademicWeekId: dto.effectiveAcademicWeekId,
                  semanticChecksum,
                  requestFingerprint,
                  outcome: 'IDEMPOTENT_REPLAY',
                },
              }, tx);
            }
            return {
              outcome: 'IDEMPOTENT_REPLAY',
              receipt: this.toReceiptRecord(duplicate.importReceipt),
              version: toTimetableVersionRecord(duplicate),
            };
          }

          const maximum = await tx.timetableVersion.aggregate({
            where: { academicYearId: dto.academicYearId },
            _max: { versionNumber: true },
          });
          const version = await tx.timetableVersion.create({
            data: {
              academicYearId: dto.academicYearId,
              versionNumber: (maximum._max.versionNumber ?? 0) + 1,
              status: TimetableVersionStatus.DRAFT,
              calendarVersionId: dto.calendarVersionId,
              effectiveAcademicWeekId: dto.effectiveAcademicWeekId,
              effectiveFrom: parseCivilDate(canonical.target.effectiveFrom),
              effectiveUntil: null,
              contentChecksum: semanticChecksum,
              createdByUserId: actorUserId,
            },
          });
          if (canonical.rows.length > 0) {
            await tx.timetableEntry.createMany({
              data: canonical.rows.map((row) => ({
                timetableVersionId: version.id,
                academicYearId: dto.academicYearId,
                weekday: row.weekday,
                timeSlotDefinitionId: row.timeSlotDefinitionId,
                schoolClassId: row.schoolClassId,
                subjectId: row.subjectId,
                teachingAssignmentId: row.teachingAssignmentId,
                teacherUserId: row.teacherUserId,
              })),
            });
          }
          const receipt = await tx.timetableImportReceipt.create({
            data: {
              timetableVersionId: version.id,
              profileRevisionId: dto.profileRevisionId,
              checksumAlgorithm: 'SHA-256',
              serializationVersion: 'semantic-v1',
              requestIdempotencyKey: dto.requestIdempotencyKey ?? null,
              requestFingerprint,
              sourceFileName,
              sheetName: dto.sheetName,
              headerRowNumber: dto.headerRowNumber,
              sourceRowCount: canonical.source.sourceRowCount,
              normalizedEntryCount: canonical.rows.length,
              createdByUserId: actorUserId,
            },
          });
          if (dto.requestIdempotencyKey) {
            await tx.timetableImportRequestKey.create({
              data: {
                receiptId: receipt.id,
                requestKey: dto.requestIdempotencyKey,
                requestFingerprint: requestFingerprint!,
              },
            });
          }
          await this.audit.write({
            actorUserId,
            action: 'TIMETABLE_IMPORT_COMMITTED',
            entityType: 'TimetableImportReceipt',
            entityId: receipt.id,
            requestId: meta.requestId,
            result: AuditResult.SUCCESS,
            metadata: {
              timetableVersionId: version.id,
              academicYearId: dto.academicYearId,
              calendarVersionId: dto.calendarVersionId,
              effectiveAcademicWeekId: dto.effectiveAcademicWeekId,
              profileRevisionId: dto.profileRevisionId,
              sourceRowCount: canonical.source.sourceRowCount,
              normalizedEntryCount: canonical.rows.length,
              semanticChecksum,
              requestFingerprint,
              outcome: 'CREATED',
            },
          }, tx);
          const reloaded = await tx.timetableVersion.findUniqueOrThrow({
            where: { id: version.id },
            include: timetableVersionCountSelect,
          });
          return {
            outcome: 'CREATED',
            receipt: this.toReceiptRecord(receipt),
            version: toTimetableVersionRecord(reloaded),
          };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof HttpException) throw error;
        if (!this.isRecognizedConcurrencyRace(error)) throw error;
        if (attempt === MAX_TRANSACTION_ATTEMPTS) {
          throw new ConflictException({
            error: 'TIMETABLE_IMPORT_CONFIRM_CONCURRENCY_CONFLICT',
            message: 'Workbook confirmation changed concurrently; retry the request.',
          });
        }
      }
    }
    throw new ConflictException({
      error: 'TIMETABLE_IMPORT_CONFIRM_CONCURRENCY_CONFLICT',
      message: 'Workbook confirmation changed concurrently; retry the request.',
    });
  }

  private validateFile(file: UploadedWorkbookFile | undefined): void {
    if (!file) throw new BadRequestException({ error: 'TIMETABLE_IMPORT_FILE_REQUIRED', message: 'XLSX file is required.' });
    if (file.size > MAX_XLSX_BYTES) {
      throw new PayloadTooLargeException({ error: 'TIMETABLE_IMPORT_FILE_TOO_LARGE', message: 'XLSX file exceeds 8 MiB.' });
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new UnsupportedMediaTypeException({ error: 'TIMETABLE_IMPORT_UNSUPPORTED_FILE_TYPE', message: 'Only .xlsx files are accepted.' });
    }
    if (!['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'].includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException({ error: 'TIMETABLE_IMPORT_UNSUPPORTED_FILE_TYPE', message: 'Unsupported workbook media type.' });
    }
  }

  private sourceFileName(value: string): string {
    const leaf = value.replaceAll('\\', '/').split('/').at(-1) ?? '';
    const safe = [...leaf].filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    }).join('');
    return safe.slice(0, 255) || 'workbook.xlsx';
  }

  private async loadReplayBinding(
    requestKey: string,
    db: Prisma.TransactionClient,
  ): Promise<ReplayBinding | null> {
    return db.timetableImportRequestKey.findUnique({
      where: { requestKey },
      include: replayInclude,
    });
  }

  private verifyBoundReplay(
    binding: ReplayBinding,
    dto: ConfirmTimetableImportWorkbookDto,
    workbookSha256: string,
  ): TimetableImportWorkbookConfirmResponse {
    const version = binding.receipt.timetableVersion;
    if (!version.contentChecksum || !/^[0-9a-f]{64}$/u.test(version.contentChecksum)) {
      throw new ConflictException({
        error: 'TIMETABLE_IMPORT_RECEIPT_CHECKSUM_INVARIANT',
        message: 'Receipt-linked version has an invalid semantic checksum.',
      });
    }
    const incoming = computeConfirmRequestFingerprint({
      workbookSha256,
      profileRevisionId: dto.profileRevisionId,
      academicYearId: dto.academicYearId,
      calendarVersionId: dto.calendarVersionId,
      effectiveAcademicWeekId: dto.effectiveAcademicWeekId,
      sheetName: dto.sheetName,
      headerRowNumber: dto.headerRowNumber,
      semanticChecksum: version.contentChecksum,
    });
    if (incoming !== binding.requestFingerprint) {
      throw new ConflictException({
        error: 'TIMETABLE_IMPORT_IDEMPOTENCY_KEY_REUSED',
        message: 'Request idempotency key was already used for a different confirmation request.',
      });
    }
    return {
      outcome: 'IDEMPOTENT_REPLAY',
      receipt: this.toReceiptRecord(binding.receipt),
      version: toTimetableVersionRecord(version),
    };
  }

  private toReceiptRecord(row: TimetableImportReceipt): TimetableImportReceiptRecord {
    return {
      id: row.id,
      timetableVersionId: row.timetableVersionId,
      profileRevisionId: row.profileRevisionId,
      checksumAlgorithm: 'SHA-256',
      serializationVersion: 'semantic-v1',
      requestIdempotencyKey: row.requestIdempotencyKey,
      requestFingerprint: row.requestFingerprint,
      sourceFileName: row.sourceFileName,
      sheetName: row.sheetName,
      headerRowNumber: row.headerRowNumber,
      sourceRowCount: row.sourceRowCount,
      normalizedEntryCount: row.normalizedEntryCount,
      createdByUserId: row.createdByUserId,
      committedAt: row.committedAt.toISOString(),
    };
  }

  private isRecognizedConcurrencyRace(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2034') return true;
    if (error.code !== 'P2002') return false;
    const target = JSON.stringify(error.meta?.target ?? '').toLowerCase();
    if (CONCURRENCY_CONSTRAINTS.some((constraint) => target.includes(constraint))) return true;
    return target.includes('request_key')
      || (target.includes('academic_year_id') && target.includes('version_number'))
      || (target.includes('academic_year_id') && target.includes('calendar_version_id')
        && target.includes('effective_academic_week_id') && target.includes('content_checksum'));
  }
}
