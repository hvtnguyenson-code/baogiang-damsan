import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AuditResult,
  PpctCurricularComponent,
  PpctVersionStatus,
  Prisma,
} from '@prisma/client';
import type {
  PpctImportConfirmItem,
  PpctImportConfirmResponse,
  PpctImportDraftOption,
  PpctImportGradePreview,
  PpctImportIdentityDecision,
  PpctImportInspectionResponse,
  PpctImportIssue,
  PpctImportPreviewResponse,
  PpctImportTargetSelection,
} from '@baogiang/contracts/ppct-import';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { requestMeta } from '../auth/auth-http';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_XLSX_BYTES } from '../timetable-import/workbook-limits';
import type {
  ParsedWorkbook,
  ParsedWorkbookCell,
  ParsedWorkbookRow,
  ParsedWorkbookSheet,
} from '../timetable-import/workbook-parser.types';
import { ppctVersionInclude, toPpctVersionRecord } from './mapper';
import { PpctAccessService } from './ppct-access.service';
import { PpctWorkbookParserService } from './ppct-workbook-parser.service';

export interface PpctUploadedWorkbookFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface PedagogicalRow {
  component: PpctCurricularComponent;
  gradeLevel: 10 | 11 | 12;
  sourceRowNumber: number;
  title: string;
  lessonType: string;
  periodCount: number;
  weekStart: number;
  weekEnd: number;
  rowKey: string;
}

interface SemanticItem {
  component: PpctCurricularComponent;
  gradeLevel: 10 | 11 | 12;
  sequence: number;
  title: string;
  lessonType: string;
  rowKey: string;
  sourceRowNumber: number;
  periodIndex: number;
  periodCount: number;
}

interface WorkbookAnalysis {
  inspection: PpctImportInspectionResponse;
  rows: PedagogicalRow[];
  issues: PpctImportIssue[];
  metadata: {
    subjectDisplayName: string | null;
    academicYearCode: string | null;
    templateVersion: string | null;
  };
}

interface SourceRevision {
  ppctItemId: string;
  component: PpctCurricularComponent;
  sequence: number;
  title: string;
  lessonType: string;
}

interface PreparedGrade {
  preview: PpctImportGradePreview;
  semanticItems: SemanticItem[];
}

interface PreparedPreview {
  response: PpctImportPreviewResponse;
  grades: PreparedGrade[];
}

const ALLOWED_SHEETS = [
  'THONG_TIN',
  'PPCT',
  'CHUYEN_DE',
  'HUONG_DAN',
  'DANH_MUC',
  'VI_DU',
] as const;
const REQUIRED_SHEETS = ['THONG_TIN', 'PPCT', 'CHUYEN_DE'] as const;

const CORE_HEADERS = [
  'Khối lớp *',
  'Loại nội dung',
  'Bài / Chủ đề',
  'Tên bài / Nội dung *',
  'Số tiết *',
  'Tuần bắt đầu dự kiến *',
  'Tuần kết thúc dự kiến *',
  'Tiết PPCT bắt đầu (Tự động)',
  'Tiết PPCT kết thúc (Tự động)',
] as const;

const SPECIALIZED_HEADERS = [
  'Khối lớp *',
  'Chuyên đề số *',
  'Tên chuyên đề *',
  'Số tiết *',
  'Tuần bắt đầu dự kiến *',
  'Tuần kết thúc dự kiến *',
  'Tiết chuyên đề bắt đầu (Tự động)',
  'Tiết chuyên đề kết thúc (Tự động)',
] as const;

const LESSON_TYPES = [
  'Bài học',
  'Thực hành',
  'Ôn tập',
  'Kiểm tra',
  'Trả bài',
  'Khác',
] as const;

