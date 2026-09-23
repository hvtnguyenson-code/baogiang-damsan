import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SpecialActivitiesModule } from '../special-activities/special-activities.module';
import { TimetableImportModule } from '../timetable-import/timetable-import.module';
import { TimetablesModule } from '../timetables/timetables.module';
import { AuthorizedProgrammePlanningService } from './authorized-programme-planning.service';
import { HdtnWorkbookImporterService } from './hdtn-workbook-importer.service';
import { ProgrammePlanningAuthorizationService } from './programme-planning-authorization.service';
import { ProgrammePlanningController } from './programme-planning.controller';
import { ProgrammePlanningService } from './programme-planning.service';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    AuthorizationModule,
    SpecialActivitiesModule,
    TimetableImportModule,
    TimetablesModule,
  ],
  controllers: [ProgrammePlanningController],
  providers: [
    ProgrammePlanningService,
    ProgrammePlanningAuthorizationService,
    AuthorizedProgrammePlanningService,
    HdtnWorkbookImporterService,
  ],
  exports: [
    AuthorizedProgrammePlanningService,
    ProgrammePlanningAuthorizationService,
    HdtnWorkbookImporterService,
  ],
})
export class ProgrammePlanningModule {}
