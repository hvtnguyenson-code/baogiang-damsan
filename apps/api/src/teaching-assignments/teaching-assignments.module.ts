import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import {
  AcademicYearTeachingAssignmentsController,
  TeachingAssignmentsController,
} from './teaching-assignments.controller';
import { TeachingAssignmentsService } from './teaching-assignments.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [AcademicYearTeachingAssignmentsController, TeachingAssignmentsController],
  providers: [TeachingAssignmentsService, AuditService],
})
export class TeachingAssignmentsModule {}
