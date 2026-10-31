import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import {
  WebPushSendParams,
  WebPushSendResult,
  WebPushTransportPort,
} from './web-push-transport.port';

function base64UrlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const num = parseInt(value, 10);
  if (!Number.isNaN(num) && num > 0) {
    // Bounded between 1 and 3600 seconds
    return Math.min(Math.max(num, 1), 3600);
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    const diffSeconds = Math.round((dateMs - Date.now()) / 1000);
    return Math.min(Math.max(diffSeconds, 1), 3600);
  }
  return undefined;
}

@Injectable()
export class WebPushHttpAdapter implements WebPushTransportPort {
  private readonly logger = new Logger(WebPushHttpAdapter.name);

  async sendNotification(params: WebPushSendParams): Promise<WebPushSendResult> {
    const { endpoint, payload, vapidPublicKey, vapidPrivateKey, vapidSubject } = params;

    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return {
        success: false,
        statusCode: 400,
        sanitizedErrorCode: 'INVALID_ENDPOINT_URL',
      };
    }

    // SSRF guard: HTTPS required unless loopback in test/dev
    const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase());
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
      return {
        success: false,
        statusCode: 400,
        sanitizedErrorCode: 'INSECURE_ENDPOINT_PROTOCOL',
      };
    }

    const headers: Record<string, string> = {
      TTL: '86400',
      'Content-Type': 'application/json',
    };

    // Generic VAPID header if keys configured
    if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
      try {
        const origin = `${url.protocol}//${url.host}`;
        const jwtHeader = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
        const jwtClaims = base64UrlEncode(
          JSON.stringify({
            aud: origin,
            exp: Math.floor(Date.now() / 1000) + 12 * 3600,
            sub: vapidSubject,
          }),
        );
        const signingInput = `${jwtHeader}.${jwtClaims}`;

        let signature: string;
        try {
          const signer = crypto.createSign('SHA256');
          signer.update(signingInput);
          const sigBuf = signer.sign({
            key: vapidPrivateKey,
            dsaEncoding: 'ieee-p1363',
          });
          signature = base64UrlEncode(sigBuf);
        } catch {
          // Fallback if key is in another format
          const hmac = crypto.createHmac('sha256', vapidPrivateKey);
          hmac.update(signingInput);
          signature = base64UrlEncode(hmac.digest());
        }

        const token = `${signingInput}.${signature}`;
        headers['Authorization'] = `vapid t=${token}, k=${vapidPublicKey}`;
      } catch (err) {
        this.logger.warn(`Failed to generate VAPID header: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Generic sanitized payload according to P5-056A (no PII, no sensitive details)
    const bodyString = JSON.stringify({
      notificationId: payload.notificationId,
      title: payload.title,
      body: payload.body,
      clickUrl: payload.clickUrl ?? '/thong-bao',
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: bodyString,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status >= 200 && res.status < 300) {
        return { success: true, statusCode: res.status };
      }

      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterSeconds = parseRetryAfter(retryAfterHeader);

      if (res.status === 404 || res.status === 410) {
        return {
          success: false,
          statusCode: res.status,
          sanitizedErrorCode: 'SUBSCRIPTION_EXPIRED',
        };
      }

      if (res.status === 429) {
        return {
          success: false,
          statusCode: res.status,
          sanitizedErrorCode: 'RATE_LIMITED',
          retryAfterSeconds,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          statusCode: res.status,
          sanitizedErrorCode: 'PROVIDER_AUTH_ERROR',
        };
      }

      if (res.status >= 500) {
        return {
          success: false,
          statusCode: res.status,
          sanitizedErrorCode: 'PROVIDER_SERVER_ERROR',
          retryAfterSeconds,
        };
      }

      return {
        success: false,
        statusCode: res.status,
        sanitizedErrorCode: `HTTP_${res.status}`,
      };
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('timeout') || err.message.includes('abort'));
      return {
        success: false,
        uncertainOutcome: true,
        sanitizedErrorCode: isTimeout ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR',
      };
    }
  }
}

