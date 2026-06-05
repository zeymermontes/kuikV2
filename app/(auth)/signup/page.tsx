'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { signUp, type AuthResult } from '../actions';
import { Field, Input, Button } from '@/components/ui';

export default function SignupPage() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<AuthResult, FormData>(signUp, {});

  if (state.message === 'check-email') {
    return <p className="text-center text-neutral-700">{t('checkEmail')}</p>;
  }

  return (
    <form action={action}>
      <h1 className="mb-6 text-xl font-bold">{t('signUp')}</h1>

      <Field label={t('fullName')}>
        <Input name="fullName" autoComplete="name" required />
      </Field>
      <Field label={t('email')}>
        <Input name="email" type="email" autoComplete="email" required />
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
        <Link href="/login" className="font-medium text-neutral-900 underline">
          {t('signIn')}
        </Link>
      </p>
    </form>
  );
}
