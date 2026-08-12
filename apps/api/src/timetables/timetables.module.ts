import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import {
  AcademicYearTimetableResolutionController,
  AcademicYearTimetableVersionsController,
  TimetableVersionsController,
} from './timetable-versions.controller';
import { TimetablesService } from './timetables.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [
    AcademicYearTimetableVersionsController,
    AcademicYearTimetableResolutionController,
    TimetableVersionsController,
  ],
  providers: [TimetablesService, AuditService],
})
export class TimetablesModule {}
