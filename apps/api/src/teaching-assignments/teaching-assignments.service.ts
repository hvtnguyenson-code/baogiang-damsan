import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, Prisma } from '@prisma/client';
import {
  CivilDateString,
  TeachingAssignmentChangeResult,
  TeachingAssignmentListResponse,
  TeachingAssignmentRecord,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangeTeachingAssignmentTeacherDto,
  CreateTeachingAssignmentDto,
  EndTeachingAssignmentDto,
  ListTeachingAssignmentsDto,
} from './dto';
import {
  previousCivilDate,
  requireActiveCalendar,
  requireCalendarEnvelope,
  validateTeachingAssignmentCandidate,
} from './teaching-assignment-policy';
import { retryTeachingAssignmentSerializableMutation } from './teaching-assignment-transaction-retry';

const TEACHING_ASSIGNMENT_CONSTRAINT = 'teaching_assignments_no_overlap';
const assignmentInclude = {
  schoolClass: true,
  subject: true,
  teacher: { include: { profile: true } },
} satisfies Prisma.TeachingAssignmentInclude;
type EnrichedTeachingAssignment = Prisma.TeachingAssignmentGetPayload<{ include: typeof assignmentInclude }>;

function normalizedNote(value: string | undefined): string | null {
  return value?.trim() || null;
}

function toRecord(row: EnrichedTeachingAssignment): TeachingAssignmentRecord {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    schoolClassId: row.schoolClassId,
    subjectId: row.subjectId,
    teacherUserId: row.teacherUserId,
    validFrom: formatCivilDate(row.validFrom),
    validUntil: row.validUntil ? formatCivilDate(row.validUntil) : null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    schoolClass: {
      id: row.schoolClass.id,
      code: row.schoolClass.code,
      name: row.schoolClass.name,
      gradeLevel: row.schoolClass.gradeLevel,
      status: row.schoolClass.status,
    },
    subject: { id: row.subject.id, code: row.subject.code, name: row.subject.name, status: row.subject.status },
    teacher: {
      userId: row.teacher.id,
      username: row.teacher.username,
      displayName: row.teacher.profile?.displayName ?? row.teacher.username,
      staffCode: row.teacher.profile?.staffCode ?? null,
      userStatus: row.teacher.status,
      isTeachingStaff: row.teacher.profile?.isTeachingStaff ?? null,
    },
  };
}

function isTeachingAssignmentConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034' || (error.code === 'P2004'
      && (error.message.includes(TEACHING_ASSIGNMENT_CONSTRAINT)
        || JSON.stringify(error.meta ?? {}).includes(TEACHING_ASSIGNMENT_CONSTRAINT)));
  }
  return error instanceof Prisma.PrismaClientUnknownRequestError && error.message.includes(TEACHING_ASSIGNMENT_CONSTRAINT);
}

