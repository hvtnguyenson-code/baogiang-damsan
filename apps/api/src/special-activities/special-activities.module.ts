import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SpecialActivityAccessService } from './special-activity-access.service';
import { SPECIAL_ACTIVITY_CLOCK, SystemSpecialActivityClock } from './special-activity-policy';
import { SpecialActivitiesController } from './special-activities.controller';
import { SpecialActivitiesService } from './special-activities.service';
@Module({ imports: [AuthModule, AuthorizationModule], controllers: [SpecialActivitiesController], providers: [SpecialActivitiesService, SpecialActivityAccessService, AuditService, { provide: SPECIAL_ACTIVITY_CLOCK, useClass: SystemSpecialActivityClock }] })
export class SpecialActivitiesModule {}
