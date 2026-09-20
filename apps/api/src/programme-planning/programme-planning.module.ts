import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SpecialActivitiesModule } from '../special-activities/special-activities.module';
import { AuthorizedProgrammePlanningService } from './authorized-programme-planning.service';
import { ProgrammePlanningAuthorizationService } from './programme-planning-authorization.service';
import { ProgrammePlanningController } from './programme-planning.controller';
import { ProgrammePlanningService } from './programme-planning.service';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule, AuthorizationModule, SpecialActivitiesModule],
  controllers: [ProgrammePlanningController],
  providers: [
    ProgrammePlanningService,
    ProgrammePlanningAuthorizationService,
    AuthorizedProgrammePlanningService,
  ],
  exports: [
    AuthorizedProgrammePlanningService,
    ProgrammePlanningAuthorizationService,
  ],
})
export class ProgrammePlanningModule {}
