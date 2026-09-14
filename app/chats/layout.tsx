import type { Metadata } from 'next';
import { requireChats } from '@/lib/auth';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { ShellBackButton } from '@/components/pos/ShellBackButton';
import { ShellUpdateBanner } from '@/components/ShellUpdateBanner';
import { StaffAlerts } from '@/components/StaffAlerts';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Kuik — Chats',
  manifest: '/chats.webmanifest',
};

/**
 * The WhatsApp station: a full-screen app for whoever minds the chats — the
 * conversations the bot handed to a person first, then everything recent —
 * like /host is for the door and /kds for the kitchen.
 */
export default async function ChatsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireChats();
  return (
    <StaffIntlProvider>
      <div className="min-h-dvh">{children}</div>
      <ShellBackButton />
      <StaffAlerts tenantId={ctx.tenant.id} role={ctx.role} />
      <ShellUpdateBanner appsUrl={`${SITE_URL}/apps`} />
    </StaffIntlProvider>
  );
}
