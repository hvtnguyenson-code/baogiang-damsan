import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AcademicWeekday,
  AuditResult,
  PlannedOccurrenceSlot,
  PlannedProgrammeOccurrence,
  PlannedSlotStaffing,
  Prisma,
  ProgrammeMaster,
  ProgrammeMaterializedActivity,
  ProgrammeOccurrenceAttestation,
  ProgrammePlanVersion,
  ProgrammeTopicItem,
  SpecialActivity,
  SpecialActivityScope,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { formatCivilDate, isCivilDate, parseCivilDate } from '../common/validation/civil-date';
import { classifyHomeroomResolutionRows } from '../homeroom-assignments/homeroom-assignments.service';
import {
  classifyHomeroomInterval,
  homeroomBusinessDate,
} from '../homeroom-assignments/homeroom-assignment-policy';
import { PrismaService } from '../prisma/prisma.service';
import { SpecialActivitiesService } from '../special-activities/special-activities.service';
import {
  AttestOccurrenceDto,
  CreateDraftOccurrenceDto,
  CreateDraftPlanVersionDto,
  CreateProgrammeMasterDto,
  CreateReplacementOccurrenceDto,
  CreateSuccessorDraftPlanVersionDto,
  EditDraftOccurrenceDto,
  EditDraftPlanVersionDto,
  ListPlannedOccurrencesDto,
  ListProgrammeMastersDto,
  MaterializeOccurrenceDto,
  PlannedProgrammeOccurrenceRecord,
  PlannedSlotStaffingInputDto,
  ProgrammeMasterRecord,
  ProgrammeMaterializedActivityRecord,
  ProgrammeOccurrenceAttestationRecord,
  ProgrammeOccurrenceAttestationsListResponse,
  ProgrammePlanVersionRecord,
  ProgrammeTopicItemInputDto,
  ProgrammeTopicItemRecord,
  PublishOccurrenceDto,
  PublishPlanVersionDto,
  ReplaceMaterializedSlotDto,
  ReplaceOccurrenceSlotsStaffingDto,
  ReverseAttestationDto,
} from './dto';
import { ProgrammeAuthorityDecision } from './programme-planning-authorization.service';

export function weekdayForCivilDate(date: Date): AcademicWeekday {
  return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][
    date.getUTCDay()
  ] as AcademicWeekday;
}

