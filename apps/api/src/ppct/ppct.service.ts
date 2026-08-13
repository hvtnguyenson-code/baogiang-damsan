import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, PpctVersionStatus, Prisma } from '@prisma/client';
import {
  CivilDateString,
  PpctAssociationHistoryResponse,
  PpctAssociationSwitchResult,
  PpctPlanListResponse,
  PpctPlanRecord,
  PpctResolution,
  PpctVersionContent,
  PpctVersionListResponse,
  PpctVersionRecord,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { requestMeta } from '../auth/auth-http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePpctPlanDto,
  CreatePpctVersionDto,
  ListPpctPlansDto,
  ListPpctVersionsDto,
  PpctItemIdentityMode,
  PublishPpctVersionDto,
  ReplacePpctContentDto,
  ResolvePpctDto,
  SwitchPpctAssociationDto,
} from './dto';
import {
  ppctAssociationInclude,
  ppctVersionInclude,
  toPpctAssociationRecord,
  toPpctItemRevisionRecord,
  toPpctLineageEdgeRecord,
  toPpctPlanRecord,
  toPpctVersionRecord,
} from './mapper';
import { PpctAccessService } from './ppct-access.service';

const STALE_DRAFT_MESSAGE = 'Bản nháp PPCT đã thay đổi; hãy tải lại trước khi tiếp tục.';
const STALE_HEAD_MESSAGE = 'Phiên bản PPCT đang công bố đã thay đổi; hãy tải lại trước khi tiếp tục.';
const STALE_ASSOCIATION_MESSAGE = 'Liên kết PPCT mới nhất của lớp đã thay đổi; hãy tải lại trước khi tiếp tục.';

