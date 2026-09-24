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
  /**
   * A number registered in the restaurant's OWN Meta app: its webhooks are
   * signed with that app's secret and its handshake repeats a verify token of
   * ours. Both live on the same row so the webhook can find them by
   * phone_number_id.
   */
  ownApp?: { appSecret: string; verifyToken: string },
): Promise<void> {
  const sealed = seal(token, phoneNumberId);
  const secret = ownApp ? seal(ownApp.appSecret, phoneNumberId) : null;
  const supabase = createAdminClient();
  await supabase.from('whatsapp_credentials').upsert(
    {
      phone_number_id: phoneNumberId,
      tenant_id: tenantId,
      waba_id: wabaId,
      token_ct: hex(sealed.ct),
      token_iv: hex(sealed.iv),
      token_tag: hex(sealed.tag),
      key_version: sealed.version,
      expires_at: expiresAt?.toISOString() ?? null,
      rotated_at: new Date().toISOString(),
      app_secret_ct: secret ? hex(secret.ct) : null,
      app_secret_iv: secret ? hex(secret.iv) : null,
      app_secret_tag: secret ? hex(secret.tag) : null,
      webhook_verify_token: ownApp?.verifyToken ?? null,
    },
    { onConflict: 'phone_number_id' },
  );
}

const hex = (b: Buffer) => `\\x${b.toString('hex')}`;

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

/**
 * The app secrets behind these numbers, for verifying a webhook that Kuik's
 * own secret did not sign. Numbers connected through Kuik's app have none and
 * are simply absent from the result.
 */
export async function getAppSecrets(phoneNumberIds: string[], wabaIds: string[] = []): Promise<string[]> {
  if (phoneNumberIds.length === 0 && wabaIds.length === 0) return [];
  const supabase = createAdminClient();
  let q = supabase
    .from('whatsapp_credentials')
    .select('phone_number_id, app_secret_ct, app_secret_iv, app_secret_tag, key_version')
    .not('app_secret_ct', 'is', null);
  // An account-level event (template status) names the WABA, not the number.
  q = phoneNumberIds.length && wabaIds.length
    ? q.or(`phone_number_id.in.(${phoneNumberIds.join(',')}),waba_id.in.(${wabaIds.join(',')})`)
    : phoneNumberIds.length
      ? q.in('phone_number_id', phoneNumberIds)
      : q.in('waba_id', wabaIds);
  const { data } = await q;

  const out: string[] = [];
  for (const row of (data ?? []) as {
    phone_number_id: string; app_secret_ct: unknown; app_secret_iv: unknown; app_secret_tag: unknown; key_version: number;
  }[]) {
    try {
      out.push(open(
        {
          ct: fromBytea(row.app_secret_ct),
          iv: fromBytea(row.app_secret_iv),
          tag: fromBytea(row.app_secret_tag),
          version: row.key_version ?? CURRENT_KEY_VERSION,
        },
        row.phone_number_id,
      ));
    } catch {
      // Same rule as getToken: a row that will not open is not guessed at.
    }
  }
  return out;
}

/** Whether some number's own-app handshake uses this verify token. */
export async function isKnownVerifyToken(token: string): Promise<boolean> {
  if (!token) return false;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('whatsapp_credentials')
    .select('phone_number_id')
    .eq('webhook_verify_token', token)
    .limit(1);
  return Boolean(data && data.length > 0);
}

/** The verify token to show the owner, so they can paste it into their Meta app. */
export async function getVerifyToken(phoneNumberId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('whatsapp_credentials')
    .select('webhook_verify_token')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();
  return (data as { webhook_verify_token: string | null } | null)?.webhook_verify_token ?? null;
}

export async function deleteToken(phoneNumberId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('whatsapp_credentials').delete().eq('phone_number_id', phoneNumberId);
}
