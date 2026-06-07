'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Minus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Tenant, TenantContact, TenantOrdering, ServiceType } from '@/lib/database.types';
import {
  buildOrderMessage,
  buildWhatsappUrl,
  cartSubtotal,
  lineUnitPrice,
  type CartLine,
} from '@/lib/whatsapp';
import { formatPrice } from '@/lib/utils';

export function CartSheet({
  tenant,
  contact,
  ordering,
  showPrices,
  currency,
  locale,
  lines,
  presetTable,
  onClose,
  onInc,
  onDec,
  onNote,
  onRemove,
}: {
  tenant: Tenant;
  contact: TenantContact;
  ordering: TenantOrdering;
  showPrices: boolean;
  currency: string;
  locale: string;
  lines: CartLine[];
  presetTable?: string | null;
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
  const [address, setAddress] = useState('');

  // Remember the customer's name across visits (saved on this device).
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const n = localStorage.getItem('kuik:name');
        if (n) setCustomerName(n);
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

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
  const deliveryFee =
    service === 'delivery'
      ? ordering.free_delivery_over != null && subtotal >= ordering.free_delivery_over
        ? 0
        : ordering.delivery_fee ?? 0
      : 0;
  const tipAmount = (subtotal * tip) / 100;
  const total = subtotal + tipAmount + deliveryFee;
  const belowMin = ordering.min_order != null && subtotal < ordering.min_order;

  const serviceLabel = (s: ServiceType) => t(`service_${s}`);

  async function handleSend() {
    if (!contact.whatsapp_phone || lines.length === 0 || belowMin) return;
    setSending(true);

    const message = buildOrderMessage({
      restaurantName: tenant.name,
      lines,
      showPrices,
      currency,
      locale,
      header: ordering.order_header,
      customerName: customerName.trim() || undefined,
      serviceLabel: serviceLabel(service),
      address: service === 'delivery' ? address.trim() || undefined : undefined,
      pickupTime: service === 'pickup' ? pickupTime.trim() || undefined : undefined,
      table: service === 'dinein' ? table.trim() || undefined : undefined,
      tipPercent: tip || undefined,
      deliveryFee: deliveryFee || undefined,
    });

    try {
      await fetch(`/api/order/${tenant.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: lines,
          total: showPrices ? total : null,
          customer_name: customerName.trim() || null,
          service_type: serviceLabel(service),
          table_label: service === 'dinein' ? table.trim() || null : null,
        }),
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

      <div className="animate-slide-up pb-safe relative flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-white text-neutral-900 sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="text-lg font-bold">{t('yourOrder')}</h2>
          <button onClick={onClose} aria-label="close" className="p-1 text-neutral-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-neutral-400">{t('emptyCart')}</p>
          ) : (
            <ul className="space-y-4">
              {lines.map((l) => (
                <li key={l.key} className="border-b border-neutral-100 pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium">{l.name}</span>
                      {(l.selections ?? []).length > 0 && (
                        <p className="text-xs text-neutral-400">
                          {(l.selections ?? []).map((o) => o.name).join(' · ')}
                        </p>
                      )}
                    </div>
                    {showPrices && l.basePrice != null && (
                      <span className="shrink-0 text-sm text-neutral-600">
                        {money(lineUnitPrice(l) * l.qty)}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex items-center gap-3 rounded-full bg-neutral-100 px-2 py-1">
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
                      className="ml-auto flex items-center gap-1 text-sm text-neutral-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('remove')}
                    </button>
                  </div>

                  <input
                    value={l.note ?? ''}
                    onChange={(e) => onNote(l.key, e.target.value)}
                    placeholder={t('notePlaceholder')}
                    className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
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
                          service === s ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
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
                          tip === p ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
                        }`}
                      >
                        {p === 0 ? t('noTip') : `${p}%`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer fields */}
              <input
                value={customerName}
                onChange={(e) => onName(e.target.value)}
                placeholder={t('yourName')}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-neutral-400 focus:outline-none"
              />
              {ordering.collect_address && service === 'delivery' && (
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t('address')}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-neutral-400 focus:outline-none"
                />
              )}
              {ordering.collect_pickup_time && service === 'pickup' && (
                <input
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  placeholder={t('pickupTime')}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-neutral-400 focus:outline-none"
                />
              )}
              {ordering.collect_table && service === 'dinein' && (
                <input
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                  placeholder={t('table')}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-neutral-400 focus:outline-none"
                />
              )}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="border-t border-neutral-100 px-5 py-4">
            {showPrices && (
              <div className="mb-3 space-y-1 text-sm">
                <Row label={t('subtotal')} value={money(subtotal)} />
                {tipAmount > 0 && <Row label={`${t('tip')} ${tip}%`} value={money(tipAmount)} />}
                {service === 'delivery' && (
                  <Row label={t('delivery')} value={deliveryFee === 0 ? t('free') : money(deliveryFee)} />
                )}
                <div className="flex items-center justify-between pt-1 text-base font-bold">
                  <span>{t('total')}</span>
                  <span>{money(total)}</span>
                </div>
              </div>
            )}

            {belowMin && (
              <p className="mb-2 text-center text-sm text-red-500">
                {t('minOrder', { amount: money(ordering.min_order!) })}
              </p>
            )}

            <button
              onClick={handleSend}
              disabled={sending || belowMin}
              className="w-full rounded-full bg-[#25D366] py-3.5 text-center font-semibold text-white disabled:opacity-60"
            >
              {t('send')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-neutral-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
