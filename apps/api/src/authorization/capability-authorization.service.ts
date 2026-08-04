import { Inject, Injectable } from '@nestjs/common';
import { CapabilityScope, ScopedCapability } from '@baogiang/contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTHORIZATION_CLOCK,
  AuthorizationClock,
  AuthorizationDecision,
  CapabilityRequest,
  CAPABILITY_SCOPES,
} from './authorization.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESOURCE_SCOPES: readonly CapabilityScope[] = ['SUBJECT_GROUP', 'SUBJECT', 'ACTIVITY'];

interface GrantShape {
  scopeType: string;
  scopeResourceId: string | null;
  validFrom: Date;
  validUntil: Date | null;
  revokedAt: Date | null;
}

@Injectable()
export class CapabilityAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTHORIZATION_CLOCK) private readonly clock: AuthorizationClock,
  ) {}

  async hasCapability(request: CapabilityRequest): Promise<boolean> {
    return (await this.evaluate(request)).allowed;
  }

  async evaluate(request: CapabilityRequest): Promise<AuthorizationDecision> {
    const atTime = request.atTime ? new Date(request.atTime) : this.clock.now();
    const deny = (reasonCode: AuthorizationDecision['reasonCode'], normalizedResourceId?: string): AuthorizationDecision => ({
      allowed: false,
      reasonCode,
      atTime,
      normalizedResourceId,
    });
    if (Number.isNaN(atTime.getTime())) return deny('REQUIREMENT_INVALID');

    const [user, definition] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: request.userId },
        select: {
          status: true,
          lockedUntil: true,
          capabilityGrants: {
            where: { capabilityKey: request.capabilityKey },
            select: { scopeType: true, scopeResourceId: true, validFrom: true, validUntil: true, revokedAt: true },
          },
        },
      }),
      this.prisma.capabilityDefinition.findUnique({
        where: { key: request.capabilityKey },
        select: { isActive: true, allowedScopeTypes: true },
      }),
    ]);

    if (!user || user.status !== 'ACTIVE') return deny('USER_INACTIVE');
    if (user.lockedUntil && user.lockedUntil > atTime) return deny('USER_LOCKED');
    if (!definition) return deny('CAPABILITY_UNKNOWN');
    if (!definition.isActive) return deny('CAPABILITY_INACTIVE');
    if (definition.allowedScopeTypes.length === 0 || definition.allowedScopeTypes.some((scope) => !this.isScope(scope))) {
      return deny('SCOPE_NOT_ALLOWED');
    }
    if (!this.isScope(request.requestedScope) || !definition.allowedScopeTypes.includes(request.requestedScope)) {
      return deny('SCOPE_NOT_ALLOWED');
    }

    const normalized = this.normalizeRequestedResource(request.userId, request.requestedScope, request.resourceId);
    if (normalized.reasonCode) return deny(normalized.reasonCode);
    if (user.capabilityGrants.length === 0) return deny('GRANT_NOT_FOUND', normalized.resourceId);

    let sawMalformed = false;
    let sawInactive = false;
    for (const grant of user.capabilityGrants) {
      if (!this.isGrantShapeValid(grant, definition.allowedScopeTypes)) {
        sawMalformed = true;
        continue;
      }
      if (grant.revokedAt || grant.validFrom > atTime || (grant.validUntil !== null && atTime >= grant.validUntil)) {
        sawInactive = true;
        continue;
      }
      if (this.grantMatches(grant, request.userId, request.requestedScope, normalized.resourceId)) {
        return { allowed: true, reasonCode: 'ALLOWED', atTime, normalizedResourceId: normalized.resourceId };
      }
    }

    if (sawMalformed) return deny('GRANT_SCOPE_MALFORMED', normalized.resourceId);
    if (sawInactive) return deny('GRANT_NOT_ACTIVE', normalized.resourceId);
    return deny('GRANT_NOT_FOUND', normalized.resourceId);
  }

  async listEffectiveCapabilities(userId: string, atTimeInput?: Date): Promise<ScopedCapability[]> {
    const atTime = atTimeInput ? new Date(atTimeInput) : this.clock.now();
    if (Number.isNaN(atTime.getTime())) return [];
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        lockedUntil: true,
        capabilityGrants: {
          select: {
            capabilityKey: true,
            scopeType: true,
            scopeResourceId: true,
            validFrom: true,
            validUntil: true,
            revokedAt: true,
            capability: { select: { isActive: true, allowedScopeTypes: true } },
          },
        },
      },
    });
    if (!user || user.status !== 'ACTIVE' || (user.lockedUntil && user.lockedUntil > atTime)) return [];

    const unique = new Map<string, ScopedCapability>();
    for (const grant of user.capabilityGrants) {
      if (!grant.capability.isActive || !this.isGrantShapeValid(grant, grant.capability.allowedScopeTypes)) continue;
      if (grant.revokedAt || grant.validFrom > atTime || (grant.validUntil !== null && atTime >= grant.validUntil)) continue;
      const scope = grant.scopeType as CapabilityScope;
      const capability: ScopedCapability = { key: grant.capabilityKey as ScopedCapability['key'], scope };
      if (RESOURCE_SCOPES.includes(scope)) capability.resourceId = grant.scopeResourceId!;
      unique.set(`${capability.key}:${scope}:${capability.resourceId ?? ''}`, capability);
    }
    return [...unique.values()].sort((left, right) =>
      `${left.key}:${left.scope}:${left.resourceId ?? ''}`.localeCompare(`${right.key}:${right.scope}:${right.resourceId ?? ''}`),
    );
  }

  private normalizeRequestedResource(
    userId: string,
    scope: CapabilityScope,
    resourceId?: string,
  ): { resourceId?: string; reasonCode?: 'RESOURCE_REQUIRED' | 'RESOURCE_INVALID' } {
    if (scope === 'PERSONAL') {
      if (resourceId !== undefined && resourceId !== userId) return { reasonCode: 'RESOURCE_INVALID' };
      return { resourceId: userId };
    }
    if (scope === 'SCHOOL_WIDE') {
      return resourceId === undefined ? {} : { reasonCode: 'RESOURCE_INVALID' };
    }
    if (!resourceId) return { reasonCode: 'RESOURCE_REQUIRED' };
    return UUID_PATTERN.test(resourceId) ? { resourceId } : { reasonCode: 'RESOURCE_INVALID' };
  }

  private isGrantShapeValid(grant: GrantShape, allowedScopes: string[]): boolean {
    if (!this.isScope(grant.scopeType) || !allowedScopes.includes(grant.scopeType)) return false;
    if (grant.validUntil !== null && grant.validUntil <= grant.validFrom) return false;
    if (RESOURCE_SCOPES.includes(grant.scopeType)) return !!grant.scopeResourceId && UUID_PATTERN.test(grant.scopeResourceId);
    return grant.scopeResourceId === null;
  }

  private grantMatches(grant: GrantShape, userId: string, requestedScope: CapabilityScope, resourceId?: string): boolean {
    if (grant.scopeType === 'SCHOOL_WIDE') return true;
    if (requestedScope === 'SCHOOL_WIDE') return false;
    if (requestedScope === 'PERSONAL') return grant.scopeType === 'PERSONAL' && resourceId === userId;
    return grant.scopeType === requestedScope && grant.scopeResourceId === resourceId;
  }

  private isScope(value: string): value is CapabilityScope {
    return CAPABILITY_SCOPES.includes(value as CapabilityScope);
  }
}