@Injectable()
export class TeachingAssignmentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(academicYearId: string, query: ListTeachingAssignmentsDto): Promise<TeachingAssignmentListResponse> {
    await this.requireAcademicYear(academicYearId);
    const where: Prisma.TeachingAssignmentWhereInput = {
      academicYearId,
      ...(query.schoolClassId ? { schoolClassId: query.schoolClassId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.teacherUserId ? { teacherUserId: query.teacherUserId } : {}),
      ...(query.activeOn ? {
        AND: [
          { validFrom: { lte: parseCivilDate(query.activeOn) } },
          { OR: [{ validUntil: null }, { validUntil: { gte: parseCivilDate(query.activeOn) } }] },
        ],
      } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.teachingAssignment.findMany({
        where,
        include: assignmentInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ validFrom: 'desc' }, { schoolClassId: 'asc' }, { subjectId: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.teachingAssignment.count({ where }),
    ]);
    return { items: items.map(toRecord), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<TeachingAssignmentRecord> {
    const row = await this.prisma.teachingAssignment.findUnique({ where: { id }, include: assignmentInclude });
    if (!row) throw new NotFoundException('Không tìm thấy phân công giảng dạy.');
    return toRecord(row);
  }

  async create(
    academicYearId: string,
    dto: CreateTeachingAssignmentDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TeachingAssignmentRecord> {
    try {
      return await retryTeachingAssignmentSerializableMutation(() => this.prisma.$transaction(async (tx) => {
        await this.requireAcademicYear(academicYearId, tx);
        const calendar = await requireActiveCalendar(tx, academicYearId);
        const validFrom = dto.validFrom as CivilDateString;
        const validUntil = (dto.validUntil ?? null) as CivilDateString | null;
        requireCalendarEnvelope(validFrom, validUntil, calendar);
        await validateTeachingAssignmentCandidate(tx, {
          academicYearId,
          schoolClassId: dto.schoolClassId,
          subjectId: dto.subjectId,
          teacherUserId: dto.teacherUserId,
          validFrom,
          effectiveEnd: validUntil ?? formatCivilDate(calendar.endDate),
        });
        const row = await tx.teachingAssignment.create({
          data: {
            academicYearId,
            schoolClassId: dto.schoolClassId,
            subjectId: dto.subjectId,
            teacherUserId: dto.teacherUserId,
            validFrom: parseCivilDate(validFrom),
            validUntil: validUntil ? parseCivilDate(validUntil) : null,
            note: normalizedNote(dto.note),
          },
          include: assignmentInclude,
        });
        await this.writeAudit(tx, actorUserId, meta, 'TEACHING_ASSIGNMENT_CREATED', row.id, {
          academicYearId, schoolClassId: row.schoolClassId, subjectId: row.subjectId, teacherUserId: row.teacherUserId,
          validFrom, validUntil,
        });
        return toRecord(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async end(
    id: string,
    dto: EndTeachingAssignmentDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TeachingAssignmentRecord> {
    try {
      return await retryTeachingAssignmentSerializableMutation(() => this.prisma.$transaction(async (tx) => {
        const old = await tx.teachingAssignment.findUnique({ where: { id }, include: assignmentInclude });
        if (!old) throw new NotFoundException('Không tìm thấy phân công giảng dạy.');
        const calendar = await requireActiveCalendar(tx, old.academicYearId);
        const validFrom = formatCivilDate(old.validFrom);
        const oldValidUntil = old.validUntil ? formatCivilDate(old.validUntil) : null;
        const calendarEnd = formatCivilDate(calendar.endDate);
        const endDate = dto.endDate as CivilDateString;
        if (endDate < validFrom || endDate > calendarEnd) {
          throw new BadRequestException('Ngày kết thúc nằm ngoài khoảng hiệu lực cho phép.');
        }
        if (oldValidUntil !== null && endDate > oldValidUntil) {
          throw new ConflictException('Không thể kéo dài phân công đã có ngày kết thúc.');
        }
        const noOp = oldValidUntil === endDate;
        const row = noOp ? old : await tx.teachingAssignment.update({
          where: { id }, data: { validUntil: parseCivilDate(endDate) }, include: assignmentInclude,
        });
        await this.writeAudit(tx, actorUserId, meta, 'TEACHING_ASSIGNMENT_ENDED', id, {
          previousValidUntil: oldValidUntil, newValidUntil: endDate, noOp,
        });
        return toRecord(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async changeTeacher(
    id: string,
    dto: ChangeTeachingAssignmentTeacherDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<TeachingAssignmentChangeResult> {
    try {
      return await retryTeachingAssignmentSerializableMutation(() => this.prisma.$transaction(async (tx) => {
        const old = await tx.teachingAssignment.findUnique({ where: { id }, include: assignmentInclude });
        if (!old) throw new NotFoundException('Không tìm thấy phân công giảng dạy.');
        if (dto.newTeacherUserId === old.teacherUserId) {
          throw new BadRequestException('Giáo viên thay thế phải khác giáo viên hiện tại.');
        }
        const oldValidFrom = formatCivilDate(old.validFrom);
        const oldValidUntil = old.validUntil ? formatCivilDate(old.validUntil) : null;
        const effectiveFrom = dto.effectiveFrom as CivilDateString;
        if (effectiveFrom <= oldValidFrom) {
          throw new BadRequestException('Ngày hiệu lực thay giáo viên phải sau ngày bắt đầu phân công.');
        }
        if (oldValidUntil !== null && effectiveFrom > oldValidUntil) {
          throw new BadRequestException('Ngày hiệu lực thay giáo viên nằm ngoài khoảng phân công.');
        }
        const calendar = await requireActiveCalendar(tx, old.academicYearId);
        requireCalendarEnvelope(effectiveFrom, effectiveFrom, calendar);
        const replacementEnd = oldValidUntil ?? formatCivilDate(calendar.endDate);
        await validateTeachingAssignmentCandidate(tx, {
          academicYearId: old.academicYearId,
          schoolClassId: old.schoolClassId,
          subjectId: old.subjectId,
          teacherUserId: dto.newTeacherUserId,
          validFrom: effectiveFrom,
          effectiveEnd: replacementEnd,
        });
        const previous = await tx.teachingAssignment.update({
          where: { id }, data: { validUntil: parseCivilDate(previousCivilDate(effectiveFrom)) }, include: assignmentInclude,
        });
        const replacement = await tx.teachingAssignment.create({
          data: {
            academicYearId: old.academicYearId,
            schoolClassId: old.schoolClassId,
            subjectId: old.subjectId,
            teacherUserId: dto.newTeacherUserId,
            validFrom: parseCivilDate(effectiveFrom),
            validUntil: oldValidUntil ? parseCivilDate(oldValidUntil) : null,
            note: normalizedNote(dto.note),
          },
          include: assignmentInclude,
        });
        await this.writeAudit(tx, actorUserId, meta, 'TEACHING_ASSIGNMENT_TEACHER_CHANGED', old.id, {
          previousTeacherUserId: old.teacherUserId,
          newTeacherUserId: dto.newTeacherUserId,
          effectiveFrom,
          previousAssignmentNewValidUntil: formatCivilDate(previous.validUntil!),
          replacementAssignmentId: replacement.id,
          replacementValidUntil: oldValidUntil,
        });
        return { previous: toRecord(previous), replacement: toRecord(replacement) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  private async requireAcademicYear(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    if (!await tx.academicYear.findUnique({ where: { id }, select: { id: true } })) {
      throw new NotFoundException('Không tìm thấy năm học.');
    }
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    meta: RequestMeta,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.write({
      actorUserId,
      action,
      entityType: 'TeachingAssignment',
      entityId,
      requestId: meta.requestId,
      result: AuditResult.SUCCESS,
      metadata,
    }, tx);
  }

  private rethrowConflict(error: unknown): never {
    if (error instanceof HttpException) throw error;
    if (isTeachingAssignmentConflict(error)) {
      throw new ConflictException('Phân công giảng dạy bị trùng hoặc chồng lấn thời gian.');
    }
    throw error;
  }
}

export { toRecord as toTeachingAssignmentRecord };
