'use client';

import { useEffect, useRef, useState } from 'react';
import { selectionsText } from '@/lib/menu-options';
import { Clock, UtensilsCrossed, ShoppingBag, Check, RefreshCw, CreditCard, BadgeCheck, Hourglass, AlertTriangle, Phone, MessageCircle, Undo2, Ban, Pencil, Minus, Plus } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { OrderRow, OrderStatus } from '@/lib/database.types';
import { formatPrice, orderCode } from '@/lib/utils';
import { createClient, channelName } from '@/lib/supabase/client';
import { listOrders, setOrderStatus, refundOrder, rejectOrder, updateOrder } from '@/app/(dashboard)/orders/actions';
import { retotal, type EditableLine } from '@/lib/orders/edit';
import { buildWhatsappUrl } from '@/lib/whatsapp';
import type { OrderAlerts } from '@/lib/orders/alerts';

type Line = { name?: string; qty?: number; selections?: { name?: string }[] };
type EditState = { order: OrderRow; lines: EditableLine[]; total: string; note: string; saving: boolean; error: string | null };

/** Two rising notes, like the kitchen screen's. Audio may be blocked until the first tap; that is fine. */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1174].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = f;
      const at = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      o.start(at);
      o.stop(at + 0.15);
    });
  } catch {
    // no audio: the highlight and the title badge still say it
  }
}

const COLUMNS: { status: OrderStatus; next: OrderStatus; tone: string }[] = [
  { status: 'new', next: 'preparing', tone: 'border-blue-200 bg-blue-50' },
  { status: 'preparing', next: 'ready', tone: 'border-amber-200 bg-amber-50' },
  { status: 'ready', next: 'done', tone: 'border-green-200 bg-green-50' },
];

