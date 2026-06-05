'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUser, getOwnerTenant } from '@/lib/auth';
import { RESERVED_SUBDOMAINS } from '@/lib/config';
import { digitsOnly } from '@/lib/utils';

export interface OnboardingResult {
  error?: string;
}

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

export async function createTenant(
  _prev: OnboardingResult,
  formData: FormData,
): Promise<OnboardingResult> {
  const user = await requireUser();

  // One tenant per owner in MVP.
  if (await getOwnerTenant(user.id)) redirect('/dashboard');

  const name = String(formData.get('name') ?? '').trim();
  const subdomain = String(formData.get('subdomain') ?? '').trim().toLowerCase();
  const whatsapp = digitsOnly(String(formData.get('whatsapp') ?? ''));

  if (!name) return { error: 'name' };
  if (!SUBDOMAIN_RE.test(subdomain) || RESERVED_SUBDOMAINS.has(subdomain)) {
    return { error: 'subdomainInvalid' };
  }

  const supabase = await createClient();

  const { data: tenant, error } = await supabase
    .from('tenants')
    .insert({ owner_id: user.id, name, subdomain, locale: user.profile.locale })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'subdomainTaken' };
    return { error: error.message };
  }

  // The on_tenant_created trigger has already created the contact row; update it.
  if (whatsapp) {
    await supabase
      .from('tenant_contact')
      .update({ whatsapp_phone: whatsapp })
      .eq('tenant_id', tenant.id);
  }

  redirect('/dashboard');
}
