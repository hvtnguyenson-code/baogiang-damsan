import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { BusinessConfigurationModule } from '../business-configuration/business-configuration.module';
import { PpctOccurrenceAllocationModule } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.module';
import { ResolvedOccurrencesModule } from '../resolved-occurrences/resolved-occurrences.module';
import { TeachingExecutionAccessService } from './teaching-execution-access.service';
import { TeachingExecutionsController } from './teaching-executions.controller';
import { TeachingExecutionsService } from './teaching-executions.service';
import { SystemTeachingExecutionClock, TEACHING_EXECUTION_CLOCK } from './teaching-execution-policy';
@Module({ imports: [AuthModule, AuthorizationModule, BusinessConfigurationModule, PpctOccurrenceAllocationModule, ResolvedOccurrencesModule], controllers: [TeachingExecutionsController], providers: [TeachingExecutionsService, TeachingExecutionAccessService, { provide: TEACHING_EXECUTION_CLOCK, useClass: SystemTeachingExecutionClock }] })
export class TeachingExecutionsModule {}
