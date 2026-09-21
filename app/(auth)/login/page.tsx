'use client';

import { Suspense, useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signIn, type AuthResult } from '../actions';
import { Field, Input, Button } from '@/components/ui';

/** useSearchParams needs a Suspense boundary above it to prerender. */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<AuthResult, FormData>(signIn, {});
  // Sent here by the sign-up form when the address already has an account.
  const params = useSearchParams();
  const exists = params.get('exists') === '1';
  // Sent here by the link in the confirmation email.
  const confirmed = params.get('confirmed') === '1';
  const email = params.get('email') ?? '';

  return (
    <form action={action}>
      <h1 className="mb-6 text-xl font-bold">{t('signIn')}</h1>

      {confirmed && !state.error && (
        <p className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{t('confirmed')}</p>
      )}
      {exists && !state.error && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('accountExists')}</p>
      )}

      <Field label={t('email')}>
        <Input name="email" type="email" autoComplete="email" defaultValue={email} required />
      </Field>
      <Field label={t('password')}>
        <Input name="password" type="password" autoComplete="current-password" autoFocus={exists || confirmed} required />
      </Field>

      {state.error && <p className="mb-3 text-sm text-red-600">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? '…' : t('signIn')}
      </Button>

      <p className="mt-4 text-center text-sm text-neutral-500">
        {t('noAccount')}{' '}
        <Link href="/signup" className="font-medium text-neutral-900 underline">
          {t('signUp')}
        </Link>
      </p>
    </form>
  );
}
