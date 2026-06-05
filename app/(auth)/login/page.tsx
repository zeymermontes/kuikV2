'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { signIn, type AuthResult } from '../actions';
import { Field, Input, Button } from '@/components/ui';

export default function LoginPage() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<AuthResult, FormData>(signIn, {});

  return (
    <form action={action}>
      <h1 className="mb-6 text-xl font-bold">{t('signIn')}</h1>

      <Field label={t('email')}>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label={t('password')}>
        <Input name="password" type="password" autoComplete="current-password" required />
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
