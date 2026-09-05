'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TenantTheme } from '@/lib/database.types';

/**
 * The owner's real public menu in a phone frame, following every edit before
 * it is saved: the iframe (LiveMenu) announces `kuik:ready`, then we post the
 * draft theme on each change. Nothing here draws the menu — it IS the menu.
 */
export function LivePreview({
  url,
  published,
  theme,
  reloadKey = 0,
}: {
  /** The tenant's public base URL, on our own domain. */
  url: string;
  published: boolean;
  /** The draft theme, with the draft `settings` folded in. */
  theme: TenantTheme;
  /** Bump after a server-side save the draft cannot carry (a category's design) to reload the menu. */
  reloadKey?: number;
}) {
  const t = useTranslations('design');
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const origin = new URL(url).origin;

  const send = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: 'kuik:design', theme }, origin);
  }, [theme, origin]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === origin && (e.data as { type?: string } | null)?.type === 'kuik:ready') setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin]);

  // Coalesce a burst of edits (a colour picker drag) into one message.
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(send, 80);
    return () => clearTimeout(id);
  }, [ready, send]);

  // Reload after the server has the change (the saving action revalidated the
  // page); the menu then announces ready again and gets the draft re-sent.
  useEffect(() => {
    if (!reloadKey) return;
    const id = setTimeout(() => frame.current?.contentWindow?.postMessage({ type: 'kuik:reload' }, origin), 600);
    return () => clearTimeout(id);
  }, [reloadKey, origin]);

  if (!published) {
    return <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">{t('previewUnpublished')}</p>;
  }

  return (
    <div>
      <div className="mx-auto w-[320px] overflow-hidden rounded-[2.2rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-xl">
        <iframe
          ref={frame}
          src={`${url}/menu`}
          title={t('preview')}
          className="block h-[640px] w-full bg-white"
        />
      </div>
      <p className="mt-2 text-center text-xs text-neutral-500">{t('previewHint')}</p>
    </div>
  );
}
