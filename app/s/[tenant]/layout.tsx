import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicIntlProvider } from '@/components/intl/PublicIntlProvider';
import { HtmlLang } from '@/components/intl/HtmlLang';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@/lib/config';
import { getTenantByHostKey } from '@/lib/tenant';
import { resolveMenuSettings, pickImage } from '@/lib/menu-settings';
import { themeVars as buildThemeVars, DARK } from '@/lib/theme-vars';
import { CUSTOM_FONT } from '@/lib/config';
import { BackgroundMusic } from '@/components/menu/BackgroundMusic';
import { tenantDescription, tenantOrigin } from '@/lib/seo';

type Params = { tenant: string };

/**
 * Opts this subtree into on-demand ISR instead of per-request rendering.
 *
 * A dynamic segment with no `generateStaticParams` is rendered fresh on every
 * request and served `no-store` — which is what every public menu was doing,
 * despite the `revalidate = 60` on the page. Returning an empty list plus
 * `dynamicParams` keeps builds independent of the database (no tenant list is
 * needed up front) while letting Next cache each tenant's menu the first time
 * it is asked for. Edits stay instant regardless: lib/revalidate.ts already
 * busts these exact paths whenever a restaurant changes something.
 */
export const dynamicParams = true;
export async function generateStaticParams(): Promise<Params[]> {
  return [];
}

function googleFontsHref(families: string[]): string {
  const params = families
    .map((f) => `family=${f.trim().replace(/ /g, '+')}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/**
 * The menu is read by diners, not by staff, so its language comes from the
 * restaurant's own `tenants.locale` — never from the KUIK_LOCALE cookie. There
 * is no language switcher on a public menu (it lives in the dashboard sidebar),
 * so nothing is lost, and staying cookie-free is what lets this whole subtree be
 * prerendered and cached instead of hitting the database on every view.
 */
function tenantLocale(value: string | null | undefined): Locale {
  return SUPPORTED_LOCALES.includes(value as Locale)
    ? (value as Locale)
    : DEFAULT_LOCALE;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { tenant: hostKey } = await params;
  const data = await getTenantByHostKey(decodeURIComponent(hostKey));
  if (!data) return { title: 'Menú', robots: { index: false } };

  const { tenant, theme } = data;
  const settings = resolveMenuSettings(theme.settings);
  const dark = settings.darkMode === 'on';
  const locale = tenantLocale(tenant.locale);
  // A dedicated favicon when the restaurant uploaded one, else the round logo.
  const icon =
    pickImage(
      theme.favicon_url,
      theme.favicon_dark_url,
      settings.faviconVariant,
      dark,
    ) ??
    pickImage(theme.logo_url, theme.logo_dark_url, settings.logoVariant, dark);
  const logo = pickImage(theme.logo_url, theme.logo_dark_url, settings.logoVariant, dark);
  // The share card: the cover photo when there is one (a wide image reads as a
  // place), else the logo.
  const cover = pickImage(theme.cover_image_url, theme.cover_image_dark_url, settings.coverVariant, dark);
  const ogImage = cover ?? logo;
  const description = tenantDescription(data, locale);
  const suffix = locale === 'en' ? 'Menu' : 'Menú';
  const title = `${tenant.name} · ${suffix}`;

  return {
    // Every relative URL below (canonicals set by the pages, images) resolves
    // against the restaurant's own origin: its verified domain, else the
    // subdomain. A tenant served under both hosts is thereby one site to Google.
    metadataBase: new URL(tenantOrigin(data)),
    title: { default: title, template: `%s · ${tenant.name}` },
    description,
    applicationName: tenant.name,
    robots: tenant.is_published ? undefined : { index: false, follow: false },
    openGraph: {
      type: 'website',
      siteName: tenant.name,
      title,
      description,
      locale: locale === 'en' ? 'en_US' : 'es_MX',
      images: ogImage ? [{ url: ogImage, alt: tenant.name }] : undefined,
    },
    twitter: {
      card: cover ? 'summary_large_image' : 'summary',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    icons: icon ? { icon, shortcut: icon, apple: icon } : undefined,
  };
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<Params>;
}) {
  const { tenant: hostKey } = await params;
  const data = await getTenantByHostKey(decodeURIComponent(hostKey));
  if (!data || !data.tenant.is_published) notFound();

  const { theme } = data;
  const settings = resolveMenuSettings(theme.settings);
  const dark = settings.darkMode === 'on';

  const locale = tenantLocale(data.tenant.locale);
  const messages = (await import(`@/messages/${locale}.json`)).default;
  // Explicit timeZone silences next-intl's ENVIRONMENT_FALLBACK log on every
  // SSR render, and the restaurant's own zone is the only correct value here.
  const timeZone = data.tenant.timezone || 'America/Mexico_City';

  // Per-tenant theme exposed as CSS variables; consumed by the menu components
  // (and re-applied live by the dashboard preview — see lib/theme-vars.ts).
  const themeVars = buildThemeVars(theme, settings);

  // background image is suppressed in forced-dark mode for legibility
  const showBg = theme.background_image_url && !dark;

  // Google fonts to load: every font value that isn't the uploaded custom one.
  const googleFonts = Array.from(
    new Set(
      [
        theme.font_family,
        theme.font_category,
        theme.font_product,
        theme.font_price,
        theme.font_description,
      ].filter((f): f is string => Boolean(f) && f !== CUSTOM_FONT),
    ),
  );

  return (
    <PublicIntlProvider locale={locale} messages={messages} timeZone={timeZone}>
      <HtmlLang locale={locale} />
      {theme.custom_font_url && (
        <style>{`@font-face{font-family:'${CUSTOM_FONT}';src:url('${theme.custom_font_url}');font-display:swap;}`}</style>
      )}
      {googleFonts.length > 0 && (
        <link rel="stylesheet" href={googleFontsHref(googleFonts)} />
      )}
      {settings.darkMode === 'auto' && (
        <style>{`@media (prefers-color-scheme: dark){
          .kuik-root{--brand-bg:${DARK.bg};--brand-text:${DARK.text};--brand-text-secondary:${DARK.textSecondary};--brand-surface:${DARK.surface};--brand-border:${DARK.border}${theme.tab_bar_color ? '' : `;--tab-bar-bg:color-mix(in srgb, ${DARK.bg} 90%, transparent)`}}
          .kuik-root .kuik-bg{background-image:none!important}
        }`}</style>
      )}
      <div
        className="kuik-root relative"
        style={{
          ...themeVars,
          color: 'var(--brand-text)',
          fontFamily: 'var(--brand-font)',
          minHeight: '100%',
        }}
      >
        {/* Fixed background layer. Sized to the LARGE viewport (100lvh) so it
            still covers the bottom when the mobile URL bar retracts during a
            momentum scroll — and never resizes (no `background-attachment: fixed`
            repaint jank, no "lifting" gap). */}
        <div
          aria-hidden
          className="kuik-bg pointer-events-none fixed left-0 top-0 -z-10"
          style={{
            width: '100vw',
            height: '100lvh',
            backgroundColor: 'var(--brand-bg)',
            backgroundImage: showBg
              ? `url(${theme.background_image_url})`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {children}
      </div>
      {theme.background_music_url && (
        <BackgroundMusic
          url={theme.background_music_url}
          volume={theme.background_music_volume ?? 50}
        />
      )}
    </PublicIntlProvider>
  );
}
