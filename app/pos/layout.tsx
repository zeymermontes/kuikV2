import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireTenant } from '@/lib/auth';
import { canUseDevFeatures } from '@/lib/features';

export const metadata: Metadata = {
  title: 'Kuik POS',
  manifest: '/pos.webmanifest',
};

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant(); // auth gate: redirects to /login or /onboarding if needed
  // POS is in development — hide from everyone but dev accounts.
  if (!canUseDevFeatures(ctx.user.email)) redirect('/menu');
  return <div className="min-h-dvh">{children}</div>;
}
