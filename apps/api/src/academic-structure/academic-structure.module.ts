import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AcademicCalendarVersionsController } from './academic-calendar-versions.controller';
import { AcademicStructureService } from './academic-structure.service';
import { AcademicYearsController } from './academic-years.controller';
import { SchoolClassesController } from './school-classes.controller';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [AcademicYearsController, AcademicCalendarVersionsController, SchoolClassesController],
  providers: [AcademicStructureService, AuditService],
})
export class AcademicStructureModule {}
