import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { DEFAULT_LOCALE } from '@/lib/config';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Kuik — Menú digital para restaurantes',
  description:
    'Crea el menú digital de tu restaurante, personalízalo y recibe pedidos por WhatsApp.',
  // Default icon (overridden per-tenant on the menu site with the restaurant logo).
  icons: { icon: '/icon.svg' },
};

/**
 * Deliberately free of request-time APIs — do not add `cookies()`, `headers()`
 * or `getLocale()` here.
 *
 * This layout used to `await getLocale()`, which reads the KUIK_LOCALE cookie.
 * A cookie read in the ROOT layout is inherited by every route in the app, so
 * all 49 routes rendered dynamically and none could be prerendered: the public
 * tenant menus went out with `no-store`, Cloudflare reported them as DYNAMIC,
 * and every anonymous view cost a full server render plus database reads. That
 * is the whole of the app's DDoS exposure, bought for one `lang` attribute.
 *
 * Locale is supplied per subtree instead: `StaffIntlProvider` (cookie) on the
 * authenticated routes, and the restaurant's own `tenants.locale` on the public
 * menu. `lang` ships as the default and `HtmlLang` corrects it client-side
 * wherever a subtree resolved a different one.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={DEFAULT_LOCALE} className={`${inter.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
