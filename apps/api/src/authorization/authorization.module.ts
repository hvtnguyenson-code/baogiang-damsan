import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CapabilityAuthorizationService } from './capability-authorization.service';
import { CapabilityGuard } from './capability.guard';
import { AUTHORIZATION_CLOCK } from './authorization.types';
import { SystemAuthorizationClock } from './system-authorization.clock';

@Module({
  providers: [
    CapabilityAuthorizationService,
    CapabilityGuard,
    AuditService,
    SystemAuthorizationClock,
    { provide: AUTHORIZATION_CLOCK, useExisting: SystemAuthorizationClock },
  ],
  exports: [CapabilityAuthorizationService, CapabilityGuard, AuditService, AUTHORIZATION_CLOCK],
})
export class AuthorizationModule {}
