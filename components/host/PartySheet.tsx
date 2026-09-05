'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Phone, MessageCircle, Pencil, Users, Clock, MapPin, ArrowRightLeft, Check } from 'lucide-react';
import type { FloorTable, Reservation, ReservationArea, ReservationStatus, TableStatus } from '@/lib/database.types';
import {
  PARTY_STATUS_COLOR, PARTY_TAGS, QUOTE_CHOICES, TABLE_STATUS_COLOR, TABLE_STATUS_ORDER,
  elapsed, isLate, minutesSince, turnMinutesFor, type PartyTag,
} from '@/lib/host/model';
import { digitsOnly } from '@/lib/utils';
import { Sheet, Field, Chip, Stepper, INPUT, PRIMARY, GHOST, DANGER, TAG_ICON, TABLE_STATUS_ICON, PARTY_STATUS_ICON } from './ui';
import type { HostSettings } from './PartyList';
import type { PartyFields } from '@/app/host/actions';

// One party: who they are, where they are in the visit, and every next step
// a host may take from here. Actions are named as OpenTable names them.

export function PartySheet({
  party,
  tables,
  areas,
  now,
  settings,
  noticeHref,
  onClose,
  onStatus,
  onTableStatus,
  onSeat,
  onMove,
  onNotify,
  onUpdate,
  onSendNotice,
}: {
  party: Reservation;
  tables: FloorTable[];
  areas: ReservationArea[];
  now: number;
  settings: HostSettings;
  /** A confirm/cancel WhatsApp note waiting to be sent by a human. */
  noticeHref: string | null;
  onClose: () => void;
  onStatus: (status: ReservationStatus) => void;
  onTableStatus: (s: TableStatus) => void;
  onSeat: () => void;
  onMove: () => void;
  onNotify: () => void;
  onUpdate: (fields: PartyFields) => void;
  onSendNotice: () => void;
}) {
  const t = useTranslations('host');
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<PartyFields>({
    customer_name: party.customer_name,
    phone: party.phone,
    party_size: party.party_size,
    note: party.note,
    tags: party.tags,
    time: party.time,
    area_id: party.area_id,
    quoted_minutes: party.quoted_minutes,
    turn_minutes: party.turn_minutes,
    server_name: party.server_name,
  });

  const late = isLate(party, now, settings.late);
  const status = late ? 'late' : party.status;
  const StatusIcon = PARTY_STATUS_ICON[status];
  const color = late ? '#facc15' : PARTY_STATUS_COLOR[party.status];
  const tableLabels = party.table_ids.map((id) => tables.find((x) => x.id === id)?.label).filter(Boolean).join(' + ');
  const turn = turnMinutesFor(party.party_size, settings.turns, party.turn_minutes);
  const sat = minutesSince(party.seated_at, now);
  const areaName = areas.find((a) => a.id === party.area_id)?.name;
  const s = party.status;

  function toggleTag(tag: PartyTag) {
    const cur = f.tags ?? [];
    setF({ ...f, tags: cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag] });
  }

  const header = (
    <span className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: color, color: '#111' }}>
        <StatusIcon className="h-4 w-4" />
      </span>
      {party.customer_name}
    </span>
  );

  if (editing) {
    return (
      <Sheet
        title={t('editParty')}
        onClose={() => setEditing(false)}
        footer={
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className={`${GHOST} flex-1`}>{t('cancel')}</button>
            <button
              onClick={() => {
                onUpdate(f);
                setEditing(false);
              }}
              className={`${PRIMARY} flex-1`}
            >
              {t('save')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label={t('f_name')}>
            <input className={INPUT} value={f.customer_name ?? ''} onChange={(e) => setF({ ...f, customer_name: e.target.value })} />
          </Field>
          <Field label={t('f_phone')}>
            <input className={INPUT} inputMode="tel" value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value || null })} />
          </Field>
          <div className="flex flex-wrap items-end gap-4">
            <Field label={t('f_party')}>
              <Stepper value={f.party_size ?? 1} onChange={(n) => setF({ ...f, party_size: n })} />
            </Field>
            {s !== 'waiting' && s !== 'notified' && (
              <Field label={t('f_time')}>
                <input type="time" className={INPUT} value={f.time ?? ''} onChange={(e) => setF({ ...f, time: e.target.value })} />
              </Field>
            )}
          </div>
          {areas.length > 0 && (
            <Field label={t('f_area')}>
              <select className={INPUT} value={f.area_id ?? ''} onChange={(e) => setF({ ...f, area_id: e.target.value || null })}>
                <option value="">{t('anyArea')}</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id} className="text-black">{a.name}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label={t('f_tags')}>
            <div className="flex flex-wrap gap-1.5">
              {PARTY_TAGS.map((tag) => {
                const I = TAG_ICON[tag];
                return (
                  <Chip key={tag} small active={(f.tags ?? []).includes(tag)} onClick={() => toggleTag(tag)}>
                    <I className="h-3.5 w-3.5" /> {t(`tag_${tag}`)}
                  </Chip>
                );
              })}
            </div>
          </Field>
          <Field label={t('f_turn', { x: turnMinutesFor(f.party_size ?? party.party_size, settings.turns) })}>
            <input
              type="number"
              inputMode="numeric"
              className={INPUT}
              placeholder={String(turnMinutesFor(f.party_size ?? party.party_size, settings.turns))}
              value={f.turn_minutes ?? ''}
              onChange={(e) => setF({ ...f, turn_minutes: e.target.value ? Number(e.target.value) : null })}
            />
          </Field>
          {(s === 'waiting' || s === 'notified') && (
            <Field label={t('f_quote')}>
              <div className="flex flex-wrap gap-1.5">
                {QUOTE_CHOICES.map((q) => (
                  <Chip key={q} small active={f.quoted_minutes === q} onClick={() => setF({ ...f, quoted_minutes: q })}>{q}m</Chip>
                ))}
              </div>
            </Field>
          )}
          <Field label={t('f_server')}>
            <input className={INPUT} value={f.server_name ?? ''} onChange={(e) => setF({ ...f, server_name: e.target.value || null })} />
          </Field>
          <Field label={t('f_note')}>
            <textarea className={INPUT} rows={3} value={f.note ?? ''} onChange={(e) => setF({ ...f, note: e.target.value || null })} />
          </Field>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={header}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {party.party_size}</span>
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {party.time}</span>
          {areaName && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {areaName}</span>}
          {tableLabels && <span className="font-semibold text-white/80">{t('table')} {tableLabels}</span>}
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: color, color: '#111' }}>
            {t(`status_${status}`)}
          </span>
          <span className="text-white/40">{t(`source_${party.source}`)}</span>
        </span>
      }
      onClose={onClose}
      footer={
        <button onClick={() => setEditing(true)} className={`${GHOST} w-full`}>
          <Pencil className="h-4 w-4" /> {t('editParty')}
        </button>
      }
    >
      <div className="space-y-5">
        {(party.tags.length > 0 || party.note) && (
          <div className="rounded-xl bg-white/5 p-3 text-sm">
            {party.tags.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {party.tags.map((tag) => {
                  const I = TAG_ICON[tag as PartyTag];
                  return (
                    <span key={tag} className="flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-200">
                      {I && <I className="h-3 w-3" />} {t(`tag_${tag}`)}
                    </span>
                  );
                })}
              </div>
            )}
            {party.note && <p className="text-white/80">{party.note}</p>}
          </div>
        )}

        {party.phone && (
          <div className="flex gap-2">
            <a href={`tel:${party.phone}`} className={`${GHOST} flex-1`}><Phone className="h-4 w-4" /> {party.phone}</a>
            <a href={`https://wa.me/${digitsOnly(party.phone)}`} target="_blank" rel="noreferrer" className={`${GHOST} bg-green-600/20 text-green-300`}>
              <MessageCircle className="h-4 w-4" />
            </a>
          </div>
        )}

        {noticeHref && (
          <button onClick={onSendNotice} className={`${PRIMARY} w-full bg-green-600 text-white`}>
            <MessageCircle className="h-4 w-4" /> {t('sendNotice')}
          </button>
        )}

        {/* ── Where they are in the visit ── */}
        {s === 'seated' && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/40">
              {t('tableStatus')} · {elapsed(party.seated_at, now)}
              <span className={sat > turn ? 'ml-1 font-bold text-red-400' : 'ml-1 text-white/40'}>/ {turn}m</span>
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {TABLE_STATUS_ORDER.map((st) => {
                const I = TABLE_STATUS_ICON[st];
                const active = party.table_status === st;
                return (
                  <button
                    key={st}
                    onClick={() => onTableStatus(st)}
                    className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold ${active ? 'text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                    style={active ? { backgroundColor: TABLE_STATUS_COLOR[st] } : undefined}
                  >
                    <I className="h-4 w-4" /> {t(`ts_${st}`)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Next steps ── */}
        <div className="grid grid-cols-2 gap-2">
          {s === 'pending' && (
            <>
              <button onClick={() => onStatus('confirmed')} className={PRIMARY}><Check className="h-4 w-4" /> {t('act_confirm')}</button>
              <button onClick={() => onStatus('cancelled')} className={DANGER}>{t('act_decline')}</button>
            </>
          )}
          {(s === 'confirmed' || s === 'pending' || s === 'arrived' || s === 'partial') && (
            <>
              <button onClick={onSeat} className={`${PRIMARY} col-span-2`}>{t('act_seat')}</button>
              {s !== 'arrived' && <button onClick={() => onStatus('arrived')} className={GHOST}>{t('act_arrived')}</button>}
              {s !== 'partial' && <button onClick={() => onStatus('partial')} className={GHOST}>{t('act_partial')}</button>}
              {s !== 'pending' && <button onClick={() => onStatus('no_show')} className={GHOST}>{t('act_noShow')}</button>}
              {s !== 'pending' && <button onClick={() => onStatus('cancelled')} className={`${GHOST} text-red-300`}>{t('act_cancel')}</button>}
            </>
          )}
          {(s === 'waiting' || s === 'notified') && (
            <>
              <button onClick={onSeat} className={`${PRIMARY} col-span-2`}>{t('act_seat')}</button>
              <button onClick={onNotify} className={GHOST}>
                <MessageCircle className="h-4 w-4" /> {s === 'notified' ? t('act_notifyAgain') : t('act_tableReady')}
              </button>
              <button onClick={() => onStatus('cancelled')} className={`${GHOST} text-red-300`}>{t('act_remove')}</button>
            </>
          )}
          {s === 'seated' && (
            <>
              <button onClick={() => onStatus('finished')} className={`${PRIMARY} col-span-2`}>{t('act_finish')}</button>
              <button onClick={onMove} className={GHOST}><ArrowRightLeft className="h-4 w-4" /> {t('act_move')}</button>
              <button onClick={() => onStatus('arrived')} className={GHOST}>{t('act_unseat')}</button>
            </>
          )}
          {(s === 'finished' || s === 'no_show' || s === 'cancelled') && (
            <button onClick={() => onStatus(party.table_ids.length ? 'seated' : 'confirmed')} className={`${GHOST} col-span-2`}>
              {t('act_reopen')}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
