import { ForbiddenException, Injectable } from '@nestjs/common';
import { CivilDateString } from '@baogiang/contracts';
import { ResolvedLessonOccurrencesService } from '../resolved-occurrences/resolved-occurrences.service';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';
import { AuthenticatedRequest } from '../auth/auth.types';

@Injectable()
export class OperationalWorkspaceContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: CapabilityAuthorizationService,
    private readonly occurrences: ResolvedLessonOccurrencesService,
  ) {}

  async getSourceOccurrences(request: AuthenticatedRequest, query: { academicYearId: string; civilDate: CivilDateString; subjectId?: string }) {
    if (!request.auth || request.auth.user.mustChangePassword) {
      throw new ForbiddenException('Không có quyền truy cập điều hành chuyên môn.');
    }
    const capabilities = await this.authorization.listEffectiveCapabilities(request.auth.user.id);
    const schoolWide = capabilities.some((grant) => grant.key === 'TEACHING_OPERATION_MANAGE' && grant.scope === 'SCHOOL_WIDE');
    const calendar = capabilities.some((grant) => grant.key === 'CALENDAR_EXCEPTION_MANAGE' && grant.scope === 'SCHOOL_WIDE');
    const authorizedSubjects = new Set(capabilities.filter((grant) => grant.key === 'TEACHING_OPERATION_MANAGE' && grant.scope === 'SUBJECT' && grant.resourceId).map((grant) => grant.resourceId!));
    if (!calendar && !schoolWide && (!query.subjectId || !authorizedSubjects.has(query.subjectId))) {
      throw new ForbiddenException('Không có quyền xem tiết dạy thuộc phạm vi này.');
    }
    const result = await this.occurrences.resolve({ academicYearId: query.academicYearId, civilDate: query.civilDate });
    // Never leak cross-subject blocker IDs or unfiltered occurrences to subject-scoped users.
    if (result.status !== 'PASS') {
      return { status: 'BLOCKED' as const, items: [], reason: 'Dữ liệu lịch học hoặc PPCT chưa đủ điều kiện xác nhận.', coverage: result.coverage };
    }
    const allowed = (schoolWide || calendar) ? result.normalOccurrences
      : result.normalOccurrences.filter((item) => item.subjectId === query.subjectId);
    const items = query.subjectId ? allowed.filter((item) => item.subjectId === query.subjectId) : allowed;
    const ids = <K extends string>(extract: (item: typeof items[number]) => K) => [...new Set(items.map(extract))];
    const [classes, subjects, teachers] = await Promise.all([
      this.prisma.schoolClass.findMany({ where: { id: { in: ids((item) => item.schoolClass.id) } }, select: { id: true, name: true } }),
      this.prisma.subject.findMany({ where: { id: { in: ids((item) => item.subjectId) } }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: ids((item) => item.responsibleTeacherUserId) } }, select: { id: true, profile: { select: { displayName: true } } } }),
    ]);
    const classNames = new Map(classes.map((row) => [row.id, row.name]));
    const subjectNames = new Map(subjects.map((row) => [row.id, row.name]));
    const teacherNames = new Map(teachers.map((row) => [row.id, row.profile?.displayName ?? '']));
    return { status: 'PASS' as const, items: items.map((item) => ({
      schoolClassName: classNames.get(item.schoolClass.id) ?? null,
      subjectName: subjectNames.get(item.subjectId) ?? null,
      responsibleTeacherName: teacherNames.get(item.responsibleTeacherUserId) || null,
      occurrenceKey: item.occurrenceKey,
      timetableEntryId: item.timetableEntryId,
      civilDate: item.civilDate,
      schoolClassId: item.schoolClass.id,
      gradeLevel: item.schoolClass.gradeLevel,
      subjectId: item.subjectId,
      responsibleTeacherUserId: item.responsibleTeacherUserId,
      slot: item.timeSlot,
      effectiveKind: item.effectiveKind,
      selectable: item.effectiveKind === 'BASE_TIMETABLE',
    })), coverage: result.coverage };
  }

  async getContext(request: AuthenticatedRequest) {
    if (!request.auth || request.auth.user.mustChangePassword) {
      throw new ForbiddenException('Không có quyền truy cập điều hành chuyên môn.');
    }
    const capabilities = await this.authorization.listEffectiveCapabilities(request.auth.user.id);
    const calendar = capabilities.some((capability) =>
      capability.key === 'CALENDAR_EXCEPTION_MANAGE' && capability.scope === 'SCHOOL_WIDE');
    const teachingSchoolWide = capabilities.some((capability) =>
      capability.key === 'TEACHING_OPERATION_MANAGE' && capability.scope === 'SCHOOL_WIDE');
    const subjectIds = [...new Set(capabilities.filter((capability) =>
      capability.key === 'TEACHING_OPERATION_MANAGE'
      && capability.scope === 'SUBJECT'
      && capability.resourceId).map((capability) => capability.resourceId!))];

    if (!calendar && !teachingSchoolWide && subjectIds.length === 0) {
      throw new ForbiddenException('Không có quyền truy cập điều hành chuyên môn.');
    }
    const [years, subjects] = await Promise.all([
      this.prisma.academicYear.findMany({
        select: { id: true, code: true, name: true },
        orderBy: [{ code: 'desc' }, { id: 'asc' }],
        take: 30,
      }),
      this.prisma.subject.findMany({
        where: teachingSchoolWide || calendar ? { status: 'ACTIVE' } : { id: { in: subjectIds }, status: 'ACTIVE' },
        select: { id: true, code: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 100,
      }),
    ]);
    // Calendar-only access must not imply authority to operate a subject.
    return {
      years,
      subjects: calendar && !teachingSchoolWide && subjectIds.length === 0 ? [] : subjects,
      permissions: {
        calendarSchoolWide: calendar,
        teachingSchoolWide,
        teachingSubjectIds: subjectIds,
      },
    };
  }
}