@Injectable()
export class PpctImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: PpctWorkbookParserService,
    private readonly access: PpctAccessService,
    private readonly audit: AuditService,
  ) {}

  async inspect(
    file: PpctUploadedWorkbookFile | undefined,
    request: AuthenticatedRequest,
  ): Promise<PpctImportInspectionResponse> {
    await this.access.requireAnyManageScope(request);
    this.validateFile(file);
    const parsed = await this.parser.parse(file!.buffer);
    return this.analyze(parsed, file!.originalname).inspection;
  }

  async preview(
    file: PpctUploadedWorkbookFile | undefined,
    targetsJson: string | undefined,
    request: AuthenticatedRequest,
  ): Promise<PpctImportPreviewResponse> {
    return (await this.prepare(file, targetsJson, request)).response;
  }

  async confirm(
    file: PpctUploadedWorkbookFile | undefined,
    targetsJson: string | undefined,
    requestFingerprint: string,
    request: AuthenticatedRequest,
  ): Promise<PpctImportConfirmResponse> {
    const prepared = await this.prepare(file, targetsJson, request);
    if (prepared.response.requestFingerprint !== requestFingerprint) {
      throw new ConflictException({
        error: 'PPCT_IMPORT_FINGERPRINT_MISMATCH',
        message: 'Bản xem trước PPCT đã thay đổi; hãy xem trước lại trước khi xác nhận.',
      });
    }

    const hasCreate = prepared.grades.some(
      (grade) => grade.preview.target.targetMode === 'CREATE_NEW_DRAFT',
    );
    const maxAttempts = hasCreate ? 3 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const results = await this.prisma.$transaction(
          async (tx) => {
            const output: PpctImportConfirmResponse['results'] = [];
            for (const grade of [...prepared.grades].sort(
              (a, b) => a.preview.gradeLevel - b.preview.gradeLevel,
            )) {
              output.push(await this.applyGrade(tx, grade, request));
            }
            return output;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        return {
          requestFingerprint,
          academicYearId: prepared.response.academicYear.id,
          subjectId: prepared.response.subject.id,
          results,
        };
      } catch (error) {
        if (isRetryableImportConflict(error) && attempt < maxAttempts) continue;
        if (
          isSerializationConflict(error)
          || error instanceof Prisma.PrismaClientKnownRequestError
        ) {
          throw new ConflictException({
            error: 'PPCT_IMPORT_DRAFT_CONFLICT',
            message: 'Có thay đổi đồng thời khi tạo/cập nhật bản nháp PPCT; hãy xem trước lại.',
          });
        }
        throw error;
      }
    }

    throw new ConflictException({
      error: 'PPCT_IMPORT_DRAFT_CONFLICT',
      message: 'Không thể hoàn tất nhập PPCT do xung đột đồng thời.',
    });
  }

  private validateFile(file: PpctUploadedWorkbookFile | undefined): void {
    if (!file) {
      throw new BadRequestException({
        error: 'PPCT_IMPORT_FILE_REQUIRED',
        message: 'Tệp PPCT .xlsx là bắt buộc.',
      });
    }
    if (file.size > MAX_XLSX_BYTES) {
      throw new PayloadTooLargeException({
        error: 'PPCT_IMPORT_FILE_TOO_LARGE',
        message: 'Tệp PPCT vượt quá giới hạn 8 MiB.',
      });
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new UnsupportedMediaTypeException({
        error: 'PPCT_IMPORT_INVALID_FILE_TYPE',
        message: 'Chỉ chấp nhận tệp .xlsx.',
      });
    }
  }

  private async prepare(
    file: PpctUploadedWorkbookFile | undefined,
    targetsJson: string | undefined,
    request: AuthenticatedRequest,
  ): Promise<PreparedPreview> {
    await this.access.requireAnyManageScope(request);
    this.validateFile(file);
    const parsed = await this.parser.parse(file!.buffer);
    const analysis = this.analyze(parsed, file!.originalname);
    const blocker = analysis.issues.find((issue) => issue.severity === 'BLOCKER');
    if (blocker) this.throwIssue(blocker);

    const subjectDisplayName = analysis.metadata.subjectDisplayName!;
    const academicYearCode = analysis.metadata.academicYearCode!;
    const templateVersion = analysis.metadata.templateVersion!;

    if (templateVersion !== 'PPCT_V1') {
      throw new BadRequestException({
        error: 'PPCT_IMPORT_TEMPLATE_VERSION_MISMATCH',
        message: 'Phiên bản mẫu PPCT phải là PPCT_V1.',
      });
    }

    if (!/^\d{4}-\d{4}$/u.test(academicYearCode)) {
      throw new BadRequestException({
        error: 'PPCT_IMPORT_INVALID_ACADEMIC_YEAR_FORMAT',
        message: 'Năm học phải có định dạng YYYY-YYYY.',
      });
    }

    const normalizedYearCode = academicYearCode.trim().toUpperCase();
    const academicYear = await this.prisma.academicYear.findUnique({
      where: { code: normalizedYearCode },
      select: { id: true, code: true, name: true },
    });
    if (!academicYear) {
      throw new BadRequestException({
        error: 'PPCT_IMPORT_ACADEMIC_YEAR_NOT_FOUND',
        message: 'Không tìm thấy năm học được khai báo trong workbook.',
      });
    }

    const subjectRows = await this.prisma.subject.findMany({
      select: { id: true, code: true, name: true, status: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    const normalizedSubjectName = normalizeText(subjectDisplayName);
    const activeMatches = subjectRows.filter(
      (row) => row.status === 'ACTIVE' && normalizeText(row.name) === normalizedSubjectName,
    );
    if (activeMatches.length > 1) {
      throw new BadRequestException({
        error: 'PPCT_IMPORT_SUBJECT_AMBIGUOUS',
        message: 'Tên môn học trong workbook khớp nhiều môn học đang hoạt động.',
      });
    }
    if (activeMatches.length === 0) {
      const inactiveMatch = subjectRows.some(
        (row) => row.status === 'INACTIVE' && normalizeText(row.name) === normalizedSubjectName,
      );
      throw new BadRequestException({
        error: inactiveMatch
          ? 'PPCT_IMPORT_SUBJECT_INACTIVE'
          : 'PPCT_IMPORT_SUBJECT_NOT_FOUND',
        message: inactiveMatch
          ? 'Môn học trong workbook hiện không hoạt động.'
          : 'Không tìm thấy môn học theo tên hiển thị trong workbook.',
      });
    }
    const subject = activeMatches[0]!;
    await this.access.requireSubject(request, subject.id);

    const targetSelections = this.parseTargets(targetsJson);
    const semanticByGrade = expandRows(analysis.rows);
    const workbookGrades = [...semanticByGrade.keys()].sort((a, b) => a - b);
    if (workbookGrades.length === 0) {
      throw new BadRequestException({
        error: 'PPCT_IMPORT_PARTIAL_ROW',
        message: 'Workbook không chứa dòng PPCT nghiệp vụ nào để nhập.',
      });
    }

    const extraTarget = targetSelections.find(
      (target) => !workbookGrades.includes(target.gradeLevel),
    );
    if (extraTarget) {
      throw new BadRequestException({
        error: 'PPCT_IMPORT_INVALID_TARGET',
        message: `Khối ${extraTarget.gradeLevel} không có dữ liệu trong workbook.`,
      });
    }

    const workbookRawDigest = sha256(file!.buffer);
    const preparedGrades: PreparedGrade[] = [];

    for (const gradeLevel of workbookGrades) {
      const semanticItems = semanticByGrade.get(gradeLevel)!;
      const target =
        targetSelections.find((candidate) => candidate.gradeLevel === gradeLevel)
        ?? {
          gradeLevel,
          targetMode: 'CREATE_NEW_DRAFT' as const,
          targetDraftId: null,
          expectedUpdatedAt: null,
        };

      const plan = await this.prisma.ppctPlan.findFirst({
        where: {
          academicYearId: academicYear.id,
          subjectId: subject.id,
          gradeLevel,
        },
      });

      const drafts = plan
        ? await this.prisma.ppctVersion.findMany({
            where: { ppctPlanId: plan.id, status: PpctVersionStatus.DRAFT },
            include: ppctVersionInclude,
            orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }],
          })
        : [];

      let targetDraft: (typeof drafts)[number] | null = null;
      if (target.targetMode === 'UPDATE_EXACT_DRAFT') {
        if (!target.targetDraftId || !target.expectedUpdatedAt) {
          throw new BadRequestException({
            error: 'PPCT_IMPORT_INVALID_TARGET',
            message: `Khối ${gradeLevel}: UPDATE_EXACT_DRAFT cần targetDraftId và expectedUpdatedAt.`,
          });
        }
        targetDraft = await this.prisma.ppctVersion.findUnique({
          where: { id: target.targetDraftId },
          include: ppctVersionInclude,
        });
        if (!targetDraft) {
          throw new NotFoundException({
            error: 'PPCT_IMPORT_TARGET_DRAFT_NOT_FOUND',
            message: `Không tìm thấy bản nháp đích của khối ${gradeLevel}.`,
          });
        }
        if (!plan || targetDraft.ppctPlanId !== plan.id) {
          throw new UnprocessableEntityException({
            error: 'PPCT_IMPORT_TARGET_DRAFT_PLAN_MISMATCH',
            message: `Bản nháp đích không thuộc kế hoạch khối ${gradeLevel}.`,
          });
        }
        if (targetDraft.status !== PpctVersionStatus.DRAFT) {
          throw new UnprocessableEntityException({
            error: 'PPCT_IMPORT_TARGET_NOT_DRAFT',
            message: `Phiên bản đích của khối ${gradeLevel} không còn là DRAFT.`,
          });
        }
        if (targetDraft.updatedAt.toISOString() !== target.expectedUpdatedAt) {
          throw new ConflictException({
            error: 'PPCT_IMPORT_DRAFT_CONFLICT',
            message: `Bản nháp khối ${gradeLevel} đã thay đổi; hãy xem trước lại.`,
          });
        }
      } else if (target.targetDraftId || target.expectedUpdatedAt) {
        throw new BadRequestException({
          error: 'PPCT_IMPORT_INVALID_TARGET',
          message: `Khối ${gradeLevel}: CREATE_NEW_DRAFT không được chỉ định draft đích.`,
        });
      }

      const sourceHistorical = plan
        ? await this.prisma.ppctVersion.findFirst({
            where: {
              ppctPlanId: plan.id,
              status: { not: PpctVersionStatus.DRAFT },
              ...(targetDraft
                ? { versionNumber: { lt: targetDraft.versionNumber } }
                : {}),
            },
            include: {
              itemRevisions: {
                orderBy: [
                  { component: 'asc' },
                  { sequence: 'asc' },
                  { ppctItemId: 'asc' },
                ],
              },
            },
            orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }],
          })
        : null;

      const gradeSemanticDigest = sha256Canonical({
        templateVersion: 'PPCT_V1',
        academicYearCode: academicYear.code,
        subjectCode: subject.code,
        gradeLevel,
        items: semanticItems.map(semanticItemShape),
      });

      const items = this.resolveIdentityDecisions({
        semanticItems,
        sourceRevisions: sourceHistorical?.itemRevisions ?? [],
        sourceVersionId: sourceHistorical?.id ?? null,
        actorUserId: request.auth!.user.id,
        academicYearId: academicYear.id,
        subjectId: subject.id,
        gradeLevel,
        gradeSemanticDigest,
        target,
      });

      const draftOptions: PpctImportDraftOption[] = drafts.map((draft) => ({
        id: draft.id,
        versionNumber: draft.versionNumber,
        createdByUserId: draft.createdByUserId,
        updatedAt: draft.updatedAt.toISOString(),
        itemCount: draft._count.itemRevisions,
      }));

      preparedGrades.push({
        semanticItems,
        preview: {
          academicYearId: academicYear.id,
          subjectId: subject.id,
          gradeLevel,
          ppctPlanId: plan?.id ?? null,
          sourceHistoricalVersionId: sourceHistorical?.id ?? null,
          canonicalSemanticDigest: gradeSemanticDigest,
          corePeriodCount: semanticItems.filter(
            (item) => item.component === PpctCurricularComponent.CORE,
          ).length,
          specializedPeriodCount: semanticItems.filter(
            (item) => item.component === PpctCurricularComponent.SPECIALIZED_STUDY,
          ).length,
          target,
          drafts: draftOptions,
          items,
        },
      });
    }

    const canonicalSemanticDigest = sha256Canonical({
      templateVersion: 'PPCT_V1',
      academicYearCode: academicYear.code,
      subjectCode: subject.code,
      grades: preparedGrades
        .map((grade) => ({
          gradeLevel: grade.preview.gradeLevel,
          items: grade.semanticItems.map(semanticItemShape),
        }))
        .sort((a, b) => a.gradeLevel - b.gradeLevel),
    });

    const canonicalConfirmPackage = preparedGrades
      .map((grade) => ({
        academicYearId: grade.preview.academicYearId,
        subjectId: grade.preview.subjectId,
        gradeLevel: grade.preview.gradeLevel,
        canonicalSemanticDigest: grade.preview.canonicalSemanticDigest,
        targetMode: grade.preview.target.targetMode,
        targetDraftId: grade.preview.target.targetDraftId,
        expectedUpdatedAt: grade.preview.target.expectedUpdatedAt,
        items: grade.preview.items,
      }))
      .sort((a, b) => a.gradeLevel - b.gradeLevel);

    const requestFingerprint = sha256Canonical({
      authenticatedUserId: request.auth!.user.id,
      workbookRawDigest,
      academicYearId: academicYear.id,
      subjectId: subject.id,
      canonicalSemanticDigest,
      canonicalConfirmPackage,
    });

    return {
      grades: preparedGrades,
      response: {
        sourceFileName: safeSourceFileName(file!.originalname),
        workbookRawDigest,
        academicYear: {
          id: academicYear.id,
          code: academicYear.code,
          name: academicYear.name,
        },
        subject: {
          id: subject.id,
          code: subject.code,
          name: subject.name,
        },
        canonicalSemanticDigest,
        grades: preparedGrades
          .map((grade) => grade.preview)
          .sort((a, b) => a.gradeLevel - b.gradeLevel),
        issues: analysis.issues.filter((issue) => issue.severity === 'ADVISORY'),
        requestFingerprint,
      },
    };
  }

  private parseTargets(targetsJson: string | undefined): PpctImportTargetSelection[] {
    if (!targetsJson) return [];
    let value: unknown;
    try {
      value = JSON.parse(targetsJson);
    } catch {
      throw new BadRequestException({
        error: 'PPCT_IMPORT_INVALID_TARGET',
        message: 'Cấu hình đích bản nháp không phải JSON hợp lệ.',
      });
    }
    if (!Array.isArray(value) || value.length > 3) {
      throw new BadRequestException({
        error: 'PPCT_IMPORT_INVALID_TARGET',
        message: 'Cấu hình đích bản nháp phải là mảng tối đa 3 khối.',
      });
    }

    const results: PpctImportTargetSelection[] = [];
    const seen = new Set<number>();
    for (const raw of value) {
      if (!raw || typeof raw !== 'object') {
        throw new BadRequestException({
          error: 'PPCT_IMPORT_INVALID_TARGET',
          message: 'Cấu hình đích bản nháp không hợp lệ.',
        });
      }
      const row = raw as Record<string, unknown>;
      const gradeLevel = Number(row.gradeLevel);
      if (![10, 11, 12].includes(gradeLevel) || seen.has(gradeLevel)) {
        throw new BadRequestException({
          error: 'PPCT_IMPORT_INVALID_TARGET',
          message: 'Mỗi khối 10, 11, 12 chỉ được cấu hình một lần.',
        });
      }
      const targetMode = row.targetMode;
      if (
        targetMode !== 'CREATE_NEW_DRAFT'
        && targetMode !== 'UPDATE_EXACT_DRAFT'
      ) {
        throw new BadRequestException({
          error: 'PPCT_IMPORT_INVALID_TARGET',
          message: `Khối ${gradeLevel}: chế độ đích không hợp lệ.`,
        });
      }
      const targetDraftId =
        row.targetDraftId === null || row.targetDraftId === undefined
          ? null
          : String(row.targetDraftId);
      const expectedUpdatedAt =
        row.expectedUpdatedAt === null || row.expectedUpdatedAt === undefined
          ? null
          : String(row.expectedUpdatedAt);
      if (targetDraftId && !isUuid(targetDraftId)) {
        throw new BadRequestException({
          error: 'PPCT_IMPORT_INVALID_TARGET',
          message: `Khối ${gradeLevel}: targetDraftId không hợp lệ.`,
        });
      }
      if (expectedUpdatedAt && Number.isNaN(Date.parse(expectedUpdatedAt))) {
        throw new BadRequestException({
          error: 'PPCT_IMPORT_INVALID_TARGET',
          message: `Khối ${gradeLevel}: expectedUpdatedAt không hợp lệ.`,
        });
      }
      seen.add(gradeLevel);
      results.push({
        gradeLevel: gradeLevel as 10 | 11 | 12,
        targetMode,
        targetDraftId,
        expectedUpdatedAt,
      });
    }
    return results;
  }

  private resolveIdentityDecisions(input: {
    semanticItems: SemanticItem[];
    sourceRevisions: SourceRevision[];
    sourceVersionId: string | null;
    actorUserId: string;
    academicYearId: string;
    subjectId: string;
    gradeLevel: 10 | 11 | 12;
    gradeSemanticDigest: string;
    target: PpctImportTargetSelection;
  }): PpctImportConfirmItem[] {
    const result = new Map<string, PpctImportIdentityDecision>();
    const sourceByComponent = new Map<PpctCurricularComponent, SourceRevision[]>();
    sourceByComponent.set(
      PpctCurricularComponent.CORE,
      input.sourceRevisions.filter((row) => row.component === PpctCurricularComponent.CORE),
    );
    sourceByComponent.set(
      PpctCurricularComponent.SPECIALIZED_STUDY,
      input.sourceRevisions.filter(
        (row) => row.component === PpctCurricularComponent.SPECIALIZED_STUDY,
      ),
    );

    for (const component of [
      PpctCurricularComponent.CORE,
      PpctCurricularComponent.SPECIALIZED_STUDY,
    ]) {
      const newItems = input.semanticItems.filter((item) => item.component === component);
      const newGroups = groupNewItems(newItems);
      const oldGroups = groupSourceRevisions(sourceByComponent.get(component) ?? []);

      if (oldGroups.length === 0) {
        for (const item of newItems) {
          result.set(
            itemKey(item.component, item.sequence),
            this.newDecision(input, item, []),
          );
        }
        continue;
      }

      if (newGroups.length === oldGroups.length) {
        for (let index = 0; index < newGroups.length; index += 1) {
          const next = newGroups[index]!;
          const previous = oldGroups[index]!;
          const exact =
            next.title === previous.title
            && next.lessonType === previous.lessonType;
          const sameAnchor =
            next.lessonType === previous.lessonType
            && identityAnchor(next.title) !== null
            && identityAnchor(next.title) === identityAnchor(previous.title);

          if (exact || sameAnchor) {
            const carryCount = Math.min(next.items.length, previous.items.length);
            for (let period = 0; period < carryCount; period += 1) {
              const item = next.items[period]!;
              result.set(itemKey(item.component, item.sequence), {
                mode: 'CARRY_FORWARD',
                itemId: previous.items[period]!.ppctItemId,
              });
            }
            for (let period = carryCount; period < next.items.length; period += 1) {
              const item = next.items[period]!;
              result.set(
                itemKey(item.component, item.sequence),
                this.newDecision(input, item, []),
              );
            }
            continue;
          }

          if (
            next.items.length === previous.items.length
            && input.sourceVersionId
          ) {
            for (let period = 0; period < next.items.length; period += 1) {
              const item = next.items[period]!;
              result.set(
                itemKey(item.component, item.sequence),
                this.newDecision(input, item, [
                  {
                    versionId: input.sourceVersionId,
                    itemId: previous.items[period]!.ppctItemId,
                  },
                ]),
              );
            }
            continue;
          }

          throw new UnprocessableEntityException({
            error: 'PPCT_IMPORT_LINEAGE_AMBIGUOUS',
            message: `Khối ${input.gradeLevel}: không thể đối soát an toàn phả hệ ${component}.`,
          });
        }
      } else {
        const common = Math.min(newGroups.length, oldGroups.length);
        let prefixIsExact = true;
        for (let index = 0; index < common; index += 1) {
          const next = newGroups[index]!;
          const previous = oldGroups[index]!;
          if (
            next.title !== previous.title
            || next.lessonType !== previous.lessonType
          ) {
            prefixIsExact = false;
            break;
          }
        }
        if (!prefixIsExact) {
          throw new UnprocessableEntityException({
            error: 'PPCT_IMPORT_LINEAGE_AMBIGUOUS',
            message: `Khối ${input.gradeLevel}: cấu trúc ${component} thay đổi không thể căn chỉnh tất định.`,
          });
        }

        for (let index = 0; index < common; index += 1) {
          const next = newGroups[index]!;
          const previous = oldGroups[index]!;
          const carryCount = Math.min(next.items.length, previous.items.length);
          for (let period = 0; period < carryCount; period += 1) {
            const item = next.items[period]!;
            result.set(itemKey(item.component, item.sequence), {
              mode: 'CARRY_FORWARD',
              itemId: previous.items[period]!.ppctItemId,
            });
          }
          for (let period = carryCount; period < next.items.length; period += 1) {
            const item = next.items[period]!;
            result.set(
              itemKey(item.component, item.sequence),
              this.newDecision(input, item, []),
            );
          }
        }

        for (let index = common; index < newGroups.length; index += 1) {
          for (const item of newGroups[index]!.items) {
            result.set(
              itemKey(item.component, item.sequence),
              this.newDecision(input, item, []),
            );
          }
        }
      }
    }

    return input.semanticItems
      .map((item) => ({
        component: item.component,
        sequence: item.sequence,
        title: item.title,
        lessonType: item.lessonType,
        identityDecision: result.get(itemKey(item.component, item.sequence))!,
      }))
      .sort(compareConfirmItems);
  }

  private newDecision(
    input: {
      actorUserId: string;
      academicYearId: string;
      subjectId: string;
      gradeLevel: 10 | 11 | 12;
      gradeSemanticDigest: string;
      target: PpctImportTargetSelection;
    },
    item: SemanticItem,
    predecessors: Array<{ versionId: string; itemId: string }>,
  ): PpctImportIdentityDecision {
    const itemId = deterministicUuid({
      purpose: 'PPCT_IMPORT_ITEM_V1',
      actorUserId: input.actorUserId,
      academicYearId: input.academicYearId,
      subjectId: input.subjectId,
      gradeLevel: input.gradeLevel,
      gradeSemanticDigest: input.gradeSemanticDigest,
      targetMode: input.target.targetMode,
      targetDraftId: input.target.targetDraftId,
      component: item.component,
      sequence: item.sequence,
      predecessors,
    });
    return { mode: 'NEW', itemId, predecessors };
  }

  private async applyGrade(
    tx: Prisma.TransactionClient,
    grade: PreparedGrade,
    request: AuthenticatedRequest,
  ): Promise<PpctImportConfirmResponse['results'][number]> {
    const preview = grade.preview;
    let plan = await tx.ppctPlan.findFirst({
      where: {
        academicYearId: preview.academicYearId,
        subjectId: preview.subjectId,
        gradeLevel: preview.gradeLevel,
      },
    });

    if (!plan) {
      if (preview.target.targetMode !== 'CREATE_NEW_DRAFT') {
        throw new UnprocessableEntityException({
          error: 'PPCT_IMPORT_TARGET_DRAFT_PLAN_MISMATCH',
          message: `Khối ${preview.gradeLevel}: kế hoạch PPCT không còn tồn tại.`,
        });
      }
      plan = await tx.ppctPlan.create({
        data: {
          academicYearId: preview.academicYearId,
          subjectId: preview.subjectId,
          gradeLevel: preview.gradeLevel,
        },
      });
      await this.writeAudit(
        tx,
        request,
        'PPCT_PLAN_CREATED',
        'PpctPlan',
        plan.id,
        {
          academicYearId: preview.academicYearId,
          subjectId: preview.subjectId,
          gradeLevel: preview.gradeLevel,
          source: 'PPCT_IMPORT',
        },
      );
    }

    let versionId: string;
    let versionNumber: number;
    let outcome: 'CREATED' | 'UPDATED' | 'REPLAYED';

    if (preview.target.targetMode === 'CREATE_NEW_DRAFT') {
      const actorDrafts = await tx.ppctVersion.findMany({
        where: {
          ppctPlanId: plan.id,
          status: PpctVersionStatus.DRAFT,
          createdByUserId: request.auth!.user.id,
        },
        include: {
          ...ppctVersionInclude,
          itemRevisions: {
            orderBy: [
              { component: 'asc' },
              { sequence: 'asc' },
              { ppctItemId: 'asc' },
            ],
          },
        },
        orderBy: [{ versionNumber: 'asc' }, { id: 'asc' }],
      });
      const matches = actorDrafts.filter((draft) =>
        semanticContentEquals(draft.itemRevisions, grade.semanticItems),
      );
      if (matches.length > 1) {
        throw new ConflictException({
          error: 'PPCT_IMPORT_REPLAY_AMBIGUOUS',
          message: `Khối ${preview.gradeLevel}: có nhiều bản nháp cùng tác giả trùng nội dung.`,
        });
      }
      if (matches.length === 1) {
        return {
          gradeLevel: preview.gradeLevel,
          outcome: 'REPLAYED',
          version: toPpctVersionRecord(matches[0]!),
        };
      }

      const maximum = await tx.ppctVersion.aggregate({
        where: { ppctPlanId: plan.id },
        _max: { versionNumber: true },
      });
      const created = await tx.ppctVersion.create({
        data: {
          ppctPlanId: plan.id,
          versionNumber: (maximum._max.versionNumber ?? 0) + 1,
          status: PpctVersionStatus.DRAFT,
          createdByUserId: request.auth!.user.id,
        },
        include: ppctVersionInclude,
      });
      versionId = created.id;
      versionNumber = created.versionNumber;
      await this.writeAudit(
        tx,
        request,
        'PPCT_VERSION_DRAFT_CREATED',
        'PpctVersion',
        created.id,
        {
          planId: plan.id,
          versionNumber: created.versionNumber,
          source: 'PPCT_IMPORT',
        },
      );
      outcome = 'CREATED';
    } else {
      const targetDraftId = preview.target.targetDraftId!;
      const current = await tx.ppctVersion.findUnique({
        where: { id: targetDraftId },
        include: ppctVersionInclude,
      });
      if (!current) {
        throw new NotFoundException({
          error: 'PPCT_IMPORT_TARGET_DRAFT_NOT_FOUND',
          message: `Không tìm thấy bản nháp đích của khối ${preview.gradeLevel}.`,
        });
      }
      if (current.ppctPlanId !== plan.id) {
        throw new UnprocessableEntityException({
          error: 'PPCT_IMPORT_TARGET_DRAFT_PLAN_MISMATCH',
          message: `Bản nháp đích không thuộc kế hoạch khối ${preview.gradeLevel}.`,
        });
      }
      if (current.status !== PpctVersionStatus.DRAFT) {
        throw new UnprocessableEntityException({
          error: 'PPCT_IMPORT_TARGET_NOT_DRAFT',
          message: `Phiên bản đích của khối ${preview.gradeLevel} không còn là DRAFT.`,
        });
      }
      const expected = new Date(preview.target.expectedUpdatedAt!);
      if (current.updatedAt.getTime() !== expected.getTime()) {
        throw new ConflictException({
          error: 'PPCT_IMPORT_DRAFT_CONFLICT',
          message: `Bản nháp khối ${preview.gradeLevel} đã thay đổi.`,
        });
      }
      const nextUpdatedAt = advancedInstant(current.updatedAt);
      const claimed = await tx.ppctVersion.updateMany({
        where: {
          id: current.id,
          status: PpctVersionStatus.DRAFT,
          updatedAt: expected,
        },
        data: { updatedAt: nextUpdatedAt },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({
          error: 'PPCT_IMPORT_DRAFT_CONFLICT',
          message: `Bản nháp khối ${preview.gradeLevel} đã thay đổi.`,
        });
      }
      versionId = current.id;
      versionNumber = current.versionNumber;
      outcome = 'UPDATED';
    }

    await this.replaceDraftContentInTransaction(
      tx,
      plan.id,
      versionId,
      versionNumber,
      preview.items,
      request,
    );

    const finalVersion = await tx.ppctVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: ppctVersionInclude,
    });
    return {
      gradeLevel: preview.gradeLevel,
      outcome,
      version: toPpctVersionRecord(finalVersion),
    };
  }

  private async replaceDraftContentInTransaction(
    tx: Prisma.TransactionClient,
    planId: string,
    versionId: string,
    versionNumber: number,
    items: PpctImportConfirmItem[],
    request: AuthenticatedRequest,
  ): Promise<void> {
    const requestedIds = items.map((item) => item.identityDecision.itemId);
    const existingItems = requestedIds.length
      ? await tx.ppctItem.findMany({
          where: { id: { in: requestedIds } },
          include: {
            revisions: {
              include: {
                ppctVersion: {
                  select: { id: true, versionNumber: true, status: true },
                },
              },
            },
          },
        })
      : [];
    const itemMap = new Map(existingItems.map((item) => [item.id, item]));
    const newItems: Array<{
      id: string;
      ppctPlanId: string;
      component: PpctCurricularComponent;
    }> = [];

    for (const requested of items) {
      const decision = requested.identityDecision;
      const item = itemMap.get(decision.itemId);
      if (decision.mode === 'CARRY_FORWARD') {
        if (
          !item
          || item.ppctPlanId !== planId
          || item.component !== requested.component
          || !item.revisions.some(
            (revision) =>
              revision.ppctVersion.id !== versionId
              && revision.ppctVersion.versionNumber < versionNumber
              && revision.ppctVersion.status !== PpctVersionStatus.DRAFT,
          )
        ) {
          throw new UnprocessableEntityException({
            error: 'PPCT_IMPORT_LINEAGE_AMBIGUOUS',
            message: 'Quyết định CARRY_FORWARD không còn hợp lệ.',
          });
        }
      } else if (!item) {
        newItems.push({
          id: decision.itemId,
          ppctPlanId: planId,
          component: requested.component,
        });
      } else {
        const currentOnly = item.revisions.every(
          (revision) => revision.ppctVersion.id === versionId,
        );
        if (
          item.ppctPlanId !== planId
          || item.component !== requested.component
          || !currentOnly
        ) {
          throw new ConflictException({
            error: 'PPCT_IMPORT_DRAFT_CONFLICT',
            message: 'Mã nghĩa vụ PPCT mới đã được sử dụng bởi trạng thái khác.',
          });
        }
      }
    }

    const predecessorRefs = items.flatMap((item) =>
      item.identityDecision.mode === 'NEW'
        ? item.identityDecision.predecessors.map((ref) => ({
            ...ref,
            successorItemId: item.identityDecision.itemId,
            successorComponent: item.component,
          }))
        : [],
    );

    const predecessorRows = predecessorRefs.length
      ? await tx.ppctItemRevision.findMany({
          where: {
            ppctVersionId: {
              in: [...new Set(predecessorRefs.map((ref) => ref.versionId))],
            },
            ppctItemId: {
              in: [...new Set(predecessorRefs.map((ref) => ref.itemId))],
            },
          },
          include: { ppctVersion: true },
        })
      : [];
    const predecessorMap = new Map(
      predecessorRows.map((row) => [
        `${row.ppctVersionId}:${row.ppctItemId}`,
        row,
      ]),
    );
    for (const ref of predecessorRefs) {
      const predecessor = predecessorMap.get(`${ref.versionId}:${ref.itemId}`);
      if (
        !predecessor
        || predecessor.ppctPlanId !== planId
        || predecessor.ppctVersion.status === PpctVersionStatus.DRAFT
        || predecessor.ppctVersion.versionNumber >= versionNumber
        || predecessor.component !== ref.successorComponent
      ) {
        throw new UnprocessableEntityException({
          error: 'PPCT_IMPORT_LINEAGE_AMBIGUOUS',
          message: 'Phả hệ PPCT trong bản xem trước không còn hợp lệ.',
        });
      }
    }

    const previousItemCount = await tx.ppctItemRevision.count({
      where: { ppctVersionId: versionId },
    });
    if (newItems.length) await tx.ppctItem.createMany({ data: newItems });
    await tx.ppctItemLineage.deleteMany({ where: { successorVersionId: versionId } });
    await tx.ppctItemRevision.deleteMany({ where: { ppctVersionId: versionId } });

    if (items.length) {
      await tx.ppctItemRevision.createMany({
        data: items.map((item) => ({
          ppctVersionId: versionId,
          ppctPlanId: planId,
          ppctItemId: item.identityDecision.itemId,
          component: item.component,
          sequence: item.sequence,
          title: item.title,
          lessonType: item.lessonType,
        })),
      });
    }
    if (predecessorRefs.length) {
      await tx.ppctItemLineage.createMany({
        data: predecessorRefs.map((ref) => ({
          ppctPlanId: planId,
          component: ref.successorComponent,
          predecessorVersionId: ref.versionId,
          predecessorItemId: ref.itemId,
          successorVersionId: versionId,
          successorItemId: ref.successorItemId,
        })),
      });
    }

    await this.writeAudit(
      tx,
      request,
      'PPCT_DRAFT_CONTENT_REPLACED',
      'PpctVersion',
      versionId,
      {
        planId,
        versionId,
        previousItemCount,
        itemCount: items.length,
        lineageCount: predecessorRefs.length,
        source: 'PPCT_IMPORT',
      },
    );
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    request: AuthenticatedRequest,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const meta = requestMeta(request);
    await this.audit.write(
      {
        actorUserId: request.auth!.user.id,
        action,
        entityType,
        entityId,
        requestId: meta.requestId,
        result: AuditResult.SUCCESS,
        metadata,
      },
      tx,
    );
  }

  private analyze(parsed: ParsedWorkbook, originalName: string): WorkbookAnalysis {
    const issues: PpctImportIssue[] = [];
    const sheetMap = new Map(parsed.sheets.map((sheet) => [sheet.name, sheet]));
    const allowedSet = new Set<string>(ALLOWED_SHEETS);

    for (const sheet of parsed.sheets) {
      if (!allowedSet.has(sheet.name)) {
        issues.push({
          severity: 'BLOCKER',
          code: 'PPCT_IMPORT_UNEXPECTED_SHEET',
          message: `Sheet '${sheet.name}' không thuộc danh mục 6 sheet chuẩn.`,
          sheetName: sheet.name,
        });
      }
    }
    for (const required of REQUIRED_SHEETS) {
      if (!sheetMap.has(required)) {
        issues.push({
          severity: 'BLOCKER',
          code: 'PPCT_IMPORT_MISSING_REQUIRED_SHEET',
          message: `Thiếu sheet bắt buộc '${required}'.`,
          sheetName: required,
        });
      }
    }

    for (const name of REQUIRED_SHEETS) {
      const sheet = sheetMap.get(name);
      if (sheet && sheet.state !== 'VISIBLE') {
        issues.push({
          severity: 'BLOCKER',
          code: 'PPCT_IMPORT_HIDDEN_AUTHORITATIVE_SHEET',
          message: `Sheet thẩm quyền '${name}' phải ở trạng thái hiển thị.`,
          sheetName: name,
        });
      }
    }

    const info = sheetMap.get('THONG_TIN');
    const core = sheetMap.get('PPCT');
    const specialized = sheetMap.get('CHUYEN_DE');

    let subjectDisplayName: string | null = null;
    let academicYearCode: string | null = null;
    let templateVersion: string | null = null;

    if (info) {
      this.validateInfoSheet(info, issues);
      subjectDisplayName = readRequiredMetadata(info, 4, issues, 'Môn học');
      academicYearCode = readRequiredMetadata(info, 5, issues, 'Năm học');
      templateVersion = readRequiredMetadata(info, 6, issues, 'Phiên bản mẫu');
      if (templateVersion && templateVersion !== 'PPCT_V1') {
        issues.push({
          severity: 'BLOCKER',
          code: 'PPCT_IMPORT_TEMPLATE_VERSION_MISMATCH',
          message: 'THONG_TIN!B6 phải bằng PPCT_V1.',
          sheetName: 'THONG_TIN',
          sourceRowNumber: 6,
        });
      }
    }

    const rows: PedagogicalRow[] = [];
    if (core) {
      this.validateTableEnvelope(core, CORE_HEADERS, 7, issues);
      rows.push(...this.parseCoreRows(core, issues));
    }
    if (specialized) {
      this.validateTableEnvelope(specialized, SPECIALIZED_HEADERS, 6, issues);
      rows.push(...this.parseSpecializedRows(specialized, issues));
    }

    const gradeLevels = [...new Set(rows.map((row) => row.gradeLevel))].sort(
      (a, b) => a - b,
    );

    const inspection: PpctImportInspectionResponse = {
      sourceFileName: safeSourceFileName(originalName),
      metadata: {
        subjectDisplayName,
        academicYearCode,
        templateVersion,
      },
      sheets: parsed.sheets.map((sheet) => ({
        name: sheet.name,
        state: sheet.state,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
        headers: (sheet.rows[0]?.cells ?? []).map((cell) => normalizeText(cell.text ?? '')),
        authoritative: (REQUIRED_SHEETS as readonly string[]).includes(sheet.name),
      })),
      gradeLevels,
      issues,
    };

    return {
      inspection,
      rows,
      issues,
      metadata: { subjectDisplayName, academicYearCode, templateVersion },
    };
  }

  private validateInfoSheet(
    sheet: ParsedWorkbookSheet,
    issues: PpctImportIssue[],
  ): void {
    if (
      sheet.hiddenColumns.some((column) => column === 1 || column === 2)
      || [4, 5, 6].some((rowNumber) => sheet.rows[rowNumber - 1]?.hidden)
    ) {
      issues.push({
        severity: 'BLOCKER',
        code: 'PPCT_IMPORT_HIDDEN_INPUT_INTERSECTION',
        message: 'THONG_TIN có dòng/cột ẩn giao với vùng B4:B6.',
        sheetName: 'THONG_TIN',
      });
    }
    for (const rowNumber of [4, 5, 6]) {
      const cell = sheet.rows[rowNumber - 1]?.cells[1];
      if (cell?.merged) {
        issues.push({
          severity: 'BLOCKER',
          code: 'PPCT_IMPORT_MERGED_AUTHORITATIVE_CELL',
          message: `THONG_TIN!B${rowNumber} không được là ô gộp.`,
          sheetName: 'THONG_TIN',
          sourceRowNumber: rowNumber,
        });
      }
      if (
        cell
        && (
          cell.formula
          || cell.hyperlink
          || !['TEXT', 'BLANK'].includes(cell.kind)
        )
      ) {
        issues.push({
          severity: 'BLOCKER',
          code: 'PPCT_IMPORT_UNSUPPORTED_CELL_TYPE',
          message: `THONG_TIN!B${rowNumber} có kiểu ô không được hỗ trợ.`,
          sheetName: 'THONG_TIN',
          sourceRowNumber: rowNumber,
        });
      }
    }
  }

  private validateTableEnvelope(
    sheet: ParsedWorkbookSheet,
    headers: readonly string[],
    businessColumnCount: number,
    issues: PpctImportIssue[],
  ): void {
    const normalizedHeaders = (sheet.rows[0]?.cells ?? [])
      .slice(0, headers.length)
      .map((cell) => normalizeText(cell.text ?? ''));
    const duplicateHeaders = normalizedHeaders.filter(
      (value, index) => value && normalizedHeaders.indexOf(value) !== index,
    );
    if (duplicateHeaders.length) {
      issues.push({
        severity: 'BLOCKER',
        code: 'PPCT_IMPORT_DUPLICATE_HEADER',
        message: `${sheet.name}: tiêu đề cột bị trùng.`,
        sheetName: sheet.name,
        sourceRowNumber: 1,
      });
    } else if (
      normalizedHeaders.length < headers.length
      || normalizedHeaders.some((value) => !value)
    ) {
      issues.push({
        severity: 'BLOCKER',
        code: 'PPCT_IMPORT_MISSING_HEADER',
        message: `${sheet.name}: thiếu tiêu đề cột bắt buộc.`,
        sheetName: sheet.name,
        sourceRowNumber: 1,
      });
    } else if (
      headers.some((expected, index) => normalizedHeaders[index] !== expected)
    ) {
      issues.push({
        severity: 'BLOCKER',
        code: 'PPCT_IMPORT_INVALID_HEADER',
        message: `${sheet.name}: tiêu đề hoặc thứ tự cột không đúng mẫu PPCT_V1.`,
        sheetName: sheet.name,
        sourceRowNumber: 1,
      });
    }

    const extraHeader = (sheet.rows[0]?.cells ?? [])
      .slice(headers.length)
      .some((cell) => normalizeText(cell.text ?? '') !== '');
    if (extraHeader) {
      issues.push({
        severity: 'BLOCKER',
        code: 'PPCT_IMPORT_INVALID_HEADER',
        message: `${sheet.name}: phát hiện cột tiêu đề ngoài hợp đồng mẫu.`,
        sheetName: sheet.name,
        sourceRowNumber: 1,
      });
    }

    const lastBusinessRowIndex = findLastBusinessRowIndex(sheet, businessColumnCount);
    if (
      sheet.hiddenColumns.some(
        (column) => column >= 1 && column <= headers.length,
      )
      || sheet.rows
        .slice(0, lastBusinessRowIndex + 1)
        .some((row) => row.hidden)
    ) {
      issues.push({
        severity: 'BLOCKER',
        code: 'PPCT_IMPORT_HIDDEN_INPUT_INTERSECTION',
        message: `${sheet.name}: dòng/cột ẩn giao với vùng nhập liệu thẩm quyền.`,
        sheetName: sheet.name,
      });
    }

    for (const row of sheet.rows.slice(0, lastBusinessRowIndex + 1)) {
      if (row.cells.slice(0, headers.length).some((cell) => cell.merged)) {
        issues.push({
          severity: 'BLOCKER',
          code: 'PPCT_IMPORT_MERGED_AUTHORITATIVE_CELL',
          message: `${sheet.name}: phát hiện ô gộp trong vùng nhập liệu thẩm quyền.`,
          sheetName: sheet.name,
          sourceRowNumber: row.number,
        });
        break;
      }
    }
  }

  private parseCoreRows(
    sheet: ParsedWorkbookSheet,
    issues: PpctImportIssue[],
  ): PedagogicalRow[] {
    const rows: PedagogicalRow[] = [];
    const duplicates = new Set<string>();
    const titleSeen = new Map<string, number>();

    for (const row of sheet.rows.slice(1)) {
      const business = row.cells.slice(0, 7);
      if (business.every(isBlankCell)) continue;
      if (!this.validateBusinessCellTypes(row, 7, 9, issues)) continue;
      if (
        [0, 4, 5, 6].some((index) => !isBlankCell(row.cells[index]) && row.cells[index]?.kind !== 'NUMBER')
        || [1, 2, 3].some((index) => !isBlankCell(row.cells[index]) && row.cells[index]?.kind !== 'TEXT')
      ) {
        issues.push(issueAt(
          'PPCT_IMPORT_UNSUPPORTED_CELL_TYPE',
          'Kiểu dữ liệu ô PPCT không đúng hợp đồng cột.',
          'PPCT',
          row.number,
        ));
        continue;
      }

      const requiredIndexes = [0, 3, 4, 5, 6];
      if (requiredIndexes.some((index) => isBlankCell(row.cells[index]))) {
        issues.push(issueAt(
          'PPCT_IMPORT_PARTIAL_ROW',
          'Dòng PPCT bị điền dở dang, thiếu trường bắt buộc.',
          'PPCT',
          row.number,
        ));
        continue;
      }

      const grade = integerCell(row.cells[0]);
      const periodCount = integerCell(row.cells[4]);
      const weekStart = integerCell(row.cells[5]);
      const weekEnd = integerCell(row.cells[6]);
      if (!isGrade(grade)) {
        issues.push(issueAt(
          'PPCT_IMPORT_INVALID_GRADE',
          'Khối lớp phải là 10, 11 hoặc 12.',
          'PPCT',
          row.number,
        ));
        continue;
      }
      if (!periodCount || periodCount < 1 || periodCount > 30) {
        issues.push(issueAt(
          'PPCT_IMPORT_INVALID_PERIOD_COUNT',
          'Số tiết PPCT phải là số nguyên từ 1 đến 30.',
          'PPCT',
          row.number,
          grade,
        ));
        continue;
      }
      if (
        !weekStart
        || !weekEnd
        || weekStart < 1
        || weekEnd > 40
        || weekStart > weekEnd
      ) {
        issues.push(issueAt(
          'PPCT_IMPORT_INVALID_WEEK_RANGE',
          'Khoảng tuần dự kiến phải nằm trong 1..40 và tuần bắt đầu không sau tuần kết thúc.',
          'PPCT',
          row.number,
          grade,
        ));
        continue;
      }

      const rawType = normalizeText(row.cells[1]?.text ?? '');
      const lessonType = canonicalLessonType(rawType || 'Bài học');
      if (!lessonType) {
        issues.push(issueAt(
          'PPCT_IMPORT_INVALID_LESSON_TYPE',
          'Loại nội dung không thuộc danh mục PPCT_V1.',
          'PPCT',
          row.number,
          grade,
        ));
        continue;
      }
      if (rawType.length > 100) {
        issues.push(issueAt(
          'PPCT_IMPORT_FIELD_OVER_LIMIT',
          'Loại nội dung vượt quá 100 ký tự.',
          'PPCT',
          row.number,
          grade,
        ));
        continue;
      }

      const prefix = normalizeText(row.cells[2]?.text ?? '');
      if (prefix.length > 150) {
        issues.push(issueAt(
          'PPCT_IMPORT_FIELD_OVER_LIMIT',
          'Bài / Chủ đề vượt quá 150 ký tự.',
          'PPCT',
          row.number,
          grade,
        ));
        continue;
      }
      const name = normalizeText(row.cells[3]?.text ?? '');
      if (!name) {
        issues.push(issueAt(
          'PPCT_IMPORT_MISSING_TITLE',
          'Tên bài / Nội dung không được để trống.',
          'PPCT',
          row.number,
          grade,
        ));
        continue;
      }
      const title = normalizeText(prefix ? `${prefix}: ${name}` : name);
      if (
        row.cells[3]?.textOverLimit
        || title.length > 500
      ) {
        issues.push(issueAt(
          'PPCT_IMPORT_TITLE_OVER_LIMIT',
          'Tiêu đề chuẩn tắc vượt quá 500 ký tự.',
          'PPCT',
          row.number,
          grade,
        ));
        continue;
      }

      const duplicateKey = canonicalJson([
        grade,
        lessonType,
        prefix,
        name,
        periodCount,
        weekStart,
        weekEnd,
      ]);
      if (duplicates.has(duplicateKey)) {
        issues.push(issueAt(
          'PPCT_IMPORT_DUPLICATE_ROW',
          'Dòng PPCT bị trùng lặp toàn bộ nội dung.',
          'PPCT',
          row.number,
          grade,
        ));
        continue;
      }
      duplicates.add(duplicateKey);

      const titleKey = `${grade}:${title.toLocaleLowerCase('vi')}`;
      if (titleSeen.has(titleKey)) {
        issues.push({
          severity: 'ADVISORY',
          code: 'PPCT_IMPORT_DUPLICATE_TITLE_ADVISORY',
          message: `Khối ${grade}: tiêu đề '${title}' xuất hiện nhiều lần; vui lòng rà soát.`,
          sheetName: 'PPCT',
          sourceRowNumber: row.number,
          gradeLevel: grade,
        });
      } else {
        titleSeen.set(titleKey, row.number);
      }

      rows.push({
        component: PpctCurricularComponent.CORE,
        gradeLevel: grade,
        sourceRowNumber: row.number,
        title,
        lessonType,
        periodCount,
        weekStart,
        weekEnd,
        rowKey: `CORE:${row.number}`,
      });
    }
    return rows;
  }

  private parseSpecializedRows(
    sheet: ParsedWorkbookSheet,
    issues: PpctImportIssue[],
  ): PedagogicalRow[] {
    const rows: PedagogicalRow[] = [];
    const duplicates = new Set<string>();
    const expectedTopic = new Map<10 | 11 | 12, number>();

    for (const row of sheet.rows.slice(1)) {
      const business = row.cells.slice(0, 6);
      if (business.every(isBlankCell)) continue;
      if (!this.validateBusinessCellTypes(row, 6, 8, issues)) continue;
      if (
        [0, 1, 3, 4, 5].some((index) => !isBlankCell(row.cells[index]) && row.cells[index]?.kind !== 'NUMBER')
        || (!isBlankCell(row.cells[2]) && row.cells[2]?.kind !== 'TEXT')
      ) {
        issues.push(issueAt(
          'PPCT_IMPORT_UNSUPPORTED_CELL_TYPE',
          'Kiểu dữ liệu ô chuyên đề không đúng hợp đồng cột.',
          'CHUYEN_DE',
          row.number,
        ));
        continue;
      }
      if (business.some(isBlankCell)) {
        issues.push(issueAt(
          'PPCT_IMPORT_PARTIAL_ROW',
          'Dòng chuyên đề bị điền dở dang.',
          'CHUYEN_DE',
          row.number,
        ));
        continue;
      }

      const grade = integerCell(row.cells[0]);
      const topicNumber = integerCell(row.cells[1]);
      const periodCount = integerCell(row.cells[3]);
      const weekStart = integerCell(row.cells[4]);
      const weekEnd = integerCell(row.cells[5]);
      if (!isGrade(grade)) {
        issues.push(issueAt(
          'PPCT_IMPORT_INVALID_GRADE',
          'Khối lớp phải là 10, 11 hoặc 12.',
          'CHUYEN_DE',
          row.number,
        ));
        continue;
      }
      const expected = expectedTopic.get(grade) ?? 1;
      if (
        !topicNumber
        || topicNumber < 1
        || topicNumber > 20
        || topicNumber !== expected
      ) {
        issues.push(issueAt(
          'PPCT_IMPORT_SEQUENCE_DISORDER',
          `Chuyên đề số của khối ${grade} phải liên tục từ 1; đang chờ số ${expected}.`,
          'CHUYEN_DE',
          row.number,
          grade,
        ));
        continue;
      }
      expectedTopic.set(grade, expected + 1);

      if (!periodCount || periodCount < 1 || periodCount > 40) {
        issues.push(issueAt(
          'PPCT_IMPORT_INVALID_PERIOD_COUNT',
          'Số tiết chuyên đề phải là số nguyên từ 1 đến 40.',
          'CHUYEN_DE',
          row.number,
          grade,
        ));
        continue;
      }
      if (
        !weekStart
        || !weekEnd
        || weekStart < 1
        || weekEnd > 40
        || weekStart > weekEnd
      ) {
        issues.push(issueAt(
          'PPCT_IMPORT_INVALID_WEEK_RANGE',
          'Khoảng tuần dự kiến chuyên đề không hợp lệ.',
          'CHUYEN_DE',
          row.number,
          grade,
        ));
        continue;
      }

      const name = normalizeText(row.cells[2]?.text ?? '');
      if (!name) {
        issues.push(issueAt(
          'PPCT_IMPORT_MISSING_TITLE',
          'Tên chuyên đề không được để trống.',
          'CHUYEN_DE',
          row.number,
          grade,
        ));
        continue;
      }
      const title = normalizeText(`Chuyên đề ${topicNumber}: ${name}`);
      if (row.cells[2]?.textOverLimit || title.length > 500) {
        issues.push(issueAt(
          'PPCT_IMPORT_TITLE_OVER_LIMIT',
          'Tiêu đề chuyên đề chuẩn tắc vượt quá 500 ký tự.',
          'CHUYEN_DE',
          row.number,
          grade,
        ));
        continue;
      }

      const duplicateKey = canonicalJson([
        grade,
        topicNumber,
        name,
        periodCount,
        weekStart,
        weekEnd,
      ]);
      if (duplicates.has(duplicateKey)) {
        issues.push(issueAt(
          'PPCT_IMPORT_DUPLICATE_ROW',
          'Dòng chuyên đề bị trùng lặp toàn bộ nội dung.',
          'CHUYEN_DE',
          row.number,
          grade,
        ));
        continue;
      }
      duplicates.add(duplicateKey);

      rows.push({
        component: PpctCurricularComponent.SPECIALIZED_STUDY,
        gradeLevel: grade,
        sourceRowNumber: row.number,
        title,
        lessonType: 'Chuyên đề',
        periodCount,
        weekStart,
        weekEnd,
        rowKey: `SPECIALIZED_STUDY:${row.number}`,
      });
    }
    return rows;
  }

  private validateBusinessCellTypes(
    row: ParsedWorkbookRow,
    businessColumnCount: number,
    totalColumnCount: number,
    issues: PpctImportIssue[],
  ): boolean {
    const sheetName = businessColumnCount === 7 ? 'PPCT' : 'CHUYEN_DE';
    for (let index = 0; index < businessColumnCount; index += 1) {
      const cell = row.cells[index];
      if (!cell) continue;
      if (cell.formula) {
        issues.push(issueAt(
          'PPCT_IMPORT_PROHIBITED_FORMULA',
          'Công thức không được phép trong cột nhập liệu nghiệp vụ.',
          sheetName,
          row.number,
        ));
        return false;
      }
      if (
        cell.hyperlink
        || ['BOOLEAN', 'DATE', 'ERROR', 'UNSUPPORTED'].includes(cell.kind)
      ) {
        issues.push(issueAt(
          'PPCT_IMPORT_UNSUPPORTED_CELL_TYPE',
          'Ô nhập liệu có kiểu dữ liệu không được hỗ trợ.',
          sheetName,
          row.number,
        ));
        return false;
      }
    }

    for (let index = businessColumnCount; index < totalColumnCount; index += 1) {
      const cell = row.cells[index];
      if (!cell || isBlankCell(cell) || cell.formula || cell.kind === 'NUMBER') continue;
      issues.push({
        severity: 'ADVISORY',
        code: 'PPCT_IMPORT_DERIVED_COLUMN_MISMATCH',
        message: `${sheetName} dòng ${row.number}: cột số tiết phái sinh sẽ được máy chủ tính lại.`,
        sheetName,
        sourceRowNumber: row.number,
      });
    }
    return true;
  }

  private throwIssue(issue: PpctImportIssue): never {
    if (issue.code === 'PPCT_IMPORT_LINEAGE_AMBIGUOUS') {
      throw new UnprocessableEntityException({
        error: issue.code,
        message: issue.message,
      });
    }
    throw new BadRequestException({
      error: issue.code,
      message: issue.message,
    });
  }
}

