'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Clock, MessageCircle, Package, Phone, X } from 'lucide-react';
import { createClient, channelName } from '@/lib/supabase/client';
import { listHostOrders, setHostOrderStatus, type HostOrder } from '@/app/host/actions';
import { formatPrice, orderCode } from '@/lib/utils';
import type { OrderStatus } from '@/lib/database.types';
import { Sheet, PRIMARY, DANGER, GHOST } from './ui';

/**
 * The door's view of takeout, pickup and delivery orders: accept or reject
 * the new ones, mark them ready, hand them over — and open the WhatsApp chat
 * an order came through, to answer "¿ya está?" without leaving the stand.
 */
export function OrdersSheet({
  tenantId,
  currency,
  onClose,
  onOpenChat,
}: {
  tenantId: string;
  currency: string;
  onClose: () => void;
  onOpenChat: (chat: { conversationId: string; name: string; phone: string | null }) => void;
}) {
  const t = useTranslations('host');
  const locale = useLocale();
  const [rows, setRows] = useState<HostOrder[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => listHostOrders().then((r) => !cancelled && setRows(r)).catch(() => !cancelled && setRows([]));
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(`host-orders-${tenantId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` }, load)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  const money = (n: number | null) => (n == null ? '' : formatPrice(n, currency, locale === 'en' ? 'en-US' : 'es-MX'));
  const ago = (iso: string) => {
    const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
    return mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`;
  };

  function move(o: HostOrder, status: OrderStatus, reason?: string) {
    setBusy((cur) => new Set(cur).add(o.id));
    setRejecting(null);
    // Optimistic; Realtime brings the row back in its new group.
    setRows((cur) => (cur ?? []).map((x) => (x.id === o.id ? { ...x, status } : x)));
    setHostOrderStatus(o.id, status, reason)
      .catch(() => {})
      .finally(() => setBusy((cur) => { const n = new Set(cur); n.delete(o.id); return n; }));
  }

  const groups: { key: 'new' | 'preparing' | 'ready' | 'past'; items: HostOrder[] }[] = [
    { key: 'new', items: (rows ?? []).filter((o) => o.status === 'new') },
    { key: 'preparing', items: (rows ?? []).filter((o) => o.status === 'preparing') },
    { key: 'ready', items: (rows ?? []).filter((o) => o.status === 'ready') },
    { key: 'past', items: (rows ?? []).filter((o) => o.status === 'done' || o.status === 'rejected') },
  ];

  return (
    <Sheet title={t('ordersTitle')} subtitle={t('ordersHint')} onClose={onClose}>
      {rows === null ? (
        <p className="py-10 text-center text-sm text-white/50">…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-white/50">{t('ordersNone')}</p>
      ) : (
        groups.map((g) => g.items.length > 0 && (
          <div key={g.key} className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/40">
              {t(`orders_${g.key}`)} ({g.items.length})
            </p>
            <ul className="space-y-2">
              {g.items.map((o) => {
                const items = ((o.items ?? []) as { name?: string; qty?: number }[]).map((l) => `${l.qty ?? 1}× ${l.name ?? ''}`).join(', ');
                const kind = o.service_kind ? t(`orderKind_${o.service_kind}`) : o.service_type;
                const tone = o.status === 'new' ? 'border-amber-400/40 bg-amber-400/10' : o.status === 'ready' ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-white/5';
                return (
                  <li key={o.id} className={`rounded-2xl border p-3 ${tone}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 font-semibold">
                          <span>#{orderCode(o.id)}</span>
                          {o.customer_name && <span className="truncate font-normal text-white/80">{o.customer_name}</span>}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/60">
                          <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" /> {kind}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {ago(o.created_at)}</span>
                          {o.payment_status === 'paid' ? <span className="text-emerald-300">{t('orderPaid')}</span> : o.payment_method ? <span>{o.payment_method}</span> : null}
                          {o.chat?.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {o.chat.phone}</span>}
                        </p>
                        <p className="mt-1 text-sm text-white/80">{items}</p>
                        {o.note && <p className="mt-0.5 text-xs text-white/60">“{o.note}”</p>}
                        {o.status === 'rejected' && o.reject_reason && <p className="mt-0.5 text-xs text-red-300">{o.reject_reason}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        {o.total != null && <p className="font-semibold tabular-nums">{money(o.total)}</p>}
                        <p className="text-[11px] text-white/40">{t(`ostatus_${o.status}`)}</p>
                      </div>
                    </div>

                    {rejecting?.id === o.id ? (
                      <div className="mt-3 space-y-2">
                        <input
                          autoFocus
                          value={rejecting.reason}
                          onChange={(e) => setRejecting({ id: o.id, reason: e.target.value })}
                          placeholder={t('orderRejectWhy')}
                          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                        />
                        <div className="flex gap-2">
                          <button disabled={busy.has(o.id)} onClick={() => move(o, 'rejected', rejecting.reason)} className={`${DANGER} flex-1`}>
                            <X className="h-4 w-4" /> {t('act_rejectOrder')}
                          </button>
                          <button onClick={() => setRejecting(null)} className={`${GHOST} flex-1`}>{t('cancel')}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {o.status === 'new' && (
                          <>
                            <button disabled={busy.has(o.id)} onClick={() => move(o, 'preparing')} className={`${PRIMARY} flex-1`}>
                              <Check className="h-4 w-4" /> {t('act_acceptOrder')}
                            </button>
                            <button disabled={busy.has(o.id)} onClick={() => setRejecting({ id: o.id, reason: '' })} className={`${DANGER} flex-1`}>
                              <X className="h-4 w-4" /> {t('act_rejectOrder')}
                            </button>
                          </>
                        )}
                        {o.status === 'preparing' && (
                          <button disabled={busy.has(o.id)} onClick={() => move(o, 'ready')} className={`${PRIMARY} flex-1`}>
                            <Check className="h-4 w-4" /> {t('act_orderReady')}
                          </button>
                        )}
                        {o.status === 'ready' && (
                          <button disabled={busy.has(o.id)} onClick={() => move(o, 'done')} className={`${PRIMARY} flex-1`}>
                            <Check className="h-4 w-4" /> {t('act_orderDone')}
                          </button>
                        )}
                        {o.chat && (
                          <button onClick={() => onOpenChat(o.chat!)} className={`${GHOST} ${o.status === 'done' || o.status === 'rejected' ? 'flex-1' : ''}`}>
                            <MessageCircle className="h-4 w-4" /> {t('act_orderChat')}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </Sheet>
  );
}
