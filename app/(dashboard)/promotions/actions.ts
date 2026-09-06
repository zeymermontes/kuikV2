'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { revalidateTenant } from '@/lib/revalidate';
import type { PromotionChannel, PromotionKind, PromotionScope } from '@/lib/database.types';

export interface PromotionInput {
  id?: string;
  name: string;
  kind: PromotionKind;
  value: number;
  scope: PromotionScope;
  category_ids: string[];
  product_ids: string[];
  code: string | null;
  min_subtotal: number | null;
  days: number[];
  start_time: string | null;
  end_time: string | null;
  starts_on: string | null;
  ends_on: string | null;
  channels: PromotionChannel[];
  stackable: boolean;
  active: boolean;
}

const KINDS: PromotionKind[] = ['percent', 'amount', 'bogo'];
const SCOPES: PromotionScope[] = ['order', 'category', 'product'];
const CHANNELS: PromotionChannel[] = ['pos', 'menu'];
const UUID = /^[0-9a-f-]{36}$/i;
const HHMM = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Create or update a promotion. Everything is checked here; the forms only help. */
export async function savePromotion(input: PromotionInput): Promise<{ error?: string }> {
  const { tenant } = await requireManager();
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: 'name' };
  if (!KINDS.includes(input.kind) || !SCOPES.includes(input.scope)) return { error: 'kind' };
  const value = Math.max(0, Number(input.value) || 0);
  if (input.kind === 'percent' && value > 100) return { error: 'value' };
  if (input.kind !== 'bogo' && value <= 0) return { error: 'value' };
  const code = input.code?.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40) || null;
  const row = {
    tenant_id: tenant.id,
    name,
    kind: input.kind,
    value,
    scope: input.scope,
    category_ids: input.scope === 'category' ? input.category_ids.filter((x) => UUID.test(x)) : [],
    product_ids: input.scope === 'product' ? input.product_ids.filter((x) => UUID.test(x)) : [],
    code,
    min_subtotal: input.min_subtotal != null && input.min_subtotal > 0 ? input.min_subtotal : null,
    days: [...new Set(input.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))],
    start_time: input.start_time && HHMM.test(input.start_time) ? input.start_time : null,
    end_time: input.end_time && HHMM.test(input.end_time) ? input.end_time : null,
    starts_on: input.starts_on && DATE.test(input.starts_on) ? input.starts_on : null,
    ends_on: input.ends_on && DATE.test(input.ends_on) ? input.ends_on : null,
    channels: input.channels.filter((c) => CHANNELS.includes(c)),
    stackable: !!input.stackable,
    active: !!input.active,
    updated_at: new Date().toISOString(),
  };
  if (row.channels.length === 0) return { error: 'channels' };
  if ((row.scope === 'category' && row.category_ids.length === 0) || (row.scope === 'product' && row.product_ids.length === 0)) return { error: 'scope' };

  const supabase = await createClient();
  const { error } = input.id
    ? await supabase.from('promotions').update(row).eq('tenant_id', tenant.id).eq('id', input.id)
    : await supabase.from('promotions').insert(row);
  if (error) return { error: error.code === '23505' ? 'code_taken' : error.message };
  revalidatePath('/promotions');
  revalidateTenant(tenant.subdomain, tenant.custom_domain);
  return {};
}

export async function deletePromotion(id: string) {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('promotions').delete().eq('tenant_id', tenant.id).eq('id', id);
  revalidatePath('/promotions');
  revalidateTenant(tenant.subdomain, tenant.custom_domain);
}
