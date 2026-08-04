import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthMeResponse, AuthMutationResponse, LoginResponse } from '@baogiang/contracts';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { cookieOptions, requestMeta } from './auth-http';
import { AuthenticatedRequest } from './auth.types';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { SessionAuthGuard } from './session-auth.guard';
import { CsrfOriginGuard } from './csrf-origin.guard';
import { LoginRateLimitService } from './login-rate-limit.service';
import { Inject } from '@nestjs/common';
import { AppConfig } from '../config/app.config';
import { CapabilityAuthorizationService } from '../authorization/capability-authorization.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly rateLimit: LoginRateLimitService,
    private readonly authorization: CapabilityAuthorizationService,
    @Inject('APP_CONFIG') private readonly config: AppConfig,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<LoginResponse> {
    this.rateLimit.consume(requestMeta(request).ipAddress ?? 'unknown');
    const result = await this.auth.login(dto.username, dto.password, requestMeta(request));
    response.cookie(this.config.auth.cookieName, result.rawToken, cookieOptions(this.config, result.expiresAt));
    return { user: { ...result.user, status: 'ACTIVE' }, expiresAt: result.expiresAt.toISOString() };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  async me(@Req() request: AuthenticatedRequest): Promise<AuthMeResponse> {
    const capabilities = await this.authorization.listEffectiveCapabilities(request.auth!.user.id);
    return { user: { ...request.auth!.user, status: 'ACTIVE' }, capabilities };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response): Promise<AuthMutationResponse> {
    await this.auth.logout(request.auth!.sessionId, request.auth!.user.id, requestMeta(request));
    response.clearCookie(this.config.auth.cookieName, cookieOptions(this.config));
    return { success: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  async logoutAll(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response): Promise<AuthMutationResponse> {
    await this.auth.logoutAll(request.auth!.user.id, requestMeta(request));
    response.clearCookie(this.config.auth.cookieName, cookieOptions(this.config));
    return { success: true };
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, CsrfOriginGuard)
  async changePassword(@Body() dto: ChangePasswordDto, @Req() request: AuthenticatedRequest): Promise<AuthMutationResponse> {
    await this.auth.changePassword(request.auth!.user.id, request.auth!.sessionId, dto.currentPassword, dto.newPassword, requestMeta(request));
    return { success: true };
  }
}
