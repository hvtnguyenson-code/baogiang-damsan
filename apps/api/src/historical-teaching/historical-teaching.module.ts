import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { BusinessConfigurationModule } from '../business-configuration/business-configuration.module';
import { PpctOccurrenceAllocationModule } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.module';
import { ResolvedOccurrencesModule } from '../resolved-occurrences/resolved-occurrences.module';
import { HistoricalTeachingController } from './historical-teaching.controller';
import { HistoricalTeachingService } from './historical-teaching.service';

@Module({
  imports: [AuditModule, AuthModule, AuthorizationModule, BusinessConfigurationModule, PpctOccurrenceAllocationModule, ResolvedOccurrencesModule],
  controllers: [HistoricalTeachingController],
  providers: [HistoricalTeachingService],
})
export class HistoricalTeachingModule {}
