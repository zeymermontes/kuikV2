'use client';

import { useState, useEffect, useMemo } from 'react';
import { SelectionLines } from '@/components/menu/SelectionLines';
import { X, Plus, Minus, Trash2, Copy, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Tenant, TenantContact, TenantOrdering, ServiceType, PaymentMethod } from '@/lib/database.types';
import {
  buildOrderMessage,
  buildWhatsappUrl,
  cartSubtotal,
  lineUnitPrice,
  type CartLine,
} from '@/lib/whatsapp';
import { formatPrice } from '@/lib/utils';
import { applyPromotions, hasCoupons } from '@/lib/promotions';
import type { Promotion } from '@/lib/database.types';

export function CartSheet({
  tenant,
  contact,
  branchId = null,
  ordering,
  showPrices,
  currency,
  locale,
  lines,
  presetTable,
  promotions = [],
  categoryOf = () => null,
  onClose,
  onInc,
  onDec,
  onNote,
  onRemove,
}: {
  tenant: Tenant;
  /** The branch the menu was opened for; recorded on the order (0083). */
  branchId?: string | null;
  contact: TenantContact;
  ordering: TenantOrdering;
  showPrices: boolean;
  currency: string;
  locale: string;
  lines: CartLine[];
  presetTable?: string | null;
  promotions?: Promotion[];
  /** The section a product sits in, for category promotions. */
  categoryOf?: (productId: string) => string | null;
  onClose: () => void;
  onInc: (key: string) => void;
  onDec: (key: string) => void;
  onNote: (key: string, note: string) => void;
  onRemove: (key: string) => void;
}) {
  const t = useTranslations('menu');
  const serviceTypes = ordering.service_types.length > 0 ? ordering.service_types : (['pickup'] as ServiceType[]);
  // A table QR (?mesa=) defaults to dine-in at that table.
  const [service, setService] = useState<ServiceType>(
    presetTable && serviceTypes.includes('dinein') ? 'dinein' : serviceTypes[0],
  );
  const [tip, setTip] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // Payment is only asked when the restaurant enabled at least one method, and
  // even then it is optional — a guest may just say it on WhatsApp.
  const paymentMethods: PaymentMethod[] = ordering.payment_methods ?? [];
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [copied, setCopied] = useState(false);
  const transfer =
    ordering.transfer_account || ordering.transfer_bank || ordering.transfer_holder
      ? {
          bank: ordering.transfer_bank,
          holder: ordering.transfer_holder,
          account: ordering.transfer_account,
          note: ordering.transfer_note,
        }
      : null;
  const paymentLabel = (m: PaymentMethod) => t(`payment_${m}`);
  async function copyAccount() {
    if (!transfer?.account) return;
    try {
      await navigator.clipboard.writeText(transfer.account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the number is on screen to copy by hand.
    }
  }

  // Remember the customer's name across visits (saved on this device).
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const n = localStorage.getItem('kuik:name');
        if (n) setCustomerName(n);
        const ph = localStorage.getItem('kuik:phone');
        if (ph) setPhone(ph);
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function onPhone(v: string) {
    setPhone(v);
    try {
      localStorage.setItem('kuik:phone', v);
    } catch {
      // ignore
    }
  }
  function onName(v: string) {
    setCustomerName(v);
    try {
      localStorage.setItem('kuik:name', v);
    } catch {
      // ignore
    }
  }
  const [pickupTime, setPickupTime] = useState('');
  const [table, setTable] = useState(presetTable ?? '');
  const [sending, setSending] = useState(false);
  // "Pedir nombre" means required, not decorative: the restaurant asked for it
  // so it can call the order out. The button stays enabled so a tap explains why.
  const [tried, setTried] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const missingName = ordering.collect_name !== false && customerName.trim() === '';
  // Online payment goes through the gateway before WhatsApp: the guest is sent
  // to checkout and comes back to the menu (?pedido=&pago=ok), where the
  // message — kept on this device meanwhile — is handed to WhatsApp as paid.
  const payingOnline = payment === 'online';
  // A paid order may never be followed by the WhatsApp message, so the number
  // is the only way the restaurant can reach the guest about it.
  const phoneDigits = phone.replace(/\D/g, '');
  const missingPhone = payingOnline && phoneDigits.length < 10;

  // Lock background scroll while the sheet is open (only the sheet scrolls; keeps
  // the mobile URL bar from toggling and shifting the sheet).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const money = (n: number) => formatPrice(n, currency, locale);
  const subtotal = cartSubtotal(lines);
  // Promotions, figured here for the guest and again on the server for a paid order.
  const [coupon, setCoupon] = useState('');
  const [couponTyped, setCouponTyped] = useState<string | null>(null);
  const promo = useMemo(
    () =>
      applyPromotions(
        promotions,
        lines.map((l) => ({ productId: l.productId, categoryId: categoryOf(l.productId), unitPrice: lineUnitPrice(l), qty: l.qty })),
        { channel: 'menu', code: couponTyped, tz: tenant.timezone },
      ),
    [promotions, lines, categoryOf, couponTyped, tenant.timezone],
  );
  const discount = Math.min(subtotal, promo.discount);
  const net = subtotal - discount;
  const showCoupon = hasCoupons(promotions, 'menu', { tz: tenant.timezone });
  const deliveryFee =
    service === 'delivery'
      ? ordering.free_delivery_over != null && subtotal >= ordering.free_delivery_over
        ? 0
        : ordering.delivery_fee ?? 0
      : 0;
  const tipAmount = (net * tip) / 100;
  const total = net + tipAmount + deliveryFee;
  const belowMin = ordering.min_order != null && subtotal < ordering.min_order;

  const serviceLabel = (s: ServiceType) => t(`service_${s}`);

  async function handleSend() {
    if (!contact.whatsapp_phone || lines.length === 0 || belowMin) return;
    if (missingName || missingPhone) {
      setTried(true);
      document.getElementById(missingName ? 'kuik-cart-name' : 'kuik-cart-phone')?.focus();
      return;
    }
    setSending(true);
    setPayError(null);

    const message = buildOrderMessage({
      restaurantName: tenant.name,
      lines,
      showPrices,
      currency,
      locale,
      header: ordering.order_header,
      customerName: ordering.collect_name !== false ? customerName.trim() || undefined : undefined,
      serviceLabel: serviceLabel(service),
      address: service === 'delivery' ? address.trim() || undefined : undefined,
      pickupTime: service === 'pickup' ? pickupTime.trim() || undefined : undefined,
      table: service === 'dinein' ? table.trim() || undefined : undefined,
      paymentLabel: payment
        ? payment === 'transfer' && transfer
          ? `${paymentLabel(payment)} — ${t('transferWillSend')}`
          : payingOnline
            ? t('payment_online_paid')
            : paymentLabel(payment)
        : undefined,
      tipPercent: tip || undefined,
      deliveryFee: deliveryFee || undefined,
      discount: discount || undefined,
      discountLabel: promo.applied.map((p) => p.name).join(' + ') || undefined,
    });

    const payload = {
      branch_id: branchId,
      items: lines,
      total: showPrices ? total : null,
      discount: discount || null,
      promo_code: couponTyped,
      customer_name: ordering.collect_name !== false ? customerName.trim() || null : null,
      customer_phone: payingOnline ? phone.trim() : null,
      service_type: serviceLabel(service),
      table_label: service === 'dinein' ? table.trim() || null : null,
      payment_method: payment,
    };

    if (payingOnline) {
      try {
        const res = await fetch(`/api/order/${tenant.id}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...payload, pay: { service, tipPercent: tip, locale, returnPath: window.location.pathname } }),
        });
        const data = (await res.json()) as { ok: boolean; orderId?: string; payUrl?: string; error?: string };
        if (!data.ok || !data.payUrl || !data.orderId) throw new Error(data.error ?? 'checkout_failed');
        try {
          localStorage.setItem(`kuik:paid:${data.orderId}`, JSON.stringify({ message, phone: contact.whatsapp_phone, at: Date.now() }));
        } catch {
          // Without storage the confirmation still shows; only the prefilled message is lost.
        }
        window.location.assign(data.payUrl);
        return; // the page is leaving
      } catch (e) {
        const code = e instanceof Error ? e.message : '';
        setPayError(code === 'unpriced' ? t('payUnpriced') : code === 'phone_required' ? t('phoneRequired') : t('payError'));
        setSending(false);
        return;
      }
    }

    try {
      await fetch(`/api/order/${tenant.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch {
      // Logging failure must not block the order.
    }

    window.open(buildWhatsappUrl(contact.whatsapp_phone, message), '_blank');
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="animate-fade absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="animate-slide-up pb-safe relative flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[var(--sheet-radius)] sm:rounded-[var(--sheet-radius)]"
        style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)', fontFamily: 'var(--brand-font)' }}>
        <div
          className="flex items-center justify-between border-b border-[var(--brand-border)] px-5 py-4"
          style={{ backgroundColor: 'var(--brand-surface)' }}
        >
          <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-product)' }}>{t('yourOrder')}</h2>
          <button onClick={onClose} aria-label="close" className="p-1 text-[var(--brand-text-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-[var(--brand-text-secondary)]">{t('emptyCart')}</p>
          ) : (
            <ul className="space-y-3">
              {lines.map((l) => (
                <li
                  key={l.key}
                  className="rounded-2xl border border-[var(--brand-border)] p-4"
                  style={{ backgroundColor: 'var(--brand-surface)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold" style={{ fontFamily: 'var(--font-product)' }}>{l.name}</span>
                      {(l.selections ?? []).length > 0 && (
                        <p className="text-xs text-[var(--brand-text-secondary)]">
                          <SelectionLines selections={l.selections} />
                        </p>
                      )}
                    </div>
                    {showPrices && l.basePrice != null && (
                      <span className="shrink-0 text-sm font-semibold" style={{ color: 'var(--brand-primary)', fontFamily: 'var(--font-price)' }}>
                        {money(lineUnitPrice(l) * l.qty)}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex items-center gap-3 rounded-full bg-[var(--brand-muted)] px-2 py-1">
                      <button onClick={() => onDec(l.key)} aria-label="−" className="p-1">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-4 text-center text-sm font-semibold">{l.qty}</span>
                      <button onClick={() => onInc(l.key)} aria-label="+" className="p-1">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => onRemove(l.key)}
                      className="ml-auto flex items-center gap-1 text-sm text-[var(--brand-text-secondary)] hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('remove')}
                    </button>
                  </div>

                  <input
                    value={l.note ?? ''}
                    onChange={(e) => onNote(l.key, e.target.value)}
                    placeholder={ordering.note_placeholder || t('notePlaceholder')}
                    className="mt-2 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                  />
                </li>
              ))}
            </ul>
          )}

          {lines.length > 0 && (
            <div className="mt-4 space-y-4">
              {/* Service type */}
              {serviceTypes.length > 1 && (
                <div>
                  <p className="mb-1.5 text-sm font-semibold">{t('serviceType')}</p>
                  <div className="flex flex-wrap gap-2">
                    {serviceTypes.map((s) => (
                      <button
                        key={s}
                        onClick={() => setService(s)}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                          service === s ? 'bg-[var(--brand-button)] text-[var(--brand-button-text)]' : 'border border-[var(--brand-border)] text-[var(--brand-text-secondary)]'
                        }`}
                      >
                        {serviceLabel(s)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tips */}
              {showPrices && ordering.tips.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm font-semibold">{t('tip')}</p>
                  <div className="flex flex-wrap gap-2">
                    {[0, ...ordering.tips].map((p) => (
                      <button
                        key={p}
                        onClick={() => setTip(p)}
                        className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                          tip === p ? 'bg-[var(--brand-button)] text-[var(--brand-button-text)]' : 'border border-[var(--brand-border)] text-[var(--brand-text-secondary)]'
                        }`}
                      >
                        {p === 0 ? t('noTip') : `${p}%`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment method, with the transfer details when that is the pick */}
              {paymentMethods.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm font-semibold">{t('paymentMethod')}</p>
                  <div className="flex flex-wrap gap-2">
                    {paymentMethods.map((m) => (
                      <button
                        key={m}
                        onClick={() => setPayment(payment === m ? null : m)}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                          payment === m
                            ? 'bg-[var(--brand-button)] text-[var(--brand-button-text)]'
                            : 'border border-[var(--brand-border)] text-[var(--brand-text-secondary)]'
                        }`}
                      >
                        {paymentLabel(m)}
                      </button>
                    ))}
                  </div>
                  {payment === 'transfer' && transfer && (
                    <div className="mt-3 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 text-sm">
                      <p className="font-semibold">{t('transferTitle')}</p>
                      <dl className="mt-1.5 space-y-1">
                        {transfer.bank && (
                          <div className="flex justify-between gap-3">
                            <dt className="text-[var(--brand-text-secondary)]">{t('transferBank')}</dt>
                            <dd className="text-right font-medium">{transfer.bank}</dd>
                          </div>
                        )}
                        {transfer.holder && (
                          <div className="flex justify-between gap-3">
                            <dt className="text-[var(--brand-text-secondary)]">{t('transferHolder')}</dt>
                            <dd className="text-right font-medium">{transfer.holder}</dd>
                          </div>
                        )}
                        {transfer.account && (
                          <div className="flex items-center justify-between gap-3">
                            <dt className="text-[var(--brand-text-secondary)]">{t('transferAccount')}</dt>
                            <dd className="flex items-center gap-1.5 font-mono font-medium">
                              <span className="break-all text-right">{transfer.account}</span>
                              <button
                                type="button"
                                onClick={copyAccount}
                                aria-label={t('copy')}
                                className="shrink-0 rounded-md p-1 text-[var(--brand-text-secondary)]"
                              >
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                              </button>
                            </dd>
                          </div>
                        )}
                      </dl>
                      {transfer.note && (
                        <p className="mt-2 text-xs text-[var(--brand-text-secondary)]">{transfer.note}</p>
                      )}
                      <p className="mt-2 rounded-lg bg-[var(--brand-muted)] px-2.5 py-2 text-xs font-medium">
                        {t('transferSendProof')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Customer fields */}
              {ordering.collect_name !== false && (
                <div>
                  <input
                    id="kuik-cart-name"
                    value={customerName}
                    onChange={(e) => onName(e.target.value)}
                    placeholder={`${t('yourName')} *`}
                    required
                    aria-invalid={tried && missingName}
                    className={`w-full rounded-xl border bg-[var(--brand-surface)] px-3 py-2.5 text-sm focus:outline-none ${
                      tried && missingName ? 'border-red-400 focus:border-red-500' : 'border-[var(--brand-border)] focus:border-[var(--brand-primary)]'
                    }`}
                  />
                  {tried && missingName && <p className="mt-1 text-xs text-red-500">{t('nameRequired')}</p>}
                </div>
              )}
              {payingOnline && (
                <div>
                  <input
                    id="kuik-cart-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => onPhone(e.target.value)}
                    placeholder={`${t('yourPhone')} *`}
                    required
                    aria-invalid={tried && missingPhone}
                    className={`w-full rounded-xl border bg-[var(--brand-surface)] px-3 py-2.5 text-sm focus:outline-none ${
                      tried && missingPhone ? 'border-red-400 focus:border-red-500' : 'border-[var(--brand-border)] focus:border-[var(--brand-primary)]'
                    }`}
                  />
                  <p className={`mt-1 text-xs ${tried && missingPhone ? 'text-red-500' : 'text-[var(--brand-text-secondary)]'}`}>
                    {tried && missingPhone ? t('phoneRequired') : t('phoneWhy')}
                  </p>
                </div>
              )}
              {ordering.collect_address && service === 'delivery' && (
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t('address')}
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2.5 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                />
              )}
              {ordering.collect_pickup_time && service === 'pickup' && (
                <input
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  placeholder={t('pickupTime')}
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2.5 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                />
              )}
              {ordering.collect_table && service === 'dinein' && (
                <input
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                  placeholder={t('table')}
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2.5 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                />
              )}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="border-t border-[var(--brand-border)] px-5 py-4" style={{ backgroundColor: 'var(--brand-surface)' }}>
            {showPrices && (
              <div className="mb-3 space-y-1 text-sm">
                <Row label={t('subtotal')} value={money(subtotal)} />
                {promo.applied.map((p) => (
                  <Row key={p.id} label={p.name} value={`-${money(p.amount)}`} />
                ))}
                {tipAmount > 0 && <Row label={`${t('tip')} ${tip}%`} value={money(tipAmount)} />}
                {service === 'delivery' && (
                  <Row label={t('delivery')} value={deliveryFee === 0 ? t('free') : money(deliveryFee)} />
                )}
                <div className="flex items-center justify-between pt-1 text-base font-bold">
                  <span>{t('total')}</span>
                  <span style={{ color: 'var(--brand-primary)', fontFamily: 'var(--font-price)' }}>{money(total)}</span>
                </div>
              </div>
            )}

            {showCoupon && (
              <div className="mb-3">
                <div className="flex gap-2">
                  <input
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && setCouponTyped(coupon || null)}
                    placeholder={t('couponPh')}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--brand-border)] bg-transparent px-3 py-2 text-sm uppercase focus:outline-none"
                  />
                  <button onClick={() => setCouponTyped(coupon || null)} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ backgroundColor: 'var(--brand-surface)', color: 'var(--brand-primary)' }}>
                    {t('couponApply')}
                  </button>
                </div>
                {promo.badCode && <p className="mt-1 text-xs text-red-500">{t('couponInvalid')}</p>}
              </div>
            )}
            {belowMin && (
              <p className="mb-2 text-center text-sm text-red-500">
                {t('minOrder', { amount: money(ordering.min_order!) })}
              </p>
            )}
            {payError && <p className="mb-2 text-center text-sm text-red-500">{payError}</p>}

            <button
              onClick={handleSend}
              disabled={sending || belowMin}
              className={`w-full rounded-full py-3.5 text-center font-semibold disabled:opacity-60 ${
                payingOnline ? 'bg-[var(--brand-button)] text-[var(--brand-button-text)]' : 'bg-[#25D366] text-white'
              }`}
            >
              {payingOnline ? (sending ? t('payRedirecting') : t('payAndSend', { amount: money(total) })) : t('send')}
            </button>
            {payingOnline && <p className="mt-2 text-center text-xs text-[var(--brand-text-secondary)]">{t('payThenWhatsapp')}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[var(--brand-text-secondary)]">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