function readRequiredMetadata(
  sheet: ParsedWorkbookSheet,
  rowNumber: number,
  issues: PpctImportIssue[],
  label: string,
): string | null {
  const cell = sheet.rows[rowNumber - 1]?.cells[1];
  const value = normalizeText(cell?.text ?? '');
  if (!value) {
    issues.push({
      severity: 'BLOCKER',
      code: 'PPCT_IMPORT_METADATA_MISSING',
      message: `THONG_TIN!B${rowNumber} (${label}) là bắt buộc.`,
      sheetName: 'THONG_TIN',
      sourceRowNumber: rowNumber,
    });
    return null;
  }
  if (cell?.textOverLimit) {
    issues.push({
      severity: 'BLOCKER',
      code: 'PPCT_IMPORT_FIELD_OVER_LIMIT',
      message: `THONG_TIN!B${rowNumber} vượt quá giới hạn độ dài.`,
      sheetName: 'THONG_TIN',
      sourceRowNumber: rowNumber,
    });
    return null;
  }
  return value;
}

function findLastBusinessRowIndex(
  sheet: ParsedWorkbookSheet,
  businessColumnCount: number,
): number {
  let last = 0;
  for (let index = 1; index < sheet.rows.length; index += 1) {
    if (!sheet.rows[index]!.cells.slice(0, businessColumnCount).every(isBlankCell)) {
      last = index;
    }
  }
  return last;
}

