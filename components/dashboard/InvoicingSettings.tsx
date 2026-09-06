'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Download, FileText, ShieldCheck, Upload } from 'lucide-react';
import type { Invoice, TenantCfdi } from '@/lib/database.types';
import { Card, Input, Label, Button } from '@/components/ui';
import { CFDI_USES, FISCAL_REGIMES } from '@/lib/cfdi/catalogs';
import { formatPrice } from '@/lib/utils';
import { saveCfdiSettings, uploadCsd, issueForSale, issueGlobal, cancelOne, type CfdiSettingsInput } from '@/app/(dashboard)/invoicing/actions';

const blank = (c: TenantCfdi | null): CfdiSettingsInput => ({
  enabled: c?.enabled ?? false,
  rfc: c?.rfc ?? '',
  legal_name: c?.legal_name ?? '',
  fiscal_regime: c?.fiscal_regime ?? '612',
  zip_code: c?.zip_code ?? '',
  iva_percent: c?.iva_percent != null ? Number(c.iva_percent) : 16,
  serie: c?.serie ?? 'A',
  product_code: c?.product_code ?? '90101500',
  unit_code: c?.unit_code ?? 'E48',
  self_invoice: c?.self_invoice ?? true,
  global_daily: c?.global_daily ?? false,
});

/** Fiscal data, the CSD, invoices issued, and the buttons to issue one by hand or the day's global. */
export function InvoicingSettings({
  settings,
  invoices,
  pacConfigured,
  portalUrl,
}: {
  settings: TenantCfdi | null;
  invoices: Invoice[];
  pacConfigured: boolean;
  portalUrl: string;
}) {
  const t = useTranslations('invoicing');
  const [form, setForm] = useState<CfdiSettingsInput>(blank(settings));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof CfdiSettingsInput>(k: K, v: CfdiSettingsInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const select = 'w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm';
  const errText = (e?: string, d?: string) => (e ? `${t.has(`err_${e}`) ? t(`err_${e}`) : e}${d ? `: ${d}` : ''}` : null);

  // Issue by hand: an order or sale id pasted from the board, plus the receiver.
  const [saleRef, setSaleRef] = useState('');
  const [rx, setRx] = useState({ rfc: '', name: '', regime: '601', use: 'G03', zip: '', email: '' });
  const [globalDate, setGlobalDate] = useState(new Date().toISOString().slice(0, 10));

  function save() {
    start(async () => {
      const r = await saveCfdiSettings(form);
      setMsg(r.error ? errText(r.error) : t('saved'));
    });
  }

  function issue() {
    const ref = saleRef.trim();
    if (!/^[0-9a-f-]{36}$/i.test(ref)) return setMsg(t('err_ref'));
    start(async () => {
      // Tabs and orders share the uuid space; try the order first, then the register sale.
      let r = await issueForSale({ orderId: ref }, rx, rx.email || null);
      if (r.error === 'not_found') r = await issueForSale({ tabId: ref }, rx, rx.email || null);
      setMsg(r.error ? errText(r.error, r.detail) : t('issued'));
      if (!r.error) setSaleRef('');
    });
  }

  const ready = pacConfigured && !!settings?.csd_registered_at && !!settings?.rfc && !!settings?.zip_code;

  return (
    <div className="max-w-3xl space-y-5">
      {!pacConfigured && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{t('pacMissing')}</p>}

      <Card className="space-y-4">
        <h2 className="font-semibold">{t('fiscalData')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t('rfc')}</Label>
            <Input value={form.rfc} onChange={(e) => set('rfc', e.target.value.toUpperCase())} placeholder="XAXX010101000" className="uppercase" />
          </div>
          <div>
            <Label>{t('legalName')}</Label>
            <Input value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} placeholder={t('legalNamePh')} />
            <p className="mt-1 text-xs text-neutral-500">{t('legalNameHint')}</p>
          </div>
          <div>
            <Label>{t('regime')}</Label>
            <select value={form.fiscal_regime} onChange={(e) => set('fiscal_regime', e.target.value)} className={select}>
              {FISCAL_REGIMES.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} · {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t('zip')}</Label>
            <Input value={form.zip_code} onChange={(e) => set('zip_code', e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="44100" inputMode="numeric" />
          </div>
          <div>
            <Label>{t('iva')}</Label>
            <select value={form.iva_percent} onChange={(e) => set('iva_percent', Number(e.target.value))} className={select}>
              <option value={16}>16%</option>
              <option value={8}>8% ({t('border')})</option>
              <option value={0}>0%</option>
            </select>
            <p className="mt-1 text-xs text-neutral-500">{t('ivaHint')}</p>
          </div>
          <div>
            <Label>{t('serie')}</Label>
            <Input value={form.serie} onChange={(e) => set('serie', e.target.value.toUpperCase())} maxLength={10} />
          </div>
          <div>
            <Label>{t('productCode')}</Label>
            <Input value={form.product_code} onChange={(e) => set('product_code', e.target.value.replace(/\D/g, '').slice(0, 8))} />
            <p className="mt-1 text-xs text-neutral-500">{t('productCodeHint')}</p>
          </div>
          <div>
            <Label>{t('unitCode')}</Label>
            <Input value={form.unit_code} onChange={(e) => set('unit_code', e.target.value.toUpperCase().slice(0, 3))} />
          </div>
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} /> {t('enabled')}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.self_invoice} onChange={(e) => set('self_invoice', e.target.checked)} /> {t('selfInvoice')}
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          {t('portalHint')} <span className="font-mono">{portalUrl}</span>
        </p>
        <Button onClick={save} disabled={pending}>
          {t('save')}
        </Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">{t('csd')}</h2>
        <p className="text-sm text-neutral-500">{t('csdHint')}</p>
        {settings?.csd_registered_at ? (
          <p className="flex items-center gap-2 text-sm text-green-700">
            <ShieldCheck className="h-4 w-4" /> {t('csdRegistered', { d: new Date(settings.csd_registered_at).toLocaleDateString() })}
          </p>
        ) : (
          <p className="text-sm text-amber-700">{t('csdMissing')}</p>
        )}
        <form
          action={(fd) =>
            start(async () => {
              const r = await uploadCsd(fd);
              setMsg(r.error ? errText(r.error) : t('csdSaved'));
            })
          }
          className="grid gap-3 sm:grid-cols-3"
        >
          <div>
            <Label>.cer</Label>
            <input name="cer" type="file" accept=".cer" required className="w-full text-sm" />
          </div>
          <div>
            <Label>.key</Label>
            <input name="key" type="file" accept=".key" required className="w-full text-sm" />
          </div>
          <div>
            <Label>{t('csdPassword')}</Label>
            <Input name="password" type="password" required autoComplete="off" />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" variant="secondary" disabled={pending || !settings?.rfc}>
              <Upload className="h-4 w-4" /> {t('csdUpload')}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">{t('issueTitle')}</h2>
        <p className="text-sm text-neutral-500">{t('issueHint')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{t('saleRef')}</Label>
            <Input value={saleRef} onChange={(e) => setSaleRef(e.target.value)} placeholder="8f1c2b3a-…" className="font-mono" />
          </div>
          <div>
            <Label>{t('rxRfc')}</Label>
            <Input value={rx.rfc} onChange={(e) => setRx({ ...rx, rfc: e.target.value.toUpperCase() })} className="uppercase" />
          </div>
          <div>
            <Label>{t('rxName')}</Label>
            <Input value={rx.name} onChange={(e) => setRx({ ...rx, name: e.target.value })} />
          </div>
          <div>
            <Label>{t('regime')}</Label>
            <select value={rx.regime} onChange={(e) => setRx({ ...rx, regime: e.target.value })} className={select}>
              {FISCAL_REGIMES.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} · {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t('use')}</Label>
            <select value={rx.use} onChange={(e) => setRx({ ...rx, use: e.target.value })} className={select}>
              {CFDI_USES.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code} · {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t('zip')}</Label>
            <Input value={rx.zip} onChange={(e) => setRx({ ...rx, zip: e.target.value.replace(/\D/g, '').slice(0, 5) })} inputMode="numeric" />
          </div>
          <div>
            <Label>{t('email')}</Label>
            <Input type="email" value={rx.email} onChange={(e) => setRx({ ...rx, email: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Button onClick={issue} disabled={pending || !ready}>
            <FileText className="h-4 w-4" /> {t('issue')}
          </Button>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <Label>{t('globalDate')}</Label>
              <Input type="date" value={globalDate} onChange={(e) => setGlobalDate(e.target.value)} />
            </div>
            <Button
              variant="secondary"
              disabled={pending || !ready}
              onClick={() =>
                start(async () => {
                  const r = await issueGlobal(globalDate);
                  setMsg(r.error ? errText(r.error, r.detail) : t('globalIssued', { n: r.count ?? 0 }));
                })
              }
            >
              {t('issueGlobal')}
            </Button>
          </div>
        </div>
      </Card>

      {msg && <p className="text-sm text-neutral-700">{msg}</p>}

      <Card>
        <h2 className="mb-3 font-semibold">{t('list')}</h2>
        {invoices.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-400">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="pb-1.5 font-medium">{t('colFolio')}</th>
                  <th className="pb-1.5 font-medium">{t('colReceiver')}</th>
                  <th className="pb-1.5 text-right font-medium">{t('colTotal')}</th>
                  <th className="pb-1.5 font-medium">{t('colStatus')}</th>
                  <th className="pb-1.5" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-neutral-100">
                    <td className="py-2">
                      <span className="font-medium">
                        {inv.serie}
                        {inv.folio}
                      </span>
                      <span className="block text-xs text-neutral-400">
                        {inv.kind === 'global' ? `${t('global')} ${inv.period_date ?? ''}` : new Date(inv.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-2">
                      <span className="block truncate">{inv.receiver.name}</span>
                      <span className="block text-xs text-neutral-400">{inv.receiver.rfc}</span>
                    </td>
                    <td className="py-2 text-right font-medium">{formatPrice(Number(inv.total), 'MXN')}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${inv.status === 'stamped' ? 'bg-green-100 text-green-700' : inv.status === 'cancelled' ? 'bg-neutral-100 text-neutral-500' : 'bg-red-100 text-red-700'}`}>
                        {t(`status_${inv.status}`)}
                      </span>
                      {inv.error && <span className="block max-w-[16rem] truncate text-xs text-red-600" title={inv.error}>{inv.error}</span>}
                    </td>
                    <td className="py-2 text-right">
                      {inv.status === 'stamped' && (
                        <span className="inline-flex items-center gap-1">
                          <a href={`/api/cfdi/file/${inv.id}?kind=pdf`} className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100" title="PDF">
                            <Download className="h-4 w-4" />
                          </a>
                          <a href={`/api/cfdi/file/${inv.id}?kind=xml`} className="rounded-lg px-1.5 py-1 text-xs font-semibold text-neutral-500 hover:bg-neutral-100">
                            XML
                          </a>
                          <button
                            onClick={() => window.confirm(t('cancelConfirm')) && start(async () => setMsg((await cancelOne(inv.id)).error ?? t('cancelled')))}
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                            title={t('cancel')}
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
