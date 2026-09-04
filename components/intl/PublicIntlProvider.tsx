'use client';

/**
 * `NextIntlClientProvider` imported through a CLIENT boundary.
 *
 * Imported from a Server Component, next-intl resolves to a server wrapper
 * that fills any prop you did not pass — formats, now, timeZone — from the
 * request config, and our request config reads the KUIK_LOCALE cookie. That
 * single hidden `cookies()` call is enough to throw DYNAMIC_SERVER_USAGE on
 * the prerendered public menu. Re-exporting from a 'use client' file selects
 * the plain client implementation instead, which uses exactly the props it is
 * given and touches no request state.
 *
 * Public pages only. Staff pages want the cookie — they use StaffIntlProvider.
 */
export { NextIntlClientProvider as PublicIntlProvider } from 'next-intl';
