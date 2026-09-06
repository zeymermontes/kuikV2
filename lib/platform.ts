import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';

export interface PlatformSettings {
  plan_amount: number; // basic
  plan_currency: string;
  plan_name: string; // basic name
  pro_amount: number;
  pro_name: string;
  extra_amount: number; // per additional restaurant
  /** Kuik's cut of each online menu payment, on top of the gateway's fee (0066). */
  payment_fee_percent: number;
  /** The same cut on the higher tier; null = same as payment_fee_percent (0069). */
  pro_payment_fee_percent: number | null;
  /** The point-of-sale add-on: register, kitchen screen, printing, customer screen (0069). */
  pos_addon_amount: number;
  pos_addon_name: string;
}

// Fallback used if the platform_settings row hasn't been created yet.
const FALLBACK: PlatformSettings = {
  plan_amount: Number(process.env.MERCADOPAGO_PLAN_AMOUNT ?? '299'),
  plan_currency: process.env.MERCADOPAGO_PLAN_CURRENCY ?? 'MXN',
  plan_name: 'Menú',
  pro_amount: Number(process.env.MERCADOPAGO_PRO_AMOUNT ?? '499'),
  pro_name: 'Restaurante',
  extra_amount: Number(process.env.MERCADOPAGO_EXTRA_AMOUNT ?? '299'),
  payment_fee_percent: 0,
  pro_payment_fee_percent: null,
  pos_addon_amount: Number(process.env.MERCADOPAGO_POS_AMOUNT ?? '499'),
  pos_addon_name: 'Punto de venta',
};

/**
 * The platform subscription pricing, configured by the super-admin. Read with
 * the service-role client so it works for anonymous visitors (the landing page)
 * and authenticated owners (the billing page) alike. Cached per request.
 */
export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  try {
    const supabase = createAdminClient();
    const query = supabase
      .from('platform_settings')
      .select('plan_amount, plan_currency, plan_name, pro_amount, pro_name, extra_amount, payment_fee_percent, pro_payment_fee_percent, pos_addon_amount, pos_addon_name')
      .eq('id', 1)
      .maybeSingle<PlatformSettings>();
    // Never let a slow DB hang the marketing page — fall back after 3s.
    const timeout = new Promise<{ data: null }>((resolve) =>
      setTimeout(() => resolve({ data: null }), 3000),
    );
    const { data } = await Promise.race([query, timeout]);
    if (!data) return FALLBACK;
    const d = data as Partial<PlatformSettings>;
    return {
      ...FALLBACK,
      ...d,
      payment_fee_percent: Number(d.payment_fee_percent ?? 0),
      pro_payment_fee_percent: d.pro_payment_fee_percent == null ? null : Number(d.pro_payment_fee_percent),
      pos_addon_amount: Number(d.pos_addon_amount ?? FALLBACK.pos_addon_amount),
      pos_addon_name: d.pos_addon_name || FALLBACK.pos_addon_name,
    };
  } catch {
    return FALLBACK;
  }
});
