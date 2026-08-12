import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AcademicYearTimeSlotsController, TimeSlotsController } from './time-slots.controller';
import { TimeSlotsService } from './time-slots.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [AcademicYearTimeSlotsController, TimeSlotsController],
  providers: [TimeSlotsService, AuditService],
})
export class TimeSlotsModule {}
