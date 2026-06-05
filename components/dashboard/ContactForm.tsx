'use client';

import { useTranslations } from 'next-intl';
import type { TenantContact } from '@/lib/database.types';
import { Card, Field, Input } from '@/components/ui';
import { updateContact } from '@/app/(dashboard)/settings-actions';
import { digitsOnly } from '@/lib/utils';

export function ContactForm({ contact }: { contact: TenantContact }) {
  const t = useTranslations('contact');

  const text = [
    { key: 'instagram', label: t('instagram') },
    { key: 'facebook', label: t('facebook') },
    { key: 'website', label: t('website') },
    { key: 'email', label: t('email') },
    { key: 'address', label: t('address') },
  ] as const;

  return (
    <Card className="max-w-xl">
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
    </Card>
  );
}
