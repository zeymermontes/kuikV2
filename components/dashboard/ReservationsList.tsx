'use client';

import { useState, useTransition } from 'react';
import { Calendar, Clock, Users, Phone, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Reservation, ReservationStatus } from '@/lib/database.types';
import { Card } from '@/components/ui';
import { setReservationStatus, toggleReservations, setReservationRequired } from '@/app/(dashboard)/reservations/actions';

type ReqConfig = { phone?: boolean; party?: boolean; note?: boolean };
const REQ_FIELDS: (keyof ReqConfig)[] = ['phone', 'party', 'note'];

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-neutral-900' : 'bg-neutral-300'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
    </button>
  );
}

const STATUS_TONE: Record<ReservationStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  seated: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-neutral-100 text-neutral-400 line-through',
};

export function ReservationsList({
  reservations,
  enabled,
  required,
}: {
  reservations: Reservation[];
  enabled: boolean;
  required: ReqConfig | null;
}) {
  const t = useTranslations('reservations');
  const [on, setOn] = useState(enabled);
  const [req, setReq] = useState<ReqConfig>(required ?? {});
  const [, start] = useTransition();

  function flip(v: boolean) {
    setOn(v);
    start(async () => toggleReservations(v));
  }
  function toggleReq(key: keyof ReqConfig) {
    const next = { ...req, [key]: !req[key] };
    setReq(next);
    start(async () => setReservationRequired(next));
  }
  function setStatus(id: string, status: ReservationStatus) {
    start(async () => setReservationStatus(id, status));
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Card className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{t('accept')}</h2>
          <p className="text-sm text-neutral-500">{t('acceptHint')}</p>
        </div>
        <Switch on={on} onClick={() => flip(!on)} />
      </Card>

      {on && (
        <Card className="space-y-3">
          <div>
            <h2 className="font-semibold">{t('requiredTitle')}</h2>
            <p className="text-sm text-neutral-500">{t('requiredHint')}</p>
          </div>
          {REQ_FIELDS.map((f) => (
            <div key={f} className="flex items-center justify-between">
              <span className="text-sm">{t(`field_${f}`)}</span>
              <Switch on={!!req[f]} onClick={() => toggleReq(f)} />
            </div>
          ))}
        </Card>
      )}

      {reservations.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-neutral-400">{t('empty')}</p>
        </Card>
      ) : (
        reservations.map((r) => (
          <Card key={r.id} className="space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{r.customer_name}</h3>
                <div className="mt-1 flex flex-wrap gap-3 text-sm text-neutral-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> {r.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {r.time}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {r.party_size}
                  </span>
                  {r.phone && (
                    <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-neutral-600">
                      <Phone className="h-3.5 w-3.5" /> {r.phone}
                    </a>
                  )}
                </div>
                {r.note && <p className="mt-1 text-sm text-neutral-500">{r.note}</p>}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[r.status]}`}>
                {t(`status_${r.status}`)}
              </span>
            </div>

            {r.status !== 'cancelled' && (
              <div className="flex gap-2 pt-1">
                {r.status === 'pending' && (
                  <button
                    onClick={() => setStatus(r.id, 'confirmed')}
                    className="flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    <Check className="h-4 w-4" /> {t('confirm')}
                  </button>
                )}
                {r.status === 'confirmed' && (
                  <button
                    onClick={() => setStatus(r.id, 'seated')}
                    className="flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    <Users className="h-4 w-4" /> {t('seat')}
                  </button>
                )}
                <button
                  onClick={() => setStatus(r.id, 'cancelled')}
                  className="flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600"
                >
                  <X className="h-4 w-4" /> {t('cancel')}
                </button>
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
