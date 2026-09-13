import { Module } from '@nestjs/common';
import { BusinessConfigurationModule } from '../business-configuration/business-configuration.module';
import { PpctOccurrenceAllocationModule } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.module';
import { SystemTeachingExecutionClock, TEACHING_EXECUTION_CLOCK } from '../teaching-executions/teaching-execution-policy';
import { ProgressDebtService } from './progress-debt.service';

@Module({ imports: [BusinessConfigurationModule, PpctOccurrenceAllocationModule], providers: [ProgressDebtService, { provide: TEACHING_EXECUTION_CLOCK, useClass: SystemTeachingExecutionClock }], exports: [ProgressDebtService] })
export class ProgressDebtModule {}
