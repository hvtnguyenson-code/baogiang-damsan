import { CapabilityKey, CapabilityScope, ScopedCapability } from '@baogiang/contracts';

export const CAPABILITY_SCOPES: readonly CapabilityScope[] = [
  'PERSONAL',
  'SUBJECT_GROUP',
  'SUBJECT',
  'ACTIVITY',
  'SCHOOL_WIDE',
];

export type AuthorizationReasonCode =
  | 'ALLOWED'
  | 'AUTH_CONTEXT_MISSING'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'USER_INACTIVE'
  | 'USER_LOCKED'
  | 'CAPABILITY_UNKNOWN'
  | 'CAPABILITY_INACTIVE'
  | 'SCOPE_NOT_ALLOWED'
  | 'RESOURCE_REQUIRED'
  | 'RESOURCE_INVALID'
  | 'GRANT_NOT_FOUND'
  | 'GRANT_NOT_ACTIVE'
  | 'GRANT_SCOPE_MALFORMED'
  | 'REQUIREMENT_INVALID';

export interface CapabilityRequest {
  userId: string;
  capabilityKey: CapabilityKey;
  requestedScope: CapabilityScope;
  resourceId?: string;
  atTime?: Date;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reasonCode: AuthorizationReasonCode;
  atTime: Date;
  normalizedResourceId?: string;
}

export interface CapabilityRequirement {
  capabilityKey: CapabilityKey;
  scope: CapabilityScope;
  resourceParam?: string;
}

export interface AuthorizationClock {
  now(): Date;
}

export type EffectiveCapability = ScopedCapability;

export const AUTHORIZATION_CLOCK = Symbol('AUTHORIZATION_CLOCK');
export const REQUIRE_CAPABILITIES_METADATA = 'authorization:capabilities';
