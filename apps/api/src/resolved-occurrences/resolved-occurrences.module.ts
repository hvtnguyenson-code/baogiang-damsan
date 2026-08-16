import { Module } from '@nestjs/common';
import { PpctModule } from '../ppct/ppct.module';
import { ResolvedLessonOccurrencesService } from './resolved-occurrences.service';

@Module({ imports: [PpctModule], providers: [ResolvedLessonOccurrencesService], exports: [ResolvedLessonOccurrencesService] })
export class ResolvedOccurrencesModule {}