function expandRows(
  rows: PedagogicalRow[],
): Map<10 | 11 | 12, SemanticItem[]> {
  const result = new Map<10 | 11 | 12, SemanticItem[]>();
  for (const grade of [10, 11, 12] as const) {
    const gradeRows = rows.filter((row) => row.gradeLevel === grade);
    if (!gradeRows.length) continue;
    const items: SemanticItem[] = [];
    for (const component of [
      PpctCurricularComponent.CORE,
      PpctCurricularComponent.SPECIALIZED_STUDY,
    ]) {
      let sequence = 0;
      for (const row of gradeRows.filter((candidate) => candidate.component === component)) {
        for (let periodIndex = 1; periodIndex <= row.periodCount; periodIndex += 1) {
          sequence += 1;
          items.push({
            component,
            gradeLevel: grade,
            sequence,
            title: row.title,
            lessonType: row.lessonType,
            rowKey: row.rowKey,
            sourceRowNumber: row.sourceRowNumber,
            periodIndex,
            periodCount: row.periodCount,
          });
        }
      }
    }
    result.set(grade, items);
  }
  return result;
}

function groupNewItems(items: SemanticItem[]): Array<{
  title: string;
  lessonType: string;
  items: SemanticItem[];
}> {
  const groups: Array<{ title: string; lessonType: string; items: SemanticItem[] }> = [];
  for (const item of items) {
    const current = groups[groups.length - 1];
    if (current && current.items[0]!.rowKey === item.rowKey) {
      current.items.push(item);
    } else {
      groups.push({ title: item.title, lessonType: item.lessonType, items: [item] });
    }
  }
  return groups;
}

