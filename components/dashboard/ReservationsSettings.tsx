'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReservationArea, TenantContact } from '@/lib/database.types';
import { Card, Input, Label, Button } from '@/components/ui';
import {
  toggleReservations, setReservationRequired, setReservationPolicy, saveArea, deleteArea,
} from '@/app/(dashboard)/reservations/actions';

type ReqConfig = { name?: boolean; phone?: boolean; party?: boolean; note?: boolean };
const REQ_FIELDS: (keyof ReqConfig)[] = ['name', 'phone', 'party', 'note'];

/** Absent means "required" for the name — that was the behaviour before it became configurable. */
const isRequired = (req: ReqConfig, key: keyof ReqConfig) =>
  key === 'name' ? req.name !== false : Boolean(req[key]);

type Policy = Pick<
  TenantContact,
  'reservation_slot_minutes' | 'reservation_max_party' | 'reservation_lead_minutes'
  | 'reservation_max_days' | 'reservation_auto_confirm'
>;

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-neutral-900' : 'bg-neutral-300'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
    </button>
  );
}

/**
 * Reservation configuration, kept behind a disclosure so it doesn't compete
 * with the day's bookings for attention.
 *
 * Only rendered for roles that can actually save it. Until now a manager saw
 * these switches, watched them move, and nothing persisted — the server action
 * only checked "is a member" while the table's RLS was owner-only.
 */
export function ReservationsSettings({
  enabled,
  required,
  policy,
  areas: initialAreas,
}: {
  enabled: boolean;
  required: ReqConfig | null;
  policy: Policy;
  areas: ReservationArea[];
}) {
  const t = useTranslations('reservations');
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(enabled);
  const [req, setReq] = useState<ReqConfig>(required ?? {});
  const [pol, setPol] = useState<Policy>(policy);
  const [areas, setAreas] = useState<ReservationArea[]>(initialAreas);
  const [newArea, setNewArea] = useState('');
  const [, start] = useTransition();

  function flip(v: boolean) {
    setOn(v);
    start(async () => toggleReservations(v));
  }
  function toggleReq(key: keyof ReqConfig) {
    const next = { ...req, [key]: !isRequired(req, key) };
    setReq(next);
    start(async () => setReservationRequired(next));
  }
  function savePolicy(patch: Partial<Policy>) {
    const next = { ...pol, ...patch };
    setPol(next);
    start(async () => setReservationPolicy(patch));
  }
  function addArea() {
    const name = newArea.trim();
    if (!name) return;
    setNewArea('');
    start(async () => {
      const created = await saveArea({
        name, max_covers: null, public_bookable: true, position: areas.length,
      });
      if (created) setAreas((cur) => [...cur, created]);
    });
  }
  function patchArea(area: ReservationArea, patch: Partial<ReservationArea>) {
    const next = { ...area, ...patch };
    setAreas((cur) => cur.map((a) => (a.id === area.id ? next : a)));
    start(async () => {
      await saveArea({
        id: next.id, name: next.name,
        max_covers: next.max_covers, public_bookable: next.public_bookable,
      });
    });
  }
  function removeArea(id: string) {
    setAreas((cur) => cur.filter((a) => a.id !== id));
    start(async () => deleteArea(id));
  }

  const num = 'w-24 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm';

  return (
    <Card className="mt-6 space-y-4">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="font-semibold">{t('settingsTitle')}</h2>
          <p className="text-sm text-neutral-500">{t('settingsHint')}</p>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-neutral-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-6 border-t border-neutral-200 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">{t('accept')}</h3>
              <p className="text-sm text-neutral-500">{t('acceptHint')}</p>
            </div>
            <Switch on={on} onClick={() => flip(!on)} label={t('accept')} />
          </div>

          {on && (
            <>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t('requiredTitle')}</h3>
                <p className="text-sm text-neutral-500">{t('requiredHint')}</p>
                {REQ_FIELDS.map((f) => (
                  <div key={f} className="flex items-center justify-between">
                    <span className="text-sm">{t(`field_${f}`)}</span>
                    <Switch on={isRequired(req, f)} onClick={() => toggleReq(f)} label={t(`field_${f}`)} />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t('policyTitle')}</h3>
                <p className="text-sm text-neutral-500">{t('policyHint')}</p>
                {([
                  ['reservation_slot_minutes', 'field_slotMinutes', 5, 240],
                  ['reservation_max_party', 'field_maxParty', 1, 200],
                  ['reservation_lead_minutes', 'field_leadTime', 0, 10080],
                  ['reservation_max_days', 'field_maxDaysAhead', 1, 365],
                ] as const).map(([key, label, min, max]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <Label htmlFor={key} className="text-sm">{t(label)}</Label>
                    <input
                      id={key} type="number" min={min} max={max} className={num}
                      value={pol[key] as number}
                      onChange={(e) => savePolicy({ [key]: Number(e.target.value) || min } as Partial<Policy>)}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm">{t('field_autoConfirm')}</span>
                    <p className="text-xs text-neutral-500">{t('autoConfirmHint')}</p>
                  </div>
                  <Switch
                    on={pol.reservation_auto_confirm}
                    onClick={() => savePolicy({ reservation_auto_confirm: !pol.reservation_auto_confirm })}
                    label={t('field_autoConfirm')}
                  />
                </div>
              </div>

            </>
          )}

              <div className="space-y-2">
            <h3 className="text-sm font-medium">{t('areasTitle')}</h3>
            <p className="text-sm text-neutral-500">{t('areasHint')}</p>
            {areas.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 p-2">
                <Input
                  value={a.name}
                  onChange={(e) => setAreas((cur) => cur.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))}
                  onBlur={(e) => patchArea(a, { name: e.target.value })}
                  className="min-w-0 flex-1"
                  aria-label={t('areaName')}
                />
                <input
                  type="number" min={1} className={num}
                  placeholder={t('unlimited')}
                  value={a.max_covers ?? ''}
                  aria-label={t('areaCapacity')}
                  onChange={(e) => patchArea(a, { max_covers: e.target.value ? Number(e.target.value) : null })}
                />
                <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <input
                    type="checkbox" checked={a.public_bookable}
                    onChange={(e) => patchArea(a, { public_bookable: e.target.checked })}
                  />
                  {t('areaPublic')}
                </label>
                <button onClick={() => removeArea(a.id)} aria-label={t('cancel')}
                  className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={newArea} onChange={(e) => setNewArea(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addArea(); }}
                placeholder={t('areaPlaceholder')} className="flex-1"
              />
              <Button variant="secondary" onClick={addArea} disabled={!newArea.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
