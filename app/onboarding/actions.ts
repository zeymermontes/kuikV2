'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireUser, getMemberships } from '@/lib/auth';
import { effectivePlan } from '@/lib/plan';
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
  const supabase = await createClient();

  const memberships = await getMemberships(user.id);
  const isSuper = user.profile.role === 'super_admin';
  const additional = memberships.length > 0;

  // Adding a 2nd+ restaurant requires a Pro restaurant (super-admins are exempt).
  if (additional && !isSuper) {
    const ids = memberships.map((m) => m.tenant.id);
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('status, plan')
      .in('tenant_id', ids);
    const hasPro = (subs ?? []).some((s) =>
      effectivePlan(s as { status: 'trialing' | 'active' | 'past_due' | 'canceled'; plan: 'basic' | 'pro' }) === 'pro',
    );
    if (!hasPro) return { error: 'needPro' };
  }

  const name = String(formData.get('name') ?? '').trim();
  const subdomain = String(formData.get('subdomain') ?? '').trim().toLowerCase();
  const whatsapp = digitsOnly(String(formData.get('whatsapp') ?? ''));

  if (!name) return { error: 'name' };
  if (!SUBDOMAIN_RE.test(subdomain) || RESERVED_SUBDOMAINS.has(subdomain)) {
    return { error: 'subdomainInvalid' };
  }

  const { data: tenant, error } = await supabase
    .from('tenants')
    .insert({ owner_id: user.id, name, subdomain, locale: user.profile.locale })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'subdomainTaken' };
    return { error: error.message };
  }

  if (whatsapp) {
    await supabase.from('tenant_contact').update({ whatsapp_phone: whatsapp }).eq('tenant_id', tenant.id);
  }

  // Subscription: super-admins never pay; additional restaurants charge from the
  // start (no trial); the first restaurant keeps its 30-day trial (trigger default).
  if (isSuper) {
    await supabase
      .from('subscriptions')
      .update({ status: 'active', plan: 'pro', trial_ends_at: null })
      .eq('tenant_id', tenant.id);
  } else if (additional) {
    await supabase
      .from('subscriptions')
      .update({ status: 'past_due', plan: 'pro', is_additional: true, trial_ends_at: null })
      .eq('tenant_id', tenant.id);
  }

  // Make the new restaurant the active one.
  const cookieStore = await cookies();
  cookieStore.set('kuik_tenant', tenant.id, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });

  redirect('/dashboard');
}
