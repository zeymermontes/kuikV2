import type { Metadata } from 'next';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { EmbedStyles } from '@/components/EmbedStyles';

export const metadata: Metadata = {
  title: 'Kuik — Demo en vivo',
  // Playgrounds for the landing page, not pages of their own.
  robots: { index: false, follow: false },
};

/**
 * Public, no-login demos of the operations screens (lib/demo-tenant.ts). The
 * landing embeds them in device frames; each also opens on its own so a
 * prospect can try it full-screen. Everything runs in memory.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffIntlProvider>
      <EmbedStyles />
      <div className="min-h-dvh">{children}</div>
    </StaffIntlProvider>
  );
}
