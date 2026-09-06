'use client';

import { useTranslations } from 'next-intl';
import { PROTOCOL, ROOT_DOMAIN } from '@/lib/config';

/**
 * The line at the bottom of every public menu and landing. It is how a
 * restaurant owner browsing a competitor's menu finds Kuik, and every one of
 * these links is a real backlink to kuik.mx from a distinct host, which is
 * what search engines weigh most when ranking the platform itself.
 */
export function MadeWithKuik({ subdomain }: { subdomain: string }) {
  const t = useTranslations('menu');
  const href = `${PROTOCOL}://${ROOT_DOMAIN}/menu-digital?utm_source=menu&utm_medium=footer&utm_campaign=${encodeURIComponent(subdomain)}`;
  return (
    <footer className="mt-10 px-5 pb-2 text-center text-xs opacity-60" style={{ color: 'var(--brand-text-secondary)' }}>
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
        {t('madeWith')} <span className="font-semibold">Kuik</span>
        <span aria-hidden>·</span>
        <span>{t('madeWithCta')}</span>
      </a>
    </footer>
  );
}
