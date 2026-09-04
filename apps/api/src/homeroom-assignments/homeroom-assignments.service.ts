import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AuditResult, Prisma, UserStatus } from '@prisma/client';
import {
  CivilDateString,
  HomeroomAssignmentHistoricalTeacherIdentityListResponse,
  HomeroomAssignmentWorkspaceOptionsResponse,
  HomeroomResolutionResult,
} from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../auth/auth.types';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangeHomeroomTeacherDto,
  CorrectHomeroomAssignmentDto,
  CreateHomeroomAssignmentDto,
  EndHomeroomAssignmentDto,
  HomeroomEligibleTeachersDto,
  HomeroomHistoricalTeacherIdentitiesDto,
  HomeroomPageDto,
  ListHomeroomAssignmentsDto,
} from './dto';
import {
  homeroomBusinessDate,
  previousHomeroomCivilDate,
  requireHomeroomActiveCalendar,
  requireHomeroomEnvelope,
  validateHomeroomCandidate,
} from './homeroom-assignment-policy';

const HOMEROOM_TRANSACTION_MAX_ATTEMPTS = 3;
const HOMEROOM_CONFLICT = 'Dữ liệu phân công chủ nhiệm đã thay đổi hoặc chồng lấn; vui lòng tải lại và thử lại.';
const include = {
  schoolClass: true,
  teacher: { include: { profile: true } },
} satisfies Prisma.HomeroomAssignmentInclude;
type EnrichedHomeroomAssignment = Prisma.HomeroomAssignmentGetPayload<{ include: typeof include }>;

export interface HomeroomResolutionRow {
  id: string;
  academicYearId: string;
  schoolClassId: string;
  status: 'ACTIVE' | 'REVERSED';
  replacesId: string | null;
  reversedByUserId: string | null;
  reversedAt: Date | null;
  reversalReason: string | null;
}

export function homeroomLineageIsCorrupt(row: HomeroomResolutionRow, rows: HomeroomResolutionRow[]): boolean {
  const byId = new Map(rows.map((candidate) => [candidate.id, candidate]));
  const visited = new Set<string>();
  let current: HomeroomResolutionRow | undefined = row;
  for (let depth = 0; current; depth += 1) {
    if (depth > rows.length || visited.has(current.id)) return true;
    visited.add(current.id);
    const reversalPresent = current.reversedByUserId !== null
      || current.reversedAt !== null
      || current.reversalReason !== null;
    const reversalComplete = current.reversedByUserId !== null
      && current.reversedAt !== null
      && Boolean(current.reversalReason?.trim());
    if ((current.status === 'ACTIVE' && reversalPresent) || (current.status === 'REVERSED' && !reversalComplete)) return true;
    if (!current.replacesId) return false;
    const parent = byId.get(current.replacesId);
    if (!parent || parent.academicYearId !== row.academicYearId || parent.schoolClassId !== row.schoolClassId || parent.status !== 'REVERSED') return true;
    current = parent;
  }
  return false;
}

export function classifyHomeroomResolutionRows<T extends HomeroomResolutionRow>(
  activeCoveringRows: T[],
  lineageRows: HomeroomResolutionRow[],
): { outcome: 'MISSING' | 'AMBIGUOUS' | 'CORRUPT' } | { outcome: 'RESOLVED'; assignment: T } {
  if (activeCoveringRows.length === 0) return { outcome: 'MISSING' };
  if (activeCoveringRows.length > 1) return { outcome: 'AMBIGUOUS' };
  const assignment = activeCoveringRows[0];
  if (homeroomLineageIsCorrupt(assignment, lineageRows)) return { outcome: 'CORRUPT' };
  return { outcome: 'RESOLVED', assignment };
}

