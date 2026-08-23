import { Module } from '@nestjs/common';
import { ReportingProjectionModule } from '../reporting-projection/reporting-projection.module';
import { PERSONAL_REPORTING_CLOCK } from './personal-reporting-projection.types';
import { SystemPersonalReportingClock } from './personal-reporting-projection.policy';
import { PersonalReportingProjectionService } from './personal-reporting-projection.service';
@Module({ imports:[ReportingProjectionModule], providers:[PersonalReportingProjectionService,{provide:PERSONAL_REPORTING_CLOCK,useClass:SystemPersonalReportingClock}], exports:[PersonalReportingProjectionService] })
export class PersonalReportingProjectionModule {}