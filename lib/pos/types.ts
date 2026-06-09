import type { SelectedOption } from '@/lib/menu-options';
import type { Category, Product } from '@/lib/database.types';

// Menu snapshot cached in IndexedDB so the POS can build orders offline.
export interface PosMenu {
  categories: Category[];
  products: Product[];
}

// POS entities. All carry tenant_id and an `updated_at` ISO string used as the
// last-write-wins clock for offline sync.

export type TabStatus = 'open' | 'held' | 'paid' | 'void';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';
export type ShiftStatus = 'open' | 'closed';
export type TicketStatus = 'new' | 'preparing' | 'ready' | 'served';

export interface PosTab {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  table_label: string | null;
  customer_name: string | null;
  status: TabStatus;
  opened_by: string | null;
  opened_at: string;
  closed_at: string | null;
  subtotal: number;
  discount: number;
  tip: number;
  total: number;
  guests: number;
  void_reason: string | null;
  shift_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TabItem {
  id: string;
  tenant_id: string;
  tab_id: string;
  product_id: string | null;
  name: string;
  qty: number;
  base_price: number;
  selections: SelectedOption[];
  note: string | null;
  line_total: number;
  course: number;
  seat: number | null;
  fired_at: string | null;
  ticket_id: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  tenant_id: string;
  tab_id: string;
  method: PaymentMethod;
  amount: number;
  tip: number;
  tendered: number | null;
  change: number | null;
  shift_id: string | null;
  taken_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegisterShift {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  opened_by: string | null;
  opened_at: string;
  opening_cash: number;
  closed_by: string | null;
  closed_at: string | null;
  closing_cash: number | null;
  expected_cash: number | null;
  over_short: number | null;
  status: ShiftStatus;
  created_at: string;
  updated_at: string;
}

export interface KitchenTicket {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  tab_id: string | null;
  station: string | null;
  table_label: string | null;
  status: TicketStatus;
  fired_by: string | null;
  fired_at: string;
  items: unknown;
  created_at: string;
  updated_at: string;
}

// Tables that participate in offline sync (local table name === Postgres table name).
export type SyncEntity = 'tabs' | 'tab_items' | 'payments' | 'register_shifts' | 'kitchen_tickets';
export const SYNC_ENTITIES: SyncEntity[] = ['tabs', 'tab_items', 'payments', 'register_shifts', 'kitchen_tickets'];
