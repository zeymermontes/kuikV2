'use client';

import { digitsOnly } from '@/lib/utils';

/**
 * The floating WhatsApp button restaurants put in the bottom corner of their
 * menu. Sits above the cart bar when there is one, and clears the iOS home
 * indicator.
 */
export function WhatsAppBubble({
  phone,
  message,
  label,
  raised,
}: {
  phone: string;
  /** Prefilled text, so the restaurant knows where the chat came from. */
  message?: string | null;
  label: string;
  /** True while the cart bar is on screen, so the bubble moves up out of it. */
  raised: boolean;
}) {
  const href = `https://wa.me/${digitsOnly(phone)}${
    message ? `?text=${encodeURIComponent(message)}` : ''
  }`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition hover:brightness-105"
      style={{
        backgroundColor: '#25d366',
        bottom: raised
          ? 'calc(env(safe-area-inset-bottom) + 6.25rem)'
          : 'calc(env(safe-area-inset-bottom) + 1.25rem)',
      }}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7" aria-hidden>
        <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.4.25-.7.25-1.28.17-1.4-.07-.13-.27-.2-.57-.35z" />
        <path d="M12.04 2C6.6 2 2.17 6.43 2.16 11.88c0 1.74.46 3.44 1.32 4.94L2 22l5.32-1.4a9.9 9.9 0 0 0 4.72 1.2h.01c5.44 0 9.87-4.43 9.88-9.88A9.82 9.82 0 0 0 19.03 5a9.8 9.8 0 0 0-6.99-3zm0 18.1h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.1.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.36c0-4.53 3.69-8.21 8.22-8.21a8.16 8.16 0 0 1 8.2 8.22c0 4.53-3.68 8.21-8.2 8.21z" />
      </svg>
    </a>
  );
}