@Injectable()
export class HomeroomAssignmentsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private record(row: EnrichedHomeroomAssignment) {
    return {
      id: row.id,
      academicYearId: row.academicYearId,
      schoolClassId: row.schoolClassId,
      teacherUserId: row.teacherUserId,
      validFrom: formatCivilDate(row.validFrom),
      validUntil: row.validUntil ? formatCivilDate(row.validUntil) : null,
      status: row.status,
      note: row.note,
      entryReason: row.entryReason,
      replacesId: row.replacesId,
      createdByUserId: row.createdByUserId,
      reversedByUserId: row.reversedByUserId,
      reversedAt: row.reversedAt?.toISOString() ?? null,
      reversalReason: row.reversalReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      schoolClass: {
        id: row.schoolClass.id,
        code: row.schoolClass.code,
        name: row.schoolClass.name,
        gradeLevel: row.schoolClass.gradeLevel,
        status: row.schoolClass.status,
      },
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

  async list(academicYearId: string, query: ListHomeroomAssignmentsDto) {
    await this.requireAcademicYear(academicYearId);
    const where: Prisma.HomeroomAssignmentWhereInput = {
      academicYearId,
      ...(query.schoolClassId ? { schoolClassId: query.schoolClassId } : {}),
      ...(query.teacherUserId ? { teacherUserId: query.teacherUserId } : {}),
      ...(query.activeOn ? {
        AND: [
          { validFrom: { lte: parseCivilDate(query.activeOn) } },
          { OR: [{ validUntil: null }, { validUntil: { gte: parseCivilDate(query.activeOn) } }] },
        ],
      } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.homeroomAssignment.findMany({
        where,
        include,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ validFrom: 'desc' }, { schoolClassId: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.homeroomAssignment.count({ where }),
    ]);
    return { items: items.map((row) => this.record(row)), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string) {
    const row = await this.prisma.homeroomAssignment.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Không tìm thấy phân công chủ nhiệm.');
    return this.record(row);
  }

  async create(academicYearId: string, dto: CreateHomeroomAssignmentDto, actorUserId: string, meta: RequestMeta) {
    return this.mutate(async (tx) => {
      await this.requireAcademicYear(academicYearId, tx);
      const calendar = await requireHomeroomActiveCalendar(tx, academicYearId);
      const validFrom = dto.validFrom as CivilDateString;
      const validUntil = (dto.validUntil ?? null) as CivilDateString | null;
      requireHomeroomEnvelope(validFrom, validUntil, calendar);
      await validateHomeroomCandidate(tx, {
        academicYearId,
        schoolClassId: dto.schoolClassId,
        teacherUserId: dto.teacherUserId,
        validFrom,
        validUntil,
        entryReason: dto.entryReason,
        businessDate: homeroomBusinessDate(),
      });
      const row = await tx.homeroomAssignment.create({
        data: {
          academicYearId,
          schoolClassId: dto.schoolClassId,
          teacherUserId: dto.teacherUserId,
          validFrom: parseCivilDate(validFrom),
          validUntil: validUntil ? parseCivilDate(validUntil) : null,
          note: dto.note?.trim() || null,
          entryReason: dto.entryReason?.trim() || null,
          createdByUserId: actorUserId,
        },
        include,
      });
      await this.writeAudit(tx, actorUserId, meta, 'HOMEROOM_ASSIGNMENT_CREATED', row.id, {
        academicYearId,
        schoolClassId: row.schoolClassId,
        teacherUserId: row.teacherUserId,
        validFrom,
        validUntil,
      });
      return this.record(row);
    });
  }

  async end(id: string, dto: EndHomeroomAssignmentDto, actorUserId: string, meta: RequestMeta) {
    return this.mutate(async (tx) => {
      const old = await tx.homeroomAssignment.findUnique({ where: { id }, include });
      if (!old) throw new NotFoundException('Không tìm thấy phân công chủ nhiệm.');
      if (old.status !== 'ACTIVE') throw new ConflictException('Phân công không còn ACTIVE.');
      const endDate = dto.endDate as CivilDateString;
      const validFrom = formatCivilDate(old.validFrom);
      const previousValidUntil = old.validUntil ? formatCivilDate(old.validUntil) : null;
      const calendar = await requireHomeroomActiveCalendar(tx, old.academicYearId);
      requireHomeroomEnvelope(validFrom, endDate, calendar);
      if (endDate < validFrom) throw new BadRequestException('Ngày kết thúc không hợp lệ.');
      if (previousValidUntil !== null && endDate > previousValidUntil) {
        throw new ConflictException('Không thể kéo dài phân công đã có ngày kết thúc.');
      }
      const noOp = previousValidUntil === endDate;
      let row = old;
      if (!noOp) {
        const updated = await tx.homeroomAssignment.updateMany({
          where: { id, status: 'ACTIVE', updatedAt: old.updatedAt },
          data: { validUntil: parseCivilDate(endDate) },
        });
        if (updated.count !== 1) throw new ConflictException(HOMEROOM_CONFLICT);
        row = await tx.homeroomAssignment.findUniqueOrThrow({ where: { id }, include });
      }
      await this.writeAudit(tx, actorUserId, meta, 'HOMEROOM_ASSIGNMENT_ENDED', id, {
        previousValidUntil,
        newValidUntil: endDate,
        noOp,
      });
      return this.record(row);
    });
  }

  async changeTeacher(id: string, dto: ChangeHomeroomTeacherDto, actorUserId: string, meta: RequestMeta) {
    return this.mutate(async (tx) => {
      const old = await tx.homeroomAssignment.findUnique({ where: { id }, include });
      if (!old) throw new NotFoundException('Không tìm thấy phân công chủ nhiệm.');
      if (old.status !== 'ACTIVE') throw new ConflictException('Phân công không còn ACTIVE.');
      if (old.teacherUserId === dto.newTeacherUserId) throw new BadRequestException('Giáo viên mới phải khác giáo viên hiện tại.');
      const effectiveFrom = dto.effectiveFrom as CivilDateString;
      const oldValidFrom = formatCivilDate(old.validFrom);
      const oldValidUntil = old.validUntil ? formatCivilDate(old.validUntil) : null;
      if (effectiveFrom <= oldValidFrom || (oldValidUntil !== null && effectiveFrom > oldValidUntil)) {
        throw new BadRequestException('Ngày thay đổi nằm ngoài khoảng phân công.');
      }
      const calendar = await requireHomeroomActiveCalendar(tx, old.academicYearId);
      requireHomeroomEnvelope(effectiveFrom, oldValidUntil, calendar);
      await validateHomeroomCandidate(tx, {
        academicYearId: old.academicYearId,
        schoolClassId: old.schoolClassId,
        teacherUserId: dto.newTeacherUserId,
        validFrom: effectiveFrom,
        validUntil: oldValidUntil,
        entryReason: dto.entryReason,
        businessDate: homeroomBusinessDate(),
        excludedAssignmentIds: [id],
      });
      const previousValidUntil = previousHomeroomCivilDate(effectiveFrom);
      const updated = await tx.homeroomAssignment.updateMany({
        where: { id, status: 'ACTIVE', updatedAt: old.updatedAt },
        data: { validUntil: parseCivilDate(previousValidUntil) },
      });
      if (updated.count !== 1) throw new ConflictException(HOMEROOM_CONFLICT);
      const previous = await tx.homeroomAssignment.findUniqueOrThrow({ where: { id }, include });
      const replacement = await tx.homeroomAssignment.create({
        data: {
          academicYearId: old.academicYearId,
          schoolClassId: old.schoolClassId,
          teacherUserId: dto.newTeacherUserId,
          validFrom: parseCivilDate(effectiveFrom),
          validUntil: old.validUntil,
          note: dto.note?.trim() || null,
          entryReason: dto.entryReason?.trim() || null,
          replacesId: null,
          createdByUserId: actorUserId,
        },
        include,
      });
      await this.writeAudit(tx, actorUserId, meta, 'HOMEROOM_ASSIGNMENT_TEACHER_CHANGED', id, {
        previousTeacherUserId: old.teacherUserId,
        newTeacherUserId: dto.newTeacherUserId,
        effectiveFrom,
        previousAssignmentNewValidUntil: previousValidUntil,
        replacementAssignmentId: replacement.id,
        replacementValidUntil: oldValidUntil,
      });
      return { previous: this.record(previous), replacement: this.record(replacement) };
    });
  }

  async correct(id: string, dto: CorrectHomeroomAssignmentDto, actorUserId: string, meta: RequestMeta) {
    if (!dto.reason.trim()) throw new BadRequestException('Lý do hiệu chỉnh không được để trống.');
    return this.mutate(async (tx) => {
      const source = await tx.homeroomAssignment.findUnique({ where: { id }, include: { ...include, replacements: true } });
      if (!source) throw new NotFoundException('Không tìm thấy phân công chủ nhiệm.');
      if (source.status !== 'ACTIVE' || source.replacements.length > 0) {
        throw new ConflictException('Cấu trúc lineage không cho phép hiệu chỉnh.');
      }
      const lineage = await tx.homeroomAssignment.findMany({
        where: { academicYearId: source.academicYearId, schoolClassId: source.schoolClassId },
        select: {
          id: true, academicYearId: true, schoolClassId: true, status: true, replacesId: true,
          reversedByUserId: true, reversedAt: true, reversalReason: true,
        },
      });
      if (homeroomLineageIsCorrupt(source, lineage)) throw new ConflictException('Cấu trúc lineage không hợp lệ.');
      const sourceFrom = formatCivilDate(source.validFrom);
      const sourceUntil = source.validUntil ? formatCivilDate(source.validUntil) : null;
      const sorted = [...dto.replacements].sort((left, right) => left.validFrom.localeCompare(right.validFrom));
      for (let index = 0; index < sorted.length; index += 1) {
        const replacement = sorted[index];
        const validUntil = (replacement.validUntil ?? null) as CivilDateString | null;
        if (replacement.validFrom < sourceFrom
          || (sourceUntil !== null && (validUntil === null || validUntil > sourceUntil))
          || (validUntil !== null && validUntil < replacement.validFrom)) {
          throw new BadRequestException('Khoảng hiệu chỉnh vượt ngoài assertion nguồn.');
        }
        const previous = sorted[index - 1];
        const previousUntil = previous?.validUntil ?? null;
        if (previous && (previousUntil === null || replacement.validFrom <= previousUntil)) {
          throw new BadRequestException('Các khoảng hiệu chỉnh bị chồng lấn.');
        }
      }
      const calendar = await requireHomeroomActiveCalendar(tx, source.academicYearId);
      for (const replacement of sorted) {
        const validUntil = (replacement.validUntil ?? null) as CivilDateString | null;
        requireHomeroomEnvelope(replacement.validFrom as CivilDateString, validUntil, calendar);
        await validateHomeroomCandidate(tx, {
          academicYearId: source.academicYearId,
          schoolClassId: source.schoolClassId,
          teacherUserId: replacement.teacherUserId,
          validFrom: replacement.validFrom as CivilDateString,
          validUntil,
          entryReason: replacement.entryReason,
          businessDate: homeroomBusinessDate(),
          excludedAssignmentIds: [id],
        });
      }
      const reversedAt = new Date();
      const updated = await tx.homeroomAssignment.updateMany({
        where: { id, status: 'ACTIVE', updatedAt: source.updatedAt },
        data: { status: 'REVERSED', reversedByUserId: actorUserId, reversedAt, reversalReason: dto.reason.trim() },
      });
      if (updated.count !== 1) throw new ConflictException(HOMEROOM_CONFLICT);
      const reversed = await tx.homeroomAssignment.findUniqueOrThrow({ where: { id }, include });
      const children: EnrichedHomeroomAssignment[] = [];
      for (const replacement of sorted) {
        children.push(await tx.homeroomAssignment.create({
          data: {
            academicYearId: source.academicYearId,
            schoolClassId: source.schoolClassId,
            teacherUserId: replacement.teacherUserId,
            validFrom: parseCivilDate(replacement.validFrom),
            validUntil: replacement.validUntil ? parseCivilDate(replacement.validUntil) : null,
            note: replacement.note?.trim() || null,
            entryReason: replacement.entryReason?.trim() || null,
            replacesId: id,
            createdByUserId: actorUserId,
          },
          include,
        }));
      }
      await this.writeAudit(tx, actorUserId, meta, 'HOMEROOM_ASSIGNMENT_CORRECTED', id, {
        replacementIds: children.map((child) => child.id),
        replacements: children.map((child) => ({
          id: child.id,
          teacherUserId: child.teacherUserId,
          validFrom: formatCivilDate(child.validFrom),
          validUntil: child.validUntil ? formatCivilDate(child.validUntil) : null,
        })),
        reason: dto.reason.trim(),
      });
      return { source: this.record(reversed), replacements: children.map((child) => this.record(child)) };
    });
  }

  async resolve(academicYearId: string, schoolClassId: string, on: string): Promise<HomeroomResolutionResult> {
    await this.requireAcademicYear(academicYearId);
    await this.requireSchoolClassForAcademicYear(academicYearId, schoolClassId);
    const onDate = parseCivilDate(on);
    const rows = await this.prisma.homeroomAssignment.findMany({
      where: { academicYearId, schoolClassId },
      include,
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    });
    const activeCovering = rows.filter((row) => row.status === 'ACTIVE'
      && row.validFrom <= onDate
      && (row.validUntil === null || row.validUntil >= onDate));
    const resolution = classifyHomeroomResolutionRows(activeCovering, rows);
    if (resolution.outcome !== 'RESOLVED') return resolution;
    return { outcome: 'RESOLVED', assignment: this.record(resolution.assignment) };
  }

  async optionYears(query: HomeroomPageDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.academicYear.findMany({
        select: { id: true, code: true, name: true },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.academicYear.count(),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async workspace(academicYearId: string): Promise<HomeroomAssignmentWorkspaceOptionsResponse> {
    const academicYear = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId }, select: { id: true, code: true, name: true },
    });
    if (!academicYear) throw new NotFoundException('Không tìm thấy năm học.');
    const [activeCalendar, classes, historicalTeachers] = await this.prisma.$transaction([
      this.prisma.academicCalendarVersion.findFirst({
        where: { academicYearId, isActive: true },
        select: { id: true, versionNumber: true, startDate: true, endDate: true },
      }),
      this.prisma.schoolClass.findMany({
        where: { academicYearId },
        select: { id: true, code: true, name: true, gradeLevel: true, status: true },
        orderBy: [{ gradeLevel: 'asc' }, { code: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.user.findMany({
        where: { homeroomAssignments: { some: { academicYearId } } },
        select: { id: true, username: true, status: true, profile: { select: { displayName: true, staffCode: true, isTeachingStaff: true } } },
        orderBy: [{ username: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      businessDate: homeroomBusinessDate(),
      academicYear,
      activeCalendar: activeCalendar ? {
        ...activeCalendar,
        startDate: formatCivilDate(activeCalendar.startDate),
        endDate: formatCivilDate(activeCalendar.endDate),
      } : null,
      classes,
      historicalTeachers: historicalTeachers.map((teacher) => this.teacherSummary(teacher)),
    };
  }

  async historicalTeacherIdentities(
    academicYearId: string,
    query: HomeroomHistoricalTeacherIdentitiesDto,
  ): Promise<HomeroomAssignmentHistoricalTeacherIdentityListResponse> {
    await this.requireAcademicYear(academicYearId);
    const term = query.q.trim();
    if (term.length < 2) throw new BadRequestException('Từ khóa tìm kiếm phải có ít nhất 2 ký tự.');
    const where: Prisma.UserWhereInput = {
      OR: [
        { username: { contains: term, mode: 'insensitive' } },
        { profile: { is: { displayName: { contains: term, mode: 'insensitive' } } } },
        { profile: { is: { staffCode: { contains: term, mode: 'insensitive' } } } },
      ],
    };
    const select = {
      id: true,
      username: true,
      status: true,
      profile: { select: { displayName: true, staffCode: true, isTeachingStaff: true } },
    } satisfies Prisma.UserSelect;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ username: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map((teacher) => this.teacherSummary(teacher)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async eligibleTeachers(academicYearId: string, query: HomeroomEligibleTeachersDto) {
    const calendar = await requireHomeroomActiveCalendar(this.prisma, academicYearId);
    requireHomeroomEnvelope(query.validFrom as CivilDateString, (query.validUntil ?? null) as CivilDateString | null, calendar);
    const where: Prisma.UserWhereInput = { status: 'ACTIVE', profile: { is: { isTeachingStaff: true } } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: { id: true, username: true, status: true, profile: { select: { displayName: true, staffCode: true, isTeachingStaff: true } } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ username: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map((teacher) => this.teacherSummary(teacher)), page: query.page, pageSize: query.pageSize, total };
  }

  private teacherSummary(teacher: { id: string; username: string; status: UserStatus; profile: { displayName: string; staffCode: string | null; isTeachingStaff: boolean } | null }) {
    return {
      userId: teacher.id,
      username: teacher.username,
      displayName: teacher.profile?.displayName ?? teacher.username,
      staffCode: teacher.profile?.staffCode ?? null,
      userStatus: teacher.status,
      isTeachingStaff: teacher.profile?.isTeachingStaff ?? null,
    };
  }

  private async requireAcademicYear(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    if (!await tx.academicYear.findUnique({ where: { id }, select: { id: true } })) {
      throw new NotFoundException('Không tìm thấy năm học.');
    }
  }

  private async requireSchoolClassForAcademicYear(academicYearId: string, schoolClassId: string): Promise<void> {
    const schoolClass = await this.prisma.schoolClass.findUnique({ where: { id: schoolClassId }, select: { academicYearId: true } });
    if (!schoolClass) throw new NotFoundException('Không tìm thấy lớp học.');
    if (schoolClass.academicYearId !== academicYearId) throw new BadRequestException('Lớp học không thuộc năm học đã chọn.');
  }

  private async mutate<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      for (let attempt = 1; attempt <= HOMEROOM_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
        try {
          return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        } catch (error) {
          if (!this.isRetryableRace(error) || attempt === HOMEROOM_TRANSACTION_MAX_ATTEMPTS) throw error;
        }
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError) {
        if (this.isMutationConflict(error)) throw new ConflictException(HOMEROOM_CONFLICT);
        throw new InternalServerErrorException('Không thể hoàn tất thay đổi phân công chủ nhiệm.');
      }
      throw error;
    }
    throw new ConflictException(HOMEROOM_CONFLICT);
  }

  private isRetryableRace(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2034';
    return error instanceof Prisma.PrismaClientUnknownRequestError && /\b40P01\b/u.test(error.message);
  }

  private isMutationConflict(error: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError): boolean {
    if (this.isRetryableRace(error)) return true;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return ['P2002', 'P2003', 'P2004', 'P2014', 'P2025'].includes(error.code);
    }
    return error.message.includes('homeroom_assignments_no_active_overlap');
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
      entityType: 'HomeroomAssignment',
      entityId,
      requestId: meta.requestId,
      result: AuditResult.SUCCESS,
      metadata,
    }, tx);
  }
}
