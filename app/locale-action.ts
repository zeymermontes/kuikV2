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
  revalidatePath('/', 'layout');
}
