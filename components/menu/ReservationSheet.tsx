'use client';

import { useEffect, useState } from 'react';
import { X, CalendarCheck, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function ReservationSheet({
  tenantId,
  branchId,
  required,
  onClose,
}: {
  tenantId: string;
  branchId?: string | null;
  required?: { phone?: boolean; party?: boolean; note?: boolean } | null;
  onClose: () => void;
}) {
  const t = useTranslations('reserve');
  const req = required ?? {};
  const star = (on?: boolean) => (on ? ' *' : '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [party, setParty] = useState(2);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const valid = name.trim() && date && time && (!req.phone || phone.trim()) && (!req.note || note.trim());

  async function submit() {
    if (!valid) return;
    setSending(true);
    try {
      const res = await fetch(`/api/reservation/${tenantId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customer_name: name,
          phone: phone || null,
          party_size: party,
          date,
          time,
          note: note || null,
          branch_id: branchId ?? null,
        }),
      });
      if (res.ok) setDone(true);
    } catch {
      // surfaced by staying open
    } finally {
      setSending(false);
    }
  }

  const field = 'w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-neutral-400 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="animate-fade absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="animate-slide-up relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 text-neutral-900 sm:rounded-3xl">
        <button onClick={onClose} aria-label="close" className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 text-neutral-600 shadow">
          <X className="h-5 w-5" />
        </button>

        {done ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
              <Check className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold">{t('sentTitle')}</h2>
            <p className="mt-1 text-sm text-neutral-500">{t('sentBody')}</p>
            <button onClick={onClose} className="mt-5 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white">
              {t('close')}
            </button>
          </div>
        ) : (
          <>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <CalendarCheck className="h-5 w-5" /> {t('title')}
            </h2>
            <div className="space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${t('name')} *`} className={field} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={`${t('phone')}${star(req.phone)}`} inputMode="tel" className={field} />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-neutral-500">{t('date')}</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-neutral-500">{t('time')}</label>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
                </div>
                <div className="w-24">
                  <label className="mb-1 block text-xs text-neutral-500">{t('party')}</label>
                  <input type="number" min={1} max={50} value={party} onChange={(e) => setParty(Number(e.target.value) || 1)} className={field} />
                </div>
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={`${t('notePlaceholder')}${star(req.note)}`} rows={2} className={field} />
            </div>
            <button
              onClick={submit}
              disabled={!valid || sending}
              className="mt-5 w-full rounded-full py-3 font-semibold disabled:opacity-40"
              style={{ backgroundColor: 'var(--brand-button)', color: 'var(--brand-button-text)' }}
            >
              {sending ? t('sending') : t('submit')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
