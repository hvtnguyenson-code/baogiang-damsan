import { CookieOptions, Request } from 'express';
import { AppConfig } from '../config/app.config';
import { RequestMeta } from './auth.types';

export function cookieOptions(config: AppConfig, expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
    path: config.auth.cookiePath,
    domain: config.auth.cookieDomain,
    expires,
  };
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

export function requestMeta(request: Request): RequestMeta {
  const forwarded = request.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return {
    ipAddress: (forwardedIp?.trim() || request.ip)?.slice(0, 45),
    userAgent: request.headers['user-agent']?.slice(0, 500),
    requestId: typeof request.headers['x-request-id'] === 'string' ? request.headers['x-request-id'] : undefined,
  };
}
