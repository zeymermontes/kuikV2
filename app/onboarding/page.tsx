'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ROOT_DOMAIN } from '@/lib/config';
import { COUNTRIES, DEFAULT_COUNTRY, dialFor } from '@/lib/countries';
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
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [localNumber, setLocalNumber] = useState('');
  const dial = dialFor(country);

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
          <div className="flex items-center rounded-lg border border-neutral-300 focus-within:border-neutral-900 focus-within:ring-2 focus-within:ring-neutral-900/10">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              aria-label={t('countryCode')}
              className="rounded-l-lg border-r border-neutral-300 bg-transparent py-2.5 pl-3 pr-2 text-sm outline-none"
            >
              {COUNTRIES.map((c) => (
                <option key={c.iso} value={c.iso}>
                  {c.flag} +{c.dial}
                </option>
              ))}
            </select>
            <input
              value={localNumber}
              onChange={(e) => setLocalNumber(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="5512345678"
              className="min-w-0 flex-1 rounded-r-lg px-3 py-2.5 text-sm outline-none"
            />
          </div>
          {/* The action reads the full number here (dial code + local digits). */}
          <input type="hidden" name="whatsapp" value={localNumber ? dial + localNumber : ''} />
        </Field>

        {errorMsg && <p className="mb-3 text-sm text-red-600">{errorMsg}</p>}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? '…' : t('create')}
        </Button>
      </form>
    </main>
  );
}
