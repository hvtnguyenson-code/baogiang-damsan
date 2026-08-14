import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PpctModule } from '../ppct/ppct.module';
import {
  AcademicYearTimetableResolutionController,
  AcademicYearTimetableVersionsController,
  TimetableVersionsController,
} from './timetable-versions.controller';
import { TimetablesService } from './timetables.service';
import { TimetableReadinessController } from './timetable-readiness.controller';
import { TimetableReadinessService } from './timetable-readiness.service';

@Module({
  imports: [AuthModule, AuthorizationModule, PpctModule],
  controllers: [
    AcademicYearTimetableVersionsController,
    AcademicYearTimetableResolutionController,
    TimetableVersionsController,
    TimetableReadinessController,
  ],
  providers: [TimetablesService, TimetableReadinessService, AuditService],
})
export class TimetablesModule {}
