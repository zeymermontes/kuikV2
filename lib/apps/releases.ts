import 'server-only';

// The native apps' downloads. native/scripts/publish-apk.mjs uploads each
// release APK to the public `apps` bucket and rewrites latest.json there; this
// module reads that file, so a new build reaches kuik.mx/apps and the in-app
// update banner without a deploy. No file yet means "coming soon".

export type AppId = 'kuik' | 'terminal';

export interface AppRelease {
  version: string;
  versionCode: number;
  android: { url: string; size: number; publishedAt: string } | null;
  /** A TestFlight or App Store link once there is one. */
  ios: { url: string; publishedAt: string } | null;
}

export interface DesktopRelease {
  version: string;
  publishedAt?: string;
  mac?: { url: string; size: number } | null;
  win?: { url: string; size: number } | null;
  linux?: { url: string; size: number } | null;
}

export type AppReleases = Partial<Record<AppId, AppRelease>> & { desktop?: DesktopRelease };

export const APPS_BUCKET = 'apps';

/** Public URL of a file in the apps bucket, or null without a Supabase URL (a bare dev env). */
export function appsPublicUrl(file: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${APPS_BUCKET}/${file}`;
}

/** latest.json from the bucket; empty when it is not there yet or cannot be reached. */
export async function getAppReleases(): Promise<AppReleases> {
  const url = appsPublicUrl('latest.json');
  if (!url) return {};
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return {};
    const json = (await res.json()) as unknown;
    if (!json || typeof json !== 'object') return {};
    const out: AppReleases = {};
    for (const id of ['kuik', 'terminal'] as const) {
      const r = (json as Record<string, unknown>)[id] as Partial<AppRelease> | undefined;
      if (r && typeof r.version === 'string') {
        out[id] = {
          version: r.version,
          versionCode: Number(r.versionCode ?? 0),
          android: r.android && typeof r.android.url === 'string' ? r.android : null,
          ios: r.ios && typeof r.ios.url === 'string' ? r.ios : null,
        };
      }
    }
    const d = (json as Record<string, unknown>).desktop as Partial<DesktopRelease> | undefined;
    if (d && typeof d.version === 'string') {
      const link = (x: unknown) => (x && typeof (x as { url?: unknown }).url === 'string' ? (x as { url: string; size: number }) : null);
      out.desktop = { version: d.version, publishedAt: d.publishedAt, mac: link(d.mac), win: link(d.win), linux: link(d.linux) };
    }
    return out;
  } catch {
    return {};
  }
}
