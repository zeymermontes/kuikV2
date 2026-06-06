import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantByHostKey } from '@/lib/tenant';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { CUSTOM_FONT } from '@/lib/config';

type Params = { tenant: string };

/** Quote a font value, mapping the custom-font sentinel to its @font-face name. */
function fontCss(value: string): string {
  return `'${value}'`; // both the sentinel and Google names are used verbatim as family
}
/** CSS value for a per-element font; falls back to the main menu font. */
function elementFont(font: string | null): string {
  return font ? `${fontCss(font)}, var(--brand-font)` : 'var(--brand-font)';
}

function googleFontsHref(families: string[]): string {
  const params = families
    .map((f) => `family=${f.trim().replace(/ /g, '+')}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

const DARK = {
  bg: '#111114',
  text: '#f5f5f5',
  textSecondary: 'rgba(245,245,245,0.6)',
  surface: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { tenant: hostKey } = await params;
  const data = await getTenantByHostKey(decodeURIComponent(hostKey));
  if (!data) return { title: 'Menú' };

  const { tenant, theme } = data;
  // Use the restaurant's logo as the favicon / app icon across browsers.
  const icon = theme.logo_url;
  return {
    title: tenant.name,
    description: `Menú de ${tenant.name}`,
    openGraph: {
      title: tenant.name,
      description: `Menú de ${tenant.name}`,
      images: theme.logo_url ? [theme.logo_url] : undefined,
    },
    icons: icon
      ? { icon, shortcut: icon, apple: icon }
      : undefined,
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

  // Per-tenant theme exposed as CSS variables; consumed by the menu components.
  const themeVars = {
    '--brand-primary': theme.primary_color,
    '--brand-secondary': theme.secondary_color,
    '--brand-bg': dark ? DARK.bg : theme.background_color,
    '--brand-text': dark ? DARK.text : theme.text_color,
    '--brand-text-secondary': dark ? DARK.textSecondary : theme.text_secondary_color ?? '#737373',
    '--brand-surface': dark ? DARK.surface : theme.card_color ?? '#ffffff',
    '--brand-border': dark ? DARK.border : theme.border_color ?? '#e5e5e5',
    '--brand-separator': theme.separator_color ?? '#e5e5e5',
    '--brand-font': `${fontCss(theme.font_family)}, system-ui, sans-serif`,
    // Per-element fonts (fall back to the main font).
    '--font-category': elementFont(theme.font_category),
    '--font-product': elementFont(theme.font_product),
    '--font-price': elementFont(theme.font_price),
    '--font-description': elementFont(theme.font_description),
    // Category tab bar + colors (fall back to the primary color).
    '--tab-bar-bg': theme.tab_bar_color ?? 'color-mix(in srgb, var(--brand-bg) 90%, transparent)',
    '--tab-selected-bg': theme.tab_selected_color ?? theme.primary_color,
    '--tab-unselected-bg':
      theme.tab_unselected_color ?? `color-mix(in srgb, ${theme.primary_color} 12%, transparent)`,
    '--tab-selected-text': theme.tab_font_color ?? '#ffffff',
    '--tab-unselected-text': theme.tab_font_color ?? theme.primary_color,
    // Buttons (fall back to the primary color / white text).
    '--brand-button': theme.button_color ?? theme.primary_color,
    '--brand-button-text': theme.button_text_color ?? '#ffffff',
  } as React.CSSProperties;

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
    <>
      {theme.custom_font_url && (
        <style>{`@font-face{font-family:'${CUSTOM_FONT}';src:url('${theme.custom_font_url}');font-display:swap;}`}</style>
      )}
      {googleFonts.length > 0 && <link rel="stylesheet" href={googleFontsHref(googleFonts)} />}
      {settings.darkMode === 'auto' && (
        <style>{`@media (prefers-color-scheme: dark){
          .kuik-root{--brand-bg:${DARK.bg};--brand-text:${DARK.text};--brand-surface:${DARK.surface};background-image:none!important}
        }`}</style>
      )}
      <div
        className="kuik-root"
        style={{
          ...themeVars,
          backgroundColor: 'var(--brand-bg)',
          color: 'var(--brand-text)',
          fontFamily: 'var(--brand-font)',
          backgroundImage: showBg ? `url(${theme.background_image_url})` : undefined,
          backgroundSize: 'cover',
          backgroundAttachment: 'fixed',
          minHeight: '100%',
        }}
      >
        {children}
      </div>
    </>
  );
}
