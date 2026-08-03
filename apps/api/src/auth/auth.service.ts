import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditResult, UserStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/app.config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, RequestMeta } from './auth.types';
import { PasswordService } from './password.service';
import { SessionTokenService } from './session-token.service';
import { AuthPolicyService } from './auth-policy.service';

const INVALID_CREDENTIALS = 'Tên đăng nhập hoặc mật khẩu không hợp lệ.';

export interface LoginResult {
  rawToken: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: SessionTokenService,
    private readonly audit: AuditService,
    private readonly policy: AuthPolicyService,
    @Inject('APP_CONFIG') private readonly config: AppConfig,
  ) {}

  private fingerprint(username: string): string {
    return createHash('sha256').update(username).digest('hex').slice(0, 16);
  }

  private publicUser(user: {
    id: string;
    username: string;
    mustChangePassword: boolean;
    profile: { displayName: string } | null;
  }): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.profile?.displayName ?? user.username,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async login(usernameInput: string, password: string, meta: RequestMeta): Promise<LoginResult> {
    const username = usernameInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { profile: true },
    });
    if (!user) {
      await this.passwords.verifyUnknown(password);
      await this.audit.write({
        action: 'AUTH_LOGIN_FAILURE', entityType: 'User', result: AuditResult.DENIED,
        requestId: meta.requestId,
        metadata: { usernameFingerprint: this.fingerprint(username), reasonCode: 'INVALID_CREDENTIALS' },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const now = new Date();
    const passwordValid = await this.passwords.verify(user.passwordHash, password);
    const activeLock = user.lockedUntil !== null && user.lockedUntil > now;
    if (!passwordValid || user.status !== UserStatus.ACTIVE || activeLock) {
      await this.recordFailedLogin(user.id, passwordValid, user.status, activeLock, meta, now);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const rawToken = this.tokens.generate();
    const tokenHash = this.tokens.hash(rawToken);
    const expiresAt = new Date(now.getTime() + this.config.auth.sessionTtlSeconds * 1000);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
      });
      await tx.authSession.create({
        data: {
          userId: user.id, tokenHash, expiresAt, lastSeenAt: now,
          ipAddress: meta.ipAddress?.slice(0, 45), userAgent: meta.userAgent?.slice(0, 500),
        },
      });
      await this.audit.write({
        actorUserId: user.id, action: 'AUTH_LOGIN_SUCCESS', entityType: 'AuthSession',
        requestId: meta.requestId, result: AuditResult.SUCCESS,
        metadata: { usernameFingerprint: this.fingerprint(username) },
      }, tx);
    });
    return { rawToken, expiresAt, user: this.publicUser(user) };
  }

  private async recordFailedLogin(
    userId: string,
    passwordValid: boolean,
    status: UserStatus,
    activeLock: boolean,
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const shouldCount = !passwordValid && status === UserStatus.ACTIVE && !activeLock;
      const current = shouldCount
        ? await tx.user.update({ where: { id: userId }, data: { failedLoginCount: { increment: 1 } } })
        : await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const failedLoginCount = current.failedLoginCount;
      const policyLockUntil = shouldCount ? this.policy.lockUntil(failedLoginCount, now) : null;
      const shouldLock = policyLockUntil !== null;
      const lockedUntil = policyLockUntil ?? current.lockedUntil;
      if (shouldLock) {
        await tx.user.update({ where: { id: userId }, data: { lockedUntil } });
      }
      await this.audit.write({
        actorUserId: userId,
        action: shouldLock || activeLock ? 'AUTH_LOGIN_LOCKED' : 'AUTH_LOGIN_FAILURE',
        entityType: 'User', entityId: userId, requestId: meta.requestId,
        result: AuditResult.DENIED,
        metadata: { reasonCode: shouldLock || activeLock ? 'TEMPORARILY_LOCKED' : 'INVALID_CREDENTIALS' },
      }, tx);
    });
  }

  async authenticate(rawToken: string, meta: RequestMeta): Promise<{ sessionId: string; user: AuthenticatedUser }> {
    const tokenHash = this.tokens.hash(rawToken);
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash }, include: { user: { include: { profile: true } } },
    });
    const now = new Date();
    let reasonCode: string | undefined;
    if (!session) reasonCode = 'INVALID';
    else reasonCode = this.policy.sessionRejection(session, now);
    if (!session || reasonCode) {
      await this.audit.write({
        actorUserId: session?.userId, action: 'AUTH_SESSION_REJECTED', entityType: 'AuthSession',
        entityId: session?.id, requestId: meta.requestId, result: AuditResult.DENIED,
        metadata: { reasonCode: reasonCode ?? 'INVALID' },
      });
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
    const updateBefore = new Date(now.getTime() - this.config.auth.lastSeenUpdateSeconds * 1000);
    if (this.policy.shouldUpdateLastSeen(session.lastSeenAt, now)) {
      await this.prisma.authSession.updateMany({
        where: { id: session.id, lastSeenAt: { lte: updateBefore }, revokedAt: null },
        data: { lastSeenAt: now },
      });
    }
    return { sessionId: session.id, user: this.publicUser(session.user) };
  }

  async logout(sessionId: string, userId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.write({ actorUserId: userId, action: 'AUTH_LOGOUT', entityType: 'AuthSession', entityId: sessionId, requestId: meta.requestId, result: AuditResult.SUCCESS }, tx);
    });
  }

  async logoutAll(userId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.write({ actorUserId: userId, action: 'AUTH_LOGOUT_ALL', entityType: 'User', entityId: userId, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata: { revokedSessionCount: result.count } }, tx);
    });
  }

  async changePassword(userId: string, sessionId: string, currentPassword: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException('Mật khẩu hiện tại không hợp lệ.');
    }
    try {
      this.passwords.validatePolicy(newPassword);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Mật khẩu mới không hợp lệ.');
    }
    if (await this.passwords.verify(user.passwordHash, newPassword)) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null } });
      const revoked = await tx.authSession.updateMany({ where: { userId, id: { not: sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.write({ actorUserId: userId, action: 'AUTH_PASSWORD_CHANGED', entityType: 'User', entityId: userId, requestId: meta.requestId, result: AuditResult.SUCCESS, metadata: { otherSessionsRevoked: revoked.count } }, tx);
    });
  }
}
