// Which flows the bot offers today. Pure, so a seasonal option's last day is
// tested and not discovered by a diner on the 25th.

/**
 * The flows still current on `today` (the restaurant's calendar date,
 * "YYYY-MM-DD"): the ones with no last day, and the ones whose last day has
 * not passed. The last day itself counts: "hasta el 24" means the 24th too.
 * The bot's menu, its keyword triggers and the goals handed to the model all
 * read this list; a run that already started keeps its own graph.
 */
export function currentFlows<T extends { active_until?: string | null }>(flows: T[], today: string): T[] {
  return flows.filter((f) => isCurrent(f.active_until, today));
}

export function isCurrent(activeUntil: string | null | undefined, today: string): boolean {
  if (!activeUntil) return true;
  // Both are "YYYY-MM-DD": plain string order is date order.
  return activeUntil.slice(0, 10) >= today;
}

/** A date typed into the settings, or null for "always": anything else is refused. */
export function cleanActiveUntil(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? s : null;
}