export function OrdersBoard({
  initial,
  currency,
  tenantId,
  restaurantName,
  alerts,
  botConnected = false,
  canRefund = false,
}: {
  initial: OrderRow[];
  currency: string;
  tenantId: string;
  restaurantName: string;
  alerts: OrderAlerts;
  /** A linked WhatsApp bot confirms the guest by itself; without one the card offers a one-tap link. */
  botConnected?: boolean;
  /** Managers may return online payments through the gateway. */
  canRefund?: boolean;
}) {
  const t = useTranslations('orders');
  const locale = useLocale();
  const [orders, setOrders] = useState<OrderRow[]>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  // Orders that just arrived, highlighted for a minute.
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  // What we last saw of each order's payment, to tell a real arrival from a
  // pending checkout turning paid (announce) or any other update (quiet).
  const seenRef = useRef(new Map(initial.map((o) => [o.id, o.payment_status])));

  // The tab title carries the count of orders waiting to be accepted.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '');
    const n = orders.filter((o) => o.status === 'new').length;
    document.title = n > 0 ? `(${n}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [orders]);

  function announce(row: OrderRow) {
    if (alerts.sound) chime();
    setFresh((cur) => new Set(cur).add(row.id));
    setTimeout(() => setFresh((cur) => {
      const next = new Set(cur);
      next.delete(row.id);
      return next;
    }), 60_000);
    // A push already covers the phone; this is for the screen left open on a hidden tab.
    if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const lines = ((row.items ?? []) as Line[]).map((l) => `${l.qty ?? 1}× ${l.name}`).join(', ');
        new Notification(`${t('newOrder')} #${orderCode(row.id)}`, { body: [row.customer_name, lines].filter(Boolean).join(' · '), tag: `order-${row.id}` });
      } catch {
        // not available here
      }
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      setOrders(await listOrders());
    } catch {
      // keep current
    } finally {
      setRefreshing(false);
    }
  }

  // The realtime handler below is subscribed once; it reaches the latest
  // `announce` (and its settings) through a ref that each render refreshes.
  const announceRef = useRef<(row: OrderRow) => void>(() => {});
  useEffect(() => {
    announceRef.current = announce;
  });

  // Live updates over websockets (Supabase Realtime). RLS scopes rows to the tenant.
  useEffect(() => {
    const supabase = createClient();
    const upsert = (row: OrderRow) =>
      setOrders((cur) => {
        if (row.status === 'done') return cur.filter((o) => o.id !== row.id);
        const i = cur.findIndex((o) => o.id === row.id);
        if (i === -1) return [...cur, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
        const next = [...cur];
        next[i] = row;
        return next;
      });

    const channel = supabase
      .channel(channelName(`orders-${tenantId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string }).id;
            if (id) {
              setOrders((cur) => cur.filter((o) => o.id !== id));
              seenRef.current.delete(id);
            }
            return;
          }
          const row = payload.new as OrderRow;
          const prev = seenRef.current.get(row.id);
          seenRef.current.set(row.id, row.payment_status);
          upsert(row);
          // A WhatsApp order arrives complete; an online one is real only once paid.
          const arrived = prev === undefined && row.payment_status !== 'pending';
          const paidNow = prev === 'pending' && row.payment_status === 'paid';
          if ((arrived || paidNow) && row.status === 'new') announceRef.current(row);
        },
      )
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
        // Re-sync once connected to catch anything missed since the server render.
        if (status === 'SUBSCRIBED') refresh();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  function advance(o: OrderRow, next: OrderStatus) {
    setOrders((cur) =>
      next === 'done' ? cur.filter((x) => x.id !== o.id) : cur.map((x) => (x.id === o.id ? { ...x, status: next } : x)),
    );
    setOrderStatus(o.id, next).catch(() => {});
  }

  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  // ── Reject / edit ──────────────────────────────────────────────────────
  const [rejecting, setRejecting] = useState<{ order: OrderRow; reason: string } | null>(null);
  const [rejected, setRejected] = useState<OrderRow | null>(null); // for the one-tap WhatsApp after
  const [editing, setEditing] = useState<EditState | null>(null);

  function confirmReject() {
    if (!rejecting) return;
    const { order, reason } = rejecting;
    setRejecting(null);
    setOrders((cur) => cur.filter((x) => x.id !== order.id));
    if (order.customer_phone && !botConnected) setRejected({ ...order, reject_reason: reason });
    rejectOrder(order.id, reason).catch(() => {});
  }

  function beginEdit(o: OrderRow) {
    const lines = ((o.items ?? []) as EditableLine[]).map((l) => ({ ...l, selections: l.selections?.map((x) => ({ ...x })) }));
    setEditing({ order: o, lines, total: o.total != null ? String(o.total) : '', note: o.note ?? '', saving: false, error: null });
  }
  function editLine(i: number, delta: number) {
    setEditing((e) => {
      if (!e) return e;
      const lines = e.lines.map((l, j) => (j === i ? { ...l, qty: Math.max(0, (l.qty ?? 1) + delta) } : l));
      const total = retotal(e.order.total, (e.order.items ?? []) as EditableLine[], lines.filter((l) => (l.qty ?? 1) > 0));
      return { ...e, lines, total: String(total) };
    });
  }
  async function saveEdit() {
    if (!editing) return;
    const items = editing.lines.filter((l) => (l.qty ?? 1) > 0);
    const total = editing.total.trim() === '' ? null : Number(editing.total);
    setEditing({ ...editing, saving: true, error: null });
    const res = await updateOrder(editing.order.id, { items, total, note: editing.note });
    if (res.error) {
      setEditing({ ...editing, saving: false, error: res.error });
      return;
    }
    setOrders((cur) => cur.map((x) => (x.id === editing.order.id ? { ...x, items: items as OrderRow['items'], total, note: editing.note || null, edited_at: new Date().toISOString() } : x)));
    setEditing(null);
  }

  async function refund(o: OrderRow) {
    const amount = formatPrice(Number(o.amount_paid ?? o.total ?? 0), currency);
    if (!window.confirm(t('refundConfirm', { x: amount }))) return;
    const res = await refundOrder(o.id);
    if (res.error) return window.alert(t('refundError', { x: res.error }));
    setOrders((cur) => cur.map((x) => (x.id === o.id ? { ...x, payment_status: 'refunded' } : x)));
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm text-neutral-500">
          <span className={`h-2 w-2 rounded-full ${live ? 'bg-green-500' : 'bg-neutral-300'}`} />
          {live ? t('live') : t('connecting')}
        </span>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> {t('refresh')}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = orders.filter((o) => o.status === col.status);
          return (
            <div key={col.status} className={`rounded-2xl border p-3 ${col.tone}`}>
              <h2 className="mb-3 flex items-center justify-between font-semibold">
                {t(`status_${col.status}`)}
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs">{items.length}</span>
              </h2>
              <div className="space-y-3">
                {items.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">{t('emptyCol')}</p>}
                {items.map((o) => (
                  <div key={o.id} className={`rounded-xl bg-white p-3 shadow-sm transition ${fresh.has(o.id) ? 'ring-2 ring-amber-400' : ''}`}>
                    <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
                      <span className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-neutral-600">#{orderCode(o.id)}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {time(o.created_at)}
                        </span>
                      </span>
                      {o.total != null && <span className="font-semibold text-neutral-700">{formatPrice(o.total, currency)}</span>}
                    </div>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm font-medium">
                      {o.customer_name && <span>{o.customer_name}</span>}
                      {o.customer_phone && (
                        <a
                          href={`https://wa.me/${o.customer_phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-200"
                        >
                          <Phone className="h-3 w-3" /> {o.customer_phone}
                        </a>
                      )}
                      {o.service_type && (
                        <span className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                          {o.service_type === 'dinein' ? <UtensilsCrossed className="h-3 w-3" /> : <ShoppingBag className="h-3 w-3" />}
                          {o.service_type}
                          {o.table_label ? ` · ${t('table')} ${o.table_label}` : ''}
                        </span>
                      )}
                      {o.payment_method && (
                        <span className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                          <CreditCard className="h-3 w-3" />
                          {t.has(`payment_${o.payment_method}`) ? t(`payment_${o.payment_method}`) : o.payment_method}
                        </span>
                      )}
                      {o.payment_status === 'paid' && (
                        <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          <BadgeCheck className="h-3 w-3" /> {t('paid')}
                        </span>
                      )}
                      {o.payment_status === 'paid' && canRefund && (
                        <button onClick={() => refund(o)} className="flex items-center gap-1 rounded-full border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-50">
                          <Undo2 className="h-3 w-3" /> {t('refund')}
                        </button>
                      )}
                      {o.payment_status === 'pending' && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          <Hourglass className="h-3 w-3" /> {t('paymentPending')}
                        </span>
                      )}
                      {(o.payment_status === 'failed' || o.payment_status === 'refunded') && (
                        <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          <AlertTriangle className="h-3 w-3" /> {t(o.payment_status === 'failed' ? 'paymentFailed' : 'paymentRefunded')}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-0.5 text-sm">
                      {((o.items ?? []) as Line[]).map((l, i) => (
                        <li key={i}>
                          <span className="font-medium">{l.qty ?? 1}×</span> {l.name}
                          {l.selections && l.selections.length > 0 && (
                            <span className="text-neutral-400"> · {selectionsText(l.selections)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {o.note && <p className="mt-1 text-xs text-neutral-500">{o.note}</p>}
                    {o.edited_at && <p className="mt-1 text-[11px] text-amber-700">{t('edited')}</p>}
                    <button
                      onClick={() => advance(o, col.next)}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white"
                    >
                      <Check className="h-4 w-4" /> {t(`advance_${col.status}`)}
                    </button>
                    <div className="mt-2 flex gap-2">
                      {o.payment_status !== 'paid' && (
                        <button
                          onClick={() => beginEdit(o)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-neutral-300 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                        >
                          <Pencil className="h-3.5 w-3.5" /> {t('edit')}
                        </button>
                      )}
                      <button
                        onClick={() => setRejecting({ order: o, reason: '' })}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        <Ban className="h-3.5 w-3.5" /> {t('reject')}
                      </button>
                    </div>
                    {o.customer_phone && !botConnected && o.status !== 'new' && (
                      <a
                        href={buildWhatsappUrl(
                          o.customer_phone,
                          t(o.status === 'ready' ? 'customerMsgReady' : 'customerMsgAccepted', { name: o.customer_name ?? '', code: orderCode(o.id), restaurant: restaurantName }),
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#25D366] py-1.5 text-xs font-semibold text-[#1a9e4b] hover:bg-green-50"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> {t('notifyCustomer')}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRejecting(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">{t('rejectTitle', { code: orderCode(rejecting.order.id) })}</p>
            <p className="mt-1 text-sm text-neutral-600">{t('rejectBody')}</p>
            <input
              autoFocus
              value={rejecting.reason}
              onChange={(e) => setRejecting({ ...rejecting, reason: e.target.value })}
              placeholder={t('rejectReason')}
              className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            {rejecting.order.payment_status === 'paid' && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{t('rejectPaidHint')}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={confirmReject} className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white">
                {t('reject')}
              </button>
              <button onClick={() => setRejecting(null)} className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium">
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejected && rejected.customer_phone && (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg">
          <span className="min-w-0 flex-1">{t('rejectedTell', { code: orderCode(rejected.id) })}</span>
          <a
            href={buildWhatsappUrl(rejected.customer_phone, t('customerMsgRejected', { name: rejected.customer_name ?? '', code: orderCode(rejected.id), restaurant: restaurantName, reason: rejected.reject_reason ?? '' }))}
            target="_blank"
            rel="noreferrer"
            onClick={() => setRejected(null)}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white"
          >
            <MessageCircle className="h-3.5 w-3.5" /> {t('notifyCustomer')}
          </a>
          <button onClick={() => setRejected(null)} className="text-white/60 hover:text-white" aria-label={t('cancel')}>
            ✕
          </button>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setEditing(null)}>
          <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-neutral-100 px-5 py-3.5">
              <p className="font-semibold">{t('editTitle', { code: orderCode(editing.order.id) })}</p>
              <p className="text-xs text-neutral-500">{t('editHint')}</p>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {editing.lines.map((l, i) => (
                <div key={i} className={`flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm ${(l.qty ?? 1) === 0 ? 'opacity-40' : ''}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.name}</span>
                    {l.selections && l.selections.length > 0 && <span className="block truncate text-xs text-neutral-400">{selectionsText(l.selections)}</span>}
                  </span>
                  <button onClick={() => editLine(i, -1)} className="rounded-lg border border-neutral-300 p-1" aria-label="−">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center font-semibold">{l.qty ?? 1}</span>
                  <button onClick={() => editLine(i, 1)} className="rounded-lg border border-neutral-300 p-1" aria-label="+">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <label className="block pt-2 text-sm">
                <span className="text-xs font-medium text-neutral-600">{t('editNote')}</span>
                <input value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="text-xs font-medium text-neutral-600">{t('editTotal')}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={editing.total}
                  onChange={(e) => setEditing({ ...editing, total: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-[11px] text-neutral-400">{t('editTotalHint')}</span>
              </label>
              {editing.error && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">{t(`editErr_${editing.error}` as 'editErr_paid')}</p>}
            </div>
            <div className="flex gap-2 border-t border-neutral-100 p-4">
              <button onClick={() => void saveEdit()} disabled={editing.saving} className="flex-1 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {t('save')}
              </button>
              <button onClick={() => setEditing(null)} className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium">
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
