'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { shell, shellVersion } from '@/lib/native/shell';
import { compareVersions } from '@/lib/apps/version';

const SNOOZE_KEY = 'kuik_shell_update_snoozed';
const SNOOZE_MS = 24 * 60 * 60 * 1000;

/**
 * Inside a native shell, compares the shell's version (from its user-agent
 * token) with the latest published one and offers the download. The shells
 * do not update themselves; this is how a restaurant learns there is a new
 * build. Hidden in browsers, and for a day after "later".
 */
export function ShellUpdateBanner({ appsUrl }: { appsUrl: string }) {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    const s = shell();
    if (s !== 'terminal' && s !== 'mobile') return;
    const mine = shellVersion();
    if (!mine) return;
    try {
      const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
      if (until > Date.now()) return;
    } catch {}
    const id = s === 'terminal' ? 'terminal' : 'kuik';
    fetch('/api/apps/latest')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Record<string, { version?: string; android?: unknown }> | null) => {
        const v = j?.[id]?.version;
        if (v && j?.[id]?.android && compareVersions(mine, v) < 0) setLatest(v);
      })
      .catch(() => {});
  }, []);

  if (!latest) return null;

  function later() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {}
    setLatest(null);
  }

  return (
    <div className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-white/10 bg-black/85 px-4 py-3 text-sm text-white shadow-lg backdrop-blur">
      <Download className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        Hay una versión nueva de la app ({latest}).{' '}
        <a href={appsUrl} className="font-semibold underline">
          Descargar
        </a>
      </span>
      <button onClick={later} aria-label="Ahora no" className="rounded-full p-1 text-white/60 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