@Injectable()
export class PpctService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: PpctAccessService,
  ) {}

  async listPlans(academicYearId: string, query: ListPpctPlansDto, request: AuthenticatedRequest): Promise<PpctPlanListResponse> {
    await this.requireYearAndSubject(academicYearId, query.subjectId);
    await this.access.requireSubject(request, query.subjectId);
    const where: Prisma.PpctPlanWhereInput = {
      academicYearId,
      subjectId: query.subjectId,
      ...(query.gradeLevel ? { gradeLevel: query.gradeLevel } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ppctPlan.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ gradeLevel: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.ppctPlan.count({ where }),
    ]);
    return { items: rows.map(toPpctPlanRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async createPlan(academicYearId: string, dto: CreatePpctPlanDto, request: AuthenticatedRequest): Promise<PpctPlanRecord> {
    await this.requireYearAndSubject(academicYearId, dto.subjectId);
    await this.access.requireSubject(request, dto.subjectId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.ppctPlan.create({ data: { academicYearId, subjectId: dto.subjectId, gradeLevel: dto.gradeLevel } });
        await this.writeAudit(tx, request, 'PPCT_PLAN_CREATED', 'PpctPlan', row.id, {
          academicYearId,
          subjectId: dto.subjectId,
          gradeLevel: dto.gradeLevel,
        });
        return toPpctPlanRecord(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowConflict(error, 'Kế hoạch PPCT cho năm học, môn và khối này đã tồn tại.');
    }
  }

  async getPlan(id: string, request: AuthenticatedRequest): Promise<PpctPlanRecord> {
    const plan = await this.requirePlan(id);
    await this.access.requireSubject(request, plan.subjectId);
    return toPpctPlanRecord(plan);
  }

  async listVersions(planId: string, query: ListPpctVersionsDto, request: AuthenticatedRequest): Promise<PpctVersionListResponse> {
    const plan = await this.requirePlan(planId);
    await this.access.requireSubject(request, plan.subjectId);
    const where: Prisma.PpctVersionWhereInput = { ppctPlanId: planId, ...(query.status ? { status: query.status } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ppctVersion.findMany({
        where,
        include: ppctVersionInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.ppctVersion.count({ where }),
    ]);
    return { items: rows.map(toPpctVersionRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async createVersion(planId: string, dto: CreatePpctVersionDto, request: AuthenticatedRequest): Promise<PpctVersionRecord> {
    const plan = await this.requirePlan(planId);
    await this.access.requireSubject(request, plan.subjectId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const persistedPlan = await tx.ppctPlan.findUnique({ where: { id: planId } });
        if (!persistedPlan) throw new NotFoundException('Không tìm thấy kế hoạch PPCT.');
        let source: { id: string; ppctPlanId: string; status: PpctVersionStatus; itemRevisions: Array<{ ppctItemId: string; sequence: number; title: string; lessonType: string }> } | null = null;
        if (dto.sourceVersionId) {
          source = await tx.ppctVersion.findUnique({
            where: { id: dto.sourceVersionId },
            select: { id: true, ppctPlanId: true, status: true, itemRevisions: { select: { ppctItemId: true, sequence: true, title: true, lessonType: true } } },
          });
          if (!source) throw new NotFoundException('Không tìm thấy phiên bản PPCT nguồn.');
          if (source.ppctPlanId !== planId || source.status === PpctVersionStatus.DRAFT) {
            throw new ConflictException('Phiên bản nguồn phải là lịch sử đã công bố của cùng kế hoạch PPCT.');
          }
        }
        const maximum = await tx.ppctVersion.aggregate({ where: { ppctPlanId: planId }, _max: { versionNumber: true } });
        const versionNumber = (maximum._max.versionNumber ?? 0) + 1;
        const version = await tx.ppctVersion.create({
          data: { ppctPlanId: planId, versionNumber, status: PpctVersionStatus.DRAFT, createdByUserId: request.auth!.user.id },
        });
        if (source?.itemRevisions.length) {
          await tx.ppctItemRevision.createMany({ data: source.itemRevisions.map((item) => ({
            ppctVersionId: version.id,
            ppctPlanId: planId,
            ppctItemId: item.ppctItemId,
            sequence: item.sequence,
            title: item.title,
            lessonType: item.lessonType,
          })) });
        }
        await this.writeAudit(tx, request, 'PPCT_VERSION_DRAFT_CREATED', 'PpctVersion', version.id, {
          planId,
          versionNumber,
          ...(source ? { sourceVersionId: source.id } : {}),
        });
        return toPpctVersionRecord(await tx.ppctVersion.findUniqueOrThrow({ where: { id: version.id }, include: ppctVersionInclude }));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.rethrowConflict(error, 'Không thể tạo bản nháp PPCT do xung đột phiên bản đồng thời.');
    }
  }

  async getVersion(id: string, request: AuthenticatedRequest): Promise<PpctVersionRecord> {
    const version = await this.requireVersionWithPlan(id);
    await this.access.requireSubject(request, version.ppctPlan.subjectId);
    return toPpctVersionRecord(version);
  }

  async getContent(id: string, request: AuthenticatedRequest): Promise<PpctVersionContent> {
    const version = await this.requireVersionWithPlan(id);
    await this.access.requireSubject(request, version.ppctPlan.subjectId);
    return this.loadContent(this.prisma, id);
  }

  async replaceContent(id: string, dto: ReplacePpctContentDto, request: AuthenticatedRequest): Promise<PpctVersionContent> {
    const persisted = await this.requireVersionWithPlan(id);
    await this.access.requireSubject(request, persisted.ppctPlan.subjectId);
    this.requireUniqueRequestedContent(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const version = await tx.ppctVersion.findUnique({ where: { id }, include: { ppctPlan: true } });
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản PPCT.');
        if (version.status !== PpctVersionStatus.DRAFT) throw new ConflictException('Chỉ bản nháp PPCT mới được phép thay đổi nội dung.');

        const itemIds = dto.items.map((item) => item.itemId);
        const existingItems = await tx.ppctItem.findMany({
          where: { id: { in: itemIds } },
          include: { revisions: { include: { ppctVersion: { select: { id: true, versionNumber: true, status: true } } } } },
        });
        const itemMap = new Map(existingItems.map((item) => [item.id, item]));
        const newItemIds: string[] = [];
        for (const requested of dto.items) {
          const item = itemMap.get(requested.itemId);
          if (requested.identityMode === PpctItemIdentityMode.CARRY_FORWARD) {
            if (!item || item.ppctPlanId !== version.ppctPlanId || !item.revisions.some((revision) =>
              revision.ppctVersion.id !== id
              && revision.ppctVersion.versionNumber < version.versionNumber
              && revision.ppctVersion.status !== PpctVersionStatus.DRAFT)) {
              throw new ConflictException('Mã nghĩa vụ CARRY_FORWARD không có lịch sử hợp lệ trước bản nháp này.');
            }
            if ((requested.predecessors?.length ?? 0) > 0) throw new ConflictException('CARRY_FORWARD không được khai báo predecessor.');
          } else if (!item) {
            newItemIds.push(requested.itemId);
          } else {
            if (item.ppctPlanId !== version.ppctPlanId || item.revisions.some((revision) => revision.ppctVersion.id !== id)) {
              throw new ConflictException('Mã nghĩa vụ lịch sử không được tái sử dụng như một nghĩa vụ NEW.');
            }
          }
        }

        const predecessorRefs = dto.items.flatMap((item) => (item.predecessors ?? []).map((ref) => ({ ...ref, successorItemId: item.itemId })));
        const predecessorVersions = [...new Set(predecessorRefs.map((ref) => ref.versionId))];
        const predecessorItems = [...new Set(predecessorRefs.map((ref) => ref.itemId))];
        const predecessorRows = predecessorRefs.length === 0 ? [] : await tx.ppctItemRevision.findMany({
          where: { ppctVersionId: { in: predecessorVersions }, ppctItemId: { in: predecessorItems } },
          include: { ppctVersion: true },
        });
        const predecessorMap = new Map(predecessorRows.map((row) => [`${row.ppctVersionId}:${row.ppctItemId}`, row]));
        for (const ref of predecessorRefs) {
          const predecessor = predecessorMap.get(`${ref.versionId}:${ref.itemId}`);
          if (!predecessor) throw new NotFoundException('Không tìm thấy revision predecessor PPCT.');
          if (predecessor.ppctPlanId !== version.ppctPlanId
            || predecessor.ppctVersion.status === PpctVersionStatus.DRAFT
            || predecessor.ppctVersion.versionNumber >= version.versionNumber
            || predecessor.ppctItemId === ref.successorItemId) {
            throw new ConflictException('Predecessor PPCT không hợp lệ cho bản nháp này.');
          }
        }

        const nextToken = advancedInstant(version.updatedAt);
        const previousItemCount = await tx.ppctItemRevision.count({ where: { ppctVersionId: id } });
        const claimed = await tx.ppctVersion.updateMany({
          where: { id, status: PpctVersionStatus.DRAFT, updatedAt: new Date(dto.expectedUpdatedAt) },
          data: { updatedAt: nextToken },
        });
        if (claimed.count !== 1) throw new ConflictException(STALE_DRAFT_MESSAGE);
        if (newItemIds.length) await tx.ppctItem.createMany({ data: newItemIds.map((itemId) => ({ id: itemId, ppctPlanId: version.ppctPlanId })) });
        await tx.ppctItemLineage.deleteMany({ where: { successorVersionId: id } });
        await tx.ppctItemRevision.deleteMany({ where: { ppctVersionId: id } });
        if (dto.items.length) await tx.ppctItemRevision.createMany({ data: dto.items.map((item) => ({
          ppctVersionId: id,
          ppctPlanId: version.ppctPlanId,
          ppctItemId: item.itemId,
          sequence: item.sequence,
          title: item.title.trim(),
          lessonType: item.lessonType.trim(),
        })) });
        if (predecessorRefs.length) await tx.ppctItemLineage.createMany({ data: predecessorRefs.map((ref) => ({
          ppctPlanId: version.ppctPlanId,
          predecessorVersionId: ref.versionId,
          predecessorItemId: ref.itemId,
          successorVersionId: id,
          successorItemId: ref.successorItemId,
        })) });
        await this.writeAudit(tx, request, 'PPCT_DRAFT_CONTENT_REPLACED', 'PpctVersion', id, {
          planId: version.ppctPlanId,
          versionId: id,
          previousItemCount,
          itemCount: dto.items.length,
          lineageCount: predecessorRefs.length,
        });
        return this.loadContent(tx, id);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializationConflict(error)) throw new ConflictException(STALE_DRAFT_MESSAGE);
      this.rethrowConflict(error, 'Không thể thay thế nội dung PPCT do xung đột dữ liệu.');
    }
  }

  async publish(id: string, dto: PublishPpctVersionDto, request: AuthenticatedRequest): Promise<PpctVersionRecord> {
    const persisted = await this.requireVersionWithPlan(id);
    await this.access.requireSubject(request, persisted.ppctPlan.subjectId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const draft = await tx.ppctVersion.findUnique({ where: { id }, include: { ppctPlan: true, _count: { select: { itemRevisions: true } } } });
        if (!draft) throw new NotFoundException('Không tìm thấy phiên bản PPCT.');
        if (draft.status !== PpctVersionStatus.DRAFT) throw new ConflictException('Chỉ bản nháp PPCT mới được công bố.');
        if (draft.updatedAt.getTime() !== new Date(dto.expectedUpdatedAt).getTime()) throw new ConflictException(STALE_DRAFT_MESSAGE);
        const head = await tx.ppctVersion.findFirst({
          where: { ppctPlanId: draft.ppctPlanId, status: PpctVersionStatus.PUBLISHED },
          orderBy: [{ versionNumber: 'asc' }, { id: 'asc' }],
        });
        if ((head?.id ?? null) !== dto.expectedPublishedVersionId) throw new ConflictException(STALE_HEAD_MESSAGE);
        if (draft._count.itemRevisions === 0) throw new ConflictException('Không thể công bố bản nháp PPCT rỗng.');
        const now = advancedInstant(draft.updatedAt);
        if (head) {
          const superseded = await tx.ppctVersion.updateMany({
            where: { id: head.id, status: PpctVersionStatus.PUBLISHED },
            data: { status: PpctVersionStatus.SUPERSEDED, supersededByUserId: request.auth!.user.id, supersededAt: now, updatedAt: now },
          });
          if (superseded.count !== 1) throw new ConflictException(STALE_HEAD_MESSAGE);
          await this.writeAudit(tx, request, 'PPCT_VERSION_SUPERSEDED', 'PpctVersion', head.id, {
            planId: draft.ppctPlanId,
            oldVersionId: head.id,
            newVersionId: draft.id,
          });
        }
        const published = await tx.ppctVersion.updateMany({
          where: { id, status: PpctVersionStatus.DRAFT, updatedAt: new Date(dto.expectedUpdatedAt) },
          data: { status: PpctVersionStatus.PUBLISHED, publishedByUserId: request.auth!.user.id, publishedAt: now, updatedAt: now },
        });
        if (published.count !== 1) throw new ConflictException(STALE_DRAFT_MESSAGE);
        await this.writeAudit(tx, request, 'PPCT_VERSION_PUBLISHED', 'PpctVersion', id, {
          planId: draft.ppctPlanId,
          oldVersionId: head?.id ?? null,
          newVersionId: id,
        });
        return toPpctVersionRecord(await tx.ppctVersion.findUniqueOrThrow({ where: { id }, include: ppctVersionInclude }));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializationConflict(error) || isLifecycleUniqueConflict(error)) throw new ConflictException(STALE_HEAD_MESSAGE);
      if (error instanceof HttpException) throw error;
      throw error;
    }
  }

  async associationHistory(academicYearId: string, schoolClassId: string, subjectId: string, request: AuthenticatedRequest): Promise<PpctAssociationHistoryResponse> {
    await this.requireStream(academicYearId, schoolClassId, subjectId);
    await this.access.requireSubject(request, subjectId);
    const rows = await this.prisma.ppctClassAssociation.findMany({
      where: { academicYearId, schoolClassId, subjectId },
      include: ppctAssociationInclude,
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return { items: rows.map(toPpctAssociationRecord) };
  }

  async switchAssociation(academicYearId: string, schoolClassId: string, subjectId: string, dto: SwitchPpctAssociationDto, request: AuthenticatedRequest): Promise<PpctAssociationSwitchResult> {
    await this.requireStream(academicYearId, schoolClassId, subjectId);
    await this.access.requireSubject(request, subjectId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const schoolClass = await tx.schoolClass.findUnique({ where: { id: schoolClassId } });
        if (!schoolClass) throw new NotFoundException('Không tìm thấy lớp học.');
        if (schoolClass.academicYearId !== academicYearId) throw new ConflictException('Lớp học không thuộc năm học trên route.');
        const plan = await tx.ppctPlan.findUnique({
          where: { academicYearId_subjectId_gradeLevel: { academicYearId, subjectId, gradeLevel: schoolClass.gradeLevel } },
        });
        if (!plan) throw new NotFoundException('Không tìm thấy kế hoạch PPCT phù hợp với năm học, môn và khối lớp.');
        const target = await tx.ppctVersion.findUnique({ where: { id: dto.ppctVersionId } });
        if (!target) throw new NotFoundException('Không tìm thấy phiên bản PPCT đích.');
        if (target.ppctPlanId !== plan.id || target.status !== PpctVersionStatus.PUBLISHED) {
          throw new ConflictException('Phiên bản PPCT đích phải là bản đang công bố của đúng kế hoạch lớp.');
        }
        const latest = await tx.ppctClassAssociation.findFirst({
          where: { academicYearId, schoolClassId, subjectId },
          include: ppctAssociationInclude,
          orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        });
        if ((latest?.id ?? null) !== dto.expectedLatestAssociationId) throw new ConflictException(STALE_ASSOCIATION_MESSAGE);
        const effectiveFrom = parseCivilDate(dto.effectiveFrom);
        if (latest && effectiveFrom <= latest.effectiveFrom) throw new ConflictException('Ngày chuyển PPCT phải sau ngày bắt đầu của liên kết mới nhất.');
        let previous = latest;
        if (latest && (latest.effectiveUntil === null || latest.effectiveUntil >= effectiveFrom)) {
          const previousDay = new Date(effectiveFrom);
          previousDay.setUTCDate(previousDay.getUTCDate() - 1);
          previous = await tx.ppctClassAssociation.update({
            where: { id: latest.id },
            data: { effectiveUntil: previousDay },
            include: ppctAssociationInclude,
          });
        }
        const association = await tx.ppctClassAssociation.create({
          data: {
            academicYearId,
            schoolClassId,
            subjectId,
            gradeLevel: schoolClass.gradeLevel,
            ppctPlanId: plan.id,
            ppctVersionId: target.id,
            effectiveFrom,
            effectiveUntil: null,
            createdByUserId: request.auth!.user.id,
          },
          include: ppctAssociationInclude,
        });
        await this.writeAudit(tx, request, 'PPCT_CLASS_ASSOCIATION_SWITCHED', 'PpctClassAssociation', association.id, {
          academicYearId,
          schoolClassId,
          subjectId,
          previousAssociationId: latest?.id ?? null,
          previousVersionId: latest?.ppctVersionId ?? null,
          newAssociationId: association.id,
          newVersionId: target.id,
          effectiveFrom: dto.effectiveFrom,
        });
        return { previousAssociation: previous ? toPpctAssociationRecord(previous) : null, association: toPpctAssociationRecord(association) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializationConflict(error) || isAssociationOverlap(error)) throw new ConflictException(STALE_ASSOCIATION_MESSAGE);
      if (error instanceof HttpException) throw error;
      throw error;
    }
  }

  async resolve(academicYearId: string, schoolClassId: string, subjectId: string, query: ResolvePpctDto, request: AuthenticatedRequest): Promise<PpctResolution> {
    await this.requireStream(academicYearId, schoolClassId, subjectId);
    await this.access.requireSubject(request, subjectId);
    const date = parseCivilDate(query.date);
    const association = await this.prisma.ppctClassAssociation.findFirst({
      where: {
        academicYearId,
        schoolClassId,
        subjectId,
        effectiveFrom: { lte: date },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: date } }],
      },
      include: { ...ppctAssociationInclude, ppctPlan: true },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
    });
    const civilDate = query.date as CivilDateString;
    if (!association) return { resolved: false, academicYearId, schoolClassId, subjectId, date: civilDate };
    const content = await this.loadContent(this.prisma, association.ppctVersionId);
    return {
      resolved: true,
      academicYearId,
      schoolClassId,
      subjectId,
      date: civilDate,
      association: toPpctAssociationRecord(association),
      plan: toPpctPlanRecord(association.ppctPlan),
      version: content.version,
      items: content.items,
      lineage: content.lineage,
    };
  }

  private async requirePlan(id: string) {
    const row = await this.prisma.ppctPlan.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy kế hoạch PPCT.');
    return row;
  }

  private async requireVersionWithPlan(id: string) {
    const row = await this.prisma.ppctVersion.findUnique({ where: { id }, include: { ppctPlan: true, ...ppctVersionInclude } });
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản PPCT.');
    return row;
  }

  private async requireYearAndSubject(academicYearId: string, subjectId: string): Promise<void> {
    const [year, subject] = await Promise.all([
      this.prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true } }),
      this.prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true } }),
    ]);
    if (!year) throw new NotFoundException('Không tìm thấy năm học.');
    if (!subject) throw new NotFoundException('Không tìm thấy môn học.');
  }

  private async requireStream(academicYearId: string, schoolClassId: string, subjectId: string): Promise<void> {
    const [year, schoolClass, subject] = await Promise.all([
      this.prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { id: true } }),
      this.prisma.schoolClass.findUnique({ where: { id: schoolClassId }, select: { academicYearId: true } }),
      this.prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true } }),
    ]);
    if (!year) throw new NotFoundException('Không tìm thấy năm học.');
    if (!schoolClass) throw new NotFoundException('Không tìm thấy lớp học.');
    if (schoolClass.academicYearId !== academicYearId) throw new ConflictException('Lớp học không thuộc năm học trên route.');
    if (!subject) throw new NotFoundException('Không tìm thấy môn học.');
  }

  private requireUniqueRequestedContent(dto: ReplacePpctContentDto): void {
    const sequences = new Set<number>();
    const itemIds = new Set<string>();
    for (const item of dto.items) {
      if (sequences.has(item.sequence)) throw new BadRequestException('sequence PPCT không được trùng trong một phiên bản.');
      if (itemIds.has(item.itemId)) throw new BadRequestException('itemId PPCT không được trùng trong một phiên bản.');
      sequences.add(item.sequence);
      itemIds.add(item.itemId);
      const refs = new Set<string>();
      for (const predecessor of item.predecessors ?? []) {
        const key = `${predecessor.versionId}:${predecessor.itemId}`;
        if (refs.has(key)) throw new BadRequestException('Predecessor PPCT không được khai báo trùng.');
        refs.add(key);
      }
    }
  }

  private async loadContent(db: PrismaService | Prisma.TransactionClient, id: string): Promise<PpctVersionContent> {
    const [version, items, lineage] = await Promise.all([
      db.ppctVersion.findUnique({ where: { id }, include: ppctVersionInclude }),
      db.ppctItemRevision.findMany({ where: { ppctVersionId: id }, orderBy: [{ sequence: 'asc' }, { ppctItemId: 'asc' }] }),
      db.ppctItemLineage.findMany({ where: { successorVersionId: id }, orderBy: [
        { successorItemId: 'asc' }, { predecessorVersionId: 'asc' }, { predecessorItemId: 'asc' }, { id: 'asc' },
      ] }),
    ]);
    if (!version) throw new NotFoundException('Không tìm thấy phiên bản PPCT.');
    return { version: toPpctVersionRecord(version), items: items.map(toPpctItemRevisionRecord), lineage: lineage.map(toPpctLineageEdgeRecord) };
  }

  private async writeAudit(tx: Prisma.TransactionClient, request: AuthenticatedRequest, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
    const meta = requestMeta(request);
    await this.audit.write({
      actorUserId: request.auth!.user.id,
      action,
      entityType,
      entityId,
      requestId: meta.requestId,
      result: AuditResult.SUCCESS,
      metadata,
    }, tx);
  }

  private rethrowConflict(error: unknown, message: string): never {
    if (error instanceof HttpException) throw error;
    if (isSerializationConflict(error) || error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2004'].includes(error.code)) {
      throw new ConflictException(message);
    }
    throw error;
  }
}

function advancedInstant(previous: Date): Date {
  return new Date(Math.max(Date.now(), previous.getTime() + 1));
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

function isLifecycleUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isAssociationOverlap(error: unknown): boolean {
  return (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2004'].includes(error.code))
    || (error instanceof Prisma.PrismaClientUnknownRequestError && /ppct_class_associations.*no_overlap/u.test(error.message));
}
