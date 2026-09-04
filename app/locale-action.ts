'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { SUPPORTED_LOCALES, type Locale } from '@/lib/config';
import { LOCALE_COOKIE } from '@/i18n/request';

export async function setLocale(locale: Locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  // Refresh what the cookie actually feeds. `revalidatePath('/', 'layout')`
  // used to sit here, but that flushes EVERY route — including the ISR cache of
  // every tenant's public menu, which doesn't read this cookie at all. The
  // switcher lives in the dashboard, so refreshing the dashboard tree (plus the
  // marketing page, which renders in the cookie's language) is the whole job.
  revalidatePath('/', 'page');
  revalidatePath('/(dashboard)', 'layout');
  revalidatePath('/(auth)', 'layout');
  revalidatePath('/onboarding', 'layout');
}
