'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getMembership, homeForRole } from '@/lib/auth';
import { shell } from '@/lib/native/shell';

export interface AuthResult {
  error?: string;
  message?: string;
}

export async function signIn(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  // Land each role somewhere it can actually use. Sending everyone to
  // /dashboard used to drop waiters and cashiers on the analytics page, which
  // now bounces them straight back out.
  const membership = data.user ? await getMembership(data.user.id) : null;
  if (!membership) redirect('/onboarding');
  // The native apps (native/) start on the hub and come back to it after
  // login, whatever the role: the hub only offers what that role can open.
  const ua = (await headers()).get('user-agent');
  redirect(shell(ua) !== 'browser' ? '/terminal' : homeForRole(membership.role));
}

export async function signUp(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('fullName') ?? '');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) return { error: error.message };

  // If email confirmation is disabled, a session exists immediately → onboard.
  if (data.session) redirect('/onboarding');
  return { message: 'check-email' };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
