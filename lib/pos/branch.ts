// Which branch this device works at.
//
// A register, a kitchen screen or a host stand belongs to one branch. The
// page is opened with `?branch=<id or slug>` (the Terminal app's hub, or a
// bookmark); the choice is kept on the device so the next launch needs no
// parameter (components/pos/DeviceBranchSync.tsx), and every row the
// register writes (tabs, shifts, kitchen tickets) carries it. No branch means
// the main location, as before branches existed.
//
// Client-safe and Node-safe: reads localStorage only where there is one.

export interface DeviceBranch {
  id: string;
  name: string;
  slug: string;
}

const KEY = 'pos_branch';

export function readDeviceBranch(): DeviceBranch | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Partial<DeviceBranch>;
    return b && typeof b.id === 'string' && typeof b.slug === 'string' ? { id: b.id, name: b.name ?? '', slug: b.slug } : null;
  } catch {
    return null;
  }
}

export function saveDeviceBranch(branch: DeviceBranch | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (branch) localStorage.setItem(KEY, JSON.stringify(branch));
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: the parameter carries it for this launch
  }
}

/** The branch every new row from this device is stamped with; null = main location. */
export function deviceBranchId(): string | null {
  return readDeviceBranch()?.id ?? null;
}

/** Same branch, with null and undefined both meaning the main location. */
export function sameBranch(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

/**
 * The name a customer screen follows: the register's slug, prefixed with the
 * branch's so "caja 1" of one branch never mirrors "caja 1" of another.
 */
export function registerScope(registerSlug: string, branch: Pick<DeviceBranch, 'slug'> | null | undefined): string {
  return branch ? `${branch.slug}--${registerSlug}` : registerSlug;
}
