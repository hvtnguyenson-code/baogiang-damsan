import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ProgrammeMaster,
  ProgrammeTopicItem,
  PlannedOccurrenceSlot,
  PlannedSlotStaffing,
} from '@prisma/client';
import {
  ProgrammeWorkspaceAcademicYearOption,
  ProgrammeWorkspaceDetailResponse,
  ProgrammeWorkspaceMasterDetail,
  ProgrammeWorkspaceMasterSummary,
  ProgrammeWorkspaceOccurrence,
  ProgrammeWorkspaceOptionsResponse,
  ProgrammeWorkspacePlan,
  ProgrammeWorkspaceTeacher,
  ProgrammeWorkspaceTopicItem,
} from '@baogiang/contracts';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';
import { formatCivilDate } from '../common/validation/civil-date';
import { PrismaService } from '../prisma/prisma.service';
import { formatWallClockTime } from '../time-slots/wall-clock-time';
import { ProgrammePlanningAuthorizationService } from './programme-planning-authorization.service';

@Injectable()
export class ProgrammePlanningWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: CapabilityAuthorizationService,
    private readonly authService: ProgrammePlanningAuthorizationService,
  ) {}

  private getKindLabel(kind: 'GDDP' | 'HDTN_HN'): string {
    return kind === 'GDDP' ? 'Giáo dục địa phương' : 'Hoạt động trải nghiệm, hướng nghiệp';
  }

  private getMasterLabel(kind: 'GDDP' | 'HDTN_HN', gradeLevel: number | null): string {
    return kind === 'GDDP'
      ? `Giáo dục địa phương - Khối ${gradeLevel ?? ''}`.trim()
      : 'Hoạt động trải nghiệm, hướng nghiệp';
  }

  private getModeLabel(mode: 'CLASS' | 'GRADE' | 'SCHOOL_WIDE'): string {
    switch (mode) {
      case 'CLASS':
        return 'Theo lớp';
      case 'GRADE':
        return 'Theo khối';
      case 'SCHOOL_WIDE':
        return 'Toàn trường';
    }
  }

  /**
   * Read-only programme workspace options.
   * Exposes academic years and authorized ProgrammeMaster summaries.
   * Does NOT require ACADEMIC_STRUCTURE_MANAGE or USER_MANAGE.
   * Fails closed for inactive, locked, or mustChangePassword users.
   */
  async getWorkspaceOptions(
    actorUserId: string,
    academicYearId?: string,
  ): Promise<ProgrammeWorkspaceOptionsResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { status: true, mustChangePassword: true, lockedUntil: true },
    });
    const evalTime = new Date();
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.mustChangePassword ||
      (user.lockedUntil && user.lockedUntil > evalTime)
    ) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
    }

    const principal = await this.authorization.evaluate({
      userId: actorUserId,
      capabilityKey: 'APPROVAL_PRINCIPAL',
      requestedScope: 'SCHOOL_WIDE',
      atTime: evalTime,
    });
    let isBgh = principal.allowed;
    if (!isBgh) {
      const vicePrincipal = await this.authorization.evaluate({
        userId: actorUserId,
        capabilityKey: 'APPROVAL_VICE_PRINCIPAL',
        requestedScope: 'SCHOOL_WIDE',
        atTime: evalTime,
      });
      isBgh = vicePrincipal.allowed;
    }

    const allMasters = await this.prisma.programmeMaster.findMany({
      where: academicYearId ? { academicYearId } : undefined,
      orderBy: [{ createdAt: 'asc' }],
    });

    let authorizedMasters: ProgrammeMaster[];
    let academicYears: ProgrammeWorkspaceAcademicYearOption[];

    if (isBgh) {
      authorizedMasters = allMasters;
      const allYears = await this.prisma.academicYear.findMany({
        orderBy: { code: 'desc' },
        select: { id: true, code: true, name: true },
      });
      academicYears = allYears.map((y) => ({ id: y.id, code: y.code, name: y.name }));
    } else {
      authorizedMasters = [];
      for (const master of allMasters) {
        const decision = await this.authService.resolveProgrammeAuthority(
          actorUserId,
          master,
          evalTime,
        );
        if (decision.qualified) {
          authorizedMasters.push(master);
        }
      }

      if (authorizedMasters.length === 0) {
        throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
      }

      const authorizedYearIds = [...new Set(authorizedMasters.map((m) => m.academicYearId))];
      const years = await this.prisma.academicYear.findMany({
        where: { id: { in: authorizedYearIds } },
        orderBy: { code: 'desc' },
        select: { id: true, code: true, name: true },
      });
      academicYears = years.map((y) => ({ id: y.id, code: y.code, name: y.name }));
    }

    const masterYearIds = [...new Set(authorizedMasters.map((m) => m.academicYearId))];
    const yearLookups = masterYearIds.length > 0
      ? await this.prisma.academicYear.findMany({
          where: { id: { in: masterYearIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
    const yearMap = new Map(yearLookups.map((y) => [y.id, y]));

    const masterIds = authorizedMasters.map((m) => m.id);
    const planVersions = masterIds.length > 0
      ? await this.prisma.programmePlanVersion.findMany({
          where: { programmeMasterId: { in: masterIds } },
          orderBy: [{ versionNumber: 'desc' }],
          select: {
            id: true,
            programmeMasterId: true,
            versionNumber: true,
            status: true,
          },
        })
      : [];

    const latestPlanByMaster = new Map<string, (typeof planVersions)[0]>();
    for (const pv of planVersions) {
      if (!latestPlanByMaster.has(pv.programmeMasterId)) {
        latestPlanByMaster.set(pv.programmeMasterId, pv);
      }
    }

    const summaries: ProgrammeWorkspaceMasterSummary[] = authorizedMasters.map((m) => {
      const yr = yearMap.get(m.academicYearId);
      const plan = latestPlanByMaster.get(m.id);
      return {
        id: m.id,
        academicYearId: m.academicYearId,
        academicYearCode: yr?.code ?? '',
        academicYearName: yr?.name ?? '',
        kind: m.kind,
        kindLabel: this.getKindLabel(m.kind),
        gradeLevel: m.gradeLevel,
        label: this.getMasterLabel(m.kind, m.gradeLevel),
        latestVersionNumber: plan ? plan.versionNumber : null,
        latestVersionStatus: plan ? plan.status : null,
      };
    });

    return {
      academicYears,
      masters: summaries,
    };
  }

  /**
   * Durable programme workspace read model projection.
   * Translates internal relations into a business-readable shape for the workspace UI.
   */
  async getWorkspaceMasterDetail(masterId: string): Promise<ProgrammeWorkspaceDetailResponse> {
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: masterId },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }

    const academicYear = await this.prisma.academicYear.findUnique({
      where: { id: master.academicYearId },
      select: { id: true, code: true, name: true },
    });

    const masterDetail: ProgrammeWorkspaceMasterDetail = {
      id: master.id,
      kind: master.kind,
      kindLabel: this.getKindLabel(master.kind),
      academicYearId: master.academicYearId,
      academicYearCode: academicYear?.code ?? '',
      academicYearName: academicYear?.name ?? '',
      gradeLevel: master.gradeLevel,
      label: this.getMasterLabel(master.kind, master.gradeLevel),
    };

    const latestPlanVersion = await this.prisma.programmePlanVersion.findFirst({
      where: { programmeMasterId: masterId },
      orderBy: [{ versionNumber: 'desc' }],
    });

    let plan: ProgrammeWorkspacePlan | null = null;
    let topics: ProgrammeTopicItem[] = [];

    if (latestPlanVersion) {
      topics = await this.prisma.programmeTopicItem.findMany({
        where: { programmePlanVersionId: latestPlanVersion.id },
        orderBy: [{ sequence: 'asc' }],
      });

      const mappedTopics: ProgrammeWorkspaceTopicItem[] = topics.map((t) => ({
        id: t.id,
        sequence: t.sequence,
        title: t.title,
        requiredPeriods: t.requiredPeriods,
        guidelineWeekFrom: t.guidelineWeekFrom,
        guidelineWeekTo: t.guidelineWeekTo,
        guidelineSegmentLabel: t.guidelineSegmentLabel,
      }));

      plan = {
        id: latestPlanVersion.id,
        versionNumber: latestPlanVersion.versionNumber,
        status: latestPlanVersion.status,
        draftRevision: latestPlanVersion.draftRevision,
        changeReason: latestPlanVersion.changeReason,
        publishedAt: latestPlanVersion.publishedAt
          ? latestPlanVersion.publishedAt.toISOString()
          : null,
        topics: mappedTopics,
      };
    }

    const occurrences = await this.prisma.plannedProgrammeOccurrence.findMany({
      where: { programmeMasterId: masterId },
      orderBy: [{ civilDate: 'asc' }, { createdAt: 'asc' }],
    });

    const occurrenceIds = occurrences.map((o) => o.id);

    const topicItemIds = [...new Set(occurrences.map((o) => o.programmeTopicItemId))];
    const allRelevantTopics = topicItemIds.length > 0
      ? await this.prisma.programmeTopicItem.findMany({
          where: { id: { in: topicItemIds } },
        })
      : [];
    const topicMap = new Map(allRelevantTopics.map((t) => [t.id, t]));

    const classIds = [
      ...new Set(
        occurrences.map((o) => o.schoolClassId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const classes = classIds.length > 0
      ? await this.prisma.schoolClass.findMany({
          where: { id: { in: classIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
    const classMap = new Map(classes.map((c) => [c.id, c]));

    const slots = occurrenceIds.length > 0
      ? await this.prisma.plannedOccurrenceSlot.findMany({
          where: { plannedProgrammeOccurrenceId: { in: occurrenceIds } },
          orderBy: [{ createdAt: 'asc' }],
        })
      : [];

    const slotDefIds = [...new Set(slots.map((s) => s.timeSlotDefinitionId))];
    const slotDefs = slotDefIds.length > 0
      ? await this.prisma.timeSlotDefinition.findMany({
          where: { id: { in: slotDefIds } },
          select: { id: true, ordinal: true, startTime: true, endTime: true, displayLabel: true },
        })
      : [];
    const slotDefMap = new Map(slotDefs.map((d) => [d.id, d]));

    const slotIds = slots.map((s) => s.id);
    const staffing = slotIds.length > 0
      ? await this.prisma.plannedSlotStaffing.findMany({
          where: { plannedOccurrenceSlotId: { in: slotIds } },
          orderBy: [{ createdAt: 'asc' }],
        })
      : [];

    const teacherUserIds = [...new Set(staffing.map((st) => st.teacherUserId))];
    const profiles = teacherUserIds.length > 0
      ? await this.prisma.staffProfile.findMany({
          where: { userId: { in: teacherUserIds } },
          select: { userId: true, displayName: true, staffCode: true },
        })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));
    const missingProfileIds = teacherUserIds.filter((id) => !profileMap.has(id));
    if (missingProfileIds.length > 0) {
      const fallbackUsers = await this.prisma.user.findMany({
        where: { id: { in: missingProfileIds } },
        select: { id: true, username: true },
      });
      for (const u of fallbackUsers) {
        profileMap.set(u.id, { userId: u.id, displayName: u.username, staffCode: null });
      }
    }

    const materializedActivities = occurrenceIds.length > 0
      ? await this.prisma.programmeMaterializedActivity.findMany({
          where: { plannedProgrammeOccurrenceId: { in: occurrenceIds } },
          select: { id: true, plannedProgrammeOccurrenceId: true, specialActivityId: true },
        })
      : [];
    const materializedByOccurrence = new Map<string, typeof materializedActivities>();
    for (const ma of materializedActivities) {
      const list = materializedByOccurrence.get(ma.plannedProgrammeOccurrenceId) ?? [];
      list.push(ma);
      materializedByOccurrence.set(ma.plannedProgrammeOccurrenceId, list);
    }

    const attestations = occurrenceIds.length > 0
      ? await this.prisma.programmeOccurrenceAttestation.findMany({
          where: { plannedProgrammeOccurrenceId: { in: occurrenceIds }, status: 'ACTIVE' },
          select: { id: true, plannedProgrammeOccurrenceId: true, status: true },
        })
      : [];
    const activeAttestationsByOccurrence = new Map<string, typeof attestations>();
    for (const a of attestations) {
      const list = activeAttestationsByOccurrence.get(a.plannedProgrammeOccurrenceId) ?? [];
      list.push(a);
      activeAttestationsByOccurrence.set(a.plannedProgrammeOccurrenceId, list);
    }

    const staffingBySlot = new Map<string, PlannedSlotStaffing[]>();
    for (const st of staffing) {
      const list = staffingBySlot.get(st.plannedOccurrenceSlotId) ?? [];
      list.push(st);
      staffingBySlot.set(st.plannedOccurrenceSlotId, list);
    }

    const slotsByOccurrence = new Map<string, PlannedOccurrenceSlot[]>();
    for (const s of slots) {
      const list = slotsByOccurrence.get(s.plannedProgrammeOccurrenceId) ?? [];
      list.push(s);
      slotsByOccurrence.set(s.plannedProgrammeOccurrenceId, list);
    }

    const mappedOccurrences: ProgrammeWorkspaceOccurrence[] = occurrences.map((occ) => {
      const topic = topicMap.get(occ.programmeTopicItemId);
      const cls = occ.schoolClassId ? classMap.get(occ.schoolClassId) : null;
      const occSlots = (slotsByOccurrence.get(occ.id) ?? []).map((slot) => {
        const def = slotDefMap.get(slot.timeSlotDefinitionId);
        const slotStaff = staffingBySlot.get(slot.id) ?? [];
        const teachers: ProgrammeWorkspaceTeacher[] = slotStaff
          .map((st) => {
            const p = profileMap.get(st.teacherUserId);
            return {
              userId: st.teacherUserId,
              displayName: p?.displayName ?? st.teacherUserId,
              staffCode: p?.staffCode ?? null,
            };
          })
          .sort((a, b) => {
            if (a.staffCode && b.staffCode) return a.staffCode.localeCompare(b.staffCode);
            if (a.staffCode) return -1;
            if (b.staffCode) return 1;
            return a.displayName.localeCompare(b.displayName);
          });

        return {
          id: slot.id,
          timeSlotDefinitionId: slot.timeSlotDefinitionId,
          periodNumber: def ? def.ordinal : null,
          startTime: def ? formatWallClockTime(def.startTime) : null,
          endTime: def ? formatWallClockTime(def.endTime) : null,
          staffing: teachers,
        };
      }).sort((a, b) => {
        const pA = a.periodNumber ?? 0;
        const pB = b.periodNumber ?? 0;
        if (pA !== pB) return pA - pB;
        return (a.startTime ?? '').localeCompare(b.startTime ?? '');
      });

      const occMaterialized = materializedByOccurrence.get(occ.id) ?? [];
      const occAttested = activeAttestationsByOccurrence.get(occ.id) ?? [];

      return {
        id: occ.id,
        status: occ.status,
        draftRevision: occ.draftRevision,
        topicItemId: occ.programmeTopicItemId,
        topicSequence: topic?.sequence ?? 0,
        topicTitle: topic?.title ?? '',
        civilDate: formatCivilDate(occ.civilDate),
        mode: occ.mode,
        modeLabel: this.getModeLabel(occ.mode),
        gradeLevel: occ.gradeLevel,
        schoolClassId: occ.schoolClassId,
        schoolClassCode: cls?.code ?? null,
        schoolClassName: cls?.name ?? null,
        note: occ.note,
        replacesOccurrenceId: occ.replacesOccurrenceId,
        slots: occSlots,
        lifecycleSummary: {
          materialized: occMaterialized.length > 0,
          materializedActivityCount: occMaterialized.length,
          hasActiveAttestation: occAttested.length > 0,
          activeAttestationCount: occAttested.length,
        },
      };
    });

    mappedOccurrences.sort((a, b) => {
      if (a.civilDate !== b.civilDate) return a.civilDate.localeCompare(b.civilDate);
      if (a.topicSequence !== b.topicSequence) return a.topicSequence - b.topicSequence;
      if ((a.gradeLevel ?? 0) !== (b.gradeLevel ?? 0))
        return (a.gradeLevel ?? 0) - (b.gradeLevel ?? 0);
      if ((a.schoolClassCode ?? '') !== (b.schoolClassCode ?? ''))
        return (a.schoolClassCode ?? '').localeCompare(b.schoolClassCode ?? '');
      return a.id.localeCompare(b.id);
    });

    const totalOccurrences = mappedOccurrences.length;
    const materializedOccurrences = mappedOccurrences.filter(
      (o) => o.lifecycleSummary.materialized,
    ).length;
    const attestedOccurrences = mappedOccurrences.filter(
      (o) => o.lifecycleSummary.hasActiveAttestation,
    ).length;
    const isFullyMaterialized =
      totalOccurrences > 0 && materializedOccurrences === totalOccurrences;

    return {
      master: masterDetail,
      plan,
      occurrences: mappedOccurrences,
      lifecycleSummary: {
        totalOccurrences,
        materializedOccurrences,
        attestedOccurrences,
        isFullyMaterialized,
      },
    };
  }
}
