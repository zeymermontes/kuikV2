'use client';

import { useEffect } from 'react';
import { shell } from '@/lib/native/shell';

/**
 * The page-level error boundary. Next's default says only "This page
 * couldn't load"; inside the native shells, where there is no console to
 * read, this one also shows the error itself so a screenshot is a bug
 * report. Browsers keep the short version.
 */
export default function AppErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const inShell = shell() !== 'browser';
  useEffect(() => {
    console.error('[kuik] page error', error);
  }, [error]);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#111114] px-6 text-white">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-bold">Algo salió mal</h1>
        <p className="mt-2 text-sm text-neutral-400">Vuelve a intentar; si sigue igual, avísanos.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => reset()} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black">
            Reintentar
          </button>
          <button type="button" onClick={() => window.history.back()} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80">
            Volver
          </button>
        </div>
        {inShell && (
          <pre className="mt-6 max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white/5 p-3 text-[11px] leading-snug text-neutral-300">
            {error.name}: {error.message}
            {error.digest ? `\ndigest: ${error.digest}` : ''}
            {error.stack ? `\n\n${error.stack.split('\n').slice(0, 8).join('\n')}` : ''}
          </pre>
        )}
      </div>
    </div>
  );
}
