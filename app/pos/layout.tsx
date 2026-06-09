import type { Metadata } from 'next';
import { requireTenant } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Kuik POS',
  manifest: '/pos.webmanifest',
};

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  await requireTenant(); // auth gate: redirects to /login or /onboarding if needed
  return <div className="min-h-dvh">{children}</div>;
}
