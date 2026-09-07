// Pure, so the in-app update gate (a client component) and the tests can use it too.

/** Dotted versions: negative when a < b, like Array.prototype.sort wants. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** "1.2.3" or "1.2": digits and dots only. */
export function isVersion(s: string): boolean {
  return /^\d+(\.\d+){0,3}$/.test(s.trim());
}

/**
 * What a shell should do about an update.
 *
 * - `none`: it runs the newest build this platform can install, or there is
 *   nothing for this platform yet.
 * - `recommended`: a newer build exists; a banner it can put off.
 * - `required`: it is older than the minimum the release feed demands, and
 *   the update is actually installable here. The screen is blocked until
 *   it updates.
 *
 * The second condition is the point: a mandatory release is only enforced
 * on a platform that can get it today. An APK is live the moment it is
 * uploaded; a store build may take days, so iPhones keep working (with the
 * banner) until the App Store has the version, and the same holds for a
 * desktop build whose feed has not been published yet.
 */
export type UpdateKind = 'none' | 'recommended' | 'required';

export function updateKind(o: {
  /** The shell's own version, from its user-agent token. */
  mine: string;
  /** The newest version this platform can install right now, or null when it has no download. */
  available: string | null;
  /** The oldest version still allowed, or null when every version is. */
  minVersion: string | null;
}): UpdateKind {
  if (!o.available || compareVersions(o.mine, o.available) >= 0) return 'none';
  if (o.minVersion && compareVersions(o.mine, o.minVersion) < 0 && compareVersions(o.available, o.minVersion) >= 0) return 'required';
  return 'recommended';
}
