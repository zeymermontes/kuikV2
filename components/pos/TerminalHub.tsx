'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link, { useLinkStatus } from 'next/link';
import { useRouter } from 'next/navigation';
import { FRESH_EVENT, FULL_PREFETCH, PREFETCH_TTL_MS, markArrival, needsRefresh } from '@/lib/native/arrival';
import { useTranslations } from 'next-intl';
import { ChefHat, ClipboardList, LayoutDashboard, Loader2, Lock, LogOut, MapPin, MessageCircle, Monitor, Users, Wallet } from 'lucide-react';
import { signOut } from '@/app/(auth)/actions';
import { hubCounts, listRegisters } from '@/app/terminal/actions';
import { createClient, channelName } from '@/lib/supabase/client';
import type { PendingCounts } from '@/lib/pending-counts';
import { PUSH_RETRY_EVENT, PUSH_STATUS_EVENT, readPushStatus, type PushStatus } from '@/components/dashboard/NativePush';
import { shell, shellVersion } from '@/lib/native/shell';
import { DEFAULT_REGISTER, registerSlug } from '@/lib/pos/customer-screen';
import { readDeviceBranch, registerScope, saveDeviceBranch, type DeviceBranch } from '@/lib/pos/branch';

export type HubKey = 'pos' | 'kds' | 'host' | 'orders' | 'chats' | 'customer' | 'admin';

export interface HubTile {
  key: HubKey;
  /** The plan does not include it yet; the tile still opens, onto the add-on page. */
  locked?: boolean;
}

/** A register that has opened a shift, and where: what the customer screen can follow. */
export interface HubRegister {
  branchId: string | null;
  /** The register's slug (caja, barra…), as the shift recorded it. */
  register: string;
}

const CUSTOMER_REGISTER_KEY = 'terminal_customer_register';

// The device's remembered branch as an external store: read after hydration
// (the server knows no localStorage), re-read when the chooser writes it.
const branchListeners = new Set<() => void>();
const subscribeBranch = (cb: () => void) => {
  branchListeners.add(cb);
  return () => {
    branchListeners.delete(cb);
  };
};
const rememberedBranchId = () => readDeviceBranch()?.id ?? null;

// The push status as an external store: one cached object (a fresh parse per
// read would re-render forever), updated by the event NativePush fires.
let pushCache: PushStatus | null | undefined;
const subscribePushStatus = (cb: () => void) => {
  if (shell() !== 'mobile') return () => {};
  if (pushCache === undefined) {
    pushCache = readPushStatus();
    cb();
  }
  const onStatus = (e: Event) => {
    pushCache = (e as CustomEvent<PushStatus>).detail;
    cb();
  };
  window.addEventListener(PUSH_STATUS_EVENT, onStatus);
  return () => window.removeEventListener(PUSH_STATUS_EVENT, onStatus);
};
const pushStatusSnapshot = () => (shell() === 'mobile' ? (pushCache ?? null) : null);
const noopSubscribe = () => () => {};
// The installed app's version, from its user-agent token; null in a browser.
const installedVersion = () => (shell() === 'browser' ? null : shellVersion());

const ICONS: Record<HubKey, typeof Wallet> = {
  pos: Wallet,
  kds: ChefHat,
  host: Users,
  orders: ClipboardList,
  chats: MessageCircle,
  customer: Monitor,
  admin: LayoutDashboard,
};

const HREFS: Record<Exclude<HubKey, 'customer'>, string> = {
  pos: '/pos',
  kds: '/kds',
  host: '/host',
  orders: '/orders',
  chats: '/chats',
  admin: '/dashboard',
};

/**
 * The customer screen follows a register by name; with branches, the name is
 * scoped to the branch so "caja 1" here never mirrors "caja 1" elsewhere
 * (registerScope, the same the register broadcasts under).
 */
function customerHref(register: string, branch: DeviceBranch | null): string {
  return `/pos/customer?screen=${encodeURIComponent(registerScope(registerSlug(register || DEFAULT_REGISTER), branch))}`;
}

