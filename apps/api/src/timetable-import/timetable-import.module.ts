import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { TimetableImportController } from './timetable-import.controller';
import { TimetableImportService } from './timetable-import.service';

@Module({
  imports: [AuthModule, AuthorizationModule, AuditModule],
  controllers: [TimetableImportController],
  providers: [TimetableImportService],
})
export class TimetableImportModule {}
