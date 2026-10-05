import { Module } from '@nestjs/common';
import { BusinessConfigurationModule } from '../business-configuration/business-configuration.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SpecialProgrammeWorkloadProjectionModule } from '../special-programme-workload/special-programme-workload-projection.module';
import { OfficialWorkloadProjectionService } from './official-workload-projection.service';

@Module({
  imports: [
    PrismaModule,
    BusinessConfigurationModule,
    SpecialProgrammeWorkloadProjectionModule,
  ],
  providers: [OfficialWorkloadProjectionService],
  exports: [OfficialWorkloadProjectionService],
})
export class OfficialWorkloadModule {}
