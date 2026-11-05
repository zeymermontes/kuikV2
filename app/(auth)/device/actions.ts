'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bucketKey, clientIp, rateLimit } from '@/lib/rate-limit';
import { cleanCode, isCode } from '@/lib/devices/code';
import { redeemCode, removeDeviceLogin } from '@/lib/devices/server';
import type { DeviceBranch } from '@/lib/pos/branch';

export interface LinkResult {
  error?: 'invalid' | 'rate' | 'failed';
  ok?: true;
  /** Where the device was told to work; null = the main location. */
  branch?: DeviceBranch | null;
}

// Per address: room for a few typos, none for guessing.
const TRIES = 8;
const TRIES_WINDOW_S = 10 * 60;
// Across every address: a guesser spread over many of them still meets this.
// Far above what restaurants linking tablets could add up to in an hour.
const ALL_TRIES = 2000;
const ALL_WINDOW_S = 60 * 60;

/**
 * Join this device to a restaurant with the code its owner generated
 * (Equipo → Dispositivos). On success the browser holds the device's own
 * session and the page moves on to the hub.
 *
 * Anyone can call this, signed in or not: the code is the whole credential.
 * It is eight symbols of thirty-two, used once and gone in a day; what keeps
 * it from being guessed is the two limits above.
 */
export async function linkDevice(_prev: LinkResult, formData: FormData): Promise<LinkResult> {
  const ip = clientIp({ headers: await headers() });
  const [mine, all] = await Promise.all([
    rateLimit(bucketKey('device-link:ip', ip, TRIES_WINDOW_S), TRIES, TRIES_WINDOW_S),
    rateLimit(bucketKey('device-link:all', 'all', ALL_WINDOW_S), ALL_TRIES, ALL_WINDOW_S),
  ]);
  if (!mine.ok || !all.ok) return { error: 'rate' };

  const code = cleanCode(String(formData.get('code') ?? ''));
  // One answer for mistyped, used and expired: none of them says which codes exist.
  if (!isCode(code)) return { error: 'invalid' };

  const redeemed = await redeemCode(code);
  if (!redeemed.ok) return { error: redeemed.reason };
  const { device, email, password } = redeemed;

  // The only time this password is used: from here on the device lives on
  // its session. A session already in this browser is replaced, not signed
  // out: signing it out would end that person's sessions everywhere.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // A login nobody can use is worse than none; the owner issues a new code.
    if (device.user_id) await removeDeviceLogin(device.user_id);
    return { error: 'failed' };
  }

  let branch: DeviceBranch | null = null;
  if (device.branch_id) {
    const { data } = await createAdminClient()
      .from('branches')
      .select('id, name, slug')
      .eq('id', device.branch_id)
      .eq('tenant_id', device.tenant_id)
      .maybeSingle<DeviceBranch>();
    branch = data ?? null;
  }
  return { ok: true, branch };
}
