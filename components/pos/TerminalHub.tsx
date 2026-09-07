'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChefHat, LayoutDashboard, Lock, LogOut, MapPin, Monitor, Users, Wallet } from 'lucide-react';
import { signOut } from '@/app/(auth)/actions';
import { DEFAULT_REGISTER, registerSlug } from '@/lib/pos/customer-screen';
import { readDeviceBranch, registerScope, saveDeviceBranch, type DeviceBranch } from '@/lib/pos/branch';

export type HubKey = 'pos' | 'kds' | 'host' | 'customer' | 'admin';

export interface HubTile {
  key: HubKey;
  /** The plan does not include it yet; the tile still opens, onto the add-on page. */
  locked?: boolean;
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

const ICONS: Record<HubKey, typeof Wallet> = {
  pos: Wallet,
  kds: ChefHat,
  host: Users,
  customer: Monitor,
  admin: LayoutDashboard,
};

const HREFS: Record<Exclude<HubKey, 'customer'>, string> = {
  pos: '/pos',
  kds: '/kds',
  host: '/host',
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
  restaurantName,
  userName,
  tiles,
  branches = [],
}: {
  restaurantName: string;
  userName: string;
  tiles: HubTile[];
  branches?: DeviceBranch[];
}) {
  const t = useTranslations('terminal');
  const router = useRouter();
  const [askRegister, setAskRegister] = useState(false);
  const [register, setRegister] = useState('');
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
    setAskRegister((v) => !v);
  }

  function openCustomer() {
    try {
      localStorage.setItem(CUSTOMER_REGISTER_KEY, register.trim());
    } catch {}
    router.push(customerHref(register, branch));
  }

  const tileClass =
    'flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10 active:bg-white/15';

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
          const body = (
            <>
              <span className="flex w-full items-start justify-between">
                <Icon className="h-7 w-7" />
                {locked && <Lock className="h-4 w-4 text-neutral-500" aria-label={t('locked')} />}
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
          const href = key === 'admin' ? HREFS[key] : opsHref(HREFS[key], branch, hasBranches);
          return (
            <Link key={key} href={href} className={tileClass}>
              {body}
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
          <label className="block">
            <span className="text-sm font-medium">{t('customerRegister')}</span>
            <input
              value={register}
              onChange={(e) => setRegister(e.target.value)}
              placeholder={DEFAULT_REGISTER}
              autoFocus
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/40"
            />
            <span className="mt-1 block text-xs text-neutral-500">{t('customerRegisterHint')}</span>
          </label>
          <button type="submit" className="mt-3 rounded-xl bg-white px-6 py-3 font-semibold text-black">
            {t('go')}
          </button>
        </form>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <span className="truncate text-sm text-neutral-500">{userName}</span>
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
