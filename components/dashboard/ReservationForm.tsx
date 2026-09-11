'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Reservation, ReservationArea } from '@/lib/database.types';
import { Input, Textarea, Label, Button } from '@/components/ui';
import { createReservationAction, updateReservationAction } from '@/app/(dashboard)/reservations/actions';

/**
 * Booking a table from behind the counter — the phone rang, or someone walked
 * in. Staff bookings skip the pending step and are allowed to break the rules
 * the public form enforces, because the person filling this in is looking at
 * the actual room.
 */
export function ReservationForm({
  areas,
  defaultDate,
  defaultTime,
  onClose,
  onCreated,
  initial,
  onSaved,
}: {
  areas: ReservationArea[];
  defaultDate: string;
  defaultTime: string;
  onClose: () => void;
  onCreated: () => void;
  /** Editing an existing booking: the form opens filled and saves in place. */
  initial?: Reservation;
  /** After an edit: a note the staff still has to send by hand, if any. */
  onSaved?: (r: { href?: string; notificationId?: string }) => void;
}) {
  const t = useTranslations('reservations');
  const [name, setName] = useState(initial?.customer_name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [party, setParty] = useState(initial?.party_size ?? 2);
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [time, setTime] = useState(initial?.time.slice(0, 5) ?? defaultTime);
  const [areaId, setAreaId] = useState(initial?.area_id ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  // Set once the slot came back full, so the button can offer to book anyway.
  const [overbook, setOverbook] = useState(false);
  const [pending, start] = useTransition();

  const valid = name.trim() && date && time && party > 0;

  function submit(force = false) {
    if (!valid) return;
    setError(null);
    start(async () => {
      if (initial) {
        const result = await updateReservationAction(initial.id, {
          customer_name: name,
          phone: phone || null,
          party_size: party,
          date,
          time,
          area_id: areaId || null,
          note: note || null,
        });
        if (result.ok) {
          onSaved?.(result);
          onCreated();
          onClose();
          return;
        }
        setError(result.error);
        return;
      }
      const result = await createReservationAction({
        customer_name: name,
        phone: phone || null,
        party_size: party,
        date,
        time,
        note: note || null,
        area_id: areaId || null,
        source: 'manual',
        force,
      });
      if (result.ok) {
        onCreated();
        onClose();
        return;
      }
      setError(result.error);
      setOverbook(result.error === 'slot_full');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 text-neutral-900 sm:rounded-2xl">
        <button onClick={onClose} aria-label={t('cancel')} className="absolute right-3 top-3 rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100">
          <X className="h-5 w-5" />
        </button>
        <h2 className="mb-4 text-lg font-bold">{initial ? t('editTitle') : t('newTitle')}</h2>

        <div className="space-y-3">
          <div>
            <Label htmlFor="r-name">{t('f_name')}</Label>
            <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label htmlFor="r-phone">{t('f_phone')}</Label>
            <Input id="r-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="r-date">{t('f_date')}</Label>
              <Input id="r-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex-1">
              <Label htmlFor="r-time">{t('f_time')}</Label>
              <Input id="r-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="w-24">
              <Label htmlFor="r-party">{t('f_party')}</Label>
              <Input id="r-party" type="number" min={1} max={50} value={party}
                onChange={(e) => setParty(Number(e.target.value) || 1)} />
            </div>
          </div>
          {areas.length > 0 && (
            <div>
              <Label htmlFor="r-area">{t('f_area')}</Label>
              <select
                id="r-area"
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">{t('anyArea')}</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label htmlFor="r-note">{t('f_note')}</Label>
            <Textarea id="r-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {t.has(`err_${error}`) ? t(`err_${error}`) : t('err_failed')}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Button onClick={() => submit(false)} disabled={!valid || pending} className="flex-1">
            {pending ? t('saving') : t('save')}
          </Button>
          {overbook && (
            // The room is fuller than the configured cap, but staff can see it
            // and may know better — let them say so explicitly.
            <Button variant="secondary" onClick={() => submit(true)} disabled={pending}>
              {t('overbookConfirm')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
