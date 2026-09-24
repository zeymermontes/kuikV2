'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ChevronLeft, Loader2, Send, X } from 'lucide-react';
import { getWaTemplates, sendPartyTemplate } from '@/app/host/actions';
import { errorHint, renderPreview, type WaTemplateMeta, type WaTemplateOption } from '@/lib/whatsapp/template-rules';
import { WaTemplatePreview } from './WaTemplatePreview';

/**
 * "Enviar plantilla": the picker a person uses when the 24-hour window has
 * closed. Lists the approved templates (confirmed with Meta on open), asks
 * for each variable, and shows the exact bubble the diner will get.
 * Light-themed on purpose: it sits over the dark host sheet and the light
 * dashboard alike, and the preview inside is WhatsApp's own colours.
 */
export function WaTemplateModal({
  conversationId,
  onClose,
  onSent,
  manageHref = '/whatsapp/templates',
}: {
  conversationId: string;
  onClose: () => void;
  /** The message as sent, for an optimistic bubble. */
  onSent: (sent: { body: string; template: WaTemplateMeta }) => void;
  /** Where the manager lives, for the empty state. */
  manageHref?: string | null;
}) {
  const t = useTranslations('waTemplate');
  const [templates, setTemplates] = useState<WaTemplateOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<WaTemplateOption | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [headerParam, setHeaderParam] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getWaTemplates(conversationId)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) setLoadError(r.error ?? 'error');
        setTemplates(r.templates);
      })
      .catch(() => !cancelled && setLoadError('error'));
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const preview = useMemo(() => {
    if (!chosen) return null;
    return {
      header: chosen.header ? renderPreview(chosen.header, { header: headerParam }, true) : null,
      body: renderPreview(chosen.body, params),
    };
  }, [chosen, params, headerParam]);

  const ready =
    chosen &&
    !chosen.blocked &&
    (!chosen.headerVar || headerParam.trim()) &&
    params.length === chosen.varCount &&
    params.every((p) => p.trim());

  function pick(o: WaTemplateOption) {
    setChosen(o);
    setParams(Array.from({ length: o.varCount }, () => ''));
    setHeaderParam('');
    setError(null);
  }

  function send() {
    if (!chosen || !ready || sending) return;
    setError(null);
    const tpl = { name: chosen.name, language: chosen.language, header: chosen.header, body: chosen.body, footer: chosen.footer, buttons: chosen.buttons };
    start(async () => {
      let r: Awaited<ReturnType<typeof sendPartyTemplate>>;
      try {
        r = await sendPartyTemplate(conversationId, tpl, params, chosen.headerVar ? headerParam : null);
      } catch {
        r = { ok: false, error: 'send_failed' };
      }
      if (!r.ok) {
        const hint = errorHint(r.error ?? '');
        setError(hint ? t(`hints.${hint}`) : r.error === 'template_not_approved' ? t('notApproved') : `${t('failed')} ${r.error ?? ''}`.trim());
        return;
      }
      onSent({
        body: preview?.body ?? chosen.body,
        template: {
          name: chosen.name,
          lang: chosen.language,
          params,
          ...(chosen.headerVar ? { headerParam } : {}),
          header: preview?.header ?? null,
          footer: chosen.footer,
          buttons: chosen.buttons,
        },
      });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => !sending && onClose()} />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white text-neutral-900 shadow-2xl sm:rounded-2xl">
        <header className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
          {chosen ? (
            <button onClick={() => setChosen(null)} className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100" aria-label={t('back')}>
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold">{chosen ? chosen.name : t('title')}</h2>
            {!chosen && <p className="text-xs text-neutral-500">{t('hint')}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100" aria-label={t('close')}>
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {templates === null && !loadError && (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
            </p>
          )}
          {loadError && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {loadError === 'no_official_session' || loadError === 'not_cloud' ? t('noSession') : `${t('loadFailed')} ${loadError}`}
            </p>
          )}
          {templates && templates.length === 0 && !loadError && (
            <div className="space-y-3 py-6 text-center text-sm text-neutral-500">
              <p>{t('none')}</p>
              {manageHref && (
                <Link href={manageHref} className="inline-block rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                  {t('manage')}
                </Link>
              )}
            </div>
          )}
          {templates && !chosen && templates.length > 0 && (
            <ul className="space-y-3">
              {templates.map((o) => (
                <li key={o.id}>
                  <button onClick={() => pick(o)} className="w-full rounded-xl border border-neutral-200 p-3 text-left transition hover:border-neutral-400">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs font-semibold">{o.name}</span>
                      <span className="shrink-0 text-[11px] text-neutral-500">{o.category} · {o.language}</span>
                    </div>
                    <WaTemplatePreview compact header={o.header} mediaHeader={o.mediaHeader} body={o.body} footer={o.footer} buttons={o.buttons} mediaLabel={t('media')} />
                    {o.blocked && <p className="mt-2 text-xs text-amber-700">{o.blocked === 'media-header' ? t('blockedMedia') : t('blockedButtons')}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {chosen && preview && (
            <div className="space-y-4">
              {chosen.headerVar && (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-neutral-700">{t('headerVar')}</span>
                  <input
                    value={headerParam}
                    onChange={(e) => setHeaderParam(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                    autoFocus
                  />
                </label>
              )}
              {params.map((v, i) => (
                <label key={i} className="block text-sm">
                  <span className="mb-1 block font-medium text-neutral-700">{t('varN', { n: i + 1 })}</span>
                  <input
                    value={v}
                    onChange={(e) => setParams((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                    autoFocus={!chosen.headerVar && i === 0}
                  />
                </label>
              ))}
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">{t('preview')}</p>
                <WaTemplatePreview header={preview.header} mediaHeader={chosen.mediaHeader} body={preview.body} footer={chosen.footer} buttons={chosen.buttons} mediaLabel={t('media')} />
              </div>
              {chosen.blocked && <p className="text-xs text-amber-700">{chosen.blocked === 'media-header' ? t('blockedMedia') : t('blockedButtons')}</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
        </div>

        {chosen && (
          <footer className="flex items-center justify-between gap-2 border-t border-neutral-200 px-4 py-3">
            <p className="text-[11px] text-neutral-500">{t('billedNote')}</p>
            <button
              onClick={send}
              disabled={!ready || sending}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t('send')}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
