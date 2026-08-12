import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { TimetableImportController } from './timetable-import.controller';
import { TimetableImportService } from './timetable-import.service';
import { TimetableImportWorkbookController } from './timetable-import-workbook.controller';
import { TimetableImportWorkbookService } from './timetable-import-workbook.service';
import { WorkbookParserService } from './workbook-parser.service';

@Module({
  imports: [AuthModule, AuthorizationModule, AuditModule],
  controllers: [TimetableImportController, TimetableImportWorkbookController],
  providers: [TimetableImportService, TimetableImportWorkbookService, WorkbookParserService],
})
export class TimetableImportModule {}
