'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

/**
 * Plays the tenant's background music. Browsers block autoplay with sound, so
 * playback starts on the visitor's first interaction; a floating button toggles
 * mute/unmute.
 */
export function BackgroundMusic({ url, volume }: { url: string; volume: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  // Unmuted by default: we intend to play; if the browser blocks autoplay it
  // starts on the first interaction (but the toggle still reads "on").
  const [on, setOn] = useState(true);
  const vol = Math.min(1, Math.max(0, (volume ?? 50) / 100));

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = vol;
    // Try immediately (works if the visitor already interacted earlier this
    // session, e.g. on the landing), then fall back to the first interaction.
    a.play().catch(() => {});
    const start = () => {
      a.play().catch(() => {});
    };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
  }, [vol]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (on) {
      a.pause();
      setOn(false);
    } else {
      a.volume = vol;
      a.play().then(() => setOn(true)).catch(() => {});
    }
  }

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
