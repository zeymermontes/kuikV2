import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AuthedUser } from '@/lib/auth';
import type { TenantDevice } from '@/lib/database.types';
import { HUB_PATH } from '@/lib/native/back';
import { effectiveSections, type DeviceSection } from './sections';

/**
 * The device behind a login that joined with a code, read as that login
 * (policy tenant_devices_self). Null for a person, and for a device whose
 * row is gone. Shared by everything in one render.
 */
export const deviceOf = cache(async (user: AuthedUser): Promise<TenantDevice | null> => {
  if (!user.isDevice) return null;
  const supabase = await createClient();
  // Every column, by star: `sections` (0101) may not exist yet, and naming a
  // missing column fails the whole read.
  const { data } = await supabase.from('tenant_devices').select('*').eq('user_id', user.id).maybeSingle<TenantDevice>();
  return data ?? null;
});

/** What this login is held to: a device's sections, or null for a person (their role decides). */
export async function sectionsFor(user: AuthedUser): Promise<DeviceSection[] | null> {
  const device = await deviceOf(user);
  return device ? effectiveSections(device) : null;
}

/**
 * Keep a shared device to the sections its owner gave it. Its role may cover
 * more (roles come in bundles, see lib/devices/sections.ts), so the page asks
 * here as well. A person passes untouched; a device without the section goes
 * back to its hub, which only offers what it has.
 */
export async function requireSection(user: AuthedUser, section: DeviceSection): Promise<void> {
  const sections = await sectionsFor(user);
  if (sections && !sections.includes(section)) redirect(HUB_PATH);
}
