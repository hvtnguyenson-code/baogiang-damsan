import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [UsersController],
  providers: [UsersService, AuditService],
})
export class UsersModule {}
