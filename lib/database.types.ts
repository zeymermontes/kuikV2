// Hand-maintained types mirroring supabase/migrations.
// Regenerate with the Supabase CLI once a project is linked:
//   supabase gen types typescript --linked > lib/database.types.ts

export type UserRole = 'owner' | 'super_admin';
export type MemberRole = 'owner' | 'manager' | 'waiter';

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
  font_family: string;
  custom_font_url: string | null;
  custom_font_name: string | null;
  font_category: string | null;
  font_product: string | null;
  font_price: string | null;
  font_description: string | null;
  background_image_url: string | null;
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

export interface TenantOrdering {
  tenant_id: string;
  ordering_enabled: boolean;
  service_types: ServiceType[];
  order_header: string | null;
  min_order: number | null;
  delivery_fee: number | null;
  free_delivery_over: number | null;
  tips: number[];
  collect_address: boolean;
  collect_pickup_time: boolean;
  collect_table: boolean;
  updated_at: string;
}

export interface TenantContact {
  tenant_id: string;
  whatsapp_phone: string | null;
  address: string | null;
  hours: unknown | null;
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
  menu_mode: BranchMenuMode;
  is_visible: boolean;
  position: number;
  created_at: string;
}

export type BranchLite = Pick<Branch, 'id' | 'name' | 'slug' | 'menu_mode'>;

export interface Category {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  position: number;
  icon: string | null;
  icon_image_url: string | null;
  banner_image_url: string | null;
  banner_name: string | null;
  is_visible: boolean;
  created_at: string;
}

/** A priced choice (e.g. size "Grande" $120) or optional add-on (e.g. "+ queso" $15). */
export interface PricedOption {
  name: string;
  price: number;
}

export interface Product {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number | null;
  compare_at_price: number | null;
  prep_time: string | null;
  calories: number | null;
  show_price: boolean;
  image_url: string | null;
  is_available: boolean;
  position: number;
  tags: string[];
  variants: PricedOption[];
  modifiers: PricedOption[];
  removables: string[];
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

export interface OrderRow {
  id: string;
  tenant_id: string;
  items: OrderItem[];
  total: number | null;
  customer_name: string | null;
  note: string | null;
  channel: string;
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
  updated_at: string;
}

// A category with its products + separators, used by the public menu renderer.
export type MenuEntry =
  | ({ kind: 'product' } & Product)
  | ({ kind: 'separator' } & Separator);

export interface MenuCategory extends Category {
  entries: MenuEntry[];
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
