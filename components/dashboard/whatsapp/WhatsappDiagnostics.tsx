'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Card } from '@/components/ui';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

/**
 * What is actually true right now, in one place.
 *
 * Diagnosing "the bot doesn't answer" kept requiring the bridge's server log,
 * which only one person can read. Three facts settle almost every case: is the
 * bridge reachable, does it hold a live session for THIS restaurant, and has
 * anything arrived recently.
 */
export function WhatsappDiagnostics({
  reachable,
  hasLiveSession,
  bridgeError,
  lastInboundAt,
  lastOutboundAt,
  inboundCount,
}: {
  reachable: boolean;
  hasLiveSession: boolean;
  bridgeError?: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  inboundCount: number;
}) {
  const t = useTranslations('whatsapp');
  const locale = useLocale();

  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : t('diagNever');

  const rows: { label: string; ok: boolean; value: string; hint?: string }[] = [
    {
      label: t('diagBridge'),
      ok: reachable,
      value: reachable ? t('diagOk') : (bridgeError ?? t('diagUnreachable')),
    },
    {
      label: t('diagSession'),
      ok: hasLiveSession,
      value: hasLiveSession ? t('diagOk') : t('diagNoSession'),
      hint: reachable && !hasLiveSession ? t('diagNoSessionHint') : undefined,
    },
    {
      label: t('diagLastInbound'),
      ok: Boolean(lastInboundAt),
      value: when(lastInboundAt),
      hint: inboundCount === 0 ? t('diagNoInboundHint') : undefined,
    },
    {
      label: t('diagLastOutbound'),
      ok: Boolean(lastOutboundAt),
      value: when(lastOutboundAt),
    },
  ];

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">{t('diagTitle')}</h2>
        <p className="text-sm text-neutral-500">{t('diagHint')}</p>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center gap-2 text-sm">
              {r.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-neutral-400" />
              )}
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <span className="shrink-0 text-neutral-500">{r.value}</span>
            </div>
            {r.hint && (
              <p className="ml-6 mt-0.5 flex items-start gap-1.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {r.hint}
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
