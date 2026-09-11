// Hand-maintained types mirroring supabase/migrations.
// Regenerate with the Supabase CLI once a project is linked:
//   supabase gen types typescript --linked > lib/database.types.ts

export type UserRole = 'owner' | 'super_admin';
export type MemberRole = 'owner' | 'manager' | 'cashier' | 'waiter' | 'host';

/** A person who uses the POS on a shared device, signed in by PIN (not a login account). */
export type EmployeeRole = 'manager' | 'cashier' | 'waiter';

export interface Employee {
  id: string;
  tenant_id: string;
  name: string;
  role: EmployeeRole;
  /** sha256 of "<tenant>:<pin>" (lib/employees.ts); null = no PIN, tap to sign in. */
  pin_hash: string | null;
  /** Per-person overrides of the role's defaults, keyed by permission. */
  perms: Record<string, boolean>;
  color: string | null;
  active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export type PromotionKind = 'percent' | 'amount' | 'bogo';
export type PromotionScope = 'order' | 'category' | 'product';
export type PromotionChannel = 'pos' | 'menu';

/** A discount rule the register and the menu apply by themselves (lib/promotions.ts). */
export interface Promotion {
  id: string;
  tenant_id: string;
  name: string;
  kind: PromotionKind;
  value: number;
  scope: PromotionScope;
  category_ids: string[];
  product_ids: string[];
  /** A coupon code; null = automatic. */
  code: string | null;
  min_subtotal: number | null;
  /** 0 = Monday … 6 = Sunday; empty = every day. */
  days: number[];
  /** "HH:MM" (Postgres time comes back as "HH:MM:SS"). */
  start_time: string | null;
  end_time: string | null;
  starts_on: string | null;
  ends_on: string | null;
  channels: PromotionChannel[];
  stackable: boolean;
  active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

/** The restaurant's fiscal identity and CFDI defaults (0076). */
export interface TenantCfdi {
  tenant_id: string;
  enabled: boolean;
  rfc: string | null;
  legal_name: string | null;
  fiscal_regime: string | null;
  zip_code: string | null;
  iva_percent: number;
  serie: string;
  next_folio: number;
  product_code: string;
  unit_code: string;
  self_invoice: boolean;
  global_daily: boolean;
  csd_registered_at: string | null;
  csd_expires_at: string | null;
  csd_serial: string | null;
  created_at: string;
  updated_at: string;
}

export type InvoiceStatus = 'pending' | 'stamped' | 'cancelled' | 'error';

export interface InvoiceReceiver {
  rfc: string;
  name: string;
  regime: string;
  use: string;
  zip: string;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  order_id: string | null;
  tab_id: string | null;
  kind: 'ingreso' | 'global';
  period_date: string | null;
  status: InvoiceStatus;
  serie: string | null;
  folio: number | null;
  uuid: string | null;
  provider: string;
  provider_id: string | null;
  receiver: InvoiceReceiver;
  items: unknown;
  payment_form: string;
  subtotal: number;
  tax: number;
  total: number;
  email: string | null;
  error: string | null;
  requested_by: 'guest' | 'staff';
  created_at: string;
  stamped_at: string | null;
  cancelled_at: string | null;
}

/** A thing the kitchen keeps in stock (0077). */
export interface Ingredient {
  id: string;
  tenant_id: string;
  name: string;
  unit: string;
  stock: number;
  min_stock: number | null;
  cost_per_unit: number;
  supplier: string | null;
  auto_86: boolean;
  active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

/** An ingredient's stock at a branch; the main location's lives on the ingredient itself (0083). */
export interface IngredientStock {
  id: string;
  tenant_id: string;
  ingredient_id: string;
  branch_id: string;
  stock: number;
  min_stock: number | null;
  updated_at: string;
}

/** A product or an option (by name key) run out at one location; null branch is the main one (0083). */
export interface BranchSoldOut {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  product_id: string | null;
  option_key: string | null;
  created_at: string;
}

/** One line of a product's recipe: this much of that ingredient per unit sold. */
export interface RecipeLine {
  product_id: string;
  ingredient_id: string;
  tenant_id: string;
  qty: number;
}

export type StockMovementKind = 'sale' | 'purchase' | 'waste' | 'count' | 'adjust';

export interface StockMovement {
  id: string;
  tenant_id: string;
  /** Null is the main location (0083). */
  branch_id?: string | null;
  ingredient_id: string;
  kind: StockMovementKind;
  qty: number;
  ref_id: string | null;
  note: string | null;
  employee_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PurchaseLine {
  ingredient_id: string;
  name: string;
  qty: number;
  cost: number;
}

export interface PurchaseOrder {
  id: string;
  tenant_id: string;
  /** Received into this branch's stock; null is the main location (0083). */
  branch_id?: string | null;
  supplier: string | null;
  status: 'draft' | 'sent' | 'received' | 'cancelled';
  items: PurchaseLine[];
  total: number;
  note: string | null;
  created_at: string;
  received_at: string | null;
  updated_at: string;
}

/** One stretch of work on the clock. */
export interface TimeEntry {
  id: string;
  tenant_id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantMember {
  tenant_id: string;
  user_id: string;
  role: MemberRole;
  email: string | null;
  created_at: string;
}

export interface TenantInvite {
  id: string;
  tenant_id: string;
  email: string;
  role: MemberRole;
  created_at: string;
  accepted_at: string | null;
}
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';
export type DomainStatus = 'none' | 'pending' | 'verified' | 'error';
export type SeparatorStyle = 'line' | 'space' | 'title';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  locale: string;
  created_at: string;
}

export interface Tenant {
  id: string;
  owner_id: string;
  name: string;
  subdomain: string;
  custom_domain: string | null;
  custom_domain_status: DomainStatus;
  locale: string;
  /** IANA name, e.g. "America/Mexico_City". Never a numeric offset. */
  timezone: string;
  /** Default country for phone normalisation (lib/phone.ts). */
  country_iso: string;
  is_published: boolean;
  /** The restaurant's own Meta Pixel, fired on its public menu site (0086). */
  meta_pixel_id: string | null;
  created_at: string;
  updated_at: string;
}

export type MenuMode = 'builder' | 'pdf';

export interface TenantTheme {
  tenant_id: string;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;
  text_secondary_color: string;
  card_color: string;
  border_color: string;
  separator_color: string;
  tab_bar_color: string | null;
  tab_selected_color: string | null;
  tab_unselected_color: string | null;
  tab_font_color: string | null;
  button_color: string | null;
  button_text_color: string | null;
  search_bg_color: string | null;
  search_text_color: string | null;
  search_border_color: string | null;
  font_family: string;
  custom_font_url: string | null;
  custom_font_name: string | null;
  font_category: string | null;
  font_product: string | null;
  font_price: string | null;
  font_description: string | null;
  /** Horizontal logo / wordmark, used by the bar header. */
  logo_wide_url: string | null;
  /** Browser tab icon. Falls back to `logo_url`. */
  favicon_url: string | null;
  // Dark counterparts. Each falls back to its light version when unset.
  logo_dark_url: string | null;
  logo_wide_dark_url: string | null;
  favicon_dark_url: string | null;
  cover_image_dark_url: string | null;
  background_image_url: string | null;
  background_music_url: string | null;
  background_music_volume: number;
  cover_image_url: string | null;
  slogan: string | null;
  logo_url: string | null;
  show_prices: boolean;
  menu_mode: MenuMode;
  menu_pdf_url: string | null;
  settings: Record<string, unknown>;
  updated_at: string;
}

export type ServiceType = 'pickup' | 'delivery' | 'dinein';

/** How a guest says they will pay; the restaurant picks which to offer. */
/** 'onsite' = the guest settles at the counter when they pick up / are served. */
/** `online` = paid through the connected gateway before the WhatsApp message goes out (0066). */
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'onsite' | 'online';

export interface TenantOrdering {
  tenant_id: string;
  /** Master switch. When off the menu is a showcase on every channel. */
  ordering_enabled: boolean;
  /** Cart when the guest arrives from a table QR inside the restaurant. */
  ordering_qr_enabled: boolean;
  /** Cart when the guest arrives from a link shared online. */
  ordering_online_enabled: boolean;
  service_types: ServiceType[];
  order_header: string | null;
  min_order: number | null;
  delivery_fee: number | null;
  free_delivery_over: number | null;
  tips: number[];
  collect_address: boolean;
  collect_pickup_time: boolean;
  collect_table: boolean;
  /** Ask the guest's name at checkout (see 0063). */
  collect_name: boolean;
  cash_count_mode: 'total' | 'denominations';
  cash_denominations: number[] | null;
  pos_tables: number;
  /** Empty = the cart never asks (see 0060). */
  payment_methods: PaymentMethod[];
  transfer_bank: string | null;
  transfer_holder: string | null;
  /** CLABE or account number, shown to the guest who picks transfer. */
  transfer_account: string | null;
  transfer_note: string | null;
  /** Hint in the notes box; null = the built-in "Sin cebolla, extra salsa…". */
  note_placeholder: string | null;
  /** Receipt paper at payment: offer a button, print by itself, or never (see 0065). */
  print_receipt_mode: PrintReceiptMode;
  /** Every fire goes to the station printers without a tap. */
  print_kitchen_auto: boolean;
  /** Kick the cash drawer when a cash payment closes the sale. */
  print_drawer_cash: boolean;
  /** Extra lines under the receipt total: RFC, address, a thank-you. */
  receipt_footer: string | null;
  /** How the restaurant is told about orders (lib/orders/alerts.ts, 0068). */
  order_alerts: Record<string, unknown> | null;
  /** Ask for a PIN again after every closed sale (shared tablet). */
  pos_lock_after_sale: boolean;
  /** The Pedidos board, live alerts and stored WhatsApp orders; the super admin turns it on (0085). */
  orders_board: boolean;
  updated_at: string;
}

export type PrintReceiptMode = 'ask' | 'auto' | 'off';

export interface TenantContact {
  tenant_id: string;
  whatsapp_phone: string | null;
  address: string | null;
  maps_url: string | null;
  hours: unknown | null;
  reservations_enabled: boolean;
  /** Which optional fields the public form must fill in. `name` defaults to true. */
  reservation_required: { name?: boolean; phone?: boolean; party?: boolean; note?: boolean } | null;
  /** Length of a booking slot, used for capacity math. */
  reservation_slot_minutes: number;
  reservation_max_party: number;
  /** How far ahead the public must book. */
  reservation_lead_minutes: number;
  /** How far into the future the public may book. */
  reservation_max_days: number;
  /** Skip the pending step and confirm public requests automatically. */
  reservation_auto_confirm: boolean;
  /** Service periods shown at the host stand; null = app defaults. */
  reservation_shifts: ReservationShift[] | null;
  /** Turn time in minutes keyed by party size ("1".."8", larger falls back to the biggest); null = defaults. */
  reservation_turn_minutes: Record<string, number> | null;
  /** Minutes after the booked time before a party counts as late. */
  reservation_late_minutes: number;
  instagram: string | null;
  facebook: string | null;
  website: string | null;
  email: string | null;
  updated_at: string;
}

export type BranchMenuMode = 'shared' | 'independent';

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  whatsapp_phone: string | null;
  address: string | null;
  maps_url: string | null;
  hours: unknown | null;
  menu_mode: BranchMenuMode;
  is_visible: boolean;
  position: number;
  created_at: string;
}

export type BranchLite = Pick<Branch, 'id' | 'name' | 'slug' | 'menu_mode'>;

/**
 * A section's own design. Every key optional and named exactly like the
 * tenant theme column it overrides, so the dashboard, the import file and the
 * AI prompts speak one vocabulary. Absent = inherit.
 */
export interface CategoryTheme {
  primary_color?: string;
  secondary_color?: string;
  background_color?: string;
  text_color?: string;
  text_secondary_color?: string;
  card_color?: string;
  border_color?: string;
  separator_color?: string;
  button_color?: string;
  button_text_color?: string;
  tab_bar_color?: string;
  tab_selected_color?: string;
  tab_unselected_color?: string;
  tab_font_color?: string;
  /** Outline of this section's chip while selected / not. */
  tab_selected_border_color?: string;
  tab_unselected_border_color?: string;
  font_family?: string;
  font_category?: string;
  font_product?: string;
  font_price?: string;
  font_description?: string;
  /** Full-page backdrop while this section is in view (hosted URL). */
  background_image?: string;
}

export interface Category {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  /** Non-null when this category is a subcategory of another. One level only. */
  parent_id: string | null;
  position: number;
  icon: string | null;
  icon_image_url: string | null;
  banner_image_url: string | null;
  banner_name: string | null;
  /** The section's own design; null inherits the menu theme (see 0061). */
  theme: CategoryTheme | null;
  is_visible: boolean;
  station: string | null;
  created_at: string;
}

/** A priced choice (e.g. size "Grande" $120) or optional add-on (e.g. "+ queso" $15). */
export interface PricedOption {
  name: string;
  price: number;
  /** false while it has run out ("no oat milk today"); absent = available (0078). */
  available?: boolean;
}

// Dynamic, per-product option group (multiselect). Replaces the fixed
// variants/modifiers/removables; those remain for backward compatibility.
/**
 * What a group of options is about: part of the dish itself ("choose your
 * protein") or how it is packed to go ("extra tortillas", "cutlery"). Shown to
 * the guest so they can tell the two apart. Defaults to 'dish'.
 */
/** What an option group is about; shown as a small tag so "Size" reads right on a drink and a dish alike. */
export type OptionKind = 'dish' | 'drink' | 'takeaway';

export interface OptionGroup {
  id: string;
  name: string;
  description?: string;
  kind?: OptionKind;
  required: boolean;
  multiple: boolean; // true = choose many (checkbox); false = choose one (radio)
  options: PricedOption[];
}

export interface Product {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number | null;
  compare_at_price: number | null;
  cost: number | null;
  sku: string | null;
  prep_time: string | null;
  calories: number | null;
  show_price: boolean;
  image_url: string | null;
  is_available: boolean;
  is_hidden: boolean;
  position: number;
  tags: string[];
  variants: PricedOption[];
  modifiers: PricedOption[];
  removables: string[];
  option_groups: OptionGroup[];
  /** SAT codes for invoices when the restaurant's defaults do not fit (0076). */
  sat_product_code?: string | null;
  sat_unit_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Separator {
  id: string;
  tenant_id: string;
  category_id: string;
  label: string | null;
  style: SeparatorStyle;
  position: number;
  created_at: string;
}

/**
 * Where a party is in its visit. The first four are the book; `arrived`,
 * `partial` (some of the party is here) and `seated` are the floor; `waiting`
 * and `notified` are the waitlist. Mirrors OpenTable's host app so a team
 * moving over recognises every state.
 */
export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'arrived'
  | 'partial'
  | 'seated'
  | 'finished'
  | 'no_show'
  | 'cancelled'
  | 'waiting'
  | 'notified';

/** Course progression while a party is seated (OpenTable's "table status"). */
export type TableStatus = 'seated' | 'appetizer' | 'entree' | 'dessert' | 'check' | 'paid' | 'bussing';

export type TableShape = 'square' | 'round' | 'rect' | 'diamond';

/** One table on the floor plan; x/y are grid cells. */
export interface FloorTable {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  /** The room (floor plan tab) it sits in. */
  area_id: string | null;
  label: string;
  seats: number;
  shape: TableShape;
  x: number;
  y: number;
  /** Server section: who works this table this shift. */
  server_name: string | null;
  blocked_until: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

// ── Print queue (0065) ────────────────────────────────────────────────────────
/** The small program installed on one machine in the restaurant that drains the queue. */
export interface PrintAgent {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  /** sha256 of the bearer token; the token is shown once at creation. */
  token_hash: string;
  platform: string | null;
  version: string | null;
  last_seen_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** How the agent reaches a printer: raw TCP on the LAN, or an OS printer (USB/Bluetooth). */
export type PrinterKind = 'network' | 'system';
export type PrinterRole = 'receipt' | 'kitchen' | 'report';
/** Characters per line: 32 for 58 mm paper, 48 for 80 mm. */
export type PrinterWidth = 32 | 42 | 48;

export interface Printer {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  agent_id: string | null;
  name: string;
  kind: PrinterKind;
  /** host[:port] for network, the OS printer name for system. */
  address: string;
  width: PrinterWidth;
  roles: PrinterRole[];
  /** Kitchen stations routed here; empty = every station. */
  stations: string[];
  has_drawer: boolean;
  cut: boolean;
  copies: number;
  enabled: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export type PrintJobKind = 'kitchen' | 'receipt' | 'report' | 'drawer' | 'test';
export type PrintJobStatus = 'queued' | 'printing' | 'done' | 'failed';

export interface PrintJob {
  id: string;
  tenant_id: string;
  printer_id: string;
  kind: PrintJobKind;
  /** A PrintDoc (lib/pos/print-doc.ts). */
  doc: unknown;
  status: PrintJobStatus;
  attempts: number;
  error: string | null;
  ref_id: string | null;
  created_by: string | null;
  claimed_at: string | null;
  printed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Tables that join for a bigger party; seating on it takes every member. */
export interface FloorCombination {
  id: string;
  tenant_id: string;
  area_id: string | null;
  table_ids: string[];
  seats: number;
  created_at: string;
}

export interface ReservationShift {
  name: string;
  /** "HH:MM" local wall-clock. */
  start: string;
  end: string;
}

/** Where a booking came from. Mirrors orders.channel. */
export type ReservationSource = 'form' | 'manual' | 'bot' | 'phone' | 'walkin';

export interface Reservation {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  area_id: string | null;
  customer_name: string;
  phone: string | null;
  party_size: number;
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  /** Local wall-clock time, "HH:MM". */
  time: string;
  /**
   * The absolute instant `date` + `time` refers to, derived from the tenant's
   * timezone by a trigger. Read this for any comparison; the two fields above
   * are for display and are meaningless without a zone.
   */
  starts_at: string;
  note: string | null;
  status: ReservationStatus;
  source: ReservationSource;
  // ── Host stand (0064) ──
  /** Tables the party sits at; more than one is a combination. */
  table_ids: string[];
  table_status: TableStatus;
  arrived_at: string | null;
  seated_at: string | null;
  finished_at: string | null;
  /** Waitlist: minutes the guest was quoted. */
  quoted_minutes: number | null;
  notified_at: string | null;
  server_name: string | null;
  /** vip, first_time, birthday, allergy… */
  tags: string[];
  /** Per-party override of the turn time; null = by party size. */
  turn_minutes: number | null;
  /** The WhatsApp chat the booking was made in, or later tied to. */
  whatsapp_conversation_id?: string | null;
  created_at: string;
}

export type NotificationKind = 'confirmed' | 'cancelled' | 'reminder_24h' | 'waitlist' | 'table_ready';

export interface ReservationNotification {
  id: string;
  tenant_id: string;
  reservation_id: string;
  kind: NotificationKind;
  channel: 'manual_wa' | 'whatsapp_api' | 'none';
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  body: string | null;
  provider_id: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface PushSubscriptionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  failed_at: string | null;
}

/** An FCM token from the native phone app (migration 0079). */
export interface DevicePushToken {
  id: string;
  tenant_id: string;
  user_id: string;
  token: string;
  platform: 'ios' | 'android';
  app: 'kuik' | 'terminal';
  locale: string;
  created_at: string;
  last_seen_at: string;
}

/** A bookable space: "Salón", "Terraza", "Salón privado". */
export interface ReservationArea {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  /** Max diners in this area per slot. Null = unlimited. */
  max_covers: number | null;
  public_bookable: boolean;
  position: number;
  created_at: string;
}

export type OrderStatus = 'new' | 'preparing' | 'ready' | 'done' | 'rejected';

export interface OrderRow {
  id: string;
  tenant_id: string;
  /** The branch the menu was opened for; null is the main location (0083). */
  branch_id?: string | null;
  items: OrderItem[];
  total: number | null;
  customer_name: string | null;
  /** Asked when paying online (0067); a WhatsApp order carries it in the chat instead. */
  customer_phone: string | null;
  note: string | null;
  channel: string;
  status: OrderStatus;
  service_type: string | null;
  table_label: string | null;
  payment_method: string | null;
  /** none = paid at the counter / on WhatsApp; the rest follow the gateway (0066). */
  payment_status: PaymentStatus;
  payment_provider: string | null;
  payment_ref: string | null;
  paid_at: string | null;
  amount_paid: number | null;
  currency: string | null;
  /** First time staff advanced the order; stops the unaccepted-order escalation (0068). */
  accepted_at: string | null;
  /** 0 none, 1 nudged, 2 escalated — the cron never repeats a step. */
  alert_level: number;
  /** Promotions taken off (0075). */
  discount: number | null;
  promos: { id: string; name: string; amount: number }[] | null;
  promo_code: string | null;
  /** The CFDI this order is on, its own or the day's global (0076). */
  invoice_id: string | null;
  /** The gateway's refund, when the restaurant returned the money (0074). */
  refund_ref: string | null;
  refunded_at: string | null;
  amount_refunded: number | null;
  /** Why the restaurant turned it down (0085). */
  reject_reason?: string | null;
  /** Last time staff changed its lines or total (0085). */
  edited_at?: string | null;
  created_at: string;
}

export type PaymentStatus = 'none' | 'pending' | 'paid' | 'failed' | 'refunded';

export interface OrderItem {
  product_id: string;
  name: string;
  qty: number;
  price: number | null;
  note?: string;
}

export interface Subscription {
  tenant_id: string;
  status: SubscriptionStatus;
  plan: 'basic' | 'pro';
  /** Paid add-ons ('pos'); the trial has them all (lib/plan.ts, 0069). */
  addons: string[];
  is_additional: boolean;
  trial_ends_at: string | null;
  current_period_end: string | null;
  mp_preapproval_id: string | null;
  mp_payer_email: string | null;
  free_months_granted: number;
  updated_at: string;
}

export type LoyaltyType = 'stamps' | 'points';

export interface LoyaltyProgram {
  tenant_id: string;
  enabled: boolean;
  type: LoyaltyType;
  stamps_needed: number;
  reward_description: string | null;
  points_per_currency: number;
  points_for_reward: number | null;
  points_reward_description: string | null;
  updated_at: string;
}

export interface LoyaltyCustomer {
  id: string;
  tenant_id: string;
  phone: string;
  name: string | null;
  code: string;
  stamps: number;
  points: number;
  total_visits: number;
  created_at: string;
}

export interface TenantLanding {
  tenant_id: string;
  enabled: boolean;
  welcome_title: string | null;
  tagline: string | null;
  featured_product_ids: string[];
  show_rating: boolean;
  rating: number | null;
  reviews_url: string | null;
  wifi_password: string | null;
  // Super-admin home-screen selector. 'builder' = defer to the owner's template
  // landing (shown if `enabled`); 'custom' = a super-admin-uploaded static site
  // rendered in a sandboxed iframe; 'none' = force straight to the menu.
  landing_mode: 'builder' | 'custom' | 'none';
  // Storage path (within the public `media` bucket) of the uploaded entry
  // HTML, e.g. "<tenantId>/landing-site/index.html". Null until uploaded.
  custom_entry: string | null;
  updated_at: string;
}

// A category with its products + separators, used by the public menu renderer.
export type MenuEntry =
  | ({ kind: 'product' } & Product)
  | ({ kind: 'separator' } & Separator);

export interface MenuCategory extends Category {
  entries: MenuEntry[];
  /** Child sections rendered inside this one. Empty for a subcategory. */
  subcategories: MenuCategory[];
}

export interface FullTenant {
  tenant: Tenant;
  /** Active promotions that apply on the menu (0075). */
  promotions: Promotion[];
  theme: TenantTheme;
  contact: TenantContact;
  ordering: TenantOrdering;
  landing: TenantLanding;
  loyalty: LoyaltyProgram;
  plan: 'basic' | 'pro';
  branches: BranchLite[];
}
