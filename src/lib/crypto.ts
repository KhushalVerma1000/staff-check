import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * AES-256-GCM field encryption for ID, statutory and bank numbers.
 * Format: "v1:<iv>:<tag>:<ciphertext>" (base64). A fresh IV per value, so the
 * same number encrypts differently each time. Rotating the key means
 * re-encrypting rows, which the "v1" prefix leaves room for.
 */
function keyFrom(b64?: string): Buffer {
  const raw = b64 ?? env().KYC_ENCRYPTION_KEY;
  if (!raw) throw new Error('KYC_ENCRYPTION_KEY is not set (openssl rand -base64 32).');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('KYC_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
  return key;
}

export function encryptField(plain: string, keyB64?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFrom(keyB64), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decryptField(stored: string, keyB64?: string): string {
  const [v, iv, tag, ct] = stored.split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unrecognised encrypted value.');
  const d = createDecipheriv('aes-256-gcm', keyFrom(keyB64), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}