/** Operations pages open for one location: `?branch=<slug>`, or `main`, which also clears a remembered branch. */
/**
 * When the sections' prefetched copies were last asked for. Kept outside the
 * component because the copies outlive it: the router holds them across
 * visits to the hub. Zero means unknown, which reads as old, so the section
 * fetches itself again; every doubt errs that way.
 */
let sectionsFetchedAt = 0;
if (typeof window !== 'undefined') {
  // A section that fetched itself again made the router drop every copy.
  window.addEventListener(FRESH_EVENT, () => {
    sectionsFetchedAt = 0;
  });
}

function opsHref(path: string, branch: DeviceBranch | null, hasBranches: boolean): string {
  if (!hasBranches) return path;
  return `${path}?branch=${encodeURIComponent(branch ? branch.slug : 'main')}`;
}

/**
 * The first screen of the native apps, every launch: which of Kuik's surfaces
 * to open on this device. The page decides the tiles (role, plan, dev gate);
 * this only draws them. The customer screen asks which register it follows,
 * and remembers the answer on the device. With branches, a chooser picks
 * which one this device works at; the choice is kept on the device
 * (lib/pos/branch.ts) and every operations tile opens for it.
 */
export function TerminalHub({
  tenantId,
  restaurantName,
  userName,
  tiles,
  branches = [],
  registers: initialRegisters = [],
  counts: initialCounts,
}: {
  tenantId?: string;
  restaurantName: string;
  userName: string;
  tiles: HubTile[];
  branches?: DeviceBranch[];
  registers?: HubRegister[];
  /** What waits for a person, per product: the tiles' badges. */
  counts?: PendingCounts;
}) {
  const t = useTranslations('terminal');
  const router = useRouter();

  // The badges stay live while the hub sits open on a tablet: any change to
  // a booking or a chat re-counts (throttled — a burst is one query).
  const [counts, setCounts] = useState<PendingCounts>(initialCounts ?? { bookings: 0, chats: 0 });
  const recountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    const recount = () => {
      if (recountTimer.current) return;
      recountTimer.current = setTimeout(() => {
        recountTimer.current = null;
        hubCounts().then(setCounts).catch(() => {});
      }, 1500);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(`hub-counts-${tenantId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `tenant_id=eq.${tenantId}` }, recount)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_conversations', filter: `tenant_id=eq.${tenantId}` }, recount)
      // Unfiltered: Realtime cannot filter DELETEs by tenant_id, and a cleared history has to reach the badge.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'whatsapp_conversations' }, recount)
      .subscribe();
    // Coming back to the tab after a while: the numbers may be stale.
    const onVisible = () => { if (document.visibilityState === 'visible') recount(); };
    document.addEventListener('visibilitychange', onVisible);
    // So may the ones this page arrived with: back from a section shows the
    // hub as it was prefetched, minutes ago at worst.
    recount();
    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      if (recountTimer.current) clearTimeout(recountTimer.current);
    };
  }, [tenantId]);
  const badgeOf: Partial<Record<HubKey, number>> = { host: counts.bookings, chats: counts.chats };

  // The phone app's push registration, in one line: the answer to "why am I
  // not getting notifications" without a debugger on the phone.
  const pushStatus = useSyncExternalStore(subscribePushStatus, pushStatusSnapshot, () => null);
  const appVersion = useSyncExternalStore(noopSubscribe, installedVersion, () => null);
  const [askRegister, setAskRegister] = useState(false);
  const [register, setRegister] = useState('');
  // Typing a register that has not opened a shift yet (a brand-new tablet).
  const [otherRegister, setOtherRegister] = useState(false);
  // Rendered on the server, refreshed when the panel opens: a register that
  // opened its first shift after this page loaded is still offered.
  const [registers, setRegisters] = useState(initialRegisters);
  const hasBranches = branches.length > 0;
  const branchId = useSyncExternalStore(subscribeBranch, rememberedBranchId, () => null);
  // A remembered branch that no longer exists reads as the main location;
  // opening a tile then sends `?branch=main`, which clears the memory.
  const branch = branches.find((b) => b.id === branchId) ?? null;

  function pickBranch(next: DeviceBranch | null) {
    saveDeviceBranch(next);
    branchListeners.forEach((cb) => cb());
  }

  // The remembered register is read when the panel opens, not on mount:
  // localStorage is not there on the server, and nothing needs it earlier.
  function toggleRegister() {
    if (!askRegister && !register) {
      try {
        setRegister(localStorage.getItem(CUSTOMER_REGISTER_KEY) ?? '');
      } catch {}
    }
    if (!askRegister) listRegisters().then(setRegisters).catch(() => {});
    setAskRegister((v) => !v);
  }

  // The registers of the chosen branch, the default one always offered
  // (shifts from before registers had names belong to it).
  const branchRegisters = useMemo(() => {
    const here = registers.filter((r) => (r.branchId ?? null) === (branch?.id ?? null)).map((r) => r.register);
    return here.includes(DEFAULT_REGISTER) ? here : [DEFAULT_REGISTER, ...here];
  }, [registers, branch]);
  const registerKey = registerSlug(register || DEFAULT_REGISTER);
  const listed = !otherRegister && branchRegisters.includes(registerKey);

  function openCustomer() {
    try {
      localStorage.setItem(CUSTOMER_REGISTER_KEY, register.trim());
    } catch {}
    router.push(customerHref(register, branch));
  }

  const tileClass =
    'flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10 active:bg-white/15';

  type LinkedKey = Exclude<HubKey, 'customer'>;
  const tileHref = (key: LinkedKey) =>
    key === 'admin' || key === 'orders' || key === 'chats' ? HREFS[key] : opsHref(HREFS[key], branch, hasBranches);

  // The tiles prefetch their sections in full, so a tap opens them at once.
  // A prefetched page is kept for a few minutes; when the app comes back to
  // the front after longer than that (the usual case on a phone), the
  // sections are asked for again, so the next tap is instant too.
  const linked = tiles
    .map((x) => x.key)
    .filter((k): k is LinkedKey => k !== 'customer')
    .map(tileHref)
    .join('\n');
  useEffect(() => {
    // The tiles prefetch as they appear, but only what the router no longer
    // holds: coming back to the hub two minutes after the first visit shows
    // tiles whose copies are two minutes old, not new ones.
    if (Date.now() - sectionsFetchedAt >= PREFETCH_TTL_MS) sectionsFetchedAt = Date.now();
    const warm = () => {
      if (document.visibilityState !== 'visible') return;
      // Still held by the router: asking again would be a no-op, and must
      // not make the copy look newer than it is.
      if (Date.now() - sectionsFetchedAt < PREFETCH_TTL_MS) return;
      sectionsFetchedAt = Date.now();
      for (const href of linked.split('\n').filter(Boolean)) {
        try {
          // Full, like the tiles' own prefetch; the default here is partial.
          router.prefetch(href, FULL_PREFETCH);
        } catch {}
      }
    };
    document.addEventListener('visibilitychange', warm);
    return () => document.removeEventListener('visibilitychange', warm);
  }, [linked, router]);

  // A section opened from a copy older than a few seconds fetches itself
  // again once shown; one opened from a fresh copy has nothing to gain.
  const leaveNote = () => {
    if (needsRefresh(sectionsFetchedAt)) markArrival();
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-10">
      <p className="text-sm font-medium text-neutral-400">{restaurantName}</p>
      <h1 className="mt-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-sm text-neutral-400">{t('subtitle')}</p>

      {hasBranches && (
        <div className="mt-6">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <MapPin className="h-3.5 w-3.5" /> {t('branch')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t('branch')}>
            {[null, ...branches].map((b) => {
              const active = (b?.id ?? null) === (branch?.id ?? null);
              return (
                <button
                  key={b?.id ?? 'main'}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => pickBranch(b)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    active ? 'bg-white text-black' : 'border border-white/15 text-neutral-300 hover:bg-white/10'
                  }`}
                >
                  {b ? b.name : t('branchMain')}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-neutral-500">{t('branchHint')}</p>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(({ key, locked }) => {
          const Icon = ICONS[key];
          const badge = locked ? 0 : (badgeOf[key] ?? 0);
          const body = (
            <>
              <span className="flex w-full items-start justify-between">
                <Icon className="h-7 w-7" />
                {locked && <Lock className="h-4 w-4 text-neutral-500" aria-label={t('locked')} />}
                {badge > 0 && (
                  <span
                    className="min-w-[22px] rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-xs font-bold text-white"
                    aria-label={t(key === 'chats' ? 'pendingChats' : 'pendingBookings', { n: badge })}
                    title={t(key === 'chats' ? 'pendingChats' : 'pendingBookings', { n: badge })}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span>
                <span className="block font-semibold">{t(key)}</span>
                <span className="block text-xs text-neutral-400">{t(`${key}Desc`)}</span>
              </span>
            </>
          );
          if (key === 'customer') {
            return (
              <button
                key={key}
                type="button"
                onClick={toggleRegister}
                aria-expanded={askRegister}
                className={`${tileClass} ${askRegister ? 'border-white bg-white/10' : ''}`}
              >
                {body}
              </button>
            );
          }
          return (
            // prefetch: the whole section, not only its frame. onClick: tell
            // the section it was prefetched, so it fetches itself again.
            <Link key={key} href={tileHref(key)} prefetch={true} onClick={leaveNote} className={`${tileClass} relative`}>
              {body}
              <TilePending />
            </Link>
          );
        })}
      </div>

      {tiles.length === 0 && <p className="mt-8 text-sm text-neutral-400">{t('nothing')}</p>}

      {askRegister && (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            openCustomer();
          }}
        >
          <p className="text-sm font-medium">{t('customerRegister')}</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t('customerRegister')}>
            {branchRegisters.map((r) => {
              const active = listed && r === registerKey;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setOtherRegister(false);
                    setRegister(r);
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    active ? 'bg-white text-black' : 'border border-white/15 text-neutral-300 hover:bg-white/10'
                  }`}
                >
                  {r}
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={!listed}
              onClick={() => {
                setOtherRegister(true);
                if (branchRegisters.includes(registerKey)) setRegister('');
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                !listed ? 'bg-white text-black' : 'border border-white/15 text-neutral-300 hover:bg-white/10'
              }`}
            >
              {t('customerRegisterOther')}
            </button>
          </div>
          {!listed && (
            <label className="mt-3 block">
              <input
                value={register}
                onChange={(e) => setRegister(e.target.value)}
                placeholder={DEFAULT_REGISTER}
                autoFocus
                aria-label={t('customerRegister')}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/40"
              />
              <span className="mt-1 block text-xs text-neutral-500">{t('customerRegisterHint')}</span>
            </label>
          )}
          <button type="submit" className="mt-4 rounded-xl bg-white px-6 py-3 font-semibold text-black">
            {t('go')}
          </button>
        </form>
      )}

      {pushStatus && (
        <p className="mt-6 flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
          <span className={`h-2 w-2 rounded-full ${pushStatus.state === 'registered' ? 'bg-emerald-500' : pushStatus.state === 'registering' ? 'bg-amber-400' : 'bg-red-500'}`} />
          <span>
            {t('pushLabel')}: {t(`push_${pushStatus.state}`)}
            {pushStatus.state === 'error' ? ` (${pushStatus.detail})` : ''}
          </span>
          {pushStatus.state !== 'registered' && pushStatus.state !== 'off' && pushStatus.state !== 'no_plugin' && (
            <button type="button" onClick={() => window.dispatchEvent(new Event(PUSH_RETRY_EVENT))} className="underline decoration-dotted hover:text-white">
              {t('pushRetry')}
            </button>
          )}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-neutral-500">
          {userName}
          {appVersion && <span className="text-neutral-600"> · {t('appVersion', { v: appVersion })}</span>}
        </span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm text-neutral-400 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> {t('signOut')}
        </button>
      </div>
    </div>
  );
}

/**
 * The tapped tile, while its section is on the way. Usually skipped: the
 * sections are prefetched, so the tap navigates at once. This covers the
 * tap that lands before the prefetch does, or on a slow connection.
 * Always rendered and only faded in, so the tile never shifts.
 */
function TilePending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 transition-opacity duration-150 ${pending ? 'opacity-100 delay-100' : 'opacity-0'}`}
    >
      <Loader2 className="h-6 w-6 animate-spin text-white" />
    </span>
  );
}
