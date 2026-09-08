'use client';

import { useSyncExternalStore } from 'react';
import { MessageCircle, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The Kuik team's WhatsApp for free menu setup help. */
export const ADVISOR_WHATSAPP = '525659128915';

/** Accounts younger than this see the welcome popup once per device. */
const NEW_ACCOUNT_DAYS = 30;

const seenKey = (tenantId: string) => `kuik_advisor_seen:${tenantId}`;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
function markSeen(tenantId: string) {
  try {
    localStorage.setItem(seenKey(tenantId), String(Date.now()));
  } catch {}
  listeners.forEach((cb) => cb());
}

export function advisorLink(restaurantName: string, locale: string): string {
  const text =
    locale === 'en'
      ? `Hi! I'd like help setting up the menu of ${restaurantName} on Kuik.`
      : `¡Hola! Quiero ayuda para armar el menú de ${restaurantName} en Kuik.`;
  return `https://wa.me/${ADVISOR_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

/**
 * "A Kuik advisor can build your menu with you, free": a popup the first
 * time a new account opens the dashboard on a device, and a strip that
 * stays on the menu page. One WhatsApp link, prefilled with the restaurant.
 */
export function AdvisorNotice({
  tenantId,
  restaurantName,
  createdAt,
  locale,
  variant,
}: {
  tenantId: string;
  restaurantName: string;
  /** The tenant's creation time; the popup is only for recent sign-ups. */
  createdAt: string;
  locale: string;
  variant: 'popup' | 'card';
}) {
  const t = useTranslations('advisor');
  const seen = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(seenKey(tenantId)) !== null;
      } catch {
        return true;
      }
    },
    () => true, // never on the server: no flash before hydration
  );
  const href = advisorLink(restaurantName, locale);

  if (variant === 'card') {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <Sparkles className="h-4 w-4 shrink-0 text-emerald-600" />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{t('cardTitle')}</span> {t('cardBody')}
        </span>
        <a
          href={href}
          target="_blank"
          rel="noopener"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <MessageCircle className="h-3.5 w-3.5" /> {t('cta')}
        </a>
      </div>
    );
  }

  const recent = Date.now() - new Date(createdAt).getTime() < NEW_ACCOUNT_DAYS * 24 * 3600_000;
  if (seen || !recent) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => markSeen(tenantId)}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <Sparkles className="h-5 w-5" />
          </div>
          <button onClick={() => markSeen(tenantId)} aria-label={t('later')} className="p-1 text-neutral-400 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <h2 className="mt-4 text-xl font-bold">{t('popupTitle')}</h2>
        <p className="mt-2 text-sm text-neutral-600">{t('popupBody')}</p>
        <a
          href={href}
          target="_blank"
          rel="noopener"
          onClick={() => markSeen(tenantId)}
          className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <MessageCircle className="h-4 w-4" /> {t('cta')}
        </a>
        <button onClick={() => markSeen(tenantId)} className="mt-3 w-full py-1 text-sm text-neutral-500 hover:text-neutral-900">
          {t('later')}
        </button>
      </div>
    </div>
  );
}
