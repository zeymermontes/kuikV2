import { buildWhatsappUrl } from '@/lib/whatsapp';
import type { CustomerNotifier, NotifyInput, NotifyResult } from './types';

/**
 * v1: Kuik writes the message, a human sends it.
 *
 * Kuik has no outbound channel yet — the product is entirely `wa.me` deep
 * links — and WhatsApp will not let anyone send unprompted without an approved
 * template. So this sends nothing; it manufactures a one-tap link the staff
 * member opens from the reservation board.
 *
 * The link must be opened from the SAME click that triggered the action, or the
 * browser blocks the popup. That is why `send` returns an href instead of
 * navigating.
 */
export const manualWhatsapp: CustomerNotifier = {
  channel: 'manual_wa',
  automatic: false,

  async send(input: NotifyInput): Promise<NotifyResult> {
    if (!input.reservation.phone) return { status: 'skipped' };
    return {
      status: 'queued',
      href: buildWhatsappUrl(input.reservation.phone, input.body),
    };
  },
};
