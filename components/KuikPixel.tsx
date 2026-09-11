import { getPlatformSettings } from '@/lib/platform';
import { MetaPixel } from '@/components/MetaPixel';

/**
 * Kuik's own Meta Pixel, set by the super-admin (/admin). Mounted on the
 * marketing site, sign-in / sign-up and onboarding: Kuik's audience, not the
 * restaurants' diners, who get the restaurant's pixel on its menu instead.
 */
export async function KuikPixel() {
  const settings = await getPlatformSettings();
  return <MetaPixel id={settings.meta_pixel_id} />;
}
