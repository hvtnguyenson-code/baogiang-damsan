import { IncomingHttpHeaders } from 'node:http';
import { createServer, Agent } from 'node:https';
import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from 'node:crypto';
import { AddressInfo } from 'node:net';
import webPush = require('web-push');
import { WebPushHttpAdapter } from '../../src/notifications/web-push-http.adapter';
import { loopbackCertificate } from './push-receiver-fixture';

describe('Web Push loopback receiver interoperability (real transport and crypto)', () => {
  it('verifies ES256 VAPID and independently decrypts RFC8291 aes128gcm, without following redirects', async () => {
    const receiver = createECDH('prime256v1'); receiver.generateKeys();
    const auth = randomBytes(16); const vapid = webPush.generateVAPIDKeys();
    const tls = loopbackCertificate();
    const agent = new Agent({ ca: tls.cert });
    const actualSend = webPush.sendNotification;
    // Forward to the real encoder and HTTPS transport with this fixture CA only.
    const send = jest.spyOn(webPush, 'sendNotification').mockImplementation((subscription, payload, options) => actualSend(subscription, payload, { ...options, agent }));
    const requests: Array<{ url: string; headers: IncomingHttpHeaders; body: Buffer }> = [];
    const server = createServer(tls, (req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        requests.push({ url: req.url!, headers: req.headers, body: Buffer.concat(chunks) });
        if (req.url === '/redirect') res.writeHead(302, { Location: '/must-not-follow' });
        else res.writeHead(201);
        res.end();
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const payload = { title: 'Báo giảng Đam San', body: 'Bạn có thông báo mới trong hệ thống.', clickUrl: '/thong-bao' };
    const params = { endpoint: `${origin}/push`, keys: { p256dh: receiver.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
      payload, vapidPublicKey: vapid.publicKey, vapidPrivateKey: vapid.privateKey, vapidSubject: 'mailto:fixture@example.invalid' };
    try {
      const adapter = new WebPushHttpAdapter();
      expect(await adapter.sendNotification(params)).toMatchObject({ success: true, statusCode: 201 });
      const { headers, body } = requests[0];
      expect(headers['content-encoding']).toBe('aes128gcm');
      expect(body.includes(Buffer.from(payload.body))).toBe(false);
      const authorization = /^vapid t=([^,]+),\s*k=(.+)$/.exec(headers.authorization!);
      expect(authorization).not.toBeNull();
      const jwt = authorization![1].split('.');
      expect(JSON.parse(Buffer.from(jwt[0], 'base64url').toString())).toMatchObject({ alg: 'ES256' });
      const claims = JSON.parse(Buffer.from(jwt[1], 'base64url').toString()) as { aud: string; exp: number; sub: string };
      expect(claims.aud).toBe(origin); expect(claims.sub).toBe(params.vapidSubject);
      expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
      const vapidPublic = Buffer.from(authorization![2], 'base64url');
      const publicKey = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256',
        x: vapidPublic.subarray(1, 33).toString('base64url'), y: vapidPublic.subarray(33).toString('base64url') } });
      expect(verify('sha256', Buffer.from(jwt.slice(0, 2).join('.')), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(jwt[2], 'base64url'))).toBe(true);

      const hmac = (key: Buffer, input: Buffer) => createHmac('sha256', key).update(input).digest();
      const expand = (key: Buffer, info: Buffer, length: number) => hmac(key, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
      const salt = body.subarray(0, 16); const senderKey = body.subarray(21, 21 + body[20]);
      const ikm = expand(hmac(auth, receiver.computeSecret(senderKey)), Buffer.concat([Buffer.from('WebPush: info\0'), receiver.getPublicKey(), senderKey]), 32);
      const prk = hmac(salt, ikm);
      const cek = expand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
      const nonce = expand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);
      const encrypted = body.subarray(21 + body[20]);
      const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
      decipher.setAuthTag(encrypted.subarray(-16));
      const plaintext = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
      expect(plaintext[plaintext.length - 1]).toBe(2);
      expect(JSON.parse(plaintext.subarray(0, -1).toString())).toEqual(payload);

      expect(await adapter.sendNotification({ ...params, endpoint: `${origin}/redirect` })).toMatchObject({ success: false, statusCode: 302 });
      expect(requests.map(r => r.url)).toEqual(['/push', '/redirect']);
    } finally {
      send.mockRestore(); agent.destroy();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
