import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ProgrammeKind } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';
import { PrismaService } from '../prisma/prisma.service';

export type ProgrammeAuthorityType = 'COORDINATOR' | 'BGH_PRINCIPAL' | 'BGH_VICE_PRINCIPAL';

export interface ProgrammeAuthorityDecision {
  qualified: boolean;
  authorityType?: ProgrammeAuthorityType;
  capabilityKey?: string;
  scope?: string;
  resourceId?: string | null;
  reasonCode?: string;
}

export interface ProgrammeAuditContext {
  route?: string;
  method?: string;
}

@Injectable()
export class ProgrammePlanningAuthorizationService {
  private readonly logger = new Logger(ProgrammePlanningAuthorizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: CapabilityAuthorizationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Deterministic resolution of programme authority for an exact ProgrammeMaster.
   * Precedence order:
   * 1. Exact programme coordinator (GDDP_COORDINATOR for GDDP, HĐTN_COORDINATOR for HDTN_HN);
   * 2. APPROVAL_PRINCIPAL / SCHOOL_WIDE;
   * 3. APPROVAL_VICE_PRINCIPAL / SCHOOL_WIDE.
   * Fail-closed on mustChangePassword === true, inactive status, or lock.
   */
  async resolveProgrammeAuthority(
    actorUserId: string,
    master: { id: string; kind: ProgrammeKind },
    atTime?: Date,
  ): Promise<ProgrammeAuthorityDecision> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { status: true, mustChangePassword: true, lockedUntil: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      return { qualified: false, reasonCode: 'USER_INACTIVE' };
    }
    if (user.mustChangePassword) {
      return { qualified: false, reasonCode: 'PASSWORD_CHANGE_REQUIRED' };
    }
    const evalTime = atTime ?? new Date();
    if (user.lockedUntil && user.lockedUntil > evalTime) {
      return { qualified: false, reasonCode: 'USER_LOCKED' };
    }

    const coordinatorKey = master.kind === 'GDDP' ? 'GDDP_COORDINATOR' : 'HĐTN_COORDINATOR';

    // 1. Coordinator check: ACTIVITY scope with exact ProgrammeMaster.id
    const coordinatorDecision = await this.authorization.evaluate({
      userId: actorUserId,
      capabilityKey: coordinatorKey,
      requestedScope: 'ACTIVITY',
      resourceId: master.id,
      atTime: evalTime,
    });
    if (coordinatorDecision.allowed) {
      return {
        qualified: true,
        authorityType: 'COORDINATOR',
        capabilityKey: coordinatorKey,
        scope: 'ACTIVITY',
        resourceId: master.id,
        reasonCode: 'ALLOWED',
      };
    }

    // 2. BGH Principal check: APPROVAL_PRINCIPAL / SCHOOL_WIDE
    const principalDecision = await this.authorization.evaluate({
      userId: actorUserId,
      capabilityKey: 'APPROVAL_PRINCIPAL',
      requestedScope: 'SCHOOL_WIDE',
      atTime: evalTime,
    });
    if (principalDecision.allowed) {
      return {
        qualified: true,
        authorityType: 'BGH_PRINCIPAL',
        capabilityKey: 'APPROVAL_PRINCIPAL',
        scope: 'SCHOOL_WIDE',
        resourceId: null,
        reasonCode: 'ALLOWED',
      };
    }

    // 3. BGH Vice Principal check: APPROVAL_VICE_PRINCIPAL / SCHOOL_WIDE
    const vicePrincipalDecision = await this.authorization.evaluate({
      userId: actorUserId,
      capabilityKey: 'APPROVAL_VICE_PRINCIPAL',
      requestedScope: 'SCHOOL_WIDE',
      atTime: evalTime,
    });
    if (vicePrincipalDecision.allowed) {
      return {
        qualified: true,
        authorityType: 'BGH_VICE_PRINCIPAL',
        capabilityKey: 'APPROVAL_VICE_PRINCIPAL',
        scope: 'SCHOOL_WIDE',
        resourceId: null,
        reasonCode: 'ALLOWED',
      };
    }

    return {
      qualified: false,
      reasonCode: coordinatorDecision.reasonCode ?? 'FORBIDDEN',
    };
  }

