import { Module } from '@nestjs/common';
import { BusinessConfigurationModule } from '../business-configuration/business-configuration.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SpecialProgrammeWorkloadProjectionService } from './special-programme-workload-projection.service';

@Module({
  imports: [PrismaModule, BusinessConfigurationModule],
  providers: [SpecialProgrammeWorkloadProjectionService],
  exports: [SpecialProgrammeWorkloadProjectionService],
})
export class SpecialProgrammeWorkloadProjectionModule {}
