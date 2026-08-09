import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CatalogsService } from './catalogs.service';
import { SubjectGroupsController } from './subject-groups.controller';
import { SubjectsController } from './subjects.controller';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [SubjectGroupsController, SubjectsController],
  providers: [CatalogsService, AuditService],
})
export class CatalogsModule {}
