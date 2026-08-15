import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OperationalOverlayAccessService } from './operational-overlay-access.service';
import { OVERLAY_CLOCK, SystemOverlayClock } from './operational-overlay-policy';
import { OperationalOverlaysController } from './operational-overlays.controller';
import { OperationalOverlaysService } from './operational-overlays.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [OperationalOverlaysController],
  providers: [OperationalOverlaysService, OperationalOverlayAccessService, AuditService, { provide: OVERLAY_CLOCK, useClass: SystemOverlayClock }],
})
export class OperationalOverlaysModule {}
