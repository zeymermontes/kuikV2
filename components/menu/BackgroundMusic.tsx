'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Volume2, VolumeX } from 'lucide-react';
import { perceptualVolume } from '@/lib/utils';

/**
 * Plays the tenant's background music. Browsers (esp. iOS Safari) block autoplay
 * with sound and only accept playback started from a real tap (`click`/`touchend`)
 * — not `pointerdown`. So we retry on every user gesture until one is accepted,
 * unless the visitor has muted it. Unmuted by default.
 */
export function BackgroundMusic({ url, volume }: { url: string; volume: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const wantOn = useRef(true); // visitor intent: play unless they mute
  const [on, setOn] = useState(true);
  const vol = perceptualVolume(volume ?? 50);
  const pathname = usePathname();
  // The custom landing (/landing) is a self-contained site — no menu music there.
  const hidden = pathname?.endsWith('/landing') ?? false;

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = vol;

    const events = ['click', 'touchend', 'keydown'] as const;
    const cleanup = () => events.forEach((ev) => window.removeEventListener(ev, tryPlay));
    function tryPlay() {
      const el = audioRef.current;
      if (!el || !wantOn.current) return;
      el.volume = vol;
      el.play().then(cleanup).catch(() => {});
    }

    a.play().catch(() => {}); // immediate attempt (works if already interacted)
    events.forEach((ev) => window.addEventListener(ev, tryPlay));
    return cleanup;
  }, [vol]);

  // Pause when the tab is hidden / backgrounded; resume on return (unless muted).
  useEffect(() => {
    const onVisibility = () => {
      const a = audioRef.current;
      if (!a) return;
      if (document.hidden) a.pause();
      else if (wantOn.current) a.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (on) {
      wantOn.current = false;
      a.pause();
      setOn(false);
    } else {
      wantOn.current = true;
      a.volume = vol;
      a.play().then(() => setOn(true)).catch(() => {});
    }
  }

  if (hidden) return null;

  return (
    <>
      <audio ref={audioRef} src={url} loop preload="auto" />
      <button
        onClick={toggle}
        aria-label="music"
        className="fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full shadow-lg"
        style={{ backgroundColor: 'var(--brand-surface)', color: 'var(--brand-primary)' }}
      >
        {on ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </button>
    </>
  );
}
