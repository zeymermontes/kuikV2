import Link from 'next/link';
import { Lock } from 'lucide-react';

export function PosLocked({ title }: { title: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-neutral-50 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-900 text-white">
        <Lock className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-neutral-500">Disponible en el plan Pro.</p>
      </div>
      <Link href="/billing" className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white">
        Mejorar a Pro
      </Link>
    </div>
  );
}
