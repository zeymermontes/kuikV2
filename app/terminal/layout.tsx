import type { Metadata } from 'next';
import { requireTenant } from '@/lib/auth';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { ShellUpdateBanner } from '@/components/ShellUpdateBanner';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Kuik Terminal',
};

/**
 * Where the Terminal app (native/terminal) starts: one login per device, then
 * a choice of what this screen is — register, kitchen, host stand or the
 * customer display. In a browser it is just a launcher for the same pages.
 */
export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  await requireTenant(); // auth gate: redirects to /login or /onboarding if needed
  return (
    <StaffIntlProvider>
      <div className="min-h-dvh bg-[#111114] text-white">{children}</div>
      <ShellUpdateBanner appsUrl={`${SITE_URL}/apps`} />
    </StaffIntlProvider>
  );
}
