import { Injectable } from '@nestjs/common';
import * as webPush from 'web-push';
import {
  WebPushSendParams,
  WebPushSendResult,
  WebPushTransportPort,
} from './web-push-transport.port';

function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const num = parseInt(value, 10);
  if (!Number.isNaN(num) && num > 0) {
    return Math.min(Math.max(num, 1), 3600);
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    const diffSeconds = Math.round((dateMs - Date.now()) / 1000);
    return Math.min(Math.max(diffSeconds, 1), 3600);
  }
  return undefined;
}

export function validatePushEndpoint(endpoint: string, allowLoopback = false): boolean {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.toLowerCase();
    const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(hostname);

    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback && allowLoopback)) {
      return false;
    }
    if (isLoopback && allowLoopback) {
      return true;
    }

    // SSRF guard: Reject IPv4/IPv6 literals
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.startsWith('[') || hostname.endsWith(']')) {
      return false;
    }

    // Known reputable push service domain suffixes
    const allowedHostPatterns = [
      /(^|\.)googleapis\.com$/i,
      /(^|\.)push\.apple\.com$/i,
      /(^|\.)notify\.windows\.com$/i,
      /(^|\.)push\.services\.mozilla\.com$/i,
      /(^|\.)services\.mozilla\.com$/i,
    ];

    return allowedHostPatterns.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}

@Injectable()
export class WebPushHttpAdapter implements WebPushTransportPort {
  async sendNotification(params: WebPushSendParams): Promise<WebPushSendResult> {
    const { endpoint, keys, payload, vapidPublicKey, vapidPrivateKey, vapidSubject } = params;

    if (!endpoint || typeof endpoint !== 'string') {
      return {
        success: false,
        statusCode: 400,
        sanitizedErrorCode: 'INVALID_ENDPOINT_URL',
      };
    }

    const isTestOrDev = process.env['NODE_ENV'] === 'test' || process.env['NODE_ENV'] === 'development';
    if (!validatePushEndpoint(endpoint, isTestOrDev)) {
      return {
        success: false,
        statusCode: 400,
        sanitizedErrorCode: 'UNTRUSTED_ENDPOINT_HOST',
      };
    }

    const pushSubscription = {
      endpoint,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    };

    const payloadString = JSON.stringify({
      notificationId: payload.notificationId,
      title: payload.title,
      body: payload.body,
      clickUrl: payload.clickUrl ?? '/thong-bao',
    });

    const options: webPush.RequestOptions = {
      TTL: 86400,
      timeout: 10_000,
    };

    if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
      options.vapidDetails = {
        subject: vapidSubject,
        publicKey: vapidPublicKey,
        privateKey: vapidPrivateKey,
      };
    }

    try {
      const res = await webPush.sendNotification(pushSubscription, payloadString, options);
      return {
        success: true,
        statusCode: res.statusCode,
      };
    } catch (err: unknown) {
      if (err && typeof err === 'object') {
        const wpErr = err as {
          statusCode?: number;
          headers?: Record<string, string>;
          message?: string;
          name?: string;
        };

        const statusCode = wpErr.statusCode;
        const retryAfterHeader = wpErr.headers?.['retry-after'];
        const retryAfterSeconds = parseRetryAfter(retryAfterHeader);

        if (statusCode === 404 || statusCode === 410) {
          return {
            success: false,
            statusCode,
            sanitizedErrorCode: 'SUBSCRIPTION_EXPIRED',
          };
        }

        if (statusCode === 429) {
          return {
            success: false,
            statusCode,
            sanitizedErrorCode: 'RATE_LIMITED',
            retryAfterSeconds,
          };
        }

        if (statusCode === 401 || statusCode === 403) {
          return {
            success: false,
            statusCode,
            sanitizedErrorCode: 'PROVIDER_AUTH_ERROR',
          };
        }

        if (statusCode && statusCode >= 500) {
          return {
            success: false,
            statusCode,
            sanitizedErrorCode: 'PROVIDER_SERVER_ERROR',
            retryAfterSeconds,
          };
        }

        if (statusCode) {
          return {
            success: false,
            statusCode,
            sanitizedErrorCode: `HTTP_${statusCode}`,
          };
        }

        const msg = (wpErr.message ?? '').toLowerCase();
        const isTimeout = msg.includes('timeout') || msg.includes('abort') || wpErr.name === 'AbortError';

        return {
          success: false,
          uncertainOutcome: true,
          sanitizedErrorCode: isTimeout ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR',
        };
      }

      return {
        success: false,
        uncertainOutcome: true,
        sanitizedErrorCode: 'UNKNOWN_ERROR',
      };
    }
  }
}
