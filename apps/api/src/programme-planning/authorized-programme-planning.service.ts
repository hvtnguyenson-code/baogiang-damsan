import { Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDraftOccurrenceDto,
  CreateDraftPlanVersionDto,
  CreateProgrammeMasterDto,
  CreateReplacementOccurrenceDto,
  CreateSuccessorDraftPlanVersionDto,
  EditDraftOccurrenceDto,
  EditDraftPlanVersionDto,
  ListPlannedOccurrencesDto,
  ListProgrammeMastersDto,
  PlannedProgrammeOccurrenceRecord,
  ProgrammeMasterRecord,
  ProgrammePlanVersionRecord,
  PublishOccurrenceDto,
  PublishPlanVersionDto,
  ReplaceOccurrenceSlotsStaffingDto,
} from './dto';
import {
  ProgrammeAuditContext,
  ProgrammePlanningAuthorizationService,
} from './programme-planning-authorization.service';
import { ProgrammePlanningService } from './programme-planning.service';

@Injectable()
export class AuthorizedProgrammePlanningService {
  constructor(
    private readonly service: ProgrammePlanningService,
    private readonly authService: ProgrammePlanningAuthorizationService,
    private readonly authorization: CapabilityAuthorizationService,
    private readonly prisma: PrismaService,
  ) {}

  // =========================================================================
  // PROGRAMME MASTER
  // =========================================================================

  async createMaster(
    dto: CreateProgrammeMasterDto,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<ProgrammeMasterRecord> {
    await this.authService.requireBghAuthority(actorUserId, auditContext);
    return this.service.createMaster(dto, actorUserId);
  }

  async getMaster(
    id: string,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<ProgrammeMasterRecord> {
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.getMaster(id);
  }

  async listMasters(
    query: ListProgrammeMastersDto,
    actorUserId: string,
  ): Promise<ProgrammeMasterRecord[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { status: true, mustChangePassword: true, lockedUntil: true },
    });
    const isUserValid =
      user &&
      user.status === 'ACTIVE' &&
      !user.mustChangePassword &&
      (!user.lockedUntil || user.lockedUntil <= new Date());

    let isBgh = false;
    if (isUserValid) {
      const principal = await this.authorization.evaluate({
        userId: actorUserId,
        capabilityKey: 'APPROVAL_PRINCIPAL',
        requestedScope: 'SCHOOL_WIDE',
      });
      if (principal.allowed) {
        isBgh = true;
      } else {
        const vicePrincipal = await this.authorization.evaluate({
          userId: actorUserId,
          capabilityKey: 'APPROVAL_VICE_PRINCIPAL',
          requestedScope: 'SCHOOL_WIDE',
        });
        if (vicePrincipal.allowed) {
          isBgh = true;
        }
      }
    }

    const allMasters = await this.service.listMasters(query);
    if (isBgh) {
      return allMasters;
    }

    if (!isUserValid) {
      return [];
    }

    // Filter to only masters where actor has coordinator authority
    const authorizedMasters: ProgrammeMasterRecord[] = [];
    for (const master of allMasters) {
      const decision = await this.authService.resolveProgrammeAuthority(actorUserId, master);
      if (decision.qualified) {
        authorizedMasters.push(master);
      }
    }
    return authorizedMasters;
  }

  // =========================================================================
  // PROGRAMME PLAN VERSION
  // =========================================================================

  async createDraftPlanVersion(
    dto: CreateDraftPlanVersionDto,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<ProgrammePlanVersionRecord> {
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: dto.programmeMasterId },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.createDraftPlanVersion(dto, actorUserId);
  }

  async createSuccessorDraftPlanVersion(
    dto: CreateSuccessorDraftPlanVersionDto,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<ProgrammePlanVersionRecord> {
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: dto.programmeMasterId },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.createSuccessorDraftPlanVersion(dto, actorUserId);
  }

  async editDraftPlanVersion(
    id: string,
    dto: EditDraftPlanVersionDto,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<ProgrammePlanVersionRecord> {
    const plan = await this.prisma.programmePlanVersion.findUnique({
      where: { id },
      select: { programmeMasterId: true },
    });
    if (!plan) {
      throw new NotFoundException('Không tìm thấy phiên bản kế hoạch.');
    }
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: plan.programmeMasterId },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.editDraftPlanVersion(id, dto, actorUserId);
  }

  async publishPlanVersion(
    id: string,
    dto: PublishPlanVersionDto,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<ProgrammePlanVersionRecord> {
    const plan = await this.prisma.programmePlanVersion.findUnique({
      where: { id },
      select: { programmeMasterId: true },
    });
    if (!plan) {
      throw new NotFoundException('Không tìm thấy phiên bản kế hoạch.');
    }
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: plan.programmeMasterId },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.publishPlanVersion(id, dto, actorUserId);
  }

  async getPlanVersion(
    id: string,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<ProgrammePlanVersionRecord> {
    const plan = await this.prisma.programmePlanVersion.findUnique({
      where: { id },
      select: { programmeMasterId: true },
    });
    if (!plan) {
      throw new NotFoundException('Không tìm thấy phiên bản kế hoạch.');
    }
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: plan.programmeMasterId },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.getPlanVersion(id);
  }

  async listPlanVersions(
    programmeMasterId: string,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<ProgrammePlanVersionRecord[]> {
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: programmeMasterId },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.listPlanVersions(programmeMasterId);
  }

