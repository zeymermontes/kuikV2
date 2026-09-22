/**
 * DNS records a restaurant must create so its own domain reaches the menu.
 *
 * A root domain (marandsea.com.mx) cannot carry a CNAME — the zone's SOA, NS
 * and MX already live there and every DNS panel refuses it — so it gets an A
 * record to Render's anycast address, plus a CNAME for www. A subdomain
 * (menu.turestaurante.com) is a single CNAME whose name is everything before
 * the registrable domain, not just the first label.
 */

/** Render's address for apex custom domains (render.com/docs/custom-domains). */
export const RENDER_APEX_IP = '216.24.57.1';

/** Second-level labels under which two-letter ccTLDs sell names (com.mx, co.uk…). */
const SECOND_LEVEL = new Set(['com', 'net', 'org', 'gob', 'gov', 'edu', 'co', 'ac', 'mil']);

function registrableLength(labels: string[]): number {
  const tld = labels[labels.length - 1] ?? '';
  const sld = labels[labels.length - 2] ?? '';
  return labels.length >= 3 && tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
}

export function isApexDomain(domain: string): boolean {
  const labels = domain.toLowerCase().split('.');
  return labels.length <= registrableLength(labels);
}

export interface DnsRecord {
  type: 'A' | 'CNAME';
  name: string;
  value: string;
}

export function dnsRecordsFor(domain: string, target: string): DnsRecord[] {
  const labels = domain.toLowerCase().split('.');
  if (isApexDomain(domain)) {
    return [
      { type: 'A', name: '@', value: RENDER_APEX_IP },
      { type: 'CNAME', name: 'www', value: target },
    ];
  }
  const name = labels.slice(0, labels.length - registrableLength(labels)).join('.');
  return [{ type: 'CNAME', name, value: target }];
}
