import { Module } from '@nestjs/common';
import { ResolvedOccurrencesModule } from '../resolved-occurrences/resolved-occurrences.module';
import { PpctOccurrenceAllocationV2Service } from './ppct-occurrence-allocation-v2.service';
import { PpctOccurrenceAllocationService } from './ppct-occurrence-allocation.service';

@Module({
  imports: [ResolvedOccurrencesModule],
  providers: [PpctOccurrenceAllocationService, PpctOccurrenceAllocationV2Service],
  exports: [PpctOccurrenceAllocationService, PpctOccurrenceAllocationV2Service],
})
export class PpctOccurrenceAllocationModule {}
