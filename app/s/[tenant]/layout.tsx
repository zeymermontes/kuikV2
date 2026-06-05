import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantByHostKey } from '@/lib/tenant';
import { resolveMenuSettings } from '@/lib/menu-settings';

type Params = { tenant: string };

function googleFontHref(family: string): string {
  const f = family.trim().replace(/ /g, '+');
  return `https://fonts.googleapis.com/css2?family=${f}:wght@400;500;600;700&display=swap`;
}

const DARK = { bg: '#111114', text: '#f5f5f5', surface: 'rgba(255,255,255,0.07)' };

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
    '--brand-surface': dark ? DARK.surface : 'rgba(255,255,255,0.82)',
    '--brand-font': `'${theme.font_family}', system-ui, sans-serif`,
  } as React.CSSProperties;

  // background image is suppressed in forced-dark mode for legibility
  const showBg = theme.background_image_url && !dark;

  return (
    <>
      <link rel="stylesheet" href={googleFontHref(theme.font_family)} />
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
