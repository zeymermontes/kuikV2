'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, RefreshCw, X } from 'lucide-react';
import { capacitorPlatform, desktopBridge, shell, shellVersion } from '@/lib/native/shell';
import { updateKind, type UpdateKind } from '@/lib/apps/version';

const SNOOZE_KEY = 'kuik_shell_update_snoozed';
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const RECHECK_MS = 10 * 60 * 1000;

interface Feed {
  version?: string;
  minVersion?: string | null;
  android?: { url: string } | null;
  ios?: { url: string; version?: string } | null;
}

interface Update {
  kind: UpdateKind;
  version: string;
  /** Where this platform gets it: the APK itself on Android, the store on iOS, the download page otherwise. */
  url: string;
}

/**
 * Inside a native shell, compares the shell's version (from its user-agent
 * token) with the release feed (/api/apps/latest) on every launch and every
 * few minutes after.
 *
 * A newer build is a banner the person can put off for a day. A build older
 * than the feed's `minVersion` is a wall: the screen is covered until the
 * app is updated, because the server no longer promises to work with it.
 * The wall only goes up on a platform that can install the update today
 * (lib/apps/version.ts): an APK is live at once, a store build may lag.
 *
 * The Capacitor shells do not update themselves; the download opens in the
 * system browser. Kuik Caja does (electron-updater), so there the button
 * restarts into the build it already fetched.
 */
export function ShellUpdateBanner({ appsUrl }: { appsUrl: string }) {
  const t = useTranslations('shellUpdate');
  const [update, setUpdate] = useState<Update | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const check = useCallback(async () => {
    const s = shell();
    if (s === 'browser') return;
    const mine = shellVersion();
    if (!mine) return;
    try {
      const res = await fetch('/api/apps/latest', { cache: 'no-store' });
      if (!res.ok) return;
      const feed = (await res.json()) as Record<string, Feed | undefined>;
      const entry = feed[s === 'terminal' ? 'terminal' : s === 'mobile' ? 'kuik' : 'desktop'];
      if (!entry?.version) return;
      // What this device could install right now.
      let available: string | null = null;
      let url = appsUrl;
      if (s === 'desktop') {
        available = entry.version;
      } else if (capacitorPlatform() === 'ios') {
        available = entry.ios?.version ?? null;
        url = entry.ios?.url ?? appsUrl;
      } else if (entry.android) {
        available = entry.version;
        url = entry.android.url;
      }
      const kind = updateKind({ mine, available, minVersion: entry.minVersion ?? null });
      // A recommended update stays quiet for a day after "not now"; a required one never does.
      let snoozed = false;
      try {
        snoozed = Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
      } catch {}
      setUpdate(kind === 'none' || (kind === 'recommended' && snoozed) ? null : { kind, version: available!, url });
    } catch {
      // offline: whatever was decided last time stands
    }
  }, [appsUrl]);

  useEffect(() => {
    // Every check runs from a callback (first one on the next tick): the
    // feed is an external system and the state follows it, never the effect.
    const first = setTimeout(() => void check(), 0);
    const timer = setInterval(() => void check(), RECHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  if (!update) return null;

  function later() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {}
    setUpdate(null);
  }

  async function installDesktop() {
    const bridge = desktopBridge();
    if (!bridge?.installUpdate) {
      setWaiting(true);
      return;
    }
    setBusy(true);
    try {
      const done = await bridge.installUpdate();
      if (!done) setWaiting(true);
    } finally {
      setBusy(false);
    }
  }

  const desktop = shell() === 'desktop';

  if (update.kind === 'required') {
    return (
      <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#111114]/95 p-6 text-white backdrop-blur">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <Download className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-bold">{t('requiredTitle')}</h1>
          <p className="mt-2 text-sm text-neutral-300">{desktop ? t('requiredDesktopBody') : t('requiredBody')}</p>
          <p className="mt-3 text-xs text-neutral-500">{t('versions', { mine: shellVersion() ?? '?', latest: update.version })}</p>
          {desktop ? (
            <button
              type="button"
              onClick={() => void installDesktop()}
              disabled={busy}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-black disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> {t('restartInstall')}
            </button>
          ) : (
            <a
              href={update.url}
              target="_blank"
              rel="noopener"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-black"
            >
              <Download className="h-4 w-4" /> {t('download')}
            </a>
          )}
          {waiting && <p className="mt-4 text-sm text-neutral-300">{t('desktopDownloading')}</p>}
          {!desktop && <p className="mt-4 text-xs text-neutral-500">{t('installHint')}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-white/10 bg-black/85 px-4 py-3 text-sm text-white shadow-lg backdrop-blur">
      <Download className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {t('available', { version: update.version })}{' '}
        {desktop ? (
          <button type="button" onClick={() => void installDesktop()} className="font-semibold underline">
            {waiting ? t('desktopDownloadingShort') : t('restartInstall')}
          </button>
        ) : (
          <a href={update.url} target="_blank" rel="noopener" className="font-semibold underline">
            {t('download')}
          </a>
        )}
      </span>
      <button onClick={later} aria-label={t('later')} className="rounded-full p-1 text-white/60 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
