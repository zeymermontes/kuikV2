import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireTenant } from '@/lib/auth';
import { showDevFeatures } from '@/lib/features';

export const metadata: Metadata = {
  title: 'Kuik — Cocina (KDS)',
};

export default async function KdsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant(); // auth gate
  // KDS is in development — super admin only.
  if (!showDevFeatures(ctx)) redirect('/menu');
  return <div className="min-h-dvh">{children}</div>;
}
