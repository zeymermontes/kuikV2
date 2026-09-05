'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * A colour swatch that opens our own picker: a hue/saturation wheel, a
 * brightness slider, an optional opacity slider and a hex field. Identical on
 * a phone and a desktop, unlike the OS dialog behind <input type="color">.
 *
 * `value` is a hex string (#rrggbb or, with `alpha`, #rrggbbaa); null means
 * "inherit" and the dot shows `fallback` dashed. Changes are reported live.
 */
export function ColorWheel({
  value,
  fallback = '#000000',
  onChange,
  onClear,
  alpha = false,
  label,
  size = 'md',
}: {
  value: string | null | undefined;
  fallback?: string;
  onChange: (hex: string) => void;
  /** Offered as a "use the general colour" button when given. */
  onClear?: () => void;
  alpha?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('colorPicker');
  const [open, setOpen] = useState(false);
  const shown = value || fallback;

  return (
    <>
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={() => setOpen(true)}
        data-inherit={!value}
        className={`color-dot shrink-0 ${size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'}`}
        style={{ background: `linear-gradient(${shown}, ${shown}), repeating-conic-gradient(#e5e5e5 0 25%, #fff 0 50%) 50% / 8px 8px` }}
      />
      {open && (
        <Picker
          value={value || fallback}
          alpha={alpha}
          label={label}
          onChange={onChange}
          onClear={
            onClear
              ? () => {
                  onClear();
                  setOpen(false);
                }
              : undefined
          }
          onClose={() => setOpen(false)}
          t={t}
        />
      )}
    </>
  );
}

// ── colour maths ─────────────────────────────────────────────────────────────

type Hsv = { h: number; s: number; v: number; a: number };

function hexToHsv(hex: string): Hsv {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  const a = m && m[2] ? parseInt(m[2], 16) / 255 : 1;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max, a };
}

function hsvToHex({ h, s, v, a }: Hsv, withAlpha: boolean): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  const base = `#${to(r)}${to(g)}${to(b)}`;
  return withAlpha && a < 1 ? `${base}${Math.round(a * 255).toString(16).padStart(2, '0')}` : base;
}

// ── the popover ─────────────────────────────────────────────────────────────

const WHEEL = 224;

function Picker({
  value,
  alpha,
  label,
  onChange,
  onClear,
  onClose,
  t,
}: {
  value: string;
  alpha: boolean;
  label?: string;
  onChange: (hex: string) => void;
  onClear?: () => void;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value);
  const wheel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function commit(next: Hsv) {
    setHsv(next);
    const hex = hsvToHex(next, alpha);
    setHexText(hex);
    onChange(hex);
  }

  // Hue is the angle around the wheel, saturation the distance from its centre.
  function pick(e: React.PointerEvent) {
    const el = wheel.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const h = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    const s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    commit({ ...hsv, h: (h + 360) % 360, s });
  }

  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1, a: 1 }, false);
  const solid = hsvToHex({ ...hsv, a: 1 }, false);
  const angle = ((hsv.h - 90) * Math.PI) / 180;
  const px = WHEEL / 2 + Math.cos(angle) * hsv.s * (WHEEL / 2);
  const py = WHEEL / 2 + Math.sin(angle) * hsv.s * (WHEEL / 2);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-label={label}
        className="relative w-full max-w-xs rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {label && <p className="mb-3 text-sm font-medium">{label}</p>}
        <div
          ref={wheel}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pick(e);
          }}
          onPointerMove={(e) => e.buttons === 1 && pick(e)}
          className="relative mx-auto touch-none rounded-full"
          style={{
            width: WHEEL,
            height: WHEEL,
            background:
              'radial-gradient(circle, #fff 0%, rgba(255,255,255,0) 72%), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          }}
        >
          {/* Brightness darkens the whole wheel so what you see is what you get. */}
          <div className="pointer-events-none absolute inset-0 rounded-full bg-black" style={{ opacity: 1 - hsv.v }} />
          <div
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: px, top: py, backgroundColor: solid }}
          />
        </div>

        <label className="mt-4 block">
          <span className="text-[11px] font-medium text-neutral-500">{t('brightness')}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(hsv.v * 100)}
            onChange={(e) => commit({ ...hsv, v: Number(e.target.value) / 100 })}
            className="color-slider"
            style={{ background: `linear-gradient(to right, #000, ${hueColor})` }}
          />
        </label>
        {alpha && (
          <label className="mt-3 block">
            <span className="text-[11px] font-medium text-neutral-500">{t('opacity')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(hsv.a * 100)}
              onChange={(e) => commit({ ...hsv, a: Number(e.target.value) / 100 })}
              className="color-slider"
              style={{ background: `linear-gradient(to right, transparent, ${solid}), repeating-conic-gradient(#e5e5e5 0 25%, #fff 0 50%) 50% / 10px 10px` }}
            />
          </label>
        )}

        <div className="mt-4 flex items-center gap-2">
          <span
            className="h-9 w-9 shrink-0 rounded-full border border-neutral-200"
            style={{ background: `linear-gradient(${hsvToHex(hsv, true)}, ${hsvToHex(hsv, true)}), repeating-conic-gradient(#e5e5e5 0 25%, #fff 0 50%) 50% / 8px 8px` }}
          />
          <input
            value={hexText}
            spellCheck={false}
            onChange={(e) => {
              setHexText(e.target.value);
              if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(e.target.value)) commit(hexToHsv(e.target.value));
            }}
            className="w-full min-w-0 rounded-lg border border-neutral-300 px-2 py-1.5 font-mono text-xs uppercase outline-none focus:border-neutral-900"
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          {onClear ? (
            <button type="button" onClick={onClear} className="text-xs text-neutral-500 underline hover:text-neutral-800">
              {t('inherit')}
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose} className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white">
            {t('done')}
          </button>
        </div>
      </div>
    </div>
  );
}