function groupSourceRevisions(rows: SourceRevision[]): Array<{
  title: string;
  lessonType: string;
  items: SourceRevision[];
}> {
  const groups: Array<{ title: string; lessonType: string; items: SourceRevision[] }> = [];
  for (const row of rows) {
    const current = groups[groups.length - 1];
    if (
      current
      && current.title === row.title
      && current.lessonType === row.lessonType
      && current.items[current.items.length - 1]!.sequence + 1 === row.sequence
    ) {
      current.items.push(row);
    } else {
      groups.push({ title: row.title, lessonType: row.lessonType, items: [row] });
    }
  }
  return groups;
}

function semanticItemShape(item: SemanticItem) {
  return {
    component: item.component,
    sequence: item.sequence,
    title: item.title,
    lessonType: item.lessonType,
  };
}

function semanticContentEquals(
  rows: Array<{
    component: PpctCurricularComponent;
    sequence: number;
    title: string;
    lessonType: string;
  }>,
  items: SemanticItem[],
): boolean {
  if (rows.length !== items.length) return false;
  const sorted = [...rows].sort((a, b) =>
    compareComponent(a.component, b.component) || a.sequence - b.sequence,
  );
  const desired = [...items].sort((a, b) =>
    compareComponent(a.component, b.component) || a.sequence - b.sequence,
  );
  return sorted.every((row, index) => {
    const item = desired[index]!;
    return (
      row.component === item.component
      && row.sequence === item.sequence
      && row.title === item.title
      && row.lessonType === item.lessonType
    );
  });
}

