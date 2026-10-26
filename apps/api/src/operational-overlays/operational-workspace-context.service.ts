import { ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { OperationalLessonDispositionType } from '@prisma/client';
import { PreviewCalendarExceptionDto, PreviewLessonDispositionDto, TeacherOptionsQueryDto } from './dto';
import { OperationalOverlaysService } from './operational-overlays.service';
import { CivilDateString } from '@baogiang/contracts';
import { ResolvedLessonOccurrencesService } from '../resolved-occurrences/resolved-occurrences.service';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CalendarCandidateConsequenceService } from './calendar-candidate-consequence.service';

@Injectable()
export class OperationalWorkspaceContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: CapabilityAuthorizationService,
    private readonly occurrences: ResolvedLessonOccurrencesService,
    private readonly overlays: OperationalOverlaysService,
    private readonly consequences?: CalendarCandidateConsequenceService,
  ) {}

  async previewCalendarException(request: AuthenticatedRequest, input: PreviewCalendarExceptionDto) {
    if (!request.auth || request.auth.user.mustChangePassword) throw new ForbiddenException('Không có quyền xem trước ngoại lệ lịch.');
    const grants = await this.authorization.listEffectiveCapabilities(request.auth.user.id);
    if (!grants.some((grant) => grant.key === 'CALENDAR_EXCEPTION_MANAGE' && grant.scope === 'SCHOOL_WIDE')) {
      throw new ForbiddenException('Không có quyền xem trước ngoại lệ lịch.');
    }
    try {
      if (!this.consequences) throw new Error('CONSEQUENCE_AUTHORITY_UNAVAILABLE');
      const evidence = await this.consequences.resolveNow(input);
      const affectedKeys = new Set(evidence.affectedOccurrenceKeys);
      const affected = evidence.streams.flatMap((stream) => stream.ppct.before.normalAllocations)
        .filter((row) => affectedKeys.has(row.occurrence.occurrenceKey)).map(({ occurrence: entry }) => ({
          occurrenceKey: entry.occurrenceKey, timetableEntryId: entry.timetableEntryId,
          schoolClassId: entry.schoolClass.id, subjectId: entry.subjectId,
          teacherUserId: entry.responsibleTeacherUserId, slot: entry.timeSlot,
        })).sort((a, b) => a.occurrenceKey.localeCompare(b.occurrenceKey));
      const [classes, subjects, people] = await Promise.all([
        this.prisma.schoolClass.findMany({ where: { id: { in: evidence.classIds } }, select: { id: true, name: true } }),
        this.prisma.subject.findMany({ where: { id: { in: evidence.streams.map((s) => s.scope.subjectId) } }, select: { id: true, name: true } }),
        this.prisma.user.findMany({ where: { id: { in: evidence.teachers.map((t) => t.targetUserId) } }, select: { id: true, profile: { select: { displayName: true } } } }),
      ]);
      const consequences = { ...evidence,
        // Public UI needs the changed items and elapsed counts, not duplicate
        // full-year allocation trees for every stream on both sides.
        streams: evidence.streams.map((s) => ({ scope: s.scope, retained: s.retained, ppctChanges: s.ppctChanges,
          progress: { before: { counts: s.progress.before.counts }, after: { counts: s.progress.after.counts } },
          schoolClassName: classes.find((c) => c.id === s.scope.schoolClassId)?.name ?? null,
          subjectName: subjects.find((v) => v.id === s.scope.subjectId)?.name ?? null })),
        teachers: evidence.teachers.map((t) => {
          const before = { scope: t.before.scope, status: t.before.status, earnedCredit: t.before.earnedCredit,
            requiredCredit: t.before.requiredCredit, varianceCredit: t.before.varianceCredit };
          return { targetUserId: t.targetUserId, status: t.status, before, after: t.after ? before : null,
            delta: t.delta, reconciliation: t.reconciliation,
            normPolicyVersionIds: [...new Set(t.before.adjustmentSegments.map((s) => s.policyVersionId).filter((id) => id !== null))].sort(),
            teacherName: people.find((u) => u.id === t.targetUserId)?.profile?.displayName ?? null };
        }),
      };
      return { status: evidence.status, affected, coverage: evidence.coverage,
        reason: evidence.status === 'BLOCKED' ? 'Chưa đối soát được đầy đủ nghĩa vụ, nợ tiết hoặc khối lượng. Hãy kiểm tra dữ liệu liên quan.' : undefined,
        consequenceFingerprint: evidence.status === 'PASS' ? evidence.consequenceFingerprint : undefined,
        consequences };

    } catch (error) {
      const conflict = error instanceof HttpException ? error.getResponse() : null;
      const retainedFindings = conflict && typeof conflict === 'object' && 'code' in conflict && 'retainedEntityId' in conflict
        && typeof conflict.code === 'string' && typeof conflict.retainedEntityId === 'string'
        && ['CALENDAR_REPLAY_DISPOSITION_SOURCE_CONFLICT', 'CALENDAR_REPLAY_MAKEUP_TARGET_SUPPRESSED'].includes(conflict.code)
        ? [{ code: conflict.code, retainedEntityId: conflict.retainedEntityId }] : [];
      return { status: 'BLOCKED' as const, affected: [], retainedFindings,
        reason: 'Ứng viên không đủ điều kiện hoặc xảy ra xung đột; cần xác minh lại trước khi lưu.', coverage: { ppctItemAllocation: 'NOT_ASSESSED' as const, workload: 'NOT_ASSESSED' as const, debt: 'NOT_ASSESSED' as const } };
    }
  }

  private async requireTeachingPreviewAccess(request: AuthenticatedRequest, subjectId: string, type: OperationalLessonDispositionType) {
    if (!request.auth || request.auth.user.mustChangePassword) throw new ForbiddenException('Không có quyền xem trước điều hành tiết dạy.');
    const grants = await this.authorization.listEffectiveCapabilities(request.auth.user.id);
    const schoolWide = grants.some((grant) => grant.key === 'TEACHING_OPERATION_MANAGE' && grant.scope === 'SCHOOL_WIDE');
    const subject = grants.some((grant) => grant.key === 'TEACHING_OPERATION_MANAGE' && grant.scope === 'SUBJECT' && grant.resourceId === subjectId);
    if (type === OperationalLessonDispositionType.AUTHORIZED_CANCELLATION ? !schoolWide : !schoolWide && !subject) {
      throw new ForbiddenException('Không có quyền xem trước điều hành tiết dạy.');
    }
  }

  async getTeacherOptions(request: AuthenticatedRequest, query: TeacherOptionsQueryDto) {
    await this.requireTeachingPreviewAccess(request, query.subjectId, query.dispositionType);
    if (query.dispositionType !== OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION
      && query.dispositionType !== OperationalLessonDispositionType.DIFFERENT_SUBJECT_SUPERVISION) {
      return { status: 'NOT_APPLICABLE' as const, items: [] };
    }
    const now = new Date();
    const staff = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        profile: { isTeachingStaff: true },
        ...(query.dispositionType === OperationalLessonDispositionType.SAME_SUBJECT_SUBSTITUTION
          ? { staffSubjects: { some: { subjectId: query.subjectId, validFrom: { lte: now },
              OR: [{ validUntil: null }, { validUntil: { gt: now } }] } } } : {}),
      },
      select: { id: true, profile: { select: { displayName: true } } },
      orderBy: [{ id: 'asc' }],
      take: 101,
    });
    if (staff.length > 100) {
      return { status: 'BLOCKED' as const, items: [], reason: 'Quá nhiều giáo viên; cần giới hạn bộ lọc trước khi liệt kê.' };
    }
    return { status: 'OPTIONS_NOT_COLLISION_CHECKED' as const,
      items: staff.map((person) => ({ userId: person.id, name: person.profile?.displayName ?? 'Chưa có tên' })) };
  }

  async previewLessonDisposition(request: AuthenticatedRequest, input: PreviewLessonDispositionDto) {
    await this.requireTeachingPreviewAccess(request, input.subjectId, input.dispositionType);
    try {
      const evidence = await this.overlays.previewDispositionConsequences(input);
      const summary = this.overlays.dispositionConsequenceSummary(evidence, input.subjectId);
      return { status: summary.status, sourceTimetableEntryId: input.timetableEntryId,
        candidateTeacherUserId: input.assignedTeacherUserId ?? null,
        eligibilitySameSubject: input.dispositionType === 'SAME_SUBJECT_SUBSTITUTION' ? true
          : input.dispositionType === 'DIFFERENT_SUBJECT_SUPERVISION' ? false : null,
        coverage: summary.coverage, consequenceFingerprint: summary.consequenceFingerprint, consequences: summary,
        reason: summary.status === 'BLOCKED' ? 'Hệ quả phân phối, nghĩa vụ hoặc khối lượng chưa đủ điều kiện.' : undefined };

    } catch {
      return { status: 'BLOCKED' as const, reason: 'Giáo viên hoặc cơ hội nguồn xung đột với lịch hiện tại.',
        coverage: { ppctItemAllocation: 'NOT_ASSESSED' as const, workload: 'NOT_ASSESSED' as const, debt: 'NOT_ASSESSED' as const } };
    }
  }

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
      academicCalendarVersionId: item.academicCalendarVersionId,
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
