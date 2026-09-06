'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChefHat, LogOut, Monitor, Users, Wallet } from 'lucide-react';
import { signOut } from '@/app/(auth)/actions';
import { DEFAULT_REGISTER, registerSlug } from '@/lib/pos/customer-screen';

export type TerminalMode = 'pos' | 'kds' | 'host' | 'customer';

const MODE_KEY = 'terminal_mode';
const CUSTOMER_REGISTER_KEY = 'terminal_customer_register';

/** The remembered mode on this device, if any. */
export function savedTerminalMode(): TerminalMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'pos' || v === 'kds' || v === 'host' || v === 'customer' ? v : null;
  } catch {
    return null;
  }
}

function urlFor(mode: TerminalMode, register: string): string {
  switch (mode) {
    case 'pos':
      return '/pos';
    case 'kds':
      return '/kds';
    case 'host':
      return '/host';
    case 'customer':
      return `/pos/customer?screen=${encodeURIComponent(registerSlug(register || DEFAULT_REGISTER))}`;
  }
}

/**
 * The Terminal app's first screen: which of the four surfaces this device
 * is. The choice is kept in localStorage, so the next launch goes straight
 * there; `forcePick` (from `/terminal?pick=1`, the mode button) shows the
 * chooser again.
 */
export function TerminalModePicker({
  restaurantName,
  posAllowed,
  forcePick,
}: {
  restaurantName: string;
  posAllowed: boolean;
  forcePick: boolean;
}) {
  const t = useTranslations('terminal');
  const router = useRouter();
  const [mode, setMode] = useState<TerminalMode | null>(null);
  const [register, setRegister] = useState('');
  const [auto, setAuto] = useState<TerminalMode | null>(null);

  useEffect(() => {
    const saved = savedTerminalMode();
    let reg = '';
    try {
      reg = localStorage.getItem(CUSTOMER_REGISTER_KEY) ?? '';
    } catch {}
    const id = setTimeout(() => {
      setRegister(reg);
      if (saved && !forcePick) {
        setAuto(saved);
        router.replace(urlFor(saved, reg));
      } else if (saved) {
        setMode(saved);
      }
    }, 0);
    return () => clearTimeout(id);
  }, [forcePick, router]);

  function go() {
    if (!mode) return;
    try {
      localStorage.setItem(MODE_KEY, mode);
      if (mode === 'customer') localStorage.setItem(CUSTOMER_REGISTER_KEY, register.trim());
    } catch {}
    router.push(urlFor(mode, register));
  }

  const modes: { key: TerminalMode; icon: typeof Wallet; disabled?: boolean }[] = [
    { key: 'pos', icon: Wallet, disabled: !posAllowed },
    { key: 'kds', icon: ChefHat, disabled: !posAllowed },
    { key: 'host', icon: Users },
    { key: 'customer', icon: Monitor, disabled: !posAllowed },
  ];

  if (auto) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-neutral-400">
        {t('remembered', { mode: t(auto) })}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-10">
      <p className="text-sm font-medium text-neutral-400">{restaurantName}</p>
      <h1 className="mt-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-sm text-neutral-400">{t('subtitle')}</p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {modes.map(({ key, icon: Icon, disabled }) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => setMode(key)}
            aria-pressed={mode === key}
            className={`flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition disabled:opacity-40 ${
              mode === key ? 'border-white bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <Icon className="h-7 w-7" />
            <span>
              <span className="block font-semibold">{t(key)}</span>
              <span className="block text-xs text-neutral-400">{t(`${key}Desc`)}</span>
            </span>
          </button>
        ))}
      </div>

      {mode === 'customer' && (
        <label className="mt-6 block">
          <span className="text-sm font-medium">{t('customerRegister')}</span>
          <input
            value={register}
            onChange={(e) => setRegister(e.target.value)}
            placeholder={DEFAULT_REGISTER}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-white/40"
          />
          <span className="mt-1 block text-xs text-neutral-500">{t('customerRegisterHint')}</span>
        </label>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-neutral-400 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> {t('signOut')}
        </button>
        <button
          type="button"
          onClick={go}
          disabled={!mode}
          className="rounded-xl bg-white px-6 py-3 font-semibold text-black disabled:opacity-40"
        >
          {t('go')}
        </button>
      </div>
    </div>
  );
}
