'use client';

import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Unlink, CheckCircle2, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, Button } from '@/components/ui';

/**
 * Pair a number by scanning a QR, the same way WhatsApp Web is linked.
 *
 * The codes expire in about twenty seconds and the bridge emits a fresh one
 * each time, so this polls while pairing rather than showing one dead square.
 */

interface ConnectedNumber {
  phone_number_id: string;
  display_phone_number: string;
  verified_name: string | null;
  status: string;
  mode: string;
}

type State = 'idle' | 'starting' | 'pairing' | 'connected' | 'expired' | 'error';

/**
 * How long the whole attempt lasts, matching `pairingWindow` in the bridge.
 * Both ends enforce it: the browser so the UI stops asking, the bridge so an
 * abandoned tab cannot hold a WhatsApp socket open.
 */
const PAIRING_SECONDS = 120;

export function WhatsappPair({ numbers }: { numbers: ConnectedNumber[] }) {
  const t = useTranslations('whatsapp');
  const existing = numbers.find((n) => n.mode === 'bridge');

  const [state, setState] = useState<State>(existing?.status === 'connected' ? 'connected' : 'idle');
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(PAIRING_SECONDS);

  const poll = useCallback(async () => {
    const res = await fetch('/api/whatsapp/pair');
    const json = await res.json();
    if (!json.ok) {
      setError(json.error ?? 'bridge_error');
      setState('error');
      return true; // stop
    }
    if (json.status === 'connected') {
      setState('connected');
      setQr(null);
      // A reload picks up the seeded goals and messages the server just wrote.
      setTimeout(() => window.location.reload(), 800);
      return true;
    }
    if (json.error === 'qr_expired' || json.status === 'disconnected') {
      setState('expired');
      setQr(null);
      return true;
    }
    if (json.status === 'error') {
      setError(json.error ?? 'bridge_error');
      setState('error');
      return true;
    }
    if (json.qr) setQr(json.qr);
    // The bridge is the authority on how much time is left; a browser that was
    // backgrounded or asleep would otherwise drift.
    if (typeof json.expiresInSeconds === 'number') {
      setSecondsLeft(Math.max(0, json.expiresInSeconds));
    }
    return false;
  }, []);

  /**
   * Poll while a code is on screen — but only while someone is actually
   * looking, and never past the deadline.
   *
   * Both guards matter. Without the deadline a forgotten tab polls every two
   * seconds forever and keeps a WhatsApp connection alive; without the
   * visibility check it keeps doing that from a background tab where the QR
   * cannot be scanned anyway.
   */
  useEffect(() => {
    if (state !== 'pairing') return;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (stopped) return;
      const done = await poll().catch(() => false);
      if (done && timer) clearInterval(timer);
    };

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(tick, 2000);
    };
    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void tick(); // catch up immediately on return
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', onVisibility);

    // Local countdown, corrected by the server on every poll.
    const clock = setInterval(() => {
      setSecondsLeft((n) => {
        if (n <= 1) {
          setState('expired');
          setQr(null);
          return 0;
        }
        return n - 1;
      });
    }, 1000);

    return () => {
      stopped = true;
      stopPolling();
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [state, poll]);

  // Leaving the page mid-pairing should release the socket rather than leave
  // the bridge holding an attempt nobody will finish.
  useEffect(() => {
    if (state !== 'pairing') return;
    const release = () => {
      navigator.sendBeacon?.('/api/whatsapp/pair/abandon');
    };
    window.addEventListener('pagehide', release);
    return () => window.removeEventListener('pagehide', release);
  }, [state]);

  async function start() {
    setBusy(true);
    setError(null);
    setQr(null);
    setSecondsLeft(PAIRING_SECONDS);
    setState('starting');
    try {
      const res = await fetch('/api/whatsapp/pair', { method: 'POST' });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? 'bridge_error');
        setState('error');
        return;
      }
      setQr(json.qr ?? null);
      setState(json.status === 'connected' ? 'connected' : 'pairing');
    } catch {
      setError('bridge_error');
      setState('error');
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      await fetch('/api/whatsapp/pair', { method: 'DELETE' });
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{t('pairTitle')}</h2>
        <p className="text-sm text-neutral-500">{t('pairHint')}</p>
      </div>

      {state === 'connected' && existing ? (
        <div className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{existing.display_phone_number}</p>
            <p className="text-xs text-neutral-500">
              {existing.verified_name ?? '—'} · {t('status_connected')}
            </p>
          </div>
          <Button variant="secondary" onClick={unlink} disabled={busy}>
            <Unlink className="h-4 w-4" />
          </Button>
        </div>
      ) : state === 'pairing' ? (
        <div className="flex flex-col items-center gap-3">
          <div className="relative rounded-2xl bg-white p-4 shadow-sm">
            {qr ? (
              <QRCodeSVG value={qr} size={232} level="M" />
            ) : (
              <div className="flex h-[232px] w-[232px] items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-neutral-300" />
              </div>
            )}
          </div>

          {/* The code rotates on its own every ~20s; what this counts down is
              the whole attempt, after which the bridge releases the socket. */}
          <div className="flex w-full items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-200">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  secondsLeft < 30 ? 'bg-amber-500' : 'bg-neutral-900'
                }`}
                style={{ width: `${(secondsLeft / PAIRING_SECONDS) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-neutral-500">
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
            </span>
          </div>

          <ol className="w-full space-y-1 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">
            <li>1. {t('pair_step1')}</li>
            <li>2. {t('pair_step2')}</li>
            <li>3. {t('pair_step3')}</li>
          </ol>

          <div className="flex w-full items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs text-neutral-500">
              <RefreshCw className="h-3 w-3 animate-spin" /> {t('pair_waiting')}
            </p>
            <button onClick={start} disabled={busy} className="text-xs font-medium text-neutral-600 underline">
              {t('pair_regenerate')}
            </button>
          </div>
        </div>
      ) : state === 'expired' ? (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-neutral-50 p-6 text-center">
          <Clock className="h-8 w-8 text-neutral-400" />
          <div>
            <p className="font-medium">{t('pair_expiredTitle')}</p>
            <p className="mt-0.5 text-sm text-neutral-500">{t('pair_expiredBody')}</p>
          </div>
          <Button onClick={start} disabled={busy}>
            <RefreshCw className="h-4 w-4" /> {busy ? t('connecting') : t('pair_regenerate')}
          </Button>
        </div>
      ) : (
        <>
          {/* The honest version, before they scan rather than after something
              goes wrong. */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" /> {t('pair_warnTitle')}
            </p>
            <p className="mt-1 text-xs">{t('pair_warnBody')}</p>
          </div>
          <ul className="space-y-1 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">
            <li>· {t('pair_note_device')}</li>
            <li>· {t('pair_note_phone_on')}</li>
            <li>· {t('pair_note_no_buttons')}</li>
          </ul>
          <Button onClick={start} disabled={busy}>
            <Smartphone className="h-4 w-4" /> {busy ? t('connecting') : t('pair_start')}
          </Button>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {t.has(`err_${error}`) ? t(`err_${error}`) : error}
        </p>
      )}
    </Card>
  );
}
