import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AdditionalDutyAccessService } from './additional-duty-access.service';
import { DutyAssignmentsController, DefinitionsController } from './additional-duties.controller';
import { AdditionalDutiesService } from './additional-duties.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [DefinitionsController, DutyAssignmentsController],
  providers: [AdditionalDutiesService, AdditionalDutyAccessService, AuditService],
})
export class AdditionalDutiesModule {}
