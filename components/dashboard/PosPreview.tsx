'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, MonitorSmartphone, Maximize2 } from 'lucide-react';

// The POS preview: the real terminal and the real customer screen in two
// device frames, running in demo mode (`?demo=1`) against a throwaway local
// store. They talk over the same channel the live pair uses, so tapping a
// product on the left updates the screen on the right — the same thing the
// menu Design page does with the phone frame, for both halves of the register.

const FRAME_W = 1180;
const FRAME_H = 740;

export function PosPreview() {
  const t = useTranslations('ordering');
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
          <MonitorSmartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{t('posPreviewTitle')}</h2>
          <p className="text-sm text-neutral-500">{t('posPreviewHint')}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DeviceFrame title={t('posScreenCashier')} src="/pos?demo=1" openHref="/pos" openLabel={t('posOpen')} />
        <DeviceFrame title={t('posScreenCustomer')} src="/pos/customer?demo=1" openHref="/pos/customer" openLabel={t('posOpenCustomer')} />
      </div>
      <p className="mt-3 text-xs text-neutral-500">{t('posDualHint')}</p>
    </section>
  );
}

/** A landscape tablet frame that scales a fixed-size page to whatever width it gets. */
export function DeviceFrame({
  title,
  src,
  openHref,
  openLabel,
  tabLabel,
  fullLabel,
}: {
  title: string;
  src: string;
  openHref: string;
  openLabel: string;
  /** When set, offers "open in a new tab" for `src` itself (the demo, not the real screen). */
  tabLabel?: string;
  /** When set, offers a full-screen button for the frame. */
  fullLabel?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // In full screen the frame must fit both ways; in the page, width rules.
    const ro = new ResizeObserver(([entry]) => {
      const byWidth = entry.contentRect.width / FRAME_W;
      const byHeight = document.fullscreenElement ? entry.contentRect.height / FRAME_H : Infinity;
      setScale(Math.min(byWidth, byHeight));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === shell.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
          {fullLabel && (
            <button onClick={() => shell.current?.requestFullscreen?.().catch(() => {})} className="flex items-center gap-1 hover:text-neutral-900">
              <Maximize2 className="h-3 w-3" /> {fullLabel}
            </button>
          )}
          {tabLabel && (
            <a href={src} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-neutral-900">
              <ExternalLink className="h-3 w-3" /> {tabLabel}
            </a>
          )}
          <a href={openHref} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-neutral-900">
            <ExternalLink className="h-3 w-3" /> {openLabel}
          </a>
        </div>
      </div>
      <div
        ref={shell}
        className={full ? 'flex h-screen w-screen items-center justify-center bg-black p-3' : 'rounded-[1.4rem] border-[8px] border-neutral-900 bg-neutral-900 shadow-xl'}
      >
        <div
          ref={box}
          className={`relative overflow-hidden bg-white ${full ? 'h-full w-full rounded-xl' : 'w-full rounded-[0.9rem]'}`}
          style={full ? undefined : { height: FRAME_H * scale }}
        >
          <iframe
            src={src}
            title={title}
            className={`absolute top-0 origin-top-left border-0 ${full ? 'left-1/2' : 'left-0'}`}
            style={{ width: FRAME_W, height: FRAME_H, transform: full ? `translateX(-50%) scale(${scale})` : `scale(${scale})`, transformOrigin: full ? 'top center' : 'top left' }}
          />
        </div>
      </div>
    </div>
  );
}
