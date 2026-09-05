'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import type { TenantTheme } from '@/lib/database.types';
import { PROTOCOL, ROOT_DOMAIN, ROOT_HOST, APP_SUBDOMAIN, CUSTOM_FONT } from '@/lib/config';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { themeVars } from '@/lib/theme-vars';
import { googleFontsHref } from '@/lib/category-theme';
import { MenuView } from './MenuView';

/**
 * The public menu, plus a listener for the dashboard's live preview.
 *
 * The Design page embeds the real menu in an iframe and posts every unsaved
 * change as `{ type: 'kuik:design', theme }`. Only messages from our own
 * dashboard origins are honoured. On one we re-render MenuView with the new
 * theme and re-apply the CSS variables the server layout put on `.kuik-root`,
 * so the preview is the menu itself — same data, same code — not a mock.
 * Outside an iframe none of this runs.
 */
export function LiveMenu(props: ComponentProps<typeof MenuView>) {
  const [theme, setTheme] = useState(props.theme);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (window.parent === window) return;
    const allowed = new Set([
      `${PROTOCOL}://${ROOT_DOMAIN}`,
      `${PROTOCOL}://www.${ROOT_DOMAIN}`,
      `${PROTOCOL}://${APP_SUBDOMAIN}.${ROOT_DOMAIN}`,
    ]);
    // Dev only: the configured root port may differ from the one the server
    // actually got; the dashboard then lives on the iframe's own port.
    if (ROOT_HOST === 'localhost') allowed.add(`${location.protocol}//localhost:${location.port}`);
    const onMessage = (e: MessageEvent) => {
      if (!allowed.has(e.origin)) return;
      const d = e.data as { type?: string; theme?: TenantTheme } | null;
      // Something saved server-side (a category's design): fetch it afresh.
      if (d?.type === 'kuik:reload') return location.reload();
      if (!d || d.type !== 'kuik:design' || !d.theme) return;
      setPreview(true);
      setTheme(d.theme);
      applyTheme(d.theme);
    };
    window.addEventListener('message', onMessage);
    // Tell the dashboard we are listening; it answers with the current draft.
    window.parent.postMessage({ type: 'kuik:ready' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return <MenuView {...props} theme={theme} preview={preview} />;
}

/** Re-apply what app/s/[tenant]/layout.tsx renders server-side from the theme. */
function applyTheme(theme: TenantTheme) {
  const settings = resolveMenuSettings(theme.settings);
  const root = document.querySelector<HTMLElement>('.kuik-root');
  if (root) {
    for (const [k, v] of Object.entries(themeVars(theme, settings))) {
      if (v != null) root.style.setProperty(k, String(v));
    }
  }
  const bg = document.querySelector<HTMLElement>('.kuik-bg');
  if (bg) {
    const show = theme.background_image_url && settings.darkMode !== 'on';
    bg.style.backgroundImage = show ? `url(${theme.background_image_url})` : '';
  }
  const fonts = Array.from(
    new Set(
      [theme.font_family, theme.font_category, theme.font_product, theme.font_price, theme.font_description].filter(
        (f): f is string => Boolean(f) && f !== CUSTOM_FONT,
      ),
    ),
  );
  if (fonts.length) {
    let link = document.getElementById('kuik-preview-fonts') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = 'kuik-preview-fonts';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    const href = googleFontsHref(fonts);
    if (link.href !== href) link.href = href;
  }
}
