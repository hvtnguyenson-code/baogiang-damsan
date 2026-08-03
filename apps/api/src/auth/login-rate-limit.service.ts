import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app.config';

@Injectable()
export class LoginRateLimitService {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(@Inject('APP_CONFIG') private readonly config: AppConfig) {}

  consume(key: string, now = Date.now()): void {
    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + this.config.auth.loginRateLimitWindowSeconds * 1000 });
      return;
    }
    current.count += 1;
    if (current.count > this.config.auth.loginRateLimitMax) {
      throw new HttpException('Quá nhiều lần đăng nhập. Vui lòng thử lại sau.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
