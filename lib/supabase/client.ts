'use client';

import { createBrowserClient } from '@supabase/ssr';

type BrowserClient = ReturnType<typeof createBrowserClient>;

const prepared = new WeakSet<object>();

/**
 * Make Realtime channels wait for the signed-in person's token before they
 * join.
 *
 * A channel joins the moment the socket opens, with whatever token the
 * client holds at that instant. The token comes from the session, which is
 * read asynchronously (and, when the access token has expired, refreshed
 * over the network first). If the socket wins that race the channel joins
 * with no token at all: it reports SUBSCRIBED, row security then hides
 * every row from it, and it never hears a single change. The library only
 * sends the token afterwards to channels that have already finished
 * joining, so a channel caught mid-join stays deaf until the page is
 * reloaded. That is a screen whose counters and lists silently stop being
 * live, most often right after the app has sat closed for an hour.
 *
 * So `subscribe()` is held until the token is in. Everything else about a
 * channel is as before, including being removed before it ever joined (an
 * effect cleaned up at once), which simply cancels the wait.
 */
function joinWithToken(client: BrowserClient): void {
  if (typeof window === 'undefined' || prepared.has(client)) return;
  prepared.add(client);

  // Never rejects: with no token to be had, joining without one is all there is.
  const ready: Promise<void> = client.realtime.setAuth().catch(() => {});
  const cancelled = new WeakSet<object>();

  const channel = client.channel.bind(client);
  client.channel = ((...args: Parameters<BrowserClient['channel']>) => {
    const ch = channel(...args);
    const subscribe = ch.subscribe.bind(ch);
    ch.subscribe = ((...subArgs: Parameters<typeof ch.subscribe>) => {
      void ready.then(() => {
        if (!cancelled.has(ch)) subscribe(...subArgs);
      });
      return ch;
    }) as typeof ch.subscribe;
    return ch;
  }) as BrowserClient['channel'];

  const removeChannel = client.removeChannel.bind(client);
  client.removeChannel = ((ch: Parameters<BrowserClient['removeChannel']>[0]) => {
    cancelled.add(ch as object);
    return removeChannel(ch);
  }) as BrowserClient['removeChannel'];
}

/** Supabase client for use in Client Components (browser). One per page: the library keeps a singleton. */
export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  joinWithToken(client);
  return client;
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
