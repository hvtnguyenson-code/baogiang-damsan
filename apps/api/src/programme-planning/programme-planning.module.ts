import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProgrammePlanningService } from './programme-planning.service';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [ProgrammePlanningService],
  exports: [ProgrammePlanningService],
})
export class ProgrammePlanningModule {}
