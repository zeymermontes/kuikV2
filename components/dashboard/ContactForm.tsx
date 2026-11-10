'use client';

import { useTranslations } from 'next-intl';
import type { TenantContact } from '@/lib/database.types';
import { Card, Field, Input, Label } from '@/components/ui';
import { HoursEditor } from '@/components/dashboard/HoursEditor';
import { updateContact, renameTenant, updateTimezone } from '@/app/(dashboard)/settings-actions';
import { digitsOnly } from '@/lib/utils';
import { TIMEZONES } from '@/lib/timezones';
import { nowHHMMInTz } from '@/lib/time';
import { useEffect, useState } from 'react';

export function ContactForm({ contact, name, timezone }: { contact: TenantContact; name: string; timezone: string }) {
  const t = useTranslations('contact');
  const [tz, setTz] = useState(timezone);
  // The clock in the chosen zone, live: the quickest way to see the zone is
  // wrong is to read a time that is not the one on the wall. The interval
  // only bumps a counter; the time itself is read on render, for whichever
  // zone is selected by then.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  void tick;
  const now = nowHHMMInTz(tz);
  const known = TIMEZONES.some((z) => z.id === tz);

  const text = [
    { key: 'instagram', label: t('instagram') },
    { key: 'facebook', label: t('facebook') },
    { key: 'website', label: t('website') },
    { key: 'email', label: t('email') },
    { key: 'address', label: t('address') },
    { key: 'maps_url', label: t('mapsUrl') },
  ] as const;

  return (
    <Card className="max-w-xl">
      <Field label={t('businessName')}>
        <Input
          defaultValue={name}
          maxLength={80}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== name) void renameTenant(next);
          }}
        />
        <p className="mt-1 text-xs text-neutral-500">{t('businessNameHint')}</p>
      </Field>

      <Field label={t('whatsapp')}>
        <Input
          defaultValue={contact.whatsapp_phone ?? ''}
          inputMode="numeric"
          placeholder="5215555555555"
          onBlur={(e) =>
            updateContact({ whatsapp_phone: digitsOnly(e.target.value) || null })
          }
        />
      </Field>

      {text.map(({ key, label }) => (
        <Field key={key} label={label}>
          <Input
            defaultValue={(contact[key] as string | null) ?? ''}
            onBlur={(e) => updateContact({ [key]: e.target.value || null })}
          />
        </Field>
      ))}

      <div className="mt-4 border-t border-neutral-100 pt-4">
        <Label>{t('hours')}</Label>
        <HoursEditor value={contact.hours} onChange={(hours) => updateContact({ hours })} />
      </div>

      <div className="mt-4 border-t border-neutral-100 pt-4">
        <Field label={t('timezone')}>
          <select
            value={tz}
            onChange={(e) => {
              const next = e.target.value;
              setTz(next);
              void updateTimezone(next);
            }}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
          >
            {!known && <option value={tz}>{tz}</option>}
            {TIMEZONES.map((z) => (
              <option key={z.id} value={z.id}>{z.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">
            {/* The server renders one minute, the browser may read the next. */}
            <span suppressHydrationWarning>{t('timezoneNow', { time: now })}</span> {t('timezoneHint')}
          </p>
        </Field>
      </div>
    </Card>
  );
}
