import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, CatalogStatus, Prisma } from '@prisma/client';
import { CatalogEntry, CatalogListResponse } from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCatalogEntryDto } from './dto/create-catalog-entry.dto';
import { ListCatalogEntriesDto } from './dto/list-catalog-entries.dto';
import { UpdateCatalogEntryDto } from './dto/update-catalog-entry.dto';

type CatalogModel = 'subjectGroup' | 'subject';
type CatalogRow = { id: string; code: string; name: string; status: CatalogStatus; createdAt: Date; updatedAt: Date };
export const normalizeCatalogCode = (value: string): string => value.trim().toUpperCase();
export const normalizeCatalogName = (value: string): string => value.trim();
export const toCatalogEntry = (row: CatalogRow): CatalogEntry => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  async create(model: CatalogModel, dto: CreateCatalogEntryDto, actor: string, meta: RequestMeta): Promise<CatalogEntry> {
    const data = this.createData(dto);
    try { return await this.prisma.$transaction(async (tx) => {
      const row = model === 'subjectGroup' ? await tx.subjectGroup.create({ data }) : await tx.subject.create({ data });
      await this.auditEvent(model, 'CREATED', row.id, actor, meta, undefined, tx); return toCatalogEntry(row);
    }); } catch (error) { this.conflict(error, model); }
  }
  async list(model: CatalogModel, q: ListCatalogEntriesDto): Promise<CatalogListResponse> {
    const where = q.status ? { status: q.status } : undefined;
    const [items, total] = model === 'subjectGroup'
      ? await Promise.all([this.prisma.subjectGroup.findMany({ where, skip: (q.page - 1) * q.pageSize, take: q.pageSize, orderBy: [{ code: 'asc' }, { id: 'asc' }] }), this.prisma.subjectGroup.count({ where })])
      : await Promise.all([this.prisma.subject.findMany({ where, skip: (q.page - 1) * q.pageSize, take: q.pageSize, orderBy: [{ code: 'asc' }, { id: 'asc' }] }), this.prisma.subject.count({ where })]);
    return { items: items.map(toCatalogEntry), page: q.page, pageSize: q.pageSize, total };
  }
  async get(model: CatalogModel, id: string): Promise<CatalogEntry> {
    const row = model === 'subjectGroup' ? await this.prisma.subjectGroup.findUnique({ where: { id } }) : await this.prisma.subject.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(this.notFound(model)); return toCatalogEntry(row);
  }
  async update(model: CatalogModel, id: string, dto: UpdateCatalogEntryDto, actor: string, meta: RequestMeta): Promise<CatalogEntry> {
    if (dto.code === undefined && dto.name === undefined) throw new BadRequestException('Yêu cầu cập nhật phải có ít nhất một trường thay đổi.');
    const data = this.updateData(dto);
    try { return await this.prisma.$transaction(async (tx) => {
      const existing = model === 'subjectGroup' ? await tx.subjectGroup.findUnique({ where: { id } }) : await tx.subject.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(this.notFound(model));
      const row = model === 'subjectGroup' ? await tx.subjectGroup.update({ where: { id }, data }) : await tx.subject.update({ where: { id }, data });
      await this.auditEvent(model, 'UPDATED', id, actor, meta, { changedFields: Object.keys(data) }, tx); return toCatalogEntry(row);
    }); } catch (error) { this.conflict(error, model); }
  }
  async changeStatus(model: CatalogModel, id: string, status: CatalogStatus, actor: string, meta: RequestMeta): Promise<CatalogEntry> {
    return this.prisma.$transaction(async (tx) => {
      const existing = model === 'subjectGroup' ? await tx.subjectGroup.findUnique({ where: { id } }) : await tx.subject.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(this.notFound(model));
      const row = existing.status === status ? existing : model === 'subjectGroup' ? await tx.subjectGroup.update({ where: { id }, data: { status } }) : await tx.subject.update({ where: { id }, data: { status } });
      await this.auditEvent(model, status === 'ACTIVE' ? 'ACTIVATED' : 'DEACTIVATED', id, actor, meta, { previousStatus: existing.status, newStatus: status }, tx); return toCatalogEntry(row);
    });
  }
  private createData(dto: CreateCatalogEntryDto): { code: string; name: string } {
    const code = normalizeCatalogCode(dto.code); const name = normalizeCatalogName(dto.name);
    if (!code) throw new BadRequestException('Mã không được để trống.');
    if (!name) throw new BadRequestException('Tên không được để trống.');
    return { code, name };
  }
  private updateData(dto: UpdateCatalogEntryDto): { code?: string; name?: string } {
    const data: { code?: string; name?: string } = {};
    if (dto.code !== undefined) { data.code = normalizeCatalogCode(dto.code); if (!data.code) throw new BadRequestException('Mã không được để trống.'); }
    if (dto.name !== undefined) { data.name = normalizeCatalogName(dto.name); if (!data.name) throw new BadRequestException('Tên không được để trống.'); }
    return data;
  }
  private async auditEvent(model: CatalogModel, suffix: string, id: string, actor: string, meta: RequestMeta, metadata: Record<string, unknown> | undefined, tx: Prisma.TransactionClient): Promise<void> {
    const group = model === 'subjectGroup'; await this.audit.write({ actorUserId: actor, action: `${group ? 'SUBJECT_GROUP' : 'SUBJECT'}_${suffix}`, entityType: group ? 'SubjectGroup' : 'Subject', entityId: id, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata }, tx);
  }
  private notFound(model: CatalogModel): string { return model === 'subjectGroup' ? 'Không tìm thấy tổ chuyên môn.' : 'Không tìm thấy môn học.'; }
  private conflict(error: unknown, model: CatalogModel): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(model === 'subjectGroup' ? 'Mã tổ chuyên môn đã tồn tại.' : 'Mã môn học đã tồn tại.'); throw error; }
}
