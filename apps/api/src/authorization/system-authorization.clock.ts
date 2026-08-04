import { Injectable } from '@nestjs/common';
import { AuthorizationClock } from './authorization.types';

@Injectable()
export class SystemAuthorizationClock implements AuthorizationClock {
  now(): Date {
    return new Date();
  }
}
