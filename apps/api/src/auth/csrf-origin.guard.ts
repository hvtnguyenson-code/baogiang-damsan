import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app.config';
import { AuthenticatedRequest } from './auth.types';

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(@Inject('APP_CONFIG') private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return true;
    const origin = request.headers.origin;
    let candidate = origin;
    if (!candidate && request.headers.referer) {
      try { candidate = new URL(request.headers.referer).origin; } catch { candidate = undefined; }
    }
    if (!candidate || !this.config.corsOrigins.includes(candidate)) {
      throw new ForbiddenException('Nguồn yêu cầu không được phép.');
    }
    return true;
  }
}
