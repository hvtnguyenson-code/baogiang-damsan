import { generateKeyPairSync, sign } from 'node:crypto';

// Disposable self-signed CA/leaf, generated in memory for a loopback TLS receiver.
// No checked-in private key or global TLS verification override is used.
export function loopbackCertificate() {
  const der = (tag: number, ...parts: Buffer[]) => {
    const body = Buffer.concat(parts);
    const length = body.length < 128 ? Buffer.from([body.length])
      : body.length < 256 ? Buffer.from([0x81, body.length]) : Buffer.from([0x82, body.length >> 8, body.length & 255]);
    return Buffer.concat([Buffer.from([tag]), length, body]);
  };
  const seq = (...parts: Buffer[]) => der(0x30, ...parts);
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const algorithm = seq(Buffer.from('06092a864886f70d01010b0500', 'hex'));
  const name = seq(der(0x31, seq(Buffer.from('0603550403', 'hex'), der(0x0c, Buffer.from('Push receiver fixture')))));
  const extensions = der(0xa3, seq(
    seq(Buffer.from('0603551d11', 'hex'), der(4, seq(der(0x87, Buffer.from([127, 0, 0, 1]))))),
    seq(Buffer.from('0603551d13', 'hex'), Buffer.from([1, 1, 255]), der(4, seq(Buffer.from([1, 1, 255])))),
  ));
  const tbs = seq(der(0xa0, der(2, Buffer.from([2]))), der(2, Buffer.from([1])), algorithm, name,
    seq(der(0x17, Buffer.from('200101000000Z')), der(0x17, Buffer.from('491231235959Z'))), name,
    publicKey.export({ format: 'der', type: 'spki' }), extensions);
  const certificate = seq(tbs, algorithm, der(3, Buffer.from([0]), sign('sha256', tbs, privateKey)));
  const cert = `-----BEGIN CERTIFICATE-----\n${certificate.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`;
  return { cert, key: privateKey.export({ format: 'pem', type: 'pkcs8' }) };
}
