'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Scissors, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { applySensitivity } from '@/lib/media/cutout';
import { segmentForeground, type SegmentProgress } from '@/lib/media/segment';
import { uploadBlob } from '@/lib/upload';

/**
 * After a product photo is uploaded: the same photo with its background
 * removed, next to the original, with a slider for how hard the edge is.
 * The cut is made on the device (lib/media/segment.ts); the first time a
 * browser does it the model is downloaded, with a progress bar. "Use it"
 * uploads the cut as a WebP with alpha and hands back its URL; "keep the
 * original" hands back nothing.
 */
export function CutoutSheet({
  file,
  src,
  tenantId,
  folder,
  onDone,
}: {
  /** The photo as picked, before compression: the model sees the best copy. */
  file: File;
  /** The uploaded original's public URL, for the "hold to compare" view. */
  src: string;
  tenantId: string;
  folder: string;
  /** The cut's URL, or null to keep the original. */
  onDone: (url: string | null) => void;
}) {
  const t = useTranslations('cutout');
  const [status, setStatus] = useState<'working' | 'ready' | 'failed'>('working');
  const [progress, setProgress] = useState<SegmentProgress | null>(null);
  const [sensitivity, setSensitivity] = useState(0.35);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  // The model's output, untouched; every redraw starts from it.
  const base = useRef<ImageData | null>(null);

  const redraw = useCallback((s: number) => {
    const c = canvas.current;
    const b = base.current;
    if (!c || !b) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const copy = new ImageData(new Uint8ClampedArray(b.data), b.width, b.height);
    applySensitivity(copy.data, s);
    ctx.putImageData(copy, 0, 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bitmap = await createImageBitmap(file);
        const cut = await segmentForeground(bitmap, (p) => {
          if (!cancelled) setProgress(p);
        });
        bitmap.close();
        if (cancelled) return;
        const c = canvas.current!;
        c.width = cut.width;
        c.height = cut.height;
        base.current = cut;
        setStatus('ready');
        redraw(0.35);
      } catch (e) {
        console.error('[cutout]', e instanceof Error ? e.message : e);
        if (!cancelled) setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, redraw]);

  function onSlide(v: number) {
    setSensitivity(v);
    requestAnimationFrame(() => redraw(v));
  }

  async function saveCutout() {
    const c = canvas.current;
    if (!c) return;
    setBusy(true);
    try {
      redraw(sensitivity);
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/webp', 0.85));
      if (!blob) throw new Error('encode');
      onDone(await uploadBlob(blob, tenantId, folder, 'webp'));
    } catch {
      setBusy(false);
    }
  }

  const progressText = (() => {
    if (!progress) return t('working');
    if (progress.phase === 'download') {
      const pct = progress.total ? Math.round((progress.loaded / progress.total) * 100) : null;
      return pct === null ? t('downloading') : t('downloadingPct', { pct });
    }
    return progress.phase === 'load' ? t('loading') : t('working');
  })();

  const checker =
    'bg-[linear-gradient(45deg,#e5e5e5_25%,transparent_25%),linear-gradient(-45deg,#e5e5e5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e5e5_75%),linear-gradient(-45deg,transparent_75%,#e5e5e5_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]';
  const showPhoto = showOriginal || status !== 'ready';

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => onDone(null)}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Scissors className="h-4 w-4" /> {t('title')}
          </h2>
          <button onClick={() => onDone(null)} aria-label={t('keep')} className="p-1 text-neutral-400 hover:text-neutral-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className={`relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl ${checker}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className={`absolute inset-0 h-full w-full object-contain ${showPhoto ? '' : 'invisible'}`} />
            <canvas ref={canvas} className={`absolute inset-0 h-full w-full object-contain ${showPhoto ? 'invisible' : ''}`} />
            {status === 'working' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 px-6 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
                <span className="text-xs text-neutral-600">{progressText}</span>
                {progress?.phase === 'download' && progress.total > 0 && (
                  <span className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-neutral-200">
                    <span className="block h-full bg-neutral-900" style={{ width: `${Math.round((progress.loaded / progress.total) * 100)}%` }} />
                  </span>
                )}
              </div>
            )}
          </div>

          {status === 'failed' ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('unavailable')}</p>
          ) : (
            <>
              <p className="mt-3 text-center text-xs text-neutral-500">{status === 'working' ? t('firstTime') : t('hint')}</p>
              <label className="mt-4 block">
                <span className="flex items-center justify-between text-sm font-medium">
                  {t('sensitivity')}
                  <span className="text-xs text-neutral-400">{Math.round(sensitivity * 100)}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(sensitivity * 100)}
                  disabled={status !== 'ready'}
                  onChange={(e) => onSlide(Number(e.target.value) / 100)}
                  className="mt-1 w-full accent-neutral-900"
                />
                <span className="flex justify-between text-[11px] text-neutral-400">
                  <span>{t('soft')}</span>
                  <span>{t('hard')}</span>
                </span>
              </label>
              <button
                type="button"
                disabled={status !== 'ready'}
                onPointerDown={() => setShowOriginal(true)}
                onPointerUp={() => setShowOriginal(false)}
                onPointerLeave={() => setShowOriginal(false)}
                className="mt-2 text-xs font-medium text-neutral-500 underline-offset-2 hover:underline disabled:opacity-40"
              >
                {t('holdOriginal')}
              </button>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-neutral-100 p-4 sm:flex-row-reverse">
          <button
            type="button"
            disabled={status !== 'ready' || busy}
            onClick={() => void saveCutout()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t('use')}
          </button>
          <button type="button" onClick={() => onDone(null)} className="flex-1 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700">
            {t('keep')}
          </button>
        </div>
      </div>
    </div>
  );
}
