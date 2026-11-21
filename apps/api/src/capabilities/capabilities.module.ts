import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AccessBaselineService } from './access-baseline.service';
import { CapabilitiesController } from './capabilities.controller';
import { CapabilitiesService } from './capabilities.service';
import { ResponsibilityTemplatesController } from './responsibility-templates.controller';
import { AppointmentPreflightController } from './appointment-preflight.controller';
import { AppointmentPreflightService } from './appointment-preflight.service';
import { B1RoleCommandController } from './b1-role-command.controller';
import { B1RoleCommandHttpService } from './b1-role-command-http.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [CapabilitiesController, ResponsibilityTemplatesController, AppointmentPreflightController, B1RoleCommandController],
  providers: [CapabilitiesService, AccessBaselineService, AppointmentPreflightService, B1RoleCommandHttpService, AuditService],
  exports: [CapabilitiesService, AccessBaselineService],
})
export class CapabilitiesModule {}
