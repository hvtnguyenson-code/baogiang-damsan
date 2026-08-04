import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AppConfig } from '../config/app.config';
import { AuthService } from './auth.service';
import { readCookie, requestMeta } from './auth-http';
import { AuthenticatedRequest } from './auth.types';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    @Inject('APP_CONFIG') private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawToken = readCookie(request, this.config.auth.cookieName);
    if (!rawToken) throw new UnauthorizedException('Yêu cầu đăng nhập.');
    const authenticated = await this.auth.authenticate(rawToken, requestMeta(request));
    request.auth = authenticated;
    return true;
  }
}
