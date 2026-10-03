import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { BusinessConfigurationModule } from '../business-configuration/business-configuration.module';
import { ProgressDebtModule } from '../progress-debt/progress-debt.module';
import { ResolvedOccurrencesModule } from '../resolved-occurrences/resolved-occurrences.module';
import { MakeupSchedulesController } from './makeup-schedules.controller';
import { MakeupSchedulesService } from './makeup-schedules.service';
import { OperationalOverlayAccessService } from './operational-overlay-access.service';
import { OVERLAY_CLOCK, SystemOverlayClock } from './operational-overlay-policy';
import { OperationalOverlaysController } from './operational-overlays.controller';
import { OperationalOverlaysService } from './operational-overlays.service';

@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
    BusinessConfigurationModule,
    ProgressDebtModule,
    ResolvedOccurrencesModule,
  ],
  controllers: [OperationalOverlaysController, MakeupSchedulesController],
  providers: [
    OperationalOverlaysService,
    MakeupSchedulesService,
    OperationalOverlayAccessService,
    AuditService,
    { provide: OVERLAY_CLOCK, useClass: SystemOverlayClock },
  ],
  exports: [OperationalOverlaysService, MakeupSchedulesService, OperationalOverlayAccessService],
})
export class OperationalOverlaysModule {}
