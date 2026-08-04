import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfOriginGuard } from './csrf-origin.guard';
import { LoginRateLimitService } from './login-rate-limit.service';
import { PasswordService } from './password.service';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionTokenService } from './session-token.service';
import { AuthPolicyService } from './auth-policy.service';
import { AppConfigModule } from '../config/app-config.module';

@Module({
  imports: [AppConfigModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionTokenService, AuthPolicyService, SessionAuthGuard, CsrfOriginGuard, LoginRateLimitService, AuditService],
  exports: [AuthService, SessionAuthGuard],
})
export class AuthModule {}
