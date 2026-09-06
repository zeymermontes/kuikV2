'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// A live page inside a phone or tablet bezel. The iframe renders at the
// device's real size and is scaled to whatever width the frame gets, so the
// embedded screen lays out exactly as it would on the device. It mounts only
// once it scrolls near the viewport (a landing with six live menus must not
// load six apps up front) and stays mounted after that, so a demo keeps its
// state when the visitor switches tabs and comes back.

type Kind = 'phone' | 'tablet';

const SIZE: Record<Kind, { w: number; h: number }> = {
  phone: { w: 390, h: 800 },
  tablet: { w: 1120, h: 760 },
};

export function DeviceFrame({
  src,
  kind,
  title,
  eager = false,
  className,
}: {
  src: string;
  kind: Kind;
  title: string;
  /** Load immediately (above the fold). */
  eager?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [near, setNear] = useState(eager);
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      // Hidden (display:none) reports 0; keep the last real width so a mounted
      // demo is not re-laid-out to nothing while its tab is inactive.
      if (e.contentRect.width > 0) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  const { w, h } = SIZE[kind];
  const scale = width > 0 ? width / w : 0;
  // Once the frame is near and has a size the iframe mounts, and stays mounted.
  if (near && scale > 0 && !mounted) setMounted(true);

  const phone = kind === 'phone';
  return (
    <div
      className={cn(
        'relative bg-neutral-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/20',
        phone ? 'rounded-[2.75rem] p-2.5' : 'rounded-[1.75rem] p-3',
        className,
      )}
    >
      {phone && <div className="absolute top-2.5 left-1/2 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-neutral-900" aria-hidden />}
      <div ref={ref} className={cn('relative overflow-hidden bg-neutral-100', phone ? 'rounded-[2.1rem]' : 'rounded-[1.1rem]')} style={{ height: h * scale || undefined, aspectRatio: scale ? undefined : `${w} / ${h}` }}>
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
          </div>
        )}
        {mounted && (
          <iframe
            src={src}
            title={title}
            onLoad={() => setLoaded(true)}
            className={cn('absolute top-0 left-0 border-0 bg-white transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0')}
            style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: '0 0' }}
          />
        )}
      </div>
    </div>
  );
}