function compareConfirmItems(
  a: PpctImportConfirmItem,
  b: PpctImportConfirmItem,
): number {
  return compareComponent(a.component, b.component) || a.sequence - b.sequence;
}

function compareComponent(
  a: PpctCurricularComponent,
  b: PpctCurricularComponent,
): number {
  const order = {
    [PpctCurricularComponent.CORE]: 0,
    [PpctCurricularComponent.SPECIALIZED_STUDY]: 1,
  };
  return order[a] - order[b];
}

function itemKey(component: PpctCurricularComponent, sequence: number): string {
  return `${component}:${sequence}`;
}

function identityAnchor(title: string): string | null {
  const separator = title.indexOf(':');
  if (separator <= 0) return null;
  const anchor = normalizeText(title.slice(0, separator)).toLocaleLowerCase('vi');
  return anchor || null;
}

function canonicalLessonType(value: string): string | null {
  const normalized = normalizeText(value).toLocaleLowerCase('vi');
  return LESSON_TYPES.find(
    (candidate) => candidate.toLocaleLowerCase('vi') === normalized,
  ) ?? null;
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFKC').replace(/\s+/gu, ' ');
}

function integerCell(cell: ParsedWorkbookCell | undefined): number | null {
  if (!cell || cell.kind !== 'NUMBER' || cell.text === undefined) return null;
  const value = Number(cell.text);
  return Number.isInteger(value) ? value : null;
}

