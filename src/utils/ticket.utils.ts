import * as crypto from 'crypto';

//encoding ticketCode+participantID
function base64urlEncode(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function base64urlDecode(str: string) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = 4 - (str.length % 4);
  if (pad !== 4) str += '='.repeat(pad);
  return Buffer.from(str, 'base64');
}

const KEY = process.env.QR_ENC_KEY_BASE64!; // must be a 32-byte key encoded as base64
if (!KEY) throw new Error('Set QR_ENC_KEY_BASE64 env');

function getKey() {
  return Buffer.from(KEY, 'base64'); // 32 bytes for AES-256
}

export function encryptPayload(payload: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 12 bytes recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(payload, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // 16 bytes
  // format: iv(12) || tag(16) || ciphertext
  const out = Buffer.concat([iv, tag, ciphertext]);
  return base64urlEncode(out);
}

export function decryptPayload(token: string): string {
  const key = getKey();
  const buf = base64urlDecode(token);
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const ciphertext = buf.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
