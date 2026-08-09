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
type CatalogDelegate = {
  create(args: { data: { code: string; name: string } }): Promise<CatalogRow>;
  findMany(args: { where?: { status: CatalogStatus }; skip: number; take: number; orderBy: { code: 'asc' }[] | { id: 'asc' }[] | Array<{ code: 'asc' } | { id: 'asc' }> }): Promise<CatalogRow[]>;
  count(args: { where?: { status: CatalogStatus } }): Promise<number>;
  findUnique(args: { where: { id: string } }): Promise<CatalogRow | null>;
  update(args: { where: { id: string }; data: { code?: string; name?: string; status?: CatalogStatus } }): Promise<CatalogRow>;
};

export const normalizeCatalogCode = (value: string): string => value.trim().toUpperCase();
export const normalizeCatalogName = (value: string): string => value.trim();
export const toCatalogEntry = (row: CatalogRow): CatalogEntry => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async create(model: CatalogModel, dto: CreateCatalogEntryDto, actorUserId: string, meta: RequestMeta): Promise<CatalogEntry> {
    const data = this.createData(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await this.delegate(tx, model).create({ data });
        await this.writeAudit(model, 'CREATED', row.id, actorUserId, meta, undefined, tx);
        return toCatalogEntry(row);
      });
    } catch (error) { this.rethrowConflict(error, model); }
  }

  async list(model: CatalogModel, query: ListCatalogEntriesDto): Promise<CatalogListResponse> {
    const where = query.status ? { status: query.status } : undefined;
    const [items, total] = await Promise.all([
      this.delegate(this.prisma, model).findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ code: 'asc' }, { id: 'asc' }] }),
      this.delegate(this.prisma, model).count({ where }),
    ]);
    return { items: items.map(toCatalogEntry), page: query.page, pageSize: query.pageSize, total };
  }

  async get(model: CatalogModel, id: string): Promise<CatalogEntry> {
    const row = await this.delegate(this.prisma, model).findUnique({ where: { id } });
    if (!row) throw new NotFoundException(this.notFoundMessage(model));
    return toCatalogEntry(row);
  }

  async update(model: CatalogModel, id: string, dto: UpdateCatalogEntryDto, actorUserId: string, meta: RequestMeta): Promise<CatalogEntry> {
    if (dto.code === undefined && dto.name === undefined) throw new BadRequestException('Yêu cầu cập nhật phải có ít nhất một trường thay đổi.');
    const data = this.updateData(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await this.delegate(tx, model).findUnique({ where: { id } });
        if (!existing) throw new NotFoundException(this.notFoundMessage(model));
        const row = await this.delegate(tx, model).update({ where: { id }, data });
        await this.writeAudit(model, 'UPDATED', id, actorUserId, meta, { changedFields: Object.keys(data) }, tx);
        return toCatalogEntry(row);
      });
    } catch (error) { this.rethrowConflict(error, model); }
  }

  async changeStatus(model: CatalogModel, id: string, status: CatalogStatus, actorUserId: string, meta: RequestMeta): Promise<CatalogEntry> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.delegate(tx, model).findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(this.notFoundMessage(model));
      const row = existing.status === status ? existing : await this.delegate(tx, model).update({ where: { id }, data: { status } });
      await this.writeAudit(model, status === CatalogStatus.ACTIVE ? 'ACTIVATED' : 'DEACTIVATED', id, actorUserId, meta, { previousStatus: existing.status, newStatus: status }, tx);
      return toCatalogEntry(row);
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

  private delegate(db: PrismaService | Prisma.TransactionClient, model: CatalogModel): CatalogDelegate { return db[model] as unknown as CatalogDelegate; }
  private async writeAudit(model: CatalogModel, suffix: string, entityId: string, actorUserId: string, meta: RequestMeta, metadata: Record<string, unknown> | undefined, tx: Prisma.TransactionClient): Promise<void> {
    const subjectGroup = model === 'subjectGroup';
    await this.audit.write({ actorUserId, action: `${subjectGroup ? 'SUBJECT_GROUP' : 'SUBJECT'}_${suffix}`, entityType: subjectGroup ? 'SubjectGroup' : 'Subject', entityId, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata }, tx);
  }
  private notFoundMessage(model: CatalogModel): string { return model === 'subjectGroup' ? 'Không tìm thấy tổ chuyên môn.' : 'Không tìm thấy môn học.'; }
  private rethrowConflict(error: unknown, model: CatalogModel): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(model === 'subjectGroup' ? 'Mã tổ chuyên môn đã tồn tại.' : 'Mã môn học đã tồn tại.');
    throw error;
  }
}