  // =========================================================================
  // PLANNED PROGRAMME OCCURRENCES
  // =========================================================================

  async createDraftOccurrence(
    dto: CreateDraftOccurrenceDto,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: dto.programmeMasterId },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.createDraftOccurrence(dto, actorUserId);
  }

  async editDraftOccurrence(
    id: string,
    dto: EditDraftOccurrenceDto,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    const occurrence = await this.prisma.plannedProgrammeOccurrence.findUnique({
      where: { id },
      select: { programmeMasterId: true },
    });
    if (!occurrence) {
      throw new NotFoundException('Không tìm thấy buổi hoạt động.');
    }
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: occurrence.programmeMasterId },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.editDraftOccurrence(id, dto, actorUserId);
  }

  async replaceOccurrenceSlotsAndStaffing(
    id: string,
    dto: ReplaceOccurrenceSlotsStaffingDto,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    const occurrence = await this.prisma.plannedProgrammeOccurrence.findUnique({
      where: { id },
      select: { programmeMasterId: true },
    });
    if (!occurrence) {
      throw new NotFoundException('Không tìm thấy buổi hoạt động.');
    }
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: occurrence.programmeMasterId },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.replaceOccurrenceSlotsAndStaffing(id, dto, actorUserId);
  }

  async publishOccurrence(
    id: string,
    dto: PublishOccurrenceDto,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    const occurrence = await this.prisma.plannedProgrammeOccurrence.findUnique({
      where: { id },
      select: { programmeMasterId: true },
    });
    if (!occurrence) {
      throw new NotFoundException('Không tìm thấy buổi hoạt động.');
    }
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: occurrence.programmeMasterId },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.publishOccurrence(id, dto, actorUserId);
  }

  async createReplacementOccurrence(
    id: string,
    dto: CreateReplacementOccurrenceDto,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    const replaced = await this.prisma.plannedProgrammeOccurrence.findUnique({
      where: { id },
      select: { programmeMasterId: true },
    });
    if (!replaced) {
      throw new NotFoundException('Không tìm thấy buổi hoạt động cần thay thế.');
    }
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: replaced.programmeMasterId },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.createReplacementOccurrence(id, dto, actorUserId);
  }

  async getOccurrence(
    id: string,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<PlannedProgrammeOccurrenceRecord> {
    const occurrence = await this.prisma.plannedProgrammeOccurrence.findUnique({
      where: { id },
      select: { programmeMasterId: true },
    });
    if (!occurrence) {
      throw new NotFoundException('Không tìm thấy buổi hoạt động.');
    }
    const master = await this.prisma.programmeMaster.findUnique({
      where: { id: occurrence.programmeMasterId },
      select: { id: true, kind: true },
    });
    if (!master) {
      throw new NotFoundException('Không tìm thấy chương trình.');
    }
    await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
    return this.service.getOccurrence(id);
  }

  async listOccurrences(
    query: ListPlannedOccurrencesDto,
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
  ): Promise<PlannedProgrammeOccurrenceRecord[]> {
    if (query.programmeMasterId) {
      const master = await this.prisma.programmeMaster.findUnique({
        where: { id: query.programmeMasterId },
        select: { id: true, kind: true },
      });
      if (!master) {
        throw new NotFoundException('Không tìm thấy chương trình.');
      }
      await this.authService.requireProgrammeAuthority(actorUserId, master, auditContext);
      return this.service.listOccurrences(query);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { status: true, mustChangePassword: true, lockedUntil: true },
    });
    const isUserValid =
      user &&
      user.status === 'ACTIVE' &&
      !user.mustChangePassword &&
      (!user.lockedUntil || user.lockedUntil <= new Date());

    let isBgh = false;
    if (isUserValid) {
      const principal = await this.authorization.evaluate({
        userId: actorUserId,
        capabilityKey: 'APPROVAL_PRINCIPAL',
        requestedScope: 'SCHOOL_WIDE',
      });
      if (principal.allowed) {
        isBgh = true;
      } else {
        const vicePrincipal = await this.authorization.evaluate({
          userId: actorUserId,
          capabilityKey: 'APPROVAL_VICE_PRINCIPAL',
          requestedScope: 'SCHOOL_WIDE',
        });
        if (vicePrincipal.allowed) {
          isBgh = true;
        }
      }
    }

    const occurrences = await this.service.listOccurrences(query);
    if (isBgh) {
      return occurrences;
    }

    if (!isUserValid) {
      return [];
    }

    // Filter occurrences by authorized masters
    const masterCache = new Map<string, boolean>();
    const authorizedOccurrences: PlannedProgrammeOccurrenceRecord[] = [];
    for (const occ of occurrences) {
      let allowed = masterCache.get(occ.programmeMasterId);
      if (allowed === undefined) {
        const master = await this.prisma.programmeMaster.findUnique({
          where: { id: occ.programmeMasterId },
          select: { id: true, kind: true },
        });
        if (master) {
          const decision = await this.authService.resolveProgrammeAuthority(actorUserId, master);
          allowed = decision.qualified;
        } else {
          allowed = false;
        }
        masterCache.set(occ.programmeMasterId, allowed);
      }
      if (allowed) {
        authorizedOccurrences.push(occ);
      }
    }
    return authorizedOccurrences;
  }
}
