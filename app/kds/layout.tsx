import type { Metadata } from 'next';
import { requireTenant } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Kuik — Cocina (KDS)',
};

export default async function KdsLayout({ children }: { children: React.ReactNode }) {
  await requireTenant(); // auth gate
  return <div className="min-h-dvh">{children}</div>;
}
