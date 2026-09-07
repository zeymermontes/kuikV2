'use client';

import { useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import type { DesktopRelease } from '@/lib/apps/releases';

type Os = 'win' | 'mac' | 'linux';
const NAMES: Record<Os, string> = { win: 'Windows', mac: 'Mac', linux: 'Linux' };

const noop = () => () => {};
function detect(): Os | null {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'win';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'linux';
  return null;
}

/** One download button per OS, the visitor's own first. Nothing published yet reads "muy pronto". */
export function DesktopButtons({ release }: { release: DesktopRelease | null }) {
  const mine = useSyncExternalStore(noop, detect, () => null);
  const order: Os[] = mine ? [mine, ...(['win', 'mac', 'linux'] as Os[]).filter((o) => o !== mine)] : ['win', 'mac', 'linux'];
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {order.map((os) => {
        const link = release?.[os];
        if (!link) {
          return (
            <span key={os} className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-400">
              <Download className="h-4 w-4" /> {NAMES[os]} · muy pronto
            </span>
          );
        }
        const primary = os === (mine ?? 'win');
        return (
          <a
            key={os}
            href={link.url}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              primary ? 'bg-neutral-900 text-white hover:bg-neutral-700' : 'border border-neutral-300 text-neutral-800 hover:bg-neutral-100'
            }`}
          >
            <Download className="h-4 w-4" /> {NAMES[os]}
            <span className={`font-normal ${primary ? 'text-neutral-300' : 'text-neutral-500'}`}>
              · v{release!.version} · {(link.size / 1e6).toFixed(0)} MB
            </span>
          </a>
        );
      })}
    </div>
  );
}
