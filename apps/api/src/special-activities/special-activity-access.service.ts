import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';

@Injectable()
export class SpecialActivityAccessService {
  private readonly logger = new Logger(SpecialActivityAccessService.name);
  constructor(private readonly authorization: CapabilityAuthorizationService, private readonly audit: AuditService) {}
  async requireManage(request: AuthenticatedRequest): Promise<void> {
    const capabilityKey = 'SPECIAL_ACTIVITY_MANAGE';
    const reason = request.auth?.user.mustChangePassword ? 'PASSWORD_CHANGE_REQUIRED' : undefined;
    const decision = reason ? undefined : await this.authorization.evaluate({ userId: request.auth!.user.id, capabilityKey, requestedScope: 'SCHOOL_WIDE' });
    if (!reason && decision?.allowed) return;
    try { await this.audit.write({ actorUserId: request.auth?.user.id, action: 'AUTHORIZATION_DENIED', entityType: 'CapabilityDefinition', entityId: capabilityKey, result: 'DENIED', metadata: { capabilityKey, scope: 'SCHOOL_WIDE', reasonCode: reason ?? decision!.reasonCode, route: request.route?.path ?? request.path, method: request.method } }); }
    catch (error) { this.logger.error(`Failed to persist authorization denial audit: ${error instanceof Error ? error.message : 'unknown error'}`); }
    throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
  }
}
