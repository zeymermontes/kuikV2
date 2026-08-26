import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for secrets we must store but must not read back by
 * accident — WhatsApp access tokens, per-tenant AI API keys.
 *
 * Why not `pgp_sym_encrypt`? pgcrypto is available (0001_init.sql enables it),
 * but the key would travel inside the SQL statement and land in
 * `pg_stat_statements`, in the Supabase query log, and in any slow-query trace.
 * Encrypting in the app keeps the key in process memory only, so a database
 * dump on its own is useless.
 */

const KEY_ENV = 'KUIK_SECRET_KEY';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // 96 bits, the GCM standard

export const CURRENT_KEY_VERSION = 1;

export interface SealedSecret {
  ct: Buffer;
  iv: Buffer;
  tag: Buffer;
  version: number;
}

function keyFor(version: number): Buffer {
  // Rotation lives here: add v2 as a second env var, keep v1 readable, and a
  // background job re-seals rows at its leisure. No migration involved.
  if (version !== CURRENT_KEY_VERSION) {
    throw new Error(`No key configured for version ${version}`);
  }
  const raw = process.env[KEY_ENV];
  if (!raw) throw new Error(`${KEY_ENV} is not set`);

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must be 32 bytes of base64 (got ${key.length})`);
  }
  return key;
}

/**
 * Encrypt `plaintext`, binding it to `aad`.
 *
 * `aad` must be the row's own identity — the `phone_number_id` for a WhatsApp
 * token, the `tenant_id` for an AI key. It is authenticated but not encrypted,
 * so a ciphertext copied into a different row fails to open rather than
 * silently handing that row someone else's credentials.
 */
export function seal(plaintext: string, aad: string): SealedSecret {
  if (!aad) throw new Error('seal() requires an aad to bind the ciphertext to its row');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, keyFor(CURRENT_KEY_VERSION), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ct, iv, tag: cipher.getAuthTag(), version: CURRENT_KEY_VERSION };
}

/** Decrypt. Throws if the key, the tag or the aad don't match. */
export function open(sealed: SealedSecret, aad: string): string {
  const decipher = createDecipheriv(ALGO, keyFor(sealed.version), sealed.iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(sealed.tag);
  return Buffer.concat([decipher.update(sealed.ct), decipher.final()]).toString('utf8');
}

/** Last four characters, for showing "…a1b2" in the dashboard. */
export function last4(secret: string): string {
  return secret.slice(-4);
}
