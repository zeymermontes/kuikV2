import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireTenant } from '@/lib/auth';
import { canUseDevFeatures } from '@/lib/features';

export const metadata: Metadata = {
  title: 'Kuik — Cocina (KDS)',
};

export default async function KdsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant(); // auth gate
  // KDS is in development — hide from everyone but dev accounts.
  if (!canUseDevFeatures(ctx.user.email)) redirect('/menu');
  return <div className="min-h-dvh">{children}</div>;
}
