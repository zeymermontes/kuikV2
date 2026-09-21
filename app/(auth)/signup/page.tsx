'use client';

import { Suspense, useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signUp, type AuthResult } from '../actions';
import { Field, Input, Button } from '@/components/ui';

/** useSearchParams needs a Suspense boundary above it to prerender. */
export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<AuthResult, FormData>(signUp, {});
  // An invite email (lib/email.ts) links here with the invited address: the
  // account has to be created with that one for the invite to be claimed.
  const params = useSearchParams();
  const invited = params.get('invite') === '1';
  const email = params.get('email') ?? '';

  if (state.message === 'check-email') {
    return <p className="text-center text-neutral-700">{t('checkEmail')}</p>;
  }

  return (
    <form action={action}>
      <h1 className="mb-6 text-xl font-bold">{t('signUp')}</h1>

      {invited && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('invitedNotice')}</p>
      )}

      <Field label={t('fullName')}>
        <Input name="fullName" autoComplete="name" required />
      </Field>
      <Field label={t('email')}>
        <Input name="email" type="email" autoComplete="email" defaultValue={email} readOnly={invited && Boolean(email)} required />
      </Field>
      <Field label={t('password')}>
        <Input name="password" type="password" autoComplete="new-password" minLength={6} required />
      </Field>

      {state.error && <p className="mb-3 text-sm text-red-600">{state.error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? '…' : t('signUp')}
      </Button>

      <p className="mt-4 text-center text-sm text-neutral-500">
        {t('haveAccount')}{' '}
        <Link href={email ? `/login?email=${encodeURIComponent(email)}` : '/login'} className="font-medium text-neutral-900 underline">
          {t('signIn')}
        </Link>
      </p>
    </form>
  );
}
