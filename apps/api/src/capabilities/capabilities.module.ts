import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AccessBaselineService } from './access-baseline.service';
import { CapabilitiesController } from './capabilities.controller';
import { CapabilitiesService } from './capabilities.service';
import { ResponsibilityTemplatesController } from './responsibility-templates.controller';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [CapabilitiesController, ResponsibilityTemplatesController],
  providers: [CapabilitiesService, AccessBaselineService, AuditService],
  exports: [CapabilitiesService, AccessBaselineService],
})
export class CapabilitiesModule {}
