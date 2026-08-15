import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';
import { AuthorizationReasonCode } from '../authorization/authorization.types';

type OverlayCapability = 'CALENDAR_EXCEPTION_MANAGE' | 'TEACHING_OPERATION_MANAGE';

@Injectable()
export class OperationalOverlayAccessService {
  private readonly logger = new Logger(OperationalOverlayAccessService.name);
  constructor(private readonly authorization: CapabilityAuthorizationService, private readonly audit: AuditService) {}

  requireCalendar(request: AuthenticatedRequest): Promise<void> {
    return this.require(request, 'CALENDAR_EXCEPTION_MANAGE', 'SCHOOL_WIDE');
  }

  requireTeachingSchoolWide(request: AuthenticatedRequest): Promise<void> {
    return this.require(request, 'TEACHING_OPERATION_MANAGE', 'SCHOOL_WIDE');
  }

  requireTeachingSubject(request: AuthenticatedRequest, subjectId: string): Promise<void> {
    return this.require(request, 'TEACHING_OPERATION_MANAGE', 'SUBJECT', subjectId);
  }

  private async require(request: AuthenticatedRequest, capabilityKey: OverlayCapability, scope: 'SCHOOL_WIDE' | 'SUBJECT', resourceId?: string): Promise<void> {
    if (request.auth?.user.mustChangePassword) return this.deny(request, capabilityKey, scope, resourceId, 'PASSWORD_CHANGE_REQUIRED');
    const decision = await this.authorization.evaluate({
      userId: request.auth!.user.id, capabilityKey, requestedScope: scope, resourceId,
    });
    if (!decision.allowed) return this.deny(request, capabilityKey, scope, resourceId, decision.reasonCode);
  }

  private async deny(request: AuthenticatedRequest, capabilityKey: OverlayCapability, scope: string, resourceId: string | undefined, reasonCode: AuthorizationReasonCode): Promise<never> {
    try {
      await this.audit.write({
        actorUserId: request.auth?.user.id, action: 'AUTHORIZATION_DENIED', entityType: 'CapabilityDefinition',
        entityId: capabilityKey, requestId: typeof request.headers?.['x-request-id'] === 'string' ? request.headers['x-request-id'] : undefined,
        result: 'DENIED', metadata: { capabilityKey, scope, resourceId, reasonCode, route: request.route?.path ?? request.path, method: request.method },
      });
    } catch (error) {
      this.logger.error(`Failed to persist authorization denial audit: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
  }
}
