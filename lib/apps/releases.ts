import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { compareVersions, isVersion } from './version';

// The native apps' downloads and update policy. native/scripts/publish-apk.mjs
// and publish-desktop.mjs upload each build to the public `apps` bucket and
// rewrite latest.json there; this module reads that file, so a new build
// reaches kuik.mx/apps and the in-app update gate without a deploy. No file
// yet means "coming soon".
//
// Each app carries `minVersion`: the oldest build still allowed. A shell
// below it is blocked until it updates (components/ShellUpdateBanner.tsx);
// one at or above it only sees a banner it can put off. The scripts set it
// with --mandatory, and the super-admin page can change it afterwards.

export type AppId = 'kuik' | 'terminal';

export interface AppRelease {
  version: string;
  versionCode: number;
  /** Builds older than this must update before they can be used; null allows every build. */
  minVersion: string | null;
  android: { url: string; size: number; publishedAt: string } | null;
  /**
   * A TestFlight or App Store link once there is one. `version` is what the
   * store actually serves: the gate never demands a version the store does
   * not have yet, so leave it behind `version` while a review is pending.
   */
  ios: { url: string; publishedAt: string; version?: string } | null;
}

export interface DesktopRelease {
  version: string;
  minVersion: string | null;
  publishedAt?: string;
  mac?: { url: string; size: number } | null;
  win?: { url: string; size: number } | null;
  linux?: { url: string; size: number } | null;
}

export type AppReleases = Partial<Record<AppId, AppRelease>> & { desktop?: DesktopRelease };

/** Every key latest.json may carry, including the desktop shell. */
export type ReleaseKey = AppId | 'desktop';
export const RELEASE_KEYS: ReleaseKey[] = ['kuik', 'terminal', 'desktop'];

export const APPS_BUCKET = 'apps';
const LATEST = 'latest.json';

/** Public URL of a file in the apps bucket, or null without a Supabase URL (a bare dev env). */
export function appsPublicUrl(file: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${APPS_BUCKET}/${file}`;
}

const version = (v: unknown): string | null => (typeof v === 'string' && isVersion(v) ? v.trim() : null);

function parseReleases(json: unknown): AppReleases {
  if (!json || typeof json !== 'object') return {};
  const out: AppReleases = {};
  for (const id of ['kuik', 'terminal'] as const) {
    const r = (json as Record<string, unknown>)[id] as Partial<AppRelease> | undefined;
    if (r && typeof r.version === 'string') {
      out[id] = {
        version: r.version,
        versionCode: Number(r.versionCode ?? 0),
        minVersion: version(r.minVersion),
        android: r.android && typeof r.android.url === 'string' ? r.android : null,
        ios: r.ios && typeof r.ios.url === 'string' ? { ...r.ios, version: version(r.ios.version) ?? undefined } : null,
      };
    }
  }
  const d = (json as Record<string, unknown>).desktop as Partial<DesktopRelease> | undefined;
  if (d && typeof d.version === 'string') {
    const link = (x: unknown) => (x && typeof (x as { url?: unknown }).url === 'string' ? (x as { url: string; size: number }) : null);
    out.desktop = {
      version: d.version,
      minVersion: version(d.minVersion),
      publishedAt: d.publishedAt,
      mac: link(d.mac),
      win: link(d.win),
      linux: link(d.linux),
    };
  }
  return out;
}

/**
 * latest.json from the bucket; empty when it is not there yet or cannot be
 * reached. `fresh` skips the fetch cache: the update endpoint and the admin
 * page want what the bucket holds now, the marketing page can lag a little.
 */
export async function getAppReleases(o: { fresh?: boolean } = {}): Promise<AppReleases> {
  const url = appsPublicUrl(LATEST);
  if (!url) return {};
  try {
    const res = await fetch(url, o.fresh ? { cache: 'no-store' } : { next: { revalidate: 300 } });
    if (!res.ok) return {};
    return parseReleases(await res.json());
  } catch {
    return {};
  }
}

/**
 * Change the oldest build an app may run, without republishing. null lifts
 * the requirement. Refuses a version newer than the one published: nobody
 * could update to it, and the gate would not enforce it anyway.
 */
export async function setMinVersion(app: ReleaseKey, minVersion: string | null): Promise<{ error?: 'invalid' | 'ahead' | 'missing' | 'failed' }> {
  const min = minVersion ? minVersion.trim() : null;
  if (min !== null && !isVersion(min)) return { error: 'invalid' };
  const bucket = createAdminClient().storage.from(APPS_BUCKET);
  const { data: file, error: readErr } = await bucket.download(LATEST);
  if (readErr || !file) return { error: 'missing' };
  const raw = JSON.parse(await file.text()) as Record<string, Record<string, unknown> | undefined>;
  const entry = raw[app];
  if (!entry || typeof entry.version !== 'string') return { error: 'missing' };
  if (min !== null && compareVersions(min, entry.version) > 0) return { error: 'ahead' };
  raw[app] = { ...entry, minVersion: min };
  const { error } = await bucket.upload(LATEST, Buffer.from(JSON.stringify(raw, null, 2)), {
    contentType: 'application/json',
    upsert: true,
    cacheControl: '60',
  });
  return error ? { error: 'failed' } : {};
}
