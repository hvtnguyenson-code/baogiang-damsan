import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';

@Injectable()
export class ReportingAccessService {
  private readonly logger = new Logger(ReportingAccessService.name);

  constructor(private readonly authorization: CapabilityAuthorizationService, private readonly audit: AuditService) {}

  async requireSubjects(request: AuthenticatedRequest, subjectIds: Iterable<string>): Promise<void> {
    if (!request.auth || request.auth.user.mustChangePassword) return this.deny(request, 'PASSWORD_CHANGE_REQUIRED');
    for (const subjectId of new Set(subjectIds)) {
      const decision = await this.authorization.evaluate({
        userId: request.auth.user.id,
        capabilityKey: 'REPORTING_READ',
        requestedScope: 'SUBJECT',
        resourceId: subjectId,
      });
      if (!decision.allowed) return this.deny(request, decision.reasonCode, subjectId);
    }
  }

  private async deny(request: AuthenticatedRequest, reasonCode: string, resourceId?: string): Promise<never> {
    try {
      await this.audit.write({
        actorUserId: request.auth?.user.id,
        action: 'AUTHORIZATION_DENIED',
        entityType: 'CapabilityDefinition',
        entityId: 'REPORTING_READ',
        requestId: typeof request.headers?.['x-request-id'] === 'string' ? request.headers['x-request-id'] : undefined,
        result: 'DENIED',
        metadata: { capabilityKey: 'REPORTING_READ', scope: 'SUBJECT', resourceId, reasonCode, route: request.route?.path ?? request.path, method: request.method },
      });
    } catch (error) {
      this.logger.error(`Failed authorization denial audit: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
  }
}
