import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ResolvedOccurrencesModule } from '../resolved-occurrences/resolved-occurrences.module';
import { EffectiveScheduleController } from './effective-schedule.controller';
import { EffectiveScheduleService } from './effective-schedule.service';

@Module({
  imports: [
    PrismaModule,
    ResolvedOccurrencesModule,
    AuthorizationModule,
    CapabilitiesModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [EffectiveScheduleController],
  providers: [EffectiveScheduleService],
  exports: [EffectiveScheduleService],
})
export class EffectiveScheduleModule {}
