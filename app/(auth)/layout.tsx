import Link from 'next/link';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { KuikPixel } from '@/components/KuikPixel';
import { ShellInsets } from '@/components/ShellInsets';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffIntlProvider>
      <KuikPixel />
      {/* The apps open here when signed out; see lib/native/insets.ts. */}
      <ShellInsets />
      <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-5 py-10">
        <Link href="/" className="mb-8 text-2xl font-bold tracking-tight">
          Kuik
        </Link>
        <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
          {children}
        </div>
      </main>
    </StaffIntlProvider>
  );
}
