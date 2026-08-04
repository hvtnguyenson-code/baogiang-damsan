import { SetMetadata } from '@nestjs/common';
import { CapabilityKey, CapabilityScope } from '@baogiang/contracts';
import { CapabilityRequirement, REQUIRE_CAPABILITIES_METADATA } from './authorization.types';

export interface RequireCapabilityOptions {
  scope: CapabilityScope;
  resourceParam?: string;
}

export const RequireCapability = (capabilityKey: CapabilityKey, options: RequireCapabilityOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_CAPABILITIES_METADATA, [{ capabilityKey, ...options }] satisfies CapabilityRequirement[]);

export const RequireCapabilities = (...requirements: CapabilityRequirement[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_CAPABILITIES_METADATA, requirements);
