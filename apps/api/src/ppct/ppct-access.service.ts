import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';
import { AuthorizationReasonCode } from '../authorization/authorization.types';

export interface PpctManageScopeResult {
  schoolWide: boolean;
  subjectIds: string[];
}

@Injectable()
export class PpctAccessService {
  private readonly logger = new Logger(PpctAccessService.name);

  constructor(private readonly authorization: CapabilityAuthorizationService, private readonly audit: AuditService) {}

  async requireSubject(request: AuthenticatedRequest, subjectId: string): Promise<void> {
    if (request.auth?.user.mustChangePassword) {
      await this.deny(request, subjectId, 'PASSWORD_CHANGE_REQUIRED');
    }
    const decision = await this.authorization.evaluate({
      userId: request.auth!.user.id,
      capabilityKey: 'PPCT_MANAGE',
      requestedScope: 'SUBJECT',
      resourceId: subjectId,
    });
    if (!decision.allowed) await this.deny(request, subjectId, decision.reasonCode);
  }

  async requireAnyManageScope(request: AuthenticatedRequest): Promise<PpctManageScopeResult> {
    if (request.auth?.user.mustChangePassword) {
      await this.deny(request, undefined, 'PASSWORD_CHANGE_REQUIRED');
    }
    const effective = await this.authorization.listEffectiveCapabilities(request.auth!.user.id);
    const ppctGrants = effective.filter((g) => g.key === 'PPCT_MANAGE');
    if (ppctGrants.some((g) => g.scope === 'SCHOOL_WIDE')) {
      return { schoolWide: true, subjectIds: [] };
    }
    const subjectIds = Array.from(
      new Set(
        ppctGrants
          .filter((g) => g.scope === 'SUBJECT' && typeof g.resourceId === 'string' && g.resourceId.length > 0)
          .map((g) => g.resourceId!),
      ),
    ).sort();
    if (subjectIds.length > 0) {
      return { schoolWide: false, subjectIds };
    }
    return await this.deny(request, undefined, 'GRANT_NOT_FOUND');
  }

  private async deny(request: AuthenticatedRequest, subjectId: string | undefined, reasonCode: AuthorizationReasonCode): Promise<never> {
    try {
      await this.audit.write({
        actorUserId: request.auth?.user.id,
        action: 'AUTHORIZATION_DENIED',
        entityType: 'CapabilityDefinition',
        entityId: 'PPCT_MANAGE',
        requestId: typeof request.headers?.['x-request-id'] === 'string' ? request.headers['x-request-id'] : undefined,
        result: 'DENIED',
        metadata: {
          capabilityKey: 'PPCT_MANAGE',
          scope: subjectId ? 'SUBJECT' : 'SCHOOL_WIDE',
          ...(subjectId ? { resourceId: subjectId } : {}),
          reasonCode,
          route: request.route?.path ?? request.path,
          method: request.method,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to persist authorization denial audit: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
  }
}
