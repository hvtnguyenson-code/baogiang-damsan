import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditResult,
  CatalogStatus,
  Prisma,
  TimetableImportAliasEntityType,
  TimetableImportSemanticField,
  UserStatus,
} from '@prisma/client';
import {
  TimetableImportAliasListResponse,
  TimetableImportAliasRecord,
  TimetableImportProfileDetail,
  TimetableImportProfileListResponse,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTimetableImportAliasDto,
  CreateTimetableImportProfileDto,
  ListTimetableImportAliasesDto,
  ProfileRevisionContentDto,
  ReviseTimetableImportProfileDto,
} from './dto';
import { profileInclude, semanticFieldOrder, toAliasRecord, toProfileDetail, toProfileRecord } from './mapper';
import { isValidSourceKey, normalizeHumanText, normalizeLookupKey, normalizeSourceKey } from './normalization';

const PROFILE_ENTITY = 'TimetableImportProfile';
const ALIAS_ENTITY = 'TimetableImportEntityAlias';

function domainConflict(code: string, message: string): ConflictException {
  return new ConflictException({ error: code, message });
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

@Injectable()
export class TimetableImportService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listProfiles(): Promise<TimetableImportProfileListResponse> {
    const rows = await this.prisma.timetableImportProfile.findMany({
      include: profileInclude,
      orderBy: [{ sourceKey: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return { items: rows.map(toProfileRecord) };
  }

  async getProfile(profileId: string): Promise<TimetableImportProfileDetail> {
    const row = await this.prisma.timetableImportProfile.findUnique({ where: { id: profileId }, include: profileInclude });
    if (!row) throw new NotFoundException('Không tìm thấy cấu hình nhập thời khóa biểu.');
    return toProfileDetail(row);
  }

  async createProfile(
    dto: CreateTimetableImportProfileDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimetableImportProfileDetail> {
    const sourceKey = normalizeSourceKey(dto.sourceKey);
    if (!isValidSourceKey(sourceKey)) throw new BadRequestException('Mã nguồn cấu hình không hợp lệ.');
    const name = this.requireHumanText(dto.name, 'Tên cấu hình', 150);
    const revisionData = this.normalizeRevisionContent(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.timetableImportProfile.create({
          data: {
            sourceKey,
            name,
            createdByUserId: actorUserId,
            revisions: {
              create: {
                revision: 1,
                isActive: true,
                ...revisionData.content,
                createdByUserId: actorUserId,
                columnMappings: { create: revisionData.mappings },
              },
            },
          },
          include: profileInclude,
        });
        const revision = row.revisions[0];
        await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_IMPORT_PROFILE_CREATED', PROFILE_ENTITY, row.id, {
          profileId: row.id,
          sourceKey,
          revisionId: revision.id,
          revision: 1,
        });
        return toProfileDetail(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isPrismaCode(error, 'P2002')) {
        throw domainConflict('TIMETABLE_IMPORT_PROFILE_DUPLICATE', 'Cấu hình nguồn và tên này đã tồn tại.');
      }
      if (isPrismaCode(error, 'P2034')) {
        throw domainConflict('TIMETABLE_IMPORT_PROFILE_HEAD_CHANGED', 'Cấu hình vừa thay đổi đồng thời; hãy tải lại.');
      }
      throw error;
    }
  }

  async reviseProfile(
    profileId: string,
    dto: ReviseTimetableImportProfileDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimetableImportProfileDetail> {
    const revisionData = this.normalizeRevisionContent(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const profile = await tx.timetableImportProfile.findUnique({
          where: { id: profileId },
          include: { revisions: { orderBy: [{ revision: 'desc' }, { id: 'asc' }] } },
        });
        if (!profile) throw new NotFoundException('Không tìm thấy cấu hình nhập thời khóa biểu.');
        const active = profile.revisions.find((revision) => revision.isActive);
        if (!active) {
          throw domainConflict('TIMETABLE_IMPORT_PROFILE_NO_ACTIVE_REVISION', 'Cấu hình không còn phiên bản đang hoạt động.');
        }
        if (active.id !== dto.expectedActiveRevisionId) {
          throw domainConflict('TIMETABLE_IMPORT_PROFILE_HEAD_CHANGED', 'Phiên bản cấu hình đang hoạt động đã thay đổi.');
        }
        const retiredAt = new Date();
        const claimed = await tx.timetableImportProfileRevision.updateMany({
          where: { id: active.id, profileId, isActive: true },
          data: { isActive: false, retiredByUserId: actorUserId, retiredAt },
        });
        if (claimed.count !== 1) {
          throw domainConflict('TIMETABLE_IMPORT_PROFILE_HEAD_CHANGED', 'Phiên bản cấu hình đang hoạt động đã thay đổi.');
        }
        const nextRevision = profile.revisions[0].revision + 1;
        const replacement = await tx.timetableImportProfileRevision.create({
          data: {
            profileId,
            revision: nextRevision,
            isActive: true,
            ...revisionData.content,
            createdByUserId: actorUserId,
            columnMappings: { create: revisionData.mappings },
          },
        });
        await tx.timetableImportProfile.update({ where: { id: profileId }, data: { updatedAt: new Date() } });
        await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_IMPORT_PROFILE_REVISION_RETIRED', PROFILE_ENTITY, profileId, {
          profileId,
          sourceKey: profile.sourceKey,
          revisionId: active.id,
          revision: active.revision,
        });
        await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_IMPORT_PROFILE_REVISED', PROFILE_ENTITY, profileId, {
          profileId,
          sourceKey: profile.sourceKey,
          revisionId: replacement.id,
          revision: replacement.revision,
          previousRevisionId: active.id,
        });
        return this.requireProfileDetail(tx, profileId);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isPrismaCode(error, 'P2002') || isPrismaCode(error, 'P2034')) {
        throw domainConflict('TIMETABLE_IMPORT_PROFILE_HEAD_CHANGED', 'Phiên bản cấu hình đang hoạt động đã thay đổi.');
      }
      throw error;
    }
  }

  async retireActiveProfile(
    profileId: string,
    expectedActiveRevisionId: string,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimetableImportProfileDetail> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const profile = await tx.timetableImportProfile.findUnique({
          where: { id: profileId },
          include: { revisions: { where: { isActive: true } } },
        });
        if (!profile) throw new NotFoundException('Không tìm thấy cấu hình nhập thời khóa biểu.');
        const active = profile.revisions[0];
        if (!active) {
          throw domainConflict('TIMETABLE_IMPORT_PROFILE_NO_ACTIVE_REVISION', 'Cấu hình không còn phiên bản đang hoạt động.');
        }
        if (active.id !== expectedActiveRevisionId) {
          throw domainConflict('TIMETABLE_IMPORT_PROFILE_HEAD_CHANGED', 'Phiên bản cấu hình đang hoạt động đã thay đổi.');
        }
        const claimed = await tx.timetableImportProfileRevision.updateMany({
          where: { id: active.id, profileId, isActive: true },
          data: { isActive: false, retiredByUserId: actorUserId, retiredAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw domainConflict('TIMETABLE_IMPORT_PROFILE_HEAD_CHANGED', 'Phiên bản cấu hình đang hoạt động đã thay đổi.');
        }
        await tx.timetableImportProfile.update({ where: { id: profileId }, data: { updatedAt: new Date() } });
        await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_IMPORT_PROFILE_REVISION_RETIRED', PROFILE_ENTITY, profileId, {
          profileId,
          sourceKey: profile.sourceKey,
          revisionId: active.id,
          revision: active.revision,
        });
        return this.requireProfileDetail(tx, profileId);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isPrismaCode(error, 'P2034')) {
        throw domainConflict('TIMETABLE_IMPORT_PROFILE_HEAD_CHANGED', 'Phiên bản cấu hình đang hoạt động đã thay đổi.');
      }
      throw error;
    }
  }

  async listAliases(profileId: string, query: ListTimetableImportAliasesDto): Promise<TimetableImportAliasListResponse> {
    await this.requireProfile(profileId);
    if (query.academicYearId && query.entityType && query.entityType !== TimetableImportAliasEntityType.SCHOOL_CLASS) {
      throw new BadRequestException('Bộ lọc năm học chỉ áp dụng cho bí danh lớp học.');
    }
    const rows = await this.prisma.timetableImportEntityAlias.findMany({
      where: {
        profileId,
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.academicYearId ? { entityType: TimetableImportAliasEntityType.SCHOOL_CLASS, academicYearId: query.academicYearId } : {}),
        ...(!query.includeRetired ? { isActive: true } : {}),
      },
      orderBy: [{ entityType: 'asc' }, { sourceValueKey: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    return { items: rows.map(toAliasRecord) };
  }

  async createAlias(
    profileId: string,
    dto: CreateTimetableImportAliasDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TimetableImportAliasRecord> {
    this.validateAliasShape(dto);
    const sourceValue = this.requireHumanText(dto.sourceValue, 'Giá trị bí danh', 200);
    const sourceValueKey = normalizeLookupKey(sourceValue);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireProfile(profileId, tx);
        await this.validateCanonicalTarget(tx, dto);
        const row = await tx.timetableImportEntityAlias.create({
          data: {
            profileId,
            entityType: dto.entityType,
            sourceValue,
            sourceValueKey,
            teacherUserId: dto.teacherUserId,
            academicYearId: dto.academicYearId,
            schoolClassId: dto.schoolClassId,
            subjectId: dto.subjectId,
            isActive: true,
            createdByUserId: actorUserId,
          },
        });
        await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_IMPORT_ALIAS_CREATED', ALIAS_ENTITY, row.id,
          this.aliasAuditMetadata(row));
        return toAliasRecord(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isPrismaCode(error, 'P2002') || isPrismaCode(error, 'P2034')) {
        throw domainConflict('TIMETABLE_IMPORT_ALIAS_DUPLICATE', 'Bí danh đang hoạt động này đã tồn tại.');
      }
      throw error;
    }
  }

  async retireAlias(aliasId: string, actorUserId: string, meta: RequestMeta): Promise<TimetableImportAliasRecord> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const alias = await tx.timetableImportEntityAlias.findUnique({ where: { id: aliasId } });
        if (!alias) throw new NotFoundException('Không tìm thấy bí danh nhập thời khóa biểu.');
        if (!alias.isActive) {
          throw domainConflict('TIMETABLE_IMPORT_ALIAS_ALREADY_RETIRED', 'Bí danh đã được ngừng sử dụng.');
        }
        const claimed = await tx.timetableImportEntityAlias.updateMany({
          where: { id: aliasId, isActive: true },
          data: { isActive: false, retiredByUserId: actorUserId, retiredAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw domainConflict('TIMETABLE_IMPORT_ALIAS_ALREADY_RETIRED', 'Bí danh đã được ngừng sử dụng.');
        }
        const retired = await tx.timetableImportEntityAlias.findUniqueOrThrow({ where: { id: aliasId } });
        await this.writeAudit(tx, actorUserId, meta, 'TIMETABLE_IMPORT_ALIAS_RETIRED', ALIAS_ENTITY, aliasId,
          this.aliasAuditMetadata(retired));
        return toAliasRecord(retired);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isPrismaCode(error, 'P2034')) {
        throw domainConflict('TIMETABLE_IMPORT_ALIAS_ALREADY_RETIRED', 'Bí danh đã thay đổi đồng thời; hãy tải lại.');
      }
      throw error;
    }
  }

  private normalizeRevisionContent(dto: ProfileRevisionContentDto): {
    content: { teacherIdentifierMode: ProfileRevisionContentDto['teacherIdentifierMode']; sheetNameHint: string | null; headerRowHint: number | null };
    mappings: Array<{ semanticField: TimetableImportSemanticField; sourceHeader: string; sourceHeaderKey: string }>;
  } {
    const expected = new Set<TimetableImportSemanticField>(semanticFieldOrder as TimetableImportSemanticField[]);
    const seen = new Set<TimetableImportSemanticField>();
    const sourceKeys = new Set<string>();
    const mappings = dto.columnMappings.map((mapping) => {
      if (!expected.has(mapping.semanticField) || seen.has(mapping.semanticField)) {
        throw new BadRequestException('Mỗi trường ngữ nghĩa bắt buộc phải xuất hiện đúng một lần.');
      }
      seen.add(mapping.semanticField);
      const sourceHeader = this.requireHumanText(mapping.sourceHeader, 'Tiêu đề cột', 150);
      const sourceHeaderKey = normalizeLookupKey(sourceHeader);
      if (sourceKeys.has(sourceHeaderKey)) throw new BadRequestException('Các tiêu đề cột phải khác nhau sau chuẩn hóa.');
      sourceKeys.add(sourceHeaderKey);
      return { semanticField: mapping.semanticField, sourceHeader, sourceHeaderKey };
    });
    if (seen.size !== semanticFieldOrder.length) {
      throw new BadRequestException('Cấu hình phải có đủ đúng sáu trường ngữ nghĩa bắt buộc.');
    }
    let sheetNameHint: string | null = null;
    if (dto.sheetNameHint !== undefined && dto.sheetNameHint !== null) {
      sheetNameHint = this.requireHumanText(dto.sheetNameHint, 'Gợi ý tên trang tính', 150);
    }
    return {
      content: {
        teacherIdentifierMode: dto.teacherIdentifierMode,
        sheetNameHint,
        headerRowHint: dto.headerRowHint ?? null,
      },
      mappings,
    };
  }

  private validateAliasShape(dto: CreateTimetableImportAliasDto): void {
    const raw = dto as unknown as Record<string, unknown>;
    for (const field of ['teacherUserId', 'academicYearId', 'schoolClassId', 'subjectId']) {
      if (raw[field] === null) throw new BadRequestException('Định danh đích tùy chọn phải được bỏ qua thay vì gửi null.');
    }
    const present = (value: string | undefined): boolean => value !== undefined;
    const valid = dto.entityType === TimetableImportAliasEntityType.TEACHER
      ? present(dto.teacherUserId) && !present(dto.academicYearId) && !present(dto.schoolClassId) && !present(dto.subjectId)
      : dto.entityType === TimetableImportAliasEntityType.SCHOOL_CLASS
        ? present(dto.academicYearId) && present(dto.schoolClassId) && !present(dto.teacherUserId) && !present(dto.subjectId)
        : dto.entityType === TimetableImportAliasEntityType.SUBJECT
          ? present(dto.subjectId) && !present(dto.academicYearId) && !present(dto.schoolClassId) && !present(dto.teacherUserId)
          : false;
    if (!valid) throw new BadRequestException('Tổ hợp định danh đích không hợp lệ với loại bí danh.');
  }

  private async validateCanonicalTarget(tx: Prisma.TransactionClient, dto: CreateTimetableImportAliasDto): Promise<void> {
    if (dto.entityType === TimetableImportAliasEntityType.TEACHER) {
      const teacher = await tx.user.findUnique({ where: { id: dto.teacherUserId! }, include: { profile: true } });
      if (!teacher) throw new NotFoundException('Không tìm thấy người dùng giáo viên.');
      if (teacher.status !== UserStatus.ACTIVE || teacher.profile?.isTeachingStaff !== true) {
        throw domainConflict('TIMETABLE_IMPORT_CANONICAL_TARGET_INACTIVE', 'Giáo viên không hoạt động hoặc không phải nhân sự giảng dạy.');
      }
      return;
    }
    if (dto.entityType === TimetableImportAliasEntityType.SUBJECT) {
      const subject = await tx.subject.findUnique({ where: { id: dto.subjectId! } });
      if (!subject) throw new NotFoundException('Không tìm thấy môn học.');
      if (subject.status !== CatalogStatus.ACTIVE) {
        throw domainConflict('TIMETABLE_IMPORT_CANONICAL_TARGET_INACTIVE', 'Môn học không hoạt động.');
      }
      return;
    }
    const academicYear = await tx.academicYear.findUnique({ where: { id: dto.academicYearId! }, select: { id: true } });
    if (!academicYear) throw new NotFoundException('Không tìm thấy năm học.');
    const schoolClass = await tx.schoolClass.findUnique({
      where: { id_academicYearId: { id: dto.schoolClassId!, academicYearId: dto.academicYearId! } },
    });
    if (!schoolClass) throw new NotFoundException('Không tìm thấy lớp học trong đúng năm học đã chọn.');
    if (schoolClass.status !== CatalogStatus.ACTIVE) {
      throw domainConflict('TIMETABLE_IMPORT_CANONICAL_TARGET_INACTIVE', 'Lớp học không hoạt động.');
    }
  }

  private requireHumanText(value: string, label: string, maxLength: number): string {
    const normalized = normalizeHumanText(value);
    if (!normalized) throw new BadRequestException(`${label} không được để trống.`);
    if (normalized.length > maxLength) throw new BadRequestException(`${label} vượt quá ${maxLength} ký tự.`);
    return normalized;
  }

  private async requireProfile(profileId: string, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    if (!await tx.timetableImportProfile.findUnique({ where: { id: profileId }, select: { id: true } })) {
      throw new NotFoundException('Không tìm thấy cấu hình nhập thời khóa biểu.');
    }
  }

  private async requireProfileDetail(tx: Prisma.TransactionClient, profileId: string): Promise<TimetableImportProfileDetail> {
    const row = await tx.timetableImportProfile.findUnique({ where: { id: profileId }, include: profileInclude });
    if (!row) throw new NotFoundException('Không tìm thấy cấu hình nhập thời khóa biểu.');
    return toProfileDetail(row);
  }

  private aliasAuditMetadata(row: Prisma.TimetableImportEntityAliasGetPayload<object>): Record<string, unknown> {
    return {
      aliasId: row.id,
      profileId: row.profileId,
      entityType: row.entityType,
      ...(row.academicYearId ? { academicYearId: row.academicYearId } : {}),
      canonicalTargetId: row.teacherUserId ?? row.schoolClassId ?? row.subjectId,
      sourceValueKey: row.sourceValueKey,
    };
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    meta: RequestMeta,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.write({
      actorUserId,
      action,
      entityType,
      entityId,
      requestId: meta.requestId,
      result: AuditResult.SUCCESS,
      metadata,
    }, tx);
  }
}
