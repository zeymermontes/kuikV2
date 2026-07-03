'use client';

import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { Gift, X, Stamp, Check, Download, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { LoyaltyProgram } from '@/lib/database.types';

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface CardData {
  program: {
    type: 'stamps' | 'points';
    stamps_needed: number;
    reward_description: string | null;
    points_for_reward: number | null;
    points_reward_description: string | null;
  };
  customer: { code: string; name: string | null; stamps: number; points: number };
}

// What we persist on the device so the card shows instantly (and offline) on return visits.
type StoredLoyalty = { phone: string; card: CardData | null };

export function LoyaltyButton({
  tenantId,
  program,
  logoUrl,
}: {
  tenantId: string;
  program: LoyaltyProgram;
  logoUrl?: string | null;
}) {
  const t = useTranslations('loyaltyCard');
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [enrolledPhone, setEnrolledPhone] = useState('');
  const [data, setData] = useState<CardData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function fetchCard(p: string, withName?: string): Promise<CardData | null> {
    const res = await fetch(`/api/loyalty/${tenantId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: p, name: withName || undefined }),
    });
    if (!res.ok) throw new Error();
    return res.json();
  }

  const storageKey = `kuik:loyalty:${tenantId}`;

  function readStored(): StoredLoyalty | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      return null;
    }
    if (!raw) return null;
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw) as Partial<StoredLoyalty>;
        if (parsed && typeof parsed.phone === 'string') {
          return { phone: parsed.phone, card: parsed.card ?? null };
        }
      } catch {
        // fall through to legacy handling
      }
    }
    // Legacy format: the stored value was just the phone string (no cached card).
    return { phone: raw, card: null };
  }

  function writeStored(p: string, card: CardData | null) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ phone: p, card }));
    } catch {
      // storage may be unavailable (private mode); not critical
    }
  }

  async function enroll() {
    setBusy(true);
    setError(false);
    try {
      const card = await fetchCard(phone, name);
      setData(card);
      setEnrolledPhone(phone);
      writeStored(phone, card);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function forget() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setData(null);
    setEnrolledPhone('');
    setPhone('');
    setName('');
  }

  // Remember the card across visits: auto-load if this browser already enrolled.
  useEffect(() => {
    const id = setTimeout(async () => {
      const saved = readStored();
      if (!saved) return;
      setEnrolledPhone(saved.phone);
      // Show the cached card immediately — no network, no flash of the join form.
      if (saved.card) setData(saved.card);
      // Then revalidate in the background and refresh the cache.
      try {
        const c = await fetchCard(saved.phone);
        if (c) {
          setData(c);
          writeStored(saved.phone, c);
        }
      } catch {
        // Offline or transient error: keep showing the cached card.
      }
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // While the card is open, poll so stamps/points update live when staff credits.
  useEffect(() => {
    if (!open || !enrolledPhone || !data) return;
    const id = setInterval(async () => {
      try {
        const card = await fetchCard(enrolledPhone);
        if (card) {
          setData(card);
          writeStored(enrolledPhone, card);
        }
      } catch {
        // ignore transient poll errors
      }
    }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, enrolledPhone, data !== null]);

  function close() {
    setOpen(false);
    // keep data so reopening is instant
  }

  const reward =
    program.type === 'stamps' ? program.reward_description : program.points_reward_description;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
        style={{ backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text)' }}
      >
        <Gift className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
        {data ? t('myCard') : t('button')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <div className="relative max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-white p-5 text-neutral-900 sm:rounded-3xl">
            <button onClick={close} aria-label="close" className="absolute right-3 top-3 p-1 text-neutral-400">
              <X className="h-5 w-5" />
            </button>

            {!data ? (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Gift className="h-6 w-6" style={{ color: 'var(--brand-primary)' }} />
                  <h2 className="text-lg font-bold">{t('title')}</h2>
                </div>
                {reward && <p className="mb-3 text-sm text-neutral-500">{t('earn', { reward })}</p>}
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder={t('phone')}
                  className="mb-2 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-neutral-400 focus:outline-none"
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('name')}
                  className="mb-3 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-neutral-400 focus:outline-none"
                />
                {error && <p className="mb-2 text-sm text-red-500">{t('error')}</p>}
                <button
                  onClick={enroll}
                  disabled={busy || phone.replace(/\D/g, '').length < 8}
                  className="w-full rounded-full py-3 font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  {busy ? '…' : t('join')}
                </button>
              </div>
            ) : (
              <>
                <CardView data={data} logoUrl={logoUrl} />
                <button
                  onClick={forget}
                  className="mt-4 w-full text-center text-xs text-neutral-400 hover:text-neutral-600"
                >
                  {t('notYou')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function CardView({ data, logoUrl }: { data: CardData; logoUrl?: string | null }) {
  const t = useTranslations('loyaltyCard');
  const { program, customer } = data;
  const qrRef = useRef<HTMLDivElement>(null);
  const [canShareFile, setCanShareFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const heading = customer.name || t('title');

  // Detect native file-share support (iPhone/Android save-to-Photos) on the client only.
  useEffect(() => {
    try {
      const probe = new File([''], 'x.png', { type: 'image/png' });
      // Client-only capability check; the effect avoids an SSR hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanShareFile(!!navigator.canShare?.({ files: [probe] }));
    } catch {
      setCanShareFile(false);
    }
  }, []);

  // Load the business logo for canvas use; crossOrigin so it doesn't taint the export.
  function loadLogo(): Promise<HTMLImageElement | null> {
    if (!logoUrl) return Promise.resolve(null);
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = logoUrl;
    });
  }

  // Compose a shareable card (heading + QR + logo + code) from the hidden high-res canvas.
  async function composeCard(): Promise<Blob | null> {
    const qr = qrRef.current?.querySelector('canvas');
    if (!qr) return null;

    const dpr = 2;
    const W = 600;
    const H = 760;
    const canvas = document.createElement('canvas');
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(dpr, dpr);

    const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    // Heading — shrink to fit a single line on narrow names/words.
    let size = 38;
    ctx.fillStyle = '#171717';
    do {
      ctx.font = `700 ${size}px ${FONT}`;
      size -= 1;
    } while (size > 18 && ctx.measureText(heading).width > W - 80);
    ctx.fillText(heading, W / 2, 80);

    ctx.fillStyle = '#737373';
    ctx.font = `400 19px ${FONT}`;
    ctx.fillText(t('showCode'), W / 2, 118);

    const qs = 380;
    const qx = (W - qs) / 2;
    const qy = 150;
    ctx.drawImage(qr, qx, qy, qs, qs);

    // Center the logo on the QR with a rounded white chip (the QR's level="H" keeps it scannable).
    const logo = await loadLogo();
    if (logo) {
      const chip = Math.round(qs * 0.26);
      const cx = qx + qs / 2;
      const cy = qy + qs / 2;
      const pad = 7;
      ctx.fillStyle = '#ffffff';
      roundedRect(ctx, cx - chip / 2 - pad, cy - chip / 2 - pad, chip + pad * 2, chip + pad * 2, 18);
      ctx.fill();
      ctx.save();
      roundedRect(ctx, cx - chip / 2, cy - chip / 2, chip, chip, 13);
      ctx.clip();
      // object-cover: crop the logo to a centered square before scaling into the chip.
      const side = Math.min(logo.width, logo.height);
      const sx = (logo.width - side) / 2;
      const sy = (logo.height - side) / 2;
      ctx.drawImage(logo, sx, sy, side, side, cx - chip / 2, cy - chip / 2, chip, chip);
      ctx.restore();
    }

    ctx.fillStyle = '#171717';
    ctx.font = `700 40px ui-monospace, Menlo, Consolas, monospace`;
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = '6px';
    ctx.fillText(customer.code, W / 2, qy + qs + 70);

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  }

  async function saveCard() {
    if (saving) return;
    setSaving(true);
    try {
      const blob = await composeCard();
      if (!blob) return;
      const file = new File([blob], `${customer.code}.png`, { type: 'image/png' });

      if (canShareFile && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: heading });
          return;
        } catch (e) {
          // User dismissed the share sheet — don't fall through to a download.
          if (e instanceof Error && e.name === 'AbortError') return;
          // Any other share failure: fall back to a direct download.
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="text-center">
      <h2 className="mb-1 text-lg font-bold">{heading}</h2>
      <p className="mb-4 text-xs text-neutral-500">{t('showCode')}</p>

      <div className="mx-auto mb-3 w-fit rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
        <div className="relative">
          <QRCodeSVG value={customer.code} size={150} level="H" />
          {logoUrl && (
            <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" className="h-full w-full rounded-md object-cover" />
            </span>
          )}
        </div>
      </div>
      {/* Hidden high-res canvas used only as the source for the saved/shared image. */}
      <div ref={qrRef} aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0">
        <QRCodeCanvas value={customer.code} size={400} marginSize={2} level="H" />
      </div>
      <p className="mb-3 font-mono text-lg font-bold tracking-widest">{customer.code}</p>

      <button
        onClick={saveCard}
        disabled={saving}
        className="mx-auto mb-5 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
        style={{ backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text)' }}
      >
        {canShareFile ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        {t('save')}
      </button>

      {program.type === 'stamps' ? (
        <>
          <div className="mb-3 flex flex-wrap justify-center gap-2">
            {Array.from({ length: program.stamps_needed }).map((_, i) => (
              <span
                key={i}
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{
                  backgroundColor:
                    i < customer.stamps ? 'var(--brand-primary)' : 'rgba(0,0,0,0.06)',
                  color: i < customer.stamps ? '#fff' : 'rgba(0,0,0,0.3)',
                }}
              >
                {i < customer.stamps ? <Check className="h-4 w-4" /> : <Stamp className="h-4 w-4" />}
              </span>
            ))}
          </div>
          <p className="text-sm text-neutral-600">
            {t('stampsProgress', { have: customer.stamps, need: program.stamps_needed })}
          </p>
          {program.reward_description && (
            <p className="mt-1 text-sm font-semibold">🎁 {program.reward_description}</p>
          )}
        </>
      ) : (
        <>
          <div className="text-4xl font-extrabold" style={{ color: 'var(--brand-primary)' }}>
            {Number(customer.points)}
          </div>
          <p className="text-sm text-neutral-500">{t('points')}</p>
          {program.points_for_reward && program.points_reward_description && (
            <p className="mt-2 text-sm">
              {t('pointsReward', {
                points: program.points_for_reward,
                reward: program.points_reward_description,
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
