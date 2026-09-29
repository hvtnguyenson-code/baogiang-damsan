import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AcademicWeekday, Prisma, UserStatus } from '@prisma/client';
import {
  CivilDateString,
  EffectiveOccupancySourceKind,
  EffectiveScheduleAcademicWeekOption,
  EffectiveScheduleAcademicYearOption,
  EffectiveScheduleComparisonResponse,
  EffectiveScheduleComparisonState,
  EffectiveScheduleContextOptionsResponse,
  EffectiveScheduleSlotItem,
  EffectiveScheduleTeacherOptionsResponse,
  IndividualWeeklyScheduleDay,
  IndividualWeeklyScheduleResponse,
  ScheduleComparisonSlotFact,
  SchoolWideDayScheduleResponse,
  SchoolWideSlotHeader,
  SchoolWideTeacherRow,
  SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_PROFILE,
} from '@baogiang/contracts';
import { formatCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { ResolvedLessonOccurrencesService } from '../resolved-occurrences/resolved-occurrences.service';
import {
  ResolvedLessonOccurrencesResult,
} from '../resolved-occurrences/resolved-occurrence.types';
import {
  GetEffectiveScheduleComparisonDto,
  GetEffectiveScheduleContextDto,
  GetIndividualWeeklyScheduleDto,
  GetSchoolWideDayScheduleDto,
  ListEffectiveScheduleTeachersDto,
} from './dto';
import {
  comparisonStateToVietnamese,
  intervalsOverlap,
  normalizeTimeString,
  sourceKindToVietnamese,
} from './effective-schedule-policy';

interface InternalDerivedOccupancy {
  id: string;
  teacherUserId: string;
  civilDate: CivilDateString;
  timeSlotId: string;
  startTime: string;
  endTime: string;
  weekday: string;
  session: 'MORNING' | 'AFTERNOON';
  sourceKind: EffectiveOccupancySourceKind;
  schoolClassId?: string | null;
  subjectId?: string | null;
  activityTitle?: string | null;
  notes?: string | null;
}

const weekdayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

function weekdayFor(date: Date): AcademicWeekday {
  return (weekdayNames[date.getUTCDay()] ?? 'MONDAY') as AcademicWeekday;
}

@Injectable()
export class EffectiveScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolvedOccurrences: ResolvedLessonOccurrencesService,
  ) {}

  /**
   * Surface A: Bounded searchable and paginated teacher options.
   * Minimal identity payload: userId, displayName, code (staffCode).
   */
  async listTeachers(query: ListEffectiveScheduleTeachersDto): Promise<EffectiveScheduleTeacherOptionsResponse> {
    const search = query.search?.trim();
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));

    const where: Prisma.UserWhereInput = {
      status: UserStatus.ACTIVE,
      profile: {
        isTeachingStaff: true,
        ...(search
          ? {
              OR: [
                { displayName: { contains: search, mode: 'insensitive' } },
                { staffCode: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          profile: {
            select: {
              displayName: true,
              staffCode: true,
            },
          },
        },
        orderBy: [{ profile: { displayName: 'asc' } }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = users.map((u) => ({
      userId: u.id,
      displayName: u.profile?.displayName ?? 'Giáo viên',
      code: u.profile?.staffCode ?? null,
    }));

    return {
      items,
      page,
      pageSize,
      total,
    };
  }

  /**
   * Helper: Context options for academic years and weeks.
   */
  async getContext(query: GetEffectiveScheduleContextDto): Promise<EffectiveScheduleContextOptionsResponse> {
    const years = await this.prisma.academicYear.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { createdAt: 'desc' },
    });

    const academicYears: EffectiveScheduleAcademicYearOption[] = years.map((y) => ({
      id: y.id,
      code: y.code,
      name: y.name,
    }));

    let targetYearId = query.academicYearId;
    if (!targetYearId && academicYears.length > 0) {
      const activeCalendar = await this.prisma.academicCalendarVersion.findFirst({
        where: { isActive: true },
        select: { academicYearId: true },
      });
      targetYearId = activeCalendar?.academicYearId ?? academicYears[0]!.id;
    }

    const weeks: EffectiveScheduleAcademicWeekOption[] = [];
    let currentAcademicWeekId: string | null = null;
    const now = new Date();
    const todayStr = formatCivilDate(now);

    if (targetYearId) {
      const calendar = await this.prisma.academicCalendarVersion.findFirst({
        where: { academicYearId: targetYearId, isActive: true },
        include: {
          weeks: {
            include: {
              segments: { orderBy: { segmentOrder: 'asc' } },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (calendar && calendar.weeks.length > 0) {
        for (const w of calendar.weeks) {
          if (w.segments.length === 0) continue;
          const startDates = w.segments.map((s) => s.startDate.getTime());
          const endDates = w.segments.map((s) => s.endDate.getTime());
          const minDate = new Date(Math.min(...startDates));
          const maxDate = new Date(Math.max(...endDates));
          const startStr = formatCivilDate(minDate);
          const endStr = formatCivilDate(maxDate);

          weeks.push({
            id: w.id,
            academicYearId: targetYearId,
            calendarVersionId: calendar.id,
            weekNumber: w.officialWeekNumber ?? w.reserveWeekNumber ?? 0,
            displayLabel: w.displayLabel,
            startDate: startStr,
            endDate: endStr,
            kind: w.kind === 'RESERVE' ? 'RESERVE' : 'OFFICIAL',
          });

          if (todayStr >= startStr && todayStr <= endStr) {
            currentAcademicWeekId = w.id;
          }
        }
        if (!currentAcademicWeekId && weeks.length > 0) {
          currentAcademicWeekId = weeks[0]!.id;
        }
      }
    }

    return {
      academicYears,
      currentAcademicYearId: targetYearId ?? null,
      weeks,
      currentAcademicWeekId,
      currentCivilDate: todayStr,
    };
  }

  /**
   * Surface B: Individual weekly effective teaching schedule.
   * If teacherUserId is omitted or not provided, resolves for authenticated user.
   */
  async getWeeklySchedule(
    query: GetIndividualWeeklyScheduleDto,
    currentUserId: string,
  ): Promise<IndividualWeeklyScheduleResponse> {
    const targetUserId = query.teacherUserId || currentUserId;

    return this.prisma.$transaction(
      async (tx) => {
        const week = await tx.academicWeek.findUnique({
          where: { id: query.academicWeekId },
          include: {
            segments: { orderBy: { segmentOrder: 'asc' } },
            calendarVersion: true,
          },
        });
        if (!week) {
          throw new NotFoundException('Không tìm thấy tuần học.');
        }

        const teacherUser = await tx.user.findUnique({
          where: { id: targetUserId },
          select: { id: true, profile: { select: { displayName: true } } },
        });
        if (!teacherUser) {
          throw new NotFoundException('Không tìm thấy thông tin giáo viên.');
        }

        const weekCivilDates = this.getTeachingDatesForWeek(week.segments, week.calendarVersion?.teachingWeekdays ?? []);
        const [timeSlots, schoolClasses, subjects] = await Promise.all([
          tx.timeSlotDefinition.findMany({
            where: { academicYearId: query.academicYearId, isActive: true },
            orderBy: [{ session: 'asc' }, { ordinal: 'asc' }, { startTime: 'asc' }],
          }),
          tx.schoolClass.findMany({
            where: { academicYearId: query.academicYearId },
            select: { id: true, name: true, code: true },
          }),
          tx.subject.findMany({
            select: { id: true, name: true, code: true },
          }),
        ]);

        const classMap = new Map(schoolClasses.map((c) => [c.id, c.name]));
        const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

        const days: IndividualWeeklyScheduleDay[] = [];
        let overallBlocked = false;
        const allBlockedReasons: string[] = [];

        for (const civilDate of weekCivilDates) {
          const dateObj = parseCivilDate(civilDate);
          const weekday = weekdayFor(dateObj);
          const daySlots = timeSlots.filter((s) => s.weekday === weekday);

          const resolution = await this.resolvedOccurrences.resolveInTransaction(tx, {
            academicYearId: query.academicYearId,
            civilDate,
          });

          const isDayBlocked = resolution.status === 'BLOCKED';
          if (isDayBlocked) {
            overallBlocked = true;
            for (const f of resolution.findings) {
              const reason = `${f.code} (loại: ${f.severity})`;
              if (!allBlockedReasons.includes(reason)) {
                allBlockedReasons.push(reason);
              }
            }
          }

          const occupancies = this.extractEffectiveOccupancies(resolution);
          const teacherOccupancies = occupancies.filter((o) => o.teacherUserId === targetUserId);

          const slotItems: EffectiveScheduleSlotItem[] = daySlots.map((slot) => {
            const slotStart = normalizeTimeString(slot.startTime);
            const slotEnd = normalizeTimeString(slot.endTime);

            const match = teacherOccupancies.find(
              (o) =>
                o.timeSlotId === slot.id ||
                intervalsOverlap(o.startTime, o.endTime, slotStart, slotEnd),
            );

            if (match) {
              return {
                id: `${civilDate}:${slot.id}:${match.id}`,
                civilDate,
                weekday,
                session: slot.session as 'MORNING' | 'AFTERNOON',
                timeSlotId: slot.id,
                slotLabel: slot.displayLabel,
                startTime: slotStart,
                endTime: slotEnd,
                teacherUserId: targetUserId,
                teacherDisplayName: teacherUser.profile?.displayName ?? 'Giáo viên',
                occupancyState: isDayBlocked ? 'BLOCKED' : 'OCCUPIED',
                sourceKind: match.sourceKind,
                sourceLabel: sourceKindToVietnamese(match.sourceKind),
                className: match.schoolClassId ? classMap.get(match.schoolClassId) ?? null : null,
                subjectName: match.subjectId ? subjectMap.get(match.subjectId) ?? null : null,
                activityTitle: match.activityTitle ?? null,
                notes: match.notes ?? null,
              };
            }

            return {
              id: `${civilDate}:${slot.id}:empty`,
              civilDate,
              weekday,
              session: slot.session as 'MORNING' | 'AFTERNOON',
              timeSlotId: slot.id,
              slotLabel: slot.displayLabel,
              startTime: slotStart,
              endTime: slotEnd,
              teacherUserId: targetUserId,
              teacherDisplayName: teacherUser.profile?.displayName ?? 'Giáo viên',
              occupancyState: isDayBlocked ? 'BLOCKED' : 'FREE',
              sourceKind: null,
              sourceLabel: isDayBlocked ? 'Bị chặn' : null,
              className: null,
              subjectName: null,
              activityTitle: null,
              notes: isDayBlocked ? 'Không thể xác định do dữ liệu bị chặn' : null,
            };
          });

          days.push({
            civilDate,
            weekday,
            isBlocked: isDayBlocked,
            slots: slotItems,
          });
        }

        return {
          profile: SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_PROFILE,
          academicYearId: query.academicYearId,
          academicWeekId: query.academicWeekId,
          weekLabel: week.displayLabel,
          teacherUserId: targetUserId,
          teacherDisplayName: teacherUser.profile?.displayName ?? 'Giáo viên',
          status: overallBlocked ? 'BLOCKED' : 'PASS',
          blockedReasons: allBlockedReasons.length > 0 ? allBlockedReasons : undefined,
          days,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * Surface C: School-wide selected-day effective schedule.
   * One selected civil date, deterministic teacher and slot ordering.
   */
  async getSchoolWideDaySchedule(query: GetSchoolWideDayScheduleDto): Promise<SchoolWideDayScheduleResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        let academicYearId = query.academicYearId;
        const dateObj = parseCivilDate(query.civilDate);

        if (!academicYearId) {
          const cal = await tx.academicCalendarVersion.findFirst({
            where: {
              isActive: true,
              startDate: { lte: dateObj },
              endDate: { gte: dateObj },
            },
            select: { academicYearId: true },
          });
          academicYearId = cal?.academicYearId;
          if (!academicYearId) {
            const anyYear = await tx.academicYear.findFirst({ orderBy: { createdAt: 'desc' } });
            academicYearId = anyYear?.id;
          }
        }

        if (!academicYearId) {
          throw new BadRequestException('Không tìm thấy năm học hợp lệ cho ngày này.');
        }

        const weekday = weekdayFor(dateObj);

        const resolution = await this.resolvedOccurrences.resolveInTransaction(tx, {
          academicYearId,
          civilDate: query.civilDate,
        });

        const isBlocked = resolution.status === 'BLOCKED';
        const blockedReasons = resolution.findings.map((f) => `${f.code} (${f.severity})`);

        const [slots, teachers, schoolClasses, subjects] = await Promise.all([
          tx.timeSlotDefinition.findMany({
            where: { academicYearId, weekday, isActive: true },
            orderBy: [{ session: 'asc' }, { ordinal: 'asc' }, { startTime: 'asc' }],
          }),
          tx.user.findMany({
            where: { status: UserStatus.ACTIVE, profile: { isTeachingStaff: true } },
            select: { id: true, profile: { select: { displayName: true } } },
            orderBy: [{ profile: { displayName: 'asc' } }, { id: 'asc' }],
          }),
          tx.schoolClass.findMany({
            where: { academicYearId },
            select: { id: true, name: true },
          }),
          tx.subject.findMany({
            select: { id: true, name: true },
          }),
        ]);

        const classMap = new Map(schoolClasses.map((c) => [c.id, c.name]));
        const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

        const slotHeaders: SchoolWideSlotHeader[] = slots.map((s) => ({
          id: s.id,
          label: s.displayLabel,
          session: s.session,
          startTime: normalizeTimeString(s.startTime),
          endTime: normalizeTimeString(s.endTime),
        }));

        const occupancies = this.extractEffectiveOccupancies(resolution);

        const teacherRows: SchoolWideTeacherRow[] = teachers.map((teacher) => {
          const teacherOccupancies = occupancies.filter((o) => o.teacherUserId === teacher.id);
          const teacherSlots: EffectiveScheduleSlotItem[] = slots.map((slot) => {
            const slotStart = normalizeTimeString(slot.startTime);
            const slotEnd = normalizeTimeString(slot.endTime);

            const match = teacherOccupancies.find(
              (o) =>
                o.timeSlotId === slot.id ||
                intervalsOverlap(o.startTime, o.endTime, slotStart, slotEnd),
            );

            if (match) {
              return {
                id: `${query.civilDate}:${teacher.id}:${slot.id}:${match.id}`,
                civilDate: query.civilDate,
                weekday,
                session: slot.session as 'MORNING' | 'AFTERNOON',
                timeSlotId: slot.id,
                slotLabel: slot.displayLabel,
                startTime: slotStart,
                endTime: slotEnd,
                teacherUserId: teacher.id,
                teacherDisplayName: teacher.profile?.displayName ?? 'Giáo viên',
                occupancyState: isBlocked ? 'BLOCKED' : 'OCCUPIED',
                sourceKind: match.sourceKind,
                sourceLabel: sourceKindToVietnamese(match.sourceKind),
                className: match.schoolClassId ? classMap.get(match.schoolClassId) ?? null : null,
                subjectName: match.subjectId ? subjectMap.get(match.subjectId) ?? null : null,
                activityTitle: match.activityTitle ?? null,
                notes: match.notes ?? null,
              };
            }

            return {
              id: `${query.civilDate}:${teacher.id}:${slot.id}:empty`,
              civilDate: query.civilDate,
              weekday,
              session: slot.session as 'MORNING' | 'AFTERNOON',
              timeSlotId: slot.id,
              slotLabel: slot.displayLabel,
              startTime: slotStart,
              endTime: slotEnd,
              teacherUserId: teacher.id,
              teacherDisplayName: teacher.profile?.displayName ?? 'Giáo viên',
              occupancyState: isBlocked ? 'BLOCKED' : 'FREE',
              sourceKind: null,
              sourceLabel: isBlocked ? 'Bị chặn' : null,
              className: null,
              subjectName: null,
              activityTitle: null,
              notes: isBlocked ? 'Không thể xác định do dữ liệu bị chặn' : null,
            };
          });

          return {
            teacherUserId: teacher.id,
            teacherDisplayName: teacher.profile?.displayName ?? 'Giáo viên',
            slots: teacherSlots,
          };
        });

        return {
          profile: SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_PROFILE,
          academicYearId,
          civilDate: query.civilDate,
          weekday,
          status: isBlocked ? 'BLOCKED' : 'PASS',
          blockedReasons: blockedReasons.length > 0 ? blockedReasons : undefined,
          slots: slotHeaders,
          teachers: teacherRows,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * Surface D: Compare with my schedule.
   * Authenticated user vs Peer teacher.
   * Real half-open wall-clock interval comparison.
   */
  async compareSchedules(
    query: GetEffectiveScheduleComparisonDto,
    currentUserId: string,
  ): Promise<EffectiveScheduleComparisonResponse> {
    if (!query.peerTeacherUserId) {
      throw new BadRequestException('Vui lòng chọn giáo viên cần so sánh.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const [selfUser, peerUser, week] = await Promise.all([
          tx.user.findUnique({
            where: { id: currentUserId },
            select: { id: true, profile: { select: { displayName: true } } },
          }),
          tx.user.findUnique({
            where: { id: query.peerTeacherUserId },
            select: { id: true, profile: { select: { displayName: true } } },
          }),
          tx.academicWeek.findUnique({
            where: { id: query.academicWeekId },
            include: {
              segments: { orderBy: { segmentOrder: 'asc' } },
              calendarVersion: true,
            },
          }),
        ]);

        if (!selfUser || !peerUser) {
          throw new NotFoundException('Không tìm thấy thông tin giáo viên.');
        }
        if (!week) {
          throw new NotFoundException('Không tìm thấy tuần học.');
        }

        const weekCivilDates = this.getTeachingDatesForWeek(week.segments, week.calendarVersion?.teachingWeekdays ?? []);
        const [timeSlots, schoolClasses, subjects] = await Promise.all([
          tx.timeSlotDefinition.findMany({
            where: { academicYearId: query.academicYearId, isActive: true },
            orderBy: [{ session: 'asc' }, { ordinal: 'asc' }, { startTime: 'asc' }],
          }),
          tx.schoolClass.findMany({
            where: { academicYearId: query.academicYearId },
            select: { id: true, name: true },
          }),
          tx.subject.findMany({
            select: { id: true, name: true },
          }),
        ]);

        const classMap = new Map(schoolClasses.map((c) => [c.id, c.name]));
        const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

        const facts: ScheduleComparisonSlotFact[] = [];
        let overallBlocked = false;
        const allBlockedReasons: string[] = [];

        for (const civilDate of weekCivilDates) {
          const dateObj = parseCivilDate(civilDate);
          const weekday = weekdayFor(dateObj);
          const daySlots = timeSlots.filter((s) => s.weekday === weekday);

          const resolution = await this.resolvedOccurrences.resolveInTransaction(tx, {
            academicYearId: query.academicYearId,
            civilDate,
          });

          const isDayBlocked = resolution.status === 'BLOCKED';
          if (isDayBlocked) {
            overallBlocked = true;
            for (const f of resolution.findings) {
              const reason = `${f.code} (${f.severity})`;
              if (!allBlockedReasons.includes(reason)) {
                allBlockedReasons.push(reason);
              }
            }
          }

          const occupancies = this.extractEffectiveOccupancies(resolution);
          const selfOccupancies = occupancies.filter((o) => o.teacherUserId === currentUserId);
          const peerOccupancies = occupancies.filter((o) => o.teacherUserId === query.peerTeacherUserId);

          for (const slot of daySlots) {
            const slotStart = normalizeTimeString(slot.startTime);
            const slotEnd = normalizeTimeString(slot.endTime);

            const selfMatch = selfOccupancies.find(
              (o) =>
                o.timeSlotId === slot.id ||
                intervalsOverlap(o.startTime, o.endTime, slotStart, slotEnd),
            );
            const peerMatch = peerOccupancies.find(
              (o) =>
                o.timeSlotId === slot.id ||
                intervalsOverlap(o.startTime, o.endTime, slotStart, slotEnd),
            );

            let compState: EffectiveScheduleComparisonState;
            if (isDayBlocked) {
              compState = 'BLOCKED';
            } else if (selfMatch && peerMatch) {
              compState = 'BOTH_BUSY';
            } else if (selfMatch && !peerMatch) {
              compState = 'SELF_BUSY_PEER_FREE';
            } else if (!selfMatch && peerMatch) {
              compState = 'SELF_FREE_PEER_BUSY';
            } else {
              compState = 'BOTH_FREE';
            }

            facts.push({
              civilDate,
              weekday,
              startTime: slotStart,
              endTime: slotEnd,
              slotLabel: slot.displayLabel,
              comparisonState: compState,
              comparisonLabel: comparisonStateToVietnamese(compState),
              selfOccupancy: {
                isBusy: Boolean(selfMatch),
                sourceKind: selfMatch?.sourceKind ?? null,
                sourceLabel: selfMatch ? sourceKindToVietnamese(selfMatch.sourceKind) : null,
                className: selfMatch?.schoolClassId ? classMap.get(selfMatch.schoolClassId) ?? null : null,
                subjectName: selfMatch?.subjectId ? subjectMap.get(selfMatch.subjectId) ?? null : null,
                activityTitle: selfMatch?.activityTitle ?? null,
              },
              peerOccupancy: {
                isBusy: Boolean(peerMatch),
                sourceKind: peerMatch?.sourceKind ?? null,
                sourceLabel: peerMatch ? sourceKindToVietnamese(peerMatch.sourceKind) : null,
                className: peerMatch?.schoolClassId ? classMap.get(peerMatch.schoolClassId) ?? null : null,
                subjectName: peerMatch?.subjectId ? subjectMap.get(peerMatch.subjectId) ?? null : null,
                activityTitle: peerMatch?.activityTitle ?? null,
              },
            });
          }
        }

        return {
          profile: SCHOOL_EFFECTIVE_TEACHING_SCHEDULE_PROFILE,
          academicYearId: query.academicYearId,
          academicWeekId: query.academicWeekId,
          selfTeacher: {
            userId: currentUserId,
            displayName: selfUser.profile?.displayName ?? 'Tôi',
          },
          peerTeacher: {
            userId: query.peerTeacherUserId,
            displayName: peerUser.profile?.displayName ?? 'Đồng nghiệp',
          },
          status: overallBlocked ? 'BLOCKED' : 'PASS',
          blockedReasons: allBlockedReasons.length > 0 ? allBlockedReasons : undefined,
          facts,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * Helper: Extracts effective teacher occupancies from structural resolution.
   * Adheres strictly to the effective occupancy contract:
   * - CALENDAR_INTERRUPTION -> no occupancy
   * - CALENDAR_EXCEPTION -> no occupancy
   * - SPECIAL_ACTIVITY_SUPPRESSED -> no occupancy from normal opportunity
   * - AUTHORIZED_CANCELLATION -> no occupancy
   * - ABSENCE_NO_REPLACEMENT -> no occupancy
   * - SAME_SUBJECT_SUBSTITUTION -> exact assigned substitute teacher
   * - DIFFERENT_SUBJECT_SUPERVISION -> exact assigned supervising teacher
   * - BASE_TIMETABLE -> responsible teacher
   * - MAKE-UP ACTIVE -> scheduled teacher
   * - SPECIAL_ACTIVITY ACTIVE -> scheduled staffing teachers
   */
  private extractEffectiveOccupancies(resolution: ResolvedLessonOccurrencesResult): InternalDerivedOccupancy[] {
    const list: InternalDerivedOccupancy[] = [];
    const seenKeys = new Set<string>();

    // 1. Normal occurrences
    for (const normal of resolution.normalOccurrences) {
      if (
        normal.effectiveKind === 'CALENDAR_INTERRUPTION' ||
        normal.effectiveKind === 'CALENDAR_EXCEPTION' ||
        normal.effectiveKind === 'SPECIAL_ACTIVITY_SUPPRESSED'
      ) {
        continue;
      }

      if (normal.effectiveKind === 'OPERATIONAL_DISPOSITION' && normal.disposition) {
        const dType = normal.disposition.dispositionType;
        if (dType === 'AUTHORIZED_CANCELLATION' || dType === 'ABSENCE_NO_REPLACEMENT') {
          continue;
        }

        if (dType === 'SAME_SUBJECT_SUBSTITUTION' && normal.disposition.assignedTeacherUserId) {
          const key = `NORMAL_SUB:${normal.disposition.assignedTeacherUserId}:${normal.civilDate}:${normal.timeSlot.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            list.push({
              id: `sub:${normal.disposition.id}`,
              teacherUserId: normal.disposition.assignedTeacherUserId,
              civilDate: normal.civilDate,
              timeSlotId: normal.timeSlot.id,
              startTime: normal.timeSlot.startTime,
              endTime: normal.timeSlot.endTime,
              weekday: normal.timeSlot.weekday,
              session: normal.timeSlot.session as 'MORNING' | 'AFTERNOON',
              sourceKind: 'SAME_SUBJECT_SUBSTITUTION',
              schoolClassId: normal.schoolClass.id,
              subjectId: normal.subjectId,
            });
          }
          continue;
        }

        if (dType === 'DIFFERENT_SUBJECT_SUPERVISION' && normal.disposition.assignedTeacherUserId) {
          const key = `NORMAL_SUP:${normal.disposition.assignedTeacherUserId}:${normal.civilDate}:${normal.timeSlot.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            list.push({
              id: `sup:${normal.disposition.id}`,
              teacherUserId: normal.disposition.assignedTeacherUserId,
              civilDate: normal.civilDate,
              timeSlotId: normal.timeSlot.id,
              startTime: normal.timeSlot.startTime,
              endTime: normal.timeSlot.endTime,
              weekday: normal.timeSlot.weekday,
              session: normal.timeSlot.session as 'MORNING' | 'AFTERNOON',
              sourceKind: 'DIFFERENT_SUBJECT_SUPERVISION',
              schoolClassId: normal.schoolClass.id,
              subjectId: normal.subjectId,
            });
          }
          continue;
        }
      }

      if (normal.effectiveKind === 'BASE_TIMETABLE') {
        const key = `NORMAL_BASE:${normal.responsibleTeacherUserId}:${normal.civilDate}:${normal.timeSlot.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          list.push({
            id: `base:${normal.timetableEntryId}`,
            teacherUserId: normal.responsibleTeacherUserId,
            civilDate: normal.civilDate,
            timeSlotId: normal.timeSlot.id,
            startTime: normal.timeSlot.startTime,
            endTime: normal.timeSlot.endTime,
            weekday: normal.timeSlot.weekday,
            session: normal.timeSlot.session as 'MORNING' | 'AFTERNOON',
            sourceKind: 'BASE_TIMETABLE',
            schoolClassId: normal.schoolClass.id,
            subjectId: normal.subjectId,
          });
        }
      }
    }

    // 2. Make-up teaching
    for (const makeup of resolution.makeupOccurrences) {
      const key = `MAKEUP:${makeup.target.scheduledTeacherUserId}:${makeup.target.targetCivilDate}:${makeup.target.targetTimeSlotDefinitionId}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        list.push({
          id: `makeup:${makeup.target.id}`,
          teacherUserId: makeup.target.scheduledTeacherUserId,
          civilDate: makeup.target.targetCivilDate,
          timeSlotId: makeup.target.targetTimeSlotDefinitionId,
          startTime: makeup.target.targetSlot.startTime,
          endTime: makeup.target.targetSlot.endTime,
          weekday: makeup.target.targetSlot.weekday,
          session: makeup.target.targetSlot.session as 'MORNING' | 'AFTERNOON',
          sourceKind: 'MAKEUP_TEACHING',
          schoolClassId: makeup.target.schoolClassId,
          subjectId: makeup.target.subjectId,
        });
      }
    }

    // 3. Special activities (including materialized GDĐP/HĐTN-HN)
    for (const act of resolution.specialActivityOccurrences) {
      for (const slot of act.timeSlots) {
        for (const staff of act.staffing) {
          const key = `ACTIVITY:${staff.scheduledTeacherUserId}:${act.civilDate}:${slot.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            list.push({
              id: `act:${act.id}:${slot.id}:${staff.scheduledTeacherUserId}`,
              teacherUserId: staff.scheduledTeacherUserId,
              civilDate: act.civilDate,
              timeSlotId: slot.id,
              startTime: slot.startTime,
              endTime: slot.endTime,
              weekday: slot.weekday,
              session: slot.session as 'MORNING' | 'AFTERNOON',
              sourceKind: 'SPECIAL_ACTIVITY',
              activityTitle: act.title,
              notes: act.note,
            });
          }
        }
      }
    }

    return list;
  }

  /**
   * Helper: Generates teaching dates within an academic week's segments.
   */
  private getTeachingDatesForWeek(
    segments: { startDate: Date; endDate: Date }[],
    teachingWeekdays: string[],
  ): CivilDateString[] {
    const dates: CivilDateString[] = [];
    const seen = new Set<string>();

    for (const seg of segments) {
      const curr = new Date(seg.startDate.getTime());
      const end = new Date(seg.endDate.getTime());

      while (curr <= end) {
        const weekday = weekdayFor(curr);
        if (teachingWeekdays.length === 0 || teachingWeekdays.includes(weekday)) {
          const civil = formatCivilDate(curr);
          if (!seen.has(civil)) {
            seen.add(civil);
            dates.push(civil);
          }
        }
        curr.setUTCDate(curr.getUTCDate() + 1);
      }
    }

    return dates.sort();
  }
}
