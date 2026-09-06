'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, FileText } from 'lucide-react';
import { CFDI_USES, FISCAL_REGIMES } from '@/lib/cfdi/catalogs';
import { formatPrice } from '@/lib/utils';

type Status =
  | { kind: 'loading' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'ready'; label: string; total: number; issuer: string }
  | { kind: 'done'; folio: string; uuid: string; pdf: string; xml: string };

/** The guest's own invoice request: proof of purchase is the sale id in the URL. */
export function SelfInvoice({ tenantId, restaurant, orderId, tabId, currency, locale }: { tenantId: string; restaurant: string; orderId: string | null; tabId: string | null; currency: string; locale: string }) {
  const t = useTranslations('menu');
  // Without a sale id there is nothing to look up; the state starts settled.
  const [status, setStatus] = useState<Status>(() => (orderId || tabId ? { kind: 'loading' } : { kind: 'unavailable', reason: 'not_found' }));
  const [rx, setRx] = useState({ rfc: '', name: '', regime: '601', use: 'G03', zip: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saleQuery = orderId ? `o=${orderId}` : tabId ? `t=${tabId}` : '';

  useEffect(() => {
    if (!saleQuery) return;
    let live = true;
    fetch(`/api/cfdi/${tenantId}/self?${saleQuery}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; error?: string; label?: string; total?: number; issuer?: string }) => {
        if (!live) return;
        setStatus(j.ok ? { kind: 'ready', label: j.label ?? '', total: j.total ?? 0, issuer: j.issuer ?? restaurant } : { kind: 'unavailable', reason: j.error ?? 'not_available' });
      })
      .catch(() => live && setStatus({ kind: 'unavailable', reason: 'not_available' }));
    return () => {
      live = false;
    };
  }, [tenantId, saleQuery, restaurant]);

  // The guest's own fiscal data is remembered on their phone for next time.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const saved = localStorage.getItem('kuik:fiscal');
        if (saved) setRx((cur) => ({ ...cur, ...JSON.parse(saved) }));
      } catch {}
    }, 0);
    return () => clearTimeout(id);
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cfdi/${tenantId}/self`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId, tabId, receiver: { rfc: rx.rfc, name: rx.name, regime: rx.regime, use: rx.use, zip: rx.zip }, email: rx.email || undefined }),
      });
      const j = (await res.json()) as { ok: boolean; error?: string; detail?: string; folio?: string; uuid?: string; pdf?: string; xml?: string };
      if (!j.ok) {
        setError(t.has(`invoiceErr_${j.error}`) ? t(`invoiceErr_${j.error}`) : `${t('invoiceErr_pac')}${j.detail ? ` (${j.detail})` : ''}`);
        return;
      }
      try {
        localStorage.setItem('kuik:fiscal', JSON.stringify({ rfc: rx.rfc, name: rx.name, regime: rx.regime, use: rx.use, zip: rx.zip, email: rx.email }));
      } catch {}
      setStatus({ kind: 'done', folio: j.folio ?? '', uuid: j.uuid ?? '', pdf: j.pdf ?? '', xml: j.xml ?? '' });
    } catch {
      setError(t('invoiceErr_pac'));
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-xl border border-[var(--brand-border)] bg-transparent px-3 py-2.5 text-sm focus:outline-none';
  const label = 'mb-1 block text-xs font-medium text-[var(--brand-text-secondary)]';

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <div className="rounded-3xl border border-[var(--brand-border)] p-5" style={{ backgroundColor: 'var(--brand-surface)' }}>
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <FileText className="h-5 w-5" style={{ color: 'var(--brand-primary)' }} /> {t('invoiceTitle')}
        </h1>
        <p className="mt-1 text-sm text-[var(--brand-text-secondary)]">{restaurant}</p>

        {status.kind === 'loading' && <p className="mt-6 text-sm text-[var(--brand-text-secondary)]">…</p>}

        {status.kind === 'unavailable' && (
          <p className="mt-6 text-sm">{t.has(`invoiceErr_${status.reason}`) ? t(`invoiceErr_${status.reason}`) : t('invoiceErr_not_available')}</p>
        )}

        {status.kind === 'done' && (
          <div className="mt-6 space-y-3">
            <p className="flex items-center gap-2 font-semibold text-green-600">
              <CheckCircle2 className="h-5 w-5" /> {t('invoiceDone', { folio: status.folio })}
            </p>
            <p className="break-all text-xs text-[var(--brand-text-secondary)]">{status.uuid}</p>
            <div className="flex gap-2">
              <a href={status.pdf} className="flex-1 rounded-full py-3 text-center text-sm font-semibold text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
                PDF
              </a>
              <a href={status.xml} className="flex-1 rounded-full border border-[var(--brand-border)] py-3 text-center text-sm font-semibold">
                XML
              </a>
            </div>
            {rx.email && <p className="text-xs text-[var(--brand-text-secondary)]">{t('invoiceEmailed', { email: rx.email })}</p>}
          </div>
        )}

        {status.kind === 'ready' && (
          <div className="mt-6 space-y-3">
            <p className="text-sm">
              {status.label} · <span className="font-semibold">{formatPrice(status.total, currency, locale)}</span>
            </p>
            <div>
              <label className={label}>RFC</label>
              <input value={rx.rfc} onChange={(e) => setRx({ ...rx, rfc: e.target.value.toUpperCase() })} className={`${input} uppercase`} placeholder="XAXX010101000" autoComplete="off" />
            </div>
            <div>
              <label className={label}>{t('invoiceName')}</label>
              <input value={rx.name} onChange={(e) => setRx({ ...rx, name: e.target.value })} className={input} placeholder={t('invoiceNamePh')} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label}>{t('invoiceZip')}</label>
                <input value={rx.zip} inputMode="numeric" onChange={(e) => setRx({ ...rx, zip: e.target.value.replace(/\D/g, '').slice(0, 5) })} className={input} placeholder="44100" />
              </div>
              <div>
                <label className={label}>{t('invoiceUse')}</label>
                <select value={rx.use} onChange={(e) => setRx({ ...rx, use: e.target.value })} className={input}>
                  {CFDI_USES.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code} · {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={label}>{t('invoiceRegime')}</label>
              <select value={rx.regime} onChange={(e) => setRx({ ...rx, regime: e.target.value })} className={input}>
                {FISCAL_REGIMES.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code} · {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>{t('invoiceEmail')}</label>
              <input type="email" value={rx.email} onChange={(e) => setRx({ ...rx, email: e.target.value })} className={input} placeholder="tu@correo.com" />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button onClick={submit} disabled={busy} className="w-full rounded-full py-3.5 font-semibold text-white disabled:opacity-60" style={{ backgroundColor: 'var(--brand-primary)' }}>
              {busy ? '…' : t('invoiceSubmit')}
            </button>
            <p className="text-xs text-[var(--brand-text-secondary)]">{t('invoiceHint')}</p>
          </div>
        )}
      </div>
      <Link href="/menu" className="mt-6 block text-center text-sm font-semibold underline-offset-4 hover:underline">
        {t('receiptBackToMenu')}
      </Link>
    </main>
  );
}
