'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Delete, LogIn, LogOut, ShieldCheck, X } from 'lucide-react';
import type { PosDexie } from '@/lib/pos/db';
import type { Employee, TimeEntry } from '@/lib/pos/types';
import { can, findByPin, initialsOf, PIN_MAX, PIN_MIN, type Perm } from '@/lib/employees';
import { clockIn, clockOut, openEntryFor } from '@/lib/pos/employees';

/**
 * The PIN screen. Two jobs:
 *   signin     who is at the register (blocks the terminal until someone is),
 *              then a chance to clock in or out before continuing;
 *   authorize  a manager's PIN for one action the signed-in employee may not take.
 */
export function EmployeeSheet({
  db,
  tenantId,
  mode,
  perm,
  employees,
  onSignedIn,
  onAuthorized,
  onClose,
}: {
  db: PosDexie;
  tenantId: string;
  mode: 'signin' | 'authorize';
  perm?: Perm;
  employees: Employee[];
  onSignedIn?: (e: Employee) => void;
  onAuthorized?: (e: Employee) => void;
  onClose?: () => void;
}) {
  const t = useTranslations('pos');
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);
  // signin: after the PIN, the clock step for that employee.
  const [chosen, setChosen] = useState<Employee | null>(null);
  const [entry, setEntry] = useState<TimeEntry | null>(null);

  const candidates = mode === 'authorize' && perm ? employees.filter((e) => can(e, perm)) : employees;
  const noPin = mode === 'signin' ? employees.filter((e) => !e.pin_hash) : [];

  useEffect(() => {
    if (!chosen) return;
    let live = true;
    openEntryFor(db, chosen.id).then((e) => live && setEntry(e));
    return () => {
      live = false;
    };
  }, [db, chosen]);

  async function tryPin(next: string) {
    setPin(next);
    setWrong(false);
    if (next.length < PIN_MIN) return;
    setChecking(true);
    const emp = await findByPin(tenantId, next, candidates);
    setChecking(false);
    if (emp) return accept(emp);
    if (next.length >= PIN_MAX) {
      setWrong(true);
      setPin('');
    }
  }

  function accept(emp: Employee) {
    setPin('');
    if (mode === 'authorize') return onAuthorized?.(emp);
    setChosen(emp);
  }

  function press(k: string) {
    if (k === 'del') return tryPin(pin.slice(0, -1));
    if (pin.length >= PIN_MAX) return;
    tryPin(pin + k);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  const since = entry ? new Date(entry.clock_in).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm" onClick={mode === 'authorize' ? onClose : undefined} />
      <div className="animate-slide-up relative w-full max-w-sm rounded-t-3xl bg-white p-6 text-neutral-900 shadow-2xl sm:rounded-3xl">
        {onClose && (
          <button onClick={onClose} aria-label="close" className="absolute right-4 top-4 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        )}

        {chosen ? (
          <>
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pos-accent/15 text-base font-bold text-pos-accent">{initialsOf(chosen.name)}</span>
              <div>
                <p className="text-lg font-bold">{chosen.name}</p>
                <p className="text-sm text-neutral-500">{entry ? t('onClockSince', { x: since ?? '' }) : t('offClock')}</p>
              </div>
            </div>
            <div className="grid gap-2">
              {entry ? (
                <button
                  onClick={async () => {
                    await clockOut(db, entry);
                    setEntry(null);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 py-3 font-semibold hover:bg-neutral-50"
                >
                  <LogOut className="h-4 w-4" /> {t('clockOut')}
                </button>
              ) : (
                <button
                  onClick={async () => setEntry(await clockIn(db, tenantId, chosen.id))}
                  className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 py-3 font-semibold hover:bg-neutral-50"
                >
                  <LogIn className="h-4 w-4" /> {t('clockIn')}
                </button>
              )}
              <button onClick={() => onSignedIn?.(chosen)} className="rounded-xl bg-pos-accent py-3.5 font-semibold text-pos-accent-text hover:bg-pos-accent-hover">
                {t('usePos')}
              </button>
              <button onClick={() => setChosen(null)} className="py-2 text-sm text-neutral-500 hover:text-neutral-800">
                {t('switchUser')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 text-center">
              {mode === 'authorize' ? (
                <>
                  <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-amber-500" />
                  <h2 className="text-lg font-bold">{t('authorize')}</h2>
                  <p className="mt-1 text-sm text-neutral-500">{t('authorizeHint', { x: perm ? t(`perm_${perm}`) : '' })}</p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-bold">{t('whoIsHere')}</h2>
                  <p className="mt-1 text-sm text-neutral-500">{t('enterPin')}</p>
                </>
              )}
            </div>

            <div className="mb-4 flex h-8 items-center justify-center gap-3" aria-live="polite">
              {wrong ? (
                <span className="text-sm font-medium text-red-600">{t('wrongPin')}</span>
              ) : (
                Array.from({ length: Math.max(PIN_MIN, pin.length) }).map((_, i) => (
                  <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-neutral-900' : 'bg-neutral-200'}`} />
                ))
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {keys.map((k, i) =>
                k === '' ? (
                  <span key={i} />
                ) : (
                  <button
                    key={k}
                    onClick={() => press(k)}
                    disabled={checking}
                    className="flex h-14 items-center justify-center rounded-xl bg-neutral-100 text-xl font-semibold text-neutral-800 active:bg-neutral-200"
                  >
                    {k === 'del' ? <Delete className="h-5 w-5" /> : k}
                  </button>
                ),
              )}
            </div>

            {noPin.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-neutral-500">{t('tapName')}</p>
                <div className="flex flex-wrap gap-2">
                  {noPin.map((e) => (
                    <button key={e.id} onClick={() => accept(e)} className="rounded-full border border-neutral-200 px-3.5 py-2 text-sm font-medium hover:bg-neutral-50">
                      {e.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
