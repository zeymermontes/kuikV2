'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Trash2, UserRound, Armchair } from 'lucide-react';
import type { ReservationArea, TableShape } from '@/lib/database.types';
import type { TableView } from '@/lib/host/model';
import { Sheet, Field, Chip, Stepper, INPUT, PRIMARY, GHOST, DANGER } from './ui';

const SHAPES: TableShape[] = ['square', 'round', 'rect', 'diamond'];

/** ISO instant `minutes` from now, for a temporary block. */
const untilFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

/**
 * A table on the plan. For a free table the host seats a walk-in, blocks it or
 * names its server; a manager also draws it (label, seats, shape, room) or
 * removes it. `view` is null when adding a new table.
 */
export function TableSheet({
  view,
  areas,
  defaultAreaId,
  canEdit,
  onClose,
  onSave,
  onDelete,
  onServer,
  onBlock,
  onSeatWalkIn,
  onOpenParty,
}: {
  view: TableView | null;
  areas: ReservationArea[];
  defaultAreaId: string | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (input: { label: string; seats: number; shape: TableShape; area_id: string | null }) => void;
  onDelete: () => void;
  onServer: (name: string | null) => void;
  onBlock: (until: string | null) => void;
  onSeatWalkIn: () => void;
  onOpenParty: (id: string) => void;
}) {
  const t = useTranslations('host');
  const table = view?.table ?? null;
  const [label, setLabel] = useState(table?.label ?? '');
  const [seats, setSeats] = useState(table?.seats ?? 2);
  const [shape, setShape] = useState<TableShape>(table?.shape ?? 'square');
  const [areaId, setAreaId] = useState<string>(table?.area_id ?? defaultAreaId ?? '');
  const [server, setServer] = useState(table?.server_name ?? '');
  const [draw, setDraw] = useState(!table);

  const blockFor = (minutes: number) => onBlock(untilFromNow(minutes));

  return (
    <Sheet
      title={table ? `${t('table')} ${table.label}` : t('newTable')}
      subtitle={table ? `${table.seats} ${t('seats')}${table.server_name ? ` · ${table.server_name}` : ''}` : undefined}
      onClose={onClose}
      footer={
        draw ? (
          <div className="flex gap-2">
            {table && (
              <button onClick={onDelete} className={DANGER} title={t('deleteTable')}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => onSave({ label, seats, shape, area_id: areaId || null })} disabled={!label.trim()} className={`${PRIMARY} flex-1`}>
              {t('save')}
            </button>
          </div>
        ) : undefined
      }
    >
      {draw ? (
        <div className="space-y-4">
          <Field label={t('f_label')}>
            <input autoFocus className={INPUT} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="12, B1, T3…" />
          </Field>
          <Field label={t('seats')}>
            <Stepper value={seats} onChange={setSeats} />
          </Field>
          <Field label={t('f_shape')}>
            <div className="flex gap-1.5">
              {SHAPES.map((s) => (
                <Chip key={s} small active={shape === s} onClick={() => setShape(s)}>{t(`shape_${s}`)}</Chip>
              ))}
            </div>
          </Field>
          {areas.length > 0 && (
            <Field label={t('f_room')}>
              <div className="flex flex-wrap gap-1.5">
                <Chip small active={areaId === ''} onClick={() => setAreaId('')}>{t('noRoom')}</Chip>
                {areas.map((a) => (
                  <Chip key={a.id} small active={areaId === a.id} onClick={() => setAreaId(a.id)}>{a.name}</Chip>
                ))}
              </div>
            </Field>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {view?.seated ? (
            <button onClick={() => onOpenParty(view.seated!.id)} className={`${PRIMARY} w-full`}>
              <Armchair className="h-4 w-4" /> {view.seated.customer_name} · {view.seated.party_size}
            </button>
          ) : (
            <button onClick={onSeatWalkIn} disabled={view?.blocked} className={`${PRIMARY} w-full`}>
              <Armchair className="h-4 w-4" /> {t('seatWalkInHere')}
            </button>
          )}

          {view && view.upcoming.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-white/40">{t('upcomingHere')}</p>
              {view.upcoming.map((r) => (
                <button key={r.id} onClick={() => onOpenParty(r.id)} className="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10">
                  <span className="font-semibold">{r.customer_name}</span>
                  <span className="text-white/50">{r.time} · {r.party_size}</span>
                </button>
              ))}
            </div>
          )}

          <Field label={t('f_server')}>
            <div className="flex gap-2">
              <input className={INPUT} value={server} onChange={(e) => setServer(e.target.value)} placeholder={t('serverPh')} />
              <button onClick={() => onServer(server)} className={GHOST}><UserRound className="h-4 w-4" /></button>
            </div>
          </Field>

          <Field label={t('block')}>
            {view?.blocked ? (
              <button onClick={() => onBlock(null)} className={`${GHOST} w-full`}>{t('unblock')}</button>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {[30, 60, 120, 240].map((m) => (
                  <Chip key={m} small onClick={() => blockFor(m)}><Ban className="h-3.5 w-3.5" /> {m < 60 ? `${m}m` : `${m / 60}h`}</Chip>
                ))}
              </div>
            )}
          </Field>

          {canEdit && (
            <button onClick={() => setDraw(true)} className={`${GHOST} w-full`}>{t('editTable')}</button>
          )}
        </div>
      )}
    </Sheet>
  );
}
