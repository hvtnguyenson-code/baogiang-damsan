export interface WebPushSendPayload {
  notificationId: string;
  title: string;
  body: string;
  clickUrl?: string;
}

export interface WebPushSendParams {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  payload: WebPushSendPayload;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
}

export interface WebPushSendResult {
  success: boolean;
  statusCode?: number;
  uncertainOutcome?: boolean;
  sanitizedErrorCode?: string;
  retryAfterSeconds?: number;
}

export interface WebPushTransportPort {
  sendNotification(params: WebPushSendParams): Promise<WebPushSendResult>;
}

