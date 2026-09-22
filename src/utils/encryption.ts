import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';

/**
 * Derives a 256-bit (32-byte) key from the configured ENCRYPTION_SECRET.
 */
function getDerivedKey(): Buffer {
  const secret = env.ENCRYPTION_SECRET || 'swaati_enterprise_super_secure_encryption_secret_2026';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts plain text using AES-256-GCM authenticated encryption.
 * Returns formatted string: ivHex:ciphertextHex:authTagHex
 */
export function encryptPassword(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getDerivedKey(), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypts an AES-256-GCM cipher payload string.
 * Returns the original plain text password or null if invalid/corrupted.
 */
export function decryptPassword(cipherPayload?: string | null): string | null {
  if (!cipherPayload) return null;
  try {
    const parts = cipherPayload.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, encryptedHex, authTagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getDerivedKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    console.warn('[Encryption] Failed to decrypt password payload:', err.message);
    return null;
  }
}
