import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { HtmlLang } from './HtmlLang';

/**
 * Translations for staff-facing routes, read from the KUIK_LOCALE cookie.
 *
 * Every route that mounts this renders dynamically, because resolving the
 * cookie is a request-time read. That is the right trade here: these routes are
 * all behind authentication and could never have been cached anyway. What
 * matters is that the PUBLIC menu no longer inherits that cost — which is why
 * this lives in the group layouts rather than in the root one.
 */
export async function StaffIntlProvider({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <NextIntlClientProvider locale={locale} messages={await getMessages()}>
      <HtmlLang locale={locale} />
      {children}
    </NextIntlClientProvider>
  );
}
