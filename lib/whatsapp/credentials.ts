import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { seal, open, CURRENT_KEY_VERSION } from '@/lib/crypto';

/**
 * The ONLY way an access token leaves the database.
 *
 * Tokens live in whatsapp_credentials, a table with RLS enabled and no policies
 * at all — unreachable by anon or authenticated, service role only — and they
 * are stored sealed, bound to their own phone_number_id. Both halves matter: a
 * stolen database dump is useless without the key, and a ciphertext copied into
 * another row fails to open rather than handing over someone else's account.
 */

export async function storeToken(
  phoneNumberId: string,
  tenantId: string,
  wabaId: string,
  token: string,
  expiresAt?: Date | null,
): Promise<void> {
  const sealed = seal(token, phoneNumberId);
  const supabase = createAdminClient();
  await supabase.from('whatsapp_credentials').upsert(
    {
      phone_number_id: phoneNumberId,
      tenant_id: tenantId,
      waba_id: wabaId,
      token_ct: `\\x${sealed.ct.toString('hex')}`,
      token_iv: `\\x${sealed.iv.toString('hex')}`,
      token_tag: `\\x${sealed.tag.toString('hex')}`,
      key_version: sealed.version,
      expires_at: expiresAt?.toISOString() ?? null,
      rotated_at: new Date().toISOString(),
    },
    { onConflict: 'phone_number_id' },
  );
}

/** Postgres hands bytea back as "\x<hex>". */
function fromBytea(v: unknown): Buffer {
  const s = String(v ?? '');
  return Buffer.from(s.startsWith('\\x') ? s.slice(2) : s, 'hex');
}

export async function getToken(phoneNumberId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('whatsapp_credentials')
    .select('token_ct, token_iv, token_tag, key_version')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();
  if (!data) return null;

  const row = data as {
    token_ct: unknown; token_iv: unknown; token_tag: unknown; key_version: number;
  };
  try {
    return open(
      {
        ct: fromBytea(row.token_ct),
        iv: fromBytea(row.token_iv),
        tag: fromBytea(row.token_tag),
        version: row.key_version ?? CURRENT_KEY_VERSION,
      },
      phoneNumberId,
    );
  } catch {
    // Wrong key, tampered row, or a ciphertext moved between rows. Refusing to
    // guess is the whole point.
    return null;
  }
}

export async function deleteToken(phoneNumberId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('whatsapp_credentials').delete().eq('phone_number_id', phoneNumberId);
}
