'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GraduationCap, X } from 'lucide-react';

// "Explain mode" for the demo screens in Tutorials. While it is on, a tap on
// anything marked `data-help="<key>"` does not act: it outlines the element
// and shows what it does, in the staff's language. A switch turns it off so
// the same demo can then be tried for real. Keys resolve to help.<key>_t/_b.

interface Target {
  key: string;
  rect: DOMRect;
}

export function ExplainLayer({ initialOn }: { initialOn: boolean }) {
  const t = useTranslations('help');
  const [on, setOn] = useState(initialOn);
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    if (!on) return;
    const onEvent = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-explain-ui]');
      if (el) return; // our own chip / popover
      const hit = (e.target as HTMLElement | null)?.closest?.('[data-help]') as HTMLElement | null;
      e.preventDefault();
      e.stopPropagation();
      if (e.type !== 'click') return;
      if (hit) setTarget({ key: hit.dataset.help!, rect: hit.getBoundingClientRect() });
      else setTarget(null);
    };
    // Capture phase, so React's handlers on the element never run.
    const types = ['pointerdown', 'mousedown', 'touchstart', 'click'];
    types.forEach((k) => document.addEventListener(k, onEvent, true));
    const onScroll = () => setTarget(null);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      types.forEach((k) => document.removeEventListener(k, onEvent, true));
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [on]);

  const title = target && t.has(`${target.key}_t`) ? t(`${target.key}_t`) : t('generic_t');
  const body = target && t.has(`${target.key}_b`) ? t(`${target.key}_b`) : t('generic_b');

  // Popover placement: below the element if there is room, else above; clamped to the viewport.
  let pop: React.CSSProperties = {};
  if (target) {
    const W = Math.min(320, window.innerWidth - 16);
    const below = target.rect.bottom + 12;
    const fitsBelow = below + 140 < window.innerHeight;
    const left = Math.max(8, Math.min(target.rect.left, window.innerWidth - W - 8));
    pop = fitsBelow ? { top: below, left, width: W } : { bottom: window.innerHeight - target.rect.top + 12, left, width: W };
  }

  return (
    <>
      <button
        data-explain-ui
        onClick={() => {
          setOn((v) => !v);
          setTarget(null);
        }}
        className={`fixed left-1/2 top-2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold shadow-lg ${
          on ? 'bg-amber-400 text-neutral-900' : 'bg-neutral-900/80 text-white ring-1 ring-white/20 backdrop-blur'
        }`}
      >
        <GraduationCap className="h-4 w-4" /> {on ? t('modeOn') : t('modeOff')}
      </button>

      {on && !target && (
        <p data-explain-ui className="pointer-events-none fixed inset-x-0 top-11 z-[90] text-center text-[11px] font-medium text-amber-300 drop-shadow">
          {t('hint')}
        </p>
      )}

      {on && target && (
        <>
          <div
            data-explain-ui
            className="pointer-events-none fixed z-[89] rounded-xl ring-4 ring-amber-400 ring-offset-2 ring-offset-transparent"
            style={{ left: target.rect.left, top: target.rect.top, width: target.rect.width, height: target.rect.height }}
          />
          <div data-explain-ui className="animate-fade fixed z-[91] rounded-2xl bg-white p-4 text-neutral-900 shadow-2xl" style={pop}>
            <div className="mb-1 flex items-start justify-between gap-3">
              <p className="font-bold">{title}</p>
              <button onClick={() => setTarget(null)} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-neutral-600">{body}</p>
          </div>
        </>
      )}
    </>
  );
}
