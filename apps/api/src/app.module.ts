import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AppConfigModule } from './config/app-config.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { CapabilitiesModule } from './capabilities/capabilities.module';
import { AuditModule } from './audit/audit.module';
import { AdditionalDutiesModule } from './additional-duties/additional-duties.module';
import { AcademicStructureModule } from './academic-structure/academic-structure.module';
import { TeachingAssignmentsModule } from './teaching-assignments/teaching-assignments.module';
import { TimeSlotsModule } from './time-slots/time-slots.module';
import { TimetablesModule } from './timetables/timetables.module';
import { TimetableImportModule } from './timetable-import/timetable-import.module';
import { PpctModule } from './ppct/ppct.module';
import { OperationalOverlaysModule } from './operational-overlays/operational-overlays.module';
import { SpecialActivitiesModule } from './special-activities/special-activities.module';
import { ResolvedOccurrencesModule } from './resolved-occurrences/resolved-occurrences.module';
import { PpctOccurrenceAllocationModule } from './ppct-occurrence-allocation/ppct-occurrence-allocation.module';
import { TeachingExecutionsModule } from './teaching-executions/teaching-executions.module';
import { ProgressDebtModule } from './progress-debt/progress-debt.module';
import { ReportingProjectionModule } from './reporting-projection/reporting-projection.module';

@Module({
  imports: [
    // ---- Configuration ----
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      cache: true,
    }),

    // ---- App config (validation) ----
    AppConfigModule,

    // ---- Terminus health checks ----
    TerminusModule,

    // ---- Prisma ORM ----
    PrismaModule,

    // ---- Health endpoints ----
    HealthModule,
    AuthModule,
    UsersModule,
    CatalogsModule,
    AssignmentsModule,
    CapabilitiesModule,
    AuditModule,
    AdditionalDutiesModule,
    AcademicStructureModule,
    TeachingAssignmentsModule,
    TimeSlotsModule,
    TimetablesModule,
    TimetableImportModule,
    PpctModule,
    OperationalOverlaysModule,
    SpecialActivitiesModule,
    ResolvedOccurrencesModule,
    PpctOccurrenceAllocationModule,
    TeachingExecutionsModule,
    ProgressDebtModule,
    ReportingProjectionModule,
  ],
})
export class AppModule {}
