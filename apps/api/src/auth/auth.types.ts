import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest extends Request {
  auth?: {
    sessionId: string;
    rawToken: string;
    user: AuthenticatedUser;
  };
}

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}
