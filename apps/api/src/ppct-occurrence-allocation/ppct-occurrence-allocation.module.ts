import { Module } from '@nestjs/common';
import { ResolvedOccurrencesModule } from '../resolved-occurrences/resolved-occurrences.module';
import { PpctOccurrenceAllocationService } from './ppct-occurrence-allocation.service';

@Module({ imports: [ResolvedOccurrencesModule], providers: [PpctOccurrenceAllocationService], exports: [PpctOccurrenceAllocationService] })
export class PpctOccurrenceAllocationModule {}
