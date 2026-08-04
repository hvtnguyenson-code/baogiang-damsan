import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { AppConfig } from '../config/app.config';

@Injectable()
export class PasswordService {
  private readonly dummyHash: Promise<string>;

  constructor(@Inject('APP_CONFIG') private readonly config: AppConfig) {
    this.dummyHash = this.hash(randomBytes(32).toString('base64url'));
  }

  validatePolicy(password: string): void {
    if (password.length < this.config.auth.passwordMinLength) {
      throw new Error(`Mật khẩu mới phải có ít nhất ${this.config.auth.passwordMinLength} ký tự.`);
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      throw new Error('Mật khẩu mới phải có chữ thường, chữ hoa và chữ số.');
    }
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password).catch(() => false);
  }

  async verifyUnknown(password: string): Promise<void> {
    await this.verify(await this.dummyHash, password);
  }
}
