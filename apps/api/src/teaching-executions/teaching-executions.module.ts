import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PpctOccurrenceAllocationModule } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.module';
import { PpctOccurrenceAllocationV2Service } from '../ppct-occurrence-allocation/ppct-occurrence-allocation-v2.service';
import { PpctOccurrenceAllocationService } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.service';
import { ResolvedOccurrencesModule } from '../resolved-occurrences/resolved-occurrences.module';
import { TeachingExecutionAccessService } from './teaching-execution-access.service';
import { TeachingExecutionsController } from './teaching-executions.controller';
import { TeachingExecutionsService } from './teaching-executions.service';
import { SystemTeachingExecutionClock, TEACHING_EXECUTION_CLOCK } from './teaching-execution-policy';

@Module({
  imports: [AuthModule, AuthorizationModule, PpctOccurrenceAllocationModule, ResolvedOccurrencesModule],
  controllers: [TeachingExecutionsController],
  providers: [
    TeachingExecutionsService,
    TeachingExecutionAccessService,
    // P2-003 compatibility bridge: the unchanged execution service keeps its
    // historical injection token/type while runtime confirmation composes the
    // component-aware tx-bound allocator. No execution persistence changes.
    { provide: PpctOccurrenceAllocationService, useExisting: PpctOccurrenceAllocationV2Service },
    { provide: TEACHING_EXECUTION_CLOCK, useClass: SystemTeachingExecutionClock },
  ],
})
export class TeachingExecutionsModule {}
