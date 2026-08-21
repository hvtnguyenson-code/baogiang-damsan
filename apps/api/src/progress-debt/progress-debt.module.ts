import { Module } from '@nestjs/common';
import { PpctOccurrenceAllocationModule } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.module';
import { SystemTeachingExecutionClock, TEACHING_EXECUTION_CLOCK } from '../teaching-executions/teaching-execution-policy';
import { ProgressDebtService } from './progress-debt.service';

@Module({ imports: [PpctOccurrenceAllocationModule], providers: [ProgressDebtService, { provide: TEACHING_EXECUTION_CLOCK, useClass: SystemTeachingExecutionClock }], exports: [ProgressDebtService] })
export class ProgressDebtModule {}
