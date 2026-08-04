import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CapabilityScope } from '@baogiang/contracts';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CapabilityAuthorizationService } from './capability-authorization.service';
import {
  AuthorizationReasonCode,
  CAPABILITY_SCOPES,
  CapabilityRequirement,
  REQUIRE_CAPABILITIES_METADATA,
} from './authorization.types';

@Injectable()
export class CapabilityGuard implements CanActivate {
  private readonly logger = new Logger(CapabilityGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: CapabilityAuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const requirements = this.reflector.getAllAndOverride<unknown>(REQUIRE_CAPABILITIES_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!request.auth) return this.deny(request, 'AUTH_CONTEXT_MISSING');
    if (request.auth.user.mustChangePassword) return this.deny(request, 'PASSWORD_CHANGE_REQUIRED');
    if (!this.areRequirementsValid(requirements)) return this.deny(request, 'REQUIREMENT_INVALID');

    for (const requirement of requirements) {
      const resourceId = requirement.resourceParam ? request.params?.[requirement.resourceParam] : undefined;
      const decision = await this.authorization.evaluate({
        userId: request.auth.user.id,
        capabilityKey: requirement.capabilityKey,
        requestedScope: requirement.scope,
        resourceId,
      });
      if (!decision.allowed) {
        return this.deny(request, decision.reasonCode, requirement, decision.normalizedResourceId ?? resourceId);
      }
    }
    return true;
  }

  private areRequirementsValid(value: unknown): value is CapabilityRequirement[] {
    return Array.isArray(value) && value.length > 0 && value.every((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const requirement = item as Partial<CapabilityRequirement>;
      return typeof requirement.capabilityKey === 'string'
        && requirement.capabilityKey.length > 0
        && this.isScope(requirement.scope)
        && (requirement.resourceParam === undefined || (typeof requirement.resourceParam === 'string' && requirement.resourceParam.length > 0));
    });
  }

  private async deny(
    request: AuthenticatedRequest,
    reasonCode: AuthorizationReasonCode,
    requirement?: CapabilityRequirement,
    resourceId?: string,
  ): Promise<never> {
    try {
      await this.audit.write({
        actorUserId: request.auth?.user.id,
        action: 'AUTHORIZATION_DENIED',
        entityType: 'CapabilityDefinition',
        entityId: requirement?.capabilityKey,
        requestId: typeof request.headers?.['x-request-id'] === 'string' ? request.headers['x-request-id'] : undefined,
        result: 'DENIED',
        metadata: {
          capabilityKey: requirement?.capabilityKey,
          scope: requirement?.scope,
          resourceId,
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

  private isScope(value: unknown): value is CapabilityScope {
    return typeof value === 'string' && CAPABILITY_SCOPES.includes(value as CapabilityScope);
  }
}
