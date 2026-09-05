'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FloorTable, ReservationArea } from '@/lib/database.types';
import { PARTY_TAGS, QUOTE_CHOICES, type PartyTag } from '@/lib/host/model';
import { Sheet, Field, Chip, Stepper, INPUT, PRIMARY, GHOST, TAG_ICON } from './ui';

// Someone at the door. Either they wait (with a quote) or they sit now; the
// host picks the table on the plan right after, exactly like seating a booking.

export function WalkInSheet({
  preset,
  tables,
  areas,
  onClose,
  onSubmit,
}: {
  preset: { party?: number; quote?: number; tableIds?: string[] };
  tables: FloorTable[];
  areas: ReservationArea[];
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    phone: string | null;
    party: number;
    note: string | null;
    quotedMinutes: number | null;
    tags: string[];
    areaId: string | null;
    seatNow: boolean;
  }) => void;
}) {
  const t = useTranslations('host');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [party, setParty] = useState(preset.party ?? 2);
  const [quote, setQuote] = useState<number | null>(preset.quote ?? null);
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [areaId, setAreaId] = useState<string>('');
  const preTable = (preset.tableIds ?? []).map((id) => tables.find((x) => x.id === id)?.label).filter(Boolean).join(' + ');

  const submit = (seatNow: boolean) =>
    onSubmit({
      name: name.trim() || t('walkIn'),
      phone: phone.trim() || null,
      party,
      note: note.trim() || null,
      quotedMinutes: seatNow ? null : quote,
      tags,
      areaId: areaId || null,
      seatNow,
    });

  return (
    <Sheet
      title={preTable ? t('seatAtTable', { x: preTable }) : t('addWalkIn')}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {!preTable && (
            <button onClick={() => submit(false)} className={`${GHOST} flex-1`}>{t('toWaitlist')}</button>
          )}
          <button onClick={() => submit(true)} className={`${PRIMARY} flex-1`}>{t('seatNow')}</button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label={t('f_party')}>
          <Stepper value={party} onChange={setParty} />
        </Field>
        <Field label={t('f_name')}>
          <input autoFocus className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('walkIn')} />
        </Field>
        <Field label={t('f_phone')}>
          <input className={INPUT} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('phoneHint')} />
        </Field>
        {!preTable && (
          <Field label={t('f_quote')}>
            <div className="flex flex-wrap gap-1.5">
              {QUOTE_CHOICES.map((q) => (
                <Chip key={q} small active={quote === q} onClick={() => setQuote(q)}>{q}m</Chip>
              ))}
            </div>
          </Field>
        )}
        {areas.length > 0 && (
          <Field label={t('f_area')}>
            <div className="flex flex-wrap gap-1.5">
              <Chip small active={areaId === ''} onClick={() => setAreaId('')}>{t('anyArea')}</Chip>
              {areas.map((a) => (
                <Chip key={a.id} small active={areaId === a.id} onClick={() => setAreaId(a.id)}>{a.name}</Chip>
              ))}
            </div>
          </Field>
        )}
        <Field label={t('f_tags')}>
          <div className="flex flex-wrap gap-1.5">
            {PARTY_TAGS.map((tag) => {
              const I = TAG_ICON[tag as PartyTag];
              return (
                <Chip key={tag} small active={tags.includes(tag)} onClick={() => setTags(tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag])}>
                  <I className="h-3.5 w-3.5" /> {t(`tag_${tag}`)}
                </Chip>
              );
            })}
          </div>
        </Field>
        <Field label={t('f_note')}>
          <textarea className={INPUT} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