  /**
   * Asserts programme authority or throws ForbiddenException with denial audit.
   */
  async requireProgrammeAuthority(
    actorUserId: string,
    master: { id: string; kind: ProgrammeKind },
    auditContext?: ProgrammeAuditContext,
    atTime?: Date,
  ): Promise<ProgrammeAuthorityDecision> {
    const decision = await this.resolveProgrammeAuthority(actorUserId, master, atTime);
    if (decision.qualified) {
      return decision;
    }

    const coordinatorKey = master.kind === 'GDDP' ? 'GDDP_COORDINATOR' : 'HĐTN_COORDINATOR';
    try {
      await this.audit.write({
        actorUserId,
        action: 'AUTHORIZATION_DENIED',
        entityType: 'CapabilityDefinition',
        entityId: coordinatorKey,
        result: 'DENIED',
        metadata: {
          capabilityKey: coordinatorKey,
          scope: 'ACTIVITY',
          resourceId: master.id,
          reasonCode: decision.reasonCode ?? 'FORBIDDEN',
          route: auditContext?.route,
          method: auditContext?.method,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to persist programme authorization denial audit: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
  }

  /**
   * Asserts BGH professional authority for bootstrap ProgrammeMaster creation.
   * Only APPROVAL_PRINCIPAL or APPROVAL_VICE_PRINCIPAL with SCHOOL_WIDE scope qualifies.
   */
  async requireBghAuthority(
    actorUserId: string,
    auditContext?: ProgrammeAuditContext,
    atTime?: Date,
  ): Promise<{ authorityType: 'BGH_PRINCIPAL' | 'BGH_VICE_PRINCIPAL'; capabilityKey: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { status: true, mustChangePassword: true, lockedUntil: true },
    });

    const evalTime = atTime ?? new Date();
    const isUserValid = user && user.status === 'ACTIVE' && !user.mustChangePassword && (!user.lockedUntil || user.lockedUntil <= evalTime);

    if (isUserValid) {
      const principal = await this.authorization.evaluate({
        userId: actorUserId,
        capabilityKey: 'APPROVAL_PRINCIPAL',
        requestedScope: 'SCHOOL_WIDE',
        atTime: evalTime,
      });
      if (principal.allowed) {
        return { authorityType: 'BGH_PRINCIPAL', capabilityKey: 'APPROVAL_PRINCIPAL' };
      }

      const vicePrincipal = await this.authorization.evaluate({
        userId: actorUserId,
        capabilityKey: 'APPROVAL_VICE_PRINCIPAL',
        requestedScope: 'SCHOOL_WIDE',
        atTime: evalTime,
      });
      if (vicePrincipal.allowed) {
        return { authorityType: 'BGH_VICE_PRINCIPAL', capabilityKey: 'APPROVAL_VICE_PRINCIPAL' };
      }
    }

    try {
      await this.audit.write({
        actorUserId,
        action: 'AUTHORIZATION_DENIED',
        entityType: 'CapabilityDefinition',
        entityId: 'APPROVAL_PRINCIPAL',
        result: 'DENIED',
        metadata: {
          capabilityKey: 'APPROVAL_PRINCIPAL',
          scope: 'SCHOOL_WIDE',
          reasonCode: user?.mustChangePassword ? 'PASSWORD_CHANGE_REQUIRED' : 'FORBIDDEN',
          route: auditContext?.route,
          method: auditContext?.method,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to persist BGH authorization denial audit: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
  }

  /**
   * Qualification seam for P4-040 attestation validation.
   * Returns provenance information without persisting any attestation record.
   */
  async isQualifyingProgrammeAttestor(
    actorUserId: string,
    master: { id: string; kind: ProgrammeKind },
    atTime?: Date,
  ): Promise<ProgrammeAuthorityDecision> {
    return this.resolveProgrammeAuthority(actorUserId, master, atTime);
  }
}
