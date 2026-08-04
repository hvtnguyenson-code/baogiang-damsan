import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app.config';

@Injectable()
export class LoginRateLimitService {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(@Inject('APP_CONFIG') private readonly config: AppConfig) {}

  get trackedKeyCount(): number {
    return this.attempts.size;
  }

  private pruneExpired(now: number): void {
    for (const [key, attempt] of this.attempts) {
      if (attempt.resetAt <= now) this.attempts.delete(key);
    }
  }

  private reject(): never {
    throw new HttpException('Quá nhiều lần đăng nhập. Vui lòng thử lại sau.', HttpStatus.TOO_MANY_REQUESTS);
  }

  consume(key: string, now = Date.now()): void {
    const current = this.attempts.get(key);
    if (current?.resetAt && current.resetAt <= now) {
      this.attempts.delete(key);
    }
    const active = this.attempts.get(key);
    if (!active) {
      if (this.attempts.size >= this.config.auth.loginRateLimitMaxKeys) {
        this.pruneExpired(now);
      }
      if (this.attempts.size >= this.config.auth.loginRateLimitMaxKeys) this.reject();
      this.attempts.set(key, { count: 1, resetAt: now + this.config.auth.loginRateLimitWindowSeconds * 1000 });
      return;
    }
    active.count += 1;
    if (active.count > this.config.auth.loginRateLimitMax) this.reject();
  }
}
