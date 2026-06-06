'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Gift, X, Stamp, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { LoyaltyProgram } from '@/lib/database.types';

interface CardData {
  program: {
    type: 'stamps' | 'points';
    stamps_needed: number;
    reward_description: string | null;
    points_for_reward: number | null;
    points_reward_description: string | null;
  };
  customer: { code: string; name: string | null; stamps: number; points: number };
}

export function LoyaltyButton({
  tenantId,
  program,
}: {
  tenantId: string;
  program: LoyaltyProgram;
}) {
  const t = useTranslations('loyaltyCard');
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [enrolledPhone, setEnrolledPhone] = useState('');
  const [data, setData] = useState<CardData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function fetchCard(p: string, withName?: string): Promise<CardData | null> {
    const res = await fetch(`/api/loyalty/${tenantId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: p, name: withName || undefined }),
    });
    if (!res.ok) throw new Error();
    return res.json();
  }

  const storageKey = `kuik:loyalty:${tenantId}`;

  async function enroll() {
    setBusy(true);
    setError(false);
    try {
      const card = await fetchCard(phone, name);
      setData(card);
      setEnrolledPhone(phone);
      try {
        localStorage.setItem(storageKey, phone);
      } catch {
        // storage may be unavailable (private mode); not critical
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function forget() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setData(null);
    setEnrolledPhone('');
    setPhone('');
    setName('');
  }

  // Remember the card across visits: auto-load if this browser already enrolled.
  useEffect(() => {
    const id = setTimeout(async () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(storageKey);
      } catch {
        saved = null;
      }
      if (!saved) return;
      setEnrolledPhone(saved);
      try {
        const c = await fetchCard(saved);
        if (c) setData(c);
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // While the card is open, poll so stamps/points update live when staff credits.
  useEffect(() => {
    if (!open || !enrolledPhone || !data) return;
    const id = setInterval(async () => {
      try {
        const card = await fetchCard(enrolledPhone);
        if (card) setData(card);
      } catch {
        // ignore transient poll errors
      }
    }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, enrolledPhone, data !== null]);

  function close() {
    setOpen(false);
    // keep data so reopening is instant
  }

  const reward =
    program.type === 'stamps' ? program.reward_description : program.points_reward_description;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
        style={{ backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text)' }}
      >
        <Gift className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
        {data ? t('myCard') : t('button')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <div className="relative w-full max-w-sm rounded-t-3xl bg-white p-5 text-neutral-900 sm:rounded-3xl">
            <button onClick={close} aria-label="close" className="absolute right-3 top-3 p-1 text-neutral-400">
              <X className="h-5 w-5" />
            </button>

            {!data ? (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Gift className="h-6 w-6" style={{ color: 'var(--brand-primary)' }} />
                  <h2 className="text-lg font-bold">{t('title')}</h2>
                </div>
                {reward && <p className="mb-3 text-sm text-neutral-500">{t('earn', { reward })}</p>}
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder={t('phone')}
                  className="mb-2 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-neutral-400 focus:outline-none"
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('name')}
                  className="mb-3 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-neutral-400 focus:outline-none"
                />
                {error && <p className="mb-2 text-sm text-red-500">{t('error')}</p>}
                <button
                  onClick={enroll}
                  disabled={busy || phone.replace(/\D/g, '').length < 8}
                  className="w-full rounded-full py-3 font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  {busy ? '…' : t('join')}
                </button>
              </div>
            ) : (
              <>
                <CardView data={data} />
                <button
                  onClick={forget}
                  className="mt-4 w-full text-center text-xs text-neutral-400 hover:text-neutral-600"
                >
                  {t('notYou')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function CardView({ data }: { data: CardData }) {
  const t = useTranslations('loyaltyCard');
  const { program, customer } = data;

  return (
    <div className="text-center">
      <h2 className="mb-1 text-lg font-bold">{customer.name || t('title')}</h2>
      <p className="mb-4 text-xs text-neutral-500">{t('showCode')}</p>

      <div className="mx-auto mb-3 w-fit rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
        <QRCodeSVG value={customer.code} size={150} />
      </div>
      <p className="mb-5 font-mono text-lg font-bold tracking-widest">{customer.code}</p>

      {program.type === 'stamps' ? (
        <>
          <div className="mb-3 flex flex-wrap justify-center gap-2">
            {Array.from({ length: program.stamps_needed }).map((_, i) => (
              <span
                key={i}
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{
                  backgroundColor:
                    i < customer.stamps ? 'var(--brand-primary)' : 'rgba(0,0,0,0.06)',
                  color: i < customer.stamps ? '#fff' : 'rgba(0,0,0,0.3)',
                }}
              >
                {i < customer.stamps ? <Check className="h-4 w-4" /> : <Stamp className="h-4 w-4" />}
              </span>
            ))}
          </div>
          <p className="text-sm text-neutral-600">
            {t('stampsProgress', { have: customer.stamps, need: program.stamps_needed })}
          </p>
          {program.reward_description && (
            <p className="mt-1 text-sm font-semibold">🎁 {program.reward_description}</p>
          )}
        </>
      ) : (
        <>
          <div className="text-4xl font-extrabold" style={{ color: 'var(--brand-primary)' }}>
            {Number(customer.points)}
          </div>
          <p className="text-sm text-neutral-500">{t('points')}</p>
          {program.points_for_reward && program.points_reward_description && (
            <p className="mt-2 text-sm">
              {t('pointsReward', {
                points: program.points_for_reward,
                reward: program.points_reward_description,
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
