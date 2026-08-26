import type { WhatsappConversation } from './types';

/**
 * WhatsApp's 24-hour customer-service window.
 *
 * Inside it a business may reply freely, and those replies are free. Outside
 * it, only an approved template will send — anything else is rejected by Meta
 * with error 131047. So this is both the compliance gate and the cost model.
 *
 * Two rules that are easy to get wrong:
 *   1. ONLY a message from the customer opens or extends the window.
 *   2. An `smb_message_echoes` — the owner replying from their own phone —
 *      does NOT. A business talking does not give itself permission to talk.
 */

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowExpiryFrom(inboundAt: Date = new Date()): string {
  return new Date(inboundAt.getTime() + WINDOW_MS).toISOString();
}

export function isWindowOpen(
  conversation: Pick<WhatsappConversation, 'window_expires_at'>,
  now: Date = new Date(),
): boolean {
  if (!conversation.window_expires_at) return false;
  return new Date(conversation.window_expires_at).getTime() > now.getTime();
}

/** Milliseconds of free-reply time left; 0 when closed. */
export function windowRemainingMs(
  conversation: Pick<WhatsappConversation, 'window_expires_at'>,
  now: Date = new Date(),
): number {
  if (!conversation.window_expires_at) return 0;
  return Math.max(0, new Date(conversation.window_expires_at).getTime() - now.getTime());
}

/** Thrown when free-form text is attempted on a closed window. */
export class WindowClosedError extends Error {
  constructor() {
    super('window_closed');
    this.name = 'WindowClosedError';
  }
}
