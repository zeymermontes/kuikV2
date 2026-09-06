import type { Printer, PrinterRole } from '@/lib/database.types';

// Which printers take a role. Pure, so the server (a webhook printing a paid
// order) and the POS (lib/pos/printing.ts) route jobs by the same rule.

/**
 * For the kitchen, a printer naming the station wins over the catch-alls;
 * the catch-alls (empty `stations`) only serve stations nobody claimed.
 */
export function printersFor(printers: Printer[], role: PrinterRole, station?: string | null): Printer[] {
  const enabled = printers.filter((p) => p.enabled && p.roles.includes(role));
  if (role !== 'kitchen') return enabled;
  const st = (station ?? '').trim().toLowerCase();
  const specific = enabled.filter((p) => p.stations.some((s) => s.trim().toLowerCase() === st));
  if (specific.length > 0) return specific;
  return enabled.filter((p) => p.stations.length === 0);
}
