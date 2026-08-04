import { Inject, Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AppConfig } from '../config/app.config';

@Injectable()
export class AuthPolicyService {
  constructor(@Inject('APP_CONFIG') private readonly config: AppConfig) {}

  lockUntil(failedLoginCount: number, now: Date): Date | null {
    return failedLoginCount >= this.config.auth.lockoutThreshold
      ? new Date(now.getTime() + this.config.auth.lockoutDurationSeconds * 1000)
      : null;
  }

  sessionRejection(session: {
    revokedAt: Date | null;
    expiresAt: Date;
    user: { status: UserStatus; lockedUntil: Date | null };
  }, now: Date): string | undefined {
    if (session.revokedAt) return 'REVOKED';
    if (session.expiresAt <= now) return 'EXPIRED';
    if (session.user.status !== UserStatus.ACTIVE) return 'USER_INACTIVE';
    if (session.user.lockedUntil && session.user.lockedUntil > now) return 'USER_LOCKED';
    return undefined;
  }

  shouldUpdateLastSeen(lastSeenAt: Date, now: Date): boolean {
    return lastSeenAt.getTime() <= now.getTime() - this.config.auth.lastSeenUpdateSeconds * 1000;
  }
}
