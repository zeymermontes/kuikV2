import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-5 py-10">
      <Link href="/" className="mb-8 text-2xl font-bold tracking-tight">
        Kuik
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
        {children}
      </div>
    </main>
  );
}
