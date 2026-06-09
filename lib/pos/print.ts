'use client';

import { formatPrice } from '@/lib/utils';
import type { KitchenTicket, PosTab, TabItem, Payment } from './types';

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

/** Open a print window with thermal-receipt CSS (80mm) and trigger print. */
export function printHtml(title: string, body: string): void {
  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) return;
  w.document.write(
    `<html><head><title>${esc(title)}</title><style>
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; }
      body { font-family: ui-monospace, Menlo, monospace; font-size: 12px; width: 72mm; margin: 0; color: #000; }
      h1 { font-size: 15px; margin: 0 0 2px; text-align: center; }
      .muted { color: #444; }
      .row { display: flex; justify-content: space-between; gap: 8px; }
      .lg { font-size: 14px; font-weight: 700; }
      hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
      ul { margin: 4px 0; padding-left: 14px; }
    </style></head><body>${body}</body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

export function printKitchenTicket(ticket: KitchenTicket, locale: string): void {
  const items = (ticket.items as { name: string; qty: number; selections?: { name: string }[]; note?: string }[]) ?? [];
  const when = new Date(ticket.fired_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const lines = items
    .map((i) => {
      const opts = i.selections?.length ? `<div class="muted">${esc(i.selections.map((s) => s.name).join(', '))}</div>` : '';
      const note = i.note ? `<div class="muted">📝 ${esc(i.note)}</div>` : '';
      return `<li><span class="lg">${i.qty}× ${esc(i.name)}</span>${opts}${note}</li>`;
    })
    .join('');
  printHtml(
    'Comanda',
    `<h1>${esc(ticket.station || 'Cocina')}</h1>
     <div class="row"><span>${esc(ticket.table_label || '')}</span><span>${when}</span></div>
     <hr/><ul>${lines}</ul>`,
  );
}

export function printReceipt(
  tab: PosTab,
  items: TabItem[],
  payments: Payment[],
  restaurant: string,
  currency: string,
  locale: string,
): void {
  const lines = items
    .filter((i) => !i.voided_at)
    .map(
      (i) =>
        `<div class="row"><span>${i.qty}× ${esc(i.name)}</span><span>${formatPrice(i.line_total, currency, locale)}</span></div>`,
    )
    .join('');
  const pays = payments
    .map((p) => `<div class="row muted"><span>${esc(p.method)}</span><span>${formatPrice(p.amount, currency, locale)}</span></div>`)
    .join('');
  printHtml(
    'Recibo',
    `<h1>${esc(restaurant)}</h1>
     <div class="muted" style="text-align:center">${esc(tab.table_label || '')}</div>
     <hr/>${lines}<hr/>
     <div class="row lg"><span>Total</span><span>${formatPrice(tab.total, currency, locale)}</span></div>
     ${pays}
     <hr/><div class="muted" style="text-align:center">¡Gracias!</div>`,
  );
}