@Injectable()
export class ProgrammePlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly specialActivities: SpecialActivitiesService,
  ) {}

  // =========================================================================
  // SECTION 1: PROGRAMME MASTER
  // =========================================================================

  async createMaster(
    dto: CreateProgrammeMasterDto,
    actorUserId: string,
  ): Promise<ProgrammeMasterRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'CREATE_PROGRAMME_MASTER',
      dto,
      async (tx) => {
        const year = await tx.academicYear.findUnique({
          where: { id: dto.academicYearId },
          select: { id: true },
        });
        if (!year) {
          throw new NotFoundException('Năm học không tồn tại.');
        }

        if (dto.kind === 'GDDP') {
          if (!dto.gradeLevel || ![10, 11, 12].includes(dto.gradeLevel)) {
            throw new BadRequestException('GDDP master bắt buộc gradeLevel 10, 11 hoặc 12.');
          }
        } else if (dto.kind === 'HDTN_HN') {
          if (dto.gradeLevel !== null && dto.gradeLevel !== undefined) {
            throw new BadRequestException('HDTN_HN master không được mang gradeLevel ở master level.');
          }
        } else {
          throw new BadRequestException('ProgrammeKind không hợp lệ.');
        }

        if (dto.kind === 'GDDP') {
          const existing = await tx.programmeMaster.findFirst({
            where: {
              academicYearId: dto.academicYearId,
              kind: 'GDDP',
              gradeLevel: dto.gradeLevel,
            },
          });
          if (existing) {
            throw new ConflictException('Đã tồn tại GDDP master cho năm học và khối lớp này.');
          }
        } else {
          const existing = await tx.programmeMaster.findFirst({
            where: {
              academicYearId: dto.academicYearId,
              kind: 'HDTN_HN',
            },
          });
          if (existing) {
            throw new ConflictException('Đã tồn tại HDTN_HN master cho năm học này.');
          }
        }

        const master = await tx.programmeMaster.create({
          data: {
            academicYearId: dto.academicYearId,
            kind: dto.kind,
            gradeLevel: dto.kind === 'GDDP' ? dto.gradeLevel : null,
            createdByUserId: actorUserId,
          },
        });

        await this.audit.write(
          {
            actorUserId,
            action: 'PROGRAMME_MASTER_CREATED',
            entityType: 'ProgrammeMaster',
            entityId: master.id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              academicYearId: master.academicYearId,
              kind: master.kind,
              gradeLevel: master.gradeLevel,
            },
          },
          tx,
        );

        return this.toMasterRecord(master);
      },
    );
  }

  async getMaster(id: string): Promise<ProgrammeMasterRecord> {
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id },
    });
    if (!master) {
      throw new NotFoundException('ProgrammeMaster không tồn tại.');
    }
    return this.toMasterRecord(master);
  }

  async listMasters(query: ListProgrammeMastersDto): Promise<ProgrammeMasterRecord[]> {
    const masters = await this.prisma.programmeMaster.findMany({
      where: {
        academicYearId: query.academicYearId,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.gradeLevel !== undefined ? { gradeLevel: query.gradeLevel } : {}),
      },
      orderBy: [{ kind: 'asc' }, { gradeLevel: 'asc' }, { createdAt: 'asc' }],
    });
    return masters.map((m) => this.toMasterRecord(m));
  }

  // =========================================================================
  // SECTION 2: PROGRAMME PLAN VERSION
  // =========================================================================

  async createDraftPlanVersion(
    dto: CreateDraftPlanVersionDto,
    actorUserId: string,
  ): Promise<ProgrammePlanVersionRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'CREATE_DRAFT_PLAN_VERSION',
      dto,
      async (tx) => {
        const master = await tx.programmeMaster.findUnique({
          where: { id: dto.programmeMasterId },
        });
        if (!master) {
          throw new NotFoundException('ProgrammeMaster không tồn tại.');
        }

        const existingVersion = await tx.programmePlanVersion.findFirst({
          where: { programmeMasterId: dto.programmeMasterId },
          select: { id: true, status: true },
        });
        if (existingVersion) {
          if (existingVersion.status === 'DRAFT') {
            throw new ConflictException('Đã có một bản thảo DRAFT cho programme master này.');
          }
          throw new ConflictException(
            'Programme master already has retained plan history; create a successor draft instead.',
          );
        }

        const maxVersion = await tx.programmePlanVersion.aggregate({
          where: { programmeMasterId: dto.programmeMasterId },
          _max: { versionNumber: true },
        });
        const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

        const planVersion = await tx.programmePlanVersion.create({
          data: {
            programmeMasterId: dto.programmeMasterId,
            versionNumber,
            status: 'DRAFT',
            draftRevision: 1,
            createdByUserId: actorUserId,
          },
        });

        if (dto.initialTopics && dto.initialTopics.length > 0) {
          this.validateTopicItems(dto.initialTopics);
          await tx.programmeTopicItem.createMany({
            data: dto.initialTopics.map((t) => ({
              programmePlanVersionId: planVersion.id,
              sequence: t.sequence,
              title: t.title.trim(),
              requiredPeriods: t.requiredPeriods,
              guidelineWeekFrom: t.guidelineWeekFrom ?? null,
              guidelineWeekTo: t.guidelineWeekTo ?? null,
              guidelineSegmentLabel: t.guidelineSegmentLabel?.trim() || null,
            })),
          });
        }

        await this.audit.write(
          {
            actorUserId,
            action: 'PROGRAMME_PLAN_VERSION_DRAFT_CREATED',
            entityType: 'ProgrammePlanVersion',
            entityId: planVersion.id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              programmeMasterId: master.id,
              versionNumber,
              topicCount: dto.initialTopics?.length ?? 0,
            },
          },
          tx,
        );

        return this.fetchPlanVersionRecord(tx, planVersion.id);
      },
    );
  }

  async createSuccessorDraftPlanVersion(
    dto: CreateSuccessorDraftPlanVersionDto,
    actorUserId: string,
  ): Promise<ProgrammePlanVersionRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'CREATE_SUCCESSOR_DRAFT_PLAN_VERSION',
      dto,
      async (tx) => {
        const master = await tx.programmeMaster.findUnique({
          where: { id: dto.programmeMasterId },
        });
        if (!master) {
          throw new NotFoundException('ProgrammeMaster không tồn tại.');
        }

        const predecessor = await tx.programmePlanVersion.findUnique({
          where: { id: dto.predecessorVersionId },
        });
        if (!predecessor) {
          throw new NotFoundException('Predecessor plan version không tồn tại.');
        }
        if (predecessor.programmeMasterId !== dto.programmeMasterId) {
          throw new BadRequestException('Predecessor phải thuộc cùng ProgrammeMaster.');
        }
        if (predecessor.status !== 'PUBLISHED') {
          throw new ConflictException('Predecessor phải ở trạng thái PUBLISHED.');
        }
        if (!dto.changeReason || dto.changeReason.trim() === '') {
          throw new BadRequestException('changeReason là bắt buộc khi tạo successor version.');
        }

        const existingDraft = await tx.programmePlanVersion.findFirst({
          where: { programmeMasterId: dto.programmeMasterId, status: 'DRAFT' },
        });
        if (existingDraft) {
          throw new ConflictException('Đã có một bản thảo DRAFT cho programme master này.');
        }

        const predecessorTopics = await tx.programmeTopicItem.findMany({
          where: { programmePlanVersionId: predecessor.id },
          orderBy: { sequence: 'asc' },
        });

        const maxVersion = await tx.programmePlanVersion.aggregate({
          where: { programmeMasterId: dto.programmeMasterId },
          _max: { versionNumber: true },
        });
        const versionNumber = (maxVersion._max.versionNumber ?? predecessor.versionNumber) + 1;

        const planVersion = await tx.programmePlanVersion.create({
          data: {
            programmeMasterId: dto.programmeMasterId,
            versionNumber,
            status: 'DRAFT',
            draftRevision: 1,
            predecessorVersionId: dto.predecessorVersionId,
            changeReason: dto.changeReason.trim(),
            createdByUserId: actorUserId,
          },
        });

        const topicsToInsert = dto.initialTopics && dto.initialTopics.length > 0
          ? dto.initialTopics
          : predecessorTopics.map((t) => ({
              sequence: t.sequence,
              title: t.title,
              requiredPeriods: t.requiredPeriods,
              guidelineWeekFrom: t.guidelineWeekFrom ?? undefined,
              guidelineWeekTo: t.guidelineWeekTo ?? undefined,
              guidelineSegmentLabel: t.guidelineSegmentLabel ?? undefined,
            }));

        if (topicsToInsert.length > 0) {
          this.validateTopicItems(topicsToInsert);
          await tx.programmeTopicItem.createMany({
            data: topicsToInsert.map((t) => ({
              programmePlanVersionId: planVersion.id,
              sequence: t.sequence,
              title: t.title.trim(),
              requiredPeriods: t.requiredPeriods,
              guidelineWeekFrom: t.guidelineWeekFrom ?? null,
              guidelineWeekTo: t.guidelineWeekTo ?? null,
              guidelineSegmentLabel: t.guidelineSegmentLabel?.trim() || null,
            })),
          });
        }

        await this.audit.write(
          {
            actorUserId,
            action: 'PROGRAMME_PLAN_VERSION_SUCCESSOR_CREATED',
            entityType: 'ProgrammePlanVersion',
            entityId: planVersion.id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              programmeMasterId: master.id,
              versionNumber,
              predecessorVersionId: dto.predecessorVersionId,
              changeReason: dto.changeReason.trim(),
              topicCount: topicsToInsert.length,
            },
          },
          tx,
        );

        return this.fetchPlanVersionRecord(tx, planVersion.id);
      },
    );
  }

  async editDraftPlanVersion(
    id: string,
    dto: EditDraftPlanVersionDto,
    actorUserId: string,
  ): Promise<ProgrammePlanVersionRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'EDIT_DRAFT_PLAN_VERSION',
      dto,
      async (tx) => {
        const planVersion = await tx.programmePlanVersion.findUnique({
          where: { id },
        });
        if (!planVersion) {
          throw new NotFoundException('ProgrammePlanVersion không tồn tại.');
        }
        if (planVersion.status !== 'DRAFT') {
          throw new ConflictException('Chỉ có thể sửa plan version ở trạng thái DRAFT.');
        }
        if (planVersion.draftRevision !== dto.expectedRevision) {
          throw new ConflictException('PLAN_VERSION_CONFLICT: expectedRevision mismatch.');
        }

        if (dto.changeReason !== undefined) {
          if (planVersion.predecessorVersionId && (!dto.changeReason || dto.changeReason.trim() === '')) {
            throw new BadRequestException('changeReason không được để trống đối với revision successor.');
          }
        }

        const updateData: Prisma.ProgrammePlanVersionUpdateInput = {
          draftRevision: { increment: 1 },
          ...(dto.changeReason !== undefined ? { changeReason: dto.changeReason.trim() || null } : {}),
        };

        const updated = await tx.programmePlanVersion.updateMany({
          where: { id, status: 'DRAFT', draftRevision: dto.expectedRevision },
          data: updateData,
        });
        if (updated.count !== 1) {
          throw new ConflictException('PLAN_VERSION_CONFLICT');
        }

        if (dto.topics !== undefined) {
          this.validateTopicItems(dto.topics);
          await tx.programmeTopicItem.deleteMany({
            where: { programmePlanVersionId: id },
          });
          if (dto.topics.length > 0) {
            await tx.programmeTopicItem.createMany({
              data: dto.topics.map((t) => ({
                programmePlanVersionId: id,
                sequence: t.sequence,
                title: t.title.trim(),
                requiredPeriods: t.requiredPeriods,
                guidelineWeekFrom: t.guidelineWeekFrom ?? null,
                guidelineWeekTo: t.guidelineWeekTo ?? null,
                guidelineSegmentLabel: t.guidelineSegmentLabel?.trim() || null,
              })),
            });
          }
        }

        await this.audit.write(
          {
            actorUserId,
            action: 'PROGRAMME_PLAN_VERSION_DRAFT_EDITED',
            entityType: 'ProgrammePlanVersion',
            entityId: id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              resultingRevision: planVersion.draftRevision + 1,
              topicCount: dto.topics?.length,
            },
          },
          tx,
        );

        return this.fetchPlanVersionRecord(tx, id);
      },
    );
  }

  async publishPlanVersion(
    id: string,
    dto: PublishPlanVersionDto,
    actorUserId: string,
  ): Promise<ProgrammePlanVersionRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'PUBLISH_PLAN_VERSION',
      dto,
      async (tx) => {
        const planVersion = await tx.programmePlanVersion.findUnique({
          where: { id },
        });
        if (!planVersion) {
          throw new NotFoundException('ProgrammePlanVersion không tồn tại.');
        }
        if (planVersion.status !== 'DRAFT') {
          throw new ConflictException('Chỉ có thể publish plan version ở trạng thái DRAFT.');
        }
        if (planVersion.draftRevision !== dto.expectedRevision) {
          throw new ConflictException('PLAN_VERSION_CONFLICT: expectedRevision mismatch.');
        }

        const topicCount = await tx.programmeTopicItem.count({
          where: { programmePlanVersionId: id },
        });
        if (topicCount === 0) {
          throw new BadRequestException('Plan version phải có ít nhất một topic item trước khi publish.');
        }

        const now = new Date();

        const currentPublished = await tx.programmePlanVersion.findFirst({
          where: { programmeMasterId: planVersion.programmeMasterId, status: 'PUBLISHED' },
        });

        if (currentPublished) {
          if (planVersion.predecessorVersionId !== currentPublished.id) {
            throw new ConflictException(
              'PLAN_VERSION_CONFLICT: draft predecessor does not match current published plan authority.',
            );
          }
          const superseded = await tx.programmePlanVersion.updateMany({
            where: { id: currentPublished.id, status: 'PUBLISHED' },
            data: {
              status: 'SUPERSEDED',
              supersededByUserId: actorUserId,
              supersededAt: now,
            },
          });
          if (superseded.count !== 1) {
            throw new ConflictException('PLAN_VERSION_CONFLICT: supersession race detected.');
          }
        } else {
          if (planVersion.predecessorVersionId !== null) {
            throw new ConflictException(
              'PLAN_VERSION_CONFLICT: initial published plan version must not carry a predecessor lineage.',
            );
          }
        }

        const published = await tx.programmePlanVersion.updateMany({
          where: { id, status: 'DRAFT', draftRevision: dto.expectedRevision },
          data: {
            status: 'PUBLISHED',
            publishedByUserId: actorUserId,
            publishedAt: now,
          },
        });
        if (published.count !== 1) {
          throw new ConflictException('PLAN_VERSION_CONFLICT: publish race detected.');
        }

        await this.audit.write(
          {
            actorUserId,
            action: 'PROGRAMME_PLAN_VERSION_PUBLISHED',
            entityType: 'ProgrammePlanVersion',
            entityId: id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              programmeMasterId: planVersion.programmeMasterId,
              versionNumber: planVersion.versionNumber,
              supersededVersionId: currentPublished?.id ?? null,
            },
          },
          tx,
        );

        return this.fetchPlanVersionRecord(tx, id);
      },
    );
  }

  async getPlanVersion(id: string): Promise<ProgrammePlanVersionRecord> {
    return this.fetchPlanVersionRecord(this.prisma, id);
  }

  async listPlanVersions(programmeMasterId: string): Promise<ProgrammePlanVersionRecord[]> {
    const versions = await this.prisma.programmePlanVersion.findMany({
      where: { programmeMasterId },
      orderBy: [{ versionNumber: 'desc' }],
    });
    const versionIds = versions.map((v) => v.id);
    const allTopics = await this.prisma.programmeTopicItem.findMany({
      where: { programmePlanVersionId: { in: versionIds } },
      orderBy: [{ sequence: 'asc' }],
    });
    const topicMap = new Map<string, ProgrammeTopicItem[]>();
    for (const t of allTopics) {
      const list = topicMap.get(t.programmePlanVersionId) ?? [];
      list.push(t);
      topicMap.set(t.programmePlanVersionId, list);
    }
    return versions.map((v) => this.toPlanVersionRecord(v, topicMap.get(v.id) ?? []));
  }

  // =========================================================================
  // SECTION 3: PLANNED PROGRAMME OCCURRENCE
  // =========================================================================

  async createDraftOccurrence(
    dto: CreateDraftOccurrenceDto,
    actorUserId: string,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'CREATE_DRAFT_OCCURRENCE',
      dto,
      async (tx) => {
        await this.validateOccurrenceContext(tx, {
          programmeMasterId: dto.programmeMasterId,
          programmePlanVersionId: dto.programmePlanVersionId,
          programmeTopicItemId: dto.programmeTopicItemId,
          academicYearId: dto.academicYearId,
          civilDate: dto.civilDate,
          mode: dto.mode,
          gradeLevel: dto.gradeLevel,
          schoolClassId: dto.schoolClassId,
          slots: dto.slots,
        });

        const occurrence = await tx.plannedProgrammeOccurrence.create({
          data: {
            programmeMasterId: dto.programmeMasterId,
            programmePlanVersionId: dto.programmePlanVersionId,
            programmeTopicItemId: dto.programmeTopicItemId,
            academicYearId: dto.academicYearId,
            civilDate: parseCivilDate(dto.civilDate),
            mode: dto.mode,
            gradeLevel: dto.mode === 'GRADE' ? dto.gradeLevel : null,
            schoolClassId: dto.mode === 'CLASS' ? dto.schoolClassId : null,
            status: 'DRAFT',
            draftRevision: 1,
            note: dto.note?.trim() || null,
            createdByUserId: actorUserId,
          },
        });

        if (dto.slots && dto.slots.length > 0) {
          for (const slotDto of dto.slots) {
            const slot = await tx.plannedOccurrenceSlot.create({
              data: {
                plannedProgrammeOccurrenceId: occurrence.id,
                academicYearId: dto.academicYearId,
                timeSlotDefinitionId: slotDto.timeSlotDefinitionId,
              },
            });
            if (slotDto.teacherUserIds.length > 0) {
              await tx.plannedSlotStaffing.createMany({
                data: slotDto.teacherUserIds.map((teacherUserId) => ({
                  plannedOccurrenceSlotId: slot.id,
                  teacherUserId,
                })),
              });
            }
          }
        }

        await this.audit.write(
          {
            actorUserId,
            action: 'PLANNED_OCCURRENCE_DRAFT_CREATED',
            entityType: 'PlannedProgrammeOccurrence',
            entityId: occurrence.id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              programmeMasterId: dto.programmeMasterId,
              civilDate: dto.civilDate,
              mode: dto.mode,
              slotCount: dto.slots?.length ?? 0,
            },
          },
          tx,
        );

        return this.fetchOccurrenceRecord(tx, occurrence.id);
      },
    );
  }

  async editDraftOccurrence(
    id: string,
    dto: EditDraftOccurrenceDto,
    actorUserId: string,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'EDIT_DRAFT_OCCURRENCE',
      dto,
      async (tx) => {
        const occurrence = await tx.plannedProgrammeOccurrence.findUnique({
          where: { id },
        });
        if (!occurrence) {
          throw new NotFoundException('PlannedProgrammeOccurrence không tồn tại.');
        }
        if (occurrence.status !== 'DRAFT') {
          throw new ConflictException('Chỉ có thể sửa occurrence ở trạng thái DRAFT.');
        }
        if (occurrence.draftRevision !== dto.expectedRevision) {
          throw new ConflictException('OCCURRENCE_CONFLICT: expectedRevision mismatch.');
        }

        const existingSlots = await tx.plannedOccurrenceSlot.findMany({
          where: { plannedProgrammeOccurrenceId: id },
        });

        const targetCivilDate = dto.civilDate ?? formatCivilDate(occurrence.civilDate);
        const targetMode = dto.mode ?? occurrence.mode;
        const targetGradeLevel = dto.gradeLevel !== undefined ? dto.gradeLevel : occurrence.gradeLevel;
        const targetSchoolClassId = dto.schoolClassId !== undefined ? dto.schoolClassId : occurrence.schoolClassId;
        const targetTopicId = dto.programmeTopicItemId ?? occurrence.programmeTopicItemId;

        await this.validateOccurrenceContext(tx, {
          programmeMasterId: occurrence.programmeMasterId,
          programmePlanVersionId: occurrence.programmePlanVersionId,
          programmeTopicItemId: targetTopicId,
          academicYearId: occurrence.academicYearId,
          civilDate: targetCivilDate,
          mode: targetMode,
          gradeLevel: targetGradeLevel,
          schoolClassId: targetSchoolClassId,
        });

        if (dto.civilDate && dto.civilDate !== formatCivilDate(occurrence.civilDate) && existingSlots.length > 0) {
          const newDate = parseCivilDate(dto.civilDate);
          const newWeekday = weekdayForCivilDate(newDate);
          const slotDefIds = existingSlots.map((s) => s.timeSlotDefinitionId);
          const definitions = await tx.timeSlotDefinition.findMany({
            where: { id: { in: slotDefIds } },
          });
          for (const def of definitions) {
            if (def.weekday !== newWeekday) {
              throw new ConflictException(
                'Occurrence civil-date change would invalidate existing planned slot weekdays',
              );
            }
          }
        }

        const updateData: Prisma.PlannedProgrammeOccurrenceUpdateInput = {
          draftRevision: { increment: 1 },
          ...(dto.civilDate ? { civilDate: parseCivilDate(dto.civilDate) } : {}),
          ...(dto.mode ? { mode: dto.mode } : {}),
          ...(dto.gradeLevel !== undefined ? { gradeLevel: targetMode === 'GRADE' ? dto.gradeLevel : null } : {}),
          ...(dto.schoolClassId !== undefined ? { schoolClassId: targetMode === 'CLASS' ? dto.schoolClassId : null } : {}),
          ...(dto.programmeTopicItemId ? { programmeTopicItemId: dto.programmeTopicItemId } : {}),
          ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        };

        const updated = await tx.plannedProgrammeOccurrence.updateMany({
          where: { id, status: 'DRAFT', draftRevision: dto.expectedRevision },
          data: updateData,
        });
        if (updated.count !== 1) {
          throw new ConflictException('OCCURRENCE_CONFLICT');
        }

        await this.audit.write(
          {
            actorUserId,
            action: 'PLANNED_OCCURRENCE_DRAFT_EDITED',
            entityType: 'PlannedProgrammeOccurrence',
            entityId: id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              resultingRevision: occurrence.draftRevision + 1,
            },
          },
          tx,
        );

        return this.fetchOccurrenceRecord(tx, id);
      },
    );
  }

  async replaceOccurrenceSlotsAndStaffing(
    id: string,
    dto: ReplaceOccurrenceSlotsStaffingDto,
    actorUserId: string,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'REPLACE_OCCURRENCE_SLOTS_AND_STAFFING',
      dto,
      async (tx) => {
        const occurrence = await tx.plannedProgrammeOccurrence.findUnique({
          where: { id },
        });
        if (!occurrence) {
          throw new NotFoundException('PlannedProgrammeOccurrence không tồn tại.');
        }
        if (occurrence.status !== 'DRAFT') {
          throw new ConflictException('Chỉ có thể sửa slots và staffing ở trạng thái DRAFT.');
        }
        if (occurrence.draftRevision !== dto.expectedRevision) {
          throw new ConflictException('OCCURRENCE_CONFLICT: expectedRevision mismatch.');
        }

        await this.validateSlotsAndStaffing(
          tx,
          occurrence.academicYearId,
          occurrence.civilDate,
          dto.slots,
        );

        const updated = await tx.plannedProgrammeOccurrence.updateMany({
          where: { id, status: 'DRAFT', draftRevision: dto.expectedRevision },
          data: { draftRevision: { increment: 1 } },
        });
        if (updated.count !== 1) {
          throw new ConflictException('OCCURRENCE_CONFLICT');
        }

        const oldSlots = await tx.plannedOccurrenceSlot.findMany({
          where: { plannedProgrammeOccurrenceId: id },
          select: { id: true },
        });
        const oldSlotIds = oldSlots.map((s) => s.id);
        if (oldSlotIds.length > 0) {
          await tx.plannedSlotStaffing.deleteMany({
            where: { plannedOccurrenceSlotId: { in: oldSlotIds } },
          });
          await tx.plannedOccurrenceSlot.deleteMany({
            where: { plannedProgrammeOccurrenceId: id },
          });
        }

        for (const slotDto of dto.slots) {
          const slot = await tx.plannedOccurrenceSlot.create({
            data: {
              plannedProgrammeOccurrenceId: id,
              academicYearId: occurrence.academicYearId,
              timeSlotDefinitionId: slotDto.timeSlotDefinitionId,
            },
          });
          if (slotDto.teacherUserIds.length > 0) {
            await tx.plannedSlotStaffing.createMany({
              data: slotDto.teacherUserIds.map((teacherUserId) => ({
                plannedOccurrenceSlotId: slot.id,
                teacherUserId,
              })),
            });
          }
        }

        await this.audit.write(
          {
            actorUserId,
            action: 'PLANNED_OCCURRENCE_SLOTS_REPLACED',
            entityType: 'PlannedProgrammeOccurrence',
            entityId: id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              resultingRevision: occurrence.draftRevision + 1,
              newSlotCount: dto.slots.length,
            },
          },
          tx,
        );

        return this.fetchOccurrenceRecord(tx, id);
      },
    );
  }

  async publishOccurrence(
    id: string,
    dto: PublishOccurrenceDto,
    actorUserId: string,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'PUBLISH_OCCURRENCE',
      dto,
      async (tx) => {
        const occurrence = await tx.plannedProgrammeOccurrence.findUnique({
          where: { id },
        });
        if (!occurrence) {
          throw new NotFoundException('PlannedProgrammeOccurrence không tồn tại.');
        }
        if (occurrence.status !== 'DRAFT') {
          throw new ConflictException('Chỉ có thể publish occurrence ở trạng thái DRAFT.');
        }
        if (occurrence.draftRevision !== dto.expectedRevision) {
          throw new ConflictException('OCCURRENCE_CONFLICT: expectedRevision mismatch.');
        }

        const planVersion = await tx.programmePlanVersion.findUnique({
          where: { id: occurrence.programmePlanVersionId },
        });
        if (!planVersion || planVersion.status !== 'PUBLISHED') {
          throw new ConflictException('Planned programme occurrences require a PUBLISHED programme plan version.');
        }

        const slots = await tx.plannedOccurrenceSlot.findMany({
          where: { plannedProgrammeOccurrenceId: id },
        });
        if (slots.length === 0) {
          throw new BadRequestException('Mỗi occurrence phải có ít nhất một slot trước khi publish.');
        }

        const slotIds = slots.map((s) => s.id);
        const staffing = await tx.plannedSlotStaffing.findMany({
          where: { plannedOccurrenceSlotId: { in: slotIds } },
        });

        const staffingMap = new Set(staffing.map((st) => st.plannedOccurrenceSlotId));
        for (const slot of slots) {
          if (!staffingMap.has(slot.id)) {
            throw new BadRequestException('Mỗi published slot phải có ít nhất một giáo viên được phân công.');
          }
        }

        const calendar = await tx.academicCalendarVersion.findFirst({
          where: { academicYearId: occurrence.academicYearId, isActive: true },
          select: { startDate: true, endDate: true },
        });
        if (calendar) {
          if (occurrence.civilDate < calendar.startDate || occurrence.civilDate > calendar.endDate) {
            throw new BadRequestException('civilDate nằm ngoài khoảng thời gian của năm học.');
          }
        }

        const now = new Date();

        if (occurrence.replacesOccurrenceId) {
          const predecessor = await tx.plannedProgrammeOccurrence.findUnique({
            where: { id: occurrence.replacesOccurrenceId },
          });
          if (!predecessor) {
            throw new NotFoundException('Predecessor occurrence không tồn tại.');
          }
          if (predecessor.status !== 'PUBLISHED') {
            throw new ConflictException('Predecessor occurrence phải ở trạng thái PUBLISHED để supersede.');
          }
          const superseded = await tx.plannedProgrammeOccurrence.updateMany({
            where: { id: predecessor.id, status: 'PUBLISHED' },
            data: {
              status: 'SUPERSEDED',
              supersededByUserId: actorUserId,
              supersededAt: now,
            },
          });
          if (superseded.count !== 1) {
            throw new ConflictException('OCCURRENCE_CONFLICT: predecessor supersession race detected.');
          }
        }

        const published = await tx.plannedProgrammeOccurrence.updateMany({
          where: { id, status: 'DRAFT', draftRevision: dto.expectedRevision },
          data: {
            status: 'PUBLISHED',
            publishedByUserId: actorUserId,
            publishedAt: now,
          },
        });
        if (published.count !== 1) {
          throw new ConflictException('OCCURRENCE_CONFLICT: publish race detected.');
        }

        await this.audit.write(
          {
            actorUserId,
            action: 'PLANNED_OCCURRENCE_PUBLISHED',
            entityType: 'PlannedProgrammeOccurrence',
            entityId: id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              programmeMasterId: occurrence.programmeMasterId,
              civilDate: formatCivilDate(occurrence.civilDate),
              supersededOccurrenceId: occurrence.replacesOccurrenceId ?? null,
              slotCount: slots.length,
            },
          },
          tx,
        );

        return this.fetchOccurrenceRecord(tx, id);
      },
    );
  }

  async createReplacementOccurrence(
    id: string,
    dto: CreateReplacementOccurrenceDto,
    actorUserId: string,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'CREATE_REPLACEMENT_OCCURRENCE',
      dto,
      async (tx) => {
        const predecessor = await tx.plannedProgrammeOccurrence.findUnique({
          where: { id },
        });
        if (!predecessor) {
          throw new NotFoundException('Predecessor occurrence không tồn tại.');
        }
        if (predecessor.status !== 'PUBLISHED') {
          throw new ConflictException('Chỉ có thể tạo replacement cho occurrence đã PUBLISHED.');
        }
        if (!dto.changeReason || dto.changeReason.trim() === '') {
          throw new BadRequestException('changeReason là bắt buộc khi tạo replacement occurrence.');
        }

        const existingReplacement = await tx.plannedProgrammeOccurrence.findFirst({
          where: { replacesOccurrenceId: id },
        });
        if (existingReplacement) {
          throw new ConflictException('Đã có replacement occurrence cho occurrence này.');
        }

        const predecessorSlots = await tx.plannedOccurrenceSlot.findMany({
          where: { plannedProgrammeOccurrenceId: id },
        });
        const predecessorSlotIds = predecessorSlots.map((s) => s.id);
        const predecessorStaffing = await tx.plannedSlotStaffing.findMany({
          where: { plannedOccurrenceSlotId: { in: predecessorSlotIds } },
        });

        const civilDateStr = dto.civilDate ?? formatCivilDate(predecessor.civilDate);
        const mode = dto.mode ?? predecessor.mode;
        const topicId = dto.programmeTopicItemId ?? predecessor.programmeTopicItemId;
        const gradeLevel = dto.gradeLevel !== undefined ? dto.gradeLevel : predecessor.gradeLevel;
        const schoolClassId = dto.schoolClassId !== undefined ? dto.schoolClassId : predecessor.schoolClassId;

        await this.validateOccurrenceContext(tx, {
          programmeMasterId: predecessor.programmeMasterId,
          programmePlanVersionId: predecessor.programmePlanVersionId,
          programmeTopicItemId: topicId,
          academicYearId: predecessor.academicYearId,
          civilDate: civilDateStr,
          mode,
          gradeLevel,
          schoolClassId,
          slots: dto.slots,
        });

        const replacement = await tx.plannedProgrammeOccurrence.create({
          data: {
            programmeMasterId: predecessor.programmeMasterId,
            programmePlanVersionId: predecessor.programmePlanVersionId,
            programmeTopicItemId: topicId,
            academicYearId: predecessor.academicYearId,
            civilDate: parseCivilDate(civilDateStr),
            mode,
            gradeLevel: mode === 'GRADE' ? gradeLevel : null,
            schoolClassId: mode === 'CLASS' ? schoolClassId : null,
            status: 'DRAFT',
            draftRevision: 1,
            note: dto.note !== undefined ? dto.note?.trim() || null : predecessor.note,
            replacesOccurrenceId: id,
            changeReason: dto.changeReason.trim(),
            createdByUserId: actorUserId,
          },
        });

        const civilDateObj = parseCivilDate(civilDateStr);
        const predecessorWeekday = weekdayForCivilDate(predecessor.civilDate);
        const replacementWeekday = weekdayForCivilDate(civilDateObj);

        if (dto.slots && dto.slots.length > 0) {
          for (const slotDto of dto.slots) {
            const slot = await tx.plannedOccurrenceSlot.create({
              data: {
                plannedProgrammeOccurrenceId: replacement.id,
                academicYearId: predecessor.academicYearId,
                timeSlotDefinitionId: slotDto.timeSlotDefinitionId,
              },
            });
            if (slotDto.teacherUserIds.length > 0) {
              await tx.plannedSlotStaffing.createMany({
                data: slotDto.teacherUserIds.map((teacherUserId) => ({
                  plannedOccurrenceSlotId: slot.id,
                  teacherUserId,
                })),
              });
            }
          }
        } else if (predecessorWeekday === replacementWeekday && predecessorSlots.length > 0) {
          for (const pSlot of predecessorSlots) {
            const slot = await tx.plannedOccurrenceSlot.create({
              data: {
                plannedProgrammeOccurrenceId: replacement.id,
                academicYearId: predecessor.academicYearId,
                timeSlotDefinitionId: pSlot.timeSlotDefinitionId,
              },
            });
            const slotStaffing = predecessorStaffing.filter((st) => st.plannedOccurrenceSlotId === pSlot.id);
            if (slotStaffing.length > 0) {
              await tx.plannedSlotStaffing.createMany({
                data: slotStaffing.map((st) => ({
                  plannedOccurrenceSlotId: slot.id,
                  teacherUserId: st.teacherUserId,
                })),
              });
            }
          }
        }

        await this.audit.write(
          {
            actorUserId,
            action: 'PLANNED_OCCURRENCE_REPLACEMENT_CREATED',
            entityType: 'PlannedProgrammeOccurrence',
            entityId: replacement.id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              programmeMasterId: predecessor.programmeMasterId,
              replacesOccurrenceId: id,
              changeReason: dto.changeReason.trim(),
            },
          },
          tx,
        );

        return this.fetchOccurrenceRecord(tx, replacement.id);
      },
    );
  }

  async getOccurrence(id: string): Promise<PlannedProgrammeOccurrenceRecord> {
    return this.fetchOccurrenceRecord(this.prisma, id);
  }

  async listOccurrences(query: ListPlannedOccurrencesDto): Promise<PlannedProgrammeOccurrenceRecord[]> {
    const occurrences = await this.prisma.plannedProgrammeOccurrence.findMany({
      where: {
        ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
        ...(query.programmeMasterId ? { programmeMasterId: query.programmeMasterId } : {}),
        ...(query.civilDate ? { civilDate: parseCivilDate(query.civilDate) } : {}),
        ...(query.mode ? { mode: query.mode } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ civilDate: 'asc' }, { createdAt: 'asc' }],
    });

    const occurrenceIds = occurrences.map((o) => o.id);
    const slots = await this.prisma.plannedOccurrenceSlot.findMany({
      where: { plannedProgrammeOccurrenceId: { in: occurrenceIds } },
      orderBy: [{ createdAt: 'asc' }],
    });

    const slotIds = slots.map((s) => s.id);
    const staffing = await this.prisma.plannedSlotStaffing.findMany({
      where: { plannedOccurrenceSlotId: { in: slotIds } },
      orderBy: [{ createdAt: 'asc' }],
    });

    const staffingBySlot = new Map<string, PlannedSlotStaffing[]>();
    for (const st of staffing) {
      const list = staffingBySlot.get(st.plannedOccurrenceSlotId) ?? [];
      list.push(st);
      staffingBySlot.set(st.plannedOccurrenceSlotId, list);
    }

    const slotsByOccurrence = new Map<string, Array<PlannedOccurrenceSlot & { staffing: PlannedSlotStaffing[] }>>();
    for (const s of slots) {
      const list = slotsByOccurrence.get(s.plannedProgrammeOccurrenceId) ?? [];
      list.push({
        ...s,
        staffing: staffingBySlot.get(s.id) ?? [],
      });
      slotsByOccurrence.set(s.plannedProgrammeOccurrenceId, list);
    }

    return occurrences.map((o) =>
      this.toOccurrenceRecord(o, slotsByOccurrence.get(o.id) ?? []),
    );
  }

  // =========================================================================
  // SECTION 4: IDEMPOTENT MUTATION & SERIALIZABLE CONCURRENCY CONTROL
  // =========================================================================

  async mutate<T>(
    actorUserId: string,
    commandId: string,
    commandType: string,
    input: unknown,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const fingerprint = this.fingerprint(input);
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await this.prisma.$transaction(
            async (tx) => {
              const receipt = await tx.programmePlanningCommand.findUnique({
                where: {
                  actorUserId_commandId: { actorUserId, commandId },
                },
              });
              if (receipt) {
                if (receipt.commandType !== commandType || receipt.fingerprint !== fingerprint) {
                  throw new ConflictException(
                    'Idempotency key already used with different command type or payload.',
                  );
                }
                return receipt.result as T;
              }

              const result = await operation(tx);

              await tx.programmePlanningCommand.create({
                data: {
                  actorUserId,
                  commandId,
                  commandType,
                  fingerprint,
                  result: result as Prisma.InputJsonValue,
                },
              });

              return result;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
        } catch (error) {
          if (!this.isRetryableRace(error) || attempt === 3) {
            throw error;
          }
        }
      }
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      if (this.isRetryableRace(error)) {
        throw new ConflictException('A concurrent modification race conflict occurred. Please retry.');
      }
      if (this.isConstraintConflict(error)) {
        throw new ConflictException(this.extractConstraintMessage(error));
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2003', 'P2004', 'P2034'].includes(error.code)
      ) {
        throw new ConflictException(`Database constraint violation [${error.code}].`);
      }
      if (
        error instanceof Prisma.PrismaClientUnknownRequestError &&
        /\b(?:40P01|40001|23505|23503|23514)\b/u.test(error.message)
      ) {
        throw new ConflictException(`Database transaction conflict: ${error.message}`);
      }
      throw error;
    }
    throw new ConflictException('Transaction failed after maximum retry attempts.');
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(this.canonicalJson(value)).digest('hex');
  }

  private canonicalJson(value: unknown): string {
    if (value === null || value === undefined) return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value as Record<string, unknown>).sort();
      return `{${keys
        .map((k) => `${JSON.stringify(k)}:${this.canonicalJson((value as Record<string, unknown>)[k])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private isRetryableRace(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2034';
    if (error instanceof Prisma.PrismaClientUnknownRequestError) {
      return /\b(?:40P01|40001)\b/u.test(error.message);
    }
    const code = (error as { code?: unknown })?.code;
    if (typeof code === 'string' && (code === '40001' || code === '40P01' || code === 'P2034')) {
      return true;
    }
    const message = (error as { message?: unknown })?.message;
    if (typeof message === 'string' && /\b(?:40P01|40001)\b/u.test(message)) {
      return true;
    }
    return false;
  }

  private isConstraintConflict(error: unknown): boolean {
    const message = (error as { message?: unknown })?.message;
    if (typeof message !== 'string') return false;
    return (
      /\b(?:23505|23503|23514|23P01)\b/u.test(message) ||
      /check_violation/u.test(message) ||
      /unique_violation/u.test(message) ||
      /foreign_key_violation/u.test(message)
    );
  }

  private extractConstraintMessage(error: unknown): string {
    const message = (error as { message?: unknown })?.message;
    if (typeof message === 'string') {
      const match = message.match(/RAISE EXCEPTION '(.*?)'/);
      if (match) return match[1];
      return message;
    }
    return 'Database constraint conflict';
  }

  private validateTopicItems(topics: ProgrammeTopicItemInputDto[]): void {
    const sequences = new Set<number>();
    for (const t of topics) {
      if (!t.sequence || t.sequence <= 0 || !Number.isInteger(t.sequence)) {
        throw new BadRequestException('Topic sequence phải là số nguyên dương.');
      }
      if (sequences.has(t.sequence)) {
        throw new BadRequestException(`Trùng lặp sequence ${t.sequence} trong topic items.`);
      }
      sequences.add(t.sequence);
      if (!t.title || t.title.trim() === '') {
        throw new BadRequestException('Topic title không được để trống.');
      }
      if (!t.requiredPeriods || t.requiredPeriods <= 0 || !Number.isInteger(t.requiredPeriods)) {
        throw new BadRequestException('Topic requiredPeriods phải là số nguyên dương.');
      }
      if (t.guidelineWeekFrom !== undefined && t.guidelineWeekFrom !== null) {
        if (t.guidelineWeekFrom <= 0 || !Number.isInteger(t.guidelineWeekFrom)) {
          throw new BadRequestException('guidelineWeekFrom phải là số nguyên dương.');
        }
      }
      if (t.guidelineWeekTo !== undefined && t.guidelineWeekTo !== null) {
        if (t.guidelineWeekTo <= 0 || !Number.isInteger(t.guidelineWeekTo)) {
          throw new BadRequestException('guidelineWeekTo phải là số nguyên dương.');
        }
      }
      if (
        t.guidelineWeekFrom !== undefined &&
        t.guidelineWeekFrom !== null &&
        t.guidelineWeekTo !== undefined &&
        t.guidelineWeekTo !== null
      ) {
        if (t.guidelineWeekTo < t.guidelineWeekFrom) {
          throw new BadRequestException('guidelineWeekTo không được nhỏ hơn guidelineWeekFrom.');
        }
      }
    }
  }

  private async validateOccurrenceContext(
    tx: Prisma.TransactionClient,
    input: {
      programmeMasterId: string;
      programmePlanVersionId: string;
      programmeTopicItemId: string;
      academicYearId: string;
      civilDate: string;
      mode: 'CLASS' | 'GRADE' | 'SCHOOL_WIDE';
      gradeLevel?: number | null;
      schoolClassId?: string | null;
      slots?: PlannedSlotStaffingInputDto[];
    },
  ): Promise<void> {
    if (!isCivilDate(input.civilDate)) {
      throw new BadRequestException('civilDate không đúng định dạng YYYY-MM-DD hợp lệ.');
    }
    const civilDateObj = parseCivilDate(input.civilDate);

    const master = await tx.programmeMaster.findUnique({
      where: { id: input.programmeMasterId },
    });
    if (!master) {
      throw new NotFoundException('ProgrammeMaster không tồn tại.');
    }
    if (master.academicYearId !== input.academicYearId) {
      throw new BadRequestException('academicYearId của occurrence không khớp với master.');
    }

    const planVersion = await tx.programmePlanVersion.findUnique({
      where: { id: input.programmePlanVersionId },
    });
    if (!planVersion) {
      throw new NotFoundException('ProgrammePlanVersion không tồn tại.');
    }
    if (planVersion.programmeMasterId !== input.programmeMasterId) {
      throw new BadRequestException('Plan version không thuộc về ProgrammeMaster đã chỉ định.');
    }
    if (planVersion.status !== 'PUBLISHED') {
      throw new ConflictException('Planned programme occurrences require a PUBLISHED programme plan version.');
    }

    const topic = await tx.programmeTopicItem.findUnique({
      where: { id: input.programmeTopicItemId },
    });
    if (!topic) {
      throw new NotFoundException('ProgrammeTopicItem không tồn tại.');
    }
    if (topic.programmePlanVersionId !== input.programmePlanVersionId) {
      throw new ConflictException('ProgrammeTopicItem không thuộc về plan version đã chọn.');
    }

    const calendar = await tx.academicCalendarVersion.findFirst({
      where: { academicYearId: input.academicYearId, isActive: true },
      select: { startDate: true, endDate: true },
    });
    if (calendar) {
      if (civilDateObj < calendar.startDate || civilDateObj > calendar.endDate) {
        throw new BadRequestException('civilDate nằm ngoài khoảng thời gian của năm học.');
      }
    }

    if (input.mode === 'CLASS') {
      if (!input.schoolClassId || (input.gradeLevel !== null && input.gradeLevel !== undefined)) {
        throw new BadRequestException('CLASS mode bắt buộc schoolClassId và gradeLevel phải null.');
      }
      const schoolClass = await tx.schoolClass.findUnique({
        where: { id: input.schoolClassId },
      });
      if (!schoolClass || schoolClass.academicYearId !== input.academicYearId) {
        throw new NotFoundException('Lớp học không tồn tại hoặc không thuộc năm học này.');
      }
      if (master.kind === 'GDDP' && schoolClass.gradeLevel !== master.gradeLevel) {
        throw new ConflictException('GDDP CLASS occurrence target must belong to the programme master grade.');
      }
    } else if (input.mode === 'GRADE') {
      if (input.schoolClassId || !input.gradeLevel || ![10, 11, 12].includes(input.gradeLevel)) {
        throw new BadRequestException('GRADE mode bắt buộc gradeLevel (10, 11, 12) và schoolClassId phải null.');
      }
      if (master.kind === 'GDDP' && input.gradeLevel !== master.gradeLevel) {
        throw new ConflictException('GDDP GRADE occurrence target must equal the programme master grade.');
      }
    } else if (input.mode === 'SCHOOL_WIDE') {
      if (input.schoolClassId || (input.gradeLevel !== null && input.gradeLevel !== undefined)) {
        throw new BadRequestException('SCHOOL_WIDE mode bắt buộc cả schoolClassId và gradeLevel đều null.');
      }
      if (master.kind === 'GDDP') {
        throw new ConflictException('GDDP occurrence cannot use SCHOOL_WIDE mode.');
      }
    } else {
      throw new BadRequestException('Mode occurrence không hợp lệ.');
    }

    if (input.slots && input.slots.length > 0) {
      await this.validateSlotsAndStaffing(tx, input.academicYearId, civilDateObj, input.slots);
    }
  }

  private async validateSlotsAndStaffing(
    tx: Prisma.TransactionClient,
    academicYearId: string,
    civilDateObj: Date,
    slots: PlannedSlotStaffingInputDto[],
  ): Promise<void> {
    const slotDefIds = slots.map((s) => s.timeSlotDefinitionId);
    if (new Set(slotDefIds).size !== slotDefIds.length) {
      throw new BadRequestException('Duplicate timeSlotDefinitionId in occurrence slots.');
    }

    const expectedWeekday = weekdayForCivilDate(civilDateObj);

    const definitions = await tx.timeSlotDefinition.findMany({
      where: { id: { in: slotDefIds } },
    });
    if (definitions.length !== slotDefIds.length) {
      throw new NotFoundException('Một hoặc nhiều TimeSlotDefinition không tồn tại.');
    }

    for (const def of definitions) {
      if (def.academicYearId !== academicYearId) {
        throw new ConflictException('TimeSlotDefinition không thuộc về cùng academicYear.');
      }
      if (def.weekday !== expectedWeekday) {
        throw new ConflictException('Planned programme slot weekday does not match occurrence civil date.');
      }
      if (!def.isActive) {
        throw new ConflictException('TimeSlotDefinition không ở trạng thái ACTIVE.');
      }
    }

    const allTeacherIds = new Set<string>();
    for (const slot of slots) {
      const perSlotTeacherIds = new Set<string>();
      for (const teacherId of slot.teacherUserIds) {
        if (perSlotTeacherIds.has(teacherId)) {
          throw new BadRequestException(`Duplicate teacher ${teacherId} within slot ${slot.timeSlotDefinitionId}.`);
        }
        perSlotTeacherIds.add(teacherId);
        allTeacherIds.add(teacherId);
      }
    }

    if (allTeacherIds.size > 0) {
      const teachers = await tx.user.findMany({
        where: { id: { in: Array.from(allTeacherIds) } },
        include: { profile: true },
      });
      if (teachers.length !== allTeacherIds.size) {
        throw new NotFoundException('Một hoặc nhiều giáo viên không tồn tại.');
      }
      for (const t of teachers) {
        if (t.status !== 'ACTIVE' || !t.profile || !t.profile.isTeachingStaff) {
          throw new ConflictException(`Giáo viên ${t.username} không phải nhân sự giảng dạy ACTIVE hợp lệ.`);
        }
      }
    }
  }

  private toMasterRecord(master: ProgrammeMaster): ProgrammeMasterRecord {
    return {
      id: master.id,
      academicYearId: master.academicYearId,
      kind: master.kind,
      gradeLevel: master.gradeLevel,
      createdByUserId: master.createdByUserId,
      createdAt: master.createdAt.toISOString(),
      updatedAt: master.updatedAt.toISOString(),
    };
  }

  private toTopicRecord(topic: ProgrammeTopicItem): ProgrammeTopicItemRecord {
    return {
      id: topic.id,
      sequence: topic.sequence,
      title: topic.title,
      requiredPeriods: topic.requiredPeriods,
      guidelineWeekFrom: topic.guidelineWeekFrom,
      guidelineWeekTo: topic.guidelineWeekTo,
      guidelineSegmentLabel: topic.guidelineSegmentLabel,
      createdAt: topic.createdAt.toISOString(),
      updatedAt: topic.updatedAt.toISOString(),
    };
  }

  private toPlanVersionRecord(
    version: ProgrammePlanVersion,
    topics: ProgrammeTopicItem[],
  ): ProgrammePlanVersionRecord {
    return {
      id: version.id,
      programmeMasterId: version.programmeMasterId,
      versionNumber: version.versionNumber,
      status: version.status,
      draftRevision: version.draftRevision,
      predecessorVersionId: version.predecessorVersionId,
      changeReason: version.changeReason,
      createdByUserId: version.createdByUserId,
      publishedByUserId: version.publishedByUserId,
      publishedAt: version.publishedAt ? version.publishedAt.toISOString() : null,
      supersededByUserId: version.supersededByUserId,
      supersededAt: version.supersededAt ? version.supersededAt.toISOString() : null,
      createdAt: version.createdAt.toISOString(),
      updatedAt: version.updatedAt.toISOString(),
      topicItems: topics.map((t) => this.toTopicRecord(t)),
    };
  }

  private async fetchPlanVersionRecord(
    db: Prisma.TransactionClient | PrismaService,
    id: string,
  ): Promise<ProgrammePlanVersionRecord> {
    const version = await db.programmePlanVersion.findUnique({
      where: { id },
    });
    if (!version) {
      throw new NotFoundException('ProgrammePlanVersion không tồn tại.');
    }
    const topics = await db.programmeTopicItem.findMany({
      where: { programmePlanVersionId: id },
      orderBy: { sequence: 'asc' },
    });
    return this.toPlanVersionRecord(version, topics);
  }

  private toOccurrenceRecord(
    occurrence: PlannedProgrammeOccurrence,
    slots: Array<PlannedOccurrenceSlot & { staffing: PlannedSlotStaffing[] }>,
  ): PlannedProgrammeOccurrenceRecord {
    return {
      id: occurrence.id,
      programmeMasterId: occurrence.programmeMasterId,
      programmePlanVersionId: occurrence.programmePlanVersionId,
      programmeTopicItemId: occurrence.programmeTopicItemId,
      academicYearId: occurrence.academicYearId,
      civilDate: formatCivilDate(occurrence.civilDate),
      mode: occurrence.mode,
      gradeLevel: occurrence.gradeLevel,
      schoolClassId: occurrence.schoolClassId,
      status: occurrence.status,
      draftRevision: occurrence.draftRevision,
      note: occurrence.note,
      replacesOccurrenceId: occurrence.replacesOccurrenceId,
      changeReason: occurrence.changeReason,
      createdByUserId: occurrence.createdByUserId,
      publishedByUserId: occurrence.publishedByUserId,
      publishedAt: occurrence.publishedAt ? occurrence.publishedAt.toISOString() : null,
      supersededByUserId: occurrence.supersededByUserId,
      supersededAt: occurrence.supersededAt ? occurrence.supersededAt.toISOString() : null,
      createdAt: occurrence.createdAt.toISOString(),
      updatedAt: occurrence.updatedAt.toISOString(),
      slots: slots.map((s) => ({
        id: s.id,
        plannedProgrammeOccurrenceId: s.plannedProgrammeOccurrenceId,
        academicYearId: s.academicYearId,
        timeSlotDefinitionId: s.timeSlotDefinitionId,
        createdAt: s.createdAt.toISOString(),
        staffing: s.staffing.map((st) => ({
          id: st.id,
          plannedOccurrenceSlotId: st.plannedOccurrenceSlotId,
          teacherUserId: st.teacherUserId,
          createdAt: st.createdAt.toISOString(),
        })),
      })),
    };
  }

  private async fetchOccurrenceRecord(
    db: Prisma.TransactionClient | PrismaService,
    id: string,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    const occurrence = await db.plannedProgrammeOccurrence.findUnique({
      where: { id },
    });
    if (!occurrence) {
      throw new NotFoundException('PlannedProgrammeOccurrence không tồn tại.');
    }
    const slots = await db.plannedOccurrenceSlot.findMany({
      where: { plannedProgrammeOccurrenceId: id },
      orderBy: { createdAt: 'asc' },
    });
    const slotIds = slots.map((s) => s.id);
    const staffing = await db.plannedSlotStaffing.findMany({
      where: { plannedOccurrenceSlotId: { in: slotIds } },
      orderBy: { createdAt: 'asc' },
    });
    const staffingBySlot = new Map<string, PlannedSlotStaffing[]>();
    for (const st of staffing) {
      const list = staffingBySlot.get(st.plannedOccurrenceSlotId) ?? [];
      list.push(st);
      staffingBySlot.set(st.plannedOccurrenceSlotId, list);
    }
    const slotsWithStaffing = slots.map((s) => ({
      ...s,
      staffing: staffingBySlot.get(s.id) ?? [],
    }));
    return this.toOccurrenceRecord(occurrence, slotsWithStaffing);
  }

  // =========================================================================
  // SECTION 5: PROGRAMME RUNTIME BRIDGE & ATTESTATION (P4-040)
  // =========================================================================

  async materializeOccurrence(
    id: string,
    dto: MaterializeOccurrenceDto,
    actorUserId: string,
  ): Promise<ProgrammeMaterializedActivityRecord[]> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'MATERIALIZE_OCCURRENCE',
      { occurrenceId: id, commandId: dto.commandId },
      async (tx) => {
        const occurrence = await tx.plannedProgrammeOccurrence.findUnique({
          where: { id },
        });
        if (!occurrence) {
          throw new NotFoundException('PlannedProgrammeOccurrence không tồn tại.');
        }
        if (occurrence.status !== 'PUBLISHED') {
          throw new ConflictException('Chỉ có thể materialize occurrence ở trạng thái PUBLISHED.');
        }

        const existingMat = await tx.programmeMaterializedActivity.findMany({
          where: { plannedProgrammeOccurrenceId: id },
        });
        if (existingMat.length > 0) {
          throw new ConflictException('Occurrence đã được materialize trước đó.');
        }

        const master = await tx.programmeMaster.findUniqueOrThrow({
          where: { id: occurrence.programmeMasterId },
        });
        const planVersion = await tx.programmePlanVersion.findUniqueOrThrow({
          where: { id: occurrence.programmePlanVersionId },
        });
        const topic = await tx.programmeTopicItem.findUniqueOrThrow({
          where: { id: occurrence.programmeTopicItemId },
        });

        if (planVersion.status === 'DRAFT') {
          throw new ConflictException('Không thể materialize occurrence của bản kế hoạch DRAFT.');
        }
        if (planVersion.programmeMasterId !== master.id) {
          throw new ConflictException('Bản kế hoạch không thuộc về chương trình này.');
        }
        if (topic.programmePlanVersionId !== planVersion.id) {
          throw new ConflictException('Chủ đề không thuộc về bản kế hoạch này.');
        }

        const occurrenceDateStr = formatCivilDate(occurrence.civilDate);
        const businessDateStr = homeroomBusinessDate();
        const isPastOccurrence = occurrenceDateStr < businessDateStr;

        if (!isPastOccurrence) {
          if (planVersion.status !== 'PUBLISHED') {
            throw new ConflictException('Occurrence hiện tại hoặc tương lai yêu cầu bản kế hoạch đang PUBLISHED.');
          }
        } else {
          if (planVersion.status === 'SUPERSEDED' && !planVersion.publishedAt) {
            throw new ConflictException('Bản kế hoạch lịch sử không có bằng chứng đã từng PUBLISHED.');
          }
        }

        const calendar = await tx.academicCalendarVersion.findFirst({
          where: { academicYearId: occurrence.academicYearId, isActive: true },
          select: { id: true, startDate: true, endDate: true },
        });
        if (!calendar) {
          throw new ConflictException('Không tìm thấy phiên lịch học ACTIVE cho năm học.');
        }
        const dateObj = occurrence.civilDate;
        if (dateObj < calendar.startDate || dateObj > calendar.endDate) {
          throw new ConflictException('Ngày diễn ra nằm ngoài khoảng thời gian của phiên lịch học.');
        }

        const slots = await tx.plannedOccurrenceSlot.findMany({
          where: { plannedProgrammeOccurrenceId: id },
          orderBy: { createdAt: 'asc' },
        });
        if (slots.length === 0) {
          throw new ConflictException('Occurrence không có slot nào để materialize.');
        }

        const slotStaffings = await tx.plannedSlotStaffing.findMany({
          where: { plannedOccurrenceSlotId: { in: slots.map((s) => s.id) } },
          orderBy: { createdAt: 'asc' },
        });
        const staffingBySlot = new Map<string, string[]>();
        for (const st of slotStaffings) {
          const list = staffingBySlot.get(st.plannedOccurrenceSlotId) ?? [];
          list.push(st.teacherUserId);
          staffingBySlot.set(st.plannedOccurrenceSlotId, list);
        }
        for (const slot of slots) {
          const teachers = staffingBySlot.get(slot.id) ?? [];
          if (teachers.length === 0 && !(master.kind === 'HDTN_HN' && occurrence.mode === 'CLASS')) {
            throw new ConflictException(`Slot ${slot.timeSlotDefinitionId} không có giáo viên nào được xếp.`);
          }
        }

        let homeroomAssignmentId: string | null = null;
        let homeroomTeacherUserId: string | null = null;
        let isHistoricalRetainedGvcn = false;
        if (master.kind === 'HDTN_HN' && occurrence.mode === 'CLASS') {
          if (!occurrence.schoolClassId) {
            throw new ConflictException('HDTN_HN CLASS mode bắt buộc schoolClassId.');
          }
          const coveringAssignments = await tx.homeroomAssignment.findMany({
            where: {
              academicYearId: occurrence.academicYearId,
              schoolClassId: occurrence.schoolClassId,
              status: 'ACTIVE',
              validFrom: { lte: dateObj },
              OR: [{ validUntil: null }, { validUntil: { gte: dateObj } }],
            },
          });
          const lineageRows = await tx.homeroomAssignment.findMany({
            where: {
              academicYearId: occurrence.academicYearId,
              schoolClassId: occurrence.schoolClassId,
            },
            select: {
              id: true,
              academicYearId: true,
              schoolClassId: true,
              status: true,
              replacesId: true,
              reversedByUserId: true,
              reversedAt: true,
              reversalReason: true,
            },
          });
          const classification = classifyHomeroomResolutionRows(coveringAssignments, lineageRows);
          if (classification.outcome !== 'RESOLVED') {
            if (classification.outcome === 'MISSING') {
              throw new ConflictException('Không tìm thấy phân công chủ nhiệm ACTIVE cho lớp tại ngày diễn ra.');
            }
            if (classification.outcome === 'AMBIGUOUS') {
              throw new ConflictException('Phân công chủ nhiệm của lớp bị chồng lấn không rõ ràng.');
            }
            throw new ConflictException('Dữ liệu phân công chủ nhiệm bị hỏng hoặc bất thường.');
          }
          const resolvedAssignment = classification.assignment;
          const gvcnUser = await tx.user.findUnique({
            where: { id: resolvedAssignment.teacherUserId },
            include: { profile: true },
          });
          if (!gvcnUser || !gvcnUser.profile) {
            throw new ConflictException('Không tìm thấy người dùng hoặc hồ sơ giáo viên chủ nhiệm.');
          }
          const validUntilStr = resolvedAssignment.validUntil
            ? formatCivilDate(resolvedAssignment.validUntil)
            : null;
          isHistoricalRetainedGvcn =
            isPastOccurrence &&
            classifyHomeroomInterval(validUntilStr, businessDateStr) === 'BOUNDED_HISTORICAL';

          if (!isHistoricalRetainedGvcn) {
            if (gvcnUser.status !== 'ACTIVE' || !gvcnUser.profile.isTeachingStaff) {
              throw new ConflictException('Giáo viên chủ nhiệm được phân công không phải nhân sự giảng dạy ACTIVE hợp lệ.');
            }
          }
          homeroomAssignmentId = resolvedAssignment.id;
          homeroomTeacherUserId = resolvedAssignment.teacherUserId;
        }

        const scope: SpecialActivityScope =
          occurrence.mode === 'CLASS'
            ? SpecialActivityScope.CLASS
            : occurrence.mode === 'GRADE'
            ? SpecialActivityScope.GRADE
            : SpecialActivityScope.SCHOOL_WIDE;

        const createdRecords: ProgrammeMaterializedActivityRecord[] = [];
        for (const slot of slots) {
          const scheduledTeacherUserIds =
            master.kind === 'HDTN_HN' && occurrence.mode === 'CLASS'
              ? [homeroomTeacherUserId!]
              : staffingBySlot.get(slot.id)!;
          const requestKey = `mat:${occurrence.id}:${slot.id}`;
          const specialActivity = await this.specialActivities.createMaterializedRoot(tx, {
            academicYearId: occurrence.academicYearId,
            academicCalendarVersionId: calendar.id,
            civilDate: formatCivilDate(occurrence.civilDate),
            scope,
            gradeLevel: occurrence.gradeLevel,
            schoolClassId: occurrence.schoolClassId,
            exactTimeSlotDefinitionIds: [slot.timeSlotDefinitionId],
            scheduledTeacherUserIds,
            title: topic.title,
            note: occurrence.note,
            requestKey,
            actorUserId,
            allowHistoricalStaffing: isHistoricalRetainedGvcn,
          });

          const matRow = await tx.programmeMaterializedActivity.create({
            data: {
              programmeMasterId: master.id,
              programmePlanVersionId: occurrence.programmePlanVersionId,
              programmeTopicItemId: occurrence.programmeTopicItemId,
              plannedProgrammeOccurrenceId: occurrence.id,
              plannedOccurrenceSlotId: slot.id,
              specialActivityId: specialActivity.id,
              homeroomAssignmentId,
              homeroomTeacherUserId,
              materializedByUserId: actorUserId,
            },
          });

          createdRecords.push(this.toMaterializedRecord(matRow, specialActivity));
        }

        await this.audit.write(
          {
            actorUserId,
            action: 'PROGRAMME_OCCURRENCE_MATERIALIZED',
            entityType: 'PlannedProgrammeOccurrence',
            entityId: occurrence.id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              programmeMasterId: master.id,
              occurrenceId: occurrence.id,
              slotCount: slots.length,
              materializedCount: createdRecords.length,
            },
          },
          tx,
        );

        return createdRecords;
      },
    );
  }

  async getOccurrenceMaterialization(id: string): Promise<ProgrammeMaterializedActivityRecord[]> {
    const records = await this.prisma.programmeMaterializedActivity.findMany({
      where: { plannedProgrammeOccurrenceId: id },
      orderBy: { createdAt: 'asc' },
    });
    if (records.length === 0) {
      return [];
    }
    const specialActivityIds = records.map((r) => r.specialActivityId);
    const activities = await this.prisma.specialActivity.findMany({
      where: { id: { in: specialActivityIds } },
      include: {
        timeSlots: true,
        staffing: true,
        classTargets: true,
      },
    });
    const activityMap = new Map(activities.map((a) => [a.id, a]));
    return records.map((r) => this.toMaterializedRecord(r, activityMap.get(r.specialActivityId)));
  }

  async replaceMaterializedSlot(
    id: string,
    dto: ReplaceMaterializedSlotDto,
    actorUserId: string,
  ): Promise<ProgrammeMaterializedActivityRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'REPLACE_MATERIALIZED_SLOT',
      { materializedActivityId: id, ...dto },
      async (tx) => {
        const currentMat = await tx.programmeMaterializedActivity.findUnique({
          where: { id },
        });
        if (!currentMat) {
          throw new NotFoundException('Không tìm thấy bản ghi ProgrammeMaterializedActivity.');
        }

        const oldSpecialActivity = await tx.specialActivity.findUnique({
          where: { id: currentMat.specialActivityId },
        });
        if (!oldSpecialActivity) {
          throw new NotFoundException('Không tìm thấy SpecialActivity tương ứng.');
        }
        if (oldSpecialActivity.status !== 'ACTIVE') {
          throw new ConflictException('Chỉ có thể thay thế root SpecialActivity đang ở trạng thái ACTIVE.');
        }

        const topic = await tx.programmeTopicItem.findUniqueOrThrow({
          where: { id: currentMat.programmeTopicItemId },
        });
        const slot = await tx.plannedOccurrenceSlot.findUniqueOrThrow({
          where: { id: currentMat.plannedOccurrenceSlotId },
        });

        const teacherIds = [...new Set(dto.replacementTeacherUserIds)].sort();
        if (teacherIds.length === 0) {
          throw new BadRequestException('replacementTeacherUserIds không được để trống.');
        }

        const reverseKey = `rev-mat:${oldSpecialActivity.id}:${dto.commandId}`;
        await this.specialActivities.reverseMaterializedRoot(tx, {
          id: oldSpecialActivity.id,
          expectedUpdatedAt: dto.expectedUpdatedAt,
          reversalReason: dto.reversalReason,
          requestKey: reverseKey,
          actorUserId,
        });

        const createKey = `rep-mat:${oldSpecialActivity.id}:${dto.commandId}`;
        const replacementRoot = await this.specialActivities.createMaterializedRoot(tx, {
          academicYearId: oldSpecialActivity.academicYearId,
          academicCalendarVersionId: oldSpecialActivity.academicCalendarVersionId,
          civilDate: formatCivilDate(oldSpecialActivity.civilDate),
          scope: oldSpecialActivity.scope,
          gradeLevel: oldSpecialActivity.gradeLevel,
          schoolClassId: oldSpecialActivity.schoolClassId,
          exactTimeSlotDefinitionIds: [slot.timeSlotDefinitionId],
          scheduledTeacherUserIds: teacherIds,
          title: topic.title,
          note: dto.note ?? oldSpecialActivity.note,
          replacesId: oldSpecialActivity.id,
          requestKey: createKey,
          actorUserId,
        });

        const newMat = await tx.programmeMaterializedActivity.create({
          data: {
            programmeMasterId: currentMat.programmeMasterId,
            programmePlanVersionId: currentMat.programmePlanVersionId,
            programmeTopicItemId: currentMat.programmeTopicItemId,
            plannedProgrammeOccurrenceId: currentMat.plannedProgrammeOccurrenceId,
            plannedOccurrenceSlotId: currentMat.plannedOccurrenceSlotId,
            specialActivityId: replacementRoot.id,
            homeroomAssignmentId: currentMat.homeroomAssignmentId,
            homeroomTeacherUserId: currentMat.homeroomTeacherUserId,
            materializedByUserId: actorUserId,
          },
        });

        await this.audit.write(
          {
            actorUserId,
            action: 'MATERIALIZED_SLOT_REPLACED',
            entityType: 'ProgrammeMaterializedActivity',
            entityId: newMat.id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              previousMaterializedActivityId: currentMat.id,
              previousSpecialActivityId: oldSpecialActivity.id,
              replacementSpecialActivityId: replacementRoot.id,
              replacesId: oldSpecialActivity.id,
              replacementTeacherUserIds: teacherIds,
            },
          },
          tx,
        );

        return this.toMaterializedRecord(newMat, replacementRoot);
      },
    );
  }

  async attestOccurrence(
    id: string,
    dto: AttestOccurrenceDto,
    actorUserId: string,
    authDecision: ProgrammeAuthorityDecision,
  ): Promise<ProgrammeOccurrenceAttestationRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'ATTEST_OCCURRENCE',
      { occurrenceId: id, commandId: dto.commandId },
      async (tx) => {
        const occurrence = await tx.plannedProgrammeOccurrence.findUnique({
          where: { id },
        });
        if (!occurrence) {
          throw new NotFoundException('PlannedProgrammeOccurrence không tồn tại.');
        }
        if (occurrence.status !== 'PUBLISHED') {
          throw new ConflictException('Chỉ có thể xác nhận (attest) occurrence ở trạng thái PUBLISHED.');
        }

        const existingActive = await tx.programmeOccurrenceAttestation.findFirst({
          where: {
            plannedProgrammeOccurrenceId: id,
            attestedByUserId: actorUserId,
            status: 'ACTIVE',
          },
        });
        if (existingActive) {
          throw new ConflictException('Người dùng đã xác nhận thực hiện cho occurrence này.');
        }

        const attestationFingerprint = this.fingerprint({
          occurrenceId: id,
          actorUserId,
          commandId: dto.commandId,
        });

        const attestation = await tx.programmeOccurrenceAttestation.create({
          data: {
            programmeMasterId: occurrence.programmeMasterId,
            plannedProgrammeOccurrenceId: occurrence.id,
            attestedByUserId: actorUserId,
            authorityType: authDecision.authorityType!,
            capabilityKey: authDecision.capabilityKey!,
            scope: authDecision.scope!,
            scopeResourceId: authDecision.resourceId ?? null,
            status: 'ACTIVE',
            createRequestKey: dto.commandId,
            createRequestFingerprint: attestationFingerprint,
          },
        });

        await this.audit.write(
          {
            actorUserId,
            action: 'PROGRAMME_OCCURRENCE_ATTESTED',
            entityType: 'ProgrammeOccurrenceAttestation',
            entityId: attestation.id,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              occurrenceId: occurrence.id,
              programmeMasterId: occurrence.programmeMasterId,
              authorityType: attestation.authorityType,
              capabilityKey: attestation.capabilityKey,
            },
          },
          tx,
        );

        return this.toAttestationRecord(attestation);
      },
    );
  }

  async reverseAttestation(
    attestationId: string,
    dto: ReverseAttestationDto,
    actorUserId: string,
  ): Promise<ProgrammeOccurrenceAttestationRecord> {
    return this.mutate(
      actorUserId,
      dto.commandId,
      'REVERSE_ATTESTATION',
      { attestationId, ...dto },
      async (tx) => {
        const attestation = await tx.programmeOccurrenceAttestation.findUnique({
          where: { id: attestationId },
        });
        if (!attestation) {
          throw new NotFoundException('ProgrammeOccurrenceAttestation không tồn tại.');
        }
        if (attestation.status !== 'ACTIVE') {
          throw new ConflictException('Attestation không ở trạng thái ACTIVE.');
        }

        const expectedDate = new Date(dto.expectedUpdatedAt);
        const now = new Date();
        const reverseFingerprint = this.fingerprint({
          attestationId,
          expectedUpdatedAt: dto.expectedUpdatedAt,
          reversalReason: dto.reversalReason.trim(),
          commandId: dto.commandId,
        });

        const updated = await tx.programmeOccurrenceAttestation.updateMany({
          where: {
            id: attestationId,
            status: 'ACTIVE',
            updatedAt: expectedDate,
          },
          data: {
            status: 'REVERSED',
            reversedByUserId: actorUserId,
            reversedAt: now,
            reversalReason: dto.reversalReason.trim(),
            reverseRequestKey: dto.commandId,
            reverseRequestFingerprint: reverseFingerprint,
            updatedAt: now,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('Attestation đã thay đổi hoặc đã bị đảo ngược trước đó.');
        }

        const row = await tx.programmeOccurrenceAttestation.findUniqueOrThrow({
          where: { id: attestationId },
        });

        await this.audit.write(
          {
            actorUserId,
            action: 'PROGRAMME_ATTESTATION_REVERSED',
            entityType: 'ProgrammeOccurrenceAttestation',
            entityId: attestationId,
            result: AuditResult.SUCCESS,
            metadata: {
              commandId: dto.commandId,
              occurrenceId: row.plannedProgrammeOccurrenceId,
              reversalReason: dto.reversalReason.trim(),
            },
          },
          tx,
        );

        return this.toAttestationRecord(row);
      },
    );
  }

  async listOccurrenceAttestations(
    occurrenceId: string,
  ): Promise<ProgrammeOccurrenceAttestationsListResponse> {
    const rows = await this.prisma.programmeOccurrenceAttestation.findMany({
      where: { plannedProgrammeOccurrenceId: occurrenceId },
      orderBy: { createdAt: 'asc' },
    });
    const items = rows.map((r) => this.toAttestationRecord(r));
    return {
      items,
      hasQualifyingNonReversedAttestation: items.some((a) => a.status === 'ACTIVE'),
      activeAttestationCount: items.filter((a) => a.status === 'ACTIVE').length,
    };
  }

  async hasQualifyingNonReversedAttestation(occurrenceId: string): Promise<boolean> {
    const count = await this.prisma.programmeOccurrenceAttestation.count({
      where: { plannedProgrammeOccurrenceId: occurrenceId, status: 'ACTIVE' },
    });
    return count > 0;
  }

  private toMaterializedRecord(
    row: ProgrammeMaterializedActivity,
    specialActivity?: SpecialActivity & {
      timeSlots?: Array<{ timeSlotDefinitionId: string }>;
      staffing?: Array<{ scheduledTeacherUserId: string }>;
      classTargets?: Array<{ schoolClassId: string }>;
    },
  ): ProgrammeMaterializedActivityRecord {
    return {
      id: row.id,
      programmeMasterId: row.programmeMasterId,
      programmePlanVersionId: row.programmePlanVersionId,
      programmeTopicItemId: row.programmeTopicItemId,
      plannedProgrammeOccurrenceId: row.plannedProgrammeOccurrenceId,
      plannedOccurrenceSlotId: row.plannedOccurrenceSlotId,
      specialActivityId: row.specialActivityId,
      homeroomAssignmentId: row.homeroomAssignmentId,
      homeroomTeacherUserId: row.homeroomTeacherUserId,
      materializedByUserId: row.materializedByUserId,
      materializedAt: row.materializedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      specialActivity: specialActivity
        ? {
            id: specialActivity.id,
            status: specialActivity.status,
            title: specialActivity.title,
            civilDate: formatCivilDate(specialActivity.civilDate),
            scope: specialActivity.scope,
            gradeLevel: specialActivity.gradeLevel,
            schoolClassId: specialActivity.schoolClassId,
            replacesId: specialActivity.replacesId,
            scheduledTeacherUserIds: specialActivity.staffing?.map((s) => s.scheduledTeacherUserId) ?? [],
            exactTimeSlotDefinitionIds: specialActivity.timeSlots?.map((s) => s.timeSlotDefinitionId) ?? [],
          }
        : undefined,
    };
  }

  private toAttestationRecord(
    row: ProgrammeOccurrenceAttestation,
  ): ProgrammeOccurrenceAttestationRecord {
    return {
      id: row.id,
      programmeMasterId: row.programmeMasterId,
      plannedProgrammeOccurrenceId: row.plannedProgrammeOccurrenceId,
      attestedByUserId: row.attestedByUserId,
      authorityType: row.authorityType,
      capabilityKey: row.capabilityKey,
      scope: row.scope,
      scopeResourceId: row.scopeResourceId,
      status: row.status,
      attestedAt: row.attestedAt.toISOString(),
      reversedByUserId: row.reversedByUserId,
      reversedAt: row.reversedAt ? row.reversedAt.toISOString() : null,
      reversalReason: row.reversalReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
