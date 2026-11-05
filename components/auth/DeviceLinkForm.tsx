'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader2, TabletSmartphone } from 'lucide-react';
import { linkDevice, type LinkResult } from '@/app/(auth)/device/actions';
import { CODE_LENGTH, cleanCode, formatCode } from '@/lib/devices/code';
import { saveDeviceBranch } from '@/lib/pos/branch';
import { Button } from '@/components/ui';

/**
 * The code a device joins with. Typed by hand on a tablet, so the field is
 * forgiving: any case, with or without the dash, and the letters the code
 * never uses turn into the digits they look like as they are typed.
 */
export function DeviceLinkForm({
  initialCode,
  current,
}: {
  initialCode: string;
  /** Whoever is signed in on this browser, if anyone: linking replaces them. */
  current: { name: string; isDevice: boolean } | null;
}) {
  const t = useTranslations('deviceLink');
  const [state, action, pending] = useActionState<LinkResult, FormData>(linkDevice, {});
  const [code, setCode] = useState(() => formatCode(initialCode));
  const complete = cleanCode(code).length === CODE_LENGTH;

  useEffect(() => {
    if (!state.ok) return;
    // The branch the owner chose is what this device works at from now on
    // (lib/pos/branch.ts); whatever was remembered before is not.
    saveDeviceBranch(state.branch ?? null);
    // A full load, not a client navigation: the session cookie is new and
    // nothing rendered so far knows it.
    window.location.replace('/terminal');
  }, [state]);

  if (state.ok) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        <p className="text-sm text-neutral-600">{t('linked')}</p>
      </div>
    );
  }

  return (
    <form action={action}>
      <TabletSmartphone className="mb-3 h-7 w-7 text-neutral-400" />
      <h1 className="mb-1 text-xl font-bold">{t('title')}</h1>
      <p className="mb-5 text-sm text-neutral-500">{t('hint')}</p>

      {current && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t(current.isDevice ? 'replacesDevice' : 'replacesPerson', { name: current.name })}
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-neutral-700">{t('code')}</span>
        <input
          name="code"
          value={code}
          onChange={(e) => setCode(formatCode(cleanCode(e.target.value).slice(0, CODE_LENGTH)))}
          placeholder="XXXX-XXXX"
          autoFocus={!initialCode}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="go"
          aria-invalid={Boolean(state.error)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-center font-mono text-2xl font-semibold uppercase tracking-[0.2em] outline-none placeholder:text-neutral-300 focus:border-neutral-900"
          required
        />
      </label>

      {state.error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {t(`error_${state.error}`)}
        </p>
      )}

      <Button type="submit" className="mt-5 w-full" disabled={pending || !complete}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('submit')}
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
