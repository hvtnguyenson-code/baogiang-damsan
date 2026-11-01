import {
  computeEndpointDigest,
  decryptAtRest,
  deriveEncryptionKey,
  encryptAtRest,
} from '../../src/notifications/web-push-encryption.util';

describe('web-push-encryption.util (unit)', () => {
  const secretKey = deriveEncryptionKey('test-encryption-key-for-web-push-unit-test');

  it('encrypts and decrypts endpoint and keys correctly', () => {
    const original = 'https://fcm.googleapis.com/fcm/send/sample-token-12345';
    const ciphertext = encryptAtRest(original, secretKey);

    expect(ciphertext).not.toContain(original);
    expect(ciphertext.split(':')).toHaveLength(3);

    const decrypted = decryptAtRest(ciphertext, secretKey);
    expect(decrypted).toBe(original);
  });

  it('produces different ciphertexts for identical plaintext due to random IV', () => {
    const text = 'https://updates.push.services.mozilla.com/wpush/v2/test';
    const c1 = encryptAtRest(text, secretKey);
    const c2 = encryptAtRest(text, secretKey);

    expect(c1).not.toBe(c2);
    expect(decryptAtRest(c1, secretKey)).toBe(text);
    expect(decryptAtRest(c2, secretKey)).toBe(text);
  });

  it('throws on tampered ciphertext', () => {
    const original = 'p256dh-sample-key';
    const ciphertext = encryptAtRest(original, secretKey);
    const parts = ciphertext.split(':');
    // Tamper with data portion
    const tampered = `${parts[0]}:${parts[1]}:bad${parts[2].slice(3)}`;

    expect(() => decryptAtRest(tampered, secretKey)).toThrow();
  });

  it('computes deterministic SHA-256 endpoint digest', () => {
    const endpoint = 'https://push.example.com/sub/1';
    const d1 = computeEndpointDigest(endpoint);
    const d2 = computeEndpointDigest(endpoint);
    const d3 = computeEndpointDigest('https://push.example.com/sub/2');

    expect(d1).toBe(d2);
    expect(d1).toHaveLength(64);
    expect(d1).not.toBe(d3);
  });
});

