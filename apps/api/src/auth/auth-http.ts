import { CookieOptions, Request } from 'express';
import { isIP } from 'net';
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
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function requestMeta(request: Request): RequestMeta {
  return {
    ipAddress: normalizeClientIp(request.ip),
    userAgent: request.headers['user-agent']?.slice(0, 500),
    requestId: typeof request.headers['x-request-id'] === 'string' ? request.headers['x-request-id'] : undefined,
  };
}

export function normalizeClientIp(value?: string): string | undefined {
  if (!value) return undefined;
  const candidate = value.startsWith('::ffff:') ? value.slice(7) : value;
  return isIP(candidate) === 0 ? undefined : candidate.slice(0, 45);
}

export function configureTrustProxy(
  expressApplication: { set(name: string, value: number): unknown },
  trustedHops: number,
): void {
  expressApplication.set('trust proxy', trustedHops);
}
