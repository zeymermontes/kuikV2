import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitchenDoc, receiptDoc, renderText, docToHtml, type PrintDoc } from '../lib/pos/print-doc';
import type { KitchenTicket, Payment, PosTab, TabItem } from '../lib/pos/types';

const money = (n: number) => `$${n.toFixed(2)}`;
const labels = {
  subtotal: 'Subtotal',
  discount: 'Descuento',
  tip: 'Propina',
  total: 'Total',
  change: 'Cambio',
  thanks: '¡Gracias!',
  method: (m: string) => ({ cash: 'Efectivo', card: 'Tarjeta' })[m] ?? m,
};

test('rows put the right column flush right at the paper width', () => {
  const doc: PrintDoc = { title: 'x', lines: [{ t: 'row', l: '2x Latte', r: '$260.00' }] };
  const [line] = renderText(doc, 32);
  assert.equal(line.length, 32);
  assert.ok(line.startsWith('2x Latte'));
  assert.ok(line.endsWith('$260.00'));
});

test('a long left column is trimmed so the amount never wraps', () => {
  const doc: PrintDoc = { title: 'x', lines: [{ t: 'row', l: 'Matcha latte + foam + nieve de matcha extra grande', r: '$180.00' }] };
  const [line] = renderText(doc, 32);
  assert.equal(line.length, 32);
  assert.ok(line.endsWith(' $180.00'));
});

test('double-size lines lay out at half the width', () => {
  const doc: PrintDoc = { title: 'x', lines: [{ t: 'row', l: 'Total', r: '$494.50', size: 2 }] };
  const [line] = renderText(doc, 48);
  assert.equal(line.length, 24);
});

test('text wraps on words and centres inside the width', () => {
  const doc: PrintDoc = { title: 'x', lines: [{ t: 'text', v: 'Si esto se lee completo, la impresora está lista.', align: 'center' }] };
  const lines = renderText(doc, 32);
  assert.ok(lines.length >= 2);
  for (const l of lines) assert.ok(l.length <= 32);
});

test('the kitchen ticket leads with the station and lists every item with its options and note', () => {
  const ticket: KitchenTicket = {
    id: 't1',
    tenant_id: 'x',
    branch_id: null,
    tab_id: 'tab',
    station: 'Barra',
    table_label: 'Mesa 4',
    status: 'new',
    fired_by: null,
    fired_at: '2026-09-05T18:30:00.000Z',
    items: [{ name: 'Latte', qty: 2, selections: [{ name: 'Avena' }], note: 'sin hielo' }],
    created_at: '',
    updated_at: '',
  };
  const doc = kitchenDoc(ticket, 'es-MX');
  const text = renderText(doc, 48).join('\n');
  assert.match(text, /Barra/);
  assert.match(text, /Mesa 4/);
  assert.match(text, /2x Latte/);
  assert.match(text, /Avena/);
  assert.match(text, /\* sin hielo/);
});

test('the receipt shows the tip once, the payment and the change, and hides voided lines', () => {
  const tab: PosTab = {
    id: 'tab',
    tenant_id: 'x',
    branch_id: null,
    table_label: null,
    customer_name: 'Ana',
    server_name: null,
    status: 'paid',
    opened_by: null,
    opened_at: '2026-09-05T18:00:00.000Z',
    closed_at: '2026-09-05T18:40:00.000Z',
    subtotal: 430,
    discount: 0,
    tip: 64.5,
    total: 494.5,
    guests: 1,
    void_reason: null,
    shift_id: null,
    created_at: '',
    updated_at: '',
  };
  const item = (id: string, name: string, total: number, voided = false): TabItem => ({
    id,
    tenant_id: 'x',
    tab_id: 'tab',
    product_id: null,
    name,
    qty: 1,
    base_price: total,
    selections: [],
    note: null,
    line_total: total,
    course: 1,
    seat: null,
    fired_at: null,
    ticket_id: null,
    voided_at: voided ? 'now' : null,
    created_at: '',
    updated_at: '',
  });
  const pay: Payment = {
    id: 'p',
    tenant_id: 'x',
    tab_id: 'tab',
    method: 'cash',
    amount: 494.5,
    tip: 64.5,
    tendered: 500,
    change: 5.5,
    shift_id: null,
    taken_by: null,
    created_at: '',
    updated_at: '',
  };
  const doc = receiptDoc(tab, [item('a', 'Latte', 150), item('b', 'Anulado', 999, true), item('c', 'Matcha', 280)], [pay], {
    restaurant: 'Kavaa',
    locale: 'es-MX',
    money,
    labels,
    footer: 'RFC KAV000000\nGracias por venir',
  });
  const text = renderText(doc, 48).join('\n');
  assert.match(text, /Kavaa/);
  assert.match(text, /Ana/);
  assert.doesNotMatch(text, /Anulado/);
  assert.equal((text.match(/Propina/g) ?? []).length, 1);
  assert.match(text, /Total\s+\$494\.50/);
  assert.match(text, /Efectivo\s+\$494\.50/);
  assert.match(text, /Cambio\s+\$5\.50/);
  assert.match(text, /RFC KAV000000/);
  assert.match(text, /Gracias por venir/);
});

test('the HTML rendering escapes what the cashier typed', () => {
  const doc: PrintDoc = { title: 'x', lines: [{ t: 'text', v: '<script>alert(1)</script>' }] };
  const html = docToHtml(doc);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
