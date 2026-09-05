// Hand-maintained types mirroring supabase/migrations.
// Regenerate with the Supabase CLI once a project is linked:
//   supabase gen types typescript --linked > lib/database.types.ts

export type UserRole = 'owner' | 'super_admin';
export type MemberRole = 'owner' | 'manager' | 'cashier' | 'waiter' | 'host';

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
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'onsite';

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
  updated_at: string;
}

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

export type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'cancelled';

/** Where a booking came from. Mirrors orders.channel. */
export type ReservationSource = 'form' | 'manual' | 'bot' | 'phone';

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
  created_at: string;
}

export type NotificationKind = 'confirmed' | 'cancelled' | 'reminder_24h';

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

export type OrderStatus = 'new' | 'preparing' | 'ready' | 'done';

export interface OrderRow {
  id: string;
  tenant_id: string;
  items: OrderItem[];
  total: number | null;
  customer_name: string | null;
  note: string | null;
  channel: string;
  status: OrderStatus;
  service_type: string | null;
  table_label: string | null;
  payment_method: string | null;
  created_at: string;
}

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
  theme: TenantTheme;
  contact: TenantContact;
  ordering: TenantOrdering;
  landing: TenantLanding;
  loyalty: LoyaltyProgram;
  plan: 'basic' | 'pro';
  branches: BranchLite[];
}
