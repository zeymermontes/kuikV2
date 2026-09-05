'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Supabase client for use in Client Components (browser). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * A realtime channel name that is unique to this call. The browser client is
 * a singleton and `channel(name)` hands back an existing channel of that name;
 * after a remount (React's dev double-invoke, a second sidebar instance) that
 * channel is still subscribed while `removeChannel` finishes, and adding a
 * `postgres_changes` callback to it throws. Names are client-side only, so
 * a suffix costs nothing.
 */
export function channelName(base: string): string {
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
