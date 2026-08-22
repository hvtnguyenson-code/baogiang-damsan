import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ProgressDebtModule } from '../progress-debt/progress-debt.module';
import { ReportingAccessService } from './reporting-access.service';
import { ReportingProjectionController } from './reporting-projection.controller';
import { ReportingProjectionService } from './reporting-projection.service';

@Module({
  imports: [AuthModule, AuthorizationModule, ProgressDebtModule],
  controllers: [ReportingProjectionController],
  providers: [ReportingAccessService, ReportingProjectionService],
  exports: [ReportingProjectionService],
})
export class ReportingProjectionModule {}
