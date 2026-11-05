// What is waiting for a person, kept live for every screen that shows it:
// the hub's tiles, the tab's title, the app's icon. One subscription and one
// count per page however many of them are mounted, so they cannot disagree
// and a burst of changes costs one question to the server.

import { createClient, channelName } from '@/lib/supabase/client';
import { myPending } from '@/app/pending-actions';
import type { PendingCounts } from '@/lib/pending-counts';

type Listener = (counts: PendingCounts) => void;

// A burst (a booking and its notification, a chat and its handoff) is one count.
const SETTLE_MS = 1200;
// Screens change by remounting their layout: the watch survives the gap.
const LINGER_MS = 2000;

let watched: string | null = null;
let current: PendingCounts | null = null;
let stopWatching: (() => void) | null = null;
let lingering: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function start(tenantId: string): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const count = () => {
    myPending()
      .then((c) => {
        if (stopped) return;
        current = c;
        listeners.forEach((l) => l(c));
      })
      .catch(() => {});
  };
  const recount = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      count();
    }, SETTLE_MS);
  };
  const supabase = createClient();
  const channel = supabase
    .channel(channelName(`pending-${tenantId}`))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `tenant_id=eq.${tenantId}` }, recount)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_conversations', filter: `tenant_id=eq.${tenantId}` }, recount)
    // Unfiltered: Realtime cannot filter DELETEs by tenant_id, and a cleared history has to reach the count.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'whatsapp_conversations' }, recount)
    // Joined (again): whatever changed while the socket was down was missed.
    .subscribe((status) => status === 'SUBSCRIBED' && recount());
  // Back to the tab, or back online: the number on screen may be old.
  const onVisible = () => document.visibilityState === 'visible' && recount();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', recount);
  count();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', recount);
    supabase.removeChannel(channel);
  };
}

/**
 * Hear the counts for a restaurant: at once if they are known, and on every
 * change after. `initial` is what the server rendered, shown until the first
 * live answer. Returns the way to stop listening.
 */
export function watchPending(tenantId: string, listener: Listener, initial?: PendingCounts): () => void {
  if (lingering) {
    clearTimeout(lingering);
    lingering = null;
  }
  if (watched !== tenantId) {
    stopWatching?.();
    watched = tenantId;
    current = initial ?? null;
    stopWatching = start(tenantId);
  }
  listeners.add(listener);
  if (current) listener(current);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || lingering) return;
    lingering = setTimeout(() => {
      lingering = null;
      if (listeners.size > 0) return;
      stopWatching?.();
      stopWatching = null;
      watched = null;
      current = null;
    }, LINGER_MS);
  };
}
