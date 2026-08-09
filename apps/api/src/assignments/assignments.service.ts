import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditResult,
  CatalogStatus,
  Prisma,
  StaffSubject,
  SubjectGroupMembership,
} from '@prisma/client';
import {
  StaffSubjectListResponse,
  StaffSubjectRecord,
  SubjectGroupMembershipListResponse,
  SubjectGroupMembershipRecord,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMembershipDto,
  CreateStaffSubjectDto,
  EndAssignmentDto,
  ListMembershipDto,
  ListStaffSubjectDto,
  UpdateAssignmentDto,
} from './dto';

const MEMBERSHIP_CONSTRAINT = 'subject_group_memberships_no_overlap';
const STAFF_SUBJECT_CONSTRAINT = 'staff_subjects_no_overlap';

function parseWindow(validFrom?: string, validUntil?: string): { validFrom: Date; validUntil: Date | null } {
  const from = validFrom ? new Date(validFrom) : new Date();
  const until = validUntil ? new Date(validUntil) : null;
  if (Number.isNaN(from.getTime()) || (until && Number.isNaN(until.getTime())) || (until && until <= from)) {
    throw new BadRequestException('Khoảng thời gian không hợp lệ.');
  }
  return { validFrom: from, validUntil: until };
}

function isTemporalConflict(error: unknown, constraint: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2002') return true;
  if (error.code !== 'P2004') return false;
  return JSON.stringify(error.meta ?? {}).includes(constraint) || error.message.includes(constraint);
}

export function toMembershipRecord(row: SubjectGroupMembership): SubjectGroupMembershipRecord {
  return {
    id: row.id,
    userId: row.userId,
    subjectGroupId: row.subjectGroupId,
    validFrom: row.validFrom.toISOString(),
    ...(row.validUntil ? { validUntil: row.validUntil.toISOString() } : {}),
    isPrimary: row.isPrimary,
  };
}

