import { Module } from '@nestjs/common';
import { ProgressDebtModule } from '../progress-debt/progress-debt.module';
import { ReportingProjectionService } from './reporting-projection.service';

@Module({ imports: [ProgressDebtModule], providers: [ReportingProjectionService], exports: [ReportingProjectionService] })
export class ReportingProjectionModule {}
