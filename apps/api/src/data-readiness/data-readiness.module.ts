import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DataReadinessController } from './data-readiness.controller';
import { DataReadinessService } from './data-readiness.service';

@Module({
  imports: [PrismaModule, AuthModule, AuthorizationModule],
  controllers: [DataReadinessController],
  providers: [DataReadinessService],
  exports: [DataReadinessService],
})
export class DataReadinessModule {}
