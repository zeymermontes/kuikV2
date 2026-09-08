'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CreditCard, ExternalLink, KeyRound, RefreshCw } from 'lucide-react';
import type { TenantOrdering, ServiceType, PaymentMethod } from '@/lib/database.types';
import type { PaymentProvider, PublicPaymentAccount } from '@/lib/payments/types';
import { Card, Label, Input, Textarea, Button } from '@/components/ui';
import { updateOrdering } from '@/app/(dashboard)/settings-actions';
import { resolveOrderAlerts, type OrderAlerts } from '@/lib/orders/alerts';
import { connectClip, connectGateway, disconnectGateway, syncPaymentAccount } from '@/app/(dashboard)/payments-actions';

const SERVICE_TYPES: ServiceType[] = ['pickup', 'delivery', 'dinein'];
// The three the cart offers: settle at the counter, transfer, or pay by card
// online through the connected gateway. Cash and "card at the counter" are
// what "at the counter" already means, so they are no longer offered apart.
const PAYMENT_METHODS: PaymentMethod[] = ['onsite', 'transfer', 'online'];

export function OrderingForm({
  ordering,
  showPosSettings = false,
  paymentAccount = null,
  providers = [],
}: {
  ordering: TenantOrdering;
  /** POS/KDS are still in development — see lib/features.ts. */
  showPosSettings?: boolean;
  /** The gateway account connected for online payment, if any (flags only, never secrets). */
  paymentAccount?: PublicPaymentAccount | null;
  /** The gateways Kuik has keys for. Empty: the option is explained, not offered. */
  providers?: PaymentProvider[];
}) {
  const t = useTranslations('ordering');
  const [o, setO] = useState(ordering);
  const [account, setAccount] = useState(paymentAccount);
  // Coming back from Stripe re-renders the page with fresh flags; adopt them
  // instead of keeping the ones this component first mounted with.
  const [seenAccount, setSeenAccount] = useState(paymentAccount);
  if (seenAccount !== paymentAccount) {
    setSeenAccount(paymentAccount);
    setAccount(paymentAccount);
  }
  const [busy, startBusy] = useTransition();
  const ready = !!account && account.charges_enabled;
  const actionNeeded = ready && !account.details_submitted;
  const paymentsConfigured = providers.length > 0;
  // Wording keyed by gateway: stripe*, mp* and clip* strings say the provider's name.
  const gw = account?.provider === 'mercadopago' ? 'mp' : account?.provider === 'clip' ? 'clip' : 'stripe';
  const gwT = (key: string) => t(`${gw}${key}` as 'stripeReady');
  const GATEWAY_NAME: Record<PaymentProvider, string> = { stripe: 'Stripe', mercadopago: 'Mercado Pago', clip: 'Clip' };
  // Clip is connected with a key pair typed here, not on a hosted page.
  const [clipForm, setClipForm] = useState(false);
  const [clipKey, setClipKey] = useState('');
  const [clipSecret, setClipSecret] = useState('');
  const [clipError, setClipError] = useState<string | null>(null);
  function saveClip() {
    setClipError(null);
    startBusy(async () => {
      const r = await connectClip({ apiKey: clipKey, secret: clipSecret });
      if (r.error) {
        setClipError(r.error);
        return;
      }
      setAccount(r.account ?? null);
      setClipForm(false);
      setClipKey('');
      setClipSecret('');
    });
  }
  const clipCredentials = (
    <div className="space-y-2 rounded-xl border border-neutral-200 p-3">
      <p className="text-sm font-medium">{t('clipTitle')}</p>
      <p className="text-xs text-neutral-500">{t('clipWhere')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label>{t('clipApiKey')}</Label>
          <Input value={clipKey} onChange={(e) => setClipKey(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div>
          <Label>{t('clipSecret')}</Label>
          <Input type="password" value={clipSecret} onChange={(e) => setClipSecret(e.target.value)} autoComplete="off" />
        </div>
      </div>
      {clipError && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">{t(`clipErr_${clipError}` as 'clipErr_invalid')}</p>}
      <div className="flex gap-2">
        <Button disabled={busy || !clipKey.trim() || !clipSecret.trim()} onClick={saveClip} className="px-3 py-1.5 text-xs">
          {t('clipSave')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setClipForm(false)} className="px-3 py-1.5 text-xs">
          {t('cancel')}
        </Button>
      </div>
    </div>
  );

  function set<K extends keyof TenantOrdering>(key: K, value: TenantOrdering[K]) {
    setO((s) => ({ ...s, [key]: value }));
    updateOrdering({ [key]: value });
  }

  // How the team is told about orders (lib/orders/alerts.ts). Stored whole.
  const alerts = resolveOrderAlerts(o.order_alerts);
  function setAlerts(patch: Partial<OrderAlerts>) {
    set('order_alerts', { ...alerts, ...patch } as unknown as Record<string, unknown>);
  }

  function toggleService(s: ServiceType) {
    const next = o.service_types.includes(s)
      ? o.service_types.filter((x) => x !== s)
      : [...o.service_types, s];
    if (next.length === 0) return; // keep at least one
    set('service_types', next);
  }

  // Unlike service types, none is a valid answer: the cart simply doesn't ask.
  function togglePayment(m: PaymentMethod) {
    const cur = o.payment_methods ?? [];
    set('payment_methods', cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]);
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Online ordering vs. showcase mode */}
      <Card>
        <h2 className="mb-1 font-semibold">{t('mode')}</h2>
        <p className="mb-3 text-sm text-neutral-500">{t('modeHint')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => set('ordering_enabled', true)}
            className={`rounded-xl border p-3 text-left transition ${
              o.ordering_enabled ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
            }`}
          >
            <span className="block text-sm font-semibold">{t('modeOrder')}</span>
            <span className="block text-xs opacity-70">{t('modeOrderHint')}</span>
          </button>
          <button
            onClick={() => set('ordering_enabled', false)}
            className={`rounded-xl border p-3 text-left transition ${
              !o.ordering_enabled ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
            }`}
          >
            <span className="block text-sm font-semibold">{t('modeShowcase')}</span>
            <span className="block text-xs opacity-70">{t('modeShowcaseHint')}</span>
          </button>
        </div>

        {/* Per-channel cart: the same menu, two ways in. */}
        {o.ordering_enabled && (
          <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
            <p className="text-sm font-medium">{t('channels')}</p>
            <p className="-mt-2 text-xs text-neutral-500">{t('channelsHint')}</p>
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t('channelQr')}</span>
                <span className="block text-xs text-neutral-500">{t('channelQrHint')}</span>
              </span>
              <input
                type="checkbox"
                checked={o.ordering_qr_enabled !== false}
                onChange={(e) => set('ordering_qr_enabled', e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-neutral-300"
              />
            </label>
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t('channelOnline')}</span>
                <span className="block text-xs text-neutral-500">{t('channelOnlineHint')}</span>
              </span>
              <input
                type="checkbox"
                checked={o.ordering_online_enabled !== false}
                onChange={(e) => set('ordering_online_enabled', e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-neutral-300"
              />
            </label>
          </div>
        )}
      </Card>

      {/* The rest only applies when online ordering is on. */}
      {!o.ordering_enabled ? null : (
      <>
      {/* Service types */}
      <Card>
        <h2 className="mb-1 font-semibold">{t('serviceTypes')}</h2>
        <p className="mb-3 text-sm text-neutral-500">{t('serviceTypesHint')}</p>
        <div className="flex flex-wrap gap-2">
          {SERVICE_TYPES.map((s) => {
            const on = o.service_types.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleService(s)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  on
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {t(`service_${s}`)}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Order message header */}
      <Card>
        <Label>{t('orderHeader')}</Label>
        <Textarea
          rows={2}
          defaultValue={o.order_header ?? ''}
          placeholder={t('orderHeaderHint')}
          onBlur={(e) => set('order_header', e.target.value || null)}
        />
      </Card>

      {/* Money rules */}
      <Card className="space-y-4">
        <h2 className="font-semibold">{t('rules')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>{t('minOrder')}</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              defaultValue={o.min_order ?? ''}
              onBlur={(e) =>
                set('min_order', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </div>
          <div>
            <Label>{t('deliveryFee')}</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              defaultValue={o.delivery_fee ?? ''}
              onBlur={(e) =>
                set('delivery_fee', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </div>
          <div>
            <Label>{t('freeDeliveryOver')}</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              defaultValue={o.free_delivery_over ?? ''}
              onBlur={(e) =>
                set('free_delivery_over', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </div>
        </div>
        <div>
          <Label>{t('tips')}</Label>
          <Input
            defaultValue={o.tips.join(', ')}
            placeholder="10, 15, 20"
            onBlur={(e) =>
              set(
                'tips',
                e.target.value
                  .split(',')
                  .map((x) => parseInt(x.trim(), 10))
                  .filter((n) => Number.isFinite(n) && n > 0),
              )
            }
          />
          <p className="mt-1 text-xs text-neutral-400">{t('tipsHint')}</p>
        </div>
      </Card>

      {/* Customer fields */}
      <Card className="space-y-3">
        <h2 className="font-semibold">{t('customerFields')}</h2>
        <ToggleRow label={t('collectName')} checked={o.collect_name} onChange={(v) => set('collect_name', v)} />
        <ToggleRow label={t('collectAddress')} checked={o.collect_address} onChange={(v) => set('collect_address', v)} />
        <ToggleRow label={t('collectPickupTime')} checked={o.collect_pickup_time} onChange={(v) => set('collect_pickup_time', v)} />
        <ToggleRow label={t('collectTable')} checked={o.collect_table} onChange={(v) => set('collect_table', v)} />
        <div className="border-t border-neutral-100 pt-3">
          <Label>{t('notePlaceholder')}</Label>
          <Input
            defaultValue={o.note_placeholder ?? ''}
            placeholder={t('notePlaceholderHint')}
            maxLength={120}
            onBlur={(e) => set('note_placeholder', e.target.value.trim() || null)}
          />
        </div>
      </Card>

      {/* The Pedidos board (0085): off, WhatsApp orders are just the message. */}
      <Card className="space-y-2" data-setting={t('ordersBoard')}>
        <ToggleRow label={t('ordersBoard')} checked={o.orders_board === true} onChange={(v) => set('orders_board', v)} />
        <p className="text-xs text-neutral-500">{t('ordersBoardHint')}</p>
      </Card>

      {/* Order alerts: how the team hears about a paid order. */}
      <Card className="space-y-3" data-setting="order-alerts">
        <div>
          <h2 className="font-semibold">{t('alertsTitle')}</h2>
          <p className="text-sm text-neutral-500">{t('alertsHint')}</p>
        </div>
        <ToggleRow label={t('alertPush')} checked={alerts.push} onChange={(v) => setAlerts({ push: v })} />
        <ToggleRow label={t('alertSound')} checked={alerts.sound} onChange={(v) => setAlerts({ sound: v })} />
        <ToggleRow label={t('alertWhatsappOrders')} checked={alerts.whatsappOrders} onChange={(v) => setAlerts({ whatsappOrders: v })} />
        {showPosSettings && (
          <>
            <ToggleRow label={t('alertPrintKitchen')} checked={alerts.printKitchen} onChange={(v) => setAlerts({ printKitchen: v })} />
            <ToggleRow label={t('alertPrintReceipt')} checked={alerts.printReceipt} onChange={(v) => setAlerts({ printReceipt: v })} />
          </>
        )}
        <div className="border-t border-neutral-100 pt-3">
          <ToggleRow label={t('alertConfirmCustomer')} checked={alerts.confirmCustomer} onChange={(v) => setAlerts({ confirmCustomer: v })} />
          <p className="mt-1 text-xs text-neutral-500">{t('alertConfirmCustomerHint')}</p>
        </div>
        <div className="border-t border-neutral-100 pt-3">
          <Label>{t('alertTeamPhones')}</Label>
          <Input
            defaultValue={alerts.teamPhones.join(', ')}
            placeholder="+52 55 1234 5678, +52 33 9876 5432"
            onBlur={(e) =>
              setAlerts({
                teamPhones: e.target.value
                  .split(/[,;\n]/)
                  .map((x) => x.trim())
                  .filter(Boolean)
                  .slice(0, 5),
              })
            }
          />
          <p className="mt-1 text-xs text-neutral-500">{t('alertTeamPhonesHint')}</p>
        </div>
        <div className="border-t border-neutral-100 pt-3">
          <Label>{t('alertEscalate')}</Label>
          <Input
            type="number"
            min={0}
            max={60}
            defaultValue={alerts.escalateMinutes}
            className="w-28"
            onBlur={(e) => setAlerts({ escalateMinutes: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })}
          />
          <p className="mt-1 text-xs text-neutral-500">{t('alertEscalateHint')}</p>
        </div>
      </Card>

      {/* Payment: which methods the cart offers, and the transfer details it shows. */}
      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">{t('paymentMethods')}</h2>
          <p className="text-sm text-neutral-500">{t('paymentMethodsHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => {
            const on = (o.payment_methods ?? []).includes(m);
            return (
              <button
                key={m}
                onClick={() => togglePayment(m)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  on
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {t(`payment_${m}`)}
              </button>
            );
          })}
        </div>
        {(o.payment_methods ?? []).includes('online') && (
          <div className="space-y-3 border-t border-neutral-100 pt-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                <CreditCard className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t('onlineTitle')}</p>
                <p className="text-xs text-neutral-500">{t('onlineHint')}</p>
              </div>
            </div>
            {!paymentsConfigured ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('onlineNotConfigured')}</p>
            ) : !account ? (
              clipForm ? (
                clipCredentials
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-neutral-600">{t('gatewayPick')}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {providers.map((p) => (
                      <button
                        key={p}
                        type="button"
                        disabled={busy}
                        onClick={() => (p === 'clip' ? setClipForm(true) : startBusy(() => connectGateway(p)))}
                        className="flex flex-col items-start gap-1 rounded-xl border border-neutral-200 p-3 text-left transition hover:border-neutral-900 disabled:opacity-60"
                      >
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          {p === 'clip' ? <KeyRound className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}{' '}
                          {t(p === 'stripe' ? 'stripeConnect' : p === 'mercadopago' ? 'mpConnect' : 'clipConnect')}
                        </span>
                        <span className="text-xs text-neutral-500">{t(p === 'stripe' ? 'gatewayStripeHint' : p === 'mercadopago' ? 'gatewayMpHint' : 'gatewayClipHint')}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-500">{t('gatewayOneHint')}</p>
                </div>
              )
            ) : clipForm ? (
              clipCredentials
            ) : (
              <div className="rounded-xl border border-neutral-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 rounded-full ${ready ? 'bg-green-500' : 'bg-amber-400'}`} />
                    <span className="font-medium">{ready ? gwT('Ready') : gwT('Pending')}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{GATEWAY_NAME[account.provider]}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(!ready || actionNeeded) && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => startBusy(async () => setAccount(await syncPaymentAccount()))}
                        className="px-3 py-1.5 text-xs"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> {t('stripeCheck')}
                      </Button>
                    )}
                    {account.provider === 'clip' ? (
                      <>
                        <Button disabled={busy} onClick={() => setClipForm(true)} className="px-3 py-1.5 text-xs">
                          <KeyRound className="h-3.5 w-3.5" /> {t('clipContinue')}
                        </Button>
                        <a
                          href="https://dashboard.clip.mx"
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> {t('clipManage')}
                        </a>
                      </>
                    ) : (
                      (account.provider === 'stripe' || !ready) && (
                        <Button disabled={busy} onClick={() => startBusy(() => connectGateway(account.provider))} className="px-3 py-1.5 text-xs">
                          <ExternalLink className="h-3.5 w-3.5" /> {ready ? gwT('Manage') : gwT('Continue')}
                        </Button>
                      )
                    )}
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm(gwT('DisconnectConfirm'))) return;
                        startBusy(async () => {
                          await disconnectGateway();
                          setAccount(null);
                          setO((s) => ({ ...s, payment_methods: (s.payment_methods ?? []).filter((m) => m !== 'online') }));
                        });
                      }}
                      className="px-3 py-1.5 text-xs"
                    >
                      {t('stripeDisconnect')}
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-neutral-500">{ready ? gwT('ReadyHint') : gwT('PendingHint')}</p>
                {actionNeeded && account.provider === 'stripe' && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{t('stripeActionNeeded')}</p>}
              </div>
            )}
          </div>
        )}
        {(o.payment_methods ?? []).includes('transfer') && (
          <div className="space-y-3 border-t border-neutral-100 pt-3">
            <p className="text-sm font-medium">{t('transferDetails')}</p>
            <p className="-mt-2 text-xs text-neutral-500">{t('transferDetailsHint')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t('transferBank')}</Label>
                <Input defaultValue={o.transfer_bank ?? ''} onBlur={(e) => set('transfer_bank', e.target.value.trim() || null)} />
              </div>
              <div>
                <Label>{t('transferHolder')}</Label>
                <Input defaultValue={o.transfer_holder ?? ''} onBlur={(e) => set('transfer_holder', e.target.value.trim() || null)} />
              </div>
            </div>
            <div>
              <Label>{t('transferAccount')}</Label>
              <Input
                inputMode="numeric"
                defaultValue={o.transfer_account ?? ''}
                placeholder={t('transferAccountHint')}
                onBlur={(e) => set('transfer_account', e.target.value.trim() || null)}
              />
            </div>
            <div>
              <Label>{t('transferNote')}</Label>
              <Input
                defaultValue={o.transfer_note ?? ''}
                placeholder={t('transferNoteHint')}
                onBlur={(e) => set('transfer_note', e.target.value.trim() || null)}
              />
            </div>
          </div>
        )}
      </Card>

      {/* POS cash count */}
      {showPosSettings && (
      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">{t('cashCount')}</h2>
          <p className="text-sm text-neutral-500">{t('cashCountHint')}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => set('cash_count_mode', 'total')}
            className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
              o.cash_count_mode !== 'denominations' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-600'
            }`}
          >
            {t('cashTotal')}
          </button>
          <button
            onClick={() => set('cash_count_mode', 'denominations')}
            className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
              o.cash_count_mode === 'denominations' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-600'
            }`}
          >
            {t('cashDenoms')}
          </button>
        </div>
        {o.cash_count_mode === 'denominations' && (
          <div>
            <Label>{t('cashDenomList')}</Label>
            <Input
              defaultValue={(o.cash_denominations ?? []).join(', ')}
              placeholder="1000, 500, 200, 100, 50, 20, 10, 5, 2, 1"
              onBlur={(e) => {
                const list = e.target.value
                  .split(',')
                  .map((x) => parseFloat(x.trim()))
                  .filter((n) => Number.isFinite(n) && n > 0);
                set('cash_denominations', list.length ? list : null);
              }}
            />
            <p className="mt-1 text-xs text-neutral-400">{t('cashDenomListHint')}</p>
          </div>
        )}
      </Card>
      )}

      {/* POS floor map */}
      {showPosSettings && (
      <Card className="space-y-2">
        <div>
          <h2 className="font-semibold">{t('posTables')}</h2>
          <p className="text-sm text-neutral-500">{t('posTablesHint')}</p>
        </div>
        <Input
          type="number"
          min={0}
          max={200}
          defaultValue={o.pos_tables}
          onBlur={(e) => set('pos_tables', Math.max(0, Math.min(200, parseInt(e.target.value, 10) || 0)))}
        />
        <div className="pt-2">
          <h2 className="font-semibold">{t('posEmployees')}</h2>
          <p className="mb-2 text-sm text-neutral-500">{t('posEmployeesHint')}</p>
          <ToggleRow label={t('posLockAfterSale')} checked={o.pos_lock_after_sale} onChange={(v) => set('pos_lock_after_sale', v)} />
        </div>
      </Card>
      )}
      </>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 rounded border-neutral-300"
      />
    </label>
  );
}