function isBlankCell(cell: ParsedWorkbookCell | undefined): boolean {
  return !cell || (cell.kind === 'BLANK' && !cell.formula && !cell.hyperlink);
}

function isGrade(value: number | null): value is 10 | 11 | 12 {
  return value === 10 || value === 11 || value === 12;
}

function issueAt(
  code: string,
  message: string,
  sheetName: string,
  sourceRowNumber: number,
  gradeLevel?: 10 | 11 | 12,
): PpctImportIssue {
  return {
    severity: 'BLOCKER',
    code,
    message,
    sheetName,
    sourceRowNumber,
    ...(gradeLevel ? { gradeLevel } : {}),
  };
}

function safeSourceFileName(name: string): string {
  return basename(name.replaceAll('\\', '/'));
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

function deterministicUuid(seed: unknown): string {
  const bytes = Buffer.from(sha256Canonical(seed).slice(0, 32), 'hex');
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function advancedInstant(previous: Date): Date {
  return new Date(Math.max(Date.now(), previous.getTime() + 1));
}

function isSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === 'P2034'
  );
}

function isRetryableImportConflict(error: unknown): boolean {
  if (isSerializationConflict(error)) return true;
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError)
    || error.code !== 'P2002'
  ) {
    return false;
  }
  const target = JSON.stringify(error.meta?.target ?? '').toLowerCase();
  return (
    target.includes('ppct_versions')
    || target.includes('versionnumber')
    || target.includes('ppctplanid')
    || target.includes('ppct_plans')
    || (
      target.includes('academicyearid')
      && target.includes('subjectid')
      && target.includes('gradelevel')
    )
  );
}
