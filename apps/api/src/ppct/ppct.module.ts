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
import { PpctService } from './ppct.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [AcademicYearPpctPlansController, PpctPlansController, PpctVersionsController, PpctClassAssociationsController],
  providers: [PpctService, PpctAccessService, AuditService],
})
export class PpctModule {}
