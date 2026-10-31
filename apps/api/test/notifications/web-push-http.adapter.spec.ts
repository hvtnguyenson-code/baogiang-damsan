import * as webPush from 'web-push';
import {
  validatePushEndpoint,
  WebPushHttpAdapter,
} from '../../src/notifications/web-push-http.adapter';

jest.mock('web-push');

describe('WebPushHttpAdapter & SSRF Guard (unit)', () => {
  let adapter: WebPushHttpAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new WebPushHttpAdapter();
  });

  describe('validatePushEndpoint (SSRF guard)', () => {
    it('rejects invalid or non-URL strings', () => {
      expect(validatePushEndpoint('not-a-url')).toBe(false);
      expect(validatePushEndpoint('')).toBe(false);
    });

    it('rejects plain HTTP in production', () => {
      expect(validatePushEndpoint('http://fcm.googleapis.com/fcm/send/1', false)).toBe(false);
    });

    it('rejects internal IP literals and cloud metadata services', () => {
      expect(validatePushEndpoint('https://169.254.169.254/latest/meta-data/')).toBe(false);
      expect(validatePushEndpoint('https://10.0.0.1/push')).toBe(false);
      expect(validatePushEndpoint('https://192.168.1.1/push')).toBe(false);
      expect(validatePushEndpoint('https://127.0.0.1/push', false)).toBe(false);
      expect(validatePushEndpoint('https://localhost:8080/push', false)).toBe(false);
    });

    it('allows loopback only when allowLoopback is explicitly true (dev/test)', () => {
      expect(validatePushEndpoint('http://127.0.0.1:8080/push', true)).toBe(true);
      expect(validatePushEndpoint('http://localhost:3000/push', true)).toBe(true);
      expect(validatePushEndpoint('https://localhost:3000/push', true)).toBe(true);
    });

    it('rejects arbitrary domains outside push service allowlist', () => {
      expect(validatePushEndpoint('https://attacker.evil.com/push')).toBe(false);
      expect(validatePushEndpoint('https://storage.googleapis.com/push')).toBe(false);
      expect(validatePushEndpoint('https://internal-service.local/push')).toBe(false);
    });

    it('accepts known official push service providers via HTTPS', () => {
      expect(validatePushEndpoint('https://fcm.googleapis.com/fcm/send/device-token')).toBe(true);
      expect(validatePushEndpoint('https://web.push.apple.com/send/token')).toBe(true);
      expect(validatePushEndpoint('https://db5p.notify.windows.com/w/?token=xyz')).toBe(true);
      expect(validatePushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/xyz')).toBe(true);
    });
  });

  describe('sendNotification', () => {
    const validParams = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/valid-token',
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-secret',
      },
      payload: {
        notificationId: 'n-1',
        title: 'Báo giảng',
        body: 'Thực đơn tuần mới',
        clickUrl: '/thong-bao',
      },
      vapidPublicKey: 'vapid-pub',
      vapidPrivateKey: 'vapid-priv',
      vapidSubject: 'mailto:admin@damsan.edu.vn',
    };

    it('rejects untrusted endpoints before network call', async () => {
      const res = await adapter.sendNotification({
        ...validParams,
        endpoint: 'https://malicious.site.com/push',
      });
      expect(res.success).toBe(false);
      expect(res.sanitizedErrorCode).toBe('UNTRUSTED_ENDPOINT_HOST');
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    it('succeeds when webPush.sendNotification resolves with 201', async () => {
      (webPush.sendNotification as jest.Mock).mockResolvedValue({
        statusCode: 201,
        headers: {},
        body: '',
      });

      const res = await adapter.sendNotification(validParams);
      expect(res.success).toBe(true);
      expect(res.statusCode).toBe(201);
      expect(webPush.sendNotification).toHaveBeenCalledWith(
        {
          endpoint: validParams.endpoint,
          keys: validParams.keys,
        },
        expect.any(String),
        expect.objectContaining({
          TTL: 86400,
          timeout: 10_000,
          vapidDetails: {
            subject: 'mailto:admin@damsan.edu.vn',
            publicKey: 'vapid-pub',
            privateKey: 'vapid-priv',
          },
        }),
      );
    });

    it('translates 410 Gone into SUBSCRIPTION_EXPIRED', async () => {
      (webPush.sendNotification as jest.Mock).mockRejectedValue({
        statusCode: 410,
        headers: {},
        message: 'Subscription has expired or is no longer valid',
      });

      const res = await adapter.sendNotification(validParams);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(410);
      expect(res.sanitizedErrorCode).toBe('SUBSCRIPTION_EXPIRED');
    });

    it('translates 429 Rate Limited and parses retry-after header', async () => {
      (webPush.sendNotification as jest.Mock).mockRejectedValue({
        statusCode: 429,
        headers: { 'retry-after': '120' },
        message: 'Too Many Requests',
      });

      const res = await adapter.sendNotification(validParams);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(429);
      expect(res.sanitizedErrorCode).toBe('RATE_LIMITED');
      expect(res.retryAfterSeconds).toBe(120);
    });

    it('translates 500 into PROVIDER_SERVER_ERROR', async () => {
      (webPush.sendNotification as jest.Mock).mockRejectedValue({
        statusCode: 500,
        headers: {},
        message: 'Internal Push Service Error',
      });

      const res = await adapter.sendNotification(validParams);
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(500);
      expect(res.sanitizedErrorCode).toBe('PROVIDER_SERVER_ERROR');
    });

    it('translates network timeout into NETWORK_TIMEOUT with uncertainOutcome', async () => {
      (webPush.sendNotification as jest.Mock).mockRejectedValue(new Error('Socket timeout while sending'));

      const res = await adapter.sendNotification(validParams);
      expect(res.success).toBe(false);
      expect(res.uncertainOutcome).toBe(true);
      expect(res.sanitizedErrorCode).toBe('NETWORK_TIMEOUT');
    });
  });
});
