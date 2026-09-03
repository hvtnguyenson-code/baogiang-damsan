import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { HomeroomAssignmentsController } from './homeroom-assignments.controller';
import { HomeroomAssignmentsService } from './homeroom-assignments.service';
@Module({ imports: [AuthModule, AuthorizationModule], controllers: [HomeroomAssignmentsController], providers: [HomeroomAssignmentsService, AuditService], exports: [HomeroomAssignmentsService] })
export class HomeroomAssignmentsModule {}
