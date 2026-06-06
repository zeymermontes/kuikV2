'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/auth';
import {
  addRenderDomain,
  removeRenderDomain,
  isRenderDomainVerified,
} from '@/lib/render';

export interface DomainResult {
  error?: string;
}

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z]{2,})+$/i;

export async function connectDomain(
  _prev: DomainResult,
  formData: FormData,
): Promise<DomainResult> {
  const { tenant } = await requireOwner();
  const domain = String(formData.get('domain') ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  if (!DOMAIN_RE.test(domain)) return { error: 'invalid' };

  const supabase = await createClient();

  try {
    await addRenderDomain(domain);
  } catch {
    return { error: 'render' };
  }

  const { error } = await supabase
    .from('tenants')
    .update({ custom_domain: domain, custom_domain_status: 'pending' })
    .eq('id', tenant.id);

  if (error) return { error: error.code === '23505' ? 'taken' : error.message };

  revalidatePath('/domain');
  return {};
}

export async function checkDomain(): Promise<DomainResult> {
  const { tenant } = await requireOwner();
  if (!tenant.custom_domain) return {};

  const verified = await isRenderDomainVerified(tenant.custom_domain);
  const supabase = await createClient();
  await supabase
    .from('tenants')
    .update({ custom_domain_status: verified ? 'verified' : 'pending' })
    .eq('id', tenant.id);

  revalidatePath('/domain');
  return {};
}

export async function disconnectDomain(): Promise<void> {
  const { tenant } = await requireOwner();
  if (tenant.custom_domain) await removeRenderDomain(tenant.custom_domain);

  const supabase = await createClient();
  await supabase
    .from('tenants')
    .update({ custom_domain: null, custom_domain_status: 'none' })
    .eq('id', tenant.id);

  revalidatePath('/domain');
}
