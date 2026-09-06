import type { FullTenant, MenuCategory } from '@/lib/database.types';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { restaurantJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';

/** The restaurant as schema.org data, so a search for its name shows hours, address and menu. */
export function RestaurantJsonLd({ data, menu = null }: { data: FullTenant; menu?: MenuCategory[] | null }) {
  const currency = resolveMenuSettings(data.theme.settings).currency;
  return <JsonLd data={restaurantJsonLd(data, menu, currency)} />;
}
