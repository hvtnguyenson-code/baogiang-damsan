import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class SessionTokenService {
  private static readonly TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  isValid(token: string): boolean {
    return SessionTokenService.TOKEN_PATTERN.test(token) && Buffer.from(token, 'base64url').length === 32;
  }
}
