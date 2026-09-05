import type { KitchenTicket } from './types';

/** Sample tickets for `/kds?demo=1`: one per age band, two stations, a note and modifiers. */
export function demoTickets(tenantId: string): KitchenTicket[] {
  const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const mk = (id: string, minutes: number, status: KitchenTicket['status'], station: string, table: string | null, items: unknown): KitchenTicket => ({
    id: `demo-k-${id}`,
    tenant_id: tenantId,
    branch_id: null,
    tab_id: null,
    station,
    table_label: table,
    status,
    fired_by: null,
    fired_at: ago(minutes),
    items,
    created_at: ago(minutes),
    updated_at: ago(status === 'served' ? 2 : minutes),
  });
  return [
    mk('1', 12, 'preparing', 'Cocina', '4', [
      { name: 'Smash Burger Doble', qty: 2, selections: [{ name: 'Sin cebolla' }, { name: 'Tocino extra' }] },
      { name: 'Papas extra', qty: 1 },
    ]),
    mk('2', 7, 'preparing', 'Cocina', '12', [
      { name: 'Boneless 250 g', qty: 1, selections: [{ name: 'BBQ' }], note: 'Alergia a nuez' },
      { name: 'Munchie fries', qty: 2 },
    ]),
    mk('3', 3, 'new', 'Cocina', null, [
      { name: 'Torta Combo', qty: 1 },
      { name: 'Pulled Pork con papas', qty: 1, selections: [{ name: 'Sin pepinillos' }] },
    ]),
    mk('4', 1, 'new', 'Barra', '4', [
      { name: 'Limonada', qty: 2 },
      { name: 'Fresa limón', qty: 1, note: 'Sin hielo' },
    ]),
    mk('5', 9, 'ready', 'Barra', '31', [{ name: 'Té', qty: 3 }]),
    mk('6', 20, 'served', 'Cocina', '21', [{ name: 'Smash Burger Sencilla', qty: 1 }]),
  ];
}