export function toStaffSubjectRecord(row: StaffSubject): StaffSubjectRecord {
  return {
    id: row.id,
    userId: row.userId,
    subjectId: row.subjectId,
    validFrom: row.validFrom.toISOString(),
    ...(row.validUntil ? { validUntil: row.validUntil.toISOString() } : {}),
    isPrimary: row.isPrimary,
  };
}

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listMemberships(query: ListMembershipDto): Promise<SubjectGroupMembershipListResponse> {
    const where: Prisma.SubjectGroupMembershipWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.subjectGroupId ? { subjectGroupId: query.subjectGroupId } : {}),
      ...(query.isPrimary !== undefined ? { isPrimary: query.isPrimary } : {}),
      ...(query.activeAt ? {
        AND: [
          { validFrom: { lte: new Date(query.activeAt) } },
          { OR: [{ validUntil: null }, { validUntil: { gt: new Date(query.activeAt) } }] },
        ],
      } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.subjectGroupMembership.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ validFrom: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.subjectGroupMembership.count({ where }),
    ]);
    return { items: items.map(toMembershipRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async listStaffSubjects(query: ListStaffSubjectDto): Promise<StaffSubjectListResponse> {
    const where: Prisma.StaffSubjectWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.isPrimary !== undefined ? { isPrimary: query.isPrimary } : {}),
      ...(query.activeAt ? {
        AND: [
          { validFrom: { lte: new Date(query.activeAt) } },
          { OR: [{ validUntil: null }, { validUntil: { gt: new Date(query.activeAt) } }] },
        ],
      } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.staffSubject.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ validFrom: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.staffSubject.count({ where }),
    ]);
    return { items: items.map(toStaffSubjectRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async getMembership(id: string): Promise<SubjectGroupMembershipRecord> {
    const row = await this.prisma.subjectGroupMembership.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy membership.');
    return toMembershipRecord(row);
  }

  async getStaffSubject(id: string): Promise<StaffSubjectRecord> {
    const row = await this.prisma.staffSubject.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy phân công môn học.');
    return toStaffSubjectRecord(row);
  }

  async createMembership(dto: CreateMembershipDto, actor: string, meta: RequestMeta): Promise<SubjectGroupMembershipRecord> {
    const window = parseWindow(dto.validFrom, dto.validUntil);
    const [user, group] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true } }),
      this.prisma.subjectGroup.findUnique({ where: { id: dto.subjectGroupId }, select: { id: true, status: true } }),
    ]);
    if (!user || !group) throw new NotFoundException('Không tìm thấy người dùng hoặc tổ chuyên môn.');
    if (group.status !== CatalogStatus.ACTIVE) throw new ConflictException('Tổ chuyên môn không còn hoạt động.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.subjectGroupMembership.create({ data: { ...dto, ...window, isPrimary: dto.isPrimary ?? false } });
        await this.audit.write({
          actorUserId: actor,
          action: 'SUBJECT_GROUP_MEMBERSHIP_CREATED',
          entityType: 'SubjectGroupMembership',
          entityId: row.id,
          requestId: meta.requestId,
          result: AuditResult.SUCCESS,
          metadata: { userId: row.userId, subjectGroupId: row.subjectGroupId },
        }, tx);
        return toMembershipRecord(row);
      });
    } catch (error) {
      if (isTemporalConflict(error, MEMBERSHIP_CONSTRAINT)) throw new ConflictException('Membership trùng hoặc chồng lấn thời gian.');
      throw error;
    }
  }

  async createStaffSubject(dto: CreateStaffSubjectDto, actor: string, meta: RequestMeta): Promise<StaffSubjectRecord> {
    const window = parseWindow(dto.validFrom, dto.validUntil);
    const [user, subject] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true } }),
      this.prisma.subject.findUnique({ where: { id: dto.subjectId }, select: { id: true, status: true } }),
    ]);
    if (!user || !subject) throw new NotFoundException('Không tìm thấy người dùng hoặc môn học.');
    if (subject.status !== CatalogStatus.ACTIVE) throw new ConflictException('Môn học không còn hoạt động.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.staffSubject.create({ data: { ...dto, ...window, isPrimary: dto.isPrimary ?? false } });
        await this.audit.write({
          actorUserId: actor,
          action: 'STAFF_SUBJECT_CREATED',
          entityType: 'StaffSubject',
          entityId: row.id,
          requestId: meta.requestId,
          result: AuditResult.SUCCESS,
          metadata: { userId: row.userId, subjectId: row.subjectId },
        }, tx);
        return toStaffSubjectRecord(row);
      });
    } catch (error) {
      if (isTemporalConflict(error, STAFF_SUBJECT_CONSTRAINT)) throw new ConflictException('Phân công môn học trùng hoặc chồng lấn thời gian.');
      throw error;
    }
  }

  async updateMembership(id: string, dto: UpdateAssignmentDto, actor: string, meta: RequestMeta): Promise<SubjectGroupMembershipRecord> {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Phải có trường cần cập nhật.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const old = await tx.subjectGroupMembership.findUnique({ where: { id } });
        if (!old) throw new NotFoundException('Không tìm thấy membership.');
        const changedFields = Object.keys(dto);
        const window = parseWindow(dto.validFrom ?? old.validFrom.toISOString(), dto.validUntil ?? old.validUntil?.toISOString());
        const row = await tx.subjectGroupMembership.update({
          where: { id },
          data: { ...window, ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}) },
        });
        await this.audit.write({ actorUserId: actor, action: 'SUBJECT_GROUP_MEMBERSHIP_UPDATED', entityType: 'SubjectGroupMembership', entityId: id, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata: { changedFields } }, tx);
        return toMembershipRecord(row);
      });
    } catch (error) {
      if (isTemporalConflict(error, MEMBERSHIP_CONSTRAINT)) throw new ConflictException('Membership trùng hoặc chồng lấn thời gian.');
      throw error;
    }
  }

  async updateStaffSubject(id: string, dto: UpdateAssignmentDto, actor: string, meta: RequestMeta): Promise<StaffSubjectRecord> {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Phải có trường cần cập nhật.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const old = await tx.staffSubject.findUnique({ where: { id } });
        if (!old) throw new NotFoundException('Không tìm thấy phân công môn học.');
        const changedFields = Object.keys(dto);
        const window = parseWindow(dto.validFrom ?? old.validFrom.toISOString(), dto.validUntil ?? old.validUntil?.toISOString());
        const row = await tx.staffSubject.update({
          where: { id },
          data: { ...window, ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}) },
        });
        await this.audit.write({ actorUserId: actor, action: 'STAFF_SUBJECT_UPDATED', entityType: 'StaffSubject', entityId: id, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata: { changedFields } }, tx);
        return toStaffSubjectRecord(row);
      });
    } catch (error) {
      if (isTemporalConflict(error, STAFF_SUBJECT_CONSTRAINT)) throw new ConflictException('Phân công môn học trùng hoặc chồng lấn thời gian.');
      throw error;
    }
  }

  async endMembership(id: string, dto: EndAssignmentDto, actor: string, meta: RequestMeta): Promise<SubjectGroupMembershipRecord> {
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.subjectGroupMembership.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Không tìm thấy membership.');
      if (old.validUntil) return toMembershipRecord(old);
      const endAt = dto.endAt ? new Date(dto.endAt) : new Date();
      if (endAt <= old.validFrom) throw new BadRequestException('Thời điểm kết thúc không hợp lệ.');
      const row = await tx.subjectGroupMembership.update({ where: { id }, data: { validUntil: endAt } });
      await this.audit.write({ actorUserId: actor, action: 'SUBJECT_GROUP_MEMBERSHIP_ENDED', entityType: 'SubjectGroupMembership', entityId: id, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata: { previousValidUntil: null, newValidUntil: endAt.toISOString() } }, tx);
      return toMembershipRecord(row);
    });
  }

  async endStaffSubject(id: string, dto: EndAssignmentDto, actor: string, meta: RequestMeta): Promise<StaffSubjectRecord> {
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.staffSubject.findUnique({ where: { id } });
      if (!old) throw new NotFoundException('Không tìm thấy phân công môn học.');
      if (old.validUntil) return toStaffSubjectRecord(old);
      const endAt = dto.endAt ? new Date(dto.endAt) : new Date();
      if (endAt <= old.validFrom) throw new BadRequestException('Thời điểm kết thúc không hợp lệ.');
      const row = await tx.staffSubject.update({ where: { id }, data: { validUntil: endAt } });
      await this.audit.write({ actorUserId: actor, action: 'STAFF_SUBJECT_ENDED', entityType: 'StaffSubject', entityId: id, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata: { previousValidUntil: null, newValidUntil: endAt.toISOString() } }, tx);
      return toStaffSubjectRecord(row);
    });
  }
}
