import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';

export interface PlatformSettings {
  plan_amount: number;
  plan_currency: string;
  plan_name: string;
}

// Fallback used if the platform_settings row hasn't been created yet.
const FALLBACK: PlatformSettings = {
  plan_amount: Number(process.env.MERCADOPAGO_PLAN_AMOUNT ?? '199'),
  plan_currency: process.env.MERCADOPAGO_PLAN_CURRENCY ?? 'MXN',
  plan_name: 'Kuik Pro',
};

/**
 * The platform subscription pricing, configured by the super-admin. Read with
 * the service-role client so it works for anonymous visitors (the landing page)
 * and authenticated owners (the billing page) alike. Cached per request.
 */
export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('platform_settings')
      .select('plan_amount, plan_currency, plan_name')
      .eq('id', 1)
      .maybeSingle<PlatformSettings>();
    return data ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
});
