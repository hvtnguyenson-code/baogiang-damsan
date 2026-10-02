import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { BusinessConfigurationModule } from '../business-configuration/business-configuration.module';
import { PpctOccurrenceAllocationModule } from '../ppct-occurrence-allocation/ppct-occurrence-allocation.module';
import { HistoricalTeachingController } from './historical-teaching.controller';
import { HistoricalTeachingService } from './historical-teaching.service';

@Module({
  imports: [AuthModule, AuthorizationModule, BusinessConfigurationModule, PpctOccurrenceAllocationModule],
  controllers: [HistoricalTeachingController],
  providers: [HistoricalTeachingService],
})
export class HistoricalTeachingModule {}
