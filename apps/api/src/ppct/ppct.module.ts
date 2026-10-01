import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import {
  AcademicYearPpctPlansController,
  PpctClassAssociationsController,
  PpctPlansController,
  PpctVersionsController,
} from './ppct.controller';
import { PpctAccessService } from './ppct-access.service';
import { PpctAssociationReadService } from './ppct-association-read.service';
import { PpctImportController } from './ppct-import.controller';
import { PpctImportService } from './ppct-import.service';
import { PpctOptionsController } from './ppct-options.controller';
import { PpctOptionsService } from './ppct-options.service';
import { PpctService } from './ppct.service';
import { PpctWorkbookParserService } from './ppct-workbook-parser.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [
    AcademicYearPpctPlansController,
    PpctPlansController,
    PpctVersionsController,
    PpctClassAssociationsController,
    PpctOptionsController,
    PpctImportController,
  ],
  providers: [
    PpctService,
    PpctAccessService,
    PpctAssociationReadService,
    PpctOptionsService,
    PpctImportService,
    PpctWorkbookParserService,
    AuditService,
  ],
  exports: [PpctAssociationReadService],
})
export class PpctModule {}
