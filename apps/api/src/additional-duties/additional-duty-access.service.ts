import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma, StaffAdditionalDutyAssignment } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';
import { AuthorizationReasonCode } from '../authorization/authorization.types';
import { DutyAssignmentScope, ListDutyAssignmentsDto } from './dto';

type AssignmentScope = Pick<StaffAdditionalDutyAssignment, 'scopeType' | 'scopeResourceId'>;

@Injectable()
export class AdditionalDutyAccessService {
  private readonly logger = new Logger(AdditionalDutyAccessService.name);

  constructor(private readonly authorization: CapabilityAuthorizationService, private readonly audit: AuditService) {}

  async requireOptions(request: AuthenticatedRequest): Promise<void> {
    await this.requirePasswordChanged(request);
    const userId = request.auth!.user.id;
    const catalog = await this.authorization.evaluate({ userId, capabilityKey: 'ADDITIONAL_DUTY_CATALOG_MANAGE', requestedScope: 'SCHOOL_WIDE' });
    if (catalog.allowed) return;
    const capabilities = await this.authorization.listEffectiveCapabilities(userId);
    if (capabilities.some((capability) => capability.key === 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE' && (capability.scope === 'SCHOOL_WIDE' || capability.scope === 'SUBJECT_GROUP'))) return;
    await this.deny(request, 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', 'SCHOOL_WIDE', undefined, catalog.reasonCode);
  }

  async requireCreate(request: AuthenticatedRequest, scopeType: DutyAssignmentScope, scopeResourceId?: string): Promise<void> {
    await this.requirePasswordChanged(request);
    await this.requireScope(request, scopeType, scopeResourceId);
  }

  async assignmentRestriction(request: AuthenticatedRequest, query: ListDutyAssignmentsDto): Promise<Prisma.StaffAdditionalDutyAssignmentWhereInput> {
    await this.requirePasswordChanged(request);
    const userId = request.auth!.user.id;
    const capabilities = await this.authorization.listEffectiveCapabilities(userId);
    const relevant = capabilities.filter((capability) => capability.key === 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE');
    if (relevant.some((capability) => capability.scope === 'SCHOOL_WIDE')) return {};
    const groupIds = relevant
      .filter((capability) => capability.scope === 'SUBJECT_GROUP' && capability.resourceId)
      .map((capability) => capability.resourceId!);
    if (groupIds.length === 0) await this.deny(request, 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', query.scopeType ?? 'SCHOOL_WIDE', query.scopeResourceId, 'GRANT_NOT_FOUND');
    if (query.scopeType === 'SCHOOL_WIDE') await this.deny(request, 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', 'SCHOOL_WIDE', undefined, 'GRANT_NOT_FOUND');
    if (query.scopeResourceId && !groupIds.includes(query.scopeResourceId)) {
      await this.deny(request, 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', 'SUBJECT_GROUP', query.scopeResourceId, 'GRANT_NOT_FOUND');
    }
    return { scopeType: 'SUBJECT_GROUP', scopeResourceId: { in: groupIds } };
  }

  async requirePersisted(request: AuthenticatedRequest, assignment: AssignmentScope): Promise<void> {
    await this.requirePasswordChanged(request);
    await this.requireScope(request, assignment.scopeType as DutyAssignmentScope, assignment.scopeResourceId ?? undefined);
  }

  private async requirePasswordChanged(request: AuthenticatedRequest): Promise<void> {
    if (request.auth?.user.mustChangePassword) {
      await this.deny(request, 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', 'SCHOOL_WIDE', undefined, 'PASSWORD_CHANGE_REQUIRED');
    }
  }

  private async requireScope(request: AuthenticatedRequest, scopeType: DutyAssignmentScope, scopeResourceId?: string): Promise<void> {
    const decision = await this.authorization.evaluate({
      userId: request.auth!.user.id,
      capabilityKey: 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE',
      requestedScope: scopeType,
      ...(scopeResourceId ? { resourceId: scopeResourceId } : {}),
    });
    if (!decision.allowed) await this.deny(request, 'ADDITIONAL_DUTY_ASSIGNMENT_MANAGE', scopeType, scopeResourceId, decision.reasonCode);
  }

  private async deny(request: AuthenticatedRequest, capabilityKey: string, scope: DutyAssignmentScope, resourceId: string | undefined, reasonCode: AuthorizationReasonCode): Promise<never> {
    try {
      await this.audit.write({
        actorUserId: request.auth?.user.id,
        action: 'AUTHORIZATION_DENIED',
        entityType: 'CapabilityDefinition',
        entityId: capabilityKey,
        requestId: typeof request.headers?.['x-request-id'] === 'string' ? request.headers['x-request-id'] : undefined,
        result: 'DENIED',
        metadata: { capabilityKey, scope, ...(resourceId ? { resourceId } : {}), reasonCode, route: request.route?.path ?? request.path, method: request.method },
      });
    } catch (error) {
      this.logger.error(`Failed to persist authorization denial audit: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
  }
}
