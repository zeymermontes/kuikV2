// Meta Pixel helpers shared by the client components that fire events.

/** A pixel id is a run of digits; anything else is refused before it reaches a <script>. */
export function validPixelId(id: string | null | undefined): id is string {
  return typeof id === 'string' && /^\d{5,20}$/.test(id);
}

export type PixelEvent = 'PageView' | 'ViewContent' | 'InitiateCheckout' | 'Purchase' | 'CompleteRegistration' | 'Lead';

/** Fire a standard event on whichever pixel the page loaded; a no-op where there is none. */
export function trackPixel(event: PixelEvent, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
  if (!fbq) return;
  try {
    fbq('track', event, params);
  } catch {
    // analytics never break the page
  }
}
