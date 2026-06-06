'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ROOT_DOMAIN } from '@/lib/config';
import { createTenant, type OnboardingResult } from './actions';
import { Field, Input, Button } from '@/components/ui';

const ERROR_KEYS = new Set(['subdomainTaken', 'subdomainInvalid', 'name', 'needPro']);

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const [state, action, pending] = useActionState<OnboardingResult, FormData>(
    createTenant,
    {},
  );
  const [subdomain, setSubdomain] = useState('');

  const errorMsg =
    state.error && ERROR_KEYS.has(state.error)
      ? t(state.error as 'subdomainTaken')
      : state.error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-5 py-10">
      <form
        action={action}
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm"
      >
        <h1 className="mb-6 text-xl font-bold">{t('title')}</h1>

        <Field label={t('restaurantName')}>
          <Input name="name" required />
        </Field>

        <Field
          label={t('subdomain')}
          hint={t('subdomainHelp', { subdomain: subdomain || 'tu-restaurante' })}
        >
          <div className="flex items-center rounded-lg border border-neutral-300 focus-within:border-neutral-900">
            <input
              name="subdomain"
              value={subdomain}
              onChange={(e) =>
                setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }
              className="flex-1 rounded-l-lg px-3 py-2.5 text-sm outline-none"
              required
            />
            <span className="px-3 text-sm text-neutral-400">.{ROOT_DOMAIN}</span>
          </div>
        </Field>

        <Field label={t('whatsapp')} hint={t('whatsappHelp')}>
          <Input name="whatsapp" inputMode="numeric" placeholder="5215555555555" />
        </Field>

        {errorMsg && <p className="mb-3 text-sm text-red-600">{errorMsg}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? '…' : t('create')}
        </Button>
      </form>
    </main>
  );
}
