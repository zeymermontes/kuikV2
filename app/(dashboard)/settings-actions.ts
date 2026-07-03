'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth';
import type { ServiceType, LoyaltyType } from '@/lib/database.types';
import type { MenuSettings } from '@/lib/menu-settings';

export async function updateTheme(
  fields: Partial<{
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
    logo_url: string | null;
    background_image_url: string | null;
    background_music_url: string | null;
    background_music_volume: number;
    cover_image_url: string | null;
    slogan: string | null;
    show_prices: boolean;
    menu_mode: 'builder' | 'pdf';
    menu_pdf_url: string | null;
  }>,
) {
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  await supabase
    .from('tenant_theme')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenant.id);
  revalidatePath('/design');
  revalidatePath('/menu');
  revalidatePath(`/s/${tenant.subdomain}`);
}

/** Merge a partial set of look-and-feel knobs into tenant_theme.settings (jsonb). */
export async function updateMenuSettings(partial: Partial<MenuSettings>) {
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  const { data } = await supabase
    .from('tenant_theme')
    .select('settings')
    .eq('tenant_id', tenant.id)
    .single<{ settings: Record<string, unknown> }>();
  const merged = { ...(data?.settings ?? {}), ...partial };
  await supabase
    .from('tenant_theme')
    .update({ settings: merged, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenant.id);
  revalidatePath('/design');
  revalidatePath(`/s/${tenant.subdomain}`);
}

export async function updateLanding(
  fields: Partial<{
    enabled: boolean;
    welcome_title: string | null;
    tagline: string | null;
    featured_product_ids: string[];
    show_rating: boolean;
    rating: number | null;
    reviews_url: string | null;
    wifi_password: string | null;
  }>,
) {
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  await supabase
    .from('tenant_landing')
    .upsert(
      { tenant_id: tenant.id, ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' },
    );
  revalidatePath('/landing');
  revalidatePath(`/s/${tenant.subdomain}`);
}

export async function updateLoyalty(
  fields: Partial<{
    enabled: boolean;
    type: LoyaltyType;
    stamps_needed: number;
    reward_description: string | null;
    points_per_currency: number;
    points_for_reward: number | null;
    points_reward_description: string | null;
  }>,
) {
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  await supabase
    .from('loyalty_program')
    .upsert(
      { tenant_id: tenant.id, ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' },
    );
  revalidatePath('/loyalty');
  revalidatePath(`/s/${tenant.subdomain}`);
}

export async function updateOrdering(
  fields: Partial<{
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
    cash_count_mode: 'total' | 'denominations';
    cash_denominations: number[] | null;
    pos_tables: number;
  }>,
) {
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  await supabase
    .from('tenant_ordering')
    .upsert(
      { tenant_id: tenant.id, ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' },
    );
  revalidatePath('/ordering');
  revalidatePath(`/s/${tenant.subdomain}`);
}

export async function updateContact(
  fields: Partial<{
    whatsapp_phone: string | null;
    address: string | null;
    maps_url: string | null;
    hours: unknown;
    reservations_enabled: boolean;
    reservation_required: { phone?: boolean; party?: boolean; note?: boolean } | null;
    instagram: string | null;
    facebook: string | null;
    website: string | null;
    email: string | null;
  }>,
) {
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  await supabase
    .from('tenant_contact')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenant.id);
  revalidatePath('/contact');
  revalidatePath(`/s/${tenant.subdomain}`);
}
